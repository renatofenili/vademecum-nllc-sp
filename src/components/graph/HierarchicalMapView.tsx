import { useState, useMemo, useRef, useEffect } from "react";
import Tree, { RawNodeDatum } from "react-d3-tree";
import { Loader2 } from "lucide-react";
import { ActsGraphData, ActNode } from "./types";

interface HierarchicalMapViewProps {
  data: ActsGraphData | null;
  isLoading: boolean;
  rootOption: "cf88" | "lei14133";
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

const tipoLabels: Record<string, string> = {
  constituicao: "Constituição",
  lei: "Lei",
  decreto: "Decreto",
  resolucao: "Resolução",
  portaria: "Portaria",
  instrucao_normativa: "IN",
};

export const HierarchicalMapView = ({
  data,
  isLoading,
  rootOption,
}: HierarchicalMapViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

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

  // Build tree structure from graph data
  const treeData = useMemo((): TreeNode | null => {
    if (!data || !data.nodes.length) return null;

    const rootNode = data.nodes.find((n) => n.id === rootOption);
    if (!rootNode) return null;

    // Build first level children (all non-root nodes)
    const children: TreeNode[] = data.nodes
      .filter((n) => n.id !== rootOption)
      .slice(0, 12)
      .map((act) => ({
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
        children: [],
      }));

    return {
      name: rootOption === "cf88" ? "CF/1988" : "Lei 14.133/2021",
      attributes: {
        tipo: rootNode.tipo,
      },
      nodeData: {
        id: rootOption,
        type: "root" as const,
        act: rootNode,
      },
      children,
    };
  }, [data, rootOption]);

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
      {/* Debug info */}
      <div className="p-2 bg-muted/50 border-b text-xs text-muted-foreground flex gap-4">
        <span>📊 Nós: {data?.nodes.length || 0}</span>
        <span>🔗 Arestas: {data?.edges.length || 0}</span>
        <span>📐 {dimensions.width}×{dimensions.height}px</span>
        <span>🎯 Raiz: {rootOption}</span>
      </div>

      {/* Tree container */}
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
            data={treeData}
            orientation="horizontal"
            pathFunc="diagonal"
            translate={translate}
            nodeSize={{ x: 180, y: 80 }}
            separation={{ siblings: 1.2, nonSiblings: 1.5 }}
            zoom={0.85}
            scaleExtent={{ min: 0.3, max: 2 }}
            collapsible={true}
            initialDepth={2}
            depthFactor={200}
            enableLegacyTransitions={false}
            transitionDuration={300}
          />
        )}
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
