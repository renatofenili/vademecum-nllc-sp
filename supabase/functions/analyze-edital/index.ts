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

// ── Field Extractors (mechanical — regex-based) ──

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

function extractValorEstimado(text: string): string {
  const norm = text.replace(/\r\n/g, "\n");
  const candidates: Array<{ value: string; score: number }> = [];
  const patterns: Array<[RegExp, number]> = [
    [/(?:valor\s+total\s+(?:da\s+)?(?:contratação|licitação|aquisição|contratacao|licitacao|aquisicao))\s*[:.\-–—]?\s*(R\$\s*[\d.,]+(?:\s*\([^)]{0,200}\))?)/gi, 32],
    [/(?:valor\s+(?:total\s+)?(?:estimado|máximo|global|de\s+referência|referencial|previsto))\s*(?:é\s+de|de|:)\s*(R\$\s*[\d.,]+(?:\s*\([^)]{0,200}\))?)/gi, 30],
    [/(?:valor\s+(?:total\s+)?(?:estimado|máximo|global|de\s+referência|referencial|previsto))\s*[:.]?\s*(R\$\s*[\d.,]+)/gi, 28],
    [/(?:orçamento\s+(?:estimado|máximo|previsto|sigiloso))\s*(?:é\s+de|de|:)\s*(R\$\s*[\d.,]+(?:\s*\([^)]{0,200}\))?)/gi, 26],
    [/(?:preço\s+(?:total\s+)?(?:estimado|máximo|de\s+referência))\s*(?:é\s+de|de|:)\s*(R\$\s*[\d.,]+)/gi, 24],
    [/(?:montante\s+(?:total\s+)?(?:estimado|de|global))\s*(?:é\s+de|de|:)?\s*(R\$\s*[\d.,]+)/gi, 22],
    [/(?:valor\s+(?:total|estimado|máximo|global))\s*[|:]\s*(R\$\s*[\d.,]+)/gi, 22],
    [/(?:no\s+valor\s+(?:total\s+)?de)\s+(R\$\s*[\d.,]+)/gi, 18],
    [/(?:importa(?:ndo)?\s+em)\s+(R\$\s*[\d.,]+)/gi, 16],
    [/(?:(?:total|global|estimad[oa]|máxim[oa]|referência)\s*(?:de|:)?\s*)(R\$\s*[\d.,]+)/gi, 14],
    [/valor[^R]{0,80}(R\$\s*[\d.,]+)/gi, 10],
  ];
  for (const [pattern, boost] of patterns) {
    for (const match of norm.matchAll(pattern)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      const numStr = raw.replace(/R\$\s*/i, "").replace(/\./g, "").replace(",", ".").replace(/\s*\(.*$/, "");
      const num = parseFloat(numStr);
      if (isNaN(num) || num < 100) continue;
      const valueBoost = num > 1000000 ? 4 : num > 100000 ? 2 : 0;
      candidates.push({ value: raw.replace(/\s+/g, " "), score: boost + valueBoost });
    }
  }
  if (candidates.length === 0) return "Não informado no edital";
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].value;
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
  const contextPatterns = [
    /(?:sessão|abertura|certame|disputa)\s+[^.]{0,80}?(\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4})\s*[,;]?\s*(?:às?|a\s+partir\s+de)?\s*(\d{1,2}\s*[h:]\s*\d{0,2})?/gi,
  ];
  for (const pattern of contextPatterns) {
    for (const match of text.matchAll(pattern)) {
      const date = match[1]?.replace(/\s/g, '');
      const time = match[2]?.replace(/\s/g, '') || '';
      if (date) return time ? `${date} às ${time}` : date;
    }
  }
  return "Não identificado";
}

// ── AI Extraction for Semantic Fields ──

interface AIExtractionResult {
  objeto: string;
  orgao: string;
  modalidade: string;
  criterio_julgamento: string;
  sistema_licitacao: string;
  participacao: string;
  unidade_disputa: string;
  habilitacao: string;
  consorcio: "sim" | "nao" | "nao_identificado";
  cooperativas_vedadas: boolean;
  subcontratacao: "sim" | "nao" | "nao_identificado";
  amostra: "sim" | "nao" | "nao_identificado";
  garantia_execucao: "sim" | "nao" | "nao_identificado";
  is_srp: boolean;
  preco_maximo: boolean;
  exclusividade_meepp: boolean;
  catalogo_exigido: boolean;
  marca_modelo_exigido: boolean;
}

