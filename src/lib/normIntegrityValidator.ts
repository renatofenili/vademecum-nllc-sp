/**
 * Norm Integrity Validator
 * Analyzes raw law text to detect article gaps and inconsistencies
 */

export interface ArticleInfo {
  raw: string;        // Original text match (e.g., "Art. 184-A")
  number: number;     // Base number (e.g., 184)
  suffix: string;     // Suffix if any (e.g., "-A", "-B")
  fullId: string;     // Full identifier (e.g., "184-A")
}

export interface ValidationResult {
  articlesFound: ArticleInfo[];
  totalCount: number;
  minArticle: number;
  maxArticle: number;
  gaps: GapInfo[];
  hasGaps: boolean;
  summary: string;
}

export interface GapInfo {
  from: number;
  to: number;
  missing: number[];
  count: number;
}

/**
 * Extract all articles from raw text
 */
export function extractArticles(rawText: string): ArticleInfo[] {
  // Pattern to match articles: "Art. 1", "Art. 1º", "Art. 184-A", "Artigo 5", etc.
  const articlePattern = /\bArt\.?\s*(\d{1,4})(?:\s*(?:º|°|o|\.))?\s*(-[A-Z])?\b/gi;
  
  const articles: ArticleInfo[] = [];
  const seen = new Set<string>();
  
  let match;
  while ((match = articlePattern.exec(rawText)) !== null) {
    const number = parseInt(match[1], 10);
    const suffix = match[2] ? match[2].toUpperCase() : "";
    const fullId = `${number}${suffix}`;
    
    // Avoid duplicates
    if (!seen.has(fullId)) {
      seen.add(fullId);
      articles.push({
        raw: match[0],
        number,
        suffix,
        fullId,
      });
    }
  }
  
  // Sort by number, then by suffix
  articles.sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return a.suffix.localeCompare(b.suffix);
  });
  
  return articles;
}

/**
 * Detect gaps in article sequence
 */
export function detectGaps(articles: ArticleInfo[]): GapInfo[] {
  if (articles.length < 2) return [];
  
  // Get unique base numbers (ignoring suffixes for gap detection)
  const baseNumbers = [...new Set(articles.map(a => a.number))].sort((a, b) => a - b);
  
  const gaps: GapInfo[] = [];
  
  for (let i = 0; i < baseNumbers.length - 1; i++) {
    const current = baseNumbers[i];
    const next = baseNumbers[i + 1];
    
    if (next - current > 1) {
      const missing: number[] = [];
      for (let n = current + 1; n < next; n++) {
        missing.push(n);
      }
      
      gaps.push({
        from: current,
        to: next,
        missing,
        count: missing.length,
      });
    }
  }
  
  return gaps;
}

/**
 * Validate norm integrity
 */
export function validateNormIntegrity(rawText: string): ValidationResult {
  const articles = extractArticles(rawText);
  
  if (articles.length === 0) {
    return {
      articlesFound: [],
      totalCount: 0,
      minArticle: 0,
      maxArticle: 0,
      gaps: [],
      hasGaps: false,
      summary: "Nenhum artigo encontrado no texto.",
    };
  }
  
  const baseNumbers = articles.map(a => a.number);
  const minArticle = Math.min(...baseNumbers);
  const maxArticle = Math.max(...baseNumbers);
  
  const gaps = detectGaps(articles);
  const totalMissing = gaps.reduce((sum, g) => sum + g.count, 0);
  
  let summary = `Encontrados ${articles.length} artigos (Art. ${minArticle} a Art. ${maxArticle}).`;
  
  if (gaps.length > 0) {
    summary += ` ⚠️ ${totalMissing} artigo(s) ausente(s) em ${gaps.length} lacuna(s).`;
  } else {
    summary += " ✅ Sequência completa, sem lacunas.";
  }
  
  return {
    articlesFound: articles,
    totalCount: articles.length,
    minArticle,
    maxArticle,
    gaps,
    hasGaps: gaps.length > 0,
    summary,
  };
}
