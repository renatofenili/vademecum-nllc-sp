import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Tree, { RawNodeDatum, CustomNodeElementProps } from "react-d3-tree";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ActsGraphData, ActNode, ActEdge } from "./types";
import { cn } from "@/lib/utils";

interface HierarchicalMapViewProps {
  data: ActsGraphData | null;
  isLoading: boolean;
  rootOption: "cf88" | "lei14133";
}

interface TreeNode extends RawNodeDatum {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNode[];
  _collapsed?: boolean;
  nodeData?: {
    id: string;
    type: "root" | "act" | "dispositivo" | "subdispositivo";
    act?: ActNode;
    texto?: string;
    anchor?: string;
    nivel?: string;
    references?: ActEdge[];
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

const tipoColors: Record<string, { bg: string; border: string; text: string }> = {
  constituicao: { bg: "hsl(var(--chart-1))", border: "hsl(var(--chart-1))", text: "#fff" },
  lei: { bg: "hsl(var(--chart-2))", border: "hsl(var(--chart-2))", text: "#fff" },
  decreto: { bg: "hsl(var(--chart-3))", border: "hsl(var(--chart-3))", text: "#fff" },
  resolucao: { bg: "hsl(var(--chart-4))", border: "hsl(var(--chart-4))", text: "#fff" },
  portaria: { bg: "hsl(var(--chart-5))", border: "hsl(var(--chart-5))", text: "#fff" },
  instrucao_normativa: { bg: "hsl(var(--muted))", border: "hsl(var(--border))", text: "hsl(var(--foreground))" },
};

const getNodeColor = (tipo: string) => {
  return tipoColors[tipo] || tipoColors.instrucao_normativa;
};

export const HierarchicalMapView = ({
  data,
  isLoading,
  rootOption,
}: HierarchicalMapViewProps) => {
  const [showReferences, setShowReferences] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (containerRef.current) {
      const { offsetWidth, offsetHeight } = containerRef.current;
      setDimensions({ width: offsetWidth, height: offsetHeight });
    }
  }, []);

