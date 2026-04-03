const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── PDF Text Extraction ──
async function extractTextFromPdf(buffer: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import("npm:unpdf@0.12.1");
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
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

// ── Field Extractors ──
function extractNumeroEdital(text: string): string {
  return firstMatch(text, [
    /(?:EDITAL|PREGÃO|CONCORRÊNCIA|TOMADA\s+DE\s+PREÇOS?)\s*(?:ELETRÔNIC[OA]\s*)?(?:N[°ºo.]*\s*)?([\d]+[\d.\-\/]+\d+)/i,
    /(?:EDITAL)\s*(?:N[°ºo.]*\s*)?([\w\-]+\/\d{4})/i,
    /(?:PROCESSO\s+(?:LICITATÓRIO\s+)?(?:N[°ºo.]*\s*)?)([\d.\-\/]+\d+)/i,
  ]) || "Não identificado";
}

function extractModalidade(text: string): string {
  return firstMatch(text, [
    /(pregão\s+eletrônico)/i,
    /(pregão\s+presencial)/i,
    /(concorrência\s+(?:pública|eletrônica|internacional)?)/i,
    /(tomada\s+de\s+preços?)/i,
    /(convite)/i,
    /(leilão)/i,
    /(diálogo\s+competitivo)/i,
    /(dispensa\s+(?:de\s+licitação|eletrônica)?)/i,
    /(inexigibilidade)/i,
  ]) || "Não identificado";
}

function extractOrgao(text: string): string {
  // Look in the first ~1500 chars (header area)
  const header = text.slice(0, 1500);
  return firstMatch(header, [
    /((?:PREFEITURA|MUNICÍPIO|SECRETARIA|GOVERNO|ESTADO|CÂMARA|TRIBUNAL|FUNDAÇÃO|AUTARQUIA|UNIVERSIDADE|INSTITUTO|COMPANHIA|EMPRESA|DEPARTAMENTO|SERVIÇO\s+AUTÔNOMO)[^\n]{5,120})/i,
    /(?:ÓRGÃO|ENTIDADE|CONTRATANTE)\s*[:.]?\s*([^\n]{10,120})/i,
  ]) || "Não identificado";
}

function extractObjeto(text: string): string {
  const norm = text.replace(/\r\n/g, "\n");
  const candidates: Array<{ value: string; score: number; index: number }> = [];

  const addCandidate = (raw: string, boost = 0, context = "", index = 0) => {
    const cleaned = cleanObjetoText(raw);
    if (!cleaned || cleaned.length < 20 || isLikelyNonObjetoClause(cleaned)) return;

    const score = scoreObjetoCandidate(cleaned) + boost - scoreObjetoContextPenalty(context, index, norm.length);
    if (score >= 6) {
      candidates.push({ value: cleaned, score, index });
    }
  };

  const header = norm.slice(0, Math.min(norm.length, 16000));
  const inlinePatterns = [
    /(?:tem\s+por\s+objeto|tem\s+como\s+objeto|cujo\s+objeto\s+[ée]|visa|destina(?:[\-\s]?se)?\s+a)\s+(?:a\s+)?((?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)[^\n.;]{20,500})/gi,
    /objeto\s*[:]\s*((?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)[^\n]{20,500})/gi,
    /((?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)\s+(?:de|para)\s+[^\n]{20,500})/gi,
  ];

  for (const pattern of inlinePatterns) {
    for (const match of header.matchAll(pattern)) {
      addCandidate(match[1] || match[0], 12, "", match.index ?? 0);
    }
  }

  for (const section of extractObjetoSectionCandidates(norm)) {
    const context = norm.slice(Math.max(0, section.index - 500), section.index);

    const explicitSentence = firstMatch(section.content.replace(/\n+/g, " "), [
      /(?:o\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo\s+de\s+referência|contrato)\s+(?:é|consiste\s+em|tem\s+por\s+(?:finalidade|objetivo)|visa|destina(?:[\-\s]?se)?\s+a)|constitui\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo|contrato)|a\s+presente\s+(?:licitação|contratação)\s+tem\s+por\s+objeto)\s+(?:a\s+)?((?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)[^.]{20,700})/i,
    ]);
    if (explicitSentence) addCandidate(explicitSentence, 20, context, section.index);

    addCandidate(section.content, 10, context, section.index);
  }

  const ementa = firstMatch(header, [/(?:ementa|súmula)\s*[:.]?\s*([^\n]{20,500})/i]);
  if (ementa) addCandidate(ementa, 4, "", 0);

  if (candidates.length === 0) return "Não identificado no edital";

  const unique = Array.from(
    new Map(
      candidates
        .sort((a, b) => b.score - a.score || a.index - b.index || a.value.length - b.value.length)
        .map((item) => [item.value.toLowerCase(), item])
    ).values()
  ).sort((a, b) => b.score - a.score || a.index - b.index || a.value.length - b.value.length);

  return unique[0].value;
}

function extractObjetoSectionCandidates(text: string): Array<{ content: string; index: number }> {
  const headingPatterns = [
    /(?:^|\n)\s*(?:\d+(?:\.\d+){0,4}[\.\)]?\s*[-–—:]?\s*)?(?:do\s+)?objeto(?:\s+(?:da|do)\s+(?:licitação|contratação|pregão|edital|certame|contrato))?\s*(?::|\n)/gim,
    /(?:^|\n)\s*(?:cláusula|cap[íi]tulo|seção)\s+[^\n]{0,60}\bobjeto\b[^\n]*?(?::|\n)/gim,
  ];

  const starts: Array<{ index: number; end: number }> = [];
  for (const pattern of headingPatterns) {
    for (const match of text.matchAll(pattern)) {
      starts.push({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
    }
  }

  const deduped = starts
    .sort((a, b) => a.index - b.index)
    .filter((item, index, arr) => index === 0 || item.index - arr[index - 1].index > 8);

  return deduped
    .map((item) => {
      const slice = text.slice(item.end, item.end + 5000);
      const boundary = slice.match(
        /(?:^|\n)\s*(?:(?:\d+(?:\.\d+){0,4}|[IVXLCDM]+)[\.\)]?\s*[-–—:]?\s*)?(?:(?:DA|DO|DAS|DOS)\s+[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][^\n]{3,140}|(?:CAP[ÍI]TULO|SEÇÃO|TÍTULO|CLÁUSULA|ANEXO)\b[^\n]{0,140})/im
      );

      return {
        content: (boundary ? slice.slice(0, boundary.index) : slice).trim(),
        index: item.index,
      };
    })
    .filter((item) => item.content.length > 0);
}

