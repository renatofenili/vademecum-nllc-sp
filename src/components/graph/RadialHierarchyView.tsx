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
  hierarquia: { stroke: "hsl(0, 0%, 15%)", strokeWidth: 2.5, dashArray: "", label: "Hierarquia" },
  regulamenta: { stroke: "hsl(0, 0%, 25%)", strokeWidth: 2, dashArray: "8 4", label: "Regulamenta" },
  remete: { stroke: "hsl(0, 0%, 35%)", strokeWidth: 1.5, dashArray: "3 3", label: "Remete" },
};

// Ring assignments by normative type
const tipoToRing: Record<string, number> = {
  constituicao: 0,
  lei_complementar: 1,
  lei: 1,
  decreto: 2,
  resolucao: 3,
  portaria: 3,
  instrucao_normativa: 3,
  outro: 3,
};

const ringLabels: Record<number, string> = {
  0: "Constituição",
  1: "Leis",
  2: "Decretos",
  3: "Portarias / Resoluções / INs",
};

// Softer, institutional palette
const ringColors: Record<number, string> = {
  0: "hsl(0, 45%, 45%)",       // Muted burgundy for CF
  1: "hsl(215, 40%, 50%)",     // Slate blue for Laws
  2: "hsl(160, 35%, 45%)",     // Sage green for Decrees
  3: "hsl(250, 30%, 55%)",     // Soft purple for others
};

