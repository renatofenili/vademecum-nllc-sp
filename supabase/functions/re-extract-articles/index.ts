// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const inputSchema = z.object({
  norma_id: z.string().uuid({ message: "norma_id must be a valid UUID" }),
  missing_articles: z.array(z.number().int().positive().max(9999)).max(100).optional(),
  missing_anchors: z.array(z.string().min(1).max(100)).max(50).optional(),
}).refine(
  (data) => (data.missing_articles && data.missing_articles.length > 0) || (data.missing_anchors && data.missing_anchors.length > 0),
  { message: "Either missing_articles or missing_anchors must be provided" }
);

interface ExtractedArticle {
  document_id: string;
  anchor: string;
  nivel: "ementa" | "preambulo" | "artigo" | "inciso" | "paragrafo" | "alinea";
  texto: string;
}

interface SpecialSection {
  type: "disposicao_transitoria" | "disposicao_final";
  anchor: string;
  index: number;
  endPattern?: RegExp;
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
  // Handle special sections first
  if (anchor.startsWith("disp.trans")) return 9990;
  if (anchor.startsWith("disp.final")) return 9991;
  const m = anchor.match(/art\.?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractSpecialSections(
  fullText: string,
  documentId: string,
  requestedAnchors: string[]
): ExtractedArticle[] {
  const results: ExtractedArticle[] = [];
  
  // Check if any special sections are requested
  const wantsDispTrans = requestedAnchors.some(a => 
    a.toLowerCase().includes("disp.trans") || 
    a.toLowerCase().includes("transitoria") ||
    a.toLowerCase().includes("transitório")
  );
  
  if (wantsDispTrans) {
    // Multiple patterns for "Disposição Transitória" - handle various PDF formatting issues
    const dispTransPatterns = [
      /\b(Disposi[çc][ãa]o\s+Transit[óo]ria|Disposi[çc][õo]es\s+Transit[óo]rias)\s*\n/gi,
      /\bDISPOSI[ÇC][ÃA]O\s+TRANSIT[ÓO]RIA\b/gi,
      /\bDisposi[çc][ãa]o\s*Transit[óo]ria\b/gi,
      /\bD\s*i\s*s\s*p\s*o\s*s\s*i\s*[çc]\s*[ãa]\s*o\s+T\s*r\s*a\s*n\s*s\s*i\s*t\s*[óo]\s*r\s*i\s*a\b/gi,
    ];
    
    // Log last 3000 chars for debugging
    console.log(`Last 3000 chars of PDF text:\n${fullText.slice(-3000)}`);
    
    let match: RegExpExecArray | null = null;
    let matchedPattern = -1;
    
    for (let i = 0; i < dispTransPatterns.length; i++) {
      const pattern = dispTransPatterns[i];
      match = pattern.exec(fullText);
      if (match) {
        matchedPattern = i;
        console.log(`Matched pattern ${i}: "${match[0]}" at position ${match.index}`);
        break;
      }
    }
    
    if (match) {
      const startIdx = match.index;
      console.log(`Found Disposição Transitória at position ${startIdx}`);
      
      // Find the end - typically ends at next major section or end of document
      // Look for common endings like "Palácio", signature blocks, or end of text
      const afterSection = fullText.slice(startIdx);
      
      // Find "Artigo único" or similar within the transitional provision
      const artigoUnicoPattern = /\bArtigo\s+[úu]nico\s*[-–—.]?\s*/i;
      const artigoMatch = artigoUnicoPattern.exec(afterSection);
      
      let sectionText = "";
      
      if (artigoMatch) {
        // Extract from "Artigo único" to the end or next section
        const artigoStart = artigoMatch.index;
        const remainder = afterSection.slice(artigoStart);
        
        // Find end markers: "Palácio", signature lines, dates at end
        const endMarkers = [
          /\nPal[áa]cio\s+/i,
          /\n[A-Z][a-z]+,\s+\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/,
          /\n\s*[A-Z]{2,}[\s\S]{0,50}(?:Governador|Secret[áa]rio)/i,
        ];
        
        let endIdx = remainder.length;
        for (const marker of endMarkers) {
          const endMatch = marker.exec(remainder);
          if (endMatch && endMatch.index < endIdx) {
            endIdx = endMatch.index;
          }
        }
        
        sectionText = normalizePdfText(remainder.slice(0, endIdx));
        
        // Prepend the section header for context
        sectionText = "Disposição Transitória\n\n" + sectionText;
      } else {
        // No "Artigo único" found, extract the whole section
        const endMarkers = [
          /\nPal[áa]cio\s+/i,
          /\n[A-Z][a-z]+,\s+\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/,
        ];
        
        let endIdx = afterSection.length;
        for (const marker of endMarkers) {
          const endMatch = marker.exec(afterSection);
          if (endMatch && endMatch.index > 50 && endMatch.index < endIdx) {
            endIdx = endMatch.index;
          }
        }
        
        sectionText = normalizePdfText(afterSection.slice(0, endIdx));
      }
      
      if (sectionText && sectionText.length > 20) {
        results.push({
          document_id: documentId,
          anchor: "disp.trans.unico",
          nivel: "artigo",
          texto: sectionText,
        });
        console.log(`Extracted Disposição Transitória: ${sectionText.length} chars`);
      }
    } else {
      console.log("Disposição Transitória pattern not found in PDF");
      
      // Try to find "Artigo único" directly as fallback
      const artigoUnicoFallback = /\bArtigo\s+[úu]nico\s*[-–—.]?\s*/gi;
      const fallbackMatch = artigoUnicoFallback.exec(fullText);
      
      if (fallbackMatch) {
        console.log(`Found "Artigo único" at position ${fallbackMatch.index}`);
        const startIdx = fallbackMatch.index;
        const remainder = fullText.slice(startIdx);
        
        // Find end markers
        const endMarkers = [
          /\nPal[áa]cio\s+/i,
          /\n[A-Z][a-z]+,\s+\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/,
        ];
        
        let endIdx = remainder.length;
        for (const marker of endMarkers) {
          const endMatch = marker.exec(remainder);
          if (endMatch && endMatch.index > 50 && endMatch.index < endIdx) {
            endIdx = endMatch.index;
          }
        }
        
        const sectionText = normalizePdfText(remainder.slice(0, endIdx));
        
        if (sectionText && sectionText.length > 20) {
          results.push({
            document_id: documentId,
            anchor: "disp.trans.unico",
            nivel: "artigo",
            texto: "Disposição Transitória\n\n" + sectionText,
          });
          console.log(`Extracted via "Artigo único" fallback: ${sectionText.length} chars`);
        }
      }
    }
  }
  
  return results;
}

async function extractArticlesFromPdf(
  pdfBytes: Uint8Array,
  targetArticles: number[],
  targetAnchors: string[] = []
): Promise<Map<number, string>> {
  console.log(`Extracting articles: ${targetArticles.join(", ")} and anchors: ${targetAnchors.join(", ")}`);
  
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
    // Authentication check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    
    if (!token) {
      console.log("Missing authorization token");
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token for auth validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate token
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      console.log("Invalid authorization token:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for admin check
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role (this is an admin-only operation)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      console.log(`User ${userData.user.id} is not an admin`);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin user authenticated: ${userData.user.id}`);

    // Parse and validate input
    let rawInput;
    try {
      rawInput = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = inputSchema.safeParse(rawInput);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { norma_id, missing_articles = [], missing_anchors = [] } = validation.data;
    
    console.log(`Re-extracting for norma ${norma_id}: articles=${missing_articles.join(", ")}, anchors=${missing_anchors.join(", ")}`);

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

    // Extract full text for special sections
    const doc = await getDocument({ data: pdfBytes, useSystemFonts: true } as any).promise;
    const pages = Math.min(doc.numPages || 0, 2500);
    const parts: string[] = [];
    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      parts.push(textContentToText(textContent));
    }
    const fullText = "\n" + normalizePdfText(parts.join("\n\n")) + "\n";
    
    // Extract numbered articles
    const extracted = await extractArticlesFromPdf(pdfBytes, missing_articles, missing_anchors);
    
    // Extract special sections (like Disposição Transitória)
    const specialSections = extractSpecialSections(fullText, norma_id, missing_anchors);
    
    if (extracted.size === 0 && specialSections.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "No articles could be extracted from PDF",
          requested_articles: missing_articles,
          requested_anchors: missing_anchors,
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
    
    // Add special sections
    newDispositivos.push(...specialSections);

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
    const stillMissing = missing_articles.filter((n: number) => !extracted.has(n));
    const foundAnchors = specialSections.map(s => s.anchor);
    const stillMissingAnchors = missing_anchors.filter((a: string) => !foundAnchors.includes(a));

    console.log(`Successfully extracted ${foundArticles.length} articles + ${specialSections.length} special sections`);
    console.log(`Still missing articles: ${stillMissing.join(", ") || "none"}`);
    console.log(`Still missing anchors: ${stillMissingAnchors.join(", ") || "none"}`);

    return new Response(
      JSON.stringify({
        success: true,
        requested_articles: missing_articles,
        requested_anchors: missing_anchors,
        found: foundArticles,
        found_anchors: foundAnchors,
        still_missing: stillMissing,
        still_missing_anchors: stillMissingAnchors,
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
