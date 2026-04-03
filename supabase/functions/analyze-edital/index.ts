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
  const section = extractSection(
    text,
    [
      /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:DO\s+)?OBJETO\s*[:.\n]/im,
      /OBJETO\s*(?:DA\s+LICITAÇÃO|DO\s+PREGÃO|DA\s+CONTRATAÇÃO)?\s*[:.\n]/i,
    ],
    [/\n\s*(?:\d+[\.\)]|CAPÍTULO|SEÇÃO|DA\s+PARTICIPAÇÃO|JUSTIFICATIVA|DAS?\s+CONDIÇÕES)/i]
  );
  if (section) {
    // Clean up and take first meaningful paragraph
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
    const meaningful = lines.filter(l => l.length > 20);
    return meaningful.slice(0, 5).join(' ').slice(0, 600) || section.slice(0, 600);
  }
  return "Não identificado no edital";
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
    4000
  );

  if (section) {
    // Extract key requirements
    const items: string[] = [];
    const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 10);

    for (const line of lines) {
      // Look for requirement-like lines
      if (/(?:habilitação\s+)?jurídica|ato\s+constitutivo|contrato\s+social|cnpj|registro\s+comercial/i.test(line)) {
        items.push(line.slice(0, 200));
      } else if (/(?:qualificação|habilitação)\s+(?:técnica|econômico|econômica)|atestado|acervo|capacidade\s+técnica/i.test(line)) {
        items.push(line.slice(0, 200));
      } else if (/(?:regularidade|certidão)\s+(?:fiscal|trabalhista|previdenciária|federal|estadual|municipal|fgts|inss)/i.test(line)) {
        items.push(line.slice(0, 200));
      } else if (/balanço\s+patrimonial|demonstrações?\s+contábe|capital\s+social|patrimônio\s+líquido|índice/i.test(line)) {
        items.push(line.slice(0, 200));
      } else if (/certidão\s+negativa|cnd|crf|cndt/i.test(line)) {
        items.push(line.slice(0, 200));
      }
    }

    if (items.length > 0) {
      // Deduplicate similar items
      const unique = [...new Set(items.map(i => i.replace(/^\d+[\.\)]\s*/, '').replace(/^[a-z]\)\s*/i, '')))];
      return unique.slice(0, 15).join('; ');
    }

    // Fallback: summarize categories found
    const categories: string[] = [];
    if (/jurídica|ato\s+constitutivo|contrato\s+social/i.test(section)) categories.push("Habilitação jurídica");
    if (/regularidade\s+fiscal|certidão.*(?:federal|estadual|municipal)|fgts|inss/i.test(section)) categories.push("Regularidade fiscal e trabalhista");
    if (/qualificação\s+técnica|atestado|acervo/i.test(section)) categories.push("Qualificação técnica");
    if (/qualificação\s+econômico|balanço|capital\s+social/i.test(section)) categories.push("Qualificação econômico-financeira");
    if (categories.length > 0) return categories.join('; ');
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

