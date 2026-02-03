import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DispositivosGraphData } from "./types";

interface DispositivosGraphProps {
  data: DispositivosGraphData | null;
  isLoading: boolean;
  onBack: () => void;
}

const nivelColors: Record<string, string> = {
  preambulo: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  artigo: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  paragrafo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  inciso: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  alinea: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
};

const formatTipo = (tipo: string) => {
  const tipos: Record<string, string> = {
    decreto: "Decreto",
    resolucao: "Resolução",
    portaria: "Portaria",
    lei: "Lei",
    instrucao_normativa: "IN",
  };
  return tipos[tipo] || tipo;
};

export const DispositivosGraph = ({ data, isLoading, onBack }: DispositivosGraphProps) => {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <p>Nenhum dado disponível</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao grafo de atos
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h3 className="font-semibold text-foreground">
            {formatTipo(data.act_info.tipo)} {data.act_info.numero}
          </h3>
          <p className="text-xs text-muted-foreground">
            {data.nodes.length} dispositivos • {data.edges.length} remissões
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {/* Dispositivos */}
        <div className="flex-1 p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">Dispositivos</h4>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {data.nodes.map((node, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-muted/30 border border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={nivelColors[node.nivel] || nivelColors.artigo}>
                      {node.anchor}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                      {node.nivel}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">
                    {node.texto}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Remissões */}
        <div className="w-80 border-l border-border p-4">
          <h4 className="text-sm font-medium text-foreground mb-3">Remissões</h4>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {data.edges.map((edge, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-muted/30 border border-border text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {edge.from_anchor}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {edge.to_anchor}
                    </Badge>
                  </div>
                  {edge.to_document && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Doc: {edge.to_document.substring(0, 8)}...
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {edge.raw_reference}
                  </p>
                </div>
              ))}
              {data.edges.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma remissão encontrada
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};
