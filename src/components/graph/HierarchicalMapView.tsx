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

const tipoLegendFill: Record<string, string> = {
  constituicao: "hsl(var(--chart-1))",
  lei: "hsl(var(--chart-2))",
  decreto: "hsl(var(--chart-3))",
  resolucao: "hsl(var(--chart-4))",
  portaria: "hsl(var(--chart-5))",
  instrucao_normativa: "hsl(var(--muted))",
};

// SVG colors: always use semantic tokens (CSS variables) via `style` for maximum compatibility
const nodeTheme = {
  root: {
    fill: "hsl(var(--primary))",
    stroke: "hsl(var(--primary))",
    text: "hsl(var(--primary-foreground))",
  },
  act: {
    fill: "hsl(var(--secondary))",
    stroke: "hsl(var(--border))",
    text: "hsl(var(--secondary-foreground))",
  },
  badge: {
    fill: "hsl(var(--background))",
    stroke: "hsl(var(--border))",
    text: "hsl(var(--foreground))",
  },
  emphasis: {
    stroke: "hsl(var(--ring))",
  },
} as const;

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
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) setDimensions({ width: w, height: h });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => ro.disconnect();
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
      const isRoot = nodeData?.type === "root";
      const isExpanded = nodeData?.id ? expandedNodes.has(nodeData.id) : false;

      const tipo = (nodeData?.act?.tipo || (isRoot ? "lei" : "outro"))
        .toString()
        .toLowerCase()
        .replace(/[^a-z_]/g, "");
      const nodeClass = [
        "map-node",
        isRoot ? "map-node-root" : "map-node-act",
        `map-node-${tipo}`,
        isExpanded ? "map-node-expanded" : "",
      ]
        .filter(Boolean)
        .join(" ");
      
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
        <g className={nodeClass} onClick={handleClick} style={{ cursor: "pointer" }}>
          {/* Node circle - simple solid fill */}
          <circle
            className="map-node-circle"
            r={nodeSize / 2}
            strokeWidth={isExpanded ? 4 : 2}
          />
          {/* Node label - multiple lines */}
          {lines.map((line, idx) => (
            <text
              className="map-node-text"
              key={idx}
              textAnchor="middle"
              y={(idx - (lines.length - 1) / 2) * (fontSize + 3)}
              dominantBaseline="middle"
              fontSize={fontSize}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {line}
            </text>
          ))}
          {/* Badge for children count */}
          {node.children && node.children.length > 0 && (
            <>
              <circle
                className="map-node-badge"
                r={10}
                cx={nodeSize / 2 - 8}
                cy={-nodeSize / 2 + 8}
                strokeWidth={1}
              />
              <text
                className="map-node-badge-text"
                x={nodeSize / 2 - 8}
                y={-nodeSize / 2 + 8}
                fontSize={9}
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
          /* Map nodes */
          .map-node-circle {
            fill: hsl(var(--card));
            stroke: hsl(var(--border));
          }
          .map-node-root .map-node-circle {
            fill: hsl(var(--primary));
            stroke: hsl(var(--primary));
          }
          .map-node-expanded .map-node-circle {
            stroke: hsl(var(--ring));
          }
          .map-node-text {
            fill: hsl(var(--primary-foreground));
            font-weight: 500;
          }
          .map-node-act .map-node-text {
            fill: hsl(var(--primary-foreground));
          }
          .map-node-badge {
            fill: hsl(var(--background));
            stroke: hsl(var(--border));
          }
          .map-node-badge-text {
            fill: hsl(var(--foreground));
            font-weight: 600;
          }

          /* Color by tipo using chart tokens */
          .map-node-constituicao .map-node-circle { fill: hsl(var(--chart-1)); stroke: hsl(var(--chart-1)); }
          .map-node-lei .map-node-circle { fill: hsl(var(--chart-2)); stroke: hsl(var(--chart-2)); }
          .map-node-decreto .map-node-circle { fill: hsl(var(--chart-3)); stroke: hsl(var(--chart-3)); }
          .map-node-resolucao .map-node-circle { fill: hsl(var(--chart-4)); stroke: hsl(var(--chart-4)); }
          .map-node-portaria .map-node-circle { fill: hsl(var(--chart-5)); stroke: hsl(var(--chart-5)); }
          .map-node-instrucao_normativa .map-node-circle { fill: hsl(var(--muted)); stroke: hsl(var(--muted)); }

          .link-hierarchy {
            stroke: hsl(var(--foreground));
            stroke-width: 2;
            fill: none;
          }
          .link-structure {
            stroke: hsl(var(--muted-foreground));
            stroke-width: 1.5;
            fill: none;
          }
          .link-reference {
            stroke: hsl(var(--muted-foreground));
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
          dimensions={{ width: dimensions.width, height: dimensions.height }}
          translate={{
            x: Math.max(80, Math.floor(dimensions.width * 0.18)),
            y: Math.floor(dimensions.height / 2),
          }}
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
                style={{
                  backgroundColor: tipoLegendFill[tipo] || "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
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
