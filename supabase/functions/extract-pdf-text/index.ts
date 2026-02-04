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

type GatewayBatchResult = {
  dispositivos: ToolArgs["dispositivos"];
  ok: boolean;
  retryable: boolean;
  retry_after_ms: number;
  error_kind?:
    | "gateway_http"
    | "no_tool_args"
    | "invalid_json"
    | "unknown";
  http_status?: number;
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

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Some gateways return content parts: [{type:'text', text:'...'}, ...]
    return content
      .map((p: any) => {
        if (typeof p === "string") return p;
        if (p?.type === "text" && typeof p?.text === "string") return p.text;
        if (typeof p?.text === "string") return p.text;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
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
  const contentStr = messageContentToText(msg?.content);
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

const DEFAULT_BATCH_SIZE = 10;
const MAX_ARTICLES = 300; // safety cap
const MODEL = "google/gemini-3-flash-preview";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function parseArticleNumberFromAnchor(anchor: unknown): number | null {
  if (!anchor) return null;
  const s = String(anchor)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // Prefer our canonical "art.12" format
  const m1 = s.match(/\bart\.?\s*(\d{1,3})\b/);
  if (m1?.[1]) return Number(m1[1]);

  // Some models may output "artigo 12"
  const m2 = s.match(/\bartigo\s*(\d{1,3})\b/);
  if (m2?.[1]) return Number(m2[1]);

  return null;
}

function filterDispositivosByRange(
  dispositivos: ToolArgs["dispositivos"],
  batchStart: number,
  batchEnd: number
): ToolArgs["dispositivos"] {
  return (dispositivos || []).filter((d) => {
    const n = parseArticleNumberFromAnchor(d?.anchor);
    if (n == null) return false;
    return n >= batchStart && n <= batchEnd;
  });
}

function dedupeByAnchor(
  existing: ExtractedArticle[],
  incoming: ToolArgs["dispositivos"],
  normaId: string
): ExtractedArticle[] {
  const seen = new Set<string>();
  for (const e of existing) {
    if (e?.anchor) seen.add(String(e.anchor));
  }

  const out: ExtractedArticle[] = [];
  for (const item of incoming) {
    const anchor = String(item?.anchor || "").trim();
    if (!anchor) continue;
    if (seen.has(anchor)) continue;
    seen.add(anchor);
    out.push({
      document_id: normaId,
      anchor,
      nivel: (item?.nivel || "artigo") as ExtractedArticle["nivel"],
      texto: String(item?.texto || ""),
    });
  }
  return out;
}

async function callGatewayBatch(
  lovableApiKey: string,
  base64Pdf: string,
  batchStart: number,
  batchEnd: number
): Promise<GatewayBatchResult> {
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

  const userPrompt = `Extraia SOMENTE os artigos ${batchStart} até ${batchEnd} (e seus incisos/parágrafos/alíneas) desta norma jurídica usando a função extract_dispositivos. Se algum dispositivo não pertencer ao intervalo, ignore.`;

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
    max_tokens: 9000,
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
    const status = resp.status;
    console.error(
      `AI API error (batch ${batchStart}-${batchEnd}):`,
      status,
      errorText?.slice(0, 1000)
    );

    // Most of these are transient (rate limit / gateway issues)
    const retryable = [408, 425, 429, 500, 502, 503, 504].includes(status);
    return {
      dispositivos: [],
      ok: false,
      retryable,
      retry_after_ms: retryable ? 1500 : 0,
      error_kind: "gateway_http",
      http_status: status,
    };
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
    return {
      dispositivos: toolArgs.dispositivos,
      ok: true,
      retryable: false,
      retry_after_ms: 0,
    };
  }

  // No tool args: usually transient model behavior; treat as retryable.
  const msgContent = aiResult?.choices?.[0]?.message?.content;
  const contentText = messageContentToText(msgContent);
  console.warn(
    JSON.stringify({
      batch: `${batchStart}-${batchEnd}`,
      issue: "no_tool_args",
      content_preview: contentText ? contentText.slice(0, 300) : null,
      content_len: contentText?.length ?? 0,
    })
  );
  return {
    dispositivos: [],
    ok: false,
    retryable: true,
    retry_after_ms: 900,
    error_kind: "no_tool_args",
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { pdf_storage_path, norma_id } = reqBody;

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

    // Auth guard (default: required)
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // === Single-batch, resumable extraction ===
    const requestedBatchStart =
      typeof reqBody?.batch_start === "number" ? Math.max(1, Math.floor(reqBody.batch_start)) : null;
    const batchSize =
      typeof reqBody?.batch_size === "number"
        ? Math.min(30, Math.max(1, Math.floor(reqBody.batch_size)))
        : DEFAULT_BATCH_SIZE;
    const emptyStreak =
      typeof reqBody?.empty_streak === "number" ? Math.max(0, Math.floor(reqBody.empty_streak)) : 0;
    const reset = Boolean(reqBody?.reset);

    // Load existing extraction (for resume)
    let existingEstrutura: ExtractedArticle[] = [];
    if (!reset) {
      const { data: normaRow, error: normaRowError } = await supabase
        .from("normas")
        .select("texto_extraido")
        .eq("id", norma_id)
        .single();

      if (!normaRowError && (normaRow as any)?.texto_extraido) {
        try {
          const parsed = JSON.parse((normaRow as any).texto_extraido);
          if (Array.isArray(parsed)) {
            existingEstrutura = parsed as ExtractedArticle[];
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const maxExisting = existingEstrutura.reduce((acc, cur) => {
      const n = parseArticleNumberFromAnchor(cur?.anchor);
      if (n != null && n > acc) return n;
      return acc;
    }, 0);

    const batchStart = requestedBatchStart ?? (maxExisting > 0 ? maxExisting + 1 : 1);
    if (batchStart > MAX_ARTICLES) {
      return new Response(
        JSON.stringify({ success: true, done: true, reason: "max_articles_reached" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const batchEnd = Math.min(MAX_ARTICLES, batchStart + batchSize - 1);

    // Mark as pending before starting this batch
    {
      const { error: pendErr } = await supabase
        .from("normas")
        .update({
          texto_extraido_status: "pendente",
          texto_extraido_em: new Date().toISOString(),
          texto_extraido_origem: `lovable-ai:${MODEL}:batched`,
          ...(reset ? { texto_extraido: JSON.stringify([]) } : {}),
        })
        .eq("id", norma_id);
      if (pendErr) console.error("Failed to set pending status:", pendErr);
    }

     console.log(`Extracting single batch: art.${batchStart} - art.${batchEnd}`);
     const batchResult = await callGatewayBatch(lovableApiKey, base64Pdf, batchStart, batchEnd);
     const { dispositivos, ok, retryable, retry_after_ms, error_kind } = batchResult;

    if (!ok) {
       if (retryable) {
         // Keep as pending; let the frontend retry the SAME batch.
         const { error: pendErr2 } = await supabase
           .from("normas")
           .update({
             texto_extraido_status: "pendente",
             texto_extraido_em: new Date().toISOString(),
             texto_extraido_origem: `lovable-ai:${MODEL}:batched:retryable:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
           })
           .eq("id", norma_id);
         if (pendErr2) console.error("Failed to keep pending status:", pendErr2);

         return new Response(
           JSON.stringify({
             success: true,
             done: false,
             retryable: true,
             retry_after_ms: retry_after_ms ?? 900,
             batch_start: batchStart,
             batch_end: batchEnd,
             items_added: 0,
             artigos_added: 0,
             next_batch_start: batchStart,
             empty_batch: false,
           }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }

       const { error: errUpd } = await supabase
         .from("normas")
         .update({
           texto_extraido_status: "erro",
           texto_extraido_em: new Date().toISOString(),
           texto_extraido_origem: `lovable-ai:${MODEL}:batched:error:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
         })
         .eq("id", norma_id);
       if (errUpd) console.error("Failed to set error status:", errUpd);

       return new Response(
         JSON.stringify({ success: false, error: "AI extraction failed" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
    }

    const filtered = filterDispositivosByRange(dispositivos, batchStart, batchEnd);
    const deduped = dedupeByAnchor(existingEstrutura, filtered, norma_id);

    const artigosAdded = deduped.filter((d) => String(d.nivel).toLowerCase() === "artigo").length;
    const nextEstrutura = reset ? deduped : [...existingEstrutura, ...deduped];

    const isEmptyBatch = artigosAdded === 0;
    const done = isEmptyBatch && emptyStreak >= 1 && nextEstrutura.length > 0;

    const statusToPersist = done ? "extraido" : "pendente";
    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(nextEstrutura),
        texto_extraido_em: new Date().toISOString(),
        texto_extraido_origem: `lovable-ai:${MODEL}:batched:${batchStart}-${batchEnd}`,
        texto_extraido_status: statusToPersist,
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
        done,
        batch_start: batchStart,
        batch_end: batchEnd,
        items_added: deduped.length,
        artigos_added: artigosAdded,
        next_batch_start: done ? null : batchEnd + 1,
        empty_batch: isEmptyBatch,
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
