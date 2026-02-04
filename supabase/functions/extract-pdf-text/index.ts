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

type ToolArgs = {
  dispositivos: {
    anchor: string;
    nivel: "artigo" | "inciso" | "paragrafo" | "alinea";
    texto: string;
  }[];
};

function safeJsonParse<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractToolArgsFromAiResult(aiResult: any): ToolArgs | null {
  const msg = aiResult?.choices?.[0]?.message;

  // OpenAI-style tool calls
  const toolCalls = msg?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const name = call?.function?.name ?? call?.name;
      const argsRaw = call?.function?.arguments ?? call?.arguments;
      if (!argsRaw) continue;
      if (name && name !== "extract_dispositivos") continue;
      const parsed = safeJsonParse<ToolArgs>(argsRaw);
      if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
    }
  }

  // Legacy OpenAI-style function_call
  const fc = msg?.function_call;
  if (fc?.arguments) {
    const parsed = safeJsonParse<ToolArgs>(fc.arguments);
    if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
  }

  return null;
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

    const gatewayUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";

    const toolsPayload = [
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
                      description: "Identificador do dispositivo (ex: art.1, art.1.I, art.1§1, art.1.a)",
                    },
                    nivel: {
                      type: "string",
                      enum: ["artigo", "inciso", "paragrafo", "alinea"],
                      description: "Tipo do dispositivo",
                    },
                    texto: {
                      type: "string",
                      description: "Texto completo do dispositivo",
                    },
                  },
                  required: ["anchor", "nivel", "texto"],
                  additionalProperties: false,
                },
              },
            },
            required: ["dispositivos"],
            additionalProperties: false,
          },
        },
      },
    ];

    const messagesPayload = [
      {
        role: "system",
        content: `Você é um extrator de texto jurídico especializado em normas brasileiras.
Extraia TODOS os dispositivos do documento: artigos, incisos, parágrafos e alíneas.
Para cada dispositivo, identifique o anchor (ex: art.1, art.1.I, art.1§1, art.1.a) e o texto completo.
É CRÍTICO extrair TODOS os artigos do documento, sem omitir nenhum.`,
      },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "norma.pdf",
              file_data: `data:application/pdf;base64,${base64Pdf}`,
            },
          },
          {
            type: "text",
            text:
              "Extraia TODOS os dispositivos desta norma jurídica usando a função extract_dispositivos. Não omita nenhum artigo.",
          },
        ],
      },
    ];

    const buildGatewayBody = (model: string) => ({
      model,
      messages: messagesPayload,
      tools: toolsPayload,
      tool_choice: { type: "function", function: { name: "extract_dispositivos" } },
      temperature: 0.1,
      max_tokens: 64000,
    });

    const callGateway = async (model: string) => {
      const resp = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGatewayBody(model)),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error("AI API error:", resp.status, errorText?.slice(0, 2000));
        throw new Error(`AI API error: ${resp.status}`);
      }

      return await resp.json();
    };

    // 1) Tenta um modelo mais novo por padrão; 2) fallback para pro; 3) fallback para o flash antigo
    const candidateModels = [
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
    ];

    let aiResult: any = null;
    let usedModel = candidateModels[0];
    let toolArgs: ToolArgs | null = null;

    for (const m of candidateModels) {
      usedModel = m;
      aiResult = await callGateway(m);
      toolArgs = extractToolArgsFromAiResult(aiResult);

      const msg = aiResult?.choices?.[0]?.message;
      const toolCallsCount = Array.isArray(msg?.tool_calls) ? msg.tool_calls.length : 0;
      const hasLegacyFunctionCall = Boolean(msg?.function_call);
      const contentLen =
        typeof msg?.content === "string" ? msg.content.length : Array.isArray(msg?.content) ? msg.content.length : 0;

      console.log(
        JSON.stringify({
          ai_model: m,
          has_tool_args: Boolean(toolArgs),
          tool_calls_count: toolCallsCount,
          has_legacy_function_call: hasLegacyFunctionCall,
          message_keys: msg ? Object.keys(msg) : [],
          content_len: contentLen,
        })
      );

      if (toolArgs?.dispositivos?.length) break;
      console.warn(`No tool args extracted for model ${m}; retrying with next model...`);
    }

    console.log("AI response received, extracting tool call...");

    // Parse the tool call response
    let estrutura: ExtractedArticle[];
    let parsedOk = false;
    try {
      if (!toolArgs?.dispositivos || !Array.isArray(toolArgs.dispositivos) || toolArgs.dispositivos.length === 0) {
        throw new Error("No valid tool args in response");
      }

      const dispositivos = toolArgs.dispositivos;

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
      const content = aiResult?.choices?.[0]?.message?.content || "";
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
        texto_extraido_origem: `lovable-ai:${usedModel}`,
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
