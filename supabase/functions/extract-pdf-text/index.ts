// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: "ementa" | "preambulo" | "artigo" | "inciso" | "paragrafo" | "alinea";
  texto: string;
}

type ToolArgs = {
  dispositivos: {
    anchor: string;
    nivel: "ementa" | "preambulo" | "artigo" | "inciso" | "paragrafo" | "alinea";
    texto: string;
  }[];
};

type GatewayBatchResult = {
  dispositivos: ToolArgs["dispositivos"];
  ok: boolean;
  retryable: boolean;
  retry_after_ms: number;
  model_used?: string;
  used_pdf_fallback?: boolean;
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
const MAX_ARTICLES = 500; // Safety ceiling, not the estimate
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

  const m1 = s.match(/\bart\.?\s*(\d{1,4})\b/);
  if (m1?.[1]) return Number(m1[1]);

  const m2 = s.match(/\bartigo\s*(\d{1,4})\b/);
  if (m2?.[1]) return Number(m2[1]);

  return null;
}

function parsePdfMaxFromOrigin(origin: unknown): number | null {
  if (typeof origin !== "string") return null;
  const m = origin.match(/\bpdfmax:(\d{1,4})\b/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_ARTICLES, Math.floor(n));
}

function computeContiguousMaxFrom1(sortedUniqueNumbers: number[]): number {
  let max = 0;
  for (const n of sortedUniqueNumbers) {
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n === max + 1) {
      max = n;
      continue;
    }
    if (n <= max) continue;
    break;
  }
  return max;
}

function textContentToText(textContent: any): string {
  const items = Array.isArray(textContent?.items) ? textContent.items : [];
  const parts: string[] = [];
  for (const it of items) {
    const s = typeof it?.str === "string" ? it.str : "";
    if (!s) continue;
    parts.push(s);
    if (it?.hasEOL) parts.push("\n");
    else parts.push(" ");
  }
  return parts.join("").replace(/[ \t]+\n/g, "\n");
}

function collectArticleNumbers(text: string, strictSet: Set<number>, looseSet: Set<number>) {
  // Strict: only headings at line start (reduces false-positives from references)
  const strict = /^\s*(?:art\.?|artigo)\s*(\d{1,4})\s*(?:º|o)?\b/gim;
  let m: RegExpExecArray | null;
  while ((m = strict.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) strictSet.add(n);
  }

  // Loose fallback: anywhere in text (may include references), later tamed via contiguous-from-1 heuristic.
  const loose = /\b(?:art\.?|artigo)\s*(\d{1,4})\s*(?:º|o)?\b/gi;
  while ((m = loose.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) looseSet.add(n);
  }
}

type PdfMaxInference = {
  maxArticle: number | null;
  numPages: number;
  tailTextLen: number;
};

async function inferPdfMaxArticleFromBytes(pdfBytes: Uint8Array): Promise<PdfMaxInference> {
  try {
    const doc = await getDocument({ data: pdfBytes, useSystemFonts: true } as any).promise;
    const strictSet = new Set<number>();
    const looseSet = new Set<number>();

    const pages = Math.min(doc.numPages || 0, 2500);
    let tailTextLen = 0;

    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContentToText(textContent);
      if (pageText) collectArticleNumbers(pageText, strictSet, looseSet);
      if (pageNum === pages) tailTextLen = String(pageText || "").trim().length;
    }

    const toSorted = (s: Set<number>) =>
      Array.from(s)
        .map((n) => Math.floor(n))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_ARTICLES)
        .sort((a, b) => a - b);

    const strictNums = toSorted(strictSet);
    const looseNums = toSorted(looseSet);

    const strictContig = computeContiguousMaxFrom1(strictNums);
    const looseContig = computeContiguousMaxFrom1(looseNums);

    const strictMax = strictNums.at(-1) ?? 0;
    const looseMax = looseNums.at(-1) ?? 0;

    // Prefer strict (line-start) detections when available; they are less prone to picking up references.
    // If strict finds a larger max but the sequence has gaps (common with PDF text extraction quirks),
    // accept the strict max when there's enough tail evidence.
    let inferred = 0;
    if (strictMax > 0) {
      const strictBeyondCount = strictNums.filter((n) => n > strictContig).length;
      if (strictContig >= 10 && strictBeyondCount >= 2 && strictMax <= strictContig + 300) {
        inferred = strictMax;
      } else if (strictContig >= 10) {
        inferred = strictContig;
      } else {
        inferred = strictMax;
      }
    } else {
      // Fallback to loose detections (may include references, so keep contiguous heuristic).
      inferred = looseContig >= 10 ? looseContig : looseMax;
    }

    const maxArticle = inferred > 0 ? Math.min(MAX_ARTICLES, Math.floor(inferred)) : null;

    console.log(
      JSON.stringify({
        kind: "pdfmax_infer",
        num_pages: pages,
        tail_text_len: tailTextLen,
        strict_max: strictMax,
        strict_contig: strictContig,
        loose_max: looseMax,
        loose_contig: looseContig,
        chosen: maxArticle,
      })
    );

    return { maxArticle, numPages: pages, tailTextLen };
  } catch (e) {
    console.warn("Failed to infer max article from PDF bytes:", e);
    return { maxArticle: null, numPages: 0, tailTextLen: 0 };
  }
}

