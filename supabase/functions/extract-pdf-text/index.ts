// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: "artigo" | "inciso" | "paragrafo" | "alinea";
  texto: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdf_storage_path, norma_id } = await req.json();

    if (!pdf_storage_path || !norma_id) {
      return new Response(
        JSON.stringify({ error: "pdf_storage_path and norma_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting PDF extraction for norma: ${norma_id}, path: ${pdf_storage_path}`);

    // Create Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("normas-pdf")
      .download(pdf_storage_path);

    if (downloadError) {
      console.error("Error downloading PDF:", downloadError);
      
      // Update status to error
      await supabase.from("normas").update({
        texto_extraido_status: "erro",
        texto_extraido_em: new Date().toISOString(),
      }).eq("id", norma_id);
      
      return new Response(
        JSON.stringify({ error: `Failed to download PDF: ${downloadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert PDF to base64 for AI processing (using Deno std library to avoid stack overflow)
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = base64Encode(new Uint8Array(arrayBuffer));

    console.log(`PDF downloaded, size: ${arrayBuffer.byteLength} bytes`);

    // Use Lovable AI to extract and structure text
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um extrator de texto jurídico especializado em normas brasileiras.
Extraia TODOS os dispositivos do documento: artigos, incisos, parágrafos e alíneas.
Para cada dispositivo, identifique o anchor (ex: art.1, art.1.I, art.1§1, art.1.a) e o texto completo.
É CRÍTICO extrair TODOS os artigos do documento, sem omitir nenhum.`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "norma.pdf",
                  file_data: `data:application/pdf;base64,${base64Pdf}`
                }
              },
              {
                type: "text",
                text: "Extraia TODOS os dispositivos desta norma jurídica usando a função extract_dispositivos. Não omita nenhum artigo."
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_dispositivos",
              description: "Extrai todos os dispositivos de uma norma jurídica brasileira",
              parameters: {
                type: "object",
                properties: {
                  dispositivos: {
                    type: "array",
                    description: "Lista de todos os dispositivos extraídos do documento",
                    items: {
                      type: "object",
                      properties: {
                        anchor: {
                          type: "string",
                          description: "Identificador do dispositivo (ex: art.1, art.1.I, art.1§1, art.1.a)"
                        },
                        nivel: {
                          type: "string",
                          enum: ["artigo", "inciso", "paragrafo", "alinea"],
                          description: "Tipo do dispositivo"
                        },
                        texto: {
                          type: "string",
                          description: "Texto completo do dispositivo"
                        }
                      },
                      required: ["anchor", "nivel", "texto"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["dispositivos"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_dispositivos" } },
        temperature: 0.1,
        max_tokens: 64000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    
    console.log("AI response received, extracting tool call...");

    // Parse the tool call response
    let estrutura: ExtractedArticle[];
    let parsedOk = false;
    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!toolCall || toolCall.function?.name !== "extract_dispositivos") {
        throw new Error("No valid tool call in response");
      }

      const args = JSON.parse(toolCall.function.arguments);
      const dispositivos = args.dispositivos;

      if (!Array.isArray(dispositivos) || dispositivos.length === 0) {
        throw new Error("No dispositivos in tool call response");
      }

      // Map to our format with document_id
      estrutura = dispositivos.map((item: any) => ({
        document_id: norma_id,
        anchor: item.anchor || "texto",
        nivel: item.nivel || "artigo",
        texto: item.texto || "",
      }));

      parsedOk = true;
      console.log(`Extracted ${estrutura.length} dispositivos via tool-calling`);
    } catch (parseError) {
      console.error("Failed to parse tool call response:", parseError);
      
      // Fallback: try to get content from message
      const content = aiResult.choices?.[0]?.message?.content || "";
      console.log("Fallback content preview:", content.slice(0, 200));
      
      estrutura = [{
        document_id: norma_id,
        anchor: "texto",
        nivel: "artigo",
        texto: content.substring(0, 50000),
      }];
    }

    console.log(`Structure parsed, items: ${estrutura.length}`);

    // Update norma with extracted text
    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(estrutura),
        texto_extraido_em: new Date().toISOString(),
        texto_extraido_origem: "lovable-ai-gemini",
        texto_extraido_status: parsedOk ? "extraido" : "erro",
      })
      .eq("id", norma_id);

    if (updateError) {
      console.error("Error updating norma:", updateError);
      return new Response(
        JSON.stringify({ error: `Failed to update norma: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Norma updated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        items_extraidos: estrutura.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in extract-pdf-text:", error);
    
    // Try to update status to error
    try {
      const { norma_id } = await req.clone().json();
      if (norma_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase.from("normas").update({
          texto_extraido_status: "erro",
          texto_extraido_em: new Date().toISOString(),
        }).eq("id", norma_id);
      }
    } catch (_) {
      // Ignore errors in error handler
    }
    
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
