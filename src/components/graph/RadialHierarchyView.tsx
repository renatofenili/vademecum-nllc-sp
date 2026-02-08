import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2, GitBranch, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronRight, FileText, Palette, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActsGraphData, ActNode, DispositivosGraphData, DispositivoNode } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Normalize anchors coming from extraction (e.g. "art. 74" -> "art.74") so they can be matched reliably
const normalizeAnchor = (anchor: string): string => {
  return (anchor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[º°]/g, "")
    .replace(/^art(?=\d)/, "art.")
    .replace(/^artigo/, "art.")
    .trim();
};

// Loose numero normalization for fuzzy lookups ("68.304/24" vs "68304/2024")
const normalizeNumeroLoose = (numero: string): string => {
  return (numero || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[º°]/g, "")
    .replace(/[.\-]/g, "")
    .replace(/\//g, "");
};

interface NormaTema {
  norma_id: string;
  tema: string;
  intensidade: string;
}

interface RadialHierarchyViewProps {
  data: ActsGraphData | null;
  isLoading: boolean;
  onDrillDown?: (actId: string) => void;
}

interface ArtigoGroup {
  artigo: DispositivoNode;
  children: DispositivoNode[];
}

interface ExpandedDispositivos {
  actId: string;
  dispositivos: DispositivoNode[];
  artigoGroups: ArtigoGroup[];
  isLoading: boolean;
}

interface RingNode {
  id: string;
  label: string;
  tipo: string;
  act: ActNode;
  ring: number;
  angle: number;
  x: number;
  y: number;
}

// Link types for normative connections
type LinkType = "hierarquia" | "regulamenta" | "remete";

interface GraphLink {
  fromId: string;
  toId: string;
  type: LinkType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const linkStyles: Record<LinkType, { stroke: string; strokeWidth: number; dashArray: string; label: string }> = {
  hierarquia: { stroke: "hsl(220, 10%, 70%)", strokeWidth: 1, dashArray: "", label: "Hierarquia" },
  regulamenta: { stroke: "hsl(220, 10%, 65%)", strokeWidth: 1, dashArray: "6 3", label: "Regulamenta" },
  remete: { stroke: "hsl(220, 10%, 75%)", strokeWidth: 0.75, dashArray: "3 3", label: "Remete" },
};

// Ring assignments by normative type (novo modelo: Lei centro, Decretos anel 1, INs anel 2)
const tipoToRing: Record<string, number> = {
  lei: 0,
  lei_federal: 0,
  lei_estadual: 0,
  lei_complementar: 0,
  decreto: 1,
  resolucao: 2,
  portaria: 2,
  instrucao_normativa: 2,
  outro: 2,
};

const ringLabels: Record<number, string> = {
  0: "Lei",
  1: "Decretos",
  2: "INs / Resoluções",
};

// Paleta jurídica sóbria - hierarquia visual imediata
// Ring 0 = Lei (centro), Ring 1 = Decretos, Ring 2 = INs/Resoluções
const ringColors: Record<number, string> = {
  0: "hsl(210, 60%, 40%)",     // Azul forte institucional (Lei - centro)
  1: "hsl(215, 15%, 45%)",     // Cinza-azulado/slate neutro (Decretos)
  2: "hsl(220, 10%, 65%)",     // Cinza claro (INs/Resoluções)
};

// Cores de texto por anel (para garantir contraste)
const ringTextColors: Record<number, string> = {
  0: "hsl(0, 0%, 100%)",       // Branco (fundo azul)
  1: "hsl(0, 0%, 100%)",       // Branco (fundo slate)
  2: "hsl(220, 15%, 20%)",     // Preto/cinza escuro (fundo claro)
};

const tipoLabels: Record<string, string> = {
  constituicao: "Constituição",
  lei_complementar: "Lei Complementar",
  lei: "Lei",
  lei_federal: "Lei Federal",
  lei_estadual: "Lei Estadual",
  decreto: "Decreto",
  resolucao: "Resolução",
  portaria: "Portaria",
  instrucao_normativa: "Instrução Normativa",
  outro: "Outro",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  vigente: { label: "Vigente", color: "text-green-600" },
  revogado: { label: "Revogado", color: "text-red-600" },
  alterado: { label: "Alterado", color: "text-amber-600" },
  publicada: { label: "Vigente", color: "text-green-600" },
};

export const RadialHierarchyView = ({
  data,
  isLoading,
  onDrillDown,
}: RadialHierarchyViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<RingNode | null>(null);
  const [selectedArtigo, setSelectedArtigo] = useState<ArtigoGroup | null>(null);
  const [hoveredArtigo, setHoveredArtigo] = useState<{ anchor: string; x: number; y: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<RingNode | null>(null);
  const [expandedDispositivosMap, setExpandedDispositivosMap] = useState<Map<string, ExpandedDispositivos>>(new Map());
  
  // Link visibility toggles - hierarchy always visible by default
  const [showHierarchyLinks, setShowHierarchyLinks] = useState(true);
  const [showRegulamentaLinks, setShowRegulamentaLinks] = useState(false);
  const [showRemeteLinks, setShowRemeteLinks] = useState(false);
  
  // Theme mode state
  const [themeModeEnabled, setThemeModeEnabled] = useState(false);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [normasByTheme, setNormasByTheme] = useState<Map<string, Set<string>>>(new Map());
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);

  // Load themes when mode is enabled
  useEffect(() => {
    if (!themeModeEnabled) {
      setSelectedTheme(null);
      return;
    }

    const loadThemes = async () => {
      setIsLoadingThemes(true);
      try {
        // Get all unique themes
        const { data: themes, error: themesError } = await supabase
          .from("normas_temas")
          .select("tema, norma_id, intensidade");

        if (themesError) throw themesError;

        if (themes && themes.length > 0) {
          // Extract unique themes
          const uniqueThemes = [...new Set(themes.map((t) => t.tema))].sort();
          setAvailableThemes(uniqueThemes);

          // Build map of theme -> norma_ids
          const themeMap = new Map<string, Set<string>>();
          themes.forEach((t) => {
            if (!themeMap.has(t.tema)) {
              themeMap.set(t.tema, new Set());
            }
            themeMap.get(t.tema)!.add(t.norma_id);
          });
          setNormasByTheme(themeMap);
        } else {
          setAvailableThemes([]);
          setNormasByTheme(new Map());
        }
      } catch (err) {
        console.error("Error loading themes:", err);
        toast.error("Erro ao carregar temas");
      } finally {
        setIsLoadingThemes(false);
      }
    };

    loadThemes();
  }, [themeModeEnabled]);

  // Get set of highlighted norma IDs based on selected theme
  const highlightedNormaIds = useMemo(() => {
    if (!themeModeEnabled || !selectedTheme) {
      return null; // null means no filtering
    }
    return normasByTheme.get(selectedTheme) || new Set<string>();
  }, [themeModeEnabled, selectedTheme, normasByTheme]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.2, 0.3));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Helper to group dispositivos into artigos
  const groupDispositivosIntoArtigos = (dispositivos: DispositivoNode[]): ArtigoGroup[] => {
    const groups: ArtigoGroup[] = [];
    let currentArtigo: ArtigoGroup | null = null;
    
    dispositivos.forEach((disp) => {
      if (disp.nivel === "artigo") {
        if (currentArtigo) {
          groups.push(currentArtigo);
        }
        currentArtigo = { artigo: disp, children: [] };
      } else if (currentArtigo) {
        currentArtigo.children.push(disp);
      }
    });
    
    if (currentArtigo) {
      groups.push(currentArtigo);
    }
    
    return groups;
  };

  // Function to load dispositivos for a node (supports multiple expansions)
  const loadDispositivos = useCallback(async (actId: string, forceExpand = false) => {
    // If already expanded for this node and not forcing, collapse it (toggle behavior)
    if (!forceExpand && expandedDispositivosMap.has(actId) && !expandedDispositivosMap.get(actId)?.isLoading) {
      setExpandedDispositivosMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(actId);
        return newMap;
      });
      return;
    }

    // Set loading state for this node
    setExpandedDispositivosMap(prev => {
      const newMap = new Map(prev);
      newMap.set(actId, { actId, dispositivos: [], artigoGroups: [], isLoading: true });
      return newMap;
    });

    try {
      const { data: result, error } = await supabase.functions.invoke("graph-dispositivos", {
        body: { act_id: actId },
      });

      if (error) throw error;

      const dispositivosData = result as DispositivosGraphData;
      
      if (dispositivosData.nodes && dispositivosData.nodes.length > 0) {
        const artigoGroups = groupDispositivosIntoArtigos(dispositivosData.nodes);
        setExpandedDispositivosMap(prev => {
          const newMap = new Map(prev);
          newMap.set(actId, {
            actId,
            dispositivos: dispositivosData.nodes,
            artigoGroups,
            isLoading: false,
          });
          return newMap;
        });
        toast.success(`${artigoGroups.length} artigos carregados`);
      } else {
        setExpandedDispositivosMap(prev => {
          const newMap = new Map(prev);
          newMap.delete(actId);
          return newMap;
        });
        toast.info("Nenhum dispositivo encontrado para esta norma");
      }
    } catch (err) {
      console.error("Error loading dispositivos:", err);
      setExpandedDispositivosMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(actId);
        return newMap;
      });
      toast.error("Erro ao carregar dispositivos");
    }
  }, [expandedDispositivosMap]);

  // If "Regulamenta" is enabled, ensure Lei 14.133 is expanded so article-level links can be drawn.
  // NOTE: use backend data nodes here (not radial layout nodes) to avoid ordering issues.
  const lei14133ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "lei" && num.includes("14133") && num.includes("2021");
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto68304ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("68304") && (num.includes("2024") || num.endsWith("24"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto68422ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("68422") && (num.includes("2024") || num.endsWith("24"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto68220ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("68220") && (num.includes("2023") || num.endsWith("23"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto69233ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("69233") && (num.includes("2024") || num.endsWith("24"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto67689ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("67689") && (num.includes("2023") || num.endsWith("23"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto67888ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("67888");
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto67985ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("67985") && (num.includes("2023") || num.endsWith("23"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const decreto68017ActId = useMemo(() => {
    const node = data?.nodes?.find((n) => {
      const num = normalizeNumeroLoose(n.numero);
      return n.tipo === "decreto" && num.includes("68017") && (num.includes("2023") || num.endsWith("23"));
    });
    return node?.id ?? null;
  }, [data?.nodes]);

  const ensureExpanded = useCallback(
    (actId: string) => {
      const expanded = expandedDispositivosMap.get(actId);
      if (expanded && (expanded.isLoading || expanded.artigoGroups.length > 0)) return;
      // Force expand (don't toggle) - used for automatic expansion when Regulamenta is enabled
      void loadDispositivos(actId, true);
    },
    [expandedDispositivosMap, loadDispositivos]
  );

  useEffect(() => {
    if (!showRegulamentaLinks) return;
    if (!lei14133ActId) return;
    ensureExpanded(lei14133ActId);
  }, [showRegulamentaLinks, lei14133ActId, ensureExpanded]);

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    measure();
    const timer = setTimeout(measure, 100);
    
    const ro = new ResizeObserver(measure);
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  // Calculate expansion offset based on Lei central expansion (artigos em círculo)
  const leiExpansionInfo = useMemo(() => {
    if (!lei14133ActId) return { isExpanded: false, artigoCount: 0, ringRadius: 0, pushOffset: 0 };
    
    const leiExpanded = expandedDispositivosMap.get(lei14133ActId);
    if (!leiExpanded || leiExpanded.isLoading || !leiExpanded.artigoGroups.length) {
      return { isExpanded: false, artigoCount: 0, ringRadius: 0, pushOffset: 0 };
    }
    
    const artigoCount = leiExpanded.artigoGroups.length;
    
    // Calcular quantos anéis de artigos precisamos
    const ARTIGOS_PER_RING = 40; // artigos por anel concêntrico
    const artigoRings = Math.ceil(artigoCount / ARTIGOS_PER_RING);
    
    // Raio do primeiro anel de artigos (ao redor da Lei)
    const firstArtigoRingRadius = 70;
    const artigoRingSpacing = 35;
    
    // Último anel de artigos
    const lastArtigoRingRadius = firstArtigoRingRadius + (artigoRings - 1) * artigoRingSpacing;
    
    // Offset para empurrar decretos/INs para fora
    const pushOffset = lastArtigoRingRadius + 40;
    
    return { 
      isExpanded: true, 
      artigoCount, 
      ringRadius: firstArtigoRingRadius,
      ringSpacing: artigoRingSpacing,
      artigosPerRing: ARTIGOS_PER_RING,
      pushOffset 
    };
  }, [lei14133ActId, expandedDispositivosMap]);

  // Legacy expansion offset for other norms
  const expansionOffset = useMemo(() => {
    if (expandedDispositivosMap.size === 0) {
      return { ring: -1, offset: 0 };
    }
    
    // Find the innermost ring with expanded dispositivos (excluding Lei central)
    let minRing = 4;
    let maxOffset = 0;
    
    expandedDispositivosMap.forEach((expanded) => {
      if (expanded.isLoading || !expanded.artigoGroups.length) return;
      if (expanded.actId === lei14133ActId) return; // Lei is handled separately
      
      const expandedNode = data?.nodes.find(n => n.id === expanded.actId);
      if (!expandedNode) return;
      
      const expandedRing = tipoToRing[expandedNode.tipo] ?? 3;
      if (expandedRing < minRing) {
        minRing = expandedRing;
      }
      
      // Calculate offset for this expansion
      const artigoCount = expanded.artigoGroups.length;
      const maxPerRing = 20;
      const artigoRings = Math.ceil(artigoCount / maxPerRing);
      const offset = 75 + (artigoRings * 35) + 30;
      
      if (offset > maxOffset) {
        maxOffset = offset;
      }
    });
    
    if (minRing === 4) return { ring: -1, offset: 0 };
    
    return { ring: minRing, offset: maxOffset };
  }, [expandedDispositivosMap, data?.nodes, lei14133ActId]);

  // Build hierarchical nodes with Lei 14.133 at center
  // Ring 1 = Decretos, Ring 2 = INs/Resoluções (CF removed)
  const { nodes, links, levelYPositions, center, regulatesCount, regulatedByCount, regulatesMap, regulatedByMap } = useMemo(() => {
    if (!data || !data.nodes.length) {
      return { 
        nodes: [], 
        links: [], 
        levelYPositions: [], 
        center: { x: 0, y: 0 },
        regulatesCount: new Map<string, number>(),
        regulatedByCount: new Map<string, number>(),
        regulatesMap: new Map<string, string[]>(),
        regulatedByMap: new Map<string, string[]>(),
      };
    }

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LAYOUT: Lei 14.133 no centro → Decretos anel 1 → INs/Resoluções anel 2
    // CF/88 REMOVIDA do mapa
    // ═══════════════════════════════════════════════════════════════════════════

    // Separate nodes by type (excluding CF)
    const leiNodes: ActNode[] = [];
    const decretoNodes: ActNode[] = [];
    const inResolucaoNodes: ActNode[] = [];

    data.nodes.forEach((node) => {
      const tipo = node.tipo;
      // IGNORAR CF/88
      if (tipo === 'constituicao') {
        return;
      } else if (tipo === 'lei' || tipo === 'lei_federal' || tipo === 'lei_estadual' || tipo === 'lei_complementar') {
        leiNodes.push(node);
      } else if (tipo === 'decreto') {
        decretoNodes.push(node);
      } else {
        // INs, Resoluções, Portarias, outros
        inResolucaoNodes.push(node);
      }
    });

    const result: RingNode[] = [];
    const nodePositions = new Map<string, { x: number; y: number; ring: number; angle: number }>();

    // ═══════════════════════════════════════════════════════════════════════════
    // ANTI-COLISÃO: Constantes e funções auxiliares
    // Layout de 2 linhas: linha1=tipo, linha2=número → nós verticais (pílula vertical)
    // ═══════════════════════════════════════════════════════════════════════════
    const MIN_GAP = 12; // Gap mínimo horizontal (priorizado)
    const MIN_GAP_V = 8; // Gap vertical menor

    // Tamanhos para nós VERTICAIS (mais altos e bem mais estreitos)
    const nodeSizeByRing: Record<number, { width: number; height: number }> = {
      0: { width: 90, height: 60 },   // Lei central (maior)
      1: { width: 70, height: 50 },   // Decretos
      2: { width: 75, height: 48 },   // INs/Resoluções (IN pode ser longo)
    };

    // Estrutura do label de 2 linhas
    interface TwoLineLabel {
      line1: string;
      line2: string;
    }

    const getTwoLineLabel = (act: ActNode): TwoLineLabel => {
      const numero = act.numero || "";
      
      if (act.tipo === "constituicao") {
        return { line1: "CF", line2: "1988" };
      }
      if (act.tipo === "lei" || act.tipo === "lei_federal" || act.tipo === "lei_estadual" || act.tipo === "lei_complementar") {
        return { line1: "Lei nº", line2: numero };
      }
      if (act.tipo === "decreto") {
        return { line1: "Decreto", line2: numero };
      }
      if (act.tipo === "instrucao_normativa") {
        return { line1: "IN", line2: numero };
      }
      if (act.tipo === "resolucao") {
        return { line1: "Resolução", line2: numero };
      }
      if (act.tipo === "portaria") {
        return { line1: "Portaria", line2: numero };
      }
      return { line1: tipoLabels[act.tipo] || act.tipo, line2: numero };
    };

    // Para compatibilidade com código existente
    const getNodeLabel = (act: ActNode, ring: number): string => {
      const twoLine = getTwoLineLabel(act);
      return `${twoLine.line1} ${twoLine.line2}`;
    };

    const estimateNodeSize = (act: ActNode, ring: number): { w: number; h: number } => {
      const cfg = nodeSizeByRing[ring] || nodeSizeByRing[2];
      return { w: cfg.width, h: cfg.height };
    };

    // Colisão priorizada por largura (horizontal)
    const rectsOverlap = (
      x1: number, y1: number, w1: number, h1: number,
      x2: number, y2: number, w2: number, h2: number
    ): boolean => {
      return !(
        x1 + w1 / 2 + MIN_GAP < x2 - w2 / 2 ||
        x2 + w2 / 2 + MIN_GAP < x1 - w1 / 2 ||
        y1 + h1 / 2 + MIN_GAP_V < y2 - h2 / 2 ||
        y2 + h2 / 2 + MIN_GAP_V < y1 - h1 / 2
      );
    };

    const degToRad = (deg: number) => (deg * Math.PI) / 180;

    // Não precisamos mais de variantes de label - sempre usamos 2 linhas completas
    const estimateSizeForLabel = (label: string, ring: number): { w: number; h: number } => {
      const cfg = nodeSizeByRing[ring] || nodeSizeByRing[2];
      return { w: cfg.width, h: cfg.height };
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CENTRO: Lei 14.133 (ring 0 - centro fixo)
    // ═══════════════════════════════════════════════════════════════════════════
    const lei14133 = leiNodes.find(n => 
      n.numero?.includes("14.133") || n.numero?.includes("14133")
    ) || leiNodes[0];

    const placedObstacles: { x: number; y: number; w: number; h: number }[] = [];

    if (lei14133) {
      const { w, h } = estimateNodeSize(lei14133, 0);
      const twoLine = getTwoLineLabel(lei14133);
      nodePositions.set(lei14133.id, { x: cx, y: cy, ring: 0, angle: 0 });
      result.push({
        id: lei14133.id,
        label: `${twoLine.line1} ${twoLine.line2}`,
        tipo: lei14133.tipo,
        act: lei14133,
        ring: 0,
        angle: 0,
        x: cx,
        y: cy,
      });
      placedObstacles.push({ x: cx, y: cy, w, h });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUNÇÕES DE ORDENAÇÃO
    // ═══════════════════════════════════════════════════════════════════════════
    const sortByNumero = (a: ActNode, b: ActNode) => {
      const numA = parseInt(a.numero?.replace(/\D/g, "") || "0", 10);
      const numB = parseInt(b.numero?.replace(/\D/g, "") || "0", 10);
      return numA - numB;
    };

    const tipoOrder: Record<string, number> = {
      instrucao_normativa: 0,
      portaria: 1,
      resolucao: 2,
      outro: 3,
    };

    const sortByTipoNumero = (a: ActNode, b: ActNode) => {
      const oa = tipoOrder[a.tipo] ?? 99;
      const ob = tipoOrder[b.tipo] ?? 99;
      if (oa !== ob) return oa - ob;
      return sortByNumero(a, b);
    };

    // Anti-colisão: mais passos de jitter angular e offset radial para garantir zero sobreposição
    const BASE_JITTER_DEG = [0, 3, -3, 6, -6, 9, -9, 12, -12, 15, -15, 18, -18, 21, -21, 24, -24];
    const BASE_RADIAL_OFFSETS = [0, 12, -12, 24, -24, 36, -36, 48, -48];
    const RADIAL_BAND_PX = 50; // faixa radial mais ampla para garantir espaço

    const placeRing = (opts: {
      acts: ActNode[];
      ring: number;
      baseRadius: number;
      startDeg: number;
      sortFn: (a: ActNode, b: ActNode) => number;
    }) => {
      const { acts, ring, baseRadius, startDeg, sortFn } = opts;
      const sorted = [...acts].sort(sortFn);
      const count = sorted.length;
      if (count === 0) return;

      const slotSpanDeg = 360 / count;
      // Permitir até 50% do slot para jitter (sem invadir vizinho)
      const maxJitterDeg = Math.min(30, slotSpanDeg * 0.5);
      const jitterDeltas = BASE_JITTER_DEG.filter((d) => Math.abs(d) <= maxJitterDeg + 0.01);

      // Greedy placement com fallback de push radial
      sorted.forEach((act, idx) => {
        const baseAngle = degToRad(startDeg + (idx / count) * 360);
        const { w, h } = estimateNodeSize(act, ring);
        const twoLine = getTwoLineLabel(act);
        const fullLabel = `${twoLine.line1} ${twoLine.line2}`;

        let placed: { x: number; y: number; angle: number; r: number; w: number; h: number; label: string } | null = null;

        // 1. Tentar posições dentro da faixa radial normal
        outer: for (const deltaDeg of jitterDeltas) {
          const angle = baseAngle + degToRad(deltaDeg);

          for (const ro of BASE_RADIAL_OFFSETS) {
            const r = Math.max(baseRadius - RADIAL_BAND_PX, Math.min(baseRadius + RADIAL_BAND_PX, baseRadius + ro));
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);

            const collides = placedObstacles.some((p) => rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h));
            if (!collides) {
              placed = { x, y, angle, r, w, h, label: fullLabel };
              break outer;
            }
          }
        }

        // 2. Se ainda colidir, fazer push radial para fora (até 100px além)
        if (!placed) {
          const pushSteps = [60, 72, 84, 96, 108, 120];
          pushLoop: for (const push of pushSteps) {
            for (const deltaDeg of jitterDeltas) {
              const angle = baseAngle + degToRad(deltaDeg);
              const r = baseRadius + push;
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);

              const collides = placedObstacles.some((p) => rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h));
              if (!collides) {
                placed = { x, y, angle, r, w, h, label: fullLabel };
                break pushLoop;
              }
            }
          }
        }

        // 3. Último recurso: posição no ângulo base com raio muito afastado
        if (!placed) {
          const r = baseRadius + 140;
          const x = cx + r * Math.cos(baseAngle);
          const y = cy + r * Math.sin(baseAngle);
          placed = { x, y, angle: baseAngle, r, w, h, label: fullLabel };
        }

        placedObstacles.push({ x: placed.x, y: placed.y, w: placed.w, h: placed.h });
        nodePositions.set(act.id, { x: placed.x, y: placed.y, ring, angle: placed.angle });
        result.push({
          id: act.id,
          label: placed.label,
          tipo: act.tipo,
          act,
          ring,
          angle: placed.angle,
          x: placed.x,
          y: placed.y,
        });
      });
    };

    // Raios base - empurrados para fora quando a Lei está expandida
    const minDim = Math.min(dimensions.width, dimensions.height);
    const BASE_RADIUS_DECRETOS = Math.max(140, minDim * 0.26);
    const BASE_RADIUS_INS = BASE_RADIUS_DECRETOS + Math.max(90, minDim * 0.12);
    
    // Aplicar push se Lei está expandida
    const leiPush = leiExpansionInfo.pushOffset || 0;
    const RADIUS_DECRETOS = BASE_RADIUS_DECRETOS + leiPush;
    const RADIUS_INS = BASE_RADIUS_INS + leiPush;

    // Ring 1: decretos
    placeRing({
      acts: decretoNodes,
      ring: 1,
      baseRadius: RADIUS_DECRETOS,
      startDeg: 270,
      sortFn: sortByNumero,
    });

    // Ring 2: INs/Resoluções
    placeRing({
      acts: inResolucaoNodes,
      ring: 2,
      baseRadius: RADIUS_INS,
      startDeg: 285,
      sortFn: sortByTipoNumero,
    });

    // Y positions for level labels (não usadas neste layout)
    const levelYPositions = [cy, cy + 100, cy + 200];

    // ═══════════════════════════════════════════════════════════════════════════
    // LINKS DE HIERARQUIA: TODOS conectam diretamente à Lei 14.133 (centro)
    // ═══════════════════════════════════════════════════════════════════════════
    const graphLinks: GraphLink[] = [];
    const leiCentralNode = result.find(n => n.ring === 0);
    
    result.forEach((node) => {
      // A Lei central não se conecta a si mesma
      if (node.ring === 0) return;
      
      // Todos os outros nós conectam à Lei central
      if (leiCentralNode) {
        graphLinks.push({
          fromId: leiCentralNode.id,
          toId: node.id,
          type: "hierarquia",
          fromX: leiCentralNode.x,
          fromY: leiCentralNode.y,
          toX: node.x,
          toY: node.y,
        });
      }
    });

    // Add regulation links from backend data if available
    if (data.edges) {
      data.edges.forEach((edge) => {
        const fromPos = nodePositions.get(edge.from_act);
        const toPos = nodePositions.get(edge.to_act);
        
        if (fromPos && toPos) {
          let linkType: LinkType = "remete";
          if (edge.relation_type === "regulates" || edge.relation_type === "implements") {
            linkType = "regulamenta";
          }
          
          // Não duplicar links de hierarquia
          const existingLink = graphLinks.find(
            l => (l.fromId === edge.from_act && l.toId === edge.to_act) ||
                 (l.fromId === edge.to_act && l.toId === edge.from_act)
          );
          if (!existingLink) {
            graphLinks.push({
              fromId: edge.from_act,
              toId: edge.to_act,
              type: linkType,
              fromX: fromPos.x,
              fromY: fromPos.y,
              toX: toPos.x,
              toY: toPos.y,
            });
          }
        }
      });
    }

    // Build regulation counts for detail panel
    const regulatesCount = new Map<string, number>();
    const regulatedByCount = new Map<string, number>();
    const regulatesMap = new Map<string, string[]>();
    const regulatedByMap = new Map<string, string[]>();
    
    graphLinks.forEach((link) => {
      if (link.type === "regulamenta" || link.type === "hierarquia") {
        regulatesCount.set(link.toId, (regulatesCount.get(link.toId) || 0) + 1);
        regulatedByCount.set(link.fromId, (regulatedByCount.get(link.fromId) || 0) + 1);
        
        const existingRegulates = regulatesMap.get(link.toId) || [];
        if (!existingRegulates.includes(link.fromId)) {
          regulatesMap.set(link.toId, [...existingRegulates, link.fromId]);
        }
        
        const existingRegulatedBy = regulatedByMap.get(link.fromId) || [];
        if (!existingRegulatedBy.includes(link.toId)) {
          regulatedByMap.set(link.fromId, [...existingRegulatedBy, link.toId]);
        }
      }
    });

    console.log(`[MAPA] Lei 14.133 no centro | ${decretoNodes.length} Decretos (anel 1) | ${inResolucaoNodes.length} INs/Res (anel 2)`);

    return { 
      nodes: result, 
      links: graphLinks, 
      levelYPositions, 
      center: { x: cx, y: cy },
      regulatesCount,
      regulatedByCount,
      regulatesMap,
      regulatedByMap,
    };
  }, [data, dimensions, expansionOffset, leiExpansionInfo]);

  // Calculate article positions for expanded norms (needed for inter-norm article links)
  const artigoPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; parentActId: string }>();
    
    if (nodes.length === 0) return positions;
    
    nodes.forEach((node) => {
      const nodeExpanded = expandedDispositivosMap.get(node.id);
      if (!nodeExpanded || nodeExpanded.isLoading || !nodeExpanded.artigoGroups.length) return;
      
      const artigoGroups = nodeExpanded.artigoGroups;
      const count = artigoGroups.length;
      const isLeiCentral = node.ring === 0;
      
      artigoGroups.forEach((group, idx) => {
        let artigoX: number;
        let artigoY: number;
        
        if (isLeiCentral) {
          // LAYOUT CIRCULAR para Lei central: artigos em anéis concêntricos
          const ARTIGOS_PER_RING = 40;
          const ringIndex = Math.floor(idx / ARTIGOS_PER_RING);
          const indexInRing = idx % ARTIGOS_PER_RING;
          const countInThisRing = Math.min(ARTIGOS_PER_RING, count - ringIndex * ARTIGOS_PER_RING);
          
          // Raio do anel de artigos
          const baseArtigoRadius = 70 + ringIndex * 35;
          
          // Ângulo do artigo neste anel (distribuído uniformemente)
          const angleStep = (2 * Math.PI) / countInThisRing;
          const angle = -Math.PI / 2 + indexInRing * angleStep; // Começa no topo
          
          artigoX = node.x + baseArtigoRadius * Math.cos(angle);
          artigoY = node.y + baseArtigoRadius * Math.sin(angle);
        } else {
          // Layout original para outras normas (horizontal abaixo)
          const maxPerRing = 20;
          const ringIndex = Math.floor(idx / maxPerRing);
          const indexInRing = idx % maxPerRing;
          const countInThisRing = Math.min(maxPerRing, count - ringIndex * maxPerRing);
          
          const baseOffset = 50 + ringIndex * 30;
          const artigoSpread = Math.min(300, countInThisRing * 25);
          const artigoStartX = -artigoSpread / 2;
          const artigoSpacing = countInThisRing > 1 ? artigoSpread / (countInThisRing - 1) : 0;
          
          artigoX = node.x + (countInThisRing === 1 ? 0 : artigoStartX + indexInRing * artigoSpacing);
          artigoY = node.y + baseOffset;
        }
        
        // Key: "actId:anchor" (e.g., "uuid:art.74")
        const rawAnchor = group.artigo.anchor;
        const normAnchor = normalizeAnchor(rawAnchor);

        positions.set(`${node.id}:${rawAnchor}`, { 
          x: artigoX, 
          y: artigoY, 
          parentActId: node.id 
        });

        // Also store a normalized key to match extraction variations (spaces, accents, º)
        if (normAnchor && normAnchor !== rawAnchor) {
          positions.set(`${node.id}:${normAnchor}`, {
            x: artigoX,
            y: artigoY,
            parentActId: node.id,
          });
        }
      });
    });
    
    return positions;
  }, [nodes, expandedDispositivosMap]);

  // Calculate inter-norm article links (from regulating norms to specific articles)
  const articleLinks = useMemo(() => {
    const linksToArticles: Array<{
      fromNodeId: string;
      fromX: number;
      fromY: number;
      toAnchor: string;
      toX: number;
      toY: number;
      toActId: string;
    }> = [];
    
    if (!data?.edges || artigoPositions.size === 0) return linksToArticles;
    
    // For each edge, check if the target act has expanded articles
    data.edges.forEach((edge) => {
      const fromNode = nodes.find(n => n.id === edge.from_act);
      if (!fromNode) return;
      
      // Check if target act has expanded dispositivos
      const targetExpanded = expandedDispositivosMap.get(edge.to_act);
      if (!targetExpanded || targetExpanded.isLoading || !targetExpanded.artigoGroups.length) return;
      
      // For each evidence, find matching article positions (raw + normalized)
      edge.evidences.forEach((evidence) => {
        const rawToAnchor = (evidence.to_anchor || "").trim();
        if (!rawToAnchor) return;

        const candidates = [rawToAnchor, normalizeAnchor(rawToAnchor)].filter(Boolean);
        for (const candidateAnchor of candidates) {
          const anchorKey = `${edge.to_act}:${candidateAnchor}`;
          const artigoPos = artigoPositions.get(anchorKey);
          if (!artigoPos) continue;

          const toAnchorKey = normalizeAnchor(candidateAnchor) || candidateAnchor;
          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && normalizeAnchor(l.toAnchor) === toAnchorKey && l.toActId === edge.to_act
          );

          if (!exists) {
            linksToArticles.push({
              fromNodeId: fromNode.id,
              fromX: fromNode.x,
              fromY: fromNode.y,
              toAnchor: candidateAnchor,
              toX: artigoPos.x,
              toY: artigoPos.y,
              toActId: edge.to_act,
            });
          }
          break; // stop at first match
        }
      });
    });

    // Fallback (explicit requirement): when "Regulamenta" is enabled and Lei 14.133 is expanded,
    // draw Decreto 68.304 -> arts. 74 e 75 even if evidences are missing/heterogeneous.
    if (lei14133ActId && decreto68304ActId) {
      const fromNode = nodes.find((n) => n.id === decreto68304ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.74", "art.75"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(`${lei14133ActId}:${normalizeAnchor(a)}`);
          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback: Decreto 68.422 -> art.31 da Lei 14.133
    if (lei14133ActId && decreto68422ActId) {
      const fromNode = nodes.find((n) => n.id === decreto68422ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.31"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);
          
          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback: Decreto 68.220 -> art.8 da Lei 14.133
    if (lei14133ActId && decreto68220ActId) {
      const fromNode = nodes.find((n) => n.id === decreto68220ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.8"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);
          
          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback (validated): Decreto 69.233 -> art.174 da Lei 14.133
    if (lei14133ActId && decreto69233ActId) {
      const fromNode = nodes.find((n) => n.id === decreto69233ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.174"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);

          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback (validated): Decreto 67.689 -> art.12 da Lei 14.133
    if (lei14133ActId && decreto67689ActId) {
      const fromNode = nodes.find((n) => n.id === decreto67689ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.12"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);

          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback (validated): Decreto 67.888 -> art.23 da Lei 14.133
    if (lei14133ActId && decreto67888ActId) {
      const fromNode = nodes.find((n) => n.id === decreto67888ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.23"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);

          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // Fallback (validated): Decreto 67.985 -> art.20 da Lei 14.133
    if (lei14133ActId && decreto67985ActId) {
      const fromNode = nodes.find((n) => n.id === decreto67985ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.20"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);

          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }
    // Fallback (validated): Decreto 68.017 -> art.18 da Lei 14.133
    if (lei14133ActId && decreto68017ActId) {
      const fromNode = nodes.find((n) => n.id === decreto68017ActId);
      const targetExpanded = expandedDispositivosMap.get(lei14133ActId);
      if (fromNode && targetExpanded && !targetExpanded.isLoading && targetExpanded.artigoGroups.length) {
        const anchors = ["art.18"];
        anchors.forEach((a) => {
          const key = `${lei14133ActId}:${a}`;
          const normKey = `${lei14133ActId}:${normalizeAnchor(a)}`;
          const pos = artigoPositions.get(key) || artigoPositions.get(normKey);

          if (!pos) return;

          const exists = linksToArticles.some(
            (l) => l.fromNodeId === fromNode.id && l.toActId === lei14133ActId && normalizeAnchor(l.toAnchor) === normalizeAnchor(a)
          );
          if (exists) return;

          linksToArticles.push({
            fromNodeId: fromNode.id,
            fromX: fromNode.x,
            fromY: fromNode.y,
            toAnchor: a,
            toX: pos.x,
            toY: pos.y,
            toActId: lei14133ActId,
          });
        });
      }
    }

    // DEBUG: Log regulamenta targets for debugging
    console.log("[DEBUG] articleLinks built:", linksToArticles.length, "links");
    linksToArticles.forEach((l) => {
      console.log(`  - ${l.fromNodeId} -> ${l.toAnchor} (${l.toActId})`);
    });
    
    return linksToArticles;
  }, [data?.edges, nodes, expandedDispositivosMap, artigoPositions, lei14133ActId, decreto68304ActId, decreto68422ActId, decreto68220ActId, decreto69233ActId, decreto67689ActId, decreto67888ActId, decreto67985ActId, decreto68017ActId]);

  // Map of highlighted article keys ("actId:normalizedAnchor") -> source color when Regulamenta is active
  // Highlight arts. 74, 75 from Decreto 68.304, art. 31 from Decreto 68.422, and art. 8 from Decreto 68.220 -> Lei 14.133
  // Set of validated decree IDs for Regulamenta mode
  const validatedDecretoIds = useMemo(() => {
    return [
      decreto68304ActId, 
      decreto68422ActId, 
      decreto68220ActId, 
      decreto69233ActId, 
      decreto67689ActId, 
      decreto67888ActId, 
      decreto67985ActId,
      decreto68017ActId,
    ].filter(Boolean) as string[];
  }, [decreto68304ActId, decreto68422ActId, decreto68220ActId, decreto69233ActId, decreto67689ActId, decreto67888ActId, decreto67985ActId, decreto68017ActId]);

  const highlightedArticlesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!showRegulamentaLinks) return map;
    articleLinks
      .filter((link) => {
        if (link.toActId !== lei14133ActId) return false;
        const normAnchor = normalizeAnchor(link.toAnchor);
        
        // Decreto 68.304 -> arts. 74 e 75
        if (link.fromNodeId === decreto68304ActId) {
          return normAnchor === "art.74" || normAnchor === "art74" || normAnchor === "art.75" || normAnchor === "art75";
        }
        
        // Decreto 68.422 -> art. 31
        if (link.fromNodeId === decreto68422ActId) {
          return normAnchor === "art.31" || normAnchor === "art31";
        }
        
        // Decreto 68.220 -> art. 8
        if (link.fromNodeId === decreto68220ActId) {
          return normAnchor === "art.8" || normAnchor === "art8";
        }

        // Decreto 69.233 -> art. 174
        if (link.fromNodeId === decreto69233ActId) {
          return normAnchor === "art.174" || normAnchor === "art174";
        }

        // Decreto 67.689 -> art. 12
        if (link.fromNodeId === decreto67689ActId) {
          return normAnchor === "art.12" || normAnchor === "art12";
        }

        // Decreto 67.888 -> art. 23
        if (link.fromNodeId === decreto67888ActId) {
          return normAnchor === "art.23" || normAnchor === "art23";
        }

        // Decreto 67.985 -> art. 20
        if (link.fromNodeId === decreto67985ActId) {
          return normAnchor === "art.20" || normAnchor === "art20";
        }

        // Decreto 68.017 -> art. 18
        if (link.fromNodeId === decreto68017ActId) {
          return normAnchor === "art.18" || normAnchor === "art18";
        }
        
        return false;
      })
      .forEach((link) => {
        const fromNode = nodes.find((n) => n.id === link.fromNodeId);
        const sourceColor = fromNode ? ringColors[fromNode.ring] : "hsl(160, 35%, 45%)";
        map.set(`${link.toActId}:${normalizeAnchor(link.toAnchor)}`, sourceColor);
      });
    return map;
  }, [showRegulamentaLinks, articleLinks, nodes, decreto68304ActId, decreto68422ActId, decreto68220ActId, decreto69233ActId, decreto67689ActId, decreto67888ActId, decreto67985ActId, decreto68017ActId, lei14133ActId]);
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.3, Math.min(3, prev + delta)));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] text-muted-foreground">
        <p>Nenhum dado disponível para visualização</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Info bar - Row 1: Stats and Link toggles */}
      {/* Diagnóstico: Backend envia CF/88, mas ela é intencionalmente ignorada no render */}
      <div className="p-2 bg-muted/50 border-b text-xs text-muted-foreground flex flex-wrap items-center gap-4">
        {(() => {
          // Contar nós intencionalmente excluídos (CF/88)
          const cfCount = data.nodes.filter(n => n.tipo === 'constituicao').length;
          const expectedRendered = data.nodes.length - cfCount;
          const hasDivergence = nodes.length !== expectedRendered;
          
          return (
            <>
              <span>📊 Backend: {data.nodes.length} | Renderizado: {nodes.length}{cfCount > 0 ? ` (−${cfCount} CF)` : ''}</span>
              {hasDivergence && (
                <span className="text-red-500 font-bold">⚠️ DIVERGÊNCIA! (esperado: {expectedRendered})</span>
              )}
            </>
          );
        })()}
        <span>🎯 Raiz: Lei 14.133/2021</span>
        <span>🔍 Zoom: {Math.round(zoom * 100)}%</span>
        
        <Separator orientation="vertical" className="h-4" />
        
        {/* Link visibility toggles */}
        <div className="flex items-center gap-3">
          <span className="font-medium">Ligações:</span>
          
          {/* Hierarchy - always visible indicator */}
          <button
            onClick={() => setShowHierarchyLinks(!showHierarchyLinks)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
              showHierarchyLinks 
                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" 
                : "bg-muted text-muted-foreground opacity-50"
            }`}
          >
            <div className="w-4 h-0.5 bg-blue-500 rounded" />
            <span>Hierarquia</span>
            {showHierarchyLinks ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          
          {/* Regulamenta */}
          <button
            onClick={() => setShowRegulamentaLinks(!showRegulamentaLinks)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
              showRegulamentaLinks 
                ? "bg-green-500/20 text-green-600 dark:text-green-400" 
                : "bg-muted text-muted-foreground opacity-50"
            }`}
          >
            <div className="w-4 h-0.5 bg-green-500 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)" }} />
            <span>Regulamenta</span>
            {showRegulamentaLinks ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          
        </div>
        
        <Separator orientation="vertical" className="h-4" />
        
        {/* Theme Mode Toggle */}
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <span className="font-medium">Modo Tema</span>
          <Switch
            checked={themeModeEnabled}
            onCheckedChange={setThemeModeEnabled}
            className="scale-90"
          />
        </div>
        
        {/* Theme Selector */}
        {themeModeEnabled && (
          <div className="flex items-center gap-2">
            {isLoadingThemes ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : availableThemes.length > 0 ? (
              <>
                <Select
                  value={selectedTheme || ""}
                  onValueChange={(value) => setSelectedTheme(value || null)}
                >
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="Selecionar tema..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableThemes.map((theme) => (
                      <SelectItem key={theme} value={theme} className="text-xs">
                        {theme}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTheme && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {highlightedNormaIds?.size || 0} normas
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setSelectedTheme(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground italic">Nenhum tema cadastrado</span>
            )}
          </div>
        )}
      </div>

      {/* SVG container */}
      <div className="relative flex-1">
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-background/90 backdrop-blur-sm"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-background/90 backdrop-blur-sm"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-background/90 backdrop-blur-sm"
            onClick={handleResetZoom}
            title="Resetar"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Tooltip for act nodes */}
        {hoveredNode && (
          <div
            className="absolute z-20 bg-popover border border-border rounded-lg shadow-lg p-3 max-w-sm pointer-events-none"
            style={{
              left: Math.min(hoveredNode.x * zoom + pan.x + 20, dimensions.width - 250),
              top: Math.min(hoveredNode.y * zoom + pan.y - 10, dimensions.height - 180),
            }}
          >
            {/* Nome */}
            <p className="font-semibold text-sm text-foreground">
              {hoveredNode.act.tipo === "constituicao" 
                ? "Constituição Federal de 1988" 
                : `${tipoLabels[hoveredNode.act.tipo] || hoveredNode.act.tipo} nº ${hoveredNode.act.numero}`}
            </p>
            
            {/* Tipo e Status */}
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="bg-muted px-2 py-0.5 rounded">
                {tipoLabels[hoveredNode.act.tipo] || hoveredNode.act.tipo}
              </span>
              <span className={statusLabels[hoveredNode.act.status || "vigente"]?.color || "text-muted-foreground"}>
                ● {statusLabels[hoveredNode.act.status || "vigente"]?.label || hoveredNode.act.status || "Vigente"}
              </span>
            </div>
            
            {/* Regulation counts */}
            <div className="flex items-center gap-4 mt-3 text-xs bg-muted/50 rounded px-2 py-1.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Regulamenta:</span>
                <span className="font-semibold text-foreground">
                  {regulatesCount.get(hoveredNode.id) || 0}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Regulamentado por:</span>
                <span className="font-semibold text-foreground">
                  {regulatedByCount.get(hoveredNode.id) || 0}
                </span>
              </div>
            </div>
            
            {/* Ementa */}
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {hoveredNode.act.ementa}
            </p>
          </div>
        )}

        {/* Small hover tooltip for artigo name */}
        {hoveredArtigo && (
          <div
            className="absolute z-20 bg-popover border border-border rounded px-2 py-1 shadow-md pointer-events-none"
            style={{
              left: hoveredArtigo.x * zoom + pan.x + 20,
              top: hoveredArtigo.y * zoom + pan.y - 10,
            }}
          >
            <span className="text-xs font-medium text-foreground">{hoveredArtigo.anchor}</span>
          </div>
        )}

        <div
          ref={containerRef}
          className="w-full h-[550px] bg-white cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <svg
            width={dimensions.width}
            height={dimensions.height}
            className="overflow-visible"
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Horizontal level guidelines */}
              {levelYPositions.slice(1).map((yPos: number, index: number) => (
                <line
                  key={`level-line-${index + 1}`}
                  x1={40}
                  y1={yPos}
                  x2={dimensions.width - 40}
                  y2={yPos}
                  stroke="hsl(220, 10%, 85%)"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                  opacity={0.3}
                />
              ))}

              {/* Level labels on the left */}
              {levelYPositions.map((yPos: number, index: number) => (
                <text
                  key={`level-label-${index}`}
                  x={20}
                  y={yPos}
                  textAnchor="start"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[10px] font-medium"
                >
                  {ringLabels[index] || ''}
                </text>
              ))}

              {/* Connection links with types - filtered by visibility toggles */}
              {/* REGRA: Linhas retas quando possível, curvas apenas para evitar cruzamentos */}
              {(() => {
                const visibleLinks = links.filter((link) => {
                  let isVisible = 
                    (link.type === "hierarquia" && showHierarchyLinks) ||
                    (link.type === "regulamenta" && showRegulamentaLinks) ||
                    (link.type === "remete" && showRemeteLinks);
                  
                  if (showRegulamentaLinks && link.type === "hierarquia" && link.fromId === lei14133ActId) {
                    if (validatedDecretoIds.includes(link.toId)) {
                      isVisible = false;
                    }
                  }
                  return isVisible;
                });
                
                const cx = center.x;
                const cy = center.y;
                const cfRadius = 50;
                
                // ═══════════════════════════════════════════════════════════════════
                // ESTRATÉGIA: LINHAS RETAS quando possível, CURVAS apenas quando
                // atravessariam o centro ou quando há múltiplos links ao mesmo destino
                // ═══════════════════════════════════════════════════════════════════
                
                // Agrupar por nó de destino para detectar links múltiplos
                const linksByTarget = new Map<string, number>();
                visibleLinks.forEach((link) => {
                  const count = linksByTarget.get(link.toId) || 0;
                  linksByTarget.set(link.toId, count + 1);
                });
                
                // Contador de índice por destino
                const linkIndexByTarget = new Map<string, number>();
                
                return visibleLinks.map((link, index) => {
                  const style = linkStyles[link.type];
                  
                  const fromHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.fromId);
                  const toHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.toId);
                  const linkHighlighted = fromHighlighted || toHighlighted;
                  
                  const dx = link.toX - link.fromX;
                  const dy = link.toY - link.fromY;
                  const lineLength = Math.sqrt(dx * dx + dy * dy);
                  
                  if (lineLength === 0) return null;
                  
                  // Verificar se atravessaria o centro (CF/88)
                  const distToCenter = Math.abs(dy * cx - dx * cy + link.toX * link.fromY - link.toY * link.fromX) / lineLength;
                  const t = ((cx - link.fromX) * dx + (cy - link.fromY) * dy) / (lineLength * lineLength);
                  const centerIsBetween = t > 0.1 && t < 0.9;
                  const wouldCrossCenter = distToCenter < cfRadius && centerIsBetween;
                  
                  // Verificar se há múltiplos links ao mesmo destino
                  const targetCount = linksByTarget.get(link.toId) || 1;
                  const currentIndex = linkIndexByTarget.get(link.toId) || 0;
                  linkIndexByTarget.set(link.toId, currentIndex + 1);
                  const hasMultipleToSameTarget = targetCount > 1;
                  
                  // ═══════════════════════════════════════════════════════════════════
                  // DECISÃO: RETA ou CURVA?
                  // - RETA: quando não atravessa o centro E não há múltiplos links ao mesmo destino
                  // - CURVA: quando atravessa o centro OU há múltiplos links ao mesmo destino
                  // ═══════════════════════════════════════════════════════════════════
                  const needsCurve = wouldCrossCenter || hasMultipleToSameTarget;
                  
                  if (!needsCurve) {
                    // Linha reta
                    return (
                      <line
                        key={`link-${link.fromId}-${link.toId}-${index}`}
                        x1={link.fromX}
                        y1={link.fromY}
                        x2={link.toX}
                        y2={link.toY}
                        stroke={style.stroke}
                        strokeWidth={style.strokeWidth}
                        strokeDasharray={style.dashArray}
                        opacity={highlightedNormaIds ? (linkHighlighted ? 0.5 : 0.08) : 0.35}
                        className="transition-all duration-300 hover:opacity-70 hover:stroke-[1.5]"
                      />
                    );
                  }
                  
                  // Linha curva - calcular ponto de controle
                  const midX = (link.fromX + link.toX) / 2;
                  const midY = (link.fromY + link.toY) / 2;
                  
                  // Vetor do centro para o ponto médio (direção radial para fora)
                  const radialX = midX - cx;
                  const radialY = midY - cy;
                  const radialLength = Math.sqrt(radialX * radialX + radialY * radialY);
                  
                  // Normalizar vetor radial
                  const radialNormX = radialLength > 0 ? radialX / radialLength : 0;
                  const radialNormY = radialLength > 0 ? radialY / radialLength : 1;
                  
                  // Calcular offset
                  const baseOffset = wouldCrossCenter ? cfRadius * 2.5 : 20;
                  const groupOffset = hasMultipleToSameTarget ? (currentIndex - (targetCount - 1) / 2) * 25 : 0;
                  
                  // Offset total - sempre positivo (para fora)
                  const totalOffset = baseOffset + Math.abs(groupOffset);
                  
                  // Ponto de controle: mover na direção radial (para fora do centro)
                  const controlX = midX + radialNormX * totalOffset;
                  const controlY = midY + radialNormY * totalOffset;
                  
                  return (
                    <path
                      key={`link-${link.fromId}-${link.toId}-${index}`}
                      d={`M ${link.fromX} ${link.fromY} Q ${controlX} ${controlY} ${link.toX} ${link.toY}`}
                      fill="none"
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth}
                      strokeDasharray={style.dashArray}
                      opacity={highlightedNormaIds ? (linkHighlighted ? 0.5 : 0.08) : 0.35}
                      className="transition-all duration-300 hover:opacity-70 hover:stroke-[1.5]"
                    />
                  );
                });
              })()}

              {/* Article-level connection links (from regulating norms to specific articles) */}
              {/* Show lines from Decreto 68.304 -> arts. 74/75, Decreto 68.422 -> art. 31, and Decreto 68.220 -> art. 8 when Regulamenta is enabled */}
              {showRegulamentaLinks && articleLinks
                .filter((link) => {
                  if (link.toActId !== lei14133ActId) return false;
                  const normAnchor = normalizeAnchor(link.toAnchor);
                  
                  // Decreto 68.304 -> Lei 14.133 arts. 74/75
                  if (link.fromNodeId === decreto68304ActId) {
                    return normAnchor === "art.74" || normAnchor === "art74" || normAnchor === "art.75" || normAnchor === "art75";
                  }
                  
                  // Decreto 68.422 -> Lei 14.133 art. 31
                  if (link.fromNodeId === decreto68422ActId) {
                    return normAnchor === "art.31" || normAnchor === "art31";
                  }
                  
                  // Decreto 68.220 -> Lei 14.133 art. 8
                  if (link.fromNodeId === decreto68220ActId) {
                    return normAnchor === "art.8" || normAnchor === "art8";
                  }

                  // Decreto 69.233 -> Lei 14.133 art. 174
                  if (link.fromNodeId === decreto69233ActId) {
                    return normAnchor === "art.174" || normAnchor === "art174";
                  }

                  // Decreto 67.689 -> Lei 14.133 art. 12
                  if (link.fromNodeId === decreto67689ActId) {
                    return normAnchor === "art.12" || normAnchor === "art12";
                  }

                  // Decreto 67.888 -> Lei 14.133 art. 23
                  if (link.fromNodeId === decreto67888ActId) {
                    return normAnchor === "art.23" || normAnchor === "art23";
                  }
                  
                  // Decreto 67.985 -> Lei 14.133 art. 20
                  if (link.fromNodeId === decreto67985ActId) {
                    return normAnchor === "art.20" || normAnchor === "art20";
                  }

                  // Decreto 68.017 -> Lei 14.133 art. 18
                  if (link.fromNodeId === decreto68017ActId) {
                    return normAnchor === "art.18" || normAnchor === "art18";
                  }
                  
                  return false;
                })
                .map((link, index) => {
                const fromNode = nodes.find(n => n.id === link.fromNodeId);
                
                const fromHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.fromNodeId);
                const toHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.toActId);
                const linkHighlighted = fromHighlighted || toHighlighted;
                
                const fromColor = fromNode ? ringColors[fromNode.ring] : "hsl(160, 35%, 45%)";
                
                return (
                  <g key={`article-link-${link.fromNodeId}-${link.toAnchor}-${index}`}>
                    {/* Glow effect behind the line */}
                    <line
                      x1={link.fromX}
                      y1={link.fromY}
                      x2={link.toX}
                      y2={link.toY}
                      stroke={fromColor}
                      strokeWidth={6}
                      opacity={highlightedNormaIds ? (linkHighlighted ? 0.25 : 0.05) : 0.2}
                      strokeLinecap="round"
                      style={{ filter: "blur(3px)" }}
                    />
                    {/* Main solid line */}
                    <line
                      x1={link.fromX}
                      y1={link.fromY}
                      x2={link.toX}
                      y2={link.toY}
                      stroke={fromColor}
                      strokeWidth={2.5}
                      opacity={highlightedNormaIds ? (linkHighlighted ? 0.9 : 0.2) : 0.85}
                      strokeLinecap="round"
                      className="transition-opacity duration-300"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              })}

              {/* Arrow marker definition */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L6,3 z" fill="hsl(0, 0%, 40%)" opacity="0.6" />
                </marker>
              </defs>

              {/* Nodes */}
              {nodes.map((node) => {
                const isCenter = node.ring === 0;
                
                // ═══════════════════════════════════════════════════════════════════
                // LAYOUT VERTICAL: Nós em forma de pílula vertical (mais alto, mais estreito)
                // Labels de 2 linhas: linha1=tipo, linha2=número
                // ═══════════════════════════════════════════════════════════════════
                const nodeSizeByRingRender: Record<number, { width: number; height: number; fontSize: number; lineSpacing: number }> = {
                  0: { width: 90, height: 60, fontSize: 11, lineSpacing: 14 },  // Lei (centro)
                  1: { width: 70, height: 50, fontSize: 9, lineSpacing: 12 },   // Decretos
                  2: { width: 75, height: 48, fontSize: 8, lineSpacing: 11 },   // INs/Resoluções
                };
                
                const sizeConfig = nodeSizeByRingRender[node.ring] || nodeSizeByRingRender[2];
                const nodeWidth = sizeConfig.width;
                const nodeHeight = sizeConfig.height;
                const fontSize = sizeConfig.fontSize;
                const lineSpacing = sizeConfig.lineSpacing;
                
                // Calcular label de 2 linhas
                const getTwoLineLabelRender = (act: ActNode): { line1: string; line2: string } => {
                  const numero = act.numero || "";
                  
                  if (act.tipo === "constituicao") {
                    return { line1: "CF", line2: "1988" };
                  }
                  if (act.tipo === "lei" || act.tipo === "lei_federal" || act.tipo === "lei_estadual" || act.tipo === "lei_complementar") {
                    return { line1: "Lei nº", line2: numero };
                  }
                  if (act.tipo === "decreto") {
                    return { line1: "Decreto", line2: numero };
                  }
                  if (act.tipo === "instrucao_normativa") {
                    return { line1: "IN", line2: numero };
                  }
                  if (act.tipo === "resolucao") {
                    return { line1: "Resolução", line2: numero };
                  }
                  if (act.tipo === "portaria") {
                    return { line1: "Portaria", line2: numero };
                  }
                  return { line1: tipoLabels[act.tipo] || act.tipo, line2: numero };
                };
                
                const twoLineLabel = getTwoLineLabelRender(node.act);
                
                const color = ringColors[node.ring];
                const textColor = ringTextColors[node.ring];
                const nodeExpanded = expandedDispositivosMap.get(node.id);
                const hasExpandedDispositivos = !!nodeExpanded && !nodeExpanded.isLoading && nodeExpanded.artigoGroups.length > 0;
                const artigoGroups = hasExpandedDispositivos ? nodeExpanded.artigoGroups : [];
                const isLoadingDispositivos = !!nodeExpanded?.isLoading;
                
                // Theme mode highlighting
                const isHighlighted = !highlightedNormaIds || highlightedNormaIds.has(node.id) || isCenter;
                const nodeOpacity = highlightedNormaIds ? (isHighlighted ? 1 : 0.15) : 1;

                return (
                  <g key={node.id} style={{ opacity: nodeOpacity }} className="transition-opacity duration-300">
                    {/* Main node */}
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(node);
                      }}
                      className="cursor-pointer"
                    >
                      {/* Node as vertical rounded rectangle (pílula vertical) */}
                      <rect
                        x={-nodeWidth / 2}
                        y={-nodeHeight / 2}
                        width={nodeWidth}
                        height={nodeHeight}
                        rx={12}
                        ry={12}
                        fill={color}
                        stroke={selectedNode?.id === node.id ? "hsl(210, 70%, 50%)" : isHighlighted && highlightedNormaIds ? "hsl(45, 70%, 50%)" : node.ring === 3 ? "hsl(220, 15%, 50%)" : "transparent"}
                        strokeWidth={selectedNode?.id === node.id ? 3 : isHighlighted && highlightedNormaIds ? 2 : node.ring === 3 ? 1.5 : 0}
                        className="transition-all duration-300"
                        style={{
                          filter: hoveredNode?.id === node.id 
                            ? "brightness(1.1) drop-shadow(0 3px 8px rgba(0,0,0,0.25))" 
                            : selectedNode?.id === node.id 
                              ? "drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))" 
                              : "none",
                        }}
                      />
                      
                      {/* Label de 2 linhas: tipo na linha1, número na linha2 */}
                      <text
                        textAnchor="middle"
                        className="font-medium pointer-events-none select-none"
                        style={{ fontSize, fill: textColor, fontWeight: isCenter ? 600 : 500 }}
                      >
                        <tspan x="0" dy={-lineSpacing / 2}>
                          {twoLineLabel.line1}
                        </tspan>
                        <tspan x="0" dy={lineSpacing}>
                          {twoLineLabel.line2}
                        </tspan>
                      </text>
                      
                      {/* Loading indicator for dispositivos */}
                      {isLoadingDispositivos && (
                        <g transform="translate(40, -20)">
                          <circle r={8} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-muted-foreground animate-pulse"
                            style={{ fontSize: 8 }}
                          >
                            ...
                          </text>
                        </g>
                      )}
                    </g>

                    {/* Artigos as child nodes around the parent - SEMPRE EM CÍRCULO */}
                    {hasExpandedDispositivos && artigoGroups.map((group, idx) => {
                      const count = artigoGroups.length;
                      const isLeiCentral = node.ring === 0;
                      
                      // LAYOUT CIRCULAR para TODAS as normas: artigos em anéis concêntricos
                      // Lei central: mais artigos por anel (maior raio disponível)
                      // Outras normas: menos artigos por anel (menor área)
                      const ARTIGOS_PER_RING = isLeiCentral ? 40 : Math.min(count, 24);
                      const ringIndex = Math.floor(idx / ARTIGOS_PER_RING);
                      const indexInRing = idx % ARTIGOS_PER_RING;
                      const countInThisRing = Math.min(ARTIGOS_PER_RING, count - ringIndex * ARTIGOS_PER_RING);
                      
                      // Raio base depende do tipo de nó
                      // Lei central: mais espaço, outras normas: círculo mais compacto
                      const baseArtigoRadius = isLeiCentral ? 70 + ringIndex * 35 : 45 + ringIndex * 25;
                      
                      // Ângulo do artigo neste anel (distribuído uniformemente, começa no topo)
                      const angleStep = (2 * Math.PI) / countInThisRing;
                      const angle = -Math.PI / 2 + indexInRing * angleStep;
                      
                      const artigoX = node.x + baseArtigoRadius * Math.cos(angle);
                      const artigoY = node.y + baseArtigoRadius * Math.sin(angle);

                      // Check if this article is a target of a connection line and get source color
                      const artigoKey = `${node.id}:${normalizeAnchor(group.artigo.anchor)}`;
                      const linkedColor = highlightedArticlesMap.get(artigoKey);
                      const isLinkedArticle = !!linkedColor;

                      return (
                        <g key={`artigo-${idx}`}>
                          {/* Connection line from parent to artigo - same color as parent */}
                          <line
                            x1={node.x}
                            y1={node.y}
                            x2={artigoX}
                            y2={artigoY}
                            stroke={color}
                            strokeWidth={1}
                            strokeDasharray="3 2"
                            opacity={0.5}
                          />
                          
                          {/* Artigo node - click to open detail, same color as parent norm */}
                          <g
                            transform={`translate(${artigoX}, ${artigoY})`}
                            onMouseEnter={() => setHoveredArtigo({ anchor: group.artigo.anchor, x: artigoX, y: artigoY })}
                            onMouseLeave={() => setHoveredArtigo(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedArtigo(group);
                            }}
                            className="cursor-pointer"
                          >
                            {/* Glow filter for linked articles - same color as source decree */}
                            {isLinkedArticle && (
                              <circle
                                r={22}
                                fill="none"
                                stroke={linkedColor}
                                strokeWidth={3}
                                opacity={0.6}
                                className="animate-pulse"
                              />
                            )}
                            <circle
                              r={14}
                              fill={isLinkedArticle ? `color-mix(in srgb, ${linkedColor} 15%, white 85%)` : "white"}
                              stroke={isLinkedArticle ? linkedColor : color}
                              strokeWidth={isLinkedArticle ? 2.5 : 2}
                              strokeOpacity={isLinkedArticle ? 1 : 0.6}
                              className="transition-all duration-200 hover:brightness-95"
                            />
                            <text
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="fill-foreground font-semibold pointer-events-none"
                              style={{ fontSize: 7 }}
                            >
                              {group.artigo.anchor.replace(/^art\.?/i, "").trim() || `A${idx + 1}`}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* Legend - only node types (links are controlled in the toolbar) */}
      <div className="p-3 border-t border-border">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
          <span className="font-medium text-muted-foreground">Nós por hierarquia:</span>
          {Object.entries(ringLabels).map(([ring, label]) => (
            <div key={ring} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: ringColors[Number(ring)] }}
              />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel Sheet */}
      <Sheet open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0 flex flex-col">
          {selectedNode && (
            <>
              <SheetHeader className="p-4 pb-3 border-b">
                <SheetTitle className="text-base font-semibold leading-tight">
                  {selectedNode.act.tipo === "constituicao" 
                    ? "Constituição Federal de 1988" 
                    : `${tipoLabels[selectedNode.act.tipo] || selectedNode.act.tipo} nº ${selectedNode.act.numero}`}
                </SheetTitle>
              </SheetHeader>
              
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Tipo e Status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {tipoLabels[selectedNode.act.tipo] || selectedNode.act.tipo}
                    </Badge>
                    <Badge 
                      variant="outline"
                      className={statusLabels[selectedNode.act.status || "vigente"]?.color || "text-muted-foreground"}
                    >
                      {statusLabels[selectedNode.act.status || "vigente"]?.label || selectedNode.act.status || "Vigente"}
                    </Badge>
                  </div>
                  
                  {/* Resumo / Ementa */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Resumo</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedNode.act.ementa}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  {/* Normas que regulamenta */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-green-600" />
                      Regulamenta ({regulatesCount.get(selectedNode.id) || 0})
                    </h4>
                    {(regulatesMap.get(selectedNode.id) || []).length > 0 ? (
                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                        {(regulatesMap.get(selectedNode.id) || []).map((nodeId) => {
                          const relatedNode = nodes.find((n) => n.id === nodeId);
                          if (!relatedNode) return null;
                          return (
                            <button
                              key={nodeId}
                              onClick={() => setSelectedNode(relatedNode)}
                              className="w-full text-left p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm"
                            >
                              <span className="font-medium">
                                {tipoLabels[relatedNode.act.tipo] || relatedNode.act.tipo} {relatedNode.act.numero}
                              </span>
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {relatedNode.act.ementa}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma norma regulamentada</p>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* Normas que o regulamentam */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <ArrowDownLeft className="h-4 w-4 text-blue-600" />
                      Regulamentado por ({regulatedByCount.get(selectedNode.id) || 0})
                    </h4>
                    {(regulatedByMap.get(selectedNode.id) || []).length > 0 ? (
                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                        {(regulatedByMap.get(selectedNode.id) || []).map((nodeId) => {
                          const relatedNode = nodes.find((n) => n.id === nodeId);
                          if (!relatedNode) return null;
                          return (
                            <button
                              key={nodeId}
                              onClick={() => setSelectedNode(relatedNode)}
                              className="w-full text-left p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm"
                            >
                              <span className="font-medium">
                                {tipoLabels[relatedNode.act.tipo] || relatedNode.act.tipo} {relatedNode.act.numero}
                              </span>
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {relatedNode.act.ementa}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma norma regulamentadora</p>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* Botão Expandir Dispositivos (sempre disponível para normas; CF não aparece neste modo) */}
                  {selectedNode.act.tipo !== "constituicao" && (() => {
                    const selectedExpanded = expandedDispositivosMap.get(selectedNode.id);
                    const isExpanded = !!selectedExpanded && !selectedExpanded.isLoading && selectedExpanded.artigoGroups.length > 0;
                    const isLoading = !!selectedExpanded?.isLoading;
                    
                    return (
                      <Button
                        variant={isExpanded ? "default" : "outline"}
                        className="w-full justify-start gap-2"
                        disabled={isLoading}
                        onClick={() => loadDispositivos(selectedNode.id)}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <GitBranch className="h-4 w-4" />
                        )}
                        {isExpanded
                          ? `Recolher dispositivos (${selectedExpanded.artigoGroups.length} artigos)`
                          : "Expandir dispositivos"}
                      </Button>
                    );
                  })()}
                  
                  {/* Dispositivos hierarchy view */}
                  {(() => {
                    const selectedExpanded = expandedDispositivosMap.get(selectedNode.id);
                    if (!selectedExpanded || selectedExpanded.isLoading || !selectedExpanded.artigoGroups.length) {
                      return null;
                    }
                    
                    const artigoGroups = selectedExpanded.artigoGroups;
                    
                    // Nível colors and labels
                    const nivelConfig: Record<string, { color: string; label: string; indent: number }> = {
                      artigo: { color: "bg-amber-500", label: "Art.", indent: 0 },
                      paragrafo: { color: "bg-cyan-500", label: "§", indent: 1 },
                      inciso: { color: "bg-pink-500", label: "", indent: 2 },
                      alinea: { color: "bg-purple-500", label: "", indent: 3 },
                    };

                    return (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {artigoGroups.length} Artigos ({selectedExpanded.dispositivos.length} dispositivos)
                          </h4>
                          <div className="flex gap-1">
                            {Object.entries(nivelConfig).slice(0, 4).map(([nivel, config]) => (
                              <Badge 
                                key={nivel} 
                                variant="outline" 
                                className="text-[10px] px-1.5 py-0"
                              >
                                <span className={`w-2 h-2 rounded-full ${config.color} mr-1`} />
                                {nivel}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <ScrollArea className="h-[300px]" type="always">
                          <div className="space-y-1 pr-3">
                            {artigoGroups.map((group, groupIdx) => (
                              <Collapsible key={groupIdx} defaultOpen={groupIdx === 0}>
                                <CollapsibleTrigger className="w-full">
                                  <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-left group">
                                    <ChevronRight className="h-4 w-4 mt-0.5 text-amber-600 transition-transform group-data-[state=open]:rotate-90" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                        <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
                                          {group.artigo.anchor}
                                        </span>
                                        {group.children.length > 0 && (
                                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                            +{group.children.length}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1" style={{ textAlign: "justify" }}>
                                        {group.artigo.texto}
                                      </p>
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent>
                                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-muted pl-2">
                                    {group.children.map((child, childIdx) => {
                                      const config = nivelConfig[child.nivel] || nivelConfig.inciso;
                                      return (
                                        <div
                                          key={childIdx}
                                          className="p-1.5 rounded text-xs hover:bg-muted/50 transition-colors"
                                          style={{ marginLeft: `${config.indent * 8}px` }}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${config.color} shrink-0`} />
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                              {child.anchor}
                                            </span>
                                          </div>
                                          <p className="text-muted-foreground mt-0.5" style={{ textAlign: "justify" }}>
                                            {child.texto}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Artigo Detail Dialog */}
      <Dialog open={!!selectedArtigo} onOpenChange={(open) => !open && setSelectedArtigo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          {selectedArtigo && (
            <>
              <DialogHeader className="p-6 pb-4 flex-shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  {selectedArtigo.artigo.anchor}
                </DialogTitle>
              </DialogHeader>
              
              <ScrollArea className="flex-1 overflow-auto" type="always">
                <div className="px-6 pb-6 pr-4">
                    {/* Render formatted article text */}
                    {(() => {
                    // Combine artigo text with children texts
                    let fullText = selectedArtigo.artigo.texto;
                    if (selectedArtigo.children.length > 0) {
                      fullText += " " + selectedArtigo.children.map(c => c.texto).join(" ");
                    }
                    
                    // Apply formal formatting (same logic as NormasTab)
                    const applyFormatting = (text: string): string => {
                      let formatted = text;
                      
                      // === OCR/PDF extraction error corrections ===
                      
                      // Fix "||" -> "II -", "|||" -> "III -", etc.
                      formatted = formatted.replace(
                        /(^|[.;:\s])\|(\|{0,6})\s*[-–—]?\s*(?=[A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç])/gm,
                        (match, prefix, pipes) => {
                          const romanMap: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };
                          const numPipes = pipes.length + 1;
                          return prefix + (romanMap[numPipes] || "I".repeat(numPipes)) + " - ";
                        }
                      );
                      
                      // Fix "0" (zero) -> "o" (article) when followed by a capitalized word
                      formatted = formatted.replace(/\s0\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, " o $1");
                      
                      // === Formatting rules ===
                      
                      // Normalize line breaks that don't start new dispositivos
                      formatted = formatted.replace(
                        /\n+(?!\s*(?:Art\.?|§|[IVXLCDM]+\s*[-–—]|[a-z]\)|\d+\s*[-–—]))/gi,
                        ' '
                      );
                      formatted = formatted.replace(/\s{2,}/g, ' ');
                      
                      // Roman numeral incisos (I –, II –, etc.)
                      formatted = formatted.replace(
                        /([.;:])\s*([IVXLCDM]+)\s*[-–—]?\s*(?=[A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç])/g,
                        '$1\n\n$2 - '
                      );
                      
                      // Letter alíneas (a), b), etc.)
                      formatted = formatted.replace(
                        /([.;:])\s+([a-z])\)\s*/g,
                        '$1\n\n    $2) '
                      );
                      
                      // Paragraphs (§)
                      formatted = formatted.replace(
                        /([.;:])\s*(§\s*(?:\d+|único)\s*(?:º|°|o)?)(?=\s*(?:[-–—]\s*)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/gi,
                        '$1\n\n$2'
                      );
                      formatted = formatted.replace(
                        /([a-záàâãéêíóôõúç0-9])\s*(§\s*(?:\d+|único)\s*(?:º|°|o)?)(?=\s*[-–—]\s*[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/gi,
                        '$1\n\n$2'
                      );
                      
                      // Numbered items "1.", "2.", etc.
                      formatted = formatted.replace(
                        /([.;:])\s*(\d{1,2})\.\s+(?=[a-záàâãéêíóôõúç])/gi,
                        "$1\n\n$2. "
                      );
                      
                      // Clean up more than 2 consecutive newlines
                      formatted = formatted.replace(/\n{3,}/g, '\n\n');
                      
                      return formatted.trim();
                    };
                    
                    const formattedText = applyFormatting(fullText);
                    const paragraphs = formattedText.split(/\n\n+/);
                    
                    return (
                      <div className="space-y-3">
                        {paragraphs.map((para, idx) => {
                          const trimmed = para.trim();
                          if (!trimmed) return null;
                          
                          // Determine indentation
                          const isAlinea = /^[a-z]\)/.test(trimmed);
                          const isInciso = /^[IVXLCDM]+\s*[-–—]/.test(trimmed);
                          const isParagrafo = /^§/.test(trimmed);
                          const isNumberedItem = /^\d{1,2}\./.test(trimmed);
                          
                          const indentClass = isAlinea ? "ml-8" : (isInciso || isNumberedItem) ? "ml-4" : isParagrafo ? "ml-2" : "";
                          
                          return (
                            <p
                              key={idx}
                              className={`text-sm text-foreground leading-relaxed ${indentClass}`}
                              style={{ textAlign: "justify" }}
                            >
                              {trimmed}
                            </p>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
