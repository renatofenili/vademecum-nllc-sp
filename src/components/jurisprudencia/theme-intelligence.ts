export interface JurisprudenciaThemeSource {
  id: string;
  temas?: string[] | null;
}

export interface SmartTheme {
  key: string;
  label: string;
  count: number;
  aliases: string[];
  categoryId: string;
  recordIds: string[];
}

export interface ThemeCategory {
  id: string;
  label: string;
  description: string;
  count: number;
  decisionCount: number;
  themes: SmartTheme[];
}

export interface ThemeIntelligence {
  allThemes: SmartTheme[];
  navigableThemes: SmartTheme[];
  featuredThemes: SmartTheme[];
  categories: ThemeCategory[];
  themesByRecordId: Record<string, string[]>;
}

type ThemeAccumulator = {
  key: string;
  aliases: Map<string, number>;
  count: number;
  recordIds: Set<string>;
};

const SMALL_WORDS = new Set(["a", "as", "ao", "à", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "para", "por", "sem"]);

const INCOMPLETE_ENDINGS = /(\bde|\bda|\bdo|\bdas|\bdos|\bpara|\bcom|\bsem|\bem|\bna|\bno|\bà|\bao|\be)$/i;

const CATEGORY_CONFIG = [
  {
    id: "procedimento",
    label: "Procedimento",
    description: "Pregão, credenciamento, SRP e modelos de contratação.",
    keywords: ["pregao", "credenciamento", "registro de preco", "sistema de registro de preco", "dispensa", "concessao", "ata", "contratacao direta"],
  },
  {
    id: "habilitacao",
    label: "Habilitação",
    description: "Requisitos de qualificação, atestados e participação.",
    keywords: ["habilitacao", "qualificacao", "atestado", "capacidade tecnica", "consorcio", "cooperativa", "microempresa", "me e epp"],
  },
  {
    id: "objeto_tecnico",
    label: "Objeto & técnica",
    description: "Objeto, especificação, amostras, prova de conceito e ETP.",
    keywords: ["objeto", "especificacao", "amostra", "prova de conceito", "laudo", "ensaio", "abnt", "estudo tecnico preliminar", "software", "marca"],
  },
  {
    id: "julgamento_preco",
    label: "Julgamento & preço",
    description: "Critérios, propostas, planilhas, desempate e pagamento.",
    keywords: ["julgamento", "preco", "planilha", "taxa", "desempate", "lance", "desconto", "pagamento", "remuneracao", "formacao de preco"],
  },
  {
    id: "execucao",
    label: "Execução contratual",
    description: "Garantias, prazos, subcontratação e obrigações de execução.",
    keywords: ["subcontratacao", "garantia", "prazo", "prorrogacao", "visita", "execucao", "fiscalizacao", "reajuste", "entrega", "restricao"],
  },
  {
    id: "setorial",
    label: "Setorial",
    description: "Alimentação, transporte, resíduos, informática e serviços específicos.",
    keywords: ["alimentacao", "cartao", "vale", "transporte", "residuo", "informatica", "informatico", "material escolar", "merenda", "uniforme", "genero alimenticio", "pneu", "helicoptero", "playground"],
  },
  {
    id: "outros",
    label: "Outros temas",
    description: "Assuntos relevantes menos frequentes, porém ainda navegáveis.",
    keywords: [],
  },
] as const;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const cleanTheme = (value: string) => {
  const cleaned = normalizeWhitespace(
    value
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[;,]+$/g, "")
  );

  return cleaned.replace(/^[\-–—•\s]+|[\-–—•\s]+$/g, "");
};

const stripAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const singularizeToken = (token: string) => {
  if (token.length <= 4 || !token.endsWith("s") || token.endsWith("ss")) return token;
  return token.slice(0, -1);
};

// Synonym rules: map variant keys to a canonical key
const THEME_SYNONYMS: [RegExp, string][] = [
  [/^registro de preco$/, "sistema de registro de preco"],
];