function filterEstruturaToMaxArticle(
  estrutura: ExtractedArticle[],
  maxArticle: number | null
): ExtractedArticle[] {
  if (!maxArticle || maxArticle <= 0) return estrutura;
  return (estrutura || []).filter((cur) => {
    const n = parseArticleNumberFromAnchor(cur?.anchor);
    if (n == null) return true; // keep unknown anchors to avoid accidental data loss
    return n <= maxArticle;
  });
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

function normalizePdfExtractedText(s: string): string {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    // Normalize various Unicode spaces (non-breaking, thin, etc.) to regular space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[\t]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFallbackArticlesFromText(
  fullText: string,
  batchStart: number,
  batchEnd: number
): ToolArgs["dispositivos"] {
  const text = `\n${normalizePdfExtractedText(fullText)}\n`;
  
  // Multiple regex patterns to catch different formatting styles used in Brazilian laws
  // Key: use \s+ to match multiple/weird spaces, and be flexible with ordinal markers
  // Pattern 1: "Art. 6º" or "Art. 6" or "Art.6" anywhere (most common format)
  // Pattern 2: "Artigo 6" or "ARTIGO 6"
  const headingPatterns = [
    // Most flexible: Art followed by optional dot, spaces, number, optional ordinal
    /\bArt\.?\s*(\d{1,4})\s*(?:º|°|o|\.)?(?:\s|$)/gi,
    // Artigo spelled out
    /\bArtigo\s+(\d{1,4})\s*(?:º|°|o|\.)?(?:\s|$)/gi,
  ];
  
  const headings: { n: number; index: number }[] = [];
  
  for (const headingRe of headingPatterns) {
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(text)) !== null) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) continue;
      // Avoid duplicates at same position
      const exists = headings.some(h => h.n === n && Math.abs(h.index - m!.index) < 20);
      if (!exists) {
        headings.push({ n, index: m.index });
      }
    }
  }

  if (headings.length === 0) {
    console.log(`PDF fallback: no article headings found in text (len=${text.length})`);
    return [];
  }

  // Ensure in-order by position
  headings.sort((a, b) => a.index - b.index);
  
  // Remove duplicates keeping first occurrence
  const uniqueHeadings: { n: number; index: number }[] = [];
  const seenArticles = new Set<number>();
  for (const h of headings) {
    if (!seenArticles.has(h.n)) {
      seenArticles.add(h.n);
      uniqueHeadings.push(h);
    }
  }

  console.log(`PDF fallback: found ${uniqueHeadings.length} unique article headings, looking for art.${batchStart}-${batchEnd}`);

  const out: ToolArgs["dispositivos"] = [];
  for (let n = batchStart; n <= batchEnd; n++) {
    const hIdx = uniqueHeadings.findIndex((h) => h.n === n);
    if (hIdx === -1) {
      console.log(`PDF fallback: article ${n} not found in headings`);
      continue;
    }
    const startIdx = uniqueHeadings[hIdx].index;
    // Find the next heading after this one (not necessarily n+1 due to OCR gaps).
    const nextHeading = uniqueHeadings.slice(hIdx + 1).find((h) => h.index > startIdx);
    const endIdx = nextHeading ? nextHeading.index : text.length;
    const slice = text.slice(startIdx, endIdx);
    const cleaned = normalizePdfExtractedText(slice);
    if (!cleaned) continue;
    out.push({
      anchor: `art.${n}`,
      nivel: "artigo",
      texto: cleaned,
    });
  }

  console.log(`PDF fallback: extracted ${out.length} articles for batch ${batchStart}-${batchEnd}`);
  return out;
}