function defaultAIResult(): AIExtractionResult {
  return {
    objeto: "Não identificado no edital",
    orgao: "Não identificado",
    modalidade: "Não identificado",
    criterio_julgamento: "Não identificado",
    sistema_licitacao: "Não identificado no edital",
    participacao: "Não identificado no edital",
    unidade_disputa: "Não identificado no edital",
    habilitacao: "Consultar seção de habilitação no edital",
    consorcio: "nao_identificado",
    cooperativas_vedadas: false,
    subcontratacao: "nao_identificado",
    amostra: "nao_identificado",
    garantia_execucao: "nao_identificado",
    is_srp: false,
    preco_maximo: false,
    exclusividade_meepp: false,
    catalogo_exigido: false,
    marca_modelo_exigido: false,
  };
}

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_edital_metadata",
    description: "Extrai metadados estruturados de um edital de licitação brasileiro",
    parameters: {
      type: "object",
      properties: {
        objeto: { type: "string", description: "Descrição do objeto (o que é contratado/adquirido). Elimine referências a leis/decretos/normas administrativas. Foque no bem/serviço/obra. Max 500 chars." },
        orgao: { type: "string", description: "Nome completo do órgão/entidade que promove a licitação (ex: Defensoria Pública do Estado de São Paulo). NUNCA confunda com plataforma de compras." },
        modalidade: { type: "string", description: "Modalidade: 'Pregão eletrônico', 'Concorrência eletrônica', 'Tomada de preços', 'Dispensa', etc." },
        criterio_julgamento: { type: "string", description: "Critério: 'Menor preço por item', 'Menor preço global por lote', 'Maior desconto', 'Técnica e preço', etc. Inclua a unidade (por item/lote/global) se identificada." },
        sistema_licitacao: { type: "string", description: "Plataforma/sistema eletrônico onde ocorre a disputa: 'ComprasGov (compras.gov.br)', 'BEC/SP', 'Licitações-e', 'Portal de Compras do Governo Federal', etc. NUNCA confunda com o órgão." },
        participacao: { type: "string", enum: ["Exclusiva ME/EPP", "Ampla concorrência", "Não identificado no edital"], description: "'Exclusiva ME/EPP' SÓ se EXPRESSAMENTE declarado. Se 'EXCLUSIVIDADE ME/EPP: NÃO', marque 'Ampla concorrência'." },
        unidade_disputa: { type: "string", enum: ["Por item", "Por lote", "Global", "Não identificado no edital"] },
        habilitacao: { type: "string", description: "Resumo dos documentos de habilitação por categoria com emojis: 📜 Hab. Jurídica: docs...\n🏦 Regularidade Fiscal/Trabalhista: docs...\n🔧 Qualificação Técnica: docs...\n📊 Qualificação Econômico-Financeira: docs...\n📝 Declarações: docs... Separe categorias com \\n." },
        consorcio: { type: "string", enum: ["sim", "nao", "nao_identificado"], description: "Consórcio EXPRESSAMENTE admitido ou vedado no texto?" },
        cooperativas_vedadas: { type: "boolean", description: "Cooperativas EXPRESSAMENTE vedadas?" },
        subcontratacao: { type: "string", enum: ["sim", "nao", "nao_identificado"], description: "Subcontratação EXPRESSAMENTE admitida ou vedada?" },
        amostra: { type: "string", enum: ["sim", "nao", "nao_identificado"], description: "Amostra OBRIGATORIAMENTE exigida='sim', EXPRESSAMENTE dispensada='nao', ou inconclusiva/não mencionada='nao_identificado'?" },
        garantia_execucao: { type: "string", enum: ["sim", "nao", "nao_identificado"], description: "Garantia de execução/contratual EXPRESSAMENTE exigida ou dispensada?" },
        is_srp: { type: "boolean", description: "É Sistema de Registro de Preços (SRP)?" },
        preco_maximo: { type: "boolean", description: "Há preço máximo ou valor estimado de referência declarado?" },
        exclusividade_meepp: { type: "boolean", description: "Participação EXCLUSIVA para ME/EPP? Se 'EXCLUSIVIDADE ME/EPP: NÃO', marque false." },
        catalogo_exigido: { type: "boolean", description: "É exigida apresentação de catálogo, ficha técnica ou laudo?" },
        marca_modelo_exigido: { type: "boolean", description: "É exigida indicação de marca/modelo na proposta?" },
      },
      required: ["objeto", "orgao", "modalidade", "criterio_julgamento", "sistema_licitacao", "participacao", "unidade_disputa", "habilitacao", "consorcio", "cooperativas_vedadas", "subcontratacao", "amostra", "garantia_execucao", "is_srp", "preco_maximo", "exclusividade_meepp", "catalogo_exigido", "marca_modelo_exigido"],
      additionalProperties: false,
    },
  },
};

