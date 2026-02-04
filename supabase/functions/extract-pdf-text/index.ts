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
  model_used?: string;
  error_kind?:
    | "gateway_http"
    | "payment_required"
    | "no_tool_args"
    | "invalid_json"
    | "unknown";
  http_status?: number;
  error_message?: string;
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

function extractToolArgsDeep(aiResult: any): ToolArgs | null {
  const visited = new WeakSet<object>();

  const tryParseArgs = (name: unknown, argsRaw: unknown): ToolArgs | null => {
    const toolName = typeof name === "string" ? name : null;
    if (toolName && toolName !== "extract_dispositivos") return null;
    if (!argsRaw) return null;
    const parsed = safeJsonParse<ToolArgs>(argsRaw);
    if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
    return null;
  };

  const walk = (node: any): ToolArgs | null => {
    if (node == null) return null;
    if (typeof node !== "object") return null;

    if (visited.has(node)) return null;
    visited.add(node);

    const maybe1 = tryParseArgs(node?.function?.name, node?.function?.arguments);
    if (maybe1) return maybe1;
    const maybe2 = tryParseArgs(node?.name, node?.arguments);
    if (maybe2) return maybe2;

    if (Array.isArray((node as any)?.tool_calls)) {
      for (const c of (node as any).tool_calls) {
        const found = walk(c);
        if (found) return found;
      }
    }

    if (Array.isArray(node)) {
      for (const v of node) {
        const found = walk(v);
        if (found) return found;
      }
      return null;
    }
    for (const v of Object.values(node)) {
      const found = walk(v);
      if (found) return found;
    }
    return null;
  };

  return walk(aiResult);
}

function extractToolArgsFromAiResult(aiResult: any): ToolArgs | null {
  const msg = aiResult?.choices?.[0]?.message;

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

  const fc = msg?.function_call;
  if (fc?.arguments) {
    const parsed = safeJsonParse<ToolArgs>(fc.arguments);
    if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
  }

  const contentStr = messageContentToText(msg?.content);
  if (contentStr) {
    let cleaned = contentStr.trim();
    const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
    const parsed = safeJsonParse<ToolArgs>(cleaned);
    if (parsed?.dispositivos && Array.isArray(parsed.dispositivos)) return parsed;
    const arrParsed = safeJsonParse<any[]>(cleaned);
    if (Array.isArray(arrParsed) && arrParsed.length > 0 && arrParsed[0].anchor) {
      return { dispositivos: arrParsed };
    }
  }

  const deep = extractToolArgsDeep(aiResult);
  if (deep?.dispositivos && Array.isArray(deep.dispositivos)) return deep;

  return null;
}