async function buildPdfFallbackDispositivos(
  pdfBytes: Uint8Array,
  batchStart: number,
  batchEnd: number
): Promise<ToolArgs["dispositivos"]> {
  try {
    console.log(`PDF fallback: starting extraction for articles ${batchStart}-${batchEnd}`);
    const doc = await getDocument({ data: pdfBytes, useSystemFonts: true } as any).promise;
    const pages = Math.min(doc.numPages || 0, 2500);
    console.log(`PDF fallback: document has ${pages} pages`);
    
    const parts: string[] = [];
    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContentToText(textContent);
      if (pageText) parts.push(pageText);
    }
    const fullText = parts.join("\n\n");
    console.log(`PDF fallback: extracted ${fullText.length} characters of text`);
    
    // Debug: log a sample around article 6 to understand the format
    const art6Match = fullText.match(/(?:art|artigo)\.?\s*6/i);
    if (art6Match && art6Match.index !== undefined) {
      const sample = fullText.slice(Math.max(0, art6Match.index - 50), art6Match.index + 200);
      console.log(`PDF fallback: sample around "art 6": ${sample.slice(0, 250).replace(/\n/g, "\\n")}`);
    }
    
    return extractFallbackArticlesFromText(fullText, batchStart, batchEnd);
  } catch (e) {
    console.warn("PDF fallback extraction failed:", e);
    return [];
  }
}

/**
 * Ensures that the extracted text starts with the proper identifier based on anchor.
 * This fixes cases where AI omits the article number, inciso number, etc.
 */
function ensureDispositivoPrefix(anchor: string, nivel: string, texto: string): string {
  const trimmedTexto = texto.trim();
  const lowerNivel = (nivel || "").toLowerCase();
  
  // Parse anchor to extract components
  // Examples: art.1, art.1§1, art.1.I, art.1.I.a, art.5§2
  const artMatch = anchor.match(/^art\.(\d+)/i);
  if (!artMatch) return trimmedTexto; // Not an article-based anchor
  
  const artNum = artMatch[1];
  
  // Check if it's just an article (no inciso, paragraph, or alinea suffix)
  if (lowerNivel === "artigo" && /^art\.\d+$/i.test(anchor)) {
    // Should start with "Artigo Xº" or "Art. X"
    const startsWithArtigo = /^(Artigo|Art\.?)\s*\d+/i.test(trimmedTexto);
    if (!startsWithArtigo) {
      return `Artigo ${artNum}º - ${trimmedTexto}`;
    }
    return trimmedTexto;
  }
  
  // Check for paragraph (§)
  const paraMatch = anchor.match(/§(\d+|único)/i);
  if (paraMatch && lowerNivel === "paragrafo") {
    const paraNum = paraMatch[1];
    const startsWithPara = /^§\s*\d+/i.test(trimmedTexto) || /^Parágrafo\s*(único|\d+)/i.test(trimmedTexto);
    if (!startsWithPara) {
      if (paraNum.toLowerCase() === "único") {
        return `Parágrafo único - ${trimmedTexto}`;
      }
      return `§ ${paraNum}º - ${trimmedTexto}`;
    }
    return trimmedTexto;
  }
  
  // Check for inciso (roman numeral)
  const incisoMatch = anchor.match(/\.([IVXLCDM]+)(?:$|\.)/i);
  if (incisoMatch && lowerNivel === "inciso") {
    const incisoNum = incisoMatch[1].toUpperCase();
    // Should start with roman numeral followed by space/dash
    const startsWithRoman = new RegExp(`^${incisoNum}\\s*[-–—]?\\s*`, "i").test(trimmedTexto);
    if (!startsWithRoman) {
      return `${incisoNum} - ${trimmedTexto}`;
    }
    // Ensure there's a dash after the roman numeral if missing
    const missingDash = new RegExp(`^${incisoNum}\\s+(?![-–—])`, "i").test(trimmedTexto);
    if (missingDash) {
      return trimmedTexto.replace(new RegExp(`^(${incisoNum})\\s+`, "i"), "$1 - ");
    }
    return trimmedTexto;
  }
  
  // Check for alinea (lowercase letter)
  const alineaMatch = anchor.match(/\.([a-z])$/i);
  if (alineaMatch && lowerNivel === "alinea") {
    const alineaLetter = alineaMatch[1].toLowerCase();
    // Should start with "a)" or "a -"
    const startsWithAlinea = new RegExp(`^${alineaLetter}\\s*[)\\-–—]`, "i").test(trimmedTexto);
    if (!startsWithAlinea) {
      return `${alineaLetter}) ${trimmedTexto}`;
    }
    return trimmedTexto;
  }
  
  return trimmedTexto;
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
    
    const nivel = (item?.nivel || "artigo") as ExtractedArticle["nivel"];
    const rawTexto = String(item?.texto || "");
    const fixedTexto = ensureDispositivoPrefix(anchor, nivel, rawTexto);
    
    out.push({
      document_id: normaId,
      anchor,
      nivel,
      texto: fixedTexto,
    });
  }
  return out;
}