async function extractSemanticFieldsViaAI(text: string): Promise<AIExtractionResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("LOVABLE_API_KEY not configured, falling back to defaults");
    return defaultAIResult();
  }

  const truncated = text.slice(0, 30000);
  const systemPrompt = `Você é um especialista em licitações públicas brasileiras. Extraia metadados do edital usando EXCLUSIVAMENTE o texto fornecido.

REGRAS OBRIGATÓRIAS:
1. NUNCA invente dados. Se não encontrar, use "Não identificado no edital".
2. OBJETO: descrição do que é contratado/adquirido. Elimine referências a leis, decretos, atos normativos e normas administrativas. Foque APENAS no bem/serviço/obra. Máximo 500 caracteres.
3. ÓRGÃO: a entidade que promove a licitação (ex: Defensoria Pública do Estado de São Paulo, INSS, Ministério da Saúde). NUNCA confunda com a plataforma de compras (ComprasGov, BEC/SP, Licitações-e, etc).
4. PLATAFORMA/SISTEMA: onde ocorre a disputa eletrônica. Exemplos: ComprasGov (compras.gov.br), BEC/SP, Licitações-e, Portal de Compras. NUNCA confunda com o órgão.
5. PARTICIPAÇÃO: marque "Exclusiva ME/EPP" SOMENTE se o edital declarar EXPRESSAMENTE a exclusividade. Se disser "EXCLUSIVIDADE ME/EPP/EQUIPARADAS: NÃO" ou similar, marque "Ampla concorrência".
6. Para campos de verdade (consórcio, subcontratação, amostra, garantia, cooperativas): marque "sim"/"nao" SOMENTE com declaração EXPLÍCITA e inequívoca. Se houver dúvida, marque "nao_identificado".
7. HABILITAÇÃO: resuma por categoria com emojis (📜 Jurídica, 🏦 Fiscal/Trabalhista, 🔧 Técnica, 📊 Econômica, 📝 Declarações). Cada categoria em linha separada.
8. CRITÉRIO: inclua a unidade de disputa quando identificada (ex: "Menor preço global por lote", "Menor preço por item").`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analise este edital e extraia os metadados estruturados:\n\n${truncated}` },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_edital_metadata" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI gateway error ${response.status}: ${errText}`);
      return defaultAIResult();
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(data).slice(0, 500));
      return defaultAIResult();
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return { ...defaultAIResult(), ...parsed };
  } catch (e) {
    console.error("AI extraction failed:", e);
    return defaultAIResult();
  }
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

