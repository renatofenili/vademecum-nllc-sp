import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Tree, { RawNodeDatum } from "react-d3-tree";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActsGraphData, ActNode } from "./types";

interface HierarchicalMapViewProps {
  data: ActsGraphData | null;
  isLoading: boolean;
}

interface TreeNode extends RawNodeDatum {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNode[];
  nodeData?: {
    id: string;
    type: "root" | "act";
    act?: ActNode;
  };
}

// Hierarchy order for normative types (lower = higher in hierarchy)
const tipoHierarchy: Record<string, number> = {
  constituicao: 0,
  lei_complementar: 1,
  lei: 2,
  decreto: 3,
  resolucao: 4,
  portaria: 5,
  instrucao_normativa: 6,
  outro: 7,
};

const tipoLabels: Record<string, string> = {
  constituicao: "Constituição",
  lei_complementar: "Lei Complementar",
  lei: "Lei",
  decreto: "Decreto",
  resolucao: "Resolução",
  portaria: "Portaria",
  instrucao_normativa: "IN",
  outro: "Outro",
};

export const HierarchicalMapView = ({
  data,
  isLoading,
}: HierarchicalMapViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [zoom, setZoom] = useState(0.85);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.15, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.15, 0.3));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(0.85);
  }, []);
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

  // Build hierarchical tree structure from graph data
  const treeData = useMemo((): TreeNode | null => {
    if (!data || !data.nodes.length) return null;

    // Find CF/88 as root (always)
    const rootNode = data.nodes.find((n) => n.id === "cf88" || n.tipo === "constituicao");
    if (!rootNode) return null;

    // Group nodes by hierarchy level
    const nodesByLevel = new Map<number, ActNode[]>();
    data.nodes
      .filter((n) => n.id !== rootNode.id)
      .forEach((node) => {
        const level = tipoHierarchy[node.tipo] ?? 7;
        if (!nodesByLevel.has(level)) {
          nodesByLevel.set(level, []);
        }
        nodesByLevel.get(level)!.push(node);
      });

    // Build tree recursively by hierarchy level
    const buildLevel = (parentLevel: number): TreeNode[] => {
      const nextLevel = parentLevel + 1;
      const nodesAtLevel = nodesByLevel.get(nextLevel) || [];
      
      return nodesAtLevel.slice(0, 8).map((act) => ({
        name: `${tipoLabels[act.tipo] || act.tipo} ${act.numero}`,
        attributes: {
          tipo: act.tipo,
          status: act.status || "vigente",
        },
        nodeData: {
          id: act.id,
          type: "act" as const,
          act,
        },
        children: buildLevel(nextLevel),
      }));
    };

    // Start with laws under CF/88
    const lawChildren = buildLevel(0);

    return {
      name: "CF/1988",
      attributes: {
        tipo: "constituicao",
      },
      nodeData: {
        id: rootNode.id,
        type: "root" as const,
        act: rootNode,
      },
      children: lawChildren,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!treeData) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] text-muted-foreground">
        <p>Nenhum dado disponível para visualização</p>
      </div>
    );
  }

  const translate = {
    x: Math.max(100, dimensions.width * 0.15),
    y: dimensions.height / 2,
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Info bar */}
      <div className="p-2 bg-muted/50 border-b text-xs text-muted-foreground flex gap-4">
        <span>📊 Normas: {data?.nodes.length || 0}</span>
        <span>🔗 Relações: {data?.edges.length || 0}</span>
        <span>🎯 Raiz: CF/1988</span>
        <span>🔍 Zoom: {Math.round(zoom * 100)}%</span>
      </div>

      {/* Tree container */}
      <div className="relative">
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
            title="Resetar Zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "500px",
            minHeight: "500px",
            background: "#fafafa",
          }}
        >
          {dimensions.width > 0 && dimensions.height > 0 && (
            <Tree
              ref={treeRef}
              data={treeData}
              orientation="horizontal"
              pathFunc="diagonal"
              translate={translate}
              nodeSize={{ x: 180, y: 80 }}
              separation={{ siblings: 1.2, nonSiblings: 1.5 }}
              zoom={zoom}
              scaleExtent={{ min: 0.3, max: 2 }}
              collapsible={true}
              initialDepth={2}
              depthFactor={200}
              enableLegacyTransitions={false}
              transitionDuration={300}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap justify-center gap-4 text-xs">
          {Object.entries(tipoLabels).map(([tipo, label]) => (
            <div key={tipo} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border"
                style={{
                  backgroundColor:
                    tipo === "constituicao"
                      ? "#ef4444"
                      : tipo === "lei"
                      ? "#3b82f6"
                      : tipo === "decreto"
                      ? "#22c55e"
                      : tipo === "resolucao"
                      ? "#f59e0b"
                      : tipo === "portaria"
                      ? "#8b5cf6"
                      : "#6b7280",
                }}
              />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