function stripObjetoNumbering(line: string): string {
  return line
    .replace(/^(?:item\s*)?(?:\d+(?:\.\d+){0,5}|[ivxlcdm]+|[a-z])(?:[\.\)\-–—:]+)?\s+/i, "")
    .replace(/^\(?\d+\)\s*/i, "")
    .trim();
}

function stripObjetoLeadIn(text: string): string {
  return text
    .replace(/^o\s+(?:presente\s+)?(?:edital|pregão|certame|licitação|instrumento\s+convocatório|contrato|termo\s+de\s+referência)\s+tem\s+(?:por|como)\s+(?:finalidade|objetivo|objeto)\s*/i, "")
    .replace(/^a\s+presente\s+(?:licitação|contratação)\s+tem\s+por\s+objeto\s*/i, "")
    .replace(/^o\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo\s+de\s+referência|contrato)\s+(?:é|consiste\s+em|tem\s+por\s+(?:finalidade|objetivo)|visa|destina(?:[\-\s]?se)?\s+a)\s*/i, "")
    .replace(/^constitui\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo|contrato)\s*/i, "")
    .replace(/^[:.\-\s]+/, "")
    .trim();
}

function startsWithNonObjetoClause(text: string): boolean {
  return /^(?:o|a|os|as)?\s*(pagamentos?|vig[êe]ncia|reajuste|repactua(?:ção|ções)|sanç(?:ão|ões)|penalidades?|multas?|dotaç(?:ão|ões)|nota\s+fiscal|faturamento|recebimento|fiscaliza(?:ção|ções)|habilita(?:ção|ções)|impugna(?:ção|ções)|esclarecimentos?|recurso(?:s)?|proposta(?:s)?|sessão\s+pública|garantia)\b/i.test(
    text.trim().toLowerCase()
  );
}

function hasStrongObjetoSignal(text: string): boolean {
  return /\b(contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)\b/i.test(text);
}

function isLikelyNonObjetoClause(text: string): boolean {
  const value = text.toLowerCase();
  const negativePattern = /\b(pagamento|pagamentos|vig[êe]ncia|reajuste|repactua(?:ção|ções)|sanç(?:ão|ões)|penalidades?|multa|dotaç(?:ão|ões)|nota\s+fiscal|faturamento|recebimento|fiscaliza(?:ção|ções)|habilita(?:ção|ções)|impugna(?:ção|ções)|esclarecimentos?|recurso(?:s)?|proposta(?:s)?|sessão\s+pública|garantia)\b/i;

  if (startsWithNonObjetoClause(text)) return true;
  return negativePattern.test(value) && !hasStrongObjetoSignal(value);
}

function scoreObjetoContextPenalty(context: string, index: number, totalLength: number): number {
  const value = context.toLowerCase();
  let penalty = 0;

  if (/\banexo\b/.test(value)) penalty += 5;
  if (/\bminuta\b/.test(value)) penalty += 6;
  if (/\btermo\s+de\s+contrato\b/.test(value)) penalty += 7;
  if (/\bcontrato\b/.test(value) && /\bcláusula\b/.test(value)) penalty += 5;
  if (index > totalLength * 0.55) penalty += 2;
  if (index > totalLength * 0.75) penalty += 3;

  return penalty;
}

function scoreObjetoCandidate(text: string): number {
  const value = text.toLowerCase();
  let score = 0;

  const positiveSignals: Array<[RegExp, number]> = [
    [/\bcontratação\b/i, 9],
    [/\baquisição\b/i, 9],
    [/\bfornecimento\b/i, 8],
    [/\bprestação\s+de\s+serviços?\b/i, 8],
    [/\bexecução\s+de\s+obras?\b/i, 8],
    [/\bregistro\s+de\s+preços\b/i, 9],
    [/\blocação\b/i, 7],
    [/\bcredenciamento\b/i, 7],
    [/\bseleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?\b/i, 7],
    [/\bconcessão\b/i, 6],
    [/\bpermissão\b/i, 6],
    [/\balienação\b/i, 6],
    [/\bcessão\b/i, 6],
    [/\bchamamento\s+público\b/i, 6],
    [/\bparceria\b/i, 5],
    [/\bimplantação\b/i, 5],
    [/\breforma\b/i, 5],
    [/\bampliação\b/i, 5],
    [/\bempresa\s+especializada\b/i, 4],
    [/\bserviços?\b/i, 2],
    [/\bobra(?:s)?\b/i, 2],
    [/\bequipamentos?\b/i, 2],
    [/\bmateriais?\b/i, 2],
    [/\bsolução\b/i, 2],
    [/\bsistema\b/i, 2],
  ];
  const negativeSignals: Array<[RegExp, number]> = [
    [/\bpagamentos?\b/i, 14],
    [/\bvig[êe]ncia\b/i, 10],
    [/\breajuste\b/i, 10],
    [/\bsanç(?:ão|ões)\b/i, 10],
    [/\bpenalidades?\b/i, 10],
    [/\bmulta\b/i, 8],
    [/\bdotaç(?:ão|ões)\b/i, 8],
    [/\bnota\s+fiscal\b/i, 8],
    [/\bfaturamento\b/i, 8],
    [/\brecebimento\b/i, 7],
    [/\bfiscaliza(?:ção|ções)\b/i, 7],
    [/\bhabilita(?:ção|ções)\b/i, 8],
    [/\bimpugna(?:ção|ções)\b/i, 8],
    [/\besclarecimentos?\b/i, 8],
    [/\brecursos?\b/i, 6],
    [/\bpropostas?\b/i, 6],
    [/\bsessão\s+pública\b/i, 6],
  ];

  for (const [pattern, points] of positiveSignals) {
    if (pattern.test(value)) score += points;
  }
  for (const [pattern, points] of negativeSignals) {
    if (pattern.test(value)) score -= points;
  }

  if (startsWithNonObjetoClause(text)) score -= 18;
  if (/r\$\s*[\d.,]+/i.test(value)) score -= 5;
  if (/\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4}/.test(value)) score -= 4;
  if (value.length < 25) score -= 8;
  if (value.length > 550) score -= 4;
  if (/^(contratação|aquisição|fornecimento|prestação|execução|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)\b/i.test(text)) score += 6;

  return score;
}

