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

  // Fallback: try to parse from content (JSON in markdown code block)
  const contentStr = typeof msg?.content === "string" ? msg.content : "";
  if (contentStr) {
    // Remove markdown code block wrappers
    let cleaned = contentStr.trim();
    const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
    // Try parsing as JSON with dispositivos
    const parsed = safeJsonParse<ToolArgs>(cleaned);
    if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
    // Try as array directly
    const arrParsed = safeJsonParse<any[]>(cleaned);
    if (Array.isArray(arrParsed) && arrParsed.length > 0 && arrParsed[0].anchor) {
      return { dispositivos: arrParsed };
    }
  }

  return null;
}

const BATCH_SIZE = 30; // number of articles per batch
const MODEL = "google/gemini-3-flash-preview";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callGatewayBatch(
  lovableApiKey: string,
  base64Pdf: string,
  batchStart: number,
  batchEnd: number
): Promise<{ dispositivos: ToolArgs["dispositivos"]; ok: boolean }> {
  const toolsPayload = [
    {
      type: "function",
      function: {
        name: "extract_dispositivos",
        description:
          "Extrai dispositivos de uma norma jurídica brasileira (artigos, incisos, parágrafos e alíneas)",
        parameters: {
          type: "object",
          properties: {
            dispositivos: {
              type: "array",
              description: "Lista dos dispositivos extraídos",
              items: {
                type: "object",
                properties: {
                  anchor: {
                    type: "string",
                    description:
                      "Identificador do dispositivo (ex: art.1, art.1.I, art.1§1, art.1.a)",
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

  const userPrompt =
    batchStart === 1 && batchEnd === BATCH_SIZE
      ? `Extraia os artigos 1 até ${batchEnd} (e seus incisos/parágrafos/alíneas) desta norma jurídica usando a função extract_dispositivos.`
      : `Extraia os artigos ${batchStart} até ${batchEnd} (e seus incisos/parágrafos/alíneas) desta norma jurídica usando a função extract_dispositivos.`;

  const messagesPayload = [
    {
      role: "system",
      content: `Você é um extrator de texto jurídico especializado em normas brasileiras.
Extraia apenas os artigos solicitados (e seus incisos, parágrafos e alíneas).
Para cada dispositivo, identifique:
- anchor: identificador no formato art.X, art.X.I, art.X§Y, art.X.a, etc.
- nivel: artigo | inciso | paragrafo | alinea
- texto: texto completo do dispositivo.
Não omita nenhum artigo do intervalo solicitado.`,
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
          text: userPrompt,
        },
      ],
    },
  ];

  const body = {
    model: MODEL,
    messages: messagesPayload,
    tools: toolsPayload,
    tool_choice: { type: "function", function: { name: "extract_dispositivos" } },
    temperature: 0.1,
    max_tokens: 32000,
  };

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error(`AI API error (batch ${batchStart}-${batchEnd}):`, resp.status, errorText?.slice(0, 1000));
    return { dispositivos: [], ok: false };
  }

  const aiResult = await resp.json();
  const toolArgs = extractToolArgsFromAiResult(aiResult);

  const msg = aiResult?.choices?.[0]?.message;
  console.log(
    JSON.stringify({
      batch: `${batchStart}-${batchEnd}`,
      has_tool_args: Boolean(toolArgs),
      tool_calls_count: Array.isArray(msg?.tool_calls) ? msg.tool_calls.length : 0,
      message_keys: msg ? Object.keys(msg) : [],
      dispositivos_count: toolArgs?.dispositivos?.length ?? 0,
    })
  );

  if (toolArgs?.dispositivos && toolArgs.dispositivos.length > 0) {
    return { dispositivos: toolArgs.dispositivos, ok: true };
  }
  return { dispositivos: [], ok: false };
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
      await supabase.from("normas").update({
        texto_extraido_status: "erro",
        texto_extraido_em: new Date().toISOString(),
      }).eq("id", norma_id);
      return new Response(
        JSON.stringify({ error: `Failed to download PDF: ${downloadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = base64Encode(new Uint8Array(arrayBuffer));

    console.log(`PDF downloaded, size: ${arrayBuffer.byteLength} bytes`);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Set status to "processando"
    await supabase.from("normas").update({
      texto_extraido_status: "processando",
      texto_extraido_em: new Date().toISOString(),
    }).eq("id", norma_id);

    // === Batch extraction logic ===
    const allDispositivos: ToolArgs["dispositivos"] = [];
    let batchStart = 1;
    let consecutiveEmptyBatches = 0;
    const MAX_CONSECUTIVE_EMPTY = 2;
    const MAX_ARTICLES = 300; // safety cap

    while (batchStart <= MAX_ARTICLES && consecutiveEmptyBatches < MAX_CONSECUTIVE_EMPTY) {
      const batchEnd = batchStart + BATCH_SIZE - 1;
      console.log(`Extracting batch: art.${batchStart} - art.${batchEnd}`);

      const { dispositivos, ok } = await callGatewayBatch(lovableApiKey, base64Pdf, batchStart, batchEnd);

      if (!ok || dispositivos.length === 0) {
        consecutiveEmptyBatches++;
        console.warn(`Batch ${batchStart}-${batchEnd} returned 0 items. Consecutive empty: ${consecutiveEmptyBatches}`);
      } else {
        consecutiveEmptyBatches = 0;
        allDispositivos.push(...dispositivos);
        console.log(`Batch ${batchStart}-${batchEnd} extracted ${dispositivos.length} dispositivos.`);
      }

      batchStart += BATCH_SIZE;
    }

    console.log(`Finished batch extraction. Total dispositivos: ${allDispositivos.length}`);

    const parsedOk = allDispositivos.length > 0;

    const estrutura: ExtractedArticle[] = allDispositivos.map((item) => ({
      document_id: norma_id,
      anchor: item.anchor || "texto",
      nivel: item.nivel || "artigo",
      texto: item.texto || "",
    }));

    // If no items, add a placeholder error entry
    if (estrutura.length === 0) {
      estrutura.push({
        document_id: norma_id,
        anchor: "texto",
        nivel: "artigo",
        texto: "(Falha na extração em lotes)",
      });
    }

    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(estrutura),
        texto_extraido_em: new Date().toISOString(),
        texto_extraido_origem: `lovable-ai:${MODEL}:batched`,
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
        batches_processed: Math.ceil((batchStart - 1) / BATCH_SIZE),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in extract-pdf-text:", error);

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
