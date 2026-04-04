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

// ── Resumo em Linguagem Simples (enxuto e ancorado no PDF) ──
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

  {
    const linhas: string[] = [];
    linhas.push(`• Órgão: ${orgao}`);
    linhas.push(`• Modalidade: ${modalidade}`);
    if (objeto) linhas.push(`• Objeto: ${objeto}`);
    if (criterio) linhas.push(`• Critério de julgamento: ${criterio}`);
    if (valor) linhas.push(`• Valor estimado: ${valor}`);

    let intro = `${orgao} está promovendo ${modalidade.toLowerCase()}`;
    if (objeto) intro += ` para ${lowercaseFirst(objeto)}`;
    intro += ".";
    if (criterio) intro += ` O julgamento será por ${criterio.toLowerCase()}.`;
    if (criterioHint) intro += ` Em termos práticos, ${criterioHint}`;

    sections.push(`📌 VISÃO GERAL\n\n${intro}\n\n${linhas.join("\n")}`);
  }

  {
    const linhas: string[] = [];
    if (sessao) linhas.push(`• Sessão pública: ${sessao}`);
    if (sistema) linhas.push(`• Plataforma: ${sistema}`);
    if (timeline.prazo_impugnacao) linhas.push(`• Prazo para impugnação: ${timeline.prazo_impugnacao}`);
    if (timeline.prazo_esclarecimento) linhas.push(`• Prazo para esclarecimentos: ${timeline.prazo_esclarecimento}`);
    if (timeline.data_publicacao) linhas.push(`• Data de publicação identificada: ${timeline.data_publicacao}`);

    if (linhas.length > 0) {
      sections.push(`📅 PRAZOS E PARTICIPAÇÃO\n\n${linhas.join("\n")}`);
    }
  }

  {
    const habLines = dados.habilitacao
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (habLines.length > 0 && dados.habilitacao !== "Consultar seção de habilitação no edital") {
      sections.push(`📑 HABILITAÇÃO RESUMIDA\n\n${habLines.join("\n")}`);
    }
  }

  {
    const alertas: string[] = [];
    if (feat.isSRP) alertas.push("• O edital usa sistema de registro de preços: pode haver ata sem compra imediata.");
    if (feat.hasGarantia) alertas.push("• Há exigência de garantia; isso afeta custo e fluxo de caixa.");
    if (feat.hasVisitaTecnica) alertas.push("• O texto menciona visita técnica; confira se ela é obrigatória.");
    if (feat.hasAmostra) alertas.push("• Há menção a amostra; prepare material e prazo de apresentação.");
    if (feat.hasPrazoExecucao) alertas.push(`• O edital menciona prazo de execução/entrega de ${feat.hasPrazoExecucao}.`);
    if (feat.hasPagamento) alertas.push(`• O pagamento foi identificado em até ${feat.hasPagamento}.`);
    if (feat.hasPenalidades) alertas.push("• O edital prevê penalidades; vale revisar multas e hipóteses de sanção.");
    if (feat.hasSubcontratacao) alertas.push("• Há menção a subcontratação; confira os limites permitidos.");
    if (feat.hasConsorcio) alertas.push("• O edital trata de participação em consórcio.");

    if (alertas.length > 0) {
      sections.push(`⚠️ PONTOS DE ATENÇÃO\n\n${alertas.slice(0, 4).join("\n")}`);
    }
  }

  {
    const fechamento: string[] = [];
    if (objeto) fechamento.push(`• O foco deste edital é ${lowercaseFirst(objeto)}.`);
    if (criterio) fechamento.push(`• Para vencer, o ponto central da disputa é ${criterio.toLowerCase()}.`);
    fechamento.push("• Use este resumo como roteiro inicial, mas confira o documento oficial e os anexos antes de enviar proposta.");
    sections.push(`✅ EM SÍNTESE\n\n${fechamento.join("\n")}`);
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