function cleanObjetoText(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) => stripObjetoNumbering(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];

    if (current.length >= 20) candidates.push(current);

    if (
      next &&
      /(?:tem\s+por\s+objeto|tem\s+como\s+objeto|o\s+objeto\s+do|constitui\s+objeto|a\s+presente\s+(?:licitação|contratação)\s+tem\s+por\s+objeto)$/i.test(current)
    ) {
      candidates.push(`${current} ${next}`);
    }
  }

  const normalized = candidates
    .map((line) => stripObjetoLeadIn(line))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (line.length < 20) return false;
      if (/^(objeto|cláusula|cap[íi]tulo|seção|anexo)\b/i.test(line) && line.length < 50) return false;
      return true;
    });

  if (normalized.length === 0) return "";

  const strongCandidates = normalized
    .filter((line) => hasStrongObjetoSignal(line) && !isLikelyNonObjetoClause(line))
    .map((line) => ({ line, score: scoreObjetoCandidate(line) }))
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);

  const best = strongCandidates[0];
  if (!best || best.score < 6) return "";

  let result = best.line
    .replace(/^[:.\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;:,\.\-–—]+$/, "")
    .trim();

  if (!result || isLikelyNonObjetoClause(result)) return "";

  return result.charAt(0).toUpperCase() + result.slice(1, 800);
}

function extractValorEstimado(text: string): string {
  // Look for explicit value statements
  const valueContext = firstMatch(text, [
    /(?:valor\s+(?:total\s+)?(?:estimado|máximo|global|de\s+referência))\s*(?:é\s+de|de|:)\s*(R\$\s*[\d.,]+(?:\s*(?:\(.*?\)))?)/i,
    /(?:valor\s+(?:total\s+)?(?:estimado|máximo|global))\s*[:.]?\s*(R\$\s*[\d.,]+)/i,
    /(?:orçamento\s+(?:estimado|máximo))\s*(?:é\s+de|de|:)\s*(R\$\s*[\d.,]+)/i,
    /(?:montante\s+de)\s*(R\$\s*[\d.,]+)/i,
  ]);
  return valueContext || "Não informado no edital";
}

function extractCriterio(text: string): string {
  return firstMatch(text, [
    /(?:critério\s+de\s+julgamento|tipo\s+de\s+licitação)\s*[:.]?\s*(menor\s+preço(?:\s+global|\s+por\s+(?:lote|item))?)/i,
    /(?:critério\s+de\s+julgamento|tipo)\s*[:.]?\s*(maior\s+desconto)/i,
    /(?:critério\s+de\s+julgamento|tipo)\s*[:.]?\s*(técnica\s+e\s+preço)/i,
    /(?:critério\s+de\s+julgamento|tipo)\s*[:.]?\s*(melhor\s+técnica)/i,
    /(menor\s+preço(?:\s+global|\s+por\s+(?:lote|item))?)\s*(?:será|como|é)\s+(?:o\s+)?critério/i,
  ]) || "Não identificado";
}

function extractDataSessao(text: string): string {
  const match = firstMatch(text, [
    /(?:sessão\s+pública|abertura\s+d[aoe]s?\s+propostas?|data\s+d[aoe]\s+sessão|abertura\s+d[ao]\s+certame)\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})\s*[,;]?\s*(?:às?|a\s+partir\s+de)?\s*(\d{1,2}\s*[h:]\s*\d{0,2})/i,
    /(?:sessão\s+pública|abertura)\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ], 0);

  if (match) {
    // Clean and return the full match context
    const dateMatch = match.match(/(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})\s*[,;]?\s*(?:às?|a\s+partir\s+de)?\s*(\d{1,2}\s*[h:]\s*\d{0,2})?/i);
    if (dateMatch) {
      const date = dateMatch[1].replace(/\s/g, '');
      const time = dateMatch[2]?.replace(/\s/g, '') || '';
      return time ? `${date} às ${time}` : date;
    }
  }
  return "Não identificado";
}

function extractSistema(text: string): string {
  const textLower = text.toLowerCase();
  if (/bec[\s\-\/]?sp|bolsa\s+eletrônica\s+de\s+compras/i.test(text)) return "BEC/SP - Bolsa Eletrônica de Compras";
  if (/compras\.?gov\.?br|comprasnet/i.test(text)) return "Compras.gov.br";
  if (/licitanet/i.test(text)) return "Licitanet";
  if (/bll\s+compras|bllcompras/i.test(text)) return "BLL Compras";
  if (/licitações[\-\s]?e|licitacoes[\-\s]?e/i.test(text)) return "Licitações-e (Banco do Brasil)";
  if (/portal\s+de\s+compras/i.test(text)) return "Portal de Compras";
  if (/pregão\s+eletrônico/i.test(text)) return "Sistema eletrônico (ver edital)";
  return "Não identificado";
}

