const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const PDF_STORAGE_BUCKET = "normas-pdf";
const EDITAL_STORAGE_PREFIX = "edital-jobs";
const JOB_STALE_AFTER_MS = 5 * 60 * 1000;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

/* ── Supabase admin ── */
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/* ── PDF text extraction (local, cheap) ── */
function textContentToPlain(tc: { items?: Array<{ str?: string; hasEOL?: boolean }> } | null): string {
  const items = Array.isArray(tc?.items) ? tc!.items : [];
  const parts: string[] = [];
  for (const item of items) {
    const chunk = typeof item?.str === "string" ? item.str : "";
    if (!chunk) continue;
    parts.push(chunk);
    parts.push(item?.hasEOL ? "\n" : " ");
  }
  return parts.join("");
}

async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: pdfBytes, useSystemFonts: true } as never).promise;
  const totalPages = Math.min(doc.numPages || 0, 200);
  const parts: string[] = [];
  for (let p = 1; p <= totalPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = textContentToPlain(tc as any);
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n\n")
    .replace(/\r\n/g, "\n")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Build smart context window ── */
function buildContext(text: string, maxChars = 55000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, 18000);
  const tail = text.slice(Math.max(0, text.length - 18000));
  // Find keyword-rich sections in the middle
  const anchorRe = /(?:objeto|modalidade|preg[aã]o|crit[eé]rio|sess[aã]o|habilita[cç]|cons[oó]rcio|cooperativa|amostra|garantia|valor\s+(?:estimado|global|m[aá]ximo)|planilha|tabela|anexo)/gi;
  const anchors = Array.from(text.matchAll(anchorRe)).map(m => m.index ?? 0);
  const midSections: string[] = [];
  let budget = maxChars - head.length - tail.length - 200;
  for (const idx of anchors.slice(0, 10)) {
    if (idx < 18000 || idx > text.length - 18000) continue;
    const chunk = text.slice(Math.max(0, idx - 400), Math.min(text.length, idx + 3000));
    if (budget - chunk.length < 0) break;
    midSections.push(chunk);
    budget -= chunk.length;
  }
  return [head, ...midSections, tail].join("\n\n---\n\n");
}

/* ── Storage helpers ── */
function sanitizeFileName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 120) || "edital.pdf";
}

function isJobStale(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return Date.now() - Date.parse(createdAt) > JOB_STALE_AFTER_MS;
}