const buildThemeKey = (value: string) => {
  let key = normalizeWhitespace(
    stripAccents(value)
      .toLowerCase()
      .replace(/[-/]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map(singularizeToken)
      .join(" ")
  );

  // Apply synonym merging
  for (const [pattern, canonical] of THEME_SYNONYMS) {
    if (pattern.test(key)) {
      key = canonical;
      break;
    }
  }

  return key;
};

const titleizeChunk = (chunk: string, index: number) => {
  const lower = chunk.toLowerCase();

  if (/^[A-Z0-9/.+-]{2,8}$/.test(chunk)) {
    return chunk.toUpperCase();
  }

  if (index > 0 && SMALL_WORDS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const toDisplayLabel = (value: string) => {
  return normalizeWhitespace(value)
    .split(" ")
    .map((word, index) =>
      word
        .split("-")
        .map((part, partIndex) => titleizeChunk(part, index === 0 && partIndex === 0 ? 0 : 1))
        .join("-")
    )
    .join(" ");
};

const isIncompleteTheme = (label: string) => {
  if (INCOMPLETE_ENDINGS.test(label)) return true;
  if (label.length < 4) return true;
  return false;
};

const getCategoryId = (key: string) => {
  const category = CATEGORY_CONFIG.find(({ id, keywords }) => id !== "outros" && keywords.some((keyword) => key.includes(keyword)));
  return category?.id ?? "outros";
};

const chooseBestLabel = (aliases: Map<string, number>) => {
  return Array.from(aliases.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aLooksFormatted = a[0] === toDisplayLabel(a[0]) ? 1 : 0;
      const bLooksFormatted = b[0] === toDisplayLabel(b[0]) ? 1 : 0;
      if (bLooksFormatted !== aLooksFormatted) return bLooksFormatted - aLooksFormatted;
      return a[0].localeCompare(b[0], "pt-BR");
    })[0]?.[0] ?? "";
};

export const buildThemeIntelligence = (records: JurisprudenciaThemeSource[]): ThemeIntelligence => {
  const groups = new Map<string, ThemeAccumulator>();

  records.forEach((record) => {
    record.temas?.forEach((rawTheme) => {
      const cleanedTheme = cleanTheme(rawTheme);
      if (!cleanedTheme) return;

      const key = buildThemeKey(cleanedTheme);
      if (!key) return;

      const current = groups.get(key) ?? {
        key,
        aliases: new Map<string, number>(),
        count: 0,
        recordIds: new Set<string>(),
      };

      current.aliases.set(cleanedTheme, (current.aliases.get(cleanedTheme) ?? 0) + 1);
      current.count += 1;
      current.recordIds.add(record.id);
      groups.set(key, current);
    });
  });

  const allThemes = Array.from(groups.values())
    .map<SmartTheme>((group) => ({
      key: group.key,
      label: toDisplayLabel(chooseBestLabel(group.aliases)),
      count: group.count,
      aliases: Array.from(group.aliases.keys()).map((alias) => toDisplayLabel(alias)).sort((a, b) => a.localeCompare(b, "pt-BR")),
      categoryId: getCategoryId(group.key),
      recordIds: Array.from(group.recordIds),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "pt-BR");
    });

  const themeOrder = new Map(allThemes.map((theme, index) => [theme.label, index]));
  const labelByKey = new Map(allThemes.map((theme) => [theme.key, theme.label]));

  const themesByRecordId = records.reduce<Record<string, string[]>>((acc, record) => {
    const labels = Array.from(
      new Set(
        (record.temas ?? [])
          .map(cleanTheme)
          .filter(Boolean)
          .map(buildThemeKey)
          .map((key) => labelByKey.get(key))
          .filter((label): label is string => Boolean(label))
      )
    ).sort((a, b) => (themeOrder.get(a) ?? 0) - (themeOrder.get(b) ?? 0));

    acc[record.id] = labels;
    return acc;
  }, {});

  const navigableThemes = allThemes.filter((theme) => theme.count >= 2 && !isIncompleteTheme(theme.label));
  const featuredThemes = navigableThemes.slice(0, 8);

  const categories = CATEGORY_CONFIG.map<ThemeCategory>(({ id, label, description }) => {
    const themes = navigableThemes.filter((theme) => theme.categoryId === id);
    const decisionIds = new Set(themes.flatMap((theme) => theme.recordIds));

    return {
      id,
      label,
      description,
      count: themes.length,
      decisionCount: decisionIds.size,
      themes,
    };
  }).filter((category) => category.themes.length > 0);

  return {
    allThemes,
    navigableThemes,
    featuredThemes,
    categories,
    themesByRecordId,
  };
};