function extractHabilitacao(text: string): string {
  const section = extractSection(
    text,
    [
      /(?:^|\n)\s*(?:\d+[\.\)]?\s*)?(?:D[AO]S?\s+)?(?:CONDIÇÕES\s+DE\s+)?HABILITAÇÃO\s*[:.\n]/im,
      /(?:^|\n)\s*(?:\d+[\.\)]?\s*)?DOCUMENTOS?\s+(?:DE|PARA)\s+HABILITAÇÃO\s*[:.\n]/im,
    ],
    [
      /\n\s*(?:\d+[\.\)]|CAPÍTULO|SEÇÃO)\s+(?:D[AO]S?\s+)?(?:PROPOSTA|JULGAMENTO|RECURSO|IMPUGNAÇÃO|CONTRATO|SANÇÕES)/i,
    ],
    6000
  );

  const src = section || text;
  const summary: string[] = [];

  // ── Habilitação Jurídica ──
  if (/(?:habilitação\s+)?jurídica|ato\s+constitutivo|contrato\s+social|registro\s+comercial/i.test(src)) {
    const docs: string[] = [];
    if (/ato\s+constitutivo|contrato\s+social|estatuto/i.test(src)) docs.push("contrato social/estatuto");
    if (/cnpj/i.test(src)) docs.push("CNPJ");
    if (/registro\s+comercial/i.test(src)) docs.push("registro comercial");
    if (/decreto\s+de\s+autorização/i.test(src)) docs.push("decreto de autorização");
    summary.push(`📜 Habilitação Jurídica: ${docs.length > 0 ? docs.join(', ') : 'documentos constitutivos da empresa'}`);
  }

  // ── Regularidade Fiscal e Trabalhista ──
  if (/regularidade\s+fiscal|certidão|fgts|inss|cndt|fazenda|tribut/i.test(src)) {
    const docs: string[] = [];
    if (/(?:certidão|cnd).*(?:federal|união|receita\s+federal|pgfn)/i.test(src) || /débitos?\s+(?:relativos\s+a\s+)?(?:créditos?\s+)?tributários?\s+federai/i.test(src)) docs.push("CND Federal/PGFN");
    if (/(?:certidão|cnd).*estadual|fazenda\s+estadual|icms/i.test(src)) docs.push("CND Estadual");
    if (/(?:certidão|cnd).*municipal|iss|fazenda\s+municipal|tributos?\s+municipai/i.test(src)) docs.push("CND Municipal");
    if (/fgts|crf/i.test(src)) docs.push("CRF/FGTS");
    if (/inss|previdenciári/i.test(src)) docs.push("CND Previdenciária");
    if (/cndt|trabalhista/i.test(src)) docs.push("CNDT Trabalhista");
    if (/sicaf/i.test(src)) docs.push("SICAF");
    summary.push(`🏦 Regularidade Fiscal/Trabalhista: ${docs.length > 0 ? docs.join(', ') : 'certidões fiscais e trabalhistas'}`);
  }

  // ── Qualificação Técnica ──
  if (/qualificação\s+técnica|atestado|acervo|capacidade\s+técnica|crea|cau|registro\s+profissional/i.test(src)) {
    const docs: string[] = [];
    if (/atestado/i.test(src)) docs.push("atestado(s) de capacidade técnica");
    if (/acervo/i.test(src)) docs.push("certidão de acervo técnico");
    if (/crea|cau|registro\s+(?:no\s+)?conselho/i.test(src)) docs.push("registro em conselho profissional");
    if (/equipe\s+técnica|profissional|responsável\s+técnico/i.test(src)) docs.push("equipe técnica qualificada");

    // Try to extract minimum quantities from atestados
    const qtdMatch = src.match(/atestado[^.]{0,200}(?:comprovan|demonstran)[^.]{0,200}(?:no\s+mínimo|pelo\s+menos|mínimo\s+de)\s*(\d+[%]?)/i);
    const qtdInfo = qtdMatch ? ` (mínimo: ${qtdMatch[1]})` : '';
    summary.push(`🔧 Qualificação Técnica: ${docs.length > 0 ? docs.join(', ') : 'comprovação de experiência'}${qtdInfo}`);
  }

  // ── Qualificação Econômico-Financeira ──
  if (/qualificação\s+econômico|balanço|capital\s+social|patrimônio\s+líquido|índice|certidão.*falência/i.test(src)) {
    const docs: string[] = [];
    if (/balanço\s+patrimonial/i.test(src)) docs.push("balanço patrimonial");
    if (/capital\s+social/i.test(src)) {
      const capMatch = src.match(/capital\s+social\s+(?:mínimo\s+(?:de\s+)?)?(?:de\s+)?(R\$\s*[\d.,]+)/i);
      docs.push(capMatch ? `capital social mínimo de ${capMatch[1]}` : "capital social mínimo");
    }
    if (/patrimônio\s+líquido/i.test(src)) {
      const plMatch = src.match(/patrimônio\s+líquido\s+(?:mínimo\s+(?:de\s+)?)?(?:de\s+)?(R\$\s*[\d.,]+|\d+[%])/i);
      docs.push(plMatch ? `patrimônio líquido mínimo de ${plMatch[1]}` : "patrimônio líquido");
    }
    if (/(?:índice|indicador).*(?:liquidez|solvência|endividamento)/i.test(src)) {
      const indices: string[] = [];
      if (/liquidez\s+(?:geral|lg)/i.test(src)) indices.push("LG");
      if (/liquidez\s+(?:corrente|lc)/i.test(src)) indices.push("LC");
      if (/solvência|sg/i.test(src)) indices.push("SG");
      if (indices.length > 0) docs.push(`índices contábeis (${indices.join(', ')} ≥ 1)`);
    }
    if (/certidão.*falência|recuperação\s+judicial/i.test(src)) docs.push("certidão negativa de falência");
    if (/seguro[\-\s]?garantia|garantia.*proposta/i.test(src)) docs.push("garantia da proposta");
    summary.push(`📊 Qualificação Econômico-Financeira: ${docs.length > 0 ? docs.join(', ') : 'comprovação de saúde financeira'}`);
  }

  // ── Declarações ──
  const decls: string[] = [];
  if (/menor\s+(?:de\s+)?(?:18|dezoito)|trabalho\s+(?:infantil|de\s+menor)/i.test(src)) decls.push("inexistência de trabalho de menor");
  if (/declaração.*(?:impedimento|inidoneidade|suspens)/i.test(src)) decls.push("inexistência de impedimentos");
  if (/declaração.*(?:fato\s+superveniente|impeditivo)/i.test(src)) decls.push("fato superveniente");
  if (/me[\s\/]epp|microempresa|empresa\s+de\s+pequeno/i.test(src)) decls.push("enquadramento ME/EPP (se aplicável)");
  if (decls.length > 0) {
    summary.push(`📝 Declarações: ${decls.join(', ')}`);
  }

  if (summary.length > 0) {
    return summary.join('\n');
  }

  return "Consultar seção de habilitação no edital";
}