function calcularComplexidade(text: string, dados: Record<string, string>, aiTruth?: Record<string, string>): ComplexidadeResult {
  const textLower = text.toLowerCase();

  // ── Detect base profile using the ALREADY EXTRACTED modalidade ──
  const modalidadeExtraida = (dados.modalidade || "").toLowerCase();
  const isPregao = /pregão|pregao/.test(modalidadeExtraida);
  const isConcorrencia = /concorrência|concorrencia/.test(modalidadeExtraida);
  const isBensComuns = /\b(aquisição|fornecimento|compra|material|bens?\s+comun|bens?\s+de\s+consumo|equipamento)\b/i.test(text)
    && !/\b(serviço\s+(?:de\s+natureza\s+)?continu|prestação\s+de\s+serviços?\s+(?:de\s+natureza\s+)?continu|execução\s+de\s+obras?|obra)\b/i.test(text);
  const isMenorPreco = /menor\s+preço/i.test(text);
  const isPregaoBensComuns = isPregao && isBensComuns && isMenorPreco;

  // ── Anchor: pregão de bens comuns starts at 2.5, concorrência at 4, others at 3 ──
  let score = isPregaoBensComuns ? 2.5 : isConcorrencia ? 4 : 3;

  const fatoresElevaram: string[] = [];
  const fatoresImpediram: string[] = [];

  // ── Strong aggravators (each counts toward the 2-aggravator threshold) ──
  let strongAggravators = 0;

  const addStrong = (points: number, label: string) => {
    score += points;
    fatoresElevaram.push(label);
    strongAggravators++;
  };

  // Concorrência inherently more complex
  if (isConcorrencia) {
    score += 0.5;
    fatoresElevaram.push("Modalidade concorrência — procedimento mais formal e exigente que pregão");
    strongAggravators++;
  }

  // Amostra eliminatória — only if EXPLICITLY mandatory (not generic/conditional mentions)
  const amostraExplicita = /(?:deverá|deve|será\s+(?:obrigatóri|exigid))\w*\s+(?:a?\s+)?(?:apresent|entreg)\w*\s+(?:de\s+)?amostra/i.test(text)
    || /amostra\s+(?:será|é)\s+(?:exigid|obrigatóri)/i.test(text)
    || /(?:obrigatóri\w+\s+(?:a\s+)?(?:apresentação|entrega)\s+(?:de\s+)?amostra)/i.test(text);
  const amostraNegada = /(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i.test(text) || /sem\s+(?:necessidade\s+de\s+)?amostra/i.test(text);
  if (amostraExplicita && !amostraNegada) {
    addStrong(1.2, "Amostra exigida — eliminatória se reprovada ou não apresentada");
  }

  // Qualificação técnica robusta (atestados com requisitos de volume/percentual)
  if (/atestado[^.]{0,200}(?:comprovan|demonstran)[^.]{0,200}(?:no\s+mínimo|pelo\s+menos|mínimo\s+de)\s*\d/i.test(text)) {
    addStrong(0.8, "Qualificação técnica robusta — atestados com requisitos específicos");
  } else if (/(?:crea|cau|registro\s+(?:no\s+)?conselho)/i.test(text)) {
    // CREA/CAU alone is lighter — common in many editals
    score += 0.3;
    fatoresElevaram.push("Registro em conselho profissional exigido");
  }

  // Garantia de execução
  if (/garantia\s+(?:de\s+)?(?:execução|contratual)\s+(?:será|deverá|é)\s+(?:exigid|apresentad|prestad)/i.test(text)
    || /exig(?:e|ir)\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)
    || /seguro[\-\s]garantia/i.test(text)) {
    if (!/(?:não\s+(?:será|é)\s+exigid|dispensad|não\s+(?:haverá|há))\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
      addStrong(0.8, "Garantia de execução exigida — compromete caixa da empresa");
    }
  }

  // Visita técnica obrigatória (only if explicitly mandatory)
  if (/visita\s+técnica\s+(?:obrigatória|será\s+obrigatória)/i.test(text)) {
    addStrong(0.6, "Visita técnica obrigatória — eliminatória");
  }

  // Execução contratual complexa (serviço continuado, SLA)
  if (/serviço\s+(?:de\s+natureza\s+)?continu/i.test(text) && /(?:sla|nível\s+de\s+serviço|acordo\s+de\s+nível)/i.test(text)) {
    addStrong(0.8, "Execução contratual complexa — serviço continuado com SLA");
  } else if (/serviço\s+(?:de\s+natureza\s+)?continu/i.test(text)) {
    score += 0.4;
    fatoresElevaram.push("Serviço de natureza continuada");
  }

  // Técnica e preço
  if (/técnica\s+e\s+preço/i.test(text)) {
    addStrong(1.2, "Julgamento por técnica e preço — exige proposta técnica detalhada");
  }

  // Prova de conceito
  if (/prova\s+de\s+conceito/i.test(text)) {
    addStrong(0.8, "Prova de conceito — demanda preparação técnica e pode eliminar");
  }

  // Risco econômico-sancionatório acima do padrão (only high multa, NOT inidoneidade alone — it's in every edital)
  const multaMatch = text.match(/multa\s+(?:de\s+)?((?:\d+[,.]?\d*)\s*%)/i);
  const multaPercent = multaMatch ? parseFloat(multaMatch[1].replace(",", ".")) : 0;
  if (multaPercent >= 15) {
    addStrong(0.6, `Multa contratual de ${multaPercent}%`);
  } else if (multaPercent >= 10) {
    score += 0.2;
    fatoresElevaram.push(`Multa de ${multaPercent}%`);
  }

  // Forte densidade técnica (obra, engenharia)
  if (/execução\s+de\s+obras?/i.test(text) || /\b(bdi|composição\s+de\s+custos|planilha\s+orçamentária\s+detalhada)\b/i.test(text)) {
    addStrong(1.2, "Forte densidade técnica — obra ou composição de custos detalhada");
  }

  // ── Moderate factors (lighter weight — reduced) ──
  if (/propost[ao]\s+(?:readequada|ajustada|adequada)/i.test(text)) {
    score += 0.2;
    fatoresElevaram.push("Proposta readequada exigida após lances");
  }

  if (/(?:catálogo|ficha\s+técnica|laudo)\s+(?:deverá|será|deve)\s+(?:ser\s+)?(?:apresentad|enviad|juntad)/i.test(text)) {
    score += 0.2;
    fatoresElevaram.push("Catálogo, ficha técnica ou laudo exigido");
  }

  // ME/EPP exclusivity — NOT a complexity factor, removed from scoring
  // marca/modelo — NOT a complexity factor for common goods, removed

  // Value-based adjustment (only for very high values)
  const valorStr = dados.valor_estimado?.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const valorNum = parseFloat(valorStr || "0");
  if (valorNum > 50000000) { score += 0.5; fatoresElevaram.push("Valor acima de R$ 50 milhões"); }
  else if (valorNum > 10000000) { score += 0.3; fatoresElevaram.push("Valor acima de R$ 10 milhões"); }

  // SRP — NOT a complexity factor, removed
  // Subcontratação — use AI result if available
  const subcontratacaoPermitida = aiTruth ? aiTruth.subcontratacao === "sim" : (
    /subcontrata(?:ção|r)\s+(?:será\s+)?(?:autorizada|permitida|admitida|prevista)/i.test(text)
    && !/(?:não\s+(?:será|é|serão)\s+(?:admitid|permitid|autorizada|aceit)|veda(?:da|do|r)|proibid)\w*\s+(?:a\s+)?subcontrata/i.test(text)
  );
  if (subcontratacaoPermitida) {
    score += 0.2;
    fatoresElevaram.push("Prevê subcontratação");
  }

  // Matriz de risco — only when explicitly required to be produced by the licitante
  if (/(?:licitante|contratad)\w*\s+(?:deverá|deve)\s+(?:apresentar|elaborar)\s+(?:a\s+)?matriz\s+de\s+risco/i.test(text)) {
    score += 0.3;
    fatoresElevaram.push("Licitante deve apresentar matriz de risco");
  }

  // ── CAP: pregão de bens comuns sem 2+ strong aggravators = max 5.5 ──
  if (isPregaoBensComuns && strongAggravators < 2) {
    if (score > 5.5) {
      score = 5.5;
      fatoresImpediram.push("Pregão eletrônico de bens comuns sem dois ou mais agravantes fortes — nota limitada a 5,5");
    }
  }

  // ── Factors that PREVENTED higher score ──
  if (!amostraExplicita || amostraNegada) {
    fatoresImpediram.push("Sem exigência de amostra eliminatória");
  }
  if (/(?:não\s+(?:será|é)\s+exigid|dispensad|não\s+(?:haverá|há))\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
    fatoresImpediram.push("Garantia de execução dispensada");
  } else if (!/garantia\s+(?:de\s+)?(?:execução|contratual)/i.test(text)) {
    fatoresImpediram.push("Sem exigência de garantia contratual");
  }
  if (!/visita\s+técnica\s+obrigatória/i.test(text)) {
    fatoresImpediram.push("Sem visita técnica obrigatória");
  }
  if (!/técnica\s+e\s+preço/i.test(text)) {
    fatoresImpediram.push("Julgamento não é por técnica e preço");
  }
  if (isPregaoBensComuns) {
    fatoresImpediram.push("Pregão eletrônico de bens comuns — perfil de complexidade-base baixo");
  }

  // ── Final rounding and clamping ──
  score = Math.min(10, Math.max(1, Math.round(score * 2) / 2)); // round to nearest 0.5

  const faixa = getFaixa(score);
  const justificativa = fatoresElevaram.length > 0
    ? `Score ${score}/10 (${faixa}). Fatores que elevaram: ${fatoresElevaram.join("; ")}.`
    : `Score ${score}/10 (${faixa}). Edital com características padrão, sem agravantes fortes identificados.`;

  const modalidadeLabel = isConcorrencia ? "Concorrência" : isPregao ? "Pregão eletrônico" : (dados.modalidade || "Edital");
  const fraseFaixa = isPregaoBensComuns && score <= 5
    ? `Pregão eletrônico padrão de bens comuns, com habilitação ordinária e disputa por menor preço — classificado como ${faixa}.`
    : `${modalidadeLabel} classificado como ${faixa} com base em ${strongAggravators} agravante(s) forte(s) identificado(s) no texto.`;

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
    subcontratacaoVedada: /(?:não\s+(?:será|é|serão)\s+(?:admitid|permitid|autorizada|aceit)|veda(?:da|do|r)|proibid)\w*\s+(?:a\s+)?subcontrata/i.test(text)
      || /subcontrata(?:ção|r)\s+(?:não\s+)?(?:será\s+)?(?:vedad|proibid)/i.test(text),
    subcontratacaoPermitida: /subcontrata(?:ção|r)\s+(?:será\s+)?(?:autorizada|permitida|admitida|prevista)/i.test(text)
      || /(?:autoriza|permite|admite)[\-\s]se\s+(?:a\s+)?subcontrata/i.test(text),
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
    vedacaoCooperativas: /(?:não\s+(?:será|serão)\s+(?:admitid|permitid|aceit)|veda(?:da|do)|proibid)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:sociedades?\s+)?cooperativas?/i.test(text)
      || /cooperativas?\s+(?:não\s+)?(?:poderão|podem|será|serão)\s+(?:participar)/i.test(text)
      || /(?:não\s+poderão\s+(?:disputar|participar)[^.]{0,200}cooperativas?)/i.test(text),
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

  // ── Truth validations (from AI extraction via dados._ai_* fields) ──
  const consorcioStatus = (dados._ai_consorcio || truthCheck(fullText,
    [/(?:será|serão)\s+(?:admitid|permitid|aceit)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i, /admite[\-\s]se\s+consórcio/i],
    [/(?:não\s+(?:será|serão)\s+(?:admitid|permitid|aceit)|veda(?:da|do)|proibid)\w*\s+(?:a\s+)?(?:participação\s+(?:de\s+)?)?(?:empresas?\s+)?(?:em\s+)?consórcio/i]
  )) as "sim" | "nao" | "nao_identificado";
  const exclusividadeMEEPP = (dados._ai_exclusividade_meepp === "true" ? "sim" : dados._ai_exclusividade_meepp === "false" ? "nao_identificado" : truthCheck(fullText,
    [/(?:participação|licitação|disputa)\s+(?:é\s+)?exclusiv[oa]\s+(?:para\s+)?(?:me|epp|microempresa|empresa\s+de\s+pequeno\s+porte)/i],
    []
  )) as "sim" | "nao" | "nao_identificado";
  const garantiaExecucao = (dados._ai_garantia || truthCheck(fullText,
    [/garantia\s+(?:de\s+)?(?:execução|contratual)\s+(?:será|deverá|é)\s+(?:exigid|apresentad|prestad)/i, /seguro[\-\s]garantia/i],
    [/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+garantia\s+(?:de\s+)?(?:execução|contratual)/i]
  )) as "sim" | "nao" | "nao_identificado";
  const srpStatus = (dados._ai_srp === "true" ? "sim" : dados._ai_srp === "false" ? "nao_identificado" : truthCheck(fullText,
    [/sistema\s+de\s+registro\s+de\s+preços/i, /ata\s+de\s+registro\s+de\s+preços/i],
    []
  )) as "sim" | "nao" | "nao_identificado";
  const amostraStatus = (dados._ai_amostra || truthCheck(fullText,
    [/(?:deverá|deve|será\s+(?:obrigatóri|exigid))\w*\s+(?:a?\s+)?(?:apresent|entreg)\w*\s+(?:de\s+)?amostra/i],
    [/(?:não\s+(?:será|é)\s+exigid|dispensad)\w*\s+(?:a?\s+)?amostra/i]
  )) as "sim" | "nao" | "nao_identificado";
  const subcontratacaoStatus = (dados._ai_subcontratacao || truthCheck(fullText,
    [/subcontrata(?:ção|r)\s+(?:será\s+)?(?:autorizada|permitida|admitida|prevista)/i],
    [/(?:não\s+(?:será|é|serão)\s+(?:admitid|permitid|autorizada|aceit)|veda(?:da|do|r)|proibid)\w*\s+(?:a\s+)?subcontrata/i]
  )) as "sim" | "nao" | "nao_identificado";
  const catalogoStatus = (dados._ai_catalogo === "true" ? "sim" : dados._ai_catalogo === "false" ? "nao_identificado" : truthCheck(fullText,
    [/(?:exig|apresent)\w*\s+(?:de\s+)?(?:catálogo|ficha\s+técnica|laudo)/i],
    []
  )) as "sim" | "nao" | "nao_identificado";
  const marcaModeloStatus = (dados._ai_marca_modelo === "true" ? "sim" : dados._ai_marca_modelo === "false" ? "nao_identificado" : truthCheck(fullText,
    [/(?:indicar|informar|constar)\s+(?:a?\s+)?(?:marca|modelo|fabricante)\s+(?:na\s+proposta|do\s+produto)/i],
    []
  )) as "sim" | "nao" | "nao_identificado";
  let precoMaximoStatus: "sim" | "nao" | "nao_identificado" = dados._ai_preco_maximo === "true" ? "sim" : dados._ai_preco_maximo === "false" ? "nao_identificado" : truthCheck(fullText,
    [/preço\s+(?:máximo|unitário\s+máximo)\s+(?:aceitável|admitido|de\s+referência)/i, /valor\s+(?:estimado|global|total|orçado|referência)/i],
    []
  ) as "sim" | "nao" | "nao_identificado";
  if (precoMaximoStatus === "nao_identificado" && valor) {
    precoMaximoStatus = "sim";
  }
  // Override detectFeatures with AI results where available
  if (dados._ai_cooperativas_vedadas === "true") feat.vedacaoCooperativas = true;
  if (dados._ai_subcontratacao === "sim") { feat.subcontratacaoPermitida = true; feat.subcontratacaoVedada = false; }
  if (dados._ai_subcontratacao === "nao") { feat.subcontratacaoVedada = true; feat.subcontratacaoPermitida = false; }
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
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    const faixa = dados._scoreFaixa || getFaixa(score);
    if (score >= 7) p.push("O edital contempla diversas exigências que demandam atenção na preparação da proposta e documentação.");
    else if (score >= 5) p.push("O edital possui exigências padrão de documentação e prazos, sem barreiras atípicas.");
    else p.push("O edital apresenta requisitos habituais, facilitando a participação.");

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
    const score = dados._scoreComplexidade ? parseFloat(dados._scoreComplexidade) : 0;
    const faixa = dados._scoreFaixa || getFaixa(score);

    const diag: string[] = [];
    diag.push(`Avaliação geral: edital **${faixa}** para participação (score ${score}/10).`);

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
      if (garantiaExecucao === "sim") caixa.push("a garantia contratual requer planejamento financeiro");
      if (feat.hasPagamento) caixa.push(`o pagamento é em ${feat.hasPagamento}, considere o capital de giro necessário`);
      diag.push(`Planejamento financeiro: ${caixa.join("; ")}.`);
    }

    if (feat.hasAmostra || feat.hasVisitaTecnica || feat.hasCatalogo || feat.hasProvaConceito) {
      diag.push("O edital inclui exigências técnicas pré-sessão — planeje a preparação com antecedência.");
    }

    if (feat.hasPenalidades || feat.hasMulta) {
      diag.push("O edital prevê penalidades contratuais — avalie as condições de execução antes de participar.");
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
    if (precoMaximoStatus === "sim" && valor) disp.push(`• Preço máximo/estimado de referência: ${valor}. Propostas acima serão desclassificadas.`);
    else if (precoMaximoStatus === "sim") disp.push("• Há preço máximo de referência. Propostas acima serão desclassificadas.");
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
    if (feat.vedacaoCooperativas) part.push("• Cooperativas: vedadas expressamente pelo edital.");
    if (subcontratacaoStatus === "nao") part.push("• Subcontratação: vedada expressamente pelo edital.");
    else if (subcontratacaoStatus === "sim") part.push("• Subcontratação: admitida pelo edital.");
    else if (feat.hasSubcontratacao) part.push("• Subcontratação: ponto que exige conferência no edital.");
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

  // ── 12. PONTOS DE PREPARAÇÃO ──
  {
    const prep: string[] = [];
    // Habilitação
    prep.push("📂 Habilitação");
    prep.push("O edital exige documentação completa de habilitação jurídica, fiscal, técnica e econômico-financeira.");
    prep.push("Dica: organize todos os documentos com antecedência e confira a validade das certidões, balanço patrimonial e atestados técnicos.");

    // Técnico
    if (amostraStatus === "sim" || feat.hasVisitaTecnica || feat.hasProvaConceito || catalogoStatus === "sim") {
      prep.push("");
      prep.push("🔬 Preparação técnica");
      if (amostraStatus === "sim") {
        prep.push("O edital prevê apresentação de amostra.");
        prep.push("Dica: prepare a amostra com antecedência conforme as especificações do Termo de Referência.");
      }
      if (feat.hasVisitaTecnica) {
        prep.push("O edital prevê visita técnica.");
        prep.push("Dica: agende com antecedência junto ao órgão.");
      }
      if (feat.hasProvaConceito) {
        prep.push("O edital prevê prova de conceito, o que demanda preparação técnica específica.");
      }
      if (catalogoStatus === "sim") {
        prep.push("O edital exige catálogo, ficha técnica ou laudo.");
        prep.push("Dica: separe a documentação técnica dos produtos que serão ofertados.");
      }
    }

    // Comercial
    prep.push("");
    prep.push("💵 Formação de preço");
    if (precoMaximoStatus === "sim") {
      prep.push("Há preço máximo de referência. A proposta deve respeitar esse teto.");
    }
    prep.push("A proposta deve contemplar todos os custos (frete, impostos, encargos). Faça a composição de preços com cuidado.");

    // Operacional
    if (prazoEntregaVal || feat.hasPrazoExecucao || feat.localEntrega) {
      prep.push("");
      prep.push("🏗️ Logística e execução");
      if (prazoEntregaVal) {
        prep.push(`O prazo de entrega previsto é de ${prazoEntregaVal}.`);
        prep.push("Dica: confirme se a cadeia de suprimentos permite cumprir esse prazo.");
      }
      if (feat.hasPrazoExecucao) {
        prep.push(`O prazo de execução previsto é de ${feat.hasPrazoExecucao}.`);
      }
      if (feat.localEntrega) {
        prep.push(`Local de entrega/execução: ${feat.localEntrega}.`);
        prep.push("Dica: considere os custos logísticos na formação do preço.");
      }
    }

    // Financeiro
    if (garantiaExecucao === "sim" || feat.hasPagamento) {
      prep.push("");
      prep.push("💳 Planejamento financeiro");
      if (garantiaExecucao === "sim") {
        prep.push("O edital exige garantia contratual (em geral até 5% do valor do contrato).");
        prep.push("Dica: avalie as opções disponíveis (seguro-garantia, fiança bancária, caução).");
      }
      if (feat.hasPagamento) {
        prep.push(`O pagamento previsto é em ${feat.hasPagamento}.`);
        prep.push("Dica: planeje o capital de giro necessário para esse intervalo.");
      }
    }

    // Prazo
    prep.push("");
    prep.push("⏰ Prazos");
    prep.push("Os prazos para envio de documentos, proposta readequada e assinatura do contrato devem ser cumpridos rigorosamente.");

    // Penalidades
    if (feat.hasPenalidades || feat.hasMulta) {
      prep.push("");
      prep.push("⚖️ Penalidades contratuais");
      if (feat.hasMulta) {
        prep.push(`O edital prevê multa de ${feat.hasMulta} por descumprimento contratual.`);
      }
      prep.push("Dica: confirme a capacidade de cumprir integralmente as obrigações antes de apresentar proposta.");
    }

    // Execução
    if (srpStatus === "sim" || feat.isServicoContinuado || subcontratacaoStatus === "sim") {
      prep.push("");
      prep.push("📋 Execução contratual");
      if (srpStatus === "sim") prep.push("Como é registro de preços, mantenha capacidade de fornecimento durante toda a vigência da ata.");
      if (feat.isServicoContinuado) prep.push("Serviço continuado requer estrutura permanente para execução.");
      if (subcontratacaoStatus === "sim") prep.push("O edital admite subcontratação parcial — verifique os limites e condições.");
    }

    sections.push(`📋 12. PONTOS DE PREPARAÇÃO\n\n${prep.join("\n")}`);
  }

  // ── 13. PONTOS DE ATENÇÃO ──
  {
    const alertas: string[] = [];
    if (amostraStatus === "sim") alertas.push("🔸 Amostra exigida — prepare e apresente no prazo estipulado.");
    if (garantiaExecucao === "sim") alertas.push("🔸 Garantia contratual exigida — avalie as opções disponíveis (seguro-garantia, fiança, caução).");
    else if (garantiaExecucao === "nao") alertas.push("🔸 Garantia contratual não exigida neste edital.");
    if (feat.hasGarantiaProduto) alertas.push("🔸 Garantia do produto — verifique o prazo e as condições previstas.");
    if (srpStatus === "sim") alertas.push("🔸 Registro de preços — a contratação será conforme demanda efetiva durante a vigência da ata.");
    else if (srpStatus === "nao_identificado") alertas.push("🔸 O edital não indica de forma expressa que se trata de registro de preços.");
    if (marcaModeloStatus === "sim") alertas.push("🔸 Marca/modelo indicados — confira se a exigência é indicativa ou se aceita equivalência.");
    if (catalogoStatus === "sim") alertas.push("🔸 Catálogo/ficha técnica/laudo — separe a documentação técnica com antecedência.");
    if (precoMaximoStatus === "sim") alertas.push("🔸 Preço máximo — a proposta deve respeitar o valor de referência.");
    if (prazoEntregaVal && /\d+\s*dias?\s*(?:úteis|corridos)?$/i.test(prazoEntregaVal)) alertas.push("🔸 Prazo de entrega — confira se é em dias úteis ou corridos.");
    if (feat.hasMulta) alertas.push(`🔸 Multa de ${feat.hasMulta} prevista — consulte o capítulo de sanções para detalhes.`);
    if (feat.hasImpedimentoSancao) alertas.push("🔸 Confira a situação cadastral da empresa quanto a impedimentos.");
    if (feat.hasSICAF || feat.hasCAUFESP) alertas.push("🔸 Cadastro obrigatório — confira a validade e completude.");
    if (feat.hasVisitaTecnica) alertas.push("🔸 Visita técnica prevista — agende com antecedência.");
    if (consorcioStatus === "nao") alertas.push("🔸 Participação individual — consórcio não previsto neste edital.");
    if (alertas.length > 0) sections.push(`📌 13. PONTOS DE ATENÇÃO\n\n${alertas.join("\n")}`);
  }

  // ── 14. IMPACTO PRÁTICO PARA O LICITANTE ──
  {
    const imp: string[] = [];
    imp.push("Este edital exige da empresa:");
    imp.push("• Documentação: todos os documentos de habilitação devem estar válidos e organizados antes da sessão.");
    if (garantiaExecucao === "sim") imp.push("• Caixa: será necessário oferecer garantia contratual — planeje os recursos financeiros.");
    if (feat.hasPagamento) imp.push(`• Capital de giro: o pagamento será em ${feat.hasPagamento}. Planeje o fluxo de caixa para esse intervalo.`);
    if (prazoEntregaVal) imp.push(`• Logística: entrega em ${prazoEntregaVal}. Confirme estoque, produção e transporte.`);
    if (amostraStatus === "sim") imp.push("• Preparação técnica: amostra física deverá ser apresentada para avaliação.");
    if (feat.hasVisitaTecnica) imp.push("• Mobilização: visita técnica prevista — considere deslocamento e planejamento.");
    if (marcaModeloStatus === "sim") imp.push("• Comercial: defina marca e modelo que serão ofertados, com documentação comprobatória.");
    if (feat.hasPenalidades) imp.push("• Penalidades: o edital prevê sanções contratuais. Confirme a capacidade de execução integral.");
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

async function analyzeEditalText(text: string) {
  // ── Mechanical extraction (regex — deterministic) ──
  const numero_edital = extractNumeroEdital(text);
  const valor_estimado = extractValorEstimado(text);
  const data_sessao = extractDataSessao(text);
  const timeline = extractTimeline(text);
  const planilha_estimada = extractPlanilha(text);

  // ── Semantic extraction (AI — Gemini Flash) ──
  const ai = await extractSemanticFieldsViaAI(text);

  const modalidade = ai.modalidade;
  const orgao = ai.orgao;
  const objeto = ai.objeto;
  const criterio_julgamento = ai.criterio_julgamento;
  const sistema_licitacao = ai.sistema_licitacao;
  const condicoes_habilitacao = ai.habilitacao;
  const participacao = ai.participacao;
  const unidade_disputa = ai.unidade_disputa;

  const score_complexidade = calcularComplexidade(text, {
    valor_estimado,
    criterio: criterio_julgamento,
    modalidade,
  }, ai);

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
    _scoreFaixa: score_complexidade.faixa,
    _scoreFraseFaixa: score_complexidade.frase_faixa,
    _scoreFatoresElevaram: score_complexidade.fatores_elevaram.join("; "),
    _scoreFatoresImpediram: score_complexidade.fatores_impediram.join("; "),
    // Pass AI truth checks
    _ai_consorcio: ai.consorcio,
    _ai_subcontratacao: ai.subcontratacao,
    _ai_amostra: ai.amostra,
    _ai_garantia: ai.garantia_execucao,
    _ai_cooperativas_vedadas: String(ai.cooperativas_vedadas),
    _ai_exclusividade_meepp: String(ai.exclusividade_meepp),
    _ai_srp: String(ai.is_srp),
    _ai_preco_maximo: String(ai.preco_maximo),
    _ai_catalogo: String(ai.catalogo_exigido),
    _ai_marca_modelo: String(ai.marca_modelo_exigido),
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

    const result = await analyzeEditalText(text);

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

export { analyzeEditalText, gerarResumoSimples };