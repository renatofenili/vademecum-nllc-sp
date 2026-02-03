import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Tree, { RawNodeDatum, CustomNodeElementProps } from "react-d3-tree";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ActsGraphData, ActNode, ActEdge } from "./types";

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

// Using direct hex colors for SVG compatibility
const tipoColors: Record<string, { bg: string; border: string; text: string }> = {
  constituicao: { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  lei: { bg: "#dc2626", border: "#b91c1c", text: "#ffffff" },
  decreto: { bg: "#2563eb", border: "#1d4ed8", text: "#ffffff" },
  resolucao: { bg: "#7c3aed", border: "#6d28d9", text: "#ffffff" },
  portaria: { bg: "#059669", border: "#047857", text: "#ffffff" },
  instrucao_normativa: { bg: "#6b7280", border: "#4b5563", text: "#ffffff" },
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
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        if (offsetWidth > 0 && offsetHeight > 0) {
          setDimensions({ width: offsetWidth, height: offsetHeight });
        }
      }
    };
    
    // Initial measurement after a brief delay to ensure DOM is ready
    const timer = setTimeout(updateDimensions, 100);
    
    // Also update on resize
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDimensions);
    };
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

  // Custom node renderer - simplified for better SVG compatibility
  const renderCustomNode = useCallback(
    ({ nodeDatum, toggleNode }: CustomNodeElementProps) => {
      const node = nodeDatum as TreeNode;
      const nodeData = node.nodeData;
      const tipo = nodeData?.act?.tipo || "lei";
      const colors = getNodeColor(tipo);
      const isRoot = nodeData?.type === "root";
      const isExpanded = nodeData?.id ? expandedNodes.has(nodeData.id) : false;
      
      // Larger nodes for better readability
      const nodeSize = isRoot ? 120 : 90;
      const fontSize = isRoot ? 12 : 10;

      const handleClick = () => {
        if (toggleNode) toggleNode();
        handleNodeClick(nodeDatum);
      };

      // Better text splitting for node labels
      const displayName = node.name || "Sem nome";
      const maxChars = isRoot ? 14 : 11;
      const lines: string[] = [];
      
      if (displayName.length <= maxChars) {
        lines.push(displayName);
      } else {
        // Split at word boundaries when possible
        const words = displayName.split(' ');
        let currentLine = '';
        
        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length <= maxChars) {
            currentLine = (currentLine + ' ' + word).trim();
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word.length > maxChars ? word.slice(0, maxChars - 2) + '...' : word;
          }
        }
        if (currentLine) lines.push(currentLine);
        
        // Limit to 3 lines max
        if (lines.length > 3) {
          lines.splice(2);
          lines[1] = lines[1].slice(0, -3) + '...';
        }
      }

      return (
        <g onClick={handleClick} style={{ cursor: "pointer" }}>
          {/* Node circle - simple solid fill */}
          <circle
            r={nodeSize / 2}
            fill={colors.bg}
            stroke={isExpanded ? "#dc2626" : colors.border}
            strokeWidth={isExpanded ? 4 : 2}
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
          />
          {/* Node label - multiple lines */}
          {lines.map((line, idx) => (
            <text
              key={idx}
              fill={colors.text}
              fontSize={fontSize}
              fontWeight={isRoot ? 700 : 500}
              textAnchor="middle"
              y={(idx - (lines.length - 1) / 2) * (fontSize + 3)}
              dominantBaseline="middle"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {line}
            </text>
          ))}
          {/* Badge for children count */}
          {node.children && node.children.length > 0 && (
            <>
              <circle
                r={10}
                cx={nodeSize / 2 - 8}
                cy={-nodeSize / 2 + 8}
                fill="#ffffff"
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={nodeSize / 2 - 8}
                y={-nodeSize / 2 + 8}
                fontSize={9}
                fontWeight={600}
                fill="#374151"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: "none" }}
              >
                {node.children.length}
              </text>
            </>
          )}
          {/* Hover tooltip using title element */}
          <title>
            {nodeData?.act?.ementa || node.name}
            {nodeData?.act?.orgao_emissor ? `\n${nodeData.act.orgao_emissor}` : ''}
          </title>
        </g>
      );
    },
    [expandedNodes, handleNodeClick]
  );

  // Custom path class
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
        className="flex-1 relative"
        style={{ 
          background: "hsl(var(--background))",
          minHeight: "500px",
          height: "500px",
          width: "100%"
        }}
      >
        {/* SVG filter for shadow - defined once */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
            </filter>
          </defs>
        </svg>
        <style>{`
          .link-hierarchy {
            stroke: #374151;
            stroke-width: 2;
            fill: none;
          }
          .link-structure {
            stroke: #9ca3af;
            stroke-width: 1.5;
            fill: none;
          }
          .link-reference {
            stroke: #9ca3af;
            stroke-width: 1;
            stroke-dasharray: 4,4;
            fill: none;
          }
          .rd3t-tree-container {
            width: 100% !important;
            height: 100% !important;
          }
          .rd3t-link {
            fill: none;
          }
          .rd3t-svg {
            width: 100% !important;
            height: 100% !important;
          }
        `}</style>
        <Tree
          data={treeData}
          orientation="horizontal"
          pathFunc="diagonal"
          dimensions={{ width: dimensions.width, height: 500 }}
          translate={{ x: 120, y: 250 }}
          nodeSize={{ x: 200, y: 70 }}
          separation={{ siblings: 1.2, nonSiblings: 1.5 }}
          renderCustomNodeElement={renderCustomNode}
          pathClassFunc={pathClassFunc}
          zoom={0.9}
          scaleExtent={{ min: 0.3, max: 2 }}
          enableLegacyTransitions
          transitionDuration={300}
          collapsible={true}
          initialDepth={2}
          depthFactor={180}
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