function inferSearchTermsFromPathOrName(pathOrName: string): string[] {
  // Most uploads are saved as `${timestamp}_${sanitizedName}`.
  // If the timestamp prefix becomes stale, we can search by sanitizedName.
  const raw = String(pathOrName || "").trim();
  const baseName = raw.split("/").pop() ?? raw;
  const noTs = baseName.replace(/^\d+_/, "").trim();
  const noExt = noTs.replace(/\.[a-z0-9]+$/i, "").trim();

  const out = [noTs, noExt]
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  return Array.from(new Set(out));
}

function dirname(path: string): string {
  const s = String(path || "").trim();
  const idx = s.lastIndexOf("/");
  if (idx <= 0) return "";
  return s.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  const d = String(dir || "").replace(/^\/+|\/+$/g, "");
  const n = String(name || "").replace(/^\/+|\/+$/g, "");
  if (!d) return n;
  if (!n) return d;
  return `${d}/${n}`;
}

async function listTopLevelFolders(storage: any): Promise<string[]> {
  try {
    const { data, error } = await storage.list("", {
      limit: 200,
      sortBy: { column: "updated_at", order: "desc" },
    } as any);
    if (error || !Array.isArray(data)) return [];

    // In storage list(), folders usually come back without an id.
    const folders = data
      .filter((item: any) => item && !item.id && typeof item.name === "string")
      .map((item: any) => String(item.name))
      // Heuristic: ignore obvious files.
      .filter((name: string) => !name.toLowerCase().endsWith(".pdf"))
      .slice(0, 50);

    return Array.from(new Set(folders));
  } catch {
    return [];
  }
}

