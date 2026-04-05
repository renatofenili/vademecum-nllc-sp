const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── PDF Text Extraction ──

function repairLigatures(text: string): string {
  let result = text;
  result = result.replace(
    /([a-záàâãéêíóôõúç]{2,})(A)([a-záàâãéêíóôõúç]{2,})/g,
    (match, pre, _mid, suf) => {
      if (/[a-záàâãéêíóôõúç]$/.test(pre) && /^[a-záàâãéêíóôõúç]/.test(suf)) {
        return `${pre}ti${suf}`;
      }
      return match;
    }
  );
  result = result.replace(/\u200B/g, "");
  return result;
}

async function extractTextFromPdf(buffer: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import("npm:unpdf@0.12.1");
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return repairLigatures(text);
}

// ── Utility ──
function firstMatch(text: string, patterns: RegExp[], group = 1): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[group]) return m[group].trim();
  }
  return null;
}

function extractSection(text: string, startPatterns: RegExp[], endPatterns: RegExp[], maxLen = 2000): string | null {
  for (const sp of startPatterns) {
    const sm = text.match(sp);
    if (!sm) continue;
    const start = sm.index! + sm[0].length;
    const slice = text.slice(start, start + maxLen);
    for (const ep of endPatterns) {
      const em = slice.match(ep);
      if (em) return slice.slice(0, em.index!).trim();
    }
    return slice.trim();
  }
  return null;
}

// ── Regex Fallback Extractors ──

function extractNumeroEdital(text: string): string {
  const header = text.slice(0, 8000);
  const labeled = firstMatch(header, [
    /(?:EDITAL|PREGÃO|PREGAO|CONCORRÊNCIA|CONCORRENCIA|TOMADA\s+DE\s+PREÇOS?|DISPENSA|INEXIGIBILIDADE|LEILÃO|CONVITE|DIÁLOGO\s+COMPETITIVO)\s*(?:ELETRÔNIC[OA]\s*)?(?:[A-Z][A-Za-z]*\s+)?(?:N[°ºo.]*\s*)?([\d]+[\d.\-\/]+\d+)/i,
    /(?:EDITAL)\s*(?:N[°ºo.]*\s*)?([\w\-]+\/\d{4})/i,
  ]);
  if (labeled) return labeled;
  const processo = firstMatch(header, [
    /(?:PROCESSO\s+(?:LICITATÓRIO\s+)?(?:N[°ºo.]*\s*)?)([\d.\-\/]+\d+)/i,
  ]);
  if (processo) return processo;
  const generic = firstMatch(header, [
    /(?:n[°ºo.]+)\s*([\d]+[\d.\-\/]*\/\d{4})/i,
  ]);
  if (generic) return generic;
  return "Não identificado";
}

type PlanilhaItem = {
  item: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
};

function parsePtBrNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/R\$\s*/gi, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!cleaned) return 0;

  const normalized = cleaned
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyBRL(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Não informado no edital";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

function normalizeCurrencyField(value: unknown): string {
  const amount = parsePtBrNumber(value);
  return amount > 0 ? formatCurrencyBRL(amount) : "N/D";
}

function mergeCurrencyTokens(tokens: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "R$" && tokens[i + 1]) {
      merged.push(`R$ ${tokens[i + 1]}`);
      i++;
      continue;
    }
    merged.push(tokens[i]);
  }
  return merged;
}

function looksLikeUnitToken(token: string): boolean {
  return /^(?:un|und|kit|kg|g|mg|l|ml|m|m2|m²|m3|m³|cm|mm|hora|horas|dia|dias|m[eê]s|meses|ano|anos|serviç?o|serviç?os|lote|pct|pacote|caixa|frasco|metro|metros|par)$/i.test(token.trim());
}

function normalizePlanilhaItems(items: unknown): PlanilhaItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const item = String(row.item ?? "").trim();
      const descricao = String(row.descricao ?? "").trim();
      const unidade = String(row.unidade ?? "N/D").trim() || "N/D";
      const quantidade = String(row.quantidade ?? "N/D").trim() || "N/D";
      const valorUnitario = normalizeCurrencyField(row.valor_unitario);
      const valorTotal = normalizeCurrencyField(row.valor_total);

      if (!item || !descricao) return null;
      if (parsePtBrNumber(valorUnitario) <= 0 && parsePtBrNumber(valorTotal) <= 0) return null;

      return {
        item,
        descricao,
        unidade,
        quantidade,
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
      } satisfies PlanilhaItem;
    })
    .filter((row): row is PlanilhaItem => Boolean(row));
}

function sumPlanilhaTotals(items: PlanilhaItem[] | null | undefined): number {
  if (!items?.length) return 0;

  return items.reduce((sum, item) => {
    const total = parsePtBrNumber(item.valor_total);
    if (total > 0) return sum + total;

    const unit = parsePtBrNumber(item.valor_unitario);
    const qty = parsePtBrNumber(item.quantidade);
    if (unit > 0 && qty > 0) return sum + (unit * qty);

    return sum;
  }, 0);
}