// ── Resumo em Linguagem Simples (template inteligente) ──
function gerarResumoSimples(dados: Record<string, string>, timeline: Record<string, string | null>): string {
  const fullText = dados._fullText || '';
  const feat = detectFeatures(fullText);
  const sections: string[] = [];

  const orgao = dados.orgao !== "Não identificado" ? dados.orgao : "o órgão licitante";
  const modalidade = dados.modalidade !== "Não identificado" ? dados.modalidade.toLowerCase() : "licitação";
  const objeto = dados.objeto !== "Não identificado no edital" ? dados.objeto : "os itens/serviços descritos no edital";
  const objetoClean = objeto.length > 280 ? objeto.slice(0, 277) + '...' : objeto;

  // ── 1. ABERTURA ──
  let abertura = `📋 RESUMO DO EDITAL Nº ${dados.numero_edital}\n\n`;
  abertura += `${orgao} abriu ${modalidade}`;
  if (feat.isSRP) abertura += ` para registro de preços`;
  abertura += ` com o seguinte objetivo: ${objetoClean}.`;
  if (feat.isExclusivoMEEPP) {
    abertura += `\n\n🏢 ATENÇÃO: Esta licitação é EXCLUSIVA para Microempresas (ME) e Empresas de Pequeno Porte (EPP). Empresas de maior porte NÃO podem participar.`;
  } else if (feat.beneficioMEEPP) {
    abertura += `\n\nMicroempresas e Empresas de Pequeno Porte (ME/EPP) possuem tratamento diferenciado nesta licitação, conforme a Lei Complementar nº 123/2006.`;
  }
  sections.push(abertura);

  // ── 2. VALOR E CRITÉRIO ──
  let valorSection = `💰 VALOR E CRITÉRIO DE JULGAMENTO\n\n`;
  if (dados.valor_estimado !== "Não informado no edital") {
    valorSection += `O valor estimado é de ${dados.valor_estimado}. Este valor é o teto de referência — propostas acima dele tendem a ser desclassificadas.`;
  } else {
    valorSection += `O edital não informa expressamente o valor estimado. Verifique os anexos para eventual planilha orçamentária.`;
  }

  const criterioExpl: Record<string, string> = {
    "menor preço": "Vence a empresa que oferecer o menor preço e atender a todas as exigências do edital. O foco é exclusivamente no preço — não há pontuação técnica.",
    "maior desconto": "Vence quem oferecer o maior percentual de desconto sobre a tabela de preços de referência do órgão.",
    "técnica e preço": "A avaliação combina nota técnica e nota de preço, com pesos definidos no edital. Não basta ser o mais barato — a qualidade técnica da proposta é decisiva.",
    "melhor técnica": "A avaliação prioriza a qualidade técnica. O preço é negociado após a classificação técnica. Comum em projetos de engenharia ou consultorias especializadas.",
  };
  const criterioKey = Object.keys(criterioExpl).find(k => dados.criterio.toLowerCase().includes(k));
  if (criterioKey) {
    valorSection += `\n\nCritério de julgamento: ${dados.criterio}. ${criterioExpl[criterioKey]}`;
  } else if (dados.criterio !== "Não identificado") {
    valorSection += `\n\nCritério de julgamento: ${dados.criterio}.`;
  }

  if (feat.regimeTributario) {
    valorSection += `\n\nRegime de execução: ${feat.regimeTributario}.`;
  }
  sections.push(valorSection);

  // ── 3. COMO PARTICIPAR ──
  let comoParticipar = `🖥️ COMO PARTICIPAR — PASSO A PASSO\n\n`;
  const passos: string[] = [];

  if (dados.sistema !== "Não identificado") {
    passos.push(`Acesse o sistema ${dados.sistema} e faça seu cadastro/credenciamento, caso ainda não possua.`);
  } else {
    passos.push(`Identifique a plataforma eletrônica indicada no edital e realize seu cadastro.`);
  }
  passos.push(`Leia o edital na íntegra e todos os anexos. Verifique se sua empresa atende a TODOS os requisitos de habilitação.`);
  passos.push(`Prepare sua proposta comercial conforme o modelo exigido no edital (geralmente no Anexo).`);
  passos.push(`Reúna todos os documentos de habilitação com antecedência. Certidões têm prazo de validade — confira as datas.`);

  if (dados.data_sessao !== "Não identificado") {
    passos.push(`Envie sua proposta na plataforma ANTES da sessão pública, marcada para ${dados.data_sessao}.`);
  } else {
    passos.push(`Envie sua proposta na plataforma antes do prazo de abertura indicado no edital.`);
  }
  passos.push(`Acompanhe a sessão pública. Esteja disponível para a fase de lances e eventual negociação com o pregoeiro.`);

  comoParticipar += passos.map((p, i) => `${i + 1}. ${p}`).join('\n');
  sections.push(comoParticipar);

  // ── 4. HABILITAÇÃO ──
  let habSection = `📑 O QUE VOCÊ PRECISA COMPROVAR (HABILITAÇÃO)\n\n`;
  if (dados.habilitacao !== "Consultar seção de habilitação no edital") {
    habSection += `Os documentos exigidos incluem: ${dados.habilitacao}.\n\n`;
  }

  // Detect categories and explain each
  const habCategories: string[] = [];
  if (/jurídica|ato\s+constitutivo|contrato\s+social/i.test(fullText)) {
    habCategories.push(`• Habilitação Jurídica: comprova que a empresa existe legalmente (contrato social, CNPJ, ato constitutivo).`);
  }
  if (/regularidade\s+fiscal|certidão.*(?:federal|estadual|municipal)|fgts|inss/i.test(fullText)) {
    habCategories.push(`• Regularidade Fiscal e Trabalhista: comprova que a empresa está em dia com tributos federais, estaduais, municipais, FGTS e CNDT.`);
  }
  if (/qualificação\s+técnica|atestado|acervo/i.test(fullText)) {
    habCategories.push(`• Qualificação Técnica: comprova experiência anterior em serviços/fornecimentos similares (atestados de capacidade técnica).`);
  }
  if (/qualificação\s+econômico|balanço|capital\s+social|patrimônio\s+líquido/i.test(fullText)) {
    habCategories.push(`• Qualificação Econômico-Financeira: comprova saúde financeira da empresa (balanço patrimonial, índices contábeis, certidão de falência).`);
  }

  if (habCategories.length > 0) {
    habSection += habCategories.join('\n');
    habSection += `\n\n⚡ Dica prática: Mantenha um "kit de habilitação" sempre atualizado com todas as certidões e documentos básicos. Isso agiliza a participação em qualquer licitação.`;
  }
  sections.push(habSection);

  // ── 5. PRAZOS E CRONOGRAMA ──
  let cronograma = `📅 PRAZOS IMPORTANTES\n\n`;
  const prazos: string[] = [];
  if (timeline.data_publicacao) prazos.push(`• Publicação do edital: ${timeline.data_publicacao}`);
  if (timeline.prazo_impugnacao) prazos.push(`• Prazo para impugnação: até ${timeline.prazo_impugnacao} — se você identificar irregularidades no edital, deve questionar ATÉ esta data`);
  if (timeline.prazo_esclarecimento) prazos.push(`• Prazo para esclarecimentos: até ${timeline.prazo_esclarecimento} — dúvidas sobre o edital devem ser enviadas ATÉ esta data`);
  if (dados.data_sessao !== "Não identificado") prazos.push(`• Sessão pública (abertura): ${dados.data_sessao}`);
  if (feat.hasPrazoExecucao) prazos.push(`• Prazo de execução/entrega: ${feat.hasPrazoExecucao}`);

  if (prazos.length > 0) {
    cronograma += prazos.join('\n');
    cronograma += `\n\n⚠️ Prazos de impugnação e esclarecimento são PRECLUSIVOS — após o vencimento, não há como questionar o edital.`;
  } else {
    cronograma += `Os prazos específicos não foram identificados na análise automatizada. Consulte o edital para o cronograma completo.`;
  }
  sections.push(cronograma);

  // ── 6. OBRIGAÇÕES PÓS-CONTRATAÇÃO ──
  let posContrato = `📝 APÓS VENCER: O QUE ESPERAR\n\n`;
  const obrigacoes: string[] = [];

  if (feat.hasGarantia) {
    obrigacoes.push(`• Garantia contratual: o vencedor deverá prestar garantia (caução, seguro-garantia ou fiança bancária). Isso representa um custo financeiro que deve ser considerado na proposta.`);
  }
  if (feat.localEntrega) {
    obrigacoes.push(`• Local de execução/entrega: ${feat.localEntrega}.`);
  }
  if (feat.hasPrazoExecucao) {
    obrigacoes.push(`• Prazo de execução: ${feat.hasPrazoExecucao}. O descumprimento pode gerar penalidades.`);
  }
  if (feat.isServicoContinuado) {
    obrigacoes.push(`• Serviço de natureza continuada: o contrato terá vigência prolongada, com possibilidade de prorrogação.`);
  }
  if (feat.hasProrrogacao) {
    obrigacoes.push(`• O contrato admite prorrogação, conforme condições previstas no edital.`);
  }
  if (feat.hasReajuste) {
    obrigacoes.push(`• Há previsão de reajuste de preços. Verifique o índice e a periodicidade no edital.`);
  }
  if (feat.hasPagamento) {
    obrigacoes.push(`• Prazo de pagamento: ${feat.hasPagamento} após a entrega/prestação e aceite.`);
  }
  if (feat.hasPenalidades) {
    obrigacoes.push(`• O edital prevê penalidades para descumprimento (multas, impedimento de licitar, etc.). Avalie os riscos antes de propor.`);
  }
  if (feat.hasMatrizRisco) {
    obrigacoes.push(`• O edital inclui Matriz de Risco — analise cuidadosamente a alocação de riscos entre contratante e contratada.`);
  }

  if (obrigacoes.length > 0) {
    posContrato += obrigacoes.join('\n');
  } else {
    posContrato += `Consulte o edital para detalhes sobre as obrigações contratuais, prazos de entrega e condições de pagamento.`;
  }
  sections.push(posContrato);

  // ── 7. PONTOS DE ATENÇÃO E RISCOS ──
  let alertas = `🚨 PONTOS DE ATENÇÃO\n\n`;
  const riscos: string[] = [];

  if (feat.hasVisitaTecnica) {
    riscos.push(`⚡ VISITA TÉCNICA: O edital pode exigir visita técnica prévia ao local. Verifique se é obrigatória ou facultativa e agende com antecedência.`);
  }
  if (feat.hasAmostra) {
    riscos.push(`⚡ AMOSTRA: Pode ser exigida a apresentação de amostra do produto. Tenha o material disponível para envio rápido.`);
  }
  if (feat.hasProvaConceito) {
    riscos.push(`⚡ PROVA DE CONCEITO: O edital prevê prova de conceito. Prepare-se para demonstrar que seu produto/serviço atende às especificações.`);
  }
  if (feat.hasConsorcio) {
    riscos.push(`🤝 CONSÓRCIO: O edital trata de consórcio. Verifique se é permitido, exigido ou vedado, e as condições aplicáveis.`);
  }
  if (feat.hasSubcontratacao) {
    riscos.push(`🔄 SUBCONTRATAÇÃO: Há previsão sobre subcontratação. Verifique os limites e condições para subcontratar parcialmente o objeto.`);
  }
  if (feat.hasSustentabilidade) {
    riscos.push(`🌱 SUSTENTABILIDADE: O edital contém critérios de sustentabilidade ambiental. Verifique se seus produtos/serviços atendem às exigências ambientais.`);
  }
  if (feat.isSRP) {
    riscos.push(`📋 REGISTRO DE PREÇOS: Trata-se de uma Ata de Registro de Preços. O órgão não é obrigado a contratar — a ata gera apenas uma expectativa de contratação durante o prazo de validade.`);
  }

  if (riscos.length > 0) {
    alertas += riscos.join('\n\n');
  } else {
    alertas += `Não foram identificados pontos críticos adicionais na análise automatizada. Ainda assim, leia o edital na íntegra.`;
  }
  sections.push(alertas);

  // ── 8. FECHAMENTO ──
  let fechamento = `✅ EM RESUMO\n\n`;
  fechamento += `Esta é uma ${modalidade}${feat.isSRP ? ' (Registro de Preços)' : ''} `;
  fechamento += `promovida por ${orgao}, `;
  if (dados.valor_estimado !== "Não informado no edital") fechamento += `com valor estimado de ${dados.valor_estimado}, `;
  if (dados.criterio !== "Não identificado") fechamento += `julgada pelo critério de ${dados.criterio.toLowerCase()}`;
  fechamento += `. `;
  if (dados.data_sessao !== "Não identificado") fechamento += `A sessão pública ocorre em ${dados.data_sessao}. `;
  fechamento += `\n\n📌 Este resumo foi gerado automaticamente por análise textual do edital. Ele NÃO substitui a leitura integral do documento e seus anexos. Decisões de participação devem ser tomadas com base no texto oficial completo.`;

  sections.push(fechamento);

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