const tipoLabels: Record<string, string> = {
  constituicao: "Constituição",
  lei_complementar: "Lei Complementar",
  lei: "Lei",
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
  const loadDispositivos = useCallback(async (actId: string) => {
    // If already expanded for this node, collapse it
    if (expandedDispositivosMap.has(actId) && !expandedDispositivosMap.get(actId)?.isLoading) {
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

  const ensureExpanded = useCallback(
    (actId: string) => {
      const expanded = expandedDispositivosMap.get(actId);
      if (expanded && (expanded.isLoading || expanded.artigoGroups.length > 0)) return;
      // Only expand when not already expanded/loading (avoid the toggle-collapse behavior)
      void loadDispositivos(actId);
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

  // Calculate expansion offset based on all expanded dispositivos
  const expansionOffset = useMemo(() => {
    if (expandedDispositivosMap.size === 0) {
      return { ring: -1, offset: 0 };
    }
    
    // Find the innermost ring with expanded dispositivos
    let minRing = 4;
    let maxOffset = 0;
    
    expandedDispositivosMap.forEach((expanded) => {
      if (expanded.isLoading || !expanded.artigoGroups.length) return;
      
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
  }, [expandedDispositivosMap, data?.nodes]);

  // Build radial nodes and links
  const { nodes, links, ringRadii, center, regulatesCount, regulatedByCount, regulatesMap, regulatedByMap } = useMemo(() => {
    if (!data || !data.nodes.length) {
      return { 
        nodes: [], 
        links: [], 
        ringRadii: [], 
        center: { x: 0, y: 0 },
        regulatesCount: new Map<string, number>(),
        regulatedByCount: new Map<string, number>(),
        regulatesMap: new Map<string, string[]>(),
        regulatedByMap: new Map<string, string[]>(),
      };
    }

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const maxRadius = Math.min(cx, cy) - 60;
    
    // Base ring radii - will be adjusted if there's expansion
    const baseRadii = [0, maxRadius * 0.35, maxRadius * 0.65, maxRadius * 0.95];
    
    // Apply expansion offset to rings beyond the expanded one
    const radii = baseRadii.map((r, ringIdx) => {
      if (expansionOffset.ring >= 0 && ringIdx > expansionOffset.ring) {
        return r + expansionOffset.offset;
      }
      return r;
    });

    // Group nodes by ring
    const nodesByRing: Map<number, ActNode[]> = new Map([
      [0, []],
      [1, []],
      [2, []],
      [3, []],
    ]);

    data.nodes.forEach((node) => {
      const ring = tipoToRing[node.tipo] ?? 3;
      nodesByRing.get(ring)!.push(node);
    });

    // Calculate positions
    const result: RingNode[] = [];
    const nodePositions = new Map<string, { x: number; y: number; ring: number }>();

    nodesByRing.forEach((nodesInRing, ring) => {
      const radius = radii[ring];
      const count = nodesInRing.length;
      
      nodesInRing.forEach((act, index) => {
        let angle: number;
        let x: number;
        let y: number;

        if (ring === 0) {
          // Center node
          x = cx;
          y = cy;
          angle = 0;
        } else {
          // Distribute evenly around the ring
          angle = (2 * Math.PI * index) / count - Math.PI / 2;
          x = cx + radius * Math.cos(angle);
          y = cy + radius * Math.sin(angle);
        }

        nodePositions.set(act.id, { x, y, ring });

        result.push({
          id: act.id,
          label: `${tipoLabels[act.tipo] || act.tipo} ${act.numero}`,
          tipo: act.tipo,
          act,
          ring,
          angle,
          x,
          y,
        });
      });
    });

    // Build links with explicit types
    const graphLinks: GraphLink[] = [];
    
    // 1. Hierarchy links (from ring differences)
    result.forEach((node) => {
      if (node.ring === 0) return;
      
      // Find parent in previous ring
      const parentRing = node.ring - 1;
      const parentsInRing = result.filter((n) => n.ring === parentRing);
      
      if (parentsInRing.length > 0) {
        // Connect to nearest parent by angle
        const nearest = parentsInRing.reduce((a, b) => {
          const distA = Math.abs(a.angle - node.angle);
          const distB = Math.abs(b.angle - node.angle);
          return distA < distB ? a : b;
        });
        
        graphLinks.push({
          fromId: nearest.id,
          toId: node.id,
          type: "hierarquia",
          fromX: nearest.x,
          fromY: nearest.y,
          toX: node.x,
          toY: node.y,
        });
      }
    });

    // 2. Links from edges data (regulamenta / remete)
    if (data.edges) {
      data.edges.forEach((edge) => {
        const fromPos = nodePositions.get(edge.from_act);
        const toPos = nodePositions.get(edge.to_act);
        
        if (fromPos && toPos) {
          // Map backend relation types to our link types
          let linkType: LinkType = "remete";
          if (edge.relation_type === "regulates" || edge.relation_type === "implements") {
            linkType = "regulamenta";
          } else if (edge.relation_type === "refers_to" || edge.relation_type === "amends") {
            linkType = "remete";
          }
          
          // Avoid duplicate hierarchy links
          const isHierarchyLink = Math.abs(fromPos.ring - toPos.ring) === 1;
          if (!isHierarchyLink) {
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

    // Build regulation counts and maps per node
    // In normative hierarchy: outer rings REGULATE inner rings
    // Example: Decreto (ring 2) REGULATES Lei (ring 1)
    // So for hierarchy links (from inner to outer): toId regulates fromId
    const regulatesCount = new Map<string, number>(); // How many norms this node regulates (provides implementation for)
    const regulatedByCount = new Map<string, number>(); // How many norms regulate/implement this node
    const regulatesMap = new Map<string, string[]>(); // List of node IDs this node regulates
    const regulatedByMap = new Map<string, string[]>(); // List of node IDs that regulate this node
    
    graphLinks.forEach((link) => {
      if (link.type === "regulamenta" || link.type === "hierarquia") {
        // For hierarchy: outer ring (toId) REGULATES inner ring (fromId)
        // toId regulates fromId (reversed from before)
        regulatesCount.set(link.toId, (regulatesCount.get(link.toId) || 0) + 1);
        regulatedByCount.set(link.fromId, (regulatedByCount.get(link.fromId) || 0) + 1);
        
        // Build lists
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

    return { 
      nodes: result, 
      links: graphLinks, 
      ringRadii: radii, 
      center: { x: cx, y: cy },
      regulatesCount,
      regulatedByCount,
      regulatesMap,
      regulatedByMap,
    };
  }, [data, dimensions, expansionOffset]);

  // Calculate article positions for expanded norms (needed for inter-norm article links)
  const artigoPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; parentActId: string }>();
    
    if (nodes.length === 0) return positions;
    
    nodes.forEach((node) => {
      const nodeExpanded = expandedDispositivosMap.get(node.id);
      if (!nodeExpanded || nodeExpanded.isLoading || !nodeExpanded.artigoGroups.length) return;
      
      const artigoGroups = nodeExpanded.artigoGroups;
      const count = artigoGroups.length;
      const maxPerRing = 20;
      
      artigoGroups.forEach((group, idx) => {
        const ringIndex = Math.floor(idx / maxPerRing);
        const indexInRing = idx % maxPerRing;
        const countInThisRing = Math.min(maxPerRing, count - ringIndex * maxPerRing);
        
        const baseRadius = 75;
        const ringSpacing = 35;
        const artigoRadius = baseRadius + ringIndex * ringSpacing;
        
        const angleSpread = Math.min(Math.PI * 1.8, countInThisRing * 0.18);
        const startAngle = node.angle - angleSpread / 2;
        const artigoAngle = countInThisRing > 1 
          ? startAngle + (indexInRing / (countInThisRing - 1)) * angleSpread
          : node.angle;
        
        const artigoX = node.x + artigoRadius * Math.cos(artigoAngle);
        const artigoY = node.y + artigoRadius * Math.sin(artigoAngle);
        
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
    
    return linksToArticles;
  }, [data?.edges, nodes, expandedDispositivosMap, artigoPositions, lei14133ActId, decreto68304ActId]);

  // Map of highlighted article keys ("actId:normalizedAnchor") -> source color when Regulamenta is active
  const highlightedArticlesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!showRegulamentaLinks) return map;
    articleLinks.forEach((link) => {
      const fromNode = nodes.find((n) => n.id === link.fromNodeId);
      const sourceColor = fromNode ? ringColors[fromNode.ring] : "hsl(160, 35%, 45%)";
      map.set(`${link.toActId}:${normalizeAnchor(link.toAnchor)}`, sourceColor);
    });
    return map;
  }, [showRegulamentaLinks, articleLinks, nodes]);
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
      <div className="p-2 bg-muted/50 border-b text-xs text-muted-foreground flex flex-wrap items-center gap-4">
        <span>📊 Normas: {data.nodes.length}</span>
        <span>🎯 Raiz: CF/1988</span>
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
          
          {/* Remete */}
          <button
            onClick={() => setShowRemeteLinks(!showRemeteLinks)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
              showRemeteLinks 
                ? "bg-purple-500/20 text-purple-600 dark:text-purple-400" 
                : "bg-muted text-muted-foreground opacity-50"
            }`}
          >
            <div className="w-4 h-0.5 bg-purple-500 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 1px, currentColor 1px, currentColor 2px)" }} />
            <span>Remete</span>
            {showRemeteLinks ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
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
          className="w-full h-[550px] bg-gradient-to-br from-background to-muted/30 cursor-grab active:cursor-grabbing"
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
              {/* Ring circles */}
              {ringRadii.slice(1).map((radius, index) => (
                <circle
                  key={`ring-${index + 1}`}
                  cx={center.x}
                  cy={center.y}
                  r={radius}
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
              ))}

              {/* Ring labels */}
              {ringRadii.slice(1).map((radius, index) => (
                <text
                  key={`ring-label-${index + 1}`}
                  x={center.x}
                  y={center.y - radius - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-medium"
                >
                  {ringLabels[index + 1]}
                </text>
              ))}

              {/* Connection links with types - filtered by visibility toggles */}
              {links.map((link, index) => {
                const style = linkStyles[link.type];
                
                // Check if this link type should be visible
                const isVisible = 
                  (link.type === "hierarquia" && showHierarchyLinks) ||
                  (link.type === "regulamenta" && showRegulamentaLinks) ||
                  (link.type === "remete" && showRemeteLinks);
                
                if (!isVisible) return null;
                
                // Dim links if theme mode is active and neither endpoint is highlighted
                const fromHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.fromId);
                const toHighlighted = !highlightedNormaIds || highlightedNormaIds.has(link.toId);
                const linkHighlighted = fromHighlighted || toHighlighted;
                
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
                    opacity={highlightedNormaIds ? (linkHighlighted ? 0.8 : 0.1) : 0.6}
                    className="transition-opacity duration-300"
                  />
                );
              })}

              {/* Article-level connection links (from regulating norms to specific articles) */}
              {/* Only show lines from Decreto 68.304 -> arts. 74/75 when Regulamenta is enabled */}
              {showRegulamentaLinks && articleLinks
                .filter((link) => {
                  // Only show Decreto 68.304 -> Lei 14.133 arts. 74/75
                  if (link.fromNodeId !== decreto68304ActId) return false;
                  if (link.toActId !== lei14133ActId) return false;
                  const normAnchor = normalizeAnchor(link.toAnchor);
                  return normAnchor === "art.74" || normAnchor === "art74" || normAnchor === "art.75" || normAnchor === "art75";
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
                // Larger nodes: ellipse for full name display
                const nodeWidth = isCenter ? 90 : 110;
                const nodeHeight = isCenter ? 45 : 36;
                const color = ringColors[node.ring];
                const nodeExpanded = expandedDispositivosMap.get(node.id);
                const hasExpandedDispositivos = !!nodeExpanded && !nodeExpanded.isLoading && nodeExpanded.artigoGroups.length > 0;
                const artigoGroups = hasExpandedDispositivos ? nodeExpanded.artigoGroups : [];
                const isLoadingDispositivos = !!nodeExpanded?.isLoading;
                
                // Theme mode highlighting
                const isHighlighted = !highlightedNormaIds || highlightedNormaIds.has(node.id) || isCenter;
                const nodeOpacity = highlightedNormaIds ? (isHighlighted ? 1 : 0.15) : 1;
                
                // Full label without truncation
                const fullLabel = isCenter 
                  ? "CF/1988" 
                  : `${tipoLabels[node.act.tipo] || node.act.tipo} ${node.act.numero}`;

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
                      {/* Node as rounded rectangle for full name */}
                      <rect
                        x={-nodeWidth / 2}
                        y={-nodeHeight / 2}
                        width={nodeWidth}
                        height={nodeHeight}
                        rx={nodeHeight / 2}
                        ry={nodeHeight / 2}
                        fill={color}
                        stroke={selectedNode?.id === node.id ? "hsl(var(--primary))" : isHighlighted && highlightedNormaIds ? "hsl(45, 70%, 50%)" : "hsl(0, 0%, 95%)"}
                        strokeWidth={selectedNode?.id === node.id ? 3 : isHighlighted && highlightedNormaIds ? 2 : 1.5}
                        className="transition-all duration-300"
                        style={{
                          filter: hoveredNode?.id === node.id ? "brightness(1.15) drop-shadow(0 2px 4px rgba(0,0,0,0.2))" : "none",
                        }}
                      />
                      
                      {/* Node label - full name */}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-white font-medium pointer-events-none select-none"
                        style={{ fontSize: isCenter ? 13 : 10 }}
                      >
                        {fullLabel}
                      </text>
                      
                      {/* Loading indicator for dispositivos */}
                      {isLoadingDispositivos && (
                        <g transform="translate(50, -15)">
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

                    {/* Artigos as child nodes around the parent */}
                    {hasExpandedDispositivos && artigoGroups.map((group, idx) => {
                      const count = artigoGroups.length;
                      const maxPerRing = 20;
                      const ringIndex = Math.floor(idx / maxPerRing);
                      const indexInRing = idx % maxPerRing;
                      const countInThisRing = Math.min(maxPerRing, count - ringIndex * maxPerRing);
                      
                      const baseRadius = 75; // Adjusted for larger pill nodes
                      const ringSpacing = 35;
                      const artigoRadius = baseRadius + ringIndex * ringSpacing;
                      
                      // Distribute around parent node
                      const angleSpread = Math.min(Math.PI * 1.8, countInThisRing * 0.18);
                      const startAngle = node.angle - angleSpread / 2;
                      const artigoAngle = countInThisRing > 1 
                        ? startAngle + (indexInRing / (countInThisRing - 1)) * angleSpread
                        : node.angle;
                      
                      const artigoX = node.x + artigoRadius * Math.cos(artigoAngle);
                      const artigoY = node.y + artigoRadius * Math.sin(artigoAngle);

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
                  
                  {/* Botão Expandir Dispositivos - oculto para CF/88 */}
                  {selectedNode.ring !== 0 && (() => {
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
                        
                        <ScrollArea className="max-h-[300px]">
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {selectedArtigo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  {selectedArtigo.artigo.anchor}
                </DialogTitle>
              </DialogHeader>
              
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="py-2">
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
                      
                      // Normalize line breaks that don't start new dispositivos
                      formatted = formatted.replace(
                        /\n+(?!\s*(?:Art\.?|§|[IVXLCDM]+\s*[-–—]|[a-z]\)|\d+\s*[-–—]))/gi,
                        ' '
                      );
                      formatted = formatted.replace(/\s{2,}/g, ' ');
                      
                      // Roman numeral incisos (I –, II –, etc.)
                      formatted = formatted.replace(
                        /([.;:])\s+([IVXLCDM]+)\s*[-–—]\s*/g,
                        '$1\n\n$2 – '
                      );
                      
                      // Letter alíneas (a), b), etc.)
                      formatted = formatted.replace(
                        /([.;:])\s+([a-z])\)\s*/g,
                        '$1\n\n    $2) '
                      );
                      
                      // Paragraphs (§)
                      formatted = formatted.replace(
                        /\s+(§\s*\d+[º°]?\.?)/g,
                        '\n\n$1'
                      );
                      formatted = formatted.replace(
                        /\s+(§\s*[Úú]nico\.?)/gi,
                        '\n\n$1'
                      );
                      
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
                          
                          const indentClass = isAlinea ? "ml-8" : isInciso ? "ml-4" : isParagrafo ? "ml-2" : "";
                          
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
