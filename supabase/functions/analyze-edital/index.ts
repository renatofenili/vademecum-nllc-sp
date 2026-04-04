const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── PDF Text Extraction ──

/**
 * Repairs common ligature / encoding artefacts produced by unpdf when the
 * PDF uses ToUnicode CMap entries that split multi-byte glyphs incorrectly.
 *
 * Pattern: a capital letter appears in the middle of a lowercase word where
 * the original glyph was a ligature (ti→A, fi→B, fl→C, etc.).
 * Examples:  "AdministraAvas" → "Administrativas"
 *            "JusAça"         → "Justiça"
 *            "licitaAção"     → "licitação"
 */
function repairLigatures(text: string): string {
  // Map of known broken patterns → correct replacements
  const replacements: Array<[RegExp, string]> = [
    // ti ligature broken as uppercase A mid-word
    [/([a-záàâãéêíóôõúç])A(vas?\b)/gi, (_m, pre, suf) => `${pre}ti${suf.toLowerCase()}`],
    [/([a-záàâãéêíóôõúç])A(ção|cão|ca\b|ções|cões)/gi, (_m, pre, suf) => `${pre}ti${suf.toLowerCase()}`],
    [/([a-záàâãéêíóôõúç])A(vo|va|vos|vas|vidade|vidades|vamente)/gi, (_m, pre, suf) => `${pre}ti${suf.toLowerCase()}`],

    // Generic: "JusAça" pattern — capital letter surrounded by lowercase on both sides
    // that doesn't make sense in Portuguese
    [/\bJus(A)(ça)\b/g, "Justiça"],
    [/\bjus(A)(ça)\b/g, "justiça"],
    [/\bAdministra(A)(vas?)\b/gi, (_m, _a, suf) => `Administra\u200Btivas`],
  ];

  let result = text;

  // Broad heuristic: a single uppercase letter between two lowercase sequences
  // that creates a nonsense word is likely a broken ligature.
  // Replace A → ti, B → fi, C → fl (most common ligature mappings)
  result = result.replace(
    /([a-záàâãéêíóôõúç]{2,})(A)([a-záàâãéêíóôõúç]{2,})/g,
    (match, pre, _mid, suf) => {
      const candidate = `${pre}ti${suf}`;
      // Only replace if the original looks broken (uppercase in middle of word)
      if (/[a-záàâãéêíóôõúç]$/.test(pre) && /^[a-záàâãéêíóôõúç]/.test(suf)) {
        return candidate;
      }
      return match;
    }
  );

  // Clean up zero-width spaces used as markers
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

const INSTITUTION_KEYWORD_REGEX = /\b(prefeitura|munic[ií]pio|secretaria|minist[eé]rio|governo|estado|c[aâ]mara|tribunal|funda[cç][aã]o|autarquia|universidade|instituto|companhia|empresa\s+(?:p[úu]blica|municipal)|departamento|servi[cç]o\s+aut[oô]nomo|cons[oó]rcio|ag[eê]ncia|superintend[eê]ncia)\b/i;
const INSTITUTION_CAPTURE_REGEX = /(?:prefeitura(?:\s+municipal)?|munic[ií]pio\s+de|governo\s+do(?:\s+estado\s+de)?|secretaria(?:\s+(?:municipal|estadual|de\s+estado))?(?:\s+de)?|c[aâ]mara(?:\s+municipal)?|tribunal(?:\s+de\s+[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][^,.;\n]{0,60})?|funda[cç][aã]o|autarquia|universidade|instituto|minist[eé]rio|superintend[eê]ncia|ag[eê]ncia|companhia|empresa\s+(?:p[úu]blica|municipal)|departamento|servi[cç]o\s+aut[oô]nomo|cons[oó]rcio)[^,.;\n]{2,180}/i;

function normalizeInstitutionCase(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  if (compact === compact.toUpperCase() && /[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(compact)) {
    const smallWords = new Set(["de", "da", "do", "das", "dos", "e"]);
    return compact
      .toLowerCase()
      .split(" ")
      .map((word, index) => {
        if (index > 0 && smallWords.has(word)) return word;
        if (/^[ivxlcdm]+$/i.test(word)) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function cleanOrgaoName(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  const extracted = compact.match(INSTITUTION_CAPTURE_REGEX);

  let value = (extracted?.[0] ?? compact)
    .replace(/^\s*(?:órgão(?:\s+gerenciador|\s+licitante|\s+responsável)?|entidade|contratante|unidade\s+gestora|secretaria\s+requisitante)\s*[:.]?\s*/i, "")
    .replace(/^\s*(?:a|o)\s+/i, "")
    .trim();

  value = value
    .replace(/\s+(?:esplanada|rua|avenida|av\.?|praça|travessa|rodovia|bairro|cep|telefone|site|e-?mail|http|www\.|bloco\b|anexo\b|sala\b|andar\b)\s*[\s\S]*$/i, "")
    .replace(/\s*,?\s*(?:publicad[ao]|realizar[áa]|promover[áa]|instaurar[áa]?|torna\s+p[úu]blico|situad[ao]|inscrit[ao]|cadastrad[ao]|representad[ao]|neste\s+ato)\b[\s\S]*$/i, "")
    .replace(/\s+(?:por\s+meio|por\s+interm[eé]dio|atrav[ée]s)\s+d[ao]\b[\s\S]*$/i, "")
    .replace(/\s*[-–—:]\s*(?:cnpj|uasg|ug|processo|preg[ãa]o|pregao|concorr[êe]ncia|edital)\b[\s\S]*$/i, "")
    .replace(/\s*,?\s*(?:no|na)\s+(?:d\.o\.[ue]\.?|imprensa\s+oficial|forma\s+eletr[ôo]nica)\b[\s\S]*$/i, "")
    .replace(/[;:,\-–—]+$/, "")
    .trim();

  if (!value) return "";
  if (value.length < 4 || value.length > 140) return "";
  if (!INSTITUTION_KEYWORD_REGEX.test(value)) return "";
  if (/\b(realizar[áa]|licitaç[ãa]o|preg[ãa]o|pregao|concorr[êe]ncia|edital|objeto|publicad[ao]|sess[ãa]o|proposta|fornecimento|contrataç[ãa]o|crit[ée]rio)\b/i.test(value)) return "";

  return normalizeInstitutionCase(value);
}

function scoreOrgaoCandidate(value: string): number {
  let score = 0;

  const positiveSignals: Array<[RegExp, number]> = [
    [/\bminist[eé]rio\b/i, 14],
    [/\bsecretaria\b/i, 12],
    [/\btribunal\b/i, 11],
    [/\buniversidade\b/i, 11],
    [/\binstituto\b/i, 10],
    [/\bprefeitura\b/i, 10],
    [/\bmunic[ií]pio\b/i, 10],
    [/\bc[aâ]mara\b/i, 10],
    [/\bgoverno\b/i, 9],
    [/\bfunda[cç][aã]o\b/i, 9],
    [/\bautarquia\b/i, 9],
    [/\bsuperintend[eê]ncia\b/i, 8],
    [/\bag[eê]ncia\b/i, 8],
    [/\bcompanhia\b/i, 7],
    [/\bempresa\s+(?:p[úu]blica|municipal)\b/i, 7],
    [/\bdepartamento\b/i, 7],
    [/\bservi[cç]o\s+aut[oô]nomo\b/i, 7],
  ];

  const negativeSignals: Array<[RegExp, number]> = [
    [/\blicitaç[ãa]o\b/i, 16],
    [/\bpreg[ãa]o\b/i, 16],
    [/\bconcorr[êe]ncia\b/i, 16],
    [/\bedital\b/i, 14],
    [/\bpublicad[ao]\b/i, 16],
    [/\brealizar[áa]\b/i, 16],
    [/\bsess[ãa]o\b/i, 10],
    [/\bproposta\b/i, 10],
    [/\bd\.o\.[ue]\.?/i, 12],
    [/\bobjeto\b/i, 12],
    [/\bfornecimento\b/i, 10],
    [/\bcrit[ée]rio\b/i, 8],
  ];

  for (const [pattern, points] of positiveSignals) {
    if (pattern.test(value)) score += points;
  }

  for (const [pattern, points] of negativeSignals) {
    if (pattern.test(value)) score -= points;
  }

  if (/^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ\s\-\/]+$/.test(value)) score += 3;
  if (value.length > 60) score -= 2;
  if (value.length > 90) score -= 6;

  return score;
}

function extractOrgao(text: string): string {
  const header = text.replace(/\r\n/g, "\n").slice(0, 12000);
  const preEditalBlock = header.split(/\bEDITAL\b/i)[0] || header.slice(0, 2500);
  const candidates: Array<{ value: string; score: number; index: number }> = [];

  const addCandidate = (raw: string | null | undefined, boost = 0, index = 0) => {
    if (!raw) return;
    const cleaned = cleanOrgaoName(raw);
    if (!cleaned) return;

    const score = scoreOrgaoCandidate(cleaned) + boost - (index > header.length * 0.6 ? 2 : 0);
    if (score >= 10) candidates.push({ value: cleaned, score, index });
  };

  const labeledPatterns = [
    /(?:^|\n)\s*(?:órgão(?:\s+gerenciador|\s+licitante|\s+responsável)?|entidade|contratante|unidade\s+gestora|secretaria\s+requisitante)\s*[:.]\s*([^\n]{4,200})/gim,
    /(?:por\s+interm[eé]dio\s+d[ao]|por\s+meio\s+d[ao]|atrav[ée]s\s+d[ao])\s+((?:minist[eé]rio|secretaria|prefeitura|munic[ií]pio|governo|tribunal|c[aâ]mara|funda[cç][aã]o|autarquia|universidade|instituto|superintend[eê]ncia|ag[eê]ncia|companhia|empresa\s+(?:p[úu]blica|municipal)|departamento|servi[cç]o\s+aut[oô]nomo|cons[oó]rcio)[^,.;\n]{4,180})/gim,
  ];

  for (const pattern of labeledPatterns) {
    for (const match of header.matchAll(pattern)) {
      addCandidate(match[1] || match[0], 34, match.index ?? 0);
    }
  }

  const contextualPatterns = [
    /(?:^|\n)\s*((?:minist[eé]rio|prefeitura(?:\s+municipal)?|munic[ií]pio\s+de|governo\s+do(?:\s+estado\s+de)?|secretaria(?:\s+(?:municipal|estadual|de\s+estado))?(?:\s+de)?|c[aâ]mara(?:\s+municipal)?|tribunal(?:\s+de\s+[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][^,.;\n]{0,60})?|funda[cç][aã]o|autarquia|universidade|instituto|superintend[eê]ncia|ag[eê]ncia|companhia|empresa\s+(?:p[úu]blica|municipal)|departamento|servi[cç]o\s+aut[oô]nomo|cons[oó]rcio)[^\n]{0,220})/gim,
  ];

  for (const pattern of contextualPatterns) {
    for (const match of preEditalBlock.matchAll(pattern)) {
      addCandidate(match[1] || match[0], 24, match.index ?? 0);
    }
  }

  const lines = preEditalBlock
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 40);

  for (const line of lines) {
    if (INSTITUTION_KEYWORD_REGEX.test(line)) {
      addCandidate(line, line === line.toUpperCase() ? 16 : 12, header.indexOf(line));
    }
  }

  const inlineMatches = header.match(new RegExp(INSTITUTION_CAPTURE_REGEX.source, "gi")) || [];
  for (const match of inlineMatches) {
    addCandidate(match, 10, header.indexOf(match));
  }

  const unique = Array.from(
    new Map(
      candidates
        .sort((a, b) => b.score - a.score || a.index - b.index || a.value.length - b.value.length)
        .map((item) => [item.value.toLowerCase(), item])
    ).values()
  ).sort((a, b) => b.score - a.score || a.index - b.index || a.value.length - b.value.length);

  return unique[0]?.value || "Não identificado";
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

  for (const section of extractObjetoSectionCandidates(norm)) {
    const context = norm.slice(Math.max(0, section.index - 500), section.index);
    const primarySectionCandidate = extractPrimaryObjetoFromSection(section.content);

    if (primarySectionCandidate) addCandidate(primarySectionCandidate, 36, context, section.index);

    const explicitSentence = firstMatch(section.content.replace(/\n+/g, " "), [
      /(?:descri(?:ção|cao)\s*[:.\-–—]?\s*)?(?:o\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo\s+de\s+referência|contrato)\s+(?:é|consiste\s+em|tem\s+por\s+(?:finalidade|objetivo)|visa|destina(?:[\-\s]?se)?\s+a)|constitui\s+objeto\s+(?:do\s+presente\s+)?(?:edital|pregão|certame|licitação|contratação|termo|contrato)|a\s+presente\s+(?:licitação|contratação)\s+tem\s+por\s+objeto)\s+(?:a\s+)?((?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)[^.]{20,700})/i,
    ]);
    if (explicitSentence) addCandidate(explicitSentence, 24, context, section.index);

    addCandidate(section.content, 10, context, section.index);
  }

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

function stripObjetoLabel(text: string): string {
  return text
    .replace(/^(?:descri(?:ção|cao)(?:\s+do\s+objeto)?|objeto|do\s+objeto|finalidade|especifica(?:ção|cao))\s*[:.\-–—]?\s*/i, "")
    .trim();
}

function shouldMergeObjetoLines(current: string, next: string): boolean {
  const upcoming = next.trim();
  if (!upcoming) return false;

  if (/^(?:cap[íi]tulo|seção|título|cláusula|anexo)\b/i.test(upcoming)) return false;
  if (/^(?:\d+(?:\.\d+){0,5}|[ivxlcdm]+)[\.\)]\s+(?:do|da|dos|das|cap[íi]tulo|seção|título|cláusula|anexo)\b/i.test(upcoming)) return false;
  if (/^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][A-ZÁÀÃÂÉÊÍÓÔÕÚÇ\s\-\/]{5,}$/.test(upcoming)) return false;

  if (/^(?:descri(?:ção|cao)|objeto|do\s+objeto|finalidade|especifica(?:ção|cao))\b[:.\-–—]?\s*$/i.test(current)) return true;
  if (/[,;:\-–—]\s*$/.test(current)) return true;
  if (/^[a-zà-ÿ(]/.test(upcoming)) return true;

  if (/[.!?]\s*$/.test(current) && !/^(?:e|ou|com|para|por|sem|de|da|do|das|dos)\b/i.test(upcoming.toLowerCase())) {
    return false;
  }

  return hasStrongObjetoSignal(current) && current.length < 180 && upcoming.length < 180;
}

function buildObjetoLineWindows(raw: string): string[] {
  const lines = raw
    .split("\n")
    .map((line) => stripObjetoNumbering(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const windows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let combined = lines[i];
    windows.push(combined);

    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (!shouldMergeObjetoLines(combined, lines[j])) break;
      combined = `${combined} ${lines[j]}`.replace(/\s+/g, " ").trim();
      windows.push(combined);
      if (combined.length > 420) break;
    }
  }

  return Array.from(new Set(windows));
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

function stripObjetoTail(text: string): string {
  let result = text
    // Truncate at next numbered clause (e.g. "1.2.", "1.3.", "2.1.")
    .replace(/\s+\d+\.\d+[\.\)]\s[\s\S]*$/, "")
    .replace(/\s*,?\s*conforme\s+(?:as?\s+)?(?:especifica(?:ç|c)[õo]es?|condiç(?:õ|o)es?|quantitativos?)\s+(?:técnicas?\s+)?(?:constantes?\s+)?(?:do|da|de)\s+(?:termo\s+de\s+referência|anexo(?:s)?(?:\s*[a-z0-9ivxlcdm\-]+)?|edital|instrumento\s+convocatório|projeto\s+básico|estudo\s+técnico\s+preliminar|planilha|memorial)\b[\s\S]*$/i, "")
    .replace(/\s*,?\s*(?:na\s+forma|nos\s+termos|de\s+acordo)\s+(?:do|da|dos|das)\s+(?:termo\s+de\s+referência|anexo(?:s)?(?:\s*[a-z0-9ivxlcdm\-]+)?|edital|instrumento\s+convocatório|projeto\s+básico)\b[\s\S]*$/i, "")
    .replace(/\s*,?\s*que\s+integra\s+(?:este|o)?\s*edital\b[\s\S]*$/i, "")
    .replace(/\s*,?\s*(?:observadas?|obedecidas?)\s+as?\s+(?:especifica(?:ç|c)[õo]es?|condiç(?:õ|o)es?)\b[\s\S]*$/i, "")
    .replace(/\s*,?\s*anexo(?:s)?\s*[a-z0-9ivxlcdm\-]+\.?$/i, "")
    .trim();
  return result;
}

function normalizeObjetoCandidate(text: string): string {
  let value = text.replace(/\s+/g, " ").trim();
  value = stripObjetoLabel(value);
  value = stripObjetoLeadIn(value);

  const action = value.match(/\b(contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)\b/i);
  if (action && typeof action.index === "number" && action.index > 0 && action.index < 140) {
    value = value.slice(action.index);
  }

  value = stripObjetoTail(value)
    .replace(/^[:.\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;:,\.\-–—]+$/, "")
    .trim();

  return value;
}

function extractPrimaryObjetoFromSection(section: string): string | null {
  const leadingBlock = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("\n");

  const ranked = buildObjetoLineWindows(leadingBlock)
    .map((raw) => {
      const cleaned = normalizeObjetoCandidate(raw);
      if (!cleaned || cleaned.length < 20 || !hasStrongObjetoSignal(cleaned) || isLikelyNonObjetoClause(cleaned)) {
        return null;
      }

      let score = scoreObjetoCandidate(cleaned);
      if (/^(?:descri(?:ção|cao)|objeto|do\s+objeto)\b/i.test(raw)) score += 12;
      if (/^(?:contratação|aquisição|fornecimento|prestação(?:\s+de\s+serviços?)?|execução(?:\s+de\s+obras?)?|registro\s+de\s+preços|locação|credenciamento|seleção\s+da\s+proposta(?:\s+mais\s+vantajosa)?|concessão|permissão|alienação|cessão|chamamento\s+público|parceria|implantação|reforma|ampliação)\b/i.test(cleaned)) {
        score += 10;
      }

      return { value: cleaned, score };
    })
    .filter((item): item is { value: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length);

  return ranked[0]?.value ?? null;
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
  const normalized = buildObjetoLineWindows(raw)
    .map((line) => normalizeObjetoCandidate(line))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (line.length < 20) return false;
      if (/^(objeto|descri(?:ção|cao)|cláusula|cap[íi]tulo|seção|anexo)\b/i.test(line) && line.length < 60) return false;
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

const CRITERIO_BASE_REGEX = /\b(menor\s+preço|maior\s+desconto|técnica\s+e\s+preço|tecnica\s+e\s+preco|melhor\s+técnica|melhor\s+tecnica|maior\s+oferta|maior\s+lance|maior\s+retorno\s+econômico)\b/i;

function normalizeCriterio(raw: string): string {
  let value = raw.replace(/\s+/g, " ").trim();

  value = value
    .replace(/^(?:crit[ée]rio\s+de\s+julgamento|tipo\s+de\s+(?:licita(?:ç|c)[ãa]o|julgamento))\s*[:.\-–—]?\s*/i, "")
    .replace(/^(?:o\s+julgamento\s+será\s+o\s+de|ser[áa]\s+adotado\s+o\s+crit[ée]rio\s+de|adotar-se-á\s+o\s+crit[ée]rio\s+de|as\s+propostas?\s+ser[aã]o\s+julgadas?\s+pelo?\s+crit[ée]rio\s+de)\s*/i, "")
    .replace(/\s*,?\s*(?:conforme|observadas?|nos\s+termos|para\s+fins|na\s+forma|previsto)\b[\s\S]*$/i, "")
    .replace(/\s+(?:modo\s+de\s+disputa|disputa\s+(?:aberto|fechado))\b[\s\S]*$/i, "")
    .replace(/[;:,\.\-–—]+$/, "")
    .trim();

  const plain = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const byItem = /por\s+itens?|item(?:ns)?/.test(plain);
  const byLote = /por\s+lotes?|lote(?:s)?/.test(plain);
  const byGrupo = /por\s+grupos?|grupo(?:s)?/.test(plain);
  const global = /\bglobal\b/.test(plain);

  if (/menor\s+preco/.test(plain)) {
    if (global) return "Menor preço global";
    if (byItem) return "Menor preço por item";
    if (byLote) return "Menor preço por lote";
    if (byGrupo) return "Menor preço por grupo";
    return "Menor preço";
  }

  if (/maior\s+desconto/.test(plain)) return "Maior desconto";
  if (/tecnica\s+e\s+preco/.test(plain)) return "Técnica e preço";
  if (/melhor\s+tecnica/.test(plain)) return "Melhor técnica";
  if (/maior\s+oferta/.test(plain)) return "Maior oferta";
  if (/maior\s+lance/.test(plain)) return "Maior lance";
  if (/maior\s+retorno\s+economico/.test(plain)) return "Maior retorno econômico";

  return "";
}

function scoreCriterioCandidate(raw: string, cleaned: string): number {
  let score = 0;
  const value = raw.toLowerCase();

  if (/crit[ée]rio\s+de\s+julgamento|tipo\s+de\s+(?:licita(?:ç|c)[ãa]o|julgamento)/i.test(value)) score += 18;
  if (/o\s+julgamento\s+será\s+o\s+de|ser[áa]\s+adotado\s+o\s+crit[ée]rio\s+de|adotar-se-á\s+o\s+crit[ée]rio\s+de/i.test(value)) score += 14;
  if (CRITERIO_BASE_REGEX.test(value)) score += 16;
  if (/\bglobal\b|por\s+item|por\s+lote|por\s+grupo/i.test(value)) score += 4;
  if (/modo\s+de\s+disputa|disputa\s+(?:aberto|fechado)/i.test(value)) score -= 12;
  if (/sess[ãa]o|habilita|objeto/i.test(value) && !/crit[ée]rio|julgamento/i.test(value)) score -= 6;
  if (!cleaned) score -= 20;
  if (value.length > 120) score -= 4;

  return score;
}

function extractCriterio(text: string): string {
  const norm = text.replace(/\r\n/g, "\n");
  const header = norm.slice(0, 20000);
  const candidates: Array<{ value: string; score: number; index: number }> = [];

  const addCandidate = (raw: string | null | undefined, boost = 0, index = 0) => {
    if (!raw) return;
    const cleaned = normalizeCriterio(raw);
    const score = scoreCriterioCandidate(raw, cleaned) + boost - (index > header.length * 0.7 ? 2 : 0);
    if (cleaned && score >= 12) {
      candidates.push({ value: cleaned, score, index });
    }
  };

  const patterns = [
    /(?:crit[ée]rio\s+de\s+julgamento|tipo\s+de\s+(?:licita(?:ç|c)[ãa]o|julgamento))\s*[:.\-–—]?\s*([^\n.;]{8,120})/gi,
    /(?:o\s+julgamento\s+será\s+o\s+de|ser[áa]\s+adotado\s+o\s+crit[ée]rio\s+de|adotar-se-á\s+o\s+crit[ée]rio\s+de|as\s+propostas?\s+ser[aã]o\s+julgadas?\s+pelo?\s+crit[ée]rio\s+de)\s+([^\n.;]{8,120})/gi,
    /((?:menor\s+preço|maior\s+desconto|técnica\s+e\s+preço|tecnica\s+e\s+preco|melhor\s+técnica|melhor\s+tecnica|maior\s+oferta|maior\s+lance|maior\s+retorno\s+econômico)(?:\s+(?:global|por\s+item|por\s+lote|por\s+grupo|por\s+itens|por\s+lotes|por\s+grupos))?)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of header.matchAll(pattern)) {
      addCandidate(match[1] || match[0], 12, match.index ?? 0);
    }
  }

  const lines = header
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/crit[ée]rio|julgamento|menor\s+preço|maior\s+desconto|técnica\s+e\s+preço|tecnica\s+e\s+preco|melhor\s+técnica|melhor\s+tecnica|maior\s+oferta|maior\s+lance|maior\s+retorno\s+econômico/i.test(line)) {
      addCandidate(line, 8, header.indexOf(line));
    }
  }

  const unique = Array.from(
    new Map(
      candidates
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((item) => [item.value.toLowerCase(), item])
    ).values()
  ).sort((a, b) => b.score - a.score || a.index - b.index);

  return unique[0]?.value || "Não identificado";
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

// ── Complexity Score (conservative calibration) ──
interface ComplexidadeResult {
  valor: number;
  faixa: string;
  justificativa: string;
  fatores_elevaram: string[];
  fatores_impediram: string[];
  frase_faixa: string;
}

function getFaixa(score: number): string {
  if (score <= 2) return "muito simples";
  if (score <= 4) return "simples";
  if (score <= 6) return "moderado";
  if (score <= 8) return "complexo";
  return "muito complexo";
}

function calcularComplexidade(text: string, dados: Record<string, string>): ComplexidadeResult {
  const textLower = text.toLowerCase();

  // ── Detect base profile ──
  const isPregao = /pregão\s+eletrônico/i.test(text);
  const isBensComuns = /\b(aquisição|fornecimento|compra|material|bens?\s+comun|bens?\s+de\s+consumo|equipamento)\b/i.test(text)
    && !/\b(serviço\s+(?:de\s+natureza\s+)?continu|prestação\s+de\s+serviços?\s+(?:de\s+natureza\s+)?continu|execução\s+de\s+obras?|obra)\b/i.test(text);
  const isMenorPreco = /menor\s+preço/i.test(text);
  const isPregaoBensComuns = isPregao && isBensComuns && isMenorPreco;

  // ── Anchor: pregão de bens comuns starts at 3 ──
  let score = isPregaoBensComuns ? 3 : 3.5;

  const fatoresElevaram: string[] = [];
  const fatoresImpediram: string[] = [];

  // ── Strong aggravators (each counts toward the 2-aggravator threshold) ──
  let strongAggravators = 0;

  const addStrong = (points: number, label: string) => {
    score += points;
    fatoresElevaram.push(label);
    strongAggravators++;
  };

  // Amostra eliminatória
  if (/(?:exig|apresent|entreg)\w*\s+(?:de\s+)?amostra/i.test(text) && !/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i.test(text) && !/sem\s+(?:necessidade\s+de\s+)?amostra/i.test(text)) {
    addStrong(1.5, "Amostra exigida — eliminatória se reprovada ou não apresentada");
  }

  // Qualificação técnica robusta (atestados com requisitos de volume/percentual)
  if (/atestado[^.]{0,200}(?:comprovan|demonstran)[^.]{0,200}(?:no\s+mínimo|pelo\s+menos|mínimo\s+de)\s*\d/i.test(text)
    || /(?:crea|cau|registro\s+(?:no\s+)?conselho)/i.test(text)) {
    addStrong(1, "Qualificação técnica robusta — atestados com requisitos específicos");
  }

  // Garantia de execução
  if (/garantia\s+(?:de\s+)?(?:execução|contratual)\s+(?:será|deverá|é)\s+(?:exigid|apresentad|prestad)/i.test(text)
    || /exig(?:e|ir)\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)
    || /seguro[\-\s]garantia/i.test(text)) {
    if (!/(?:não\s+(?:será|é)\s+exigid|dispensad|não\s+(?:haverá|há))\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
      addStrong(1, "Garantia de execução exigida — compromete caixa da empresa");
    }
  }

  // Visita técnica obrigatória
  if (/visita\s+técnica/i.test(text)) {
    addStrong(0.8, "Visita técnica — pode ser obrigatória e eliminatória");
  }

  // Execução contratual complexa (serviço continuado, SLA, obrigação continuada)
  if (/serviço\s+(?:de\s+natureza\s+)?continu/i.test(text) || /(?:sla|nível\s+de\s+serviço|acordo\s+de\s+nível)/i.test(text)) {
    addStrong(1, "Execução contratual complexa — serviço continuado ou SLA");
  }

  // Técnica e preço
  if (/técnica\s+e\s+preço/i.test(text)) {
    addStrong(1.5, "Julgamento por técnica e preço — exige proposta técnica detalhada");
  }

  // Prova de conceito
  if (/prova\s+de\s+conceito/i.test(text)) {
    addStrong(1, "Prova de conceito — demanda preparação técnica e pode eliminar");
  }

  // Risco econômico-sancionatório acima do padrão
  const multaMatch = text.match(/multa\s+(?:de\s+)?((?:\d+[,.]?\d*)\s*%)/i);
  const multaPercent = multaMatch ? parseFloat(multaMatch[1].replace(",", ".")) : 0;
  if (multaPercent >= 10 || /declaração\s+de\s+inidoneidade/i.test(text)) {
    addStrong(0.8, `Risco sancionatório elevado${multaPercent >= 10 ? ` — multa de ${multaPercent}%` : ""}`);
  }

  // Forte densidade técnica (obra, engenharia, sistema de informação complexo)
  if (/execução\s+de\s+obras?/i.test(text) || /\b(bdi|composição\s+de\s+custos|planilha\s+orçamentária\s+detalhada)\b/i.test(text)) {
    addStrong(1.5, "Forte densidade técnica — obra ou composição de custos detalhada");
  }

  // ── Moderate factors (lighter weight) ──
  if (/propost[ao]\s+(?:readequada|ajustada|adequada)/i.test(text)) {
    score += 0.3;
    fatoresElevaram.push("Proposta readequada exigida após lances");
  }

  if (/(?:catálogo|ficha\s+técnica|laudo)\s+(?:deverá|será|deve)\s+(?:ser\s+)?(?:apresentad|enviad|juntad)/i.test(text)) {
    score += 0.3;
    fatoresElevaram.push("Catálogo, ficha técnica ou laudo exigido");
  }

  if (/(?:exclusiv[oa]\s*(para\s+)?(me|epp|microempresa))/i.test(text)) {
    score += 0.2;
    fatoresElevaram.push("Participação exclusiva para ME/EPP");
  }

  if (/marca|modelo|fabricante/i.test(text) && /proposta|oferta|cotação/i.test(text)) {
    score += 0.2;
    fatoresElevaram.push("Indicação de marca/modelo/fabricante na proposta");
  }

  // Value-based adjustment (conservative — only for very high values)
  const valorStr = dados.valor_estimado?.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const valorNum = parseFloat(valorStr || "0");
  if (valorNum > 50000000) { score += 1; fatoresElevaram.push("Valor acima de R$ 50 milhões"); }
  else if (valorNum > 10000000) { score += 0.5; fatoresElevaram.push("Valor acima de R$ 10 milhões"); }

  // SRP (minor factor)
  if (/sistema\s+de\s+registro\s+de\s+preços|ata\s+de\s+registro/i.test(text)) {
    score += 0.2;
    fatoresElevaram.push("Sistema de registro de preços");
  }

  // Subcontratação
  if (/subcontrata/i.test(text)) {
    score += 0.3;
    fatoresElevaram.push("Prevê subcontratação");
  }

  // Matriz de risco
  if (/matriz\s+de\s+risco/i.test(text)) {
    score += 0.3;
    fatoresElevaram.push("Exige matriz de risco");
  }

  // ── CAP: pregão de bens comuns sem 2+ strong aggravators = max 6.5 ──
  if (isPregaoBensComuns && strongAggravators < 2) {
    if (score > 6.5) {
      score = 6.5;
      fatoresImpediram.push("Pregão eletrônico de bens comuns sem dois ou mais agravantes fortes — nota limitada a 6,5");
    }
  }

  // ── Factors that PREVENTED higher score ──
  if (!(/(?:exig|apresent|entreg)\w*\s+(?:de\s+)?amostra/i.test(text) && !/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i.test(text))) {
    fatoresImpediram.push("Sem exigência de amostra eliminatória");
  }
  if (/(?:não\s+(?:será|é)\s+exigid|dispensad|não\s+(?:haverá|há))\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
    fatoresImpediram.push("Garantia de execução dispensada");
  } else if (!/garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
    fatoresImpediram.push("Sem exigência de garantia contratual");
  }
  if (!/visita\s+técnica/i.test(text)) {
    fatoresImpediram.push("Sem exigência de visita técnica");
  }
  if (!/técnica\s+e\s+preço/i.test(text)) {
    fatoresImpediram.push("Julgamento não é por técnica e preço");
  }
  if (isPregaoBensComuns) {
    fatoresImpediram.push("Pregão eletrônico de bens comuns — perfil de complexidade-base baixo");
  }

  // ── DO NOT elevate for: ──
  // - mere document length (NOT a complexity factor)
  // - standard sanctions present in virtually every edital
  // - standard habilitação requirements

  // ── Final rounding and clamping ──
  score = Math.min(10, Math.max(1, Math.round(score * 2) / 2)); // round to nearest 0.5

  const faixa = getFaixa(score);
  const justificativa = fatoresElevaram.length > 0
    ? `Score ${score}/10 (${faixa}). Fatores que elevaram: ${fatoresElevaram.join("; ")}.`
    : `Score ${score}/10 (${faixa}). Edital com características padrão, sem agravantes fortes identificados.`;

  const fraseFaixa = isPregaoBensComuns && score <= 5
    ? `Pregão eletrônico padrão de bens comuns, com habilitação ordinária e disputa por menor preço — classificado como ${faixa}.`
    : `Edital classificado como ${faixa} com base em ${strongAggravators} agravante(s) forte(s) identificado(s) no texto.`;

  return {
    valor: score,
    faixa,
    justificativa,
    fatores_elevaram: fatoresElevaram,
    fatores_impediram: fatoresImpediram,
    frase_faixa: fraseFaixa,
  };
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
    hasGarantiaProduto: /garantia\s+(?:do\s+)?(?:produto|equipamento|material|bem|mercadoria)/i.test(text),
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
    // ── Extended detections ──
    vedacaoConsorcio: /(?:não\s+(?:será|serão)\s+(?:admitid|permitid|aceit)|veda(?:da|do)|proibid)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i.test(text),
    hasSICAF: /sicaf/i.test(text),
    hasCAUFESP: /caufesp/i.test(text),
    hasCadastroPreObrigatorio: /cadastr(?:o|amento)\s+(?:prévio|obrigatório|no\s+(?:sicaf|portal|sistema))/i.test(text),
    hasCredenciamento: /credenciamento/i.test(text),
    hasMarcaModelo: /marca|modelo|fabricante/i.test(text) && /proposta|oferta|cotação/i.test(text),
    hasCatalogo: /catálogo|ficha\s+técnica|laudo/i.test(text),
    hasPrecoMaximo: /preço\s+(?:máximo|unitário\s+máximo|de\s+referência)|valor\s+(?:máximo|de\s+referência)/i.test(text),
    validadeProposta: firstMatch(text, [
      /validade\s+d[aoe]s?\s+propostas?\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?))/i,
      /propostas?\s+ter[ãa]o?\s+validade\s+(?:de\s+)?(\d+\s*(?:dias?|meses?))/i,
    ]),
    prazoAssinatura: firstMatch(text, [
      /prazo\s+(?:para\s+)?(?:assinatura|celebração)\s+(?:do\s+)?contrato\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos))?)/i,
      /assinar\s+(?:o\s+)?contrato\s+(?:em\s+até|no\s+prazo\s+de)\s+(\d+\s*(?:dias?|meses?))/i,
    ]),
    prazoEntrega: firstMatch(text, [
      /prazo\s+(?:de\s+)?entrega\s*(?:será\s+de|de|:)\s*(\d+\s*(?:dias?|meses?)(?:\s*(?:úteis|corridos|consecutivos|após\s+[^\n]{0,60})?)?)/i,
      /entreg(?:ar|ue)\s+(?:em\s+até|no\s+prazo\s+de)\s+(\d+\s*(?:dias?|meses?))/i,
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
    hasMulta: firstMatch(text, [
      /multa\s+(?:de\s+)?(?:até\s+)?(\d+[,.]?\d*\s*%[^\n]{0,80})/i,
    ]),
    hasImpedimentoSancao: /impedid[oa]\s+de\s+licitar|declarad[oa]\s+inid[ôo]ne[oa]|suspens[ãa]o\s+(?:do\s+)?direito\s+de\s+licitar/i.test(text),
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

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function buildCriterionHint(criterio: string): string | null {
  const value = criterio.toLowerCase();
  if (value.includes("menor preço global")) return "vence a proposta mais barata para o valor total do objeto, desde que a empresa esteja habilitada.";
  if (value.includes("menor preço por item")) return "cada item pode ser vencido por uma empresa diferente; o foco é o menor valor por item.";
  if (value.includes("menor preço por lote")) return "vence o menor valor para cada lote, e não necessariamente para o edital inteiro.";
  if (value.includes("maior desconto")) return "vence quem oferecer o maior desconto sobre a referência do edital.";
  if (value.includes("técnica e preço")) return "preço não basta: a nota técnica também pesa no resultado.";
  if (value.includes("melhor técnica")) return "a qualidade técnica é o ponto central da disputa.";
  return null;
}

// ── Truth validation helpers ──
function truthCheck(text: string, positivePatterns: RegExp[], negativePatterns: RegExp[]): "sim" | "nao" | "nao_identificado" {
  for (const neg of negativePatterns) {
    if (neg.test(text)) return "nao";
  }
  for (const pos of positivePatterns) {
    if (pos.test(text)) return "sim";
  }
  return "nao_identificado";
}

// ── Resumo em Linguagem Simples (análise holística em 16 seções) ──
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
  const sistema = dados.sistema !== "Não identificado" ? dados.sistema : null;
  const criterioHint = criterio ? buildCriterionHint(criterio) : null;

  // ── Truth validations (mandatory before generating output) ──
  const consorcioStatus = truthCheck(fullText,
    [/(?:será|serão)\s+(?:admitid|permitid|aceit)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i, /admite[\-\s]se\s+consórcio/i, /consórcio\s+(?:será|é)\s+admitido/i],
    [/(?:não\s+(?:será|serão)\s+(?:admitid|permitid|aceit)|veda(?:da|do)|proibid)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i]
  );
  const exclusividadeMEEPP = truthCheck(fullText,
    [/(?:participação|licitação|disputa)\s+(?:é\s+)?exclusiv[oa]\s+(?:para\s+)?(?:me|epp|microempresa|empresa\s+de\s+pequeno\s+porte)/i, /exclusiv[oa]\s+(?:para\s+)?(?:me|epp|microempresa)/i],
    []
  );
  const garantiaExecucao = truthCheck(fullText,
    [/garantia\s+(?:de\s+)?(?:execução|contratual)\s+(?:será|deverá|é)\s+(?:exigid|apresentad|prestad)/i, /exig(?:e|ir)\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i, /seguro[\-\s]garantia/i],
    [/(?:não\s+(?:será|é)\s+exigid|dispensad|não\s+(?:haverá|há))\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i, /garantia\s+(?:de\s+)?execução[^.]{0,30}(?:dispensad|não\s+(?:será|é)\s+exigid)/i]
  );
  const srpStatus = truthCheck(fullText,
    [/sistema\s+de\s+registro\s+de\s+preços/i, /ata\s+de\s+registro\s+de\s+preços/i, /registro\s+de\s+preços\s+para/i],
    []
  );
  const amostraStatus = truthCheck(fullText,
    [/(?:exig|apresent|entreg)\w*\s+(?:de\s+)?amostra/i, /amostra\s+(?:deverá|será|deve)\s+(?:ser\s+)?(?:apresentad|entregu|enviad)/i],
    [/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i, /sem\s+(?:necessidade\s+de\s+)?amostra/i]
  );
  const catalogoStatus = truthCheck(fullText,
    [/(?:exig|apresent)\w*\s+(?:de\s+)?(?:catálogo|ficha\s+técnica|laudo)/i, /(?:catálogo|ficha\s+técnica|laudo)\s+(?:deverá|será|deve)\s+(?:ser\s+)?(?:apresentad|enviad|juntad)/i],
    []
  );
  const marcaModeloStatus = truthCheck(fullText,
    [/(?:indicar|informar|constar)\s+(?:a?\s+)?(?:marca|modelo|fabricante)\s+(?:na\s+proposta|do\s+produto|do\s+equipamento)/i, /(?:marca|modelo|fabricante)\s+(?:deverá|deve|será)\s+(?:ser\s+)?(?:indicad|informad)/i],
    []
  );
  const precoMaximoStatus = truthCheck(fullText,
    [/preço\s+(?:máximo|unitário\s+máximo)\s+(?:aceitável|admitido|de\s+referência)/i, /valor\s+(?:máximo|de\s+referência)\s+(?:aceitável|admitido)/i, /não\s+(?:será|serão)\s+aceit\w+\s+(?:proposta|valor|preço)\s+(?:superior|acima)/i],
    []
  );
  const prazoAssinaturaVal = feat.prazoAssinatura || null;
  const prazoEntregaVal = feat.prazoEntrega || null;

  // Disputa unit detection
  const disputaUnit = (() => {
    const t = fullText.toLowerCase();
    if (/(?:por\s+item|menor\s+preço\s+(?:por\s+)?item|disputa\s+por\s+item|julgamento\s+por\s+item)/i.test(fullText)) return "por item";
    if (/(?:por\s+lote|menor\s+preço\s+(?:por\s+)?lote|disputa\s+por\s+lote|julgamento\s+por\s+lote)/i.test(fullText)) return "por lote";
    if (/(?:por\s+grupo|menor\s+preço\s+(?:por\s+)?grupo|disputa\s+por\s+grupo)/i.test(fullText)) return "por grupo";
    if (/\bglobal\b/.test(t) && /menor\s+preço/i.test(fullText)) return "global";
    return null;
  })();

  // Modo de disputa
  const modoDisputa = feat.hasModoAbFechado ? "aberto e fechado" : feat.hasModoDisputaAberto ? "aberto" : feat.hasModoDisputaFechado ? "fechado" : null;

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

    if (srpStatus === "sim") p.push("Trata-se de sistema de registro de preços, o que significa que a Administração registra os preços para contratações futuras conforme a necessidade, sem obrigação de compra imediata.");
    if (exclusividadeMEEPP === "sim") p.push("A participação é exclusiva para microempresas e empresas de pequeno porte.");
    else if (exclusividadeMEEPP === "nao_identificado") p.push("O edital não indica de forma expressa restrição de participação por porte empresarial.");
    if (sistema) p.push(`A disputa ocorre na plataforma ${sistema}.`);
    if (sessao) p.push(`A sessão pública está marcada para ${sessao}.`);
    if (valor) p.push(`O valor estimado é de ${valor}.`);

    // Dificuldade
    const score = dados._scoreComplexidade ? parseInt(dados._scoreComplexidade) : 0;
    if (score >= 7) p.push("A participação exige atenção redobrada: o edital apresenta diversas exigências que elevam a complexidade.");
    else if (score >= 4) p.push("A participação exige cuidado com a documentação e prazos, mas não apresenta barreiras atípicas.");
    else p.push("A participação aparenta ser direta, sem exigências atípicas além das habituais.");

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

  // ── 3. LEITURA IMEDIATA PARA O LICITANTE ──
  {
    const pontos: string[] = [];
    if (exclusividadeMEEPP === "sim") pontos.push("• Participação exclusiva para ME/EPP.");
    else pontos.push("• Participação ampla (não identificada restrição por porte).");
    if (consorcioStatus === "nao") pontos.push("• Consórcio vedado.");
    else if (consorcioStatus === "sim") pontos.push("• Consórcio admitido.");
    else pontos.push("• Consórcio: não identificado de forma expressa no edital.");
    if (feat.hasSICAF) pontos.push("• Cadastro no SICAF exigido.");
    if (feat.hasCAUFESP) pontos.push("• Cadastro no CAUFESP exigido.");
    if (feat.hasCredenciamento) pontos.push("• Credenciamento prévio exigido.");
    if (disputaUnit) pontos.push(`• Disputa ${disputaUnit}.`);
    if (amostraStatus === "sim") pontos.push("• Amostra exigida.");
    else if (amostraStatus === "nao") pontos.push("• Amostra não exigida.");
    if (catalogoStatus === "sim") pontos.push("• Catálogo, ficha técnica ou laudo exigido.");
    if (marcaModeloStatus === "sim") pontos.push("• Indicação de marca, modelo ou fabricante na proposta.");
    if (feat.validadeProposta) pontos.push(`• Validade da proposta: ${feat.validadeProposta}.`);
    if (prazoEntregaVal) pontos.push(`• Prazo de entrega: ${prazoEntregaVal}.`);
    if (garantiaExecucao === "sim") pontos.push("• Garantia contratual exigida.");
    else if (garantiaExecucao === "nao") pontos.push("• Garantia contratual não exigida.");
    if (feat.hasGarantiaProduto) pontos.push("• Garantia do produto exigida.");
    if (precoMaximoStatus === "sim") pontos.push("• Há preço máximo de referência. Proposta acima do teto será desclassificada.");
    if (feat.hasMulta) pontos.push(`• Multa prevista: ${feat.hasMulta}.`);
    if (prazoAssinaturaVal) pontos.push(`• Prazo para assinatura do contrato: ${prazoAssinaturaVal}.`);
    if (feat.propostaReadequada) pontos.push("• Proposta readequada será exigida após a fase de lances.");
    if (srpStatus === "sim") pontos.push("• Registro de preços: a contratação não é imediata.");
    if (feat.hasVisitaTecnica) pontos.push("• Visita técnica exigida.");
    sections.push(`⚡ 3. LEITURA IMEDIATA PARA O LICITANTE\n\n${pontos.join("\n")}`);
  }

  // ── 4. DIAGNÓSTICO EXECUTIVO ──
  {
    const score = dados._scoreComplexidade ? parseInt(dados._scoreComplexidade) : 0;
    let nivel = "moderado";
    if (score >= 7) nivel = "complexo";
    else if (score <= 3) nivel = "simples";

    const diag: string[] = [];
    diag.push(`Avaliação geral: edital ${nivel} para participação (score ${score}/10).`);

    const barreiras: string[] = [];
    if (feat.hasAmostra || amostraStatus === "sim") barreiras.push("exigência de amostra");
    if (feat.hasVisitaTecnica) barreiras.push("visita técnica obrigatória");
    if (garantiaExecucao === "sim") barreiras.push("garantia contratual");
    if (feat.hasSICAF || feat.hasCAUFESP) barreiras.push("cadastro prévio obrigatório");
    if (barreiras.length > 0) diag.push(`Principais barreiras de entrada: ${barreiras.join(", ")}.`);
    else diag.push("Não foram identificadas barreiras de entrada atípicas.");

    const eliminacao: string[] = [];
    eliminacao.push("documentação de habilitação incompleta ou vencida");
    if (amostraStatus === "sim") eliminacao.push("amostra reprovada ou não apresentada");
    if (precoMaximoStatus === "sim") eliminacao.push("proposta acima do preço máximo");
    if (feat.hasVisitaTecnica) eliminacao.push("não realização de visita técnica");
    diag.push(`Pontos que podem eliminar a empresa: ${eliminacao.join("; ")}.`);

    if (garantiaExecucao === "sim" || feat.hasPagamento) {
      const caixa: string[] = [];
      if (garantiaExecucao === "sim") caixa.push("a garantia contratual compromete recursos financeiros");
      if (feat.hasPagamento) caixa.push(`o pagamento é em ${feat.hasPagamento}, o que exige capital de giro`);
      diag.push(`Impacto no caixa: ${caixa.join("; ")}.`);
    }

    if (feat.hasAmostra || feat.hasVisitaTecnica || feat.hasCatalogo || feat.hasProvaConceito) {
      diag.push("Custo operacional elevado por exigências técnicas pré-sessão.");
    }

    if (feat.hasPenalidades || feat.hasMulta) {
      diag.push("O edital prevê penalidades relevantes — avalie o risco sancionatório antes de participar.");
    }

    const urgencias: string[] = [];
    if (feat.hasSICAF || feat.hasCAUFESP) urgencias.push("confirmar cadastro");
    if (feat.hasVisitaTecnica) urgencias.push("agendar visita técnica");
    if (feat.hasCredenciamento) urgencias.push("efetuar credenciamento na plataforma");
    if (urgencias.length > 0) diag.push(`Providências imediatas: ${urgencias.join(", ")}.`);

    sections.push(`🔍 4. DIAGNÓSTICO EXECUTIVO\n\n${diag.join("\n\n")}`);
  }

  // ── 5. O QUE ESTÁ SENDO COMPRADO ──
  {
    if (objeto) {
      sections.push(`🛒 5. O QUE ESTÁ SENDO COMPRADO\n\n${objeto}\n\n${srpStatus === "sim" ? "Como se trata de registro de preços, a Administração registra os valores e contrata conforme a demanda efetiva, sem obrigação de compra imediata." : "A contratação será formalizada após a homologação do resultado."}`);
    } else {
      sections.push(`🛒 5. O QUE ESTÁ SENDO COMPRADO\n\nNão identificado de forma expressa no edital. Ponto que exige conferência no documento original.`);
    }
  }

  // ── 6. COMO A DISPUTA FUNCIONA ──
  {
    const disp: string[] = [];
    disp.push(`• Modalidade: ${modalidade}.`);
    if (criterio) disp.push(`• Critério de julgamento: ${criterio}.`);
    if (disputaUnit) disp.push(`• Unidade da disputa: ${disputaUnit}.`);
    if (modoDisputa) disp.push(`• Modo de disputa: ${modoDisputa}.`);
    else disp.push("• Modo de disputa: não identificado de forma expressa no edital.");
    if (feat.hasLC123 || feat.beneficioMEEPP) disp.push("• Tratamento diferenciado para ME/EPP conforme LC 123/2006.");
    if (feat.hasNegociacao) disp.push("• O edital prevê negociação após a fase de lances.");
    if (feat.hasDesempate) disp.push("• Há regras de desempate previstas.");
    if (precoMaximoStatus === "sim") disp.push("• Há preço máximo de referência. Propostas acima serão desclassificadas.");
    else if (precoMaximoStatus === "nao_identificado") disp.push("• Preço máximo: não identificado de forma expressa no edital.");
    sections.push(`⚔️ 6. COMO A DISPUTA FUNCIONA\n\n${disp.join("\n")}`);
  }

  // ── 7. QUEM PODE PARTICIPAR ──
  {
    const part: string[] = [];
    if (exclusividadeMEEPP === "sim") part.push("• Participação exclusiva para microempresas e empresas de pequeno porte.");
    else part.push("• Participação ampla — empresas de qualquer porte podem participar, desde que atendam às exigências de habilitação.");
    if (consorcioStatus === "nao") part.push("• Consórcio: vedado expressamente pelo edital.");
    else if (consorcioStatus === "sim") part.push("• Consórcio: admitido pelo edital.");
    else part.push("• Consórcio: não identificado de forma expressa no edital.");
    if (feat.hasSICAF) part.push("• Cadastro no SICAF é exigido.");
    if (feat.hasCAUFESP) part.push("• Cadastro no CAUFESP é exigido.");
    if (feat.hasCredenciamento) part.push("• É necessário credenciamento prévio na plataforma de disputa.");
    if (feat.hasImpedimentoSancao) part.push("• Empresas impedidas de licitar, suspensas ou declaradas inidôneas estão vedadas.");
    if (feat.hasCotaReservada) part.push("• Há cota reservada para ME/EPP.");
    sections.push(`👥 7. QUEM PODE PARTICIPAR\n\n${part.join("\n")}`);
  }

  // ── 8. CHECKLIST ANTES DE PARTICIPAR ──
  {
    const check: string[] = [];
    if (sistema) check.push(`☐ Verificar cadastro e credenciamento na plataforma ${sistema}.`);
    if (feat.hasSICAF) check.push("☐ Conferir situação cadastral no SICAF (validade dos documentos).");
    if (feat.hasCAUFESP) check.push("☐ Conferir situação no CAUFESP.");
    check.push("☐ Separar todos os documentos de habilitação exigidos no edital.");
    check.push("☐ Verificar validade de certidões (CND Federal, Estadual, Municipal, FGTS, CNDT).");
    check.push("☐ Analisar o Termo de Referência com atenção para entender as especificações.");
    if (amostraStatus === "sim") check.push("☐ Preparar amostra conforme especificações do edital.");
    if (catalogoStatus === "sim") check.push("☐ Separar catálogo, ficha técnica ou laudo do produto.");
    if (marcaModeloStatus === "sim") check.push("☐ Confirmar marca e modelo a serem ofertados.");
    check.push("☐ Calcular custos detalhados (incluindo frete, impostos, encargos).");
    if (garantiaExecucao === "sim") check.push("☐ Providenciar garantia contratual (seguro-garantia, fiança bancária ou caução).");
    if (feat.hasVisitaTecnica) check.push("☐ Agendar visita técnica, se obrigatória.");
    check.push("☐ Preparar proposta inicial com todos os itens exigidos.");
    if (feat.propostaReadequada) check.push("☐ Estar preparado para enviar proposta readequada após a fase de lances.");
    if (prazoEntregaVal) check.push(`☐ Avaliar capacidade de entrega no prazo de ${prazoEntregaVal}.`);
    sections.push(`✅ 8. CHECKLIST: O QUE FAZER ANTES DE PARTICIPAR\n\n${check.join("\n")}`);
  }

  // ── 9. DOCUMENTOS DE HABILITAÇÃO ──
  {
    const habLines = dados.habilitacao
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (habLines.length > 0 && dados.habilitacao !== "Consultar seção de habilitação no edital") {
      const comentarios: string[] = [];
      comentarios.push("Cada bloco abaixo representa uma categoria de documentos. A ausência de qualquer item pode resultar em inabilitação imediata, mesmo que a proposta tenha o menor preço.");
      comentarios.push("");
      comentarios.push(...habLines);
      comentarios.push("");
      comentarios.push("Efeito prático: confira cada item com antecedência. Certidões vencidas e documentos incompletos são as causas mais frequentes de inabilitação.");
      sections.push(`📑 9. DOCUMENTOS DE HABILITAÇÃO\n\n${comentarios.join("\n")}`);
    } else {
      sections.push(`📑 9. DOCUMENTOS DE HABILITAÇÃO\n\nO edital contém seção de habilitação, mas os detalhes específicos devem ser conferidos diretamente no documento original.`);
    }
  }

  // ── 10. PROPOSTA COMERCIAL ──
  {
    const prop: string[] = [];
    prop.push("A proposta deve conter os valores detalhados conforme exigido no edital:");
    if (precoMaximoStatus === "sim") prop.push("• Há preço máximo de referência. Propostas com valores superiores serão desclassificadas.");
    else if (precoMaximoStatus === "nao_identificado") prop.push("• Preço máximo: não identificado de forma expressa no edital.");
    if (marcaModeloStatus === "sim") prop.push("• O edital exige indicação de marca, modelo e/ou fabricante na proposta.");
    if (feat.validadeProposta) prop.push(`• A proposta deve ter validade mínima de ${feat.validadeProposta}.`);
    prop.push("• Os custos devem contemplar frete, impostos, encargos e todas as despesas para entrega/execução.");
    if (feat.propostaReadequada) prop.push("• Após a fase de lances, o vencedor deverá enviar proposta readequada ao valor final negociado.");
    if (catalogoStatus === "sim") prop.push("• Pode ser exigido catálogo, ficha técnica ou laudo junto à proposta.");
    sections.push(`💰 10. PROPOSTA COMERCIAL\n\n${prop.join("\n")}`);
  }

  // ── 11. PRAZOS CRÍTICOS (só se 3+ marcos) ──
  {
    const prazos: string[] = [];
    if (feat.inicioPropostas) prazos.push(`• Início do envio de propostas: ${feat.inicioPropostas}.`);
    if (sessao) prazos.push(`• Data e hora da sessão pública: ${sessao}.`);
    if (feat.validadeProposta) prazos.push(`• Validade da proposta: ${feat.validadeProposta}.`);
    if (feat.propostaReadequada) prazos.push("• Prazo para envio de proposta readequada: conforme definido no edital após a sessão.");
    if (feat.prazoDocComplementar) prazos.push(`• Prazo para envio de documentos complementares: ${feat.prazoDocComplementar}.`);
    if (prazoEntregaVal) prazos.push(`• Prazo de entrega: ${prazoEntregaVal}.`);
    if (feat.prazoSubstituicao) prazos.push(`• Prazo para substituição de produtos: ${feat.prazoSubstituicao}.`);
    if (prazoAssinaturaVal) prazos.push(`• Prazo para assinatura do contrato: ${prazoAssinaturaVal}.`);
    if (feat.prazoRecurso) prazos.push(`• Prazo para recurso: ${feat.prazoRecurso}.`);
    if (timeline.prazo_impugnacao) prazos.push(`• Prazo para impugnação: ${timeline.prazo_impugnacao}.`);
    if (timeline.prazo_esclarecimento) prazos.push(`• Prazo para pedido de esclarecimento: ${timeline.prazo_esclarecimento}.`);
    if (timeline.data_publicacao) prazos.push(`• Data de publicação: ${timeline.data_publicacao}.`);
    if (feat.hasPagamento) prazos.push(`• Prazo de pagamento: ${feat.hasPagamento}.`);
    if (prazos.length >= 3) sections.push(`📅 11. PRAZOS CRÍTICOS\n\n${prazos.join("\n")}`);
  }

  // ── 12. RISCOS DO EDITAL ──
  {
    const riscos: string[] = [];
    // Habilitação
    riscos.push("📂 Risco de habilitação");
    riscos.push("Fato: o edital exige documentação completa de habilitação jurídica, fiscal, técnica e econômico-financeira.");
    riscos.push("Efeito: a falta de qualquer documento resulta em inabilitação imediata, independentemente do preço ofertado.");
    riscos.push("Atenção: certidões vencidas, balanço patrimonial incompleto ou atestado técnico insuficiente são as causas mais comuns de eliminação.");

    // Técnico
    if (amostraStatus === "sim" || feat.hasVisitaTecnica || feat.hasProvaConceito || catalogoStatus === "sim") {
      riscos.push("");
      riscos.push("🔬 Risco técnico");
      if (amostraStatus === "sim") {
        riscos.push("Fato: o edital exige apresentação de amostra.");
        riscos.push("Efeito: se a amostra for reprovada ou não apresentada no prazo, a empresa é desclassificada.");
        riscos.push("Atenção: prepare a amostra com antecedência e confira as especificações.");
      }
      if (feat.hasVisitaTecnica) {
        riscos.push("Fato: visita técnica prevista no edital.");
        riscos.push("Efeito: a não realização pode impedir a participação.");
        riscos.push("Atenção: agende com antecedência junto ao órgão.");
      }
      if (feat.hasProvaConceito) {
        riscos.push("Fato: o edital exige prova de conceito.");
        riscos.push("Efeito: demanda preparação técnica específica. A reprovação elimina.");
      }
      if (catalogoStatus === "sim") {
        riscos.push("Fato: exigência de catálogo, ficha técnica ou laudo.");
        riscos.push("Efeito: a não apresentação pode levar à desclassificação.");
      }
    }

    // Comercial
    riscos.push("");
    riscos.push("💵 Risco comercial");
    if (precoMaximoStatus === "sim") {
      riscos.push("Fato: há preço máximo de referência.");
      riscos.push("Efeito: proposta acima do teto será desclassificada.");
    }
    riscos.push("Fato: a proposta deve contemplar todos os custos (frete, impostos, encargos).");
    riscos.push("Efeito: erro de cálculo pode gerar prejuízo na execução ou desclassificação por inexequibilidade.");

    // Operacional
    if (prazoEntregaVal || feat.hasPrazoExecucao || feat.localEntrega) {
      riscos.push("");
      riscos.push("🏗️ Risco operacional");
      if (prazoEntregaVal) {
        riscos.push(`Fato: o prazo de entrega é de ${prazoEntregaVal}.`);
        riscos.push("Efeito: descumprimento pode gerar multa e sanção.");
        riscos.push("Atenção: avalie se a cadeia de suprimentos permite cumprir.");
      }
      if (feat.hasPrazoExecucao) {
        riscos.push(`Fato: o prazo de execução é de ${feat.hasPrazoExecucao}.`);
        riscos.push("Efeito: o não cumprimento pode gerar multa e sanção.");
      }
      if (feat.localEntrega) {
        riscos.push(`Fato: local de entrega/execução: ${feat.localEntrega}.`);
        riscos.push("Atenção: considere custos logísticos adicionais.");
      }
    }

    // Financeiro
    if (garantiaExecucao === "sim" || feat.hasPagamento) {
      riscos.push("");
      riscos.push("💳 Risco financeiro");
      if (garantiaExecucao === "sim") {
        riscos.push("Fato: o edital exige garantia contratual.");
        riscos.push("Efeito: compromete recursos da empresa (até 5% do valor do contrato, em geral).");
      }
      if (feat.hasPagamento) {
        riscos.push(`Fato: o pagamento previsto é em ${feat.hasPagamento}.`);
        riscos.push("Efeito: a empresa financiará a operação durante esse intervalo. Avalie o impacto no capital de giro.");
      }
    }

    // Prazo
    riscos.push("");
    riscos.push("⏰ Risco de prazo");
    riscos.push("Fato: prazos para envio de documentos, proposta readequada e assinatura são rígidos.");
    riscos.push("Efeito: o descumprimento de prazo resulta em decadência do direito, desclassificação ou perda da adjudicação.");

    // Sancionatório
    if (feat.hasPenalidades || feat.hasMulta) {
      riscos.push("");
      riscos.push("⚖️ Risco sancionatório");
      if (feat.hasMulta) {
        riscos.push(`Fato: o edital prevê multa de ${feat.hasMulta}.`);
        riscos.push("Efeito: impacto direto sobre o resultado da operação.");
      }
      riscos.push("Fato: descumprimento contratual pode resultar em multa, suspensão do direito de licitar ou declaração de inidoneidade.");
      riscos.push("Atenção: avalie a capacidade de cumprir integralmente as obrigações antes de participar.");
    }

    // Execução
    if (srpStatus === "sim" || feat.isServicoContinuado || feat.hasSubcontratacao) {
      riscos.push("");
      riscos.push("📋 Risco de execução contratual");
      if (srpStatus === "sim") riscos.push("Como é registro de preços, a empresa deve manter capacidade de fornecimento durante toda a vigência da ata, mesmo sem certeza de contratação.");
      if (feat.isServicoContinuado) riscos.push("Serviço continuado exige estrutura permanente para execução.");
      if (feat.hasSubcontratacao) riscos.push("O edital prevê subcontratação, o que adiciona complexidade de gestão.");
    }

    sections.push(`⚠️ 12. RISCOS DO EDITAL\n\n${riscos.join("\n")}`);
  }

  // ── 13. PONTOS DE ATENÇÃO ──
  {
    const alertas: string[] = [];
    if (amostraStatus === "sim") alertas.push("🔸 Amostra exigida — a empresa deve apresentar amostra no prazo. A não apresentação ou reprovação elimina.");
    if (garantiaExecucao === "sim") alertas.push("🔸 Garantia contratual exigida — envolve custo financeiro. Avalie as opções (seguro-garantia, fiança, caução).");
    else if (garantiaExecucao === "nao") alertas.push("🔸 Garantia contratual não exigida neste edital.");
    if (feat.hasGarantiaProduto) alertas.push("🔸 Garantia do produto — verifique o prazo e as condições exigidas.");
    if (srpStatus === "sim") alertas.push("🔸 Registro de preços — a Administração não é obrigada a contratar. A ata gera expectativa, não certeza de receita.");
    else if (srpStatus === "nao_identificado") alertas.push("🔸 O edital não indica de forma expressa que se trata de registro de preços.");
    if (marcaModeloStatus === "sim") alertas.push("🔸 Marca/modelo — confira se a exigência é indicativa ou restritiva. Marcas diferentes podem ser aceitas se houver equivalência.");
    if (catalogoStatus === "sim") alertas.push("🔸 Catálogo/ficha técnica/laudo — a ausência pode levar à desclassificação.");
    if (precoMaximoStatus === "sim") alertas.push("🔸 Preço máximo — propostas acima do valor de referência serão desclassificadas.");
    if (prazoEntregaVal && /\d+\s*dias?\s*(?:úteis|corridos)?$/i.test(prazoEntregaVal)) alertas.push("🔸 Prazo de entrega — confira se é em dias úteis ou corridos. A diferença é significativa.");
    if (feat.hasMulta) alertas.push(`🔸 Multa — o edital prevê multa de ${feat.hasMulta}. Leia o capítulo de sanções.`);
    if (feat.hasImpedimentoSancao) alertas.push("🔸 Impedimento — empresas sancionadas estão vedadas. Confira a situação cadastral.");
    if (feat.hasSICAF || feat.hasCAUFESP) alertas.push("🔸 Cadastro obrigatório — confira a validade e completude do cadastro exigido.");
    if (feat.hasVisitaTecnica) alertas.push("🔸 Visita técnica — pode ser obrigatória. A não realização pode impedir a participação.");
    if (consorcioStatus === "nao") alertas.push("🔸 Consórcio vedado — empresas só podem participar individualmente.");
    if (alertas.length > 0) sections.push(`🚩 13. PONTOS DE ATENÇÃO\n\n${alertas.join("\n")}`);
  }

  // ── 14. IMPACTO PRÁTICO PARA O LICITANTE ──
  {
    const imp: string[] = [];
    imp.push("Este edital exige da empresa:");
    imp.push("• Documentação: todos os documentos de habilitação devem estar válidos e organizados antes da sessão.");
    if (garantiaExecucao === "sim") imp.push("• Caixa: será necessário oferecer garantia contratual, o que compromete recursos financeiros.");
    if (feat.hasPagamento) imp.push(`• Capital de giro: o pagamento será em ${feat.hasPagamento}. A empresa financiará a operação durante esse intervalo.`);
    if (prazoEntregaVal) imp.push(`• Logística: entrega em ${prazoEntregaVal}. É preciso confirmar estoque, produção e transporte.`);
    if (amostraStatus === "sim") imp.push("• Preparação técnica: amostra física deverá ser apresentada para avaliação.");
    if (feat.hasVisitaTecnica) imp.push("• Mobilização: visita técnica exige deslocamento e custos associados.");
    if (marcaModeloStatus === "sim") imp.push("• Comercial: definir marca e modelo que serão ofertados, com documentação comprobatória.");
    if (feat.hasPenalidades) imp.push("• Risco de sanção: o edital prevê penalidades por descumprimento. Avalie a capacidade de execução integral.");
    sections.push(`🏢 14. IMPACTO PRÁTICO PARA O LICITANTE\n\n${imp.join("\n")}`);
  }

  // ── 15. EM LINGUAGEM SIMPLES ──
  {
    const sub: string[] = [];
    sub.push("📎 O que este edital busca");
    if (objeto) sub.push(`${orgao} quer ${lowercaseFirst(objeto)}.${srpStatus === "sim" ? " É um registro de preços: a compra efetiva acontecerá conforme a necessidade, sem obrigação de compra imediata." : ""}`);
    else sub.push(`${orgao} está realizando contratação pública. O objeto específico deve ser conferido no edital.`);

    sub.push("");
    sub.push("🏆 Como a empresa vence");
    if (criterioHint) sub.push(`O julgamento é por ${criterio!.toLowerCase()}. Na prática, ${criterioHint}`);
    else if (criterio) sub.push(`O julgamento é por ${criterio.toLowerCase()}.`);
    else sub.push("O critério de julgamento deve ser conferido no edital.");

    sub.push("");
    sub.push("🙋 Quem pode participar");
    if (exclusividadeMEEPP === "sim") sub.push("Apenas microempresas e empresas de pequeno porte.");
    else sub.push("Empresas de qualquer porte que atendam às exigências de habilitação e não estejam impedidas.");

    sub.push("");
    sub.push("🔎 O que exige mais atenção");
    const atencao: string[] = [];
    if (amostraStatus === "sim") atencao.push("amostra");
    if (garantiaExecucao === "sim") atencao.push("garantia contratual");
    if (feat.hasVisitaTecnica) atencao.push("visita técnica");
    if (precoMaximoStatus === "sim") atencao.push("preço máximo");
    if (prazoEntregaVal) atencao.push("prazo de entrega");
    atencao.push("documentação de habilitação");
    sub.push(`Os pontos que merecem mais cuidado são: ${atencao.join(", ")}.`);

    sub.push("");
    sub.push("🎯 O que a empresa deve fazer agora");
    sub.push("1. Ler o edital completo e o Termo de Referência.");
    sub.push("2. Conferir toda a documentação de habilitação.");
    if (sistema) sub.push(`3. Confirmar cadastro e credenciamento em ${sistema}.`);
    sub.push(`${sistema ? "4" : "3"}. Calcular custos e preparar proposta.`);
    if (sessao) sub.push(`${sistema ? "5" : "4"}. Estar online na plataforma em ${sessao}.`);

    sub.push("");
    sub.push("📋 Resumo final");
    let resumo = `Este edital, promovido por ${orgao}, `;
    if (objeto) resumo += `visa ${lowercaseFirst(objeto)}`;
    resumo += `. ${criterio ? `O julgamento será por ${criterio.toLowerCase()}. ` : ""}`;
    if (srpStatus === "sim") resumo += "Trata-se de registro de preços. ";
    resumo += "A empresa interessada deve preparar documentação, calcular custos e participar da sessão dentro dos prazos.";
    sub.push(resumo);
    sections.push(`📖 15. EM LINGUAGEM SIMPLES\n\n${sub.join("\n")}`);
  }

  // ── 16. CONCLUSÃO EXECUTIVA ──
  {
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    const faixa = dados._scoreFaixa || getFaixa(score);
    const fraseFaixa = dados._scoreFraseFaixa || "";
    const fatoresElevaram = dados._scoreFatoresElevaram || "";
    const fatoresImpediram = dados._scoreFatoresImpediram || "";

    let conclusao = `Este edital aparenta ser **${faixa}** para participação (score ${score}/10).`;
    if (fraseFaixa) conclusao += ` ${fraseFaixa}`;

    if (fatoresElevaram) {
      conclusao += `\n\n**Fatores que elevaram a nota:** ${fatoresElevaram}.`;
    }
    if (fatoresImpediram) {
      conclusao += `\n\n**Fatores que impediram nota maior:** ${fatoresImpediram}.`;
    }
    if (!fatoresElevaram && !fatoresImpediram) {
      conclusao += " Não foram identificados agravantes fortes além das exigências habituais.";
    }
    sections.push(`🏁 16. CONCLUSÃO EXECUTIVA\n\n${conclusao}`);
  }

  return sections.join("\n\n---\n\n");
}

function analyzeEditalText(text: string) {
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

  const score_complexidade = calcularComplexidade(text, {
    valor_estimado,
    criterio: criterio_julgamento,
  });

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
    _scoreComplexidade: String(score_complexidade.valor),
  }, timeline);

  return {
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

    const result = analyzeEditalText(text);

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
}

if (import.meta.main) {
  Deno.serve(handleAnalyzeEdital);
}

export { analyzeEditalText, extractCriterio, extractOrgao, gerarResumoSimples };