async function findPdfBySearch(
  storage: any,
  searchTerms: string[],
  prefixes: string[]
): Promise<{ blob: Blob; path: string } | null> {
  const seenCandidates = new Set<string>();

  for (const prefix of prefixes) {
    for (const term of searchTerms) {
      console.log(`Searching storage in '${prefix || "(root)"}' for: ${term}`);
      const { data: listed, error: listError } = await storage.list(prefix, {
        search: term,
        limit: 50,
        sortBy: { column: "updated_at", order: "desc" },
      } as any);

      if (listError) {
        console.error("Storage list error:", listError);
        continue;
      }

      if (!Array.isArray(listed) || listed.length === 0) continue;

      for (const item of listed) {
        const name = typeof item?.name === "string" ? item.name : "";
        if (!name) continue;

        // Skip folders.
        if (!item?.id) continue;

        const candidate = joinPath(prefix, name);
        if (seenCandidates.has(candidate)) continue;
        seenCandidates.add(candidate);

        console.log(`Trying matched path from search: ${candidate}`);
        const { data: pickedDownload, error: pickedError } = await storage.download(candidate);
        if (!pickedError && pickedDownload) {
          return { blob: pickedDownload, path: candidate };
        }
        console.error("Error downloading matched path:", pickedError);
      }
    }
  }

  return null;
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

async function inferPdfMaxArticleViaGateway(
  lovableApiKey: string,
  base64Pdf: string
): Promise<number | null> {
  try {
    const systemPrompt = `Você é um analista de normas brasileiras.
Sua tarefa: identificar o MAIOR número de artigo (Art. N) que aparece como TÍTULO/INÍCIO de artigo no PDF.
Regras:
- Considere apenas cabeçalhos de artigo (ex.: "Art. 52", "Artigo 52") como dispositivos.
- Ignore referências do tipo "no art. 52" dentro do texto.
- Ignore anexos/quadros/tabelas que não sejam a sequência normativa principal.
- Responda SOMENTE com JSON no formato: {"pdfmax": 52}.
- Se não conseguir determinar com segurança, responda: {"pdfmax": null}.
`;

    const userPrompt = `Qual é o maior número de artigo (Art. N) presente neste PDF?`;

    const body = {
      model: PRIMARY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
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
            { type: "text", text: userPrompt },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 200,
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
      const t = await resp.text().catch(() => "");
      console.warn("pdfmax gateway inference failed:", resp.status, t.slice(0, 500));
      return null;
    }

    const aiResult = await resp.json();
    const msg = aiResult?.choices?.[0]?.message;
    const contentText = messageContentToText(msg?.content);
    const cleaned = (contentText || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    const parsed = safeJsonParse<{ pdfmax?: number | null }>(cleaned);
    const n = parsed?.pdfmax;
    const pdfmax = typeof n === "number" && Number.isFinite(n) && n > 0
      ? Math.min(MAX_ARTICLES, Math.floor(n))
      : null;

    console.log(JSON.stringify({ kind: "pdfmax_gateway", pdfmax }));
    return pdfmax;
  } catch (e) {
    console.warn("pdfmax gateway inference exception:", e);
    return null;
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
          "Extrai dispositivos de uma norma jurídica brasileira (ementa, artigos, incisos, parágrafos e alíneas)",
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
                      "Identificador do dispositivo (ex: ementa, preambulo, art.1, art.1.I, art.1§1, art.1.a)",
                  },
                  nivel: {
                    type: "string",
                    enum: ["ementa", "preambulo", "artigo", "inciso", "paragrafo", "alinea"],
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

  // Special handling for first batch: include ementa and preambulo
  const includeEmenta = batchStart === 1;
  const userPrompt = includeEmenta
    ? `Extraia a EMENTA (texto que descreve o que a norma institui), o PREÂMBULO (autoridade que assina e fundamento legal), e os artigos ${batchStart} até ${batchEnd} (com seus incisos/parágrafos/alíneas) desta norma jurídica usando a função extract_dispositivos.`
    : `Extraia SOMENTE os artigos ${batchStart} até ${batchEnd} (e seus incisos/parágrafos/alíneas) desta norma jurídica usando a função extract_dispositivos. Se algum dispositivo não pertencer ao intervalo, ignore.`;

  const systemPrompt = includeEmenta
    ? `Você é um extrator de texto jurídico especializado em normas brasileiras.
Extraia EXATAMENTE o texto do PDF, sem modificar ou resumir.
Para o primeiro lote, extraia:
1. EMENTA: o texto que descreve o que a norma institui (geralmente logo após o número da lei)
2. PREÂMBULO: autoridade que assina e fundamento legal (texto antes do Art. 1º)
3. Artigos solicitados (e seus incisos, parágrafos e alíneas)
Para cada dispositivo, identifique:
- anchor: ementa, preambulo, art.X, art.X.I, art.X§Y, art.X.a
- nivel: ementa | preambulo | artigo | inciso | paragrafo | alinea
- texto: texto COMPLETO e EXATO do dispositivo, copiado do PDF.
NÃO INVENTE TEXTO. Copie exatamente do documento.`
    : `Você é um extrator de texto jurídico especializado em normas brasileiras.
Extraia EXATAMENTE o texto do PDF, sem modificar ou resumir.
Extraia apenas os artigos solicitados (e seus incisos, parágrafos e alíneas).
Para cada dispositivo, identifique:
- anchor: identificador no formato art.X, art.X.I, art.X§Y, art.X.a, etc.
- nivel: artigo | inciso | paragrafo | alinea
- texto: texto COMPLETO e EXATO do dispositivo, copiado do PDF.
NÃO INVENTE TEXTO. Copie exatamente do documento.
Não omita nenhum artigo do intervalo solicitado.`;

  const messagesPayload = [
    {
      role: "system",
      content: systemPrompt,
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
    const bucket = "normas-pdf";
    const storage = supabase.storage.from(bucket);
    let pdfData: Blob | null = null;
    let actualStoragePath = pdf_storage_path;
    let lastStorageError: any = null;

    const allowStorageSearch = Boolean(reqBody?.allow_storage_search);

    const tryDownload = async (path: string): Promise<Blob | null> => {
      const safePath = String(path || "").trim();
      if (!safePath) return null;
      const { data, error } = await storage.download(safePath);
      if (error) {
        lastStorageError = error;
        return null;
      }
      if (data) {
        actualStoragePath = safePath;
        return data;
      }
      return null;
    };

    // 1) Direct path from request
    pdfData = await tryDownload(pdf_storage_path);
    if (!pdfData && lastStorageError) {
      console.error("Error downloading PDF from provided path:", lastStorageError);
    }

    // 2) Path in DB (may be fresher)
    let normaRow: any = null;
    if (!pdfData) {
      const { data, error } = await supabase
        .from("normas")
        .select("pdf_storage_path, pdf_nome_arquivo")
        .eq("id", norma_id)
        .maybeSingle();
      if (!error) normaRow = data;

      const freshPath = normaRow?.pdf_storage_path;
      if (freshPath && freshPath !== pdf_storage_path) {
        console.log(`Trying fresh path from DB: ${freshPath}`);
        pdfData = await tryDownload(freshPath);
      }
    }

    // 3) OPTIONAL: Search by filename (disabled by default to avoid picking stale PDFs)
    if (!pdfData && allowStorageSearch) {
      const searchTerms = inferSearchTermsFromPathOrName(
        (normaRow?.pdf_nome_arquivo as string | undefined) || pdf_storage_path
      );

      const prefixes = new Set<string>();
      prefixes.add("");
      const reqDir = dirname(pdf_storage_path);
      if (reqDir) prefixes.add(reqDir);
      const dbDir = normaRow?.pdf_storage_path ? dirname(String(normaRow.pdf_storage_path)) : "";
      if (dbDir) prefixes.add(dbDir);

      const topFolders = await listTopLevelFolders(storage);
      for (const f of topFolders) prefixes.add(f);

      if (searchTerms.length > 0) {
        const found = await findPdfBySearch(storage, searchTerms, Array.from(prefixes));
        if (found) {
          pdfData = found.blob;
          actualStoragePath = found.path;
        }
      }
    }

    if (!pdfData) {
      await supabase
        .from("normas")
        .update({
          texto_extraido_status: "erro",
          texto_extraido_em: new Date().toISOString(),
        })
        .eq("id", norma_id);

      const msg = await storageErrorToMessage(lastStorageError);
      const isNotFound = msg.toLowerCase().includes("not_found") || msg.includes("404");
      return new Response(
        JSON.stringify({
          success: false,
          error_kind: isNotFound ? "storage_not_found" : "storage_error",
          error_message: isNotFound
            ? `PDF não encontrado no armazenamento. Reenvie o arquivo e tente novamente. (${msg})`
            : `Falha ao baixar o PDF do armazenamento. ${msg}`,
          pdf_storage_path: actualStoragePath,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await pdfData!.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const base64Pdf = base64Encode(pdfBytes);

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
    let existingOrigin: string | null = null;
    if (!reset) {
      const { data: normaRow, error: normaRowError } = await supabase
        .from("normas")
        .select("texto_extraido, texto_extraido_origem")
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

      if (!normaRowError && typeof (normaRow as any)?.texto_extraido_origem === "string") {
        existingOrigin = String((normaRow as any).texto_extraido_origem);
      }
    }

    // Infer the real maximum article number from the PDF (preferred), or reuse cached value from origin.
    // This prevents hallucinated articles like "art.232" when the PDF only goes to 194.
    let pdfMaxArticle: number | null = reset ? null : parsePdfMaxFromOrigin(existingOrigin);
    if (!pdfMaxArticle) {
      const inferred = await inferPdfMaxArticleFromBytes(pdfBytes);
      pdfMaxArticle = inferred.maxArticle;

      // If the PDF tail has no extractable text, pdf.js inference may miss image-only/scanned pages.
      // In that case, ask the AI (with the PDF attached) for the last article number.
      if (inferred.numPages >= 10 && inferred.tailTextLen < 20 && (pdfMaxArticle ?? 0) >= 10) {
        const aiMax = await inferPdfMaxArticleViaGateway(lovableApiKey, base64Pdf);
        if (aiMax && aiMax > (pdfMaxArticle ?? 0)) pdfMaxArticle = aiMax;
      } else if (!pdfMaxArticle) {
        const aiMax = await inferPdfMaxArticleViaGateway(lovableApiKey, base64Pdf);
        if (aiMax && aiMax > 0) pdfMaxArticle = aiMax;
      }
    }
    const effectiveMaxArticle = pdfMaxArticle && pdfMaxArticle > 0 ? pdfMaxArticle : MAX_ARTICLES;

    // Sanitize existing structure: drop anything beyond the real PDF max (fixes past hallucinations).
    existingEstrutura = filterEstruturaToMaxArticle(existingEstrutura, pdfMaxArticle);

    const maxExisting = existingEstrutura.reduce((acc, cur) => {
      const n = parseArticleNumberFromAnchor(cur?.anchor);
      if (n != null && n > acc) return n;
      return acc;
    }, 0);

    // If the client asks for a batch outside the real range, ignore and resume from maxExisting+1.
    const defaultStart = maxExisting > 0 ? maxExisting + 1 : 1;
    const batchStart =
      typeof requestedBatchStart === "number" &&
      requestedBatchStart >= 1 &&
      requestedBatchStart <= effectiveMaxArticle
        ? requestedBatchStart
        : defaultStart;

    if (batchStart > effectiveMaxArticle) {
      // Already completed (or at least reached the end of the real PDF).
      const progressTotal = effectiveMaxArticle;
      const progressCurrent = Math.min(Math.max(maxExisting, 0), progressTotal);

      const originPrefix = `lovable-ai:${PRIMARY_MODEL}${pdfMaxArticle ? `:pdfmax:${effectiveMaxArticle}` : ""}`;
      const { error: updErr } = await supabase
        .from("normas")
        .update({
          texto_extraido: JSON.stringify(existingEstrutura),
          texto_extraido_em: new Date().toISOString(),
          texto_extraido_origem: `${originPrefix}:batched:done`,
          texto_extraido_status: "extraido",
          texto_extraido_progresso_atual: progressCurrent,
          texto_extraido_progresso_total: progressTotal,
          texto_extraido_progresso_em: new Date().toISOString(),
        })
        .eq("id", norma_id);
      if (updErr) console.error("Failed to finalize extraction:", updErr);

      return new Response(
        JSON.stringify({
          success: true,
          done: true,
          reason: pdfMaxArticle ? "pdf_max_article_reached" : "max_articles_reached",
          progress_current: progressCurrent,
          progress_total: progressTotal,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batchEnd = Math.min(effectiveMaxArticle, batchStart + batchSize - 1);

    // Determine expected_total (approximation for progress).
    // If explicit expected_total is provided and > 0, use it.
    // Otherwise, estimate from existing extraction or default to a reasonable ceiling.
    let progressTotal: number;
    if (pdfMaxArticle && pdfMaxArticle > 0) {
      progressTotal = effectiveMaxArticle;
    } else if (typeof expected_total === "number" && expected_total > 0) {
      progressTotal = Math.min(MAX_ARTICLES, expected_total);
    } else if (maxExisting > 0) {
      progressTotal = Math.min(MAX_ARTICLES, Math.ceil(maxExisting * 1.15));
    } else {
      progressTotal = 200;
    }

    // Mark as pending before starting this batch + save progress
    {
      const originPrefix = `lovable-ai:${PRIMARY_MODEL}${pdfMaxArticle ? `:pdfmax:${effectiveMaxArticle}` : ""}`;
      const { error: pendErr } = await supabase
        .from("normas")
        .update({
          texto_extraido_status: "pendente",
          texto_extraido_em: new Date().toISOString(),
          texto_extraido_origem: `${originPrefix}:batched`,
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
    let dispositivos: ToolArgs["dispositivos"] = batchResult.dispositivos;
    let ok = batchResult.ok;
    let retryable = batchResult.retryable;
    let retry_after_ms = batchResult.retry_after_ms;
    let error_kind = batchResult.error_kind;
    let model_used = batchResult.model_used;
    let used_pdf_fallback = Boolean(batchResult.used_pdf_fallback);

    // HARD RELIABILITY: if IA falhar em retornar tool args, fazemos fallback determinístico lendo texto do PDF.
    // Isso evita que a extração trave em artigos específicos (ex.: art.6) e garante que a extração chegue ao fim.
    if (!ok && (error_kind === "no_tool_args" || error_kind === "invalid_json")) {
      console.warn(
        `AI batch failed without tool args (art.${batchStart}-${batchEnd}). Using PDF fallback extraction...`
      );
      const fallback = await buildPdfFallbackDispositivos(pdfBytes, batchStart, batchEnd);
      if (fallback.length > 0) {
        dispositivos = fallback;
        ok = true;
        retryable = false;
        retry_after_ms = 0;
        used_pdf_fallback = true;
        model_used = model_used ?? PRIMARY_MODEL;
      } else {
        // PDF fallback also failed to find articles in this range.
        // Treat as empty batch and FORCE advance to avoid infinite loop.
        console.warn(
          `PDF fallback found no articles for batch ${batchStart}-${batchEnd}. Treating as empty and advancing.`
        );
        dispositivos = [];
        ok = true;
        retryable = false;
        retry_after_ms = 0;
        used_pdf_fallback = true;
        model_used = model_used ?? PRIMARY_MODEL;
      }
    }

    if (!ok) {
      if (retryable) {
        const suggestedBatchSize =
          error_kind === "no_tool_args" && batchSize > 1
            ? Math.max(1, Math.floor(batchSize / 2))
            : batchSize;

        const originPrefix = `lovable-ai:${model_used ?? PRIMARY_MODEL}${pdfMaxArticle ? `:pdfmax:${effectiveMaxArticle}` : ""}`;
        const { error: pendErr2 } = await supabase
          .from("normas")
          .update({
            texto_extraido_status: "pendente",
            texto_extraido_em: new Date().toISOString(),
            texto_extraido_origem: `${originPrefix}:batched:retryable:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
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
          texto_extraido_origem: `lovable-ai:${model_used ?? PRIMARY_MODEL}${pdfMaxArticle ? `:pdfmax:${effectiveMaxArticle}` : ""}:batched:error:${batchStart}-${batchEnd}:${error_kind ?? "unknown"}`,
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
    const done =
      pdfMaxArticle && pdfMaxArticle > 0
        ? batchEnd >= effectiveMaxArticle
        : isEmptyBatch && emptyStreak >= 1 && nextEstrutura.length > 0;

    const statusToPersist = done ? "extraido" : "pendente";

    // Compute current progress from the maximum article extracted so far
    const maxArticleNow = nextEstrutura.reduce((acc, cur) => {
      const n = parseArticleNumberFromAnchor(cur?.anchor);
      if (n != null && n > acc) return n;
      return acc;
    }, 0);

    // Dynamically refine progressTotal based on what we've extracted so far.
    // If maxArticleNow is close to or exceeds the current progressTotal, bump the estimate.
    // When done, set progressTotal = maxArticleNow for an accurate final count.
    let refinedProgressTotal = progressTotal;
    if (pdfMaxArticle && pdfMaxArticle > 0) {
      refinedProgressTotal = effectiveMaxArticle;
    } else if (done) {
      refinedProgressTotal = maxArticleNow > 0 ? maxArticleNow : progressTotal;
    } else if (maxArticleNow > 0 && maxArticleNow >= progressTotal * 0.85) {
      refinedProgressTotal = Math.min(MAX_ARTICLES, Math.ceil(maxArticleNow * 1.1));
    }

    const progressCurrent =
      pdfMaxArticle && pdfMaxArticle > 0
        ? Math.min(effectiveMaxArticle, done ? effectiveMaxArticle : maxArticleNow > 0 ? maxArticleNow : batchEnd)
        : done
          ? refinedProgressTotal
          : maxArticleNow > 0
            ? maxArticleNow
            : batchEnd;

    const estruturaToPersist = filterEstruturaToMaxArticle(nextEstrutura, pdfMaxArticle);

    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(estruturaToPersist),
        texto_extraido_em: new Date().toISOString(),
        texto_extraido_origem: `lovable-ai:${model_used ?? PRIMARY_MODEL}${pdfMaxArticle ? `:pdfmax:${effectiveMaxArticle}` : ""}:batched:${batchStart}-${batchEnd}${used_pdf_fallback ? ":fallback_pdfjs" : ""}`,
        texto_extraido_status: statusToPersist,
        texto_extraido_progresso_atual: progressCurrent,
        texto_extraido_progresso_total: refinedProgressTotal,
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
        progress_total: refinedProgressTotal,
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