// ── Timeline ──
function extractTimeline(text: string) {
  const datePattern = /(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/;

  const pub = firstMatch(text, [
    /(?:data\s+(?:de\s+)?publicação|publicad[oa]\s+em|publicação\s+(?:no\s+)?(?:DOE|DOU|diário))\s*[:.]?\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ]);

  const imp = firstMatch(text, [
    /(?:impugnação|impugnar)\s*[^.]*?(?:até|prazo[^.]*?)\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /(?:prazo\s+(?:para\s+)?impugnação)\s*[:.]?\s*(?:até\s+)?(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /impugna[çã][ãa]o[^.]{0,100}(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
  ]);

  const esc = firstMatch(text, [
    /(?:esclarecimento|pedido\s+de\s+esclarecimento)\s*[^.]*?(?:até|prazo[^.]*?)\s*(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
    /esclareciment[oo]s?[^.]{0,100}(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})/i,
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

// ── Complexity Score (heuristic) ──
function calcularComplexidade(text: string, dados: Record<string, string>): { valor: number; justificativa: string } {
  let score = 2;
  const fatores: string[] = [];
  const textLower = text.toLowerCase();
  const pageEstimate = Math.ceil(text.length / 3000);

  // Document length
  if (pageEstimate > 50) { score += 2; fatores.push("documento muito extenso (estimado +" + pageEstimate + " págs.)"); }
  else if (pageEstimate > 25) { score += 1; fatores.push("documento extenso"); }

  // Value
  const valorStr = dados.valor_estimado?.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const valorNum = parseFloat(valorStr || '0');
  if (valorNum > 10000000) { score += 2; fatores.push("valor acima de R$ 10 milhões"); }
  else if (valorNum > 1000000) { score += 1; fatores.push("valor acima de R$ 1 milhão"); }

  // Technical complexity indicators
  if (/consórcio/i.test(text)) { score += 1; fatores.push("admite ou exige consórcio"); }
  if (/garantia\s+(de\s+)?(execução|contratual)|seguro[\-\s]garantia/i.test(text)) { score += 1; fatores.push("exige garantia contratual"); }
  if (/subcontrata/i.test(text)) { score += 0.5; fatores.push("prevê subcontratação"); }
  if (/amostra|prova\s+de\s+conceito/i.test(text)) { score += 1; fatores.push("exige amostra ou prova de conceito"); }
  if (/técnica\s+e\s+preço/i.test(text)) { score += 1; fatores.push("julgamento por técnica e preço"); }
  if (/sustentabilidade|ambiental|iso\s*14/i.test(text)) { score += 0.5; fatores.push("critérios de sustentabilidade"); }
  if (/registro\s+de\s+preços|ata\s+de\s+registro/i.test(text)) { score += 0.5; fatores.push("sistema de registro de preços"); }
  if (/(?:me|epp|microempresa|empresa\s+de\s+pequeno\s+porte)\s+exclusiv/i.test(text)) { fatores.push("exclusivo para ME/EPP"); }
  if (/visita\s+técnica/i.test(text)) { score += 0.5; fatores.push("exige visita técnica"); }
  if (/sigilo|proposta\s+sigilosa/i.test(text)) { score += 0.5; fatores.push("propostas sigilosas"); }

  // Count habilitação categories
  const habCats = [
    /habilitação\s+jurídica|ato\s+constitutivo/i,
    /regularidade\s+fiscal/i,
    /qualificação\s+técnica|atestado/i,
    /qualificação\s+econômico|balanço\s+patrimonial/i,
    /regularidade\s+trabalhista|cndt/i,
  ].filter(p => p.test(text)).length;
  if (habCats >= 4) { score += 1; fatores.push("exigências de habilitação abrangentes (" + habCats + " categorias)"); }

  score = Math.min(10, Math.max(1, Math.round(score)));

  const justificativa = fatores.length > 0
    ? `Score ${score}/10 baseado em análise textual automatizada. Fatores identificados: ${fatores.join("; ")}.`
    : "Edital com características padrão, sem elementos de complexidade adicional identificados na análise automatizada.";

  return { valor: score, justificativa };
}

// ── Planilha Estimada ──
function extractPlanilha(text: string): string {
  // Look for table-like structures with items and values
  const section = extractSection(
    text,
    [
      /(?:PLANILHA|QUADRO|TABELA)\s+(?:DE\s+)?(?:PREÇOS?|ESTIMATIV|QUANTITATIV|ORÇAMENT|ITENS)/i,
      /(?:ANEXO\s+(?:I{1,3}|[A-Z])\s*[-–—]?\s*(?:PLANILHA|PREÇOS?|ITENS))/i,
    ],
    [/\n\s*(?:CAPÍTULO|SEÇÃO|\d+[\.\)]\s+(?:D[AO]S?\s+))/i],
    3000
  );

  if (section) {
    return section.slice(0, 1500);
  }

  // Try to find individual items with values
  const itemPattern = /(?:item|lote)\s*(?:n[°º.]?\s*)?\d+\s*[-–:]\s*[^\n]{10,150}\s*R\$\s*[\d.,]+/gi;
  const items = text.match(itemPattern);
  if (items && items.length > 0) {
    return items.slice(0, 20).join('\n');
  }

  return "Não disponível no edital";
}

// ── Detect contextual features from full text ──
function detectFeatures(text: string) {
  const t = text.toLowerCase();
  return {
    isExclusivoMEEPP: /exclusiv[oa]\s*(para\s+)?(me|epp|microempresa|empresa\s+de\s+pequeno)/i.test(text),
    isSRP: /registro\s+de\s+preços|ata\s+de\s+registro/i.test(text),
    hasGarantia: /garantia\s+(de\s+)?(execução|contratual)|seguro[\-\s]garantia/i.test(text),
    hasVisitaTecnica: /visita\s+técnica/i.test(text),
    hasAmostra: /amostra/i.test(text) && !/sem\s+amostra/i.test(text),
    hasConsorcio: /consórcio/i.test(text),
    hasSubcontratacao: /subcontrata/i.test(text),
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
  };
}

// ── Resumo em Linguagem Simples (motor avançado) ──
function gerarResumoSimples(dados: Record<string, string>, timeline: Record<string, string | null>): string {
  const fullText = dados._fullText || '';
  const feat = detectFeatures(fullText);
  const sections: string[] = [];

  const orgao = dados.orgao !== "Não identificado" ? dados.orgao : "o órgão responsável";
  const modalidade = dados.modalidade !== "Não identificado" ? dados.modalidade.toLowerCase() : "licitação";
  const objeto = dados.objeto !== "Não identificado no edital" ? dados.objeto : null;
  const objetoClean = objeto ? (objeto.length > 250 ? objeto.slice(0, 247) + '...' : objeto) : null;
  const temValor = dados.valor_estimado !== "Não informado no edital";
  const temCriterio = dados.criterio !== "Não identificado";
  const temSessao = dados.data_sessao !== "Não identificado";
  const temSistema = dados.sistema !== "Não identificado";

  // ── 1. O QUE É ISSO? ──
  {
    let s = `🔎 O QUE É ESSE EDITAL?\n\n`;
    s += `Imagine que ${orgao} precisa contratar algo e, por lei, não pode simplesmente escolher quem quiser. `;
    s += `Precisa abrir um processo público — uma licitação — para que qualquer empresa interessada possa competir de forma justa.\n\n`;

    if (objetoClean) {
      s += `Neste caso, o que se quer contratar é:\n\n`;
      s += `> "${objetoClean}"\n\n`;
    }

    const modalExpl: Record<string, string> = {
      "pregão eletrônico": "O Pregão Eletrônico é a modalidade mais comum hoje em dia. Funciona como um leilão reverso pela internet: as empresas enviam propostas e depois disputam lances para oferecer o menor preço. Tudo acontece online, em tempo real.",
      "pregão presencial": "O Pregão Presencial funciona como o eletrônico, mas as empresas comparecem fisicamente ao local indicado para apresentar propostas e disputar lances ao vivo.",
      "concorrência": "A Concorrência é usada para contratos de maior vulto ou complexidade. Tem prazos mais longos e exigências de habilitação mais rigorosas.",
      "tomada de preços": "A Tomada de Preços é uma modalidade para valores intermediários, onde participam empresas já cadastradas no órgão ou que se cadastrem até o prazo previsto.",
      "dispensa": "A Dispensa de Licitação é uma exceção legal: o órgão pode contratar diretamente, sem competição, quando se enquadra em hipóteses previstas na lei (valor baixo, emergência, etc.).",
      "inexigibilidade": "A Inexigibilidade ocorre quando a competição é inviável — por exemplo, quando só existe um fornecedor possível ou quando se contrata um profissional de notória especialização.",
      "diálogo competitivo": "O Diálogo Competitivo é uma modalidade mais recente, usada para objetos complexos e inovadores. O órgão dialoga com os licitantes para construir a melhor solução antes de pedir propostas finais.",
    };
    const modalKey = Object.keys(modalExpl).find(k => modalidade.includes(k));
    if (modalKey) {
      s += `📌 ${modalExpl[modalKey]}`;
    }

    if (feat.isSRP) {
      s += `\n\n📋 Este edital é para **Registro de Preços** (SRP). Isso significa que o órgão não está comprando agora — está "registrando" preços para comprar quando precisar, durante a validade da ata (geralmente 12 meses). O fornecedor registrado tem a expectativa, mas não a garantia, de ser contratado.`;
    }
    if (feat.isExclusivoMEEPP) {
      s += `\n\n🏢 **ATENÇÃO — EXCLUSIVO PARA ME/EPP:** Apenas Microempresas e Empresas de Pequeno Porte podem participar desta licitação. Se sua empresa não se enquadra, infelizmente não poderá concorrer neste edital.`;
    } else if (feat.beneficioMEEPP) {
      s += `\n\n🏢 Microempresas e EPPs têm vantagens neste edital (Lei Complementar 123/2006): critério de desempate favorável, possibilidade de regularização fiscal tardia, entre outros benefícios.`;
    }
    sections.push(s);
  }

  // ── 2. QUANTO CUSTA E COMO SE DECIDE QUEM VENCE? ──
  {
    let s = `💰 QUANTO VALE E QUEM VENCE?\n\n`;

    if (temValor) {
      s += `O órgão estima gastar até **${dados.valor_estimado}** nesta contratação. `;
      s += `Esse é o valor máximo de referência — na prática, a Administração espera pagar menos, e propostas acima desse teto costumam ser desclassificadas.\n\n`;
    } else {
      s += `O edital optou por **não divulgar** o valor estimado (a lei permite isso em certos casos). O orçamento sigiloso pode estar disponível apenas para a comissão de licitação. Isso dificulta um pouco a precificação, mas não impede a participação.\n\n`;
    }

    if (temCriterio) {
      const crit = dados.criterio.toLowerCase();
      if (crit.includes("menor preço")) {
        s += `⚖️ **Critério: Menor Preço** — Aqui, preço é tudo. A empresa que oferecer o valor mais baixo (e cumprir todas as exigências) vence. Não há avaliação de qualidade técnica da proposta — apenas preço e conformidade documental.`;
        if (crit.includes("global")) s += ` O julgamento é pelo preço global (valor total), não item por item.`;
        if (crit.includes("por item")) s += ` O julgamento é por item — cada item pode ser vencido por uma empresa diferente.`;
        if (crit.includes("por lote")) s += ` O julgamento é por lote — os itens são agrupados e cada lote pode ser vencido por uma empresa diferente.`;
      } else if (crit.includes("maior desconto")) {
        s += `⚖️ **Critério: Maior Desconto** — Vence quem oferecer o maior percentual de desconto sobre a tabela de preços de referência. Atenção: o desconto incide sobre TODOS os itens da tabela, não apenas sobre alguns.`;
      } else if (crit.includes("técnica e preço")) {
        s += `⚖️ **Critério: Técnica e Preço** — Este é mais complexo. A proposta recebe duas notas: uma técnica e uma de preço, com pesos definidos no edital. NÃO basta ser o mais barato — a qualidade e experiência contam muito. Leia atentamente os critérios de pontuação técnica.`;
      } else if (crit.includes("melhor técnica")) {
        s += `⚖️ **Critério: Melhor Técnica** — A qualidade técnica é o fator decisivo. Após classificação técnica, negocia-se o preço. É essencial investir na proposta técnica.`;
      } else {
        s += `⚖️ Critério de julgamento: ${dados.criterio}.`;
      }
    }

    if (feat.regimeTributario) {
      s += `\n\nRegime de execução: **${feat.regimeTributario}**.`;
    }
    sections.push(s);
  }

  // ── 3. COMO PARTICIPAR (GUIA PRÁTICO) ──
  {
    let s = `🖥️ PASSO A PASSO PARA PARTICIPAR\n\n`;
    s += `Se você decidiu participar, aqui vai o roteiro prático:\n\n`;

    const passos: string[] = [];

    if (temSistema) {
      passos.push(`**Cadastre-se na plataforma:** Acesse o sistema ${dados.sistema}. Se ainda não tem cadastro, providencie com antecedência — o processo pode levar alguns dias.`);
    } else {
      passos.push(`**Identifique a plataforma:** Verifique no edital qual sistema eletrônico será usado e garanta que sua empresa está cadastrada.`);
    }

    passos.push(`**Leia TUDO:** Edital completo + todos os anexos. Parece óbvio, mas a maioria dos problemas vem de não ter lido algum detalhe. Atenção especial ao Termo de Referência e à Minuta do Contrato.`);

    passos.push(`**Verifique sua elegibilidade:** Antes de investir tempo na proposta, confira se sua empresa atende a TODOS os requisitos de habilitação (documentos, certidões, atestados). Não há como "dar um jeito" depois.`);

    passos.push(`**Monte a proposta comercial:** Siga exatamente o modelo do edital. Erros de formatação ou informações faltantes podem levar à desclassificação.`);

    passos.push(`**Prepare os documentos de habilitação:** Certidões negativas, balanço patrimonial, atestados técnicos — tudo com validade vigente na data da sessão.`);

    if (temSessao) {
      passos.push(`**Envie antes do prazo:** A proposta deve ser inserida na plataforma ANTES da sessão pública (${dados.data_sessao}). Não deixe para a última hora — problemas técnicos acontecem.`);
    } else {
      passos.push(`**Envie antes do prazo:** Insira a proposta na plataforma com antecedência. Problemas técnicos de última hora não são aceitos como justificativa.`);
    }

    passos.push(`**Participe da sessão:** Fique online durante a sessão pública. Haverá fase de lances (disputa em tempo real) e possivelmente negociação com o pregoeiro. Ter autonomia para dar lances rapidamente é uma vantagem.`);

    s += passos.map((p, i) => `${i + 1}. ${p}`).join('\n\n');
    sections.push(s);
  }

  // ── 4. O QUE VOCÊ PRECISA COMPROVAR ──
  {
    let s = `📑 DOCUMENTAÇÃO NECESSÁRIA\n\n`;
    s += `Para ser declarado vencedor, não basta ter o menor preço — é preciso comprovar que sua empresa é idônea e capaz. A habilitação geralmente se divide em quatro pilares:\n\n`;

    const cats: { emoji: string; title: string; desc: string; found: boolean }[] = [
      {
        emoji: "📜",
        title: "Habilitação Jurídica",
        desc: "Prova que sua empresa existe legalmente. Documentos típicos: contrato social atualizado, CNPJ, procuração (se representante).",
        found: /jurídica|ato\s+constitutivo|contrato\s+social|cnpj/i.test(fullText),
      },
      {
        emoji: "🏦",
        title: "Regularidade Fiscal e Trabalhista",
        desc: "Prova que a empresa está em dia com o governo. Inclui: CND federal, estadual, municipal, FGTS (CRF), CNDT (certidão trabalhista), INSS.",
        found: /regularidade\s+fiscal|certidão.*(?:federal|estadual|municipal)|fgts|inss|cndt/i.test(fullText),
      },
      {
        emoji: "🔧",
        title: "Qualificação Técnica",
        desc: "Prova que a empresa já fez algo parecido antes. Geralmente exige atestados de capacidade técnica emitidos por clientes anteriores, com quantidades mínimas compatíveis.",
        found: /qualificação\s+técnica|atestado|acervo|capacidade\s+técnica/i.test(fullText),
      },
      {
        emoji: "📊",
        title: "Qualificação Econômico-Financeira",
        desc: "Prova que a empresa tem saúde financeira para executar o contrato. Documentos típicos: balanço patrimonial, índices contábeis (LC, LG, SG), certidão negativa de falência.",
        found: /qualificação\s+econômico|balanço|capital\s+social|patrimônio\s+líquido|índice/i.test(fullText),
      },
    ];

    const found = cats.filter(c => c.found);
    const notFound = cats.filter(c => !c.found);

    if (found.length > 0) {
      s += `Neste edital, identificamos exigências nestas categorias:\n\n`;
      found.forEach(c => {
        s += `${c.emoji} **${c.title}:** ${c.desc}\n\n`;
      });
    }
    if (notFound.length > 0 && found.length > 0) {
      s += `As seguintes categorias não foram explicitamente identificadas na análise automatizada, mas podem constar no edital: ${notFound.map(c => c.title).join(', ')}.\n\n`;
    }
    if (found.length === 0) {
      s += `A análise automatizada não conseguiu detalhar as categorias específicas. Consulte a seção de habilitação diretamente no edital.\n\n`;
    }

    s += `💡 **Dica de ouro:** Monte um "kit de habilitação" padrão com todos os documentos básicos sempre atualizados. Assim, quando surgir uma licitação interessante, você já está meio caminho andado.`;
    sections.push(s);
  }

  // ── 5. DATAS QUE VOCÊ NÃO PODE PERDER ──
  {
    let s = `📅 DATAS IMPORTANTES\n\n`;
    const datas: string[] = [];

    if (timeline.data_publicacao) datas.push(`📰 **Publicação:** ${timeline.data_publicacao} — a partir desta data o edital é público e o "relógio" começa a contar.`);
    if (timeline.prazo_impugnacao) datas.push(`⚠️ **Impugnação até:** ${timeline.prazo_impugnacao} — se você encontrou algo ilegal ou restritivo no edital, TEM que questionar até esta data. Depois, perde o direito.`);
    if (timeline.prazo_esclarecimento) datas.push(`❓ **Esclarecimentos até:** ${timeline.prazo_esclarecimento} — dúvidas sobre o edital devem ser enviadas até aqui. O órgão é obrigado a responder.`);
    if (temSessao) datas.push(`🏁 **Sessão pública:** ${dados.data_sessao} — é neste dia e horário que as propostas são abertas e a disputa acontece.`);
    if (feat.hasPrazoExecucao) datas.push(`⏱️ **Prazo de execução:** ${feat.hasPrazoExecucao} — é o tempo que o vencedor terá para entregar/executar o objeto.`);

    if (datas.length > 0) {
      s += datas.join('\n\n');
      s += `\n\n🚫 **Atenção:** os prazos de impugnação e esclarecimento são **preclusivos** — se passar a data, acabou. Não tem recurso, não tem exceção.`;
    } else {
      s += `As datas específicas não foram encontradas na análise automatizada. Consulte o edital para o cronograma completo.`;
    }
    sections.push(s);
  }

  // ── 6. SE VOCÊ VENCER, O QUE ACONTECE? ──
  {
    let s = `🏆 VENCEU A LICITAÇÃO — E AGORA?\n\n`;
    s += `Ganhar a licitação é só o começo. Veja o que esperar após a homologação:\n\n`;
    const itens: string[] = [];

    if (feat.hasGarantia) {
      itens.push(`🔒 **Garantia contratual:** Você terá que depositar uma garantia (geralmente 5% do valor do contrato). Pode ser caução em dinheiro, seguro-garantia ou fiança bancária. Inclua esse custo no seu preço.`);
    }
    if (feat.localEntrega) {
      itens.push(`📍 **Local:** ${feat.localEntrega}. Calcule frete e logística.`);
    }
    if (feat.hasPrazoExecucao) {
      itens.push(`⏰ **Prazo:** ${feat.hasPrazoExecucao} para executar/entregar. Atrasos geram multas e podem levar a sanções graves.`);
    }
    if (feat.isServicoContinuado) {
      itens.push(`🔄 **Serviço continuado:** O contrato terá vigência prolongada (geralmente 12 meses), podendo ser prorrogado. Planeje sua operação para o longo prazo.`);
    }
    if (feat.hasReajuste) {
      itens.push(`📈 **Reajuste:** Há previsão de reajuste de preços. Verifique qual índice (IPCA, INPC, etc.) e a periodicidade no edital.`);
    }
    if (feat.hasPagamento) {
      itens.push(`💳 **Pagamento:** O órgão pagará em até ${feat.hasPagamento} após a entrega/prestação e o aceite formal. Planeje seu fluxo de caixa.`);
    }
    if (feat.hasPenalidades) {
      itens.push(`⚡ **Penalidades:** O edital prevê sanções para descumprimento — desde multas até impedimento de licitar por anos. Leve a sério.`);
    }
    if (feat.hasMatrizRisco) {
      itens.push(`📋 **Matriz de Risco:** O edital tem uma matriz de risco. Analise com cuidado quais riscos ficam com você e quais ficam com a Administração. Isso afeta diretamente o seu preço.`);
    }

    if (itens.length > 0) {
      s += itens.join('\n\n');
    } else {
      s += `Consulte o edital e a minuta do contrato para entender as obrigações pós-contratação, prazos de entrega e condições de pagamento.`;
    }
    sections.push(s);
  }

  // ── 7. CUIDADO COM ESSES PONTOS ──
  {
    const alertas: string[] = [];

    if (feat.hasVisitaTecnica) {
      alertas.push(`🏗️ **Visita Técnica:** O edital menciona visita técnica. Se for obrigatória, agende o quanto antes — sem ela, sua proposta pode ser inabilitada. Se for facultativa, vá mesmo assim: conhecer o local evita surpresas na execução.`);
    }
    if (feat.hasAmostra) {
      alertas.push(`🧪 **Amostra:** Pode ser exigida apresentação de amostra do produto após a fase de lances. Tenha o material pronto para envio imediato — o prazo costuma ser curto.`);
    }
    if (feat.hasProvaConceito) {
      alertas.push(`💻 **Prova de Conceito (PoC):** O edital prevê demonstração prática do produto/serviço. Prepare um ambiente de teste e garanta que tudo funciona antes da sessão.`);
    }
    if (feat.hasConsorcio) {
      alertas.push(`🤝 **Consórcio:** O edital trata de participação em consórcio. Se você é uma empresa menor, pode ser uma oportunidade de se unir a outros para competir. Verifique as regras específicas.`);
    }
    if (feat.hasSubcontratacao) {
      alertas.push(`🔗 **Subcontratação:** É permitida subcontratação parcial. Atenção ao limite percentual e às condições — a responsabilidade perante o órgão continua sendo integralmente sua.`);
    }
    if (feat.hasSustentabilidade) {
      alertas.push(`🌱 **Critérios Ambientais:** O edital exige conformidade com critérios de sustentabilidade. Verifique se seus produtos/processos atendem (certificações ambientais, descarte adequado, etc.).`);
    }
    if (feat.hasEstudoTecnico) {
      alertas.push(`📐 **Estudo Técnico Preliminar (ETP):** O edital menciona um ETP. Este documento justifica a contratação e pode conter informações valiosas sobre o que o órgão realmente precisa. Vale a leitura.`);
    }

    if (alertas.length > 0) {
      let s = `🚨 PONTOS QUE MERECEM SUA ATENÇÃO\n\n`;
      s += alertas.join('\n\n');
      sections.push(s);
    }
  }

  // ── 8. RESUMO EXECUTIVO ──
  {
    let s = `✅ RESUMO FINAL\n\n`;
    const bullets: string[] = [];
    bullets.push(`**O quê:** ${modalidade}${feat.isSRP ? ' (Registro de Preços)' : ''}`);
    bullets.push(`**Quem:** ${orgao}`);
    if (objetoClean) bullets.push(`**Para quê:** ${objetoClean.length > 120 ? objetoClean.slice(0, 117) + '...' : objetoClean}`);
    if (temValor) bullets.push(`**Quanto:** ${dados.valor_estimado}`);
    if (temCriterio) bullets.push(`**Como vence:** ${dados.criterio}`);
    if (temSessao) bullets.push(`**Quando:** ${dados.data_sessao}`);
    if (temSistema) bullets.push(`**Onde:** ${dados.sistema}`);

    s += bullets.map(b => `• ${b}`).join('\n');

    s += `\n\n---\n\n📌 **Aviso importante:** Este resumo foi gerado automaticamente por análise textual do edital — sem uso de inteligência artificial. Ele serve como guia de leitura, mas **NÃO substitui a leitura completa do edital e seus anexos**. Decisões de participação devem sempre se basear no documento oficial.`;
    sections.push(s);
  }

  return sections.join('\n\n---\n\n');
}

// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo enviado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.type !== "application/pdf") {
      return new Response(
        JSON.stringify({ error: "O arquivo deve ser um PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    let text: string;
    try {
      text = await extractTextFromPdf(buffer);
    } catch (e) {
      console.error("PDF text extraction failed:", e);
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem escaneada." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!text || text.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: "O PDF não contém texto suficiente. Pode ser um documento escaneado (imagem)." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Extract all fields via regex/parsing
    const numero_edital = extractNumeroEdital(text);
    const modalidade = extractModalidade(text);
    const orgao = extractOrgao(text);
    const objeto = extractObjeto(text);
    const valor_estimado = extractValorEstimado(text);
    const criterio_julgamento = extractCriterio(text);
    const data_sessao = extractDataSessao(text);
    const sistema_licitacao = extractSistema(text);
    const condicoes_habilitacao = extractHabilitacao(text);
    const planilha_estimada = extractPlanilha(text);
    const timeline = extractTimeline(text);

    // 3. Heuristic complexity score
    const score_complexidade = calcularComplexidade(text, {
      valor_estimado,
      criterio: criterio_julgamento,
    });

    // 4. Template-based summary
    const resumo_simples = gerarResumoSimples({
      numero_edital,
      modalidade,
      orgao,
      objeto,
      valor_estimado,
      criterio: criterio_julgamento,
      data_sessao,
      sistema: sistema_licitacao,
      habilitacao: condicoes_habilitacao,
      _fullText: text,
    }, timeline);

    const result = {
      numero_edital,
      modalidade,
      orgao,
      objeto,
      valor_estimado,
      planilha_estimada,
      criterio_julgamento,
      data_sessao,
      condicoes_habilitacao,
      sistema_licitacao,
      resumo_simples,
      timeline,
      score_complexidade,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao analisar o edital" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