/* ══════════════════════════════════════════════
   SINGLE AI CALL — one tool, all fields
   ══════════════════════════════════════════════ */

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "edital_analysis",
    description: "Analisa um edital de licitação e retorna dados estruturados",
    parameters: {
      type: "object",
      properties: {
        // ── Metadados (cada um com valor + trecho_fonte) ──
        numero_edital: { type: "string", description: "Número completo do edital com ano. Ex: 'Pregão Eletrônico 001/2025'" },
        numero_edital_fonte: { type: "string", description: "Transcrição EXATA do trecho do edital (max 200 chars)" },
        orgao: { type: "string", description: "Nome completo do órgão/entidade PROMOTORA da licitação. NÃO é a plataforma eletrônica." },
        orgao_fonte: { type: "string", description: "Trecho EXATO do edital (max 200 chars)" },
        objeto: { type: "string", description: "Descrição do objeto da licitação (max 400 chars)" },
        objeto_fonte: { type: "string", description: "Trecho EXATO do edital (max 200 chars)" },
        modalidade: { type: "string", description: "Modalidade: Pregão Eletrônico, Concorrência, etc." },
        modalidade_fonte: { type: "string", description: "Trecho EXATO (max 200 chars)" },
        valor_estimado: { type: "string", description: "Valor total estimado em R$ X.XXX,XX ou 'Não informado no edital' se sigiloso/ausente" },
        valor_estimado_fonte: { type: "string", description: "Trecho EXATO (max 200 chars). Se não encontrou, 'Não localizado'" },
        criterio_julgamento: { type: "string", description: "Ex: 'Menor preço por item', 'Técnica e preço'" },
        criterio_julgamento_fonte: { type: "string", description: "Trecho EXATO (max 200 chars)" },
        data_sessao: { type: "string", description: "Data e hora da sessão pública. Ex: '15/07/2025 às 09h00'" },
        data_sessao_fonte: { type: "string", description: "Trecho EXATO (max 200 chars)" },
        plataforma: { type: "string", description: "Nome da plataforma eletrônica (ComprasGov, BEC/SP, etc.) ou 'Não identificado'" },
        plataforma_fonte: { type: "string", description: "Trecho EXATO (max 200 chars)" },
        participacao: { type: "string", description: "'Exclusiva ME/EPP' ou 'Ampla concorrência' ou 'Não identificado'" },
        participacao_fonte: { type: "string", description: "Trecho EXATO (max 200 chars)" },

        // ── Resumo em linguagem simples ──
        resumo_linguagem_simples: { type: "string", description: "Explique o edital como se estivesse falando com um empresário leigo. 3-5 parágrafos. Cubra: o que está sendo comprado, quem pode participar, documentos principais, como funciona a disputa e prazos importantes. Seja claro e direto." },

        // ── Pontos de atenção ──
        pontos_atencao: {
          type: "array",
          description: "Lista de 4-8 pontos que o licitante deve prestar atenção especial",
          items: {
            type: "object",
            properties: {
              ponto: { type: "string", description: "Descrição clara do ponto de atenção (1-2 frases)" },
              trecho_fonte: { type: "string", description: "Trecho EXATO do edital que fundamenta (max 200 chars)" },
            },
            required: ["ponto", "trecho_fonte"],
          },
        },

        // ── Complexidade ──
        complexidade_score: { type: "number", description: "Score de 1 a 10 (1=muito simples, 10=muito complexo)" },
        complexidade_justificativa: { type: "string", description: "Justificativa em 2-3 frases explicando o score" },
        complexidade_fatores: {
          type: "array",
          description: "Fatores que elevam ou reduzem a complexidade",
          items: { type: "string" },
        },
      },
      required: [
        "numero_edital", "numero_edital_fonte",
        "orgao", "orgao_fonte",
        "objeto", "objeto_fonte",
        "modalidade", "modalidade_fonte",
        "valor_estimado", "valor_estimado_fonte",
        "criterio_julgamento", "criterio_julgamento_fonte",
        "data_sessao", "data_sessao_fonte",
        "plataforma", "plataforma_fonte",
        "participacao", "participacao_fonte",
        "resumo_linguagem_simples",
        "pontos_atencao",
        "complexidade_score", "complexidade_justificativa", "complexidade_fatores",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Você é um analista especialista em licitações públicas brasileiras.

REGRAS ABSOLUTAS:
1. NUNCA invente informações. Se não encontrar algo, diga "Não identificado no edital".
2. Para cada campo "_fonte", transcreva o trecho EXATO do documento — copie literalmente, sem parafrasear.
3. O "orgao" é quem PROMOVE a licitação (Secretaria, Prefeitura, etc.), NUNCA a plataforma eletrônica.
4. O "valor_estimado" deve ser o valor TOTAL/GLOBAL. Se existem vários itens, some. Se é sigiloso, diga "Não informado no edital (sigiloso)".
5. Seja preciso nas datas — inclua horário quando disponível.
6. No resumo em linguagem simples, explique como se estivesse conversando com um empresário que nunca participou de licitação.
7. Os pontos de atenção devem focar no que pode ELIMINAR o licitante ou gerar CUSTO inesperado.
8. A complexidade deve refletir a dificuldade REAL de participar e executar.`;

async function analyzeWithAI(text: string): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const context = buildContext(text);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 8192,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analise o seguinte edital de licitação e extraia TODAS as informações solicitadas.\n\nTEXTO DO EDITAL:\n\n${context}` },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "edital_analysis" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI error ${response.status}: ${errText}`);
    if (response.status === 429) throw new Error("Limite de requisições excedido. Tente novamente em alguns segundos.");
    if (response.status === 402) throw new Error("Créditos de IA esgotados.");
    throw new Error("Erro na análise por IA");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("No tool call:", JSON.stringify(data).slice(0, 500));
    throw new Error("A IA não retornou análise estruturada");
  }

  return JSON.parse(toolCall.function.arguments);
}

/* ── Background job processor ── */
async function processJob(jobId: string, storagePath: string) {
  const sb = getSupabaseAdmin();
  try {
    await sb.from("edital_jobs").update({ progress: 10 }).eq("id", jobId);

    // Download PDF
    const { data: pdfBlob, error: dlErr } = await sb.storage.from(PDF_STORAGE_BUCKET).download(storagePath);
    if (dlErr || !pdfBlob) throw new Error("Não foi possível recuperar o PDF.");

    await sb.from("edital_jobs").update({ progress: 25 }).eq("id", jobId);

    // Extract text locally
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    const text = await extractTextFromPdf(pdfBytes);
    if (!text || text.length < 100) throw new Error("Não foi possível extrair texto suficiente do PDF.");

    await sb.from("edital_jobs").update({ progress: 50 }).eq("id", jobId);

    // Single AI call
    const result = await analyzeWithAI(text);

    await sb.from("edital_jobs").update({
      status: "completed",
      progress: 100,
      result: result as unknown as Record<string, unknown>,
    }).eq("id", jobId);
  } catch (error) {
    console.error("Job failed:", error);
    await sb.from("edital_jobs").update({
      status: "failed",
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }).eq("id", jobId);
  } finally {
    await sb.storage.from(PDF_STORAGE_BUCKET).remove([storagePath]).catch(() => {});
  }
}

/* ── HTTP Handler ── */
async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const url = new URL(req.url);

    // GET — poll job status
    const jobId = url.searchParams.get("job_id");
    if (req.method === "GET" && jobId) {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.from("edital_jobs")
        .select("status, progress, result, error, created_at")
        .eq("id", jobId).single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Job não encontrado" }), { status: 404, headers });
      }

      // Stale job detection
      if (data.status === "processing" && isJobStale(data.created_at)) {
        const msg = "A análise excedeu o tempo limite. Tente novamente.";
        await sb.from("edital_jobs").update({ status: "failed", error: msg }).eq("id", jobId);
        return new Response(JSON.stringify({ status: "failed", progress: data.progress, result: null, error: msg }), { headers });
      }

      return new Response(JSON.stringify({
        status: data.status, progress: data.progress, result: data.result, error: data.error,
      }), { headers });
    }

    // POST — submit PDF
    if (req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return new Response(JSON.stringify({ error: "Nenhum arquivo enviado" }), { status: 400, headers });
      if (file.type !== "application/pdf") return new Response(JSON.stringify({ error: "O arquivo deve ser um PDF" }), { status: 400, headers });
      if (file.size > 20 * 1024 * 1024) return new Response(JSON.stringify({ error: "Limite de 20 MB excedido" }), { status: 400, headers });

      const sb = getSupabaseAdmin();
      const { data: job, error: jobErr } = await sb.from("edital_jobs")
        .insert({ status: "processing", progress: 5 }).select("id").single();
      if (jobErr || !job) return new Response(JSON.stringify({ error: "Falha ao criar job" }), { status: 500, headers });

      const storagePath = `${EDITAL_STORAGE_PREFIX}/${job.id}/${sanitizeFileName(file.name || "edital.pdf")}`;
      const { error: upErr } = await sb.storage.from(PDF_STORAGE_BUCKET).upload(storagePath, file, { contentType: file.type, upsert: true });
      if (upErr) {
        await sb.from("edital_jobs").update({ status: "failed", error: "Falha no upload do PDF" }).eq("id", job.id);
        return new Response(JSON.stringify({ error: "Falha no upload" }), { status: 500, headers });
      }

      EdgeRuntime.waitUntil(processJob(job.id, storagePath));
      return new Response(JSON.stringify({ job_id: job.id }), { status: 202, headers });
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), { status: 405, headers });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Erro interno" }), { status: 500, headers });
  }
}

Deno.serve(handleRequest);
