import { X, ExternalLink, GitBranch, Calendar, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ActNode, ActEdge } from "./types";

interface ActDetailPanelProps {
  node: ActNode;
  incomingEdges: ActEdge[];
  outgoingEdges: ActEdge[];
  onClose: () => void;
  onDrillDown: () => void;
}

const formatTipo = (tipo: string) => {
  const tipos: Record<string, string> = {
    constituicao: "Constituição",
    decreto: "Decreto",
    resolucao: "Resolução",
    portaria: "Portaria",
    lei: "Lei",
    instrucao_normativa: "Instrução Normativa",
  };
  return tipos[tipo] || tipo;
};

const relationLabels: Record<string, string> = {
  implements: "Implementa",
  regulates: "Regulamenta",
  refers_to: "Referencia",
  amends: "Altera",
  revokes: "Revoga",
};

const relationColors: Record<string, string> = {
  implements: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  regulates: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  refers_to: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  amends: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  revokes: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

export const ActDetailPanel = ({
  node,
  incomingEdges,
  outgoingEdges,
  onClose,
  onDrillDown,
}: ActDetailPanelProps) => {
  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">
            {formatTipo(node.tipo)} {node.numero}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {node.ementa}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Metadados */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Metadados</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Publicação: {new Date(node.data_publicacao).toLocaleDateString("pt-BR")}</span>
              </div>
              {node.orgao_emissor && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{node.orgao_emissor}</span>
                </div>
              )}
              {node.status && (
                <Badge variant="outline" className="text-xs">
                  {node.status}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Ação de drill-down */}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={onDrillDown}
          >
            <GitBranch className="h-4 w-4" />
            Ver dependências internas
          </Button>

          <Separator />

          {/* Relações de entrada */}
          {incomingEdges.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">
                Referenciado por ({incomingEdges.length})
              </h4>
              <div className="space-y-2">
                {incomingEdges.slice(0, 5).map((edge, idx) => (
                  <div key={idx} className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={relationColors[edge.relation_type]}>
                        {relationLabels[edge.relation_type]}
                      </Badge>
                      <span className="text-muted-foreground truncate">
                        {edge.from_act.substring(0, 8)}...
                      </span>
                    </div>
                    {edge.evidences.length > 0 && (
                      <div className="pl-2 border-l-2 border-muted text-xs text-muted-foreground">
                        {edge.evidences[0].excerpt.substring(0, 100)}...
                      </div>
                    )}
                  </div>
                ))}
                {incomingEdges.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    + {incomingEdges.length - 5} mais
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Relações de saída */}
          {outgoingEdges.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">
                Referencia ({outgoingEdges.length})
              </h4>
              <div className="space-y-2">
                {outgoingEdges.slice(0, 5).map((edge, idx) => (
                  <div key={idx} className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={relationColors[edge.relation_type]}>
                        {relationLabels[edge.relation_type]}
                      </Badge>
                      <span className="text-muted-foreground truncate">
                        {edge.to_act.substring(0, 8)}...
                      </span>
                    </div>
                    {edge.evidences.length > 0 && (
                      <div className="pl-2 border-l-2 border-muted text-xs text-muted-foreground">
                        {edge.evidences[0].excerpt.substring(0, 100)}...
                      </div>
                    )}
                  </div>
                ))}
                {outgoingEdges.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    + {outgoingEdges.length - 5} mais
                  </p>
                )}
              </div>
            </div>
          )}

          {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma relação encontrada
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