function buildPlanilhaExtractionContext(text: string): string {
  const norm = text.replace(/\r\n/g, "\n");
  const anchorPattern = /(?:anexo\s+\d+[^\n]{0,140}(?:planilha|quadro|tabela|orçament|estimativ|preç)|planilha\s+(?:estimativa|de\s+custos|de\s+preços?|orçamentária|orcamentaria)|quadro\s+(?:estimativo|de\s+preços?|de\s+custos?)|tabela\s+(?:de\s+)?(?:preços?|custos?)|preço\s+unitário|preco\s+unitario|valor\s+unitário|valor\s+total)/gi;
  const anchors = Array.from(norm.matchAll(anchorPattern)).map((match) => match.index ?? 0);
  const ranges: Array<{ start: number; end: number }> = [];

  for (const index of anchors.slice(0, 8)) {
    const start = Math.max(0, index - 400);
    const end = Math.min(norm.length, index + 6000);
    const last = ranges[ranges.length - 1];

    if (last && start <= last.end + 500) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  const sections = ranges.map(({ start, end }) => norm.slice(start, end).trim()).filter(Boolean);
  const head = norm.slice(0, 3000).trim();
  const tail = norm.slice(Math.max(0, norm.length - 15000)).trim();
  const uniqueSections = Array.from(new Set([head, ...sections, tail].filter(Boolean)));

  let combined = "";
  for (const section of uniqueSections) {
    const candidate = combined
      ? `${combined}\n\n--- TRECHO RELEVANTE ---\n\n${section}`
      : section;

    if (candidate.length > 36000) {
      const remaining = Math.max(0, 36000 - combined.length - (combined ? "\n\n--- TRECHO RELEVANTE ---\n\n".length : 0));
      combined = combined
        ? `${combined}\n\n--- TRECHO RELEVANTE ---\n\n${section.slice(0, remaining)}`
        : section.slice(0, 36000);
      break;
    }

    combined = candidate;
  }

  return combined || norm.slice(0, 36000);
}

function extractStructuredPlanilhaRows(text: string): PlanilhaItem[] {
  const context = buildPlanilhaExtractionContext(text);
  const lines = context
    .split(/\n+/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[|│]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows: PlanilhaItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (/^(?:anexo|planilha|quadro|tabela|item\s+local|local\s+unidade|unidade\s+quantidade|preço\s+unitário|preco\s+unitario|preço\s+total|preco\s+total|valor\s+unitário|valor\s+total|banco\s+central|edital\b|p[eé]\s+\d+)/i.test(line)) {
      continue;
    }

    const initialMatch = line.match(/^(?:(?:item|lote)\s*)?([A-Za-z]?\d{1,3})\b/i);
    if (!initialMatch) continue;

    const tokens = mergeCurrencyTokens(line.split(/\s+/).filter(Boolean));
    const startIndex = /^(item|lote)$/i.test(tokens[0] ?? "") ? 2 : 1;
    const item = (tokens[startIndex - 1] ?? initialMatch[1] ?? "").replace(/[^\dA-Za-z.-]/g, "");
    const tail = tokens.slice(startIndex);

    if (tail.length < 4) continue;

    const valorTotalToken = tail.at(-1) ?? "";
    const valorUnitarioToken = tail.at(-2) ?? "";
    const quantidadeToken = tail.at(-3) ?? "";

    if (!/^\d/.test(quantidadeToken)) continue;
    if (parsePtBrNumber(valorTotalToken) <= 0 || parsePtBrNumber(valorUnitarioToken) <= 0) continue;

    const middle = tail.slice(0, -3);
    if (middle.length === 0) continue;

    let unidade = "N/D";
    if (middle.length >= 2 && looksLikeUnitToken(middle.at(-1) ?? "")) {
      unidade = middle.pop() ?? "N/D";
    }

    const descricao = middle.join(" ").trim();
    if (!descricao || /^(?:r\$|\d+[.,]\d+)$/i.test(descricao)) continue;

    const row = {
      item,
      descricao,
      unidade,
      quantidade: quantidadeToken,
      valor_unitario: formatCurrencyBRL(parsePtBrNumber(valorUnitarioToken)),
      valor_total: formatCurrencyBRL(parsePtBrNumber(valorTotalToken)),
    } satisfies PlanilhaItem;

    const key = `${row.item}|${row.descricao}|${row.valor_total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  return rows;
}

function rankPlanilhaItems(items: PlanilhaItem[]): number {
  const pricedRows = items.filter((item) => parsePtBrNumber(item.valor_total) > 0).length;
  const total = sumPlanilhaTotals(items);
  return (items.length * 100) + (pricedRows * 20) + Math.round(total / 100000);
}

function chooseBestPlanilha(aiItems: PlanilhaItem[], regexItems: PlanilhaItem[]): PlanilhaItem[] | null {
  if (!aiItems.length && !regexItems.length) return null;
  if (!aiItems.length) return regexItems;
  if (!regexItems.length) return aiItems;
  return rankPlanilhaItems(regexItems) > rankPlanilhaItems(aiItems) ? regexItems : aiItems;
}

function resolveValorEstimado(
  text: string,
  aiValue: unknown,
  planilhaItems: PlanilhaItem[] | null,
): { value: string; source: "ai" | "regex" | "planilha" | "none" } {
  const regexValue = extractValorEstimado(text);
  const regexAmount = parsePtBrNumber(regexValue);
  const aiAmount = parsePtBrNumber(typeof aiValue === "string" ? aiValue : "");
  const planilhaAmount = sumPlanilhaTotals(planilhaItems);

  const candidates: Array<{ amount: number; score: number; source: "ai" | "regex" | "planilha" }> = [];

  if (regexAmount > 0) candidates.push({ amount: regexAmount, score: 100, source: "regex" });
  if (aiAmount > 0) candidates.push({ amount: aiAmount, score: 90, source: "ai" });
  if (planilhaAmount > 0) candidates.push({ amount: planilhaAmount, score: 94 + Math.min(planilhaItems?.length ?? 0, 6), source: "planilha" });

  for (const candidate of candidates) {
    if (planilhaAmount > 0 && candidate.source !== "planilha") {
      const ratio = candidate.amount / planilhaAmount;
      if (ratio < 0.35) candidate.score -= 40;
      else if (ratio < 0.75) candidate.score -= 15;
    }

    if (candidate.source === "planilha" && regexAmount > 0) {
      const ratio = planilhaAmount / regexAmount;
      if (ratio < 0.5) candidate.score -= 25;
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  const best = candidates[0];

  if (!best) return { value: "Não informado no edital", source: "none" };
  return { value: formatCurrencyBRL(best.amount), source: best.source };
}

function extractValorEstimado(text: string): string {
  const norm = text.replace(/\r\n/g, "\n");
  const candidates: Array<{ amount: number; score: number }> = [];
  const moneyCapture = String.raw`((?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2})`;
  const patterns: Array<[RegExp, number]> = [
    [new RegExp(String.raw`(?:valor\s+total\s+(?:da\s+)?(?:contratação|licitação|aquisição|contratacao|licitacao|aquisicao)|valor\s+global\s+da\s+contratação)\s*[:.\-–—]?\s*${moneyCapture}`, "gi"), 34],
    [new RegExp(String.raw`(?:valor\s+(?:total\s+)?(?:estimado|máximo|global|de\s+referência|referencial|previsto)|orçamento\s+(?:estimado|máximo|previsto|sigiloso)|valor\s+máximo\s+aceitável)\s*(?:é\s+de|de|:)?\s*${moneyCapture}`, "gi"), 32],
    [new RegExp(String.raw`(?:total\s+geral|valor\s+total\s+estimado|montante\s+global|valor\s+global)\s*[:.\-–—]?\s*${moneyCapture}`, "gi"), 30],
    [new RegExp(String.raw`(?:preço\s+(?:total\s+)?(?:estimado|máximo|de\s+referência)|montante\s+(?:total\s+)?(?:estimado|global))\s*(?:é\s+de|de|:)?\s*${moneyCapture}`, "gi"), 24],
    [/(?:no\s+valor\s+(?:total\s+)?de)\s+(R\$\s*[\d.,]+)/gi, 18],
    [/(?:importa(?:ndo)?\s+em)\s+(R\$\s*[\d.,]+)/gi, 16],
    [/(?:(?:total|global|estimad[oa]|máxim[oa]|referência)\s*(?:de|:)?\s*)(R\$\s*[\d.,]+)/gi, 14],
    [/valor[^R]{0,80}(R\$\s*[\d.,]+)/gi, 10],
  ];

  for (const [pattern, boost] of patterns) {
    for (const match of norm.matchAll(pattern)) {
      const raw = match[1]?.trim();
      const num = parsePtBrNumber(raw);
      if (isNaN(num) || num < 100) continue;
      const valueBoost = num > 1000000 ? 4 : num > 100000 ? 2 : 0;
      candidates.push({ amount: num, score: boost + valueBoost });
    }
  }
  if (candidates.length === 0) return "Não informado no edital";
  candidates.sort((a, b) => b.score - a.score);
  return formatCurrencyBRL(candidates[0].amount);
}

function extractDataSessao(text: string): string {
  const labeledPatterns = [
    /(?:data\s+(?:e\s+hor[áa]rio?\s+)?(?:da\s+)?sessão\s+pública|data\s+(?:e\s+hor[áa]rio?\s+)?(?:de\s+)?abertura|sessão\s+pública|abertura\s+d[aoe]s?\s+propostas?|abertura\s+d[ao]\s+certame|data\s+d[aoe]\s+sessão|data\s+d[aoe]\s+certame|início\s+da\s+sessão)\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})\s*[,;]?\s*(?:às?|a\s+partir\s+de)?\s*(\d{1,2}\s*[h:]\s*\d{0,2})?/gi,
  ];
  for (const pattern of labeledPatterns) {
    for (const match of text.matchAll(pattern)) {
      const date = match[1]?.replace(/\s/g, '');
      const time = match[2]?.replace(/\s/g, '') || '';
      if (date) return time ? `${date} às ${time}` : date;
    }
  }
  return "Não identificado";
}

function extractPlanilha(text: string): string {
  const context = buildPlanilhaExtractionContext(text);
  const section = extractSection(
    context,
    [
      /(?:PLANILHA|QUADRO|TABELA)\s+(?:DE\s+)?(?:PREÇOS?|ESTIMATIV|QUANTITATIV|ORÇAMENT|ITENS|CUSTOS)/i,
      /(?:ANEXO\s+(?:\d+|I{1,3}|[A-Z])\s*[-–—]?\s*(?:PLANILHA|PREÇOS?|ITENS|CUSTOS))/i,
    ],
    [/\n\s*(?:ANEXO\s+\d+\b|CAPÍTULO|SEÇÃO|\d+[\.\)]\s+(?:D[AO]S?\s+)|--- TRECHO RELEVANTE ---)/i],
    7000
  );
  if (section) return section.slice(0, 2500);

  const relevantLines = context
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /(?:^\d{1,3}\b.*(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$)|(?:planilha|preço\s+unitário|preco\s+unitario|preço\s+total|preco\s+total|quantidade|valor\s+total)/i.test(line));

  if (relevantLines.length > 0) return relevantLines.slice(0, 25).join("\n");
  return "Não disponível no edital";
}

function extractTimeline(text: string) {
  const pub = firstMatch(text, [
    /(?:data\s+(?:de\s+)?publicação|publicad[oa]\s+em|publicação\s+(?:no\s+)?(?:DOE|DOU|diário))\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ]);
  const imp = firstMatch(text, [
    /(?:impugnação|impugnar)\s*[^.]*?(?:até|prazo[^.]*?)\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /(?:prazo\s+(?:para\s+)?impugnação)\s*[:.]?\s*(?:até\s+)?(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ]);
  const esc = firstMatch(text, [
    /(?:esclarecimento|pedido\s+de\s+esclarecimento)\s*[^.]*?(?:até|prazo[^.]*?)\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ]);
  const abertura = firstMatch(text, [
    /(?:sessão\s+pública|abertura\s+d[aoe]s?\s+propostas?|data\s+d[aoe]\s+sessão)\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4}(?:\s*[,;]?\s*(?:às?|a\s+partir)?\s*\d{1,2}\s*[h:]\s*\d{0,2})?)/i,
  ]);
  return {
    data_publicacao: pub?.replace(/\s/g, '') || null,
    prazo_impugnacao: imp?.replace(/\s/g, '') || null,
    prazo_esclarecimento: esc?.replace(/\s/g, '') || null,
    data_abertura: abertura?.replace(/\s+/g, ' ').trim() || null,
  };
}

// ══════════════════════════════════════════════════════════════
// ── AI GATEWAY HELPER ──
// ══════════════════════════════════════════════════════════════

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string, tool: unknown, maxTokens = 8192): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: (tool as any).function.name } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI gateway error ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(data).slice(0, 500));
      return null;
    }

    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.error("AI call failed:", e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── CALL 1: METADATA (objeto, órgão, modalidade, datas, valores) ──
// ══════════════════════════════════════════════════════════════

const METADATA_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_metadata",
    description: "Extrai metadados básicos de um edital de licitação",
    parameters: {
      type: "object",
      properties: {
        objeto: { type: "string", description: "Descrição do objeto (o que é contratado/adquirido). Elimine referências a leis/decretos. Foque no bem/serviço/obra. Max 500 chars." },
        orgao: { type: "string", description: "Nome completo do órgão/entidade promotora. NUNCA confunda com plataforma de compras." },
        modalidade: { type: "string", description: "Modalidade: 'Pregão eletrônico', 'Concorrência eletrônica', etc." },
        criterio_julgamento: { type: "string", description: "Critério: 'Menor preço por item', 'Menor preço global por lote', etc. Inclua unidade." },
        sistema_licitacao: { type: "string", description: "Plataforma eletrônica: 'ComprasGov (compras.gov.br)', 'BEC/SP', 'Licitações-e', etc. Se genérico, retorne 'Não identificado no edital'." },
        participacao: { type: "string", enum: ["Exclusiva ME/EPP", "Ampla concorrência", "Não identificado no edital"] },
        unidade_disputa: { type: "string", enum: ["Por item", "Por lote", "Global", "Não identificado no edital"] },
        modo_disputa: { type: "string", enum: ["aberto", "fechado", "aberto e fechado", "nao_identificado"], description: "SOMENTE se expresso no edital." },
        numero_edital: { type: "string", description: "Número completo com ano. Ex: 'PE 001/2025'." },
        valor_estimado: { type: "string", description: "Valor TOTAL/GLOBAL no formato R$ X.XXX,XX. Se sigiloso: 'Não informado no edital'." },
        data_sessao: { type: "string", description: "Data e hora da sessão. Ex: '15/07/2025 às 09h00'." },
        data_publicacao: { type: ["string", "null"] },
        prazo_impugnacao: { type: ["string", "null"] },
        prazo_esclarecimento: { type: ["string", "null"] },
        is_srp: { type: "boolean", description: "É Sistema de Registro de Preços?" },
        preco_maximo: { type: "boolean", description: "Há preço máximo declarado?" },
        exclusividade_meepp: { type: "boolean" },
      },
      required: ["objeto", "orgao", "modalidade", "criterio_julgamento", "sistema_licitacao", "participacao", "unidade_disputa", "modo_disputa", "numero_edital", "valor_estimado", "data_sessao", "data_publicacao", "prazo_impugnacao", "prazo_esclarecimento", "is_srp", "preco_maximo", "exclusividade_meepp"],
      additionalProperties: false,
    },
  },
};

// ══════════════════════════════════════════════════════════════
// ── CALL 2: RESTRICTIONS & TRUTHS (consórcio, cooperativas, amostra, etc.) ──
// ══════════════════════════════════════════════════════════════

const RESTRICTIONS_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_restrictions",
    description: "Extrai restrições, vedações e exigências específicas do edital",
    parameters: {
      type: "object",
      properties: {
        consorcio: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
            trecho_fonte: { type: "string", description: "Transcreva o trecho EXATO do edital que fundamenta a resposta. Max 200 chars. Se não encontrou, escreva 'Não localizado'." },
          },
          required: ["status", "trecho_fonte"],
        },
        cooperativas: {
          type: "object",
          properties: {
            vedacao: { type: "string", enum: ["todas", "trabalho", "nao", "nao_identificado"], description: "'trabalho' se veda SOMENTE cooperativas de trabalho. 'todas' se veda TODAS as cooperativas. 'nao' se permite. 'nao_identificado' se omisso." },
            trecho_fonte: { type: "string", description: "Transcreva o trecho EXATO. Max 200 chars." },
          },
          required: ["vedacao", "trecho_fonte"],
        },
        subcontratacao: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
            trecho_fonte: { type: "string", description: "Transcreva o trecho EXATO. Max 200 chars." },
          },
          required: ["status", "trecho_fonte"],
        },
        amostra: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sim", "nao", "nao_identificado"], description: "'sim' se amostra OBRIGATORIAMENTE exigida, 'nao' se dispensada, 'nao_identificado' se omisso ou inconclusivo." },
            trecho_fonte: { type: "string" },
          },
          required: ["status", "trecho_fonte"],
        },
        garantia_execucao: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
            trecho_fonte: { type: "string" },
          },
          required: ["status", "trecho_fonte"],
        },
        catalogo_exigido: { type: "boolean" },
        marca_modelo_exigido: { type: "boolean" },
        habilitacao: { type: "string", description: "Resumo dos documentos por categoria com emojis: 📜 Jurídica, 🏦 Fiscal, 🔧 Técnica, 📊 Econômica, 📝 Declarações. Cada categoria em linha separada." },
      },
      required: ["consorcio", "cooperativas", "subcontratacao", "amostra", "garantia_execucao", "catalogo_exigido", "marca_modelo_exigido", "habilitacao"],
      additionalProperties: false,
    },
  },
};

// ══════════════════════════════════════════════════════════════
// ── CALL 3: PRICING SPREADSHEET ──
// ══════════════════════════════════════════════════════════════

const PLANILHA_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_planilha",
    description: "Extrai a planilha/quadro estimativo de preços do edital",
    parameters: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          description: "Extraia TODOS os itens/lotes da planilha de preços. Se não existir planilha, retorne array vazio.",
          items: {
            type: "object",
            properties: {
              item: { type: "string", description: "Número do item ou lote" },
              descricao: { type: "string", description: "Descrição resumida (max 120 chars)" },
              unidade: { type: "string", description: "Unidade: 'UN', 'KG', 'M²', 'Serviço', etc." },
              quantidade: { type: "string" },
              valor_unitario: { type: "string", description: "R$ X.XXX,XX ou 'N/D'" },
              valor_total: { type: "string", description: "R$ X.XXX,XX ou 'N/D'" },
            },
            required: ["item", "descricao", "unidade", "quantidade", "valor_unitario", "valor_total"],
          },
        },
      },
      required: ["itens"],
      additionalProperties: false,
    },
  },
};

// ══════════════════════════════════════════════════════════════
// ── VALIDATION CALL ──
// ══════════════════════════════════════════════════════════════

const VALIDATION_TOOL = {
  type: "function" as const,
  function: {
    name: "validate_extraction",
    description: "Valida os dados extraídos contra o texto do edital, corrigindo inconsistências",
    parameters: {
      type: "object",
      properties: {
        corrections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              campo: { type: "string", description: "Nome do campo corrigido" },
              valor_original: { type: "string" },
              valor_corrigido: { type: "string" },
              justificativa: { type: "string", description: "Por que o valor original está errado, citando trecho do edital" },
            },
            required: ["campo", "valor_original", "valor_corrigido", "justificativa"],
          },
        },
        cooperativas_vedacao_validado: { type: "string", enum: ["todas", "trabalho", "nao", "nao_identificado"], description: "Resultado VALIDADO. 'trabalho' = vedação APENAS a cooperativas de trabalho. 'todas' = vedação a TODAS as cooperativas." },
        consorcio_validado: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
        amostra_validado: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
        subcontratacao_validado: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
        garantia_validado: { type: "string", enum: ["sim", "nao", "nao_identificado"] },
        modo_disputa_validado: { type: "string", enum: ["aberto", "fechado", "aberto e fechado", "nao_identificado"] },
        objeto_validado: { type: "string", description: "Objeto validado e corrigido se necessário" },
        orgao_validado: { type: "string" },
      },
      required: ["corrections", "cooperativas_vedacao_validado", "consorcio_validado", "amostra_validado", "subcontratacao_validado", "garantia_validado", "modo_disputa_validado", "objeto_validado", "orgao_validado"],
      additionalProperties: false,
    },
  },
};

// ══════════════════════════════════════════════════════════════
// ── FEATURE DETECTION (regex-based contextual features) ──
// ══════════════════════════════════════════════════════════════

function detectFeatures(text: string) {
  return {
    isExclusivoMEEPP: /exclusiv[oa]\s*(para\s+)?(me|epp|microempresa|empresa\s+de\s+pequeno)/i.test(text),
    isSRP: /registro\s+de\s+preços|ata\s+de\s+registro/i.test(text),
    hasGarantia: /garantia\s+(de\s+)?(execução|contratual)|seguro[\-\s]garantia/i.test(text),
    hasGarantiaProduto: /garantia\s+(?:do\s+)?(?:produto|equipamento|material|bem|mercadoria)/i.test(text),
    hasVisitaTecnica: /visita\s+técnica/i.test(text),
    hasAmostra: /amostra/i.test(text) && !/sem\s+amostra/i.test(text),
    hasConsorcio: /consórcio/i.test(text),
    hasSubcontratacao: /subcontrata/i.test(text),
    subcontratacaoVedada: /(?:não\s+(?:será|é|serão)\s+(?:admitid|permitid|autorizada|aceit)|veda(?:da|do|r)|proibid)\w*\s+(?:a\s+)?subcontrata/i.test(text),
    subcontratacaoPermitida: /subcontrata(?:ção|r)\s+(?:será\s+)?(?:autorizada|permitida|admitida|prevista)/i.test(text),
    hasSustentabilidade: /sustentabilidade|ambiental|iso\s*14/i.test(text),
    hasProvaConceito: /prova\s+de\s+conceito/i.test(text),
    hasPenalidades: /penalidade|sanç[ãõ][oe]s|multa|impedimento|declaração\s+de\s+inidoneidade/i.test(text),
    hasPrazoExecucao: firstMatch(text, [
      /prazo\s+(?:de\s+)?(?:execução|vigência|entrega|fornecimento)\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?|anos?)(?:\s*(?:úteis|corridos|consecutivos))?)/i,
    ]),
    hasProrrogacao: /prorrog/i.test(text),
    hasReajuste: /reajust[eao]/i.test(text),
    hasPagamento: firstMatch(text, [
      /(?:pagamento|pagar)\s*(?:será\s+(?:efetuado|realizado)\s+)?(?:em\s+até\s+)?(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos))?)/i,
    ]),
    hasImpugnacao: /impugna/i.test(text),
    hasRecurso: /recurso/i.test(text),
    beneficioMEEPP: /tratamento\s+diferenciado|lei\s+complementar\s+(?:n[°º.]?\s*)?123|cota\s+reservada|exclusiv/i.test(text),
    isServicoContinuado: /serviço\s+(?:de\s+natureza\s+)?continu/i.test(text),
    hasMatrizRisco: /matriz\s+de\s+risco/i.test(text),
    hasEstudoTecnico: /estudo\s+técnico\s+preliminar|etp/i.test(text),
    hasDotacaoOrcamentaria: /dotação\s+orçamentária|recurso\s+orçamentário/i.test(text),
    regimeTributario: firstMatch(text, [
      /regime\s+(?:de\s+)?(?:execução|contratação)\s*[:.]?\s*(empreitada\s+(?:por\s+preço\s+(?:global|unitário))|tarefa|contratação\s+integrada)/i,
    ]),
    localEntrega: firstMatch(text, [
      /(?:local\s+(?:de\s+)?(?:entrega|execução|prestação))\s*[:.]?\s*([^\n]{15,150})/i,
    ]),
    vedacaoConsorcio: /(?:não\s+(?:será|serão)\s+(?:admitid|permitid|aceit)|veda(?:da|do)|proibid)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i.test(text),
    vedacaoCooperativas: false, // Will be set by AI
    hasSICAF: /sicaf/i.test(text),
    hasCAUFESP: /caufesp/i.test(text),
    hasCadastroPreObrigatorio: /cadastr(?:o|amento)\s+(?:prévio|obrigatório|no\s+(?:sicaf|portal|sistema))/i.test(text),
    hasCredenciamento: /credenciamento/i.test(text),
    hasMarcaModelo: /marca|modelo|fabricante/i.test(text) && /proposta|oferta|cotação/i.test(text),
    hasCatalogo: /catálogo|ficha\s+técnica|laudo/i.test(text),
    hasPrecoMaximo: /preço\s+(?:máximo|unitário\s+máximo|de\s+referência)|valor\s+(?:máximo|de\s+referência)/i.test(text),
    validadeProposta: firstMatch(text, [
      /validade\s+d[aoe]s?\s+propostas?\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?))/i,
    ]),
    prazoAssinatura: firstMatch(text, [
      /prazo\s+(?:para\s+)?(?:assinatura|celebração)\s+(?:do\s+)?contrato\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos))?)/i,
    ]),
    prazoEntrega: firstMatch(text, [
      /prazo\s+(?:de\s+)?entrega\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos|consecutivos|após\s+[^\n]{0,60})?)?)/i,
    ]),
    prazoSubstituicao: firstMatch(text, [
      /(?:substituição|troca|reposição)\s+(?:do[s]?\s+)?(?:produto|material|bem|equipamento|item)[^.]{0,80}(?:em\s+até|no\s+prazo\s+de)\s+(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos))?)/i,
    ]),
    propostaReadequada: /proposta\s+(?:readequada|ajustada|adequada)|readequação\s+(?:da|de)\s+proposta/i.test(text),
    hasModoDisputaAberto: /modo\s+de\s+disputa\s*[:.]?\s*aberto/i.test(text) || /disputa\s+abert/i.test(text),
    hasModoDisputaFechado: /modo\s+de\s+disputa\s*[:.]?\s*fechado/i.test(text) || /disputa\s+fechad/i.test(text),
    hasModoAbFechado: /aberto[\s\-]+e[\s\-]+fechado|aberto[\s\-]+fechado/i.test(text),
    hasNegociacao: /negocia(?:ção|r)/i.test(text),
    hasDesempate: /desempate|empate/i.test(text),
    hasLC123: /lei\s+complementar\s+(?:n[°º.]?\s*)?123/i.test(text),
    hasMulta: (() => {
      const m = text.match(/multa\s+(?:de\s+)?(?:até\s+)?(\d+[,.]?\d*\s*%\s*\([^)]{0,80}\))/i)
        || text.match(/multa\s+(?:de\s+)?(?:até\s+)?(\d+[,.]?\d*\s*%)/i);
      if (!m) return null;
      return m[1].trim().replace(/\s+/g, ' ');
    })(),
    hasImpedimentoSancao: /impedid[oa]\s+de\s+licitar|declarad[oa]\s+inid[ôo]ne[oa]/i.test(text),
    hasCotaReservada: /cota\s+reservada/i.test(text),
    inicioPropostas: firstMatch(text, [
      /(?:início|inicio|recebimento)\s+(?:d[ao]s?\s+)?(?:envio\s+(?:d[ao]s?\s+)?)?propostas?\s*[:.]?\s*(?:a\s+partir\s+(?:de|do\s+dia)\s+)?(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    ]),
    prazoDocComplementar: firstMatch(text, [
      /(?:document(?:o|os|ação)\s+complementar|habilitação\s+complementar)[^.]{0,80}(?:em\s+até|no\s+prazo\s+de)\s+(\d+\s*(?:dias?|horas?)(?:\s*(?:úteis|corridos))?)/i,
    ]),
    prazoRecurso: firstMatch(text, [
      /prazo\s+(?:para\s+)?recurso\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|horas?)(?:\s*(?:úteis|corridos))?)/i,
    ]),
  };
}

// ── Truth validation helpers ──
function truthCheck(text: string, positivePatterns: RegExp[], negativePatterns: RegExp[]): "sim" | "nao" | "nao_identificado" {
  for (const neg of negativePatterns) { if (neg.test(text)) return "nao"; }
  for (const pos of positivePatterns) { if (pos.test(text)) return "sim"; }
  return "nao_identificado";
}

function resolveAITruth(
  aiValue: string | undefined,
  text: string,
  positivePatterns: RegExp[],
  negativePatterns: RegExp[],
): "sim" | "nao" | "nao_identificado" {
  if (aiValue === "sim" || aiValue === "nao") return aiValue;
  return truthCheck(text, positivePatterns, negativePatterns);
}

function normalizeSistemaLicitacao(aiValue: string | undefined, text: string): string {
  const cleaned = (aiValue || "").trim();
  const mappings = [
    { pattern: /compras\.?gov(?:\.br)?|sistema\s+de\s+compras\s+do\s+governo\s+federal|portal\s+de\s+compras\s+do\s+governo\s+federal/i, value: "ComprasGov (compras.gov.br)" },
    { pattern: /\bbec\s*\/\s*sp\b/i, value: "BEC/SP" },
    { pattern: /licita(?:ç|c)ões?-e|licitacoes-e/i, value: "Licitações-e" },
  ] as const;
  const inferredFromText = mappings.find(({ pattern }) => pattern.test(text))?.value;
  if (!cleaned || /^(não|nao)\s+identificado/i.test(cleaned)) return inferredFromText || "Não identificado no edital";
  if (/^(sistema|portal|plataforma|site|sítio\s+eletrônico)$/i.test(cleaned)) return inferredFromText || "Não identificado no edital";
  return mappings.find(({ pattern }) => pattern.test(cleaned))?.value || cleaned;
}

// ── Complexity Score ──
function getFaixa(score: number): string {
  if (score <= 2) return "muito simples";
  if (score <= 4) return "simples";
  if (score <= 6) return "moderado";
  if (score <= 8) return "complexo";
  return "muito complexo";
}

function calcularComplexidade(text: string, dados: Record<string, string>, aiTruth?: Record<string, string>): {
  valor: number; faixa: string; justificativa: string; fatores_elevaram: string[]; fatores_impediram: string[]; frase_faixa: string;
} {
  const modalidadeExtraida = (dados.modalidade || "").toLowerCase();
  const isPregao = /pregão|pregao/.test(modalidadeExtraida);
  const isConcorrencia = /concorrência|concorrencia/.test(modalidadeExtraida);
  const isBensComuns = /\b(aquisição|fornecimento|compra|material|bens?\s+comun|bens?\s+de\s+consumo|equipamento)\b/i.test(text)
    && !/\b(serviço\s+(?:de\s+natureza\s+)?continu|execução\s+de\s+obras?|obra)\b/i.test(text);
  const isMenorPreco = /menor\s+preço/i.test(text);
  const isPregaoBensComuns = isPregao && isBensComuns && isMenorPreco;

  let score = isPregaoBensComuns ? 2.5 : isConcorrencia ? 4 : 3;
  const fatoresElevaram: string[] = [];
  const fatoresImpediram: string[] = [];
  let strongAggravators = 0;

  const addStrong = (points: number, label: string) => { score += points; fatoresElevaram.push(label); strongAggravators++; };

  if (isConcorrencia) { score += 0.5; fatoresElevaram.push("Modalidade concorrência"); strongAggravators++; }

  const amostraExplicita = /(?:deverá|deve|será\s+(?:obrigatóri|exigid))\w*\s+(?:a?\s+)?(?:apresent|entreg)\w*\s+(?:de\s+)?amostra/i.test(text);
  const amostraNegada = /(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i.test(text);
  if (amostraExplicita && !amostraNegada) addStrong(1.2, "Amostra exigida");

  if (/atestado[^.]{0,200}(?:comprovan|demonstran)[^.]{0,200}(?:no\s+mínimo|pelo\s+menos)\s*\d/i.test(text)) addStrong(0.8, "Qualificação técnica robusta");
  else if (/(?:crea|cau|registro\s+(?:no\s+)?conselho)/i.test(text)) { score += 0.3; fatoresElevaram.push("Registro em conselho profissional"); }

  if (/garantia\s+(?:de\s+)?(?:execução|contratual)\s+(?:será|deverá|é)\s+(?:exigid|apresentad|prestad)/i.test(text)
    && !/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+garantia/i.test(text)) addStrong(0.8, "Garantia de execução exigida");

  if (/visita\s+técnica\s+(?:obrigatória|será\s+obrigatória)/i.test(text)) addStrong(0.6, "Visita técnica obrigatória");
  if (/serviço\s+(?:de\s+natureza\s+)?continu/i.test(text) && /(?:sla|nível\s+de\s+serviço)/i.test(text)) addStrong(0.8, "Serviço continuado com SLA");
  else if (/serviço\s+(?:de\s+natureza\s+)?continu/i.test(text)) { score += 0.4; fatoresElevaram.push("Serviço continuado"); }
  if (/técnica\s+e\s+preço/i.test(text)) addStrong(1.2, "Técnica e preço");
  if (/prova\s+de\s+conceito/i.test(text)) addStrong(0.8, "Prova de conceito");

  const multaMatch = text.match(/multa\s+(?:de\s+)?((?:\d+[,.]?\d*)\s*%)/i);
  const multaPercent = multaMatch ? parseFloat(multaMatch[1].replace(",", ".")) : 0;
  if (multaPercent >= 15) addStrong(0.6, `Multa de ${multaPercent}%`);
  else if (multaPercent >= 10) { score += 0.2; fatoresElevaram.push(`Multa de ${multaPercent}%`); }

  if (/execução\s+de\s+obras?/i.test(text) || /\b(bdi|composição\s+de\s+custos)\b/i.test(text)) addStrong(1.2, "Forte densidade técnica");

  if (/propost[ao]\s+(?:readequada|ajustada)/i.test(text)) { score += 0.2; fatoresElevaram.push("Proposta readequada exigida"); }
  if (/(?:catálogo|ficha\s+técnica|laudo)\s+(?:deverá|será|deve)/i.test(text)) { score += 0.2; fatoresElevaram.push("Catálogo/ficha técnica exigido"); }

  const valorStr = dados.valor_estimado?.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const valorNum = parseFloat(valorStr || "0");
  if (valorNum > 50000000) { score += 0.5; fatoresElevaram.push("Valor acima de R$ 50 milhões"); }
  else if (valorNum > 10000000) { score += 0.3; fatoresElevaram.push("Valor acima de R$ 10 milhões"); }

  const subPermitida = aiTruth ? aiTruth.subcontratacao === "sim" : false;
  if (subPermitida) { score += 0.2; fatoresElevaram.push("Prevê subcontratação"); }

  if (isPregaoBensComuns && strongAggravators < 2 && score > 5.5) {
    score = 5.5;
    fatoresImpediram.push("Pregão de bens comuns sem dois agravantes fortes — nota limitada a 5,5");
  }

  if (!amostraExplicita || amostraNegada) fatoresImpediram.push("Sem exigência de amostra eliminatória");
  if (!/garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) fatoresImpediram.push("Sem exigência de garantia contratual");
  if (!/visita\s+técnica\s+obrigatória/i.test(text)) fatoresImpediram.push("Sem visita técnica obrigatória");
  if (!/técnica\s+e\s+preço/i.test(text)) fatoresImpediram.push("Julgamento não é por técnica e preço");
  if (isPregaoBensComuns) fatoresImpediram.push("Pregão eletrônico de bens comuns");

  score = Math.min(10, Math.max(1, Math.round(score * 2) / 2));
  const faixa = getFaixa(score);
  const justificativa = fatoresElevaram.length > 0
    ? `Score ${score}/10 (${faixa}). Fatores: ${fatoresElevaram.join("; ")}.`
    : `Score ${score}/10 (${faixa}). Sem agravantes fortes.`;
  const modalidadeLabel = isConcorrencia ? "Concorrência" : isPregao ? "Pregão eletrônico" : (dados.modalidade || "Edital");
  const fraseFaixa = isPregaoBensComuns && score <= 5
    ? `Pregão eletrônico padrão de bens comuns — classificado como ${faixa}.`
    : `${modalidadeLabel} classificado como ${faixa} com ${strongAggravators} agravante(s) forte(s).`;

  return { valor: score, faixa, justificativa, fatores_elevaram: fatoresElevaram, fatores_impediram: fatoresImpediram, frase_faixa: fraseFaixa };
}

// ── Utility helpers ──
function lowercaseFirst(value: string): string { return value ? value.charAt(0).toLowerCase() + value.slice(1) : value; }
function buildCriterionHint(criterio: string): string | null {
  const v = criterio.toLowerCase();
  if (v.includes("menor preço global")) return "vence a proposta mais barata para o valor total do objeto.";
  if (v.includes("menor preço por item")) return "cada item pode ser vencido por uma empresa diferente.";
  if (v.includes("menor preço por lote")) return "vence o menor valor para cada lote.";
  if (v.includes("maior desconto")) return "vence quem oferecer o maior desconto.";
  if (v.includes("técnica e preço")) return "preço não basta: a nota técnica também pesa.";
  if (v.includes("melhor técnica")) return "a qualidade técnica é o ponto central.";
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── RESUMO EM LINGUAGEM SIMPLES (16 seções) ──
// ══════════════════════════════════════════════════════════════

function gerarResumoSimples(dados: Record<string, string>, timeline: Record<string, string | null>): string {
  const fullText = dados._fullText || "";
  const feat = detectFeatures(fullText);
  const sections: string[] = [];

  const orgao = dados.orgao !== "Não identificado" ? dados.orgao : "Órgão não identificado";
  const modalidade = dados.modalidade !== "Não identificado" ? dados.modalidade : "Modalidade não identificada";
  const objeto = dados.objeto !== "Não identificado no edital" ? dados.objeto : null;
  const criterio = dados.criterio !== "Não identificado" ? dados.criterio : null;
  const valor = dados.valor_estimado !== "Não informado no edital" ? dados.valor_estimado : null;
  const sessao = dados.data_sessao !== "Não identificado" ? dados.data_sessao : timeline.data_abertura;
  const sistema = dados.sistema && !/^(não|nao)\s+identificado/i.test(dados.sistema) ? dados.sistema : null;
  const criterioHint = criterio ? buildCriterionHint(criterio) : null;

  // Truth validations
  const consorcioStatus = dados._v_consorcio as "sim" | "nao" | "nao_identificado" || "nao_identificado";
  const exclusividadeMEEPP = dados._ai_exclusividade_meepp === "true" ? "sim" as const : "nao_identificado" as const;
  const garantiaExecucao = dados._v_garantia as "sim" | "nao" | "nao_identificado" || "nao_identificado";
  const srpStatus = dados._ai_srp === "true" ? "sim" as const : "nao_identificado" as const;
  const amostraStatus = dados._v_amostra as "sim" | "nao" | "nao_identificado" || "nao_identificado";
  const subcontratacaoStatus = dados._v_subcontratacao as "sim" | "nao" | "nao_identificado" || "nao_identificado";
  const catalogoStatus = dados._ai_catalogo === "true" ? "sim" as const : "nao_identificado" as const;
  const marcaModeloStatus = dados._ai_marca_modelo === "true" ? "sim" as const : "nao_identificado" as const;
  let precoMaximoStatus: "sim" | "nao" | "nao_identificado" = dados._ai_preco_maximo === "true" ? "sim" : "nao_identificado";
  if (precoMaximoStatus === "nao_identificado" && valor) precoMaximoStatus = "sim";

  // Cooperativas
  const cooperativasVedacao = dados._v_cooperativas || "nao_identificado";
  if (cooperativasVedacao === "trabalho" || cooperativasVedacao === "todas") feat.vedacaoCooperativas = true;

  // Subcontratacao override
  if (subcontratacaoStatus === "sim") { feat.subcontratacaoPermitida = true; feat.subcontratacaoVedada = false; }
  if (subcontratacaoStatus === "nao") { feat.subcontratacaoVedada = true; feat.subcontratacaoPermitida = false; }

  const prazoAssinaturaVal = feat.prazoAssinatura || null;
  const prazoEntregaVal = feat.prazoEntrega || null;

  // Disputa unit
  const disputaUnit = (() => {
    if (/(?:por\s+item|menor\s+preço\s+(?:por\s+)?item)/i.test(fullText)) return "por item";
    if (/(?:por\s+lote|menor\s+preço\s+(?:por\s+)?lote)/i.test(fullText)) return "por lote";
    if (/(?:por\s+grupo|menor\s+preço\s+(?:por\s+)?grupo)/i.test(fullText)) return "por grupo";
    if (/\bglobal\b/i.test(fullText) && /menor\s+preço/i.test(fullText)) return "global";
    return null;
  })();

  // Modo de disputa (validated)
  const modoDisputa = dados._v_modo_disputa && dados._v_modo_disputa !== "nao_identificado"
    ? dados._v_modo_disputa
    : (feat.hasModoAbFechado ? "aberto e fechado" : feat.hasModoDisputaAberto ? "aberto" : feat.hasModoDisputaFechado ? "fechado" : null);

  // ── 1. VISÃO GERAL DO EDITAL ──
  {
    const p: string[] = [];
    let intro = `${orgao} está promovendo ${modalidade.toLowerCase()}`;
    if (objeto) intro += ` para ${lowercaseFirst(objeto)}`;
    intro += ".";
    p.push(intro);
    if (criterio) {
      let c = `O critério de julgamento é ${criterio.toLowerCase()}`;
      if (disputaUnit) c += ` (disputa ${disputaUnit})`;
      if (criterioHint) c += ` — ou seja, ${criterioHint}`;
      else c += ".";
      p.push(c);
    }
    if (srpStatus === "sim") p.push("Trata-se de sistema de registro de preços.");
    if (exclusividadeMEEPP === "sim") p.push("Participação exclusiva para ME/EPP.");
    if (sistema) p.push(`Disputa na plataforma ${sistema}.`);
    if (sessao) p.push(`Sessão pública: ${sessao}.`);
    if (valor) p.push(`Valor estimado: ${valor}.`);
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    if (score >= 7) p.push("Edital com diversas exigências que demandam atenção.");
    else if (score >= 5) p.push("Edital com exigências padrão.");
    else p.push("Edital com requisitos habituais.");
    sections.push(`📌 1. VISÃO GERAL DO EDITAL\n\n${p.join(" ")}`);
  }

  // ── 2. EM UMA FRASE ──
  {
    let frase = "Este edital trata ";
    if (objeto) frase += `de ${lowercaseFirst(objeto)}`;
    else frase += "de contratação pública";
    frase += `, por ${modalidade.toLowerCase()}`;
    if (criterio) frase += `, com julgamento por ${criterio.toLowerCase()}`;
    if (disputaUnit) frase += ` ${disputaUnit}`;
    frase += `, promovido por ${orgao}.`;
    sections.push(`💬 2. EM UMA FRASE\n\n${frase}`);
  }

  // ── 3. LEITURA IMEDIATA ──
  {
    const pontos: string[] = [];
    if (exclusividadeMEEPP === "sim") pontos.push("• Participação exclusiva para ME/EPP.");
    else pontos.push("• Participação ampla.");
    if (consorcioStatus === "nao") pontos.push("• Consórcio vedado.");
    else if (consorcioStatus === "sim") pontos.push("• Consórcio admitido.");
    else pontos.push("• Consórcio: não identificado de forma expressa.");
    if (feat.hasSICAF) pontos.push("• Cadastro no SICAF exigido.");
    if (feat.hasCAUFESP) pontos.push("• Cadastro no CAUFESP exigido.");
    if (feat.hasCredenciamento) pontos.push("• Credenciamento prévio exigido.");
    if (disputaUnit) pontos.push(`• Disputa ${disputaUnit}.`);
    if (amostraStatus === "sim") pontos.push("• Amostra exigida.");
    else if (amostraStatus === "nao") pontos.push("• Amostra não exigida.");
    if (catalogoStatus === "sim") pontos.push("• Catálogo/ficha técnica exigido.");
    if (marcaModeloStatus === "sim") pontos.push("• Indicação de marca/modelo na proposta.");
    if (feat.validadeProposta) pontos.push(`• Validade da proposta: ${feat.validadeProposta}.`);
    if (prazoEntregaVal) pontos.push(`• Prazo de entrega: ${prazoEntregaVal}.`);
    if (garantiaExecucao === "sim") pontos.push("• Garantia contratual exigida.");
    else if (garantiaExecucao === "nao") pontos.push("• Garantia contratual não exigida.");
    if (feat.hasGarantiaProduto) pontos.push("• Garantia do produto exigida.");
    if (precoMaximoStatus === "sim") pontos.push("• Preço máximo de referência.");
    if (feat.hasMulta) pontos.push(`• Multa prevista: ${feat.hasMulta}.`);
    if (prazoAssinaturaVal) pontos.push(`• Prazo para assinatura: ${prazoAssinaturaVal}.`);
    if (feat.propostaReadequada) pontos.push("• Proposta readequada exigida após lances.");
    if (srpStatus === "sim") pontos.push("• Registro de preços.");
    if (feat.hasVisitaTecnica) pontos.push("• Visita técnica exigida.");
    sections.push(`⚡ 3. LEITURA IMEDIATA PARA O LICITANTE\n\n${pontos.join("\n")}`);
  }

  // ── 4. DIAGNÓSTICO EXECUTIVO ──
  {
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    const faixa = dados._scoreFaixa || getFaixa(score);
    const diag: string[] = [];
    diag.push(`Avaliação geral: complexidade **${faixa}** (score ${score}/10).`);
    const barreiras: string[] = [];
    if (amostraStatus === "sim") barreiras.push("amostra");
    if (feat.hasVisitaTecnica) barreiras.push("visita técnica obrigatória");
    if (garantiaExecucao === "sim") barreiras.push("garantia contratual");
    if (feat.hasSICAF || feat.hasCAUFESP) barreiras.push("cadastro prévio");
    diag.push(barreiras.length > 0 ? `Barreiras de entrada: ${barreiras.join(", ")}.` : "Sem barreiras de entrada atípicas.");
    const elim: string[] = ["documentação incompleta"];
    if (amostraStatus === "sim") elim.push("amostra reprovada");
    if (precoMaximoStatus === "sim") elim.push("proposta acima do teto");
    diag.push(`Pontos eliminatórios: ${elim.join("; ")}.`);
    if (garantiaExecucao === "sim" || feat.hasPagamento) {
      const c: string[] = [];
      if (garantiaExecucao === "sim") c.push("garantia contratual");
      if (feat.hasPagamento) c.push(`pagamento em ${feat.hasPagamento}`);
      diag.push(`Planejamento financeiro: ${c.join("; ")}.`);
    }
    sections.push(`🔍 4. DIAGNÓSTICO EXECUTIVO\n\n${diag.join("\n\n")}`);
  }

  // ── 5. O QUE ESTÁ SENDO COMPRADO ──
  if (objeto) {
    sections.push(`🛒 5. O QUE ESTÁ SENDO COMPRADO\n\n${objeto}\n\n${srpStatus === "sim" ? "Registro de preços: contratação conforme demanda." : "Contratação formalizada após homologação."}`);
  } else {
    sections.push(`🛒 5. O QUE ESTÁ SENDO COMPRADO\n\nNão identificado. Conferir no documento original.`);
  }

  // ── 6. COMO A DISPUTA FUNCIONA ──
  {
    const d: string[] = [];
    d.push(`• Modalidade: ${modalidade}.`);
    if (criterio) d.push(`• Critério: ${criterio}.`);
    if (disputaUnit) d.push(`• Unidade da disputa: ${disputaUnit}.`);
    if (modoDisputa) d.push(`• Modo de disputa: ${modoDisputa}.`);
    else d.push("• Modo de disputa: não identificado de forma expressa.");
    if (feat.hasLC123 || feat.beneficioMEEPP) d.push("• Tratamento diferenciado ME/EPP (LC 123/2006).");
    if (feat.hasNegociacao) d.push("• Negociação prevista após lances.");
    if (feat.hasDesempate) d.push("• Regras de desempate previstas.");
    if (precoMaximoStatus === "sim" && valor) d.push(`• Preço máximo: ${valor}.`);
    sections.push(`⚔️ 6. COMO A DISPUTA FUNCIONA\n\n${d.join("\n")}`);
  }

  // ── 7. QUEM PODE PARTICIPAR ──
  {
    const p: string[] = [];
    if (exclusividadeMEEPP === "sim") p.push("• Exclusiva para ME/EPP.");
    else p.push("• Participação ampla.");
    if (consorcioStatus === "nao") p.push("• Consórcio: vedado.");
    else if (consorcioStatus === "sim") p.push("• Consórcio: admitido.");
    else p.push("• Consórcio: não identificado de forma expressa.");
    if (feat.hasSICAF) p.push("• Cadastro no SICAF exigido.");
    if (feat.hasCAUFESP) p.push("• Cadastro no CAUFESP exigido.");
    if (feat.hasCredenciamento) p.push("• Credenciamento prévio exigido.");
    if (feat.hasImpedimentoSancao) p.push("• Empresas impedidas/inidôneas estão vedadas.");
    if (feat.hasCotaReservada) p.push("• Cota reservada para ME/EPP.");
    // Cooperativas — com distinção precisa
    if (cooperativasVedacao === "trabalho") p.push("• Cooperativas de trabalho: vedadas expressamente pelo edital.");
    else if (cooperativasVedacao === "todas") p.push("• Cooperativas: vedadas expressamente pelo edital.");
    if (subcontratacaoStatus === "nao") p.push("• Subcontratação: vedada.");
    else if (subcontratacaoStatus === "sim") p.push("• Subcontratação: admitida.");
    else if (feat.hasSubcontratacao) p.push("• Subcontratação: conferir no edital.");
    sections.push(`👥 7. QUEM PODE PARTICIPAR\n\n${p.join("\n")}`);
  }

  // ── 8. CHECKLIST ──
  {
    const c: string[] = [];
    if (sistema) c.push(`☐ Verificar cadastro em ${sistema}.`);
    if (feat.hasSICAF) c.push("☐ Conferir SICAF.");
    c.push("☐ Separar documentos de habilitação.");
    c.push("☐ Verificar validade de certidões.");
    c.push("☐ Analisar o Termo de Referência.");
    if (amostraStatus === "sim") c.push("☐ Preparar amostra.");
    if (catalogoStatus === "sim") c.push("☐ Separar catálogo/ficha técnica.");
    if (marcaModeloStatus === "sim") c.push("☐ Confirmar marca e modelo.");
    c.push("☐ Calcular custos (frete, impostos, encargos).");
    if (garantiaExecucao === "sim") c.push("☐ Providenciar garantia contratual.");
    if (feat.hasVisitaTecnica) c.push("☐ Agendar visita técnica.");
    c.push("☐ Preparar proposta.");
    if (prazoEntregaVal) c.push(`☐ Avaliar capacidade de entrega (${prazoEntregaVal}).`);
    sections.push(`✅ 8. CHECKLIST\n\n${c.join("\n")}`);
  }

  // ── 9. DOCUMENTOS DE HABILITAÇÃO ──
  {
    const habLines = dados.habilitacao.split("\n").map(l => l.trim()).filter(Boolean);
    if (habLines.length > 0 && dados.habilitacao !== "Consultar seção de habilitação no edital") {
      const c: string[] = [];
      c.push("Cada bloco abaixo representa uma categoria. A ausência de qualquer item pode resultar em inabilitação.");
      c.push("");
      c.push(...habLines);
      c.push("");
      c.push("Dica: confira cada item com antecedência.");
      sections.push(`📑 9. DOCUMENTOS DE HABILITAÇÃO\n\n${c.join("\n")}`);
    } else {
      sections.push(`📑 9. DOCUMENTOS DE HABILITAÇÃO\n\nConferir diretamente no edital.`);
    }
  }

  // ── 10. PROPOSTA COMERCIAL ──
  {
    const p: string[] = [];
    p.push("A proposta deve conter valores detalhados conforme o edital:");
    if (precoMaximoStatus === "sim") p.push("• Preço máximo de referência — propostas acima serão desclassificadas.");
    if (marcaModeloStatus === "sim") p.push("• Indicação de marca/modelo exigida.");
    if (feat.validadeProposta) p.push(`• Validade: ${feat.validadeProposta}.`);
    p.push("• Custos: frete, impostos, encargos.");
    if (feat.propostaReadequada) p.push("• Proposta readequada exigida após lances.");
    sections.push(`💰 10. PROPOSTA COMERCIAL\n\n${p.join("\n")}`);
  }

  // ── 11. PRAZOS CRÍTICOS (≥3 marcos) ──
  {
    const pr: string[] = [];
    if (feat.inicioPropostas) pr.push(`• Início propostas: ${feat.inicioPropostas}.`);
    if (sessao) pr.push(`• Sessão pública: ${sessao}.`);
    if (feat.validadeProposta) pr.push(`• Validade proposta: ${feat.validadeProposta}.`);
    if (feat.prazoDocComplementar) pr.push(`• Docs complementares: ${feat.prazoDocComplementar}.`);
    if (prazoEntregaVal) pr.push(`• Entrega: ${prazoEntregaVal}.`);
    if (prazoAssinaturaVal) pr.push(`• Assinatura: ${prazoAssinaturaVal}.`);
    if (feat.prazoRecurso) pr.push(`• Recurso: ${feat.prazoRecurso}.`);
    if (timeline.prazo_impugnacao) pr.push(`• Impugnação: ${timeline.prazo_impugnacao}.`);
    if (timeline.prazo_esclarecimento) pr.push(`• Esclarecimento: ${timeline.prazo_esclarecimento}.`);
    if (timeline.data_publicacao) pr.push(`• Publicação: ${timeline.data_publicacao}.`);
    if (feat.hasPagamento) pr.push(`• Pagamento: ${feat.hasPagamento}.`);
    if (pr.length >= 3) sections.push(`📅 11. PRAZOS CRÍTICOS\n\n${pr.join("\n")}`);
  }

  // ── 12. PONTOS DE PREPARAÇÃO ──
  {
    const p: string[] = [];
    p.push("📂 Habilitação");
    p.push("Documentação completa exigida. Organize com antecedência.");
    if (amostraStatus === "sim" || feat.hasVisitaTecnica || catalogoStatus === "sim") {
      p.push(""); p.push("🔬 Preparação técnica");
      if (amostraStatus === "sim") p.push("Amostra exigida — prepare conforme TR.");
      if (feat.hasVisitaTecnica) p.push("Visita técnica — agende com antecedência.");
      if (catalogoStatus === "sim") p.push("Catálogo/ficha técnica — separe documentação.");
    }
    p.push(""); p.push("💵 Formação de preço");
    if (precoMaximoStatus === "sim") p.push("Há preço máximo. Respeite o teto.");
    p.push("Contemple todos os custos na proposta.");
    if (prazoEntregaVal || feat.localEntrega) {
      p.push(""); p.push("🏗️ Logística");
      if (prazoEntregaVal) p.push(`Entrega: ${prazoEntregaVal}.`);
      if (feat.localEntrega) p.push(`Local: ${feat.localEntrega}.`);
    }
    if (garantiaExecucao === "sim" || feat.hasPagamento) {
      p.push(""); p.push("💳 Financeiro");
      if (garantiaExecucao === "sim") p.push("Garantia contratual exigida.");
      if (feat.hasPagamento) p.push(`Pagamento: ${feat.hasPagamento}.`);
    }
    if (feat.hasPenalidades || feat.hasMulta) {
      p.push(""); p.push("⚖️ Penalidades");
      if (feat.hasMulta) p.push(`Multa: ${feat.hasMulta}.`);
      p.push("Confirme capacidade de execução integral.");
    }
    sections.push(`📋 12. PONTOS DE PREPARAÇÃO\n\n${p.join("\n")}`);
  }

  // ── 13. PONTOS DE ATENÇÃO ──
  {
    const a: string[] = [];
    if (amostraStatus === "sim") a.push("🔸 Amostra exigida.");
    if (garantiaExecucao === "sim") a.push("🔸 Garantia contratual exigida.");
    else if (garantiaExecucao === "nao") a.push("🔸 Garantia contratual não exigida.");
    if (feat.hasGarantiaProduto) a.push("🔸 Garantia do produto exigida.");
    if (srpStatus === "sim") a.push("🔸 Registro de preços.");
    if (marcaModeloStatus === "sim") a.push("🔸 Marca/modelo — confira se aceita equivalência.");
    if (catalogoStatus === "sim") a.push("🔸 Catálogo/ficha técnica exigido.");
    if (precoMaximoStatus === "sim") a.push("🔸 Preço máximo — respeite o teto.");
    if (feat.hasMulta) a.push(`🔸 Multa: ${feat.hasMulta}.`);
    if (feat.hasImpedimentoSancao) a.push("🔸 Confira impedimentos cadastrais.");
    if (feat.hasSICAF || feat.hasCAUFESP) a.push("🔸 Cadastro obrigatório — confira validade.");
    if (a.length > 0) sections.push(`⚠️ 13. PONTOS DE ATENÇÃO\n\n${a.join("\n")}`);
  }

  // ── 14. IMPACTO PRÁTICO ──
  {
    const i: string[] = [];
    i.push("Este edital exige da empresa:");
    i.push("• Documentação válida e organizada.");
    if (garantiaExecucao === "sim") i.push("• Garantia contratual.");
    if (feat.hasPagamento) i.push(`• Capital de giro (pagamento: ${feat.hasPagamento}).`);
    if (prazoEntregaVal) i.push(`• Logística: entrega em ${prazoEntregaVal}.`);
    if (amostraStatus === "sim") i.push("• Amostra física.");
    if (feat.hasVisitaTecnica) i.push("• Visita técnica.");
    if (marcaModeloStatus === "sim") i.push("• Marca/modelo definidos.");
    if (feat.hasPenalidades) i.push("• Atenção às penalidades contratuais.");
    sections.push(`🏢 14. IMPACTO PRÁTICO\n\n${i.join("\n")}`);
  }

  // ── 15. EM LINGUAGEM SIMPLES ──
  {
    const s: string[] = [];
    s.push("📎 O que este edital busca");
    if (objeto) s.push(`${orgao} quer ${lowercaseFirst(objeto)}.`);
    else s.push(`${orgao} está realizando contratação pública.`);
    s.push(""); s.push("🏆 Como vencer");
    if (criterioHint) s.push(`Julgamento por ${criterio!.toLowerCase()} — ${criterioHint}`);
    else if (criterio) s.push(`Julgamento por ${criterio.toLowerCase()}.`);
    s.push(""); s.push("🙋 Quem pode participar");
    if (exclusividadeMEEPP === "sim") s.push("Apenas ME/EPP.");
    else s.push("Empresas de qualquer porte que atendam às exigências.");
    s.push(""); s.push("🎯 O que fazer agora");
    s.push("1. Ler edital completo e TR.");
    s.push("2. Conferir documentação.");
    if (sistema) s.push(`3. Confirmar cadastro em ${sistema}.`);
    s.push(`${sistema ? "4" : "3"}. Calcular custos e preparar proposta.`);
    if (sessao) s.push(`${sistema ? "5" : "4"}. Estar online em ${sessao}.`);
    sections.push(`📖 15. EM LINGUAGEM SIMPLES\n\n${s.join("\n")}`);
  }

  // ── 16. CONCLUSÃO EXECUTIVA ──
  {
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    const faixa = dados._scoreFaixa || getFaixa(score);
    const fraseFaixa = dados._scoreFraseFaixa || "";
    const fatoresElevaram = dados._scoreFatoresElevaram || "";
    const fatoresImpediram = dados._scoreFatoresImpediram || "";
    let c = `Este edital aparenta complexidade **${faixa}** (score ${score}/10).`;
    if (fraseFaixa) c += ` ${fraseFaixa}`;
    if (fatoresElevaram) c += `\n\n**Fatores que elevaram:** ${fatoresElevaram}.`;
    if (fatoresImpediram) c += `\n\n**Fatores que impediram nota maior:** ${fatoresImpediram}.`;
    sections.push(`🏁 16. CONCLUSÃO EXECUTIVA\n\n${c}`);
  }

  return sections.join("\n\n---\n\n");
}

// ══════════════════════════════════════════════════════════════
// ── MAIN ANALYSIS PIPELINE ──
// ══════════════════════════════════════════════════════════════

async function analyzeEditalText(text: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const truncated = text.slice(0, 60000);

  // ── CALL 1 + CALL 2 in parallel ──
  const metadataPrompt = `Você é um especialista em licitações públicas brasileiras. Extraia os metadados do edital.
REGRAS: NUNCA invente dados. Se não encontrar, use o valor padrão. ÓRGÃO ≠ plataforma. OBJETO: foque no bem/serviço, sem referências a leis.`;

  const restrictionsPrompt = `Você é um especialista em licitações públicas brasileiras. Extraia APENAS as restrições e exigências do edital.

REGRAS CRÍTICAS:
1. Para cada campo, transcreva o TRECHO EXATO do edital que fundamenta a resposta.
2. "Cooperativas de Trabalho" é DIFERENTE de "cooperativas" em geral. Se o edital veda apenas "Cooperativas de Trabalho", marque "trabalho", NÃO "todas".
3. Marque "sim"/"nao" SOMENTE com declaração EXPLÍCITA. Se omisso, marque "nao_identificado".
4. AMOSTRA: "sim" SOMENTE se OBRIGATORIAMENTE exigida. Menções genéricas = "nao_identificado".
5. HABILITAÇÃO: resuma por categoria com emojis.`;

  const [metadataResult, restrictionsResult] = await Promise.all([
    callAI(apiKey, metadataPrompt, `Extraia os metadados:\n\n${truncated}`, METADATA_TOOL, 4096),
    callAI(apiKey, restrictionsPrompt, `Extraia as restrições e exigências:\n\n${truncated}`, RESTRICTIONS_TOOL, 4096),
  ]);

  // ── CALL 3: PLANILHA (separate, focused) ──
  const planilhaPrompt = `Você é um especialista em licitações. Extraia a planilha/quadro estimativo de preços do edital.
REGRAS:
1. Procure especialmente em anexos, quadros, tabelas e planilhas estimativas.
2. Extraia TODOS os itens com: número, descrição, unidade, quantidade, valor unitário e total.
3. NÃO invente itens faltantes.
4. Se não houver planilha de preços no edital, retorne array vazio.`;

  const planilhaContext = buildPlanilhaExtractionContext(truncated);

  const planilhaResult = await callAI(apiKey, planilhaPrompt,
    `Extraia a planilha de preços deste edital a partir dos trechos mais prováveis:\n\n${planilhaContext}`, PLANILHA_TOOL, 12288);

  // ── Defaults for missing AI results ──
  const meta = metadataResult || {} as Record<string, unknown>;
  const rest = restrictionsResult || {} as Record<string, unknown>;
  const plan = planilhaResult || {} as Record<string, unknown>;

  // Extract structured restriction values
  const consorcioAI = (rest.consorcio as any)?.status || "nao_identificado";
  const cooperativasAI = (rest.cooperativas as any)?.vedacao || "nao_identificado";
  const subcontratacaoAI = (rest.subcontratacao as any)?.status || "nao_identificado";
  const amostraAI = (rest.amostra as any)?.status || "nao_identificado";
  const garantiaAI = (rest.garantia_execucao as any)?.status || "nao_identificado";

  // ── CALL 4: VALIDATION (cross-check against text) ──
  const extractedSummary = JSON.stringify({
    consorcio: { status: consorcioAI, trecho: (rest.consorcio as any)?.trecho_fonte },
    cooperativas: { vedacao: cooperativasAI, trecho: (rest.cooperativas as any)?.trecho_fonte },
    subcontratacao: { status: subcontratacaoAI, trecho: (rest.subcontratacao as any)?.trecho_fonte },
    amostra: { status: amostraAI, trecho: (rest.amostra as any)?.trecho_fonte },
    garantia: { status: garantiaAI, trecho: (rest.garantia_execucao as any)?.trecho_fonte },
    modo_disputa: meta.modo_disputa,
    objeto: meta.objeto,
    orgao: meta.orgao,
  });

  const validationPrompt = `Você é um auditor de licitações. Valide os dados extraídos abaixo contra o texto do edital.

DADOS EXTRAÍDOS:
${extractedSummary}

REGRAS DE VALIDAÇÃO:
1. Verifique se cada "trecho_fonte" realmente existe no texto do edital.
2. Se o trecho diz "Cooperativas de Trabalho" mas a vedação está marcada como "todas", CORRIJA para "trabalho".
3. Se o trecho NÃO suporta a conclusão (ex: trecho genérico usado para marcar "sim"), CORRIJA para "nao_identificado".
4. Verifique se o órgão é realmente o promotor da licitação (e não a plataforma).
5. Verifique se o objeto descreve o que é comprado/contratado (sem referências a leis).
6. Para modo_disputa, confirme se há declaração EXPRESSA no edital.`;

  const validationResult = await callAI(apiKey, validationPrompt,
    `Valide contra o texto:\n\n${truncated.slice(0, 30000)}`, VALIDATION_TOOL, 4096);

  const val = validationResult || {} as Record<string, unknown>;

  // ── Apply validated values (validation overrides AI extraction) ──
  const consorcioFinal = (val.consorcio_validado as string) || consorcioAI;
  const cooperativasFinal = (val.cooperativas_vedacao_validado as string) || cooperativasAI;
  const subcontratacaoFinal = (val.subcontratacao_validado as string) || subcontratacaoAI;
  const amostraFinal = (val.amostra_validado as string) || amostraAI;
  const garantiaFinal = (val.garantia_validado as string) || garantiaAI;
  const modoDisputaFinal = (val.modo_disputa_validado as string) || (meta.modo_disputa as string) || "nao_identificado";
  const objetoFinal = (val.objeto_validado as string) || (meta.objeto as string) || "Não identificado no edital";
  const orgaoFinal = (val.orgao_validado as string) || (meta.orgao as string) || "Não identificado";

  // ── Regex fallbacks for mechanical fields ──
  const numero_edital = (meta.numero_edital && meta.numero_edital !== "Não identificado")
    ? meta.numero_edital as string : extractNumeroEdital(text);
  const data_sessao = (meta.data_sessao && meta.data_sessao !== "Não identificado")
    ? meta.data_sessao as string : extractDataSessao(text);

  const regexTimeline = extractTimeline(text);
  const timeline = {
    data_publicacao: (meta.data_publicacao as string) || regexTimeline.data_publicacao,
    prazo_impugnacao: (meta.prazo_impugnacao as string) || regexTimeline.prazo_impugnacao,
    prazo_esclarecimento: (meta.prazo_esclarecimento as string) || regexTimeline.prazo_esclarecimento,
    data_abertura: regexTimeline.data_abertura,
  };

  const aiPlanilha = normalizePlanilhaItems((plan as any).itens);
  const regexPlanilha = extractStructuredPlanilhaRows(text);
  const structuredPlanilha = chooseBestPlanilha(aiPlanilha, regexPlanilha);
  const planilha_estimada = structuredPlanilha && structuredPlanilha.length > 0
    ? structuredPlanilha
    : extractPlanilha(text);
  const valor_estimado = resolveValorEstimado(text, meta.valor_estimado, structuredPlanilha).value;

  const modalidade = (meta.modalidade as string) || "Não identificado";
  const criterio_julgamento = (meta.criterio_julgamento as string) || "Não identificado";
  const sistema_licitacao = normalizeSistemaLicitacao(meta.sistema_licitacao as string, text);
  const condicoes_habilitacao = (rest.habilitacao as string) || "Consultar seção de habilitação no edital";
  const participacao = (meta.participacao as string) || "Não identificado no edital";
  const unidade_disputa = (meta.unidade_disputa as string) || "Não identificado no edital";

  const score_complexidade = calcularComplexidade(text, {
    valor_estimado,
    criterio: criterio_julgamento,
    modalidade,
  }, { subcontratacao: subcontratacaoFinal });

  // Log validation corrections for debugging
  if (val.corrections && Array.isArray(val.corrections) && (val.corrections as any[]).length > 0) {
    console.log("Validation corrections applied:", JSON.stringify(val.corrections));
  }

  const resumo_simples = gerarResumoSimples({
    numero_edital,
    modalidade,
    orgao: orgaoFinal,
    objeto: objetoFinal,
    valor_estimado,
    criterio: criterio_julgamento,
    data_sessao,
    sistema: sistema_licitacao,
    habilitacao: condicoes_habilitacao,
    _fullText: text,
    _scoreComplexidade: String(score_complexidade.valor),
    _scoreFaixa: score_complexidade.faixa,
    _scoreFraseFaixa: score_complexidade.frase_faixa,
    _scoreFatoresElevaram: score_complexidade.fatores_elevaram.join("; "),
    _scoreFatoresImpediram: score_complexidade.fatores_impediram.join("; "),
    _v_consorcio: consorcioFinal,
    _v_subcontratacao: subcontratacaoFinal,
    _v_amostra: amostraFinal,
    _v_garantia: garantiaFinal,
    _v_cooperativas: cooperativasFinal,
    _v_modo_disputa: modoDisputaFinal,
    _ai_exclusividade_meepp: String(meta.exclusividade_meepp ?? false),
    _ai_srp: String(meta.is_srp ?? false),
    _ai_preco_maximo: String(meta.preco_maximo ?? false),
    _ai_catalogo: String(rest.catalogo_exigido ?? false),
    _ai_marca_modelo: String(rest.marca_modelo_exigido ?? false),
  }, timeline);

  return {
    numero_edital,
    modalidade,
    orgao: orgaoFinal,
    objeto: objetoFinal,
    valor_estimado,
    planilha_estimada,
    criterio_julgamento,
    data_sessao,
    condicoes_habilitacao,
    sistema_licitacao,
    resumo_simples,
    timeline,
    score_complexidade,
    participacao,
    unidade_disputa,
  };
}

// ── Main Handler ──
async function handleAnalyzeEdital(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo enviado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (file.type !== "application/pdf") {
      return new Response(JSON.stringify({ error: "O arquivo deve ser um PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    let text: string;
    try {
      text = await extractTextFromPdf(buffer);
    } catch (e) {
      console.error("PDF extraction failed:", e);
      return new Response(JSON.stringify({ error: "Não foi possível extrair texto do PDF." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!text || text.trim().length < 100) {
      return new Response(JSON.stringify({ error: "PDF sem texto suficiente (pode ser imagem escaneada)." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await analyzeEditalText(text);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro ao analisar o edital" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

if (import.meta.main) {
  Deno.serve(handleAnalyzeEdital);
}

export { analyzeEditalText, gerarResumoSimples };