const DEFAULT_BATCH_SIZE = 5;
const MAX_ARTICLES = 300;
// Cheaper defaults to avoid exhausting credits on long PDFs.
const PRIMARY_MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function parseArticleNumberFromAnchor(anchor: unknown): number | null {
  if (!anchor) return null;
  const s = String(anchor)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const m1 = s.match(/\bart\.?\s*(\d{1,3})\b/);
  if (m1?.[1]) return Number(m1[1]);

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

function inferSearchTermFromStoragePath(path: string): string {
  // Most uploads are saved as `${timestamp}_${sanitizedName}`.
  // If the timestamp prefix becomes stale, we can search by sanitizedName.
  return String(path || "").replace(/^\d+_/, "").trim();
}

async function storageErrorToMessage(err: any): Promise<string> {
  try {
    const name = err?.name ? String(err.name) : "StorageError";
    const message = err?.message ? String(err.message) : "";
    const status = err?.originalError?.status ?? err?.statusCode ?? err?.status ?? null;
    let bodyText = "";
    if (err?.originalError && typeof err.originalError?.clone === "function") {
      try {
        bodyText = await err.originalError.clone().text();
      } catch {
        bodyText = "";
      }
    }
    const parts = [name, message, status ? `status=${status}` : null, bodyText ? bodyText.slice(0, 300) : null]
      .filter(Boolean)
      .join(" | ");
    return parts || "Erro desconhecido no armazenamento";
  } catch {
    return "Erro desconhecido no armazenamento";
  }
}

async function callGatewayBatchWithModel(
  model: string,
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
    model,
    messages: messagesPayload,
    tools: toolsPayload,
    tool_choice: { type: "function", function: { name: "extract_dispositivos" } },
    temperature: 0.1,
    max_tokens: 4096,
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
    let errorText = "";
    try {
      const asJson = await resp.json();
      errorText = typeof asJson === "string" ? asJson : JSON.stringify(asJson);
    } catch {
      errorText = await resp.text();
    }
    const status = resp.status;
    console.error(
      `AI API error (batch ${batchStart}-${batchEnd}):`,
      status,
      errorText?.slice(0, 1000)
    );

    const retryable = [408, 425, 429, 500, 502, 503, 504].includes(status);
    return {
      dispositivos: [],
      ok: false,
      retryable,
      retry_after_ms: retryable ? 1500 : 0,
      error_kind: status === 402 ? "payment_required" : "gateway_http",
      http_status: status,
      model_used: model,
      error_message: errorText?.slice(0, 1000) || undefined,
    };
  }

  const aiResult = await resp.json();
  const toolArgs = extractToolArgsFromAiResult(aiResult);

  const msg = aiResult?.choices?.[0]?.message;
  console.log(
    JSON.stringify({
      model,
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
      model_used: model,
    };
  }

  const msgObj = aiResult?.choices?.[0]?.message;
  const contentText = messageContentToText(msgObj?.content);
  const refusalText = messageContentToText((msgObj as any)?.refusal);
  const annotations = (msgObj as any)?.annotations;
  const annotations_summary = Array.isArray(annotations)
    ? annotations
        .slice(0, 3)
        .map((a: any) => ({
          type: a?.type ?? null,
          keys: a && typeof a === "object" ? Object.keys(a).slice(0, 8) : [],
        }))
    : null;
  console.warn(
    JSON.stringify({
      model,
      batch: `${batchStart}-${batchEnd}`,
      issue: "no_tool_args",
      content_preview: contentText ? contentText.slice(0, 300) : null,
      content_len: contentText?.length ?? 0,
      refusal_preview: refusalText ? refusalText.slice(0, 300) : null,
      refusal_len: refusalText?.length ?? 0,
      annotations_summary,
    })
  );
  return {
    dispositivos: [],
    ok: false,
    retryable: true,
    retry_after_ms: 900,
    error_kind: "no_tool_args",
    model_used: model,
  };
}

async function callGatewayBatch(
  lovableApiKey: string,
  base64Pdf: string,
  batchStart: number,
  batchEnd: number
): Promise<GatewayBatchResult> {
  const primary = await callGatewayBatchWithModel(
    PRIMARY_MODEL,
    lovableApiKey,
    base64Pdf,
    batchStart,
    batchEnd
  );
  if (primary.ok) return primary;

  if (primary.error_kind === "no_tool_args" || primary.error_kind === "invalid_json") {
    const fallback = await callGatewayBatchWithModel(
      FALLBACK_MODEL,
      lovableApiKey,
      base64Pdf,
      batchStart,
      batchEnd
    );
    if (fallback.ok) return fallback;

    return {
      ...primary,
      retry_after_ms: Math.max(primary.retry_after_ms ?? 0, fallback.retry_after_ms ?? 0),
      http_status: fallback.http_status ?? primary.http_status,
      model_used: fallback.model_used ?? primary.model_used,
    };
  }

  return primary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { pdf_storage_path, norma_id, expected_total } = reqBody;

    if (!pdf_storage_path || !norma_id) {
      return new Response(
        JSON.stringify({ error: "pdf_storage_path and norma_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting PDF extraction for norma: ${norma_id}, path: ${pdf_storage_path}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    let pdfData: Blob | null = null;
    let actualStoragePath = pdf_storage_path;

    const { data: pdfDownload, error: downloadError } = await supabase.storage
      .from("normas-pdf")
      .download(pdf_storage_path);

    if (downloadError) {
      console.error("Error downloading PDF from provided path:", downloadError);
      
      // Path in the request may be stale. Check if there's a newer path in the normas table.
      const { data: normaRow, error: normaRowError } = await supabase
        .from("normas")
        .select("pdf_storage_path, pdf_nome_arquivo")
        .eq("id", norma_id)
        .maybeSingle();

      const freshPath = normaRow?.pdf_storage_path;
      if (!normaRowError && freshPath && freshPath !== pdf_storage_path) {
        console.log(`Trying fresh path from DB: ${freshPath}`);
        const { data: freshDownload, error: freshError } = await supabase.storage
          .from("normas-pdf")
          .download(freshPath);

        if (!freshError && freshDownload) {
          pdfData = freshDownload;
          actualStoragePath = freshPath;
        }
      }

      // Last resort: search by filename (strip timestamp prefix).
      // This handles cases where the DB path was manually edited or an older upload was deleted.
      if (!pdfData) {
        const searchTerm = inferSearchTermFromStoragePath(
          (normaRow?.pdf_nome_arquivo as string | undefined) || pdf_storage_path
        );
        if (searchTerm) {
          console.log(`Searching storage for matching PDF: ${searchTerm}`);
          const { data: listed, error: listError } = await supabase.storage
            .from("normas-pdf")
            .list("", {
              search: searchTerm,
              limit: 20,
              sortBy: { column: "updated_at", order: "desc" },
            } as any);

          if (listError) {
            console.error("Storage list error:", listError);
          } else if (Array.isArray(listed) && listed.length > 0) {
            const picked = listed[0]?.name;
            if (picked) {
              console.log(`Trying matched path from search: ${picked}`);
              const { data: pickedDownload, error: pickedError } = await supabase.storage
                .from("normas-pdf")
                .download(picked);

              if (!pickedError && pickedDownload) {
                pdfData = pickedDownload;
                actualStoragePath = picked;
              } else {
                console.error("Error downloading matched path:", pickedError);
              }
            }
          }
        }
      }

      if (!pdfData) {
        await supabase.from("normas").update({
          texto_extraido_status: "erro",
          texto_extraido_em: new Date().toISOString(),
        }).eq("id", norma_id);

        const msg = await storageErrorToMessage(downloadError);
        return new Response(
          JSON.stringify({
            success: false,
            error_kind: "unknown",
            error_message: `Falha ao baixar o PDF do armazenamento. ${msg}`,
            pdf_storage_path: actualStoragePath,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      pdfData = pdfDownload;
    }

    const arrayBuffer = await pdfData!.arrayBuffer();
    const base64Pdf = base64Encode(new Uint8Array(arrayBuffer));

    console.log(`PDF downloaded, size: ${arrayBuffer.byteLength} bytes`);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

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
        .maybeSingle();

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

    // Determine expected_total (approximation for progress)
    const progressTotal =
      typeof expected_total === "number" && expected_total > 0
        ? expected_total
        : MAX_ARTICLES;

    // Mark as pending before starting this batch + save progress
    {
      const { error: pendErr } = await supabase
        .from("normas")
        .update({
          texto_extraido_status: "pendente",
          texto_extraido_em: new Date().toISOString(),
          texto_extraido_origem: `lovable-ai:${PRIMARY_MODEL}:batched`,
          texto_extraido_progresso_atual: batchStart,
          texto_extraido_progresso_total: progressTotal,
          texto_extraido_progresso_em: new Date().toISOString(),
          pdf_storage_path: actualStoragePath,
          ...(reset ? { texto_extraido: JSON.stringify([]) } : {}),
        })
        .eq("id", norma_id);
      if (pendErr) console.error("Failed to set pending status:", pendErr);
    }

    console.log(`Extracting single batch: art.${batchStart} - art.${batchEnd}`);
    const batchResult = await callGatewayBatch(lovableApiKey, base64Pdf, batchStart, batchEnd);
    const { dispositivos, ok, retryable, retry_after_ms, error_kind, model_used } = batchResult;

    if (!ok) {
      if (retryable) {
        const suggestedBatchSize =
          error_kind === "no_tool_args" && batchSize > 1
            ? Math.max(1, Math.floor(batchSize / 2))
            : batchSize;

        const { error: pendErr2 } = await supabase
          .from("normas")
          .update({
            texto_extraido_status: "pendente",
            texto_extraido_em: new Date().toISOString(),
            texto_extraido_origem: `lovable-ai:${model_used ?? PRIMARY_MODEL}:batched:retryable:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
            texto_extraido_progresso_atual: batchStart,
            texto_extraido_progresso_em: new Date().toISOString(),
            pdf_storage_path: actualStoragePath,
          })
          .eq("id", norma_id);
        if (pendErr2) console.error("Failed to keep pending status:", pendErr2);

        return new Response(
          JSON.stringify({
            success: true,
            done: false,
            retryable: true,
            retry_after_ms: retry_after_ms ?? 900,
            suggested_batch_size: suggestedBatchSize,
            error_kind: error_kind ?? "unknown",
            model_used: model_used ?? PRIMARY_MODEL,
            batch_start: batchStart,
            batch_end: batchEnd,
            items_added: 0,
            artigos_added: 0,
            next_batch_start: batchStart,
            empty_batch: false,
            progress_current: batchStart,
            progress_total: progressTotal,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: errUpd } = await supabase
        .from("normas")
        .update({
          texto_extraido_status: "erro",
          texto_extraido_em: new Date().toISOString(),
          texto_extraido_origem: `lovable-ai:${model_used ?? PRIMARY_MODEL}:batched:error:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
        })
        .eq("id", norma_id);
      if (errUpd) console.error("Failed to set error status:", errUpd);

      return new Response(
        JSON.stringify({
          success: false,
          error_kind: error_kind ?? "unknown",
          http_status: batchResult.http_status ?? null,
          error_message:
            error_kind === "payment_required"
              ? "Créditos de IA insuficientes para continuar esta extração."
              : batchResult.error_message ?? "Falha ao chamar o serviço de IA.",
          batch_start: batchStart,
          batch_end: batchEnd,
          progress_current: batchStart,
          progress_total: progressTotal,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filtered = filterDispositivosByRange(dispositivos, batchStart, batchEnd);
    const deduped = dedupeByAnchor(existingEstrutura, filtered, norma_id);

    const artigosAdded = deduped.filter((d) => String(d.nivel).toLowerCase() === "artigo").length;
    const nextEstrutura = reset ? deduped : [...existingEstrutura, ...deduped];

    const isEmptyBatch = artigosAdded === 0;
    const done = isEmptyBatch && emptyStreak >= 1 && nextEstrutura.length > 0;

    const statusToPersist = done ? "extraido" : "pendente";

    // Compute current progress from the maximum article extracted so far
    const maxArticleNow = nextEstrutura.reduce((acc, cur) => {
      const n = parseArticleNumberFromAnchor(cur?.anchor);
      if (n != null && n > acc) return n;
      return acc;
    }, 0);

    const progressCurrent = done ? progressTotal : maxArticleNow > 0 ? maxArticleNow : batchEnd;

    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(nextEstrutura),
        texto_extraido_em: new Date().toISOString(),
        texto_extraido_origem: `lovable-ai:${model_used ?? PRIMARY_MODEL}:batched:${batchStart}-${batchEnd}`,
        texto_extraido_status: statusToPersist,
        texto_extraido_progresso_atual: progressCurrent,
        texto_extraido_progresso_total: progressTotal,
        texto_extraido_progresso_em: new Date().toISOString(),
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
        progress_current: progressCurrent,
        progress_total: progressTotal,
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
