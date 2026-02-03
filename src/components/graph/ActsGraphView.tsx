import { useMemo, useState } from "react";
import { Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActsGraphData, ActNode, ActEdge, RelationType } from "./types";
import { ActNodeCard } from "./ActNodeCard";
import { ActDetailPanel } from "./ActDetailPanel";

interface ActsGraphViewProps {
  data: ActsGraphData | null;
  isLoading: boolean;
  onDrillDown: (actId: string) => void;
}

const allRelationTypes: RelationType[] = ["implements", "regulates", "refers_to", "amends", "revokes"];

const relationLabels: Record<RelationType, string> = {
  implements: "Implementa",
  regulates: "Regulamenta",
  refers_to: "Referencia",
  amends: "Altera",
  revokes: "Revoga",
};

export const ActsGraphView = ({ data, isLoading, onDrillDown }: ActsGraphViewProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [visibleRelations, setVisibleRelations] = useState<Set<RelationType>>(
    new Set(allRelationTypes)
  );

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter(edge => visibleRelations.has(edge.relation_type));
  }, [data, visibleRelations]);

  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find(n => n.id === selectedNodeId) || null;
  }, [data, selectedNodeId]);

  const { incomingEdges, outgoingEdges } = useMemo(() => {
    if (!selectedNodeId || !data) return { incomingEdges: [], outgoingEdges: [] };
    return {
      incomingEdges: filteredEdges.filter(e => e.to_act === selectedNodeId),
      outgoingEdges: filteredEdges.filter(e => e.from_act === selectedNodeId),
    };
  }, [selectedNodeId, filteredEdges, data]);

  // Group nodes by tipo for better visualization
  const nodesByTipo = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, ActNode[]> = {};
    for (const node of data.nodes) {
      if (!groups[node.tipo]) {
        groups[node.tipo] = [];
      }
      groups[node.tipo].push(node);
    }
    return groups;
  }, [data]);

  const toggleRelation = (rel: RelationType) => {
    setVisibleRelations(prev => {
      const next = new Set(prev);
      if (next.has(rel)) {
        next.delete(rel);
      } else {
        next.add(rel);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Selecione uma raiz para visualizar o grafo</p>
      </div>
    );
  }

  const tipoOrder = ["constituicao", "lei", "decreto", "resolucao", "portaria", "instrucao_normativa"];
  const sortedTipos = Object.keys(nodesByTipo).sort(
    (a, b) => tipoOrder.indexOf(a) - tipoOrder.indexOf(b)
  );

  return (
    <div className="flex-1 flex h-full">
      {/* Main graph area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {data.nodes.length} atos
            </Badge>
            <Badge variant="outline">
              {filteredEdges.length} relações
            </Badge>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar relações
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Tipos de relação</h4>
                {allRelationTypes.map(rel => (
                  <div key={rel} className="flex items-center gap-2">
                    <Checkbox
                      id={rel}
                      checked={visibleRelations.has(rel)}
                      onCheckedChange={() => toggleRelation(rel)}
                    />
                    <Label htmlFor={rel} className="text-sm cursor-pointer">
                      {relationLabels[rel]}
                    </Label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Graph visualization */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {sortedTipos.map(tipo => (
              <div key={tipo}>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                  {tipo === "constituicao" ? "Constituição" :
                   tipo === "lei" ? "Leis" :
                   tipo === "decreto" ? "Decretos" :
                   tipo === "resolucao" ? "Resoluções" :
                   tipo === "portaria" ? "Portarias" :
                   tipo === "instrucao_normativa" ? "Instruções Normativas" : tipo}
                </h4>
                <div className="flex flex-wrap gap-3">
                  {nodesByTipo[tipo].map(node => (
                    <ActNodeCard
                      key={node.id}
                      node={node}
                      isSelected={selectedNodeId === node.id}
                      isRoot={node.id === data.root || node.id === "cf88" || node.id === "lei14133"}
                      onClick={() => setSelectedNodeId(node.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Edge visualization summary */}
            {filteredEdges.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  Relações entre atos
                </h4>
                <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                  {filteredEdges.slice(0, 20).map((edge, idx) => {
                    const fromNode = data.nodes.find(n => n.id === edge.from_act);
                    const toNode = data.nodes.find(n => n.id === edge.to_act);
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30"
                      >
                        <span className="font-medium truncate max-w-[150px]">
                          {fromNode ? `${fromNode.tipo} ${fromNode.numero}` : edge.from_act.substring(0, 8)}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {relationLabels[edge.relation_type]}
                        </Badge>
                        <span className="font-medium truncate max-w-[150px]">
                          {toNode ? `${toNode.tipo} ${toNode.numero}` : edge.to_act.substring(0, 8)}
                        </span>
                      </div>
                    );
                  })}
                  {filteredEdges.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      + {filteredEdges.length - 20} relações não exibidas
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <ActDetailPanel
          node={selectedNode}
          incomingEdges={incomingEdges}
          outgoingEdges={outgoingEdges}
          onClose={() => setSelectedNodeId(null)}
          onDrillDown={() => onDrillDown(selectedNode.id)}
        />
      )}
    </div>
  );
};
