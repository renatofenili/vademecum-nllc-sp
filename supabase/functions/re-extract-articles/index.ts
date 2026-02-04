// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: "ementa" | "preambulo" | "artigo" | "inciso" | "paragrafo" | "alinea";
  texto: string;
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

function normalizePdfText(s: string): string {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[\t]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseArticleNumber(anchor: string): number | null {
  const m = anchor.match(/art\.?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function extractArticlesFromPdf(
  pdfBytes: Uint8Array,
  targetArticles: number[]
): Promise<Map<number, string>> {
  console.log(`Extracting articles: ${targetArticles.join(", ")}`);
  
  const doc = await getDocument({ data: pdfBytes, useSystemFonts: true } as any).promise;
  const pages = Math.min(doc.numPages || 0, 2500);
  
  // Extract all text from PDF
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    parts.push(textContentToText(textContent));
  }
  const fullText = "\n" + normalizePdfText(parts.join("\n\n")) + "\n";
  
  console.log(`PDF has ${pages} pages, ${fullText.length} chars`);
  
  // Find all article headings with their positions
  // Multiple patterns for flexibility
  const patterns = [
    /\bArt\.?\s*(\d{1,4})\s*(?:º|°|o)?(?:-([A-Z]))?\s*[.–—]?\s*/gi,
    /\bArtigo\s+(\d{1,4})\s*(?:º|°|o)?(?:-([A-Z]))?\s*/gi,
  ];
  
  interface Heading {
    num: number;
    suffix: string;
    index: number;
    raw: string;
  }
  
  const allHeadings: Heading[] = [];
  
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(fullText)) !== null) {
      const num = parseInt(m[1], 10);
      const suffix = m[2] || "";
      if (!Number.isFinite(num) || num <= 0) continue;
      
      // Check for duplicates
      const exists = allHeadings.some(
        h => h.num === num && h.suffix === suffix && Math.abs(h.index - m!.index) < 30
      );
      if (!exists) {
        allHeadings.push({ num, suffix, index: m.index, raw: m[0] });
      }
    }
  }
  
  // Sort by position
  allHeadings.sort((a, b) => a.index - b.index);
  
  // Remove duplicates keeping first occurrence
  const headings: Heading[] = [];
  const seen = new Set<string>();
  for (const h of allHeadings) {
    const key = `${h.num}${h.suffix}`;
    if (!seen.has(key)) {
      seen.add(key);
      headings.push(h);
    }
  }
  
  console.log(`Found ${headings.length} unique article headings`);
  console.log(`First 20 headings: ${headings.slice(0, 20).map(h => h.num + (h.suffix || "")).join(", ")}`);
  
  const result = new Map<number, string>();
  
  for (const targetNum of targetArticles) {
    // Find heading for this article (base number, no suffix first)
    const hIdx = headings.findIndex(h => h.num === targetNum && !h.suffix);
    
    if (hIdx === -1) {
      console.log(`Article ${targetNum} not found in PDF`);
      continue;
    }
    
    const startIdx = headings[hIdx].index;
    
    // Find end: next article heading (any number > targetNum, or targetNum+suffix like 184-A)
    let endIdx = fullText.length;
    for (let i = hIdx + 1; i < headings.length; i++) {
      if (headings[i].num !== targetNum || headings[i].suffix) {
        endIdx = headings[i].index;
        break;
      }
    }
    
    const articleText = normalizePdfText(fullText.slice(startIdx, endIdx));
    if (articleText) {
      result.set(targetNum, articleText);
      console.log(`Extracted Art. ${targetNum}: ${articleText.length} chars`);
    }
  }
  
  // Also check for suffixed articles like 184-A
  const suffixedTargets = targetArticles.filter(n => {
    const suffix = headings.find(h => h.num === n && h.suffix);
    return suffix !== undefined;
  });
  
  if (suffixedTargets.length > 0) {
    console.log(`Found suffixed articles: ${suffixedTargets.map(n => {
      const h = headings.find(hd => hd.num === n && hd.suffix);
      return h ? `${n}${h.suffix}` : n;
    }).join(", ")}`);
  }
  
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { norma_id, missing_articles } = await req.json();
    
    if (!norma_id || !Array.isArray(missing_articles) || missing_articles.length === 0) {
      return new Response(
        JSON.stringify({ error: "norma_id and missing_articles[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Re-extracting articles for norma ${norma_id}: ${missing_articles.join(", ")}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get norma info
    const { data: norma, error: normaError } = await supabase
      .from("normas")
      .select("id, numero, pdf_storage_path, texto_extraido")
      .eq("id", norma_id)
      .single();

    if (normaError || !norma) {
      return new Response(
        JSON.stringify({ error: "Norma not found", details: normaError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!norma.pdf_storage_path) {
      return new Response(
        JSON.stringify({ error: "No PDF associated with this norma" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download PDF
    const { data: pdfData, error: downloadError } = await supabase
      .storage
      .from("normas-pdf")
      .download(norma.pdf_storage_path);

    if (downloadError || !pdfData) {
      return new Response(
        JSON.stringify({ error: "Failed to download PDF", details: downloadError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    console.log(`Downloaded PDF: ${pdfBytes.length} bytes`);

    // Extract missing articles
    const extracted = await extractArticlesFromPdf(pdfBytes, missing_articles);
    
    if (extracted.size === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No articles could be extracted from PDF",
          requested: missing_articles,
          found: []
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse existing texto_extraido
    let existingDispositivos: ExtractedArticle[] = [];
    try {
      if (norma.texto_extraido) {
        existingDispositivos = JSON.parse(norma.texto_extraido);
      }
    } catch {
      console.warn("Failed to parse existing texto_extraido");
    }

    // Create new dispositivos for extracted articles
    const newDispositivos: ExtractedArticle[] = [];
    for (const [artNum, texto] of extracted) {
      newDispositivos.push({
        document_id: norma_id,
        anchor: `art.${artNum}`,
        nivel: "artigo",
        texto,
      });
    }

    // Merge: add new, avoid duplicates
    const existingAnchors = new Set(existingDispositivos.map(d => d.anchor));
    const toAdd = newDispositivos.filter(d => !existingAnchors.has(d.anchor));
    
    const mergedDispositivos = [...existingDispositivos, ...toAdd];
    
    // Sort by article number
    mergedDispositivos.sort((a, b) => {
      const numA = parseArticleNumber(a.anchor) ?? 999;
      const numB = parseArticleNumber(b.anchor) ?? 999;
      return numA - numB;
    });

    // Update database
    const { error: updateError } = await supabase
      .from("normas")
      .update({
        texto_extraido: JSON.stringify(mergedDispositivos),
        updated_at: new Date().toISOString(),
      })
      .eq("id", norma_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update norma", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const foundArticles = Array.from(extracted.keys()).sort((a, b) => a - b);
    const stillMissing = missing_articles.filter(n => !extracted.has(n));

    console.log(`Successfully extracted ${foundArticles.length} articles, still missing: ${stillMissing.join(", ") || "none"}`);

    return new Response(
      JSON.stringify({
        success: true,
        requested: missing_articles,
        found: foundArticles,
        still_missing: stillMissing,
        total_dispositivos: mergedDispositivos.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in re-extract-articles:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
