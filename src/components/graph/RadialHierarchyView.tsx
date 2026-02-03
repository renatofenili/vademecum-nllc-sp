import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActsGraphData, ActNode } from "./types";

interface RadialHierarchyViewProps {
  data: ActsGraphData | null;
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

const ringColors: Record<number, string> = {
  0: "hsl(0, 72%, 51%)",      // Red for CF
  1: "hsl(221, 83%, 53%)",    // Blue for Laws
  2: "hsl(142, 71%, 45%)",    // Green for Decrees
  3: "hsl(262, 83%, 58%)",    // Purple for others
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
}: RadialHierarchyViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<RingNode | null>(null);

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

  // Build radial nodes
  const { nodes, ringRadii, center } = useMemo(() => {
    if (!data || !data.nodes.length) {
      return { nodes: [], ringRadii: [], center: { x: 0, y: 0 } };
    }

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const maxRadius = Math.min(cx, cy) - 60;
    
    // Ring radii
    const radii = [0, maxRadius * 0.35, maxRadius * 0.65, maxRadius * 0.95];

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

    return { nodes: result, ringRadii: radii, center: { x: cx, y: cy } };
  }, [data, dimensions]);

  // Mouse handlers for panning
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
      {/* Info bar */}
      <div className="p-2 bg-muted/50 border-b text-xs text-muted-foreground flex gap-4">
        <span>📊 Normas: {data.nodes.length}</span>
        <span>🔗 Relações: {data.edges.length}</span>
        <span>🎯 Raiz: CF/1988</span>
        <span>🔍 Zoom: {Math.round(zoom * 100)}%</span>
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

        {/* Tooltip */}
        {hoveredNode && (
          <div
            className="absolute z-20 bg-popover border border-border rounded-lg shadow-lg p-3 max-w-sm pointer-events-none"
            style={{
              left: Math.min(hoveredNode.x * zoom + pan.x + 20, dimensions.width - 250),
              top: Math.min(hoveredNode.y * zoom + pan.y - 10, dimensions.height - 150),
            }}
          >
            {/* Nome */}
            <p className="font-semibold text-sm text-foreground">
              {hoveredNode.act.tipo === "constituicao" 
                ? "Constituição Federal de 1988" 
                : `${tipoLabels[hoveredNode.act.tipo] || hoveredNode.act.tipo} nº ${hoveredNode.act.numero}`}
            </p>
            
            {/* ID */}
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              ID: {hoveredNode.id}
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
            
            {/* Ementa */}
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
              {hoveredNode.act.ementa}
            </p>
            
            {/* Órgão emissor */}
            {hoveredNode.act.orgao_emissor && (
              <p className="text-xs text-muted-foreground mt-1">
                📍 {hoveredNode.act.orgao_emissor}
              </p>
            )}
            
            {/* Data */}
            <p className="text-xs text-muted-foreground mt-1">
              📅 {new Date(hoveredNode.act.data_publicacao).toLocaleDateString("pt-BR")}
            </p>
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

              {/* Connection lines from center to ring 1 */}
              {nodes
                .filter((n) => n.ring === 1)
                .map((node) => (
                  <line
                    key={`line-${node.id}`}
                    x1={center.x}
                    y1={center.y}
                    x2={node.x}
                    y2={node.y}
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    opacity={0.3}
                  />
                ))}

              {/* Connection lines from ring 1 to ring 2 */}
              {nodes
                .filter((n) => n.ring === 2)
                .map((node) => {
                  // Find nearest ring 1 node
                  const ring1Nodes = nodes.filter((n) => n.ring === 1);
                  if (ring1Nodes.length === 0) return null;
                  const nearest = ring1Nodes.reduce((a, b) => {
                    const distA = Math.abs(a.angle - node.angle);
                    const distB = Math.abs(b.angle - node.angle);
                    return distA < distB ? a : b;
                  });
                  return (
                    <line
                      key={`line-${node.id}`}
                      x1={nearest.x}
                      y1={nearest.y}
                      x2={node.x}
                      y2={node.y}
                      stroke="hsl(var(--border))"
                      strokeWidth={1}
                      opacity={0.2}
                    />
                  );
                })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isCenter = node.ring === 0;
                const nodeRadius = isCenter ? 40 : 24;
                const color = ringColors[node.ring];

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    className="cursor-pointer"
                  >
                    {/* Node circle */}
                    <circle
                      r={nodeRadius}
                      fill={color}
                      stroke="white"
                      strokeWidth={2}
                      className="transition-all duration-200 hover:opacity-80"
                      style={{
                        filter: hoveredNode?.id === node.id ? "brightness(1.2)" : "none",
                      }}
                    />
                    
                    {/* Node label */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-white font-semibold pointer-events-none select-none"
                      style={{ fontSize: isCenter ? 14 : 9 }}
                    >
                      {isCenter ? "CF/88" : node.label.length > 12 
                        ? node.label.slice(0, 10) + "…" 
                        : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap justify-center gap-6 text-xs">
          {Object.entries(ringLabels).map(([ring, label]) => (
            <div key={ring} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: ringColors[Number(ring)] }}
              />
              <span className="text-muted-foreground">
                Anel {ring}: {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