  // Build tree structure from graph data
  const treeData = useMemo((): TreeNode | null => {
    if (!data || !data.nodes.length) return null;

    const rootNode = data.nodes.find((n) => n.id === rootOption);
    if (!rootNode) return null;

    // Find acts that connect to root
    const connectedActIds = new Set<string>();
    data.edges.forEach((edge) => {
      if (edge.to_act === rootOption) {
        connectedActIds.add(edge.from_act);
      }
    });

    // Build first level children (acts connected to root)
    const firstLevelChildren: TreeNode[] = data.nodes
      .filter((n) => connectedActIds.has(n.id) && n.id !== rootOption)
      .slice(0, 12) // Limit for visual clarity
      .map((act) => {
        const actEdges = data.edges.filter((e) => e.from_act === act.id);
        
        return {
          name: `${tipoLabels[act.tipo] || act.tipo} ${act.numero}`,
          attributes: {
            tipo: act.tipo,
            status: act.status || "vigente",
          },
          nodeData: {
            id: act.id,
            type: "act" as const,
            act,
            references: actEdges,
          },
          children: [], // Will be populated on expansion
        };
      });

    // If no connected acts, show all acts as first level
    if (firstLevelChildren.length === 0) {
      data.nodes
        .filter((n) => n.id !== rootOption)
        .slice(0, 12)
        .forEach((act) => {
          const actEdges = data.edges.filter((e) => e.from_act === act.id);
          firstLevelChildren.push({
            name: `${tipoLabels[act.tipo] || act.tipo} ${act.numero}`,
            attributes: {
              tipo: act.tipo,
              status: act.status || "vigente",
            },
            nodeData: {
              id: act.id,
              type: "act" as const,
              act,
              references: actEdges,
            },
            children: [],
          });
        });
    }

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
      children: firstLevelChildren,
    };
  }, [data, rootOption]);

  const handleNodeClick = useCallback((nodeDatum: RawNodeDatum) => {
    const nodeId = (nodeDatum as TreeNode).nodeData?.id;
    if (!nodeId) return;

    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Custom node renderer
  const renderCustomNode = useCallback(
    ({ nodeDatum, toggleNode }: CustomNodeElementProps) => {
      const node = nodeDatum as TreeNode;
      const nodeData = node.nodeData;
      const tipo = nodeData?.act?.tipo || "lei";
      const colors = getNodeColor(tipo);
      const isRoot = nodeData?.type === "root";
      const isExpanded = nodeData?.id ? expandedNodes.has(nodeData.id) : false;
      
      const nodeSize = isRoot ? 80 : 60;
      const fontSize = isRoot ? 12 : 10;

      const handleClick = () => {
        if (toggleNode) toggleNode();
        handleNodeClick(nodeDatum);
      };

      return (
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <g onClick={handleClick} style={{ cursor: "pointer" }}>
              {/* Node circle */}
              <circle
                r={nodeSize / 2}
                fill={colors.bg}
                stroke={isExpanded ? "hsl(var(--primary))" : colors.border}
                strokeWidth={isExpanded ? 4 : 2}
                style={{
                  filter: isRoot ? "drop-shadow(0 4px 12px rgba(0,0,0,0.15))" : "drop-shadow(0 2px 6px rgba(0,0,0,0.1))",
                }}
              />
              {/* Node label */}
              <text
                fill={colors.text}
                fontSize={fontSize}
                fontWeight={isRoot ? 700 : 500}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {node.name.length > 15 ? `${node.name.slice(0, 12)}...` : node.name}
              </text>
              {/* Expansion indicator */}
              {node.children && node.children.length > 0 && (
                <circle
                  r={8}
                  cx={nodeSize / 2 - 5}
                  cy={-nodeSize / 2 + 5}
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
              )}
              {node.children && node.children.length > 0 && (
                <text
                  x={nodeSize / 2 - 5}
                  y={-nodeSize / 2 + 5}
                  fontSize={8}
                  fill="hsl(var(--foreground))"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: "none" }}
                >
                  {node.children.length}
                </text>
              )}
            </g>
          </HoverCardTrigger>
          <HoverCardContent 
            side="right" 
            className="w-72 z-50"
            sideOffset={10}
          >
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">{node.name}</h4>
              {nodeData?.act?.ementa && (
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {nodeData.act.ementa}
                </p>
              )}
              {nodeData?.act?.orgao_emissor && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Órgão:</span> {nodeData.act.orgao_emissor}
                </p>
              )}
              {nodeData?.act?.data_publicacao && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Data:</span>{" "}
                  {new Date(nodeData.act.data_publicacao).toLocaleDateString("pt-BR")}
                </p>
              )}
              {nodeData?.references && nodeData.references.length > 0 && showReferences && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium mb-1">Remissões ({nodeData.references.length})</p>
                  {nodeData.references.slice(0, 3).map((ref, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      → {ref.relation_type}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    },
    [expandedNodes, handleNodeClick, showReferences]
  );

  // Custom path class - simplified to avoid type issues
  const pathClassFunc = useCallback(() => {
    return "link-hierarchy";
  }, []);

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

  return (
    <div className="flex-1 flex flex-col">
      {/* Controls */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-refs"
              checked={showReferences}
              onCheckedChange={setShowReferences}
            />
            <Label htmlFor="show-refs" className="text-sm cursor-pointer">
              {showReferences ? (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> Remissões visíveis
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <EyeOff className="h-3.5 w-3.5" /> Remissões ocultas
                </span>
              )}
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-foreground" />
            <span>Hierarquia</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-muted-foreground" />
            <span>Estrutura</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed border-muted-foreground" />
            <span>Remissão</span>
          </div>
        </div>
      </div>

      {/* Tree container */}
      <div 
        ref={containerRef} 
        className="flex-1 min-h-[500px] relative"
        style={{ background: "hsl(var(--background))" }}
      >
        <style>{`
          .link-hierarchy {
            stroke: hsl(var(--foreground));
            stroke-width: 3;
            fill: none;
          }
          .link-structure {
            stroke: hsl(var(--muted-foreground));
            stroke-width: 2;
            fill: none;
          }
          .link-reference {
            stroke: hsl(var(--muted-foreground));
            stroke-width: 1.5;
            stroke-dasharray: 5,5;
            fill: none;
          }
          .rd3t-tree-container {
            width: 100%;
            height: 100%;
          }
          .rd3t-link {
            fill: none;
          }
        `}</style>
        <Tree
          data={treeData}
          orientation="horizontal"
          pathFunc="step"
          translate={{ x: 100, y: dimensions.height / 2 }}
          nodeSize={{ x: 200, y: 100 }}
          separation={{ siblings: 1.2, nonSiblings: 1.5 }}
          renderCustomNodeElement={renderCustomNode}
          pathClassFunc={pathClassFunc}
          zoom={0.8}
          scaleExtent={{ min: 0.3, max: 2 }}
          enableLegacyTransitions
          transitionDuration={300}
          collapsible={true}
          initialDepth={1}
        />
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap justify-center gap-4 text-xs">
          {Object.entries(tipoLabels).map(([tipo, label]) => (
            <div key={tipo} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: getNodeColor(tipo).bg }}
              />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
