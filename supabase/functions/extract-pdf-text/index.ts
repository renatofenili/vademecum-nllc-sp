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
            content: `Você é um extrator de texto jurídico especializado em normas brasileiras (leis, decretos, resoluções, portarias, instruções normativas).

Sua tarefa é extrair e estruturar o texto do PDF em formato JSON com a seguinte estrutura:

[
  {
    "document_id": "${norma_id}",
    "anchor": "art.1",
    "nivel": "artigo",
    "texto": "Texto completo do artigo..."
  },
  {
    "document_id": "${norma_id}",
    "anchor": "art.1.I",
    "nivel": "inciso",
    "texto": "Texto do inciso..."
  },
  {
    "document_id": "${norma_id}",
    "anchor": "art.1§1",
    "nivel": "paragrafo",
    "texto": "Texto do parágrafo..."
  },
  {
    "document_id": "${norma_id}",
    "anchor": "art.1.a",
    "nivel": "alinea",
    "texto": "Texto da alínea..."
  }
]

Regras:
1. Inclua "document_id": "${norma_id}" em TODOS os itens
2. Identifique artigos (Art. 1º, Art. 2º, etc.)
3. Identifique incisos (I -, II -, III -, etc.) e relacione ao artigo pai
4. Identifique parágrafos (§ 1º, § 2º, Parágrafo único) e relacione ao artigo pai
5. Identifique alíneas (a), b), c)) e relacione ao artigo/inciso pai
6. Mantenha o texto original, apenas formatando para legibilidade
7. Retorne APENAS o JSON válido, sem explicações adicionais
8. Se não encontrar estrutura de artigos, retorne o texto completo com anchor "texto" e nivel "artigo"`
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
                text: "Extraia e estruture o texto desta norma jurídica em formato JSON conforme as instruções."
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || "";

    console.log("AI response received, parsing JSON...");

    // Parse the JSON from AI response
    let estrutura: ExtractedArticle[];
    try {
      // Remove markdown code blocks if present
      let jsonContent = aiContent.trim();
      if (jsonContent.startsWith("```json")) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith("```")) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();
      
      estrutura = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Fallback: save raw text
      estrutura = [{
        document_id: norma_id,
        anchor: "texto",
        nivel: "artigo",
        texto: aiContent.substring(0, 50000)
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
        texto_extraido_status: "extraido",
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
