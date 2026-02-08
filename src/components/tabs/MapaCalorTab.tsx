import { useState, useEffect, useMemo } from "react";
import { Flame, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

interface MacroStage {
  id: string;
  title: string;
  description: string;
  themes: string[];
}

// Macroetapas do fluxo de contratação pública
const macroStages: MacroStage[] = [
  {
    id: "planejamento",
    title: "Planejamento",
    description: "Fase de preparação e estudos preliminares",
    themes: [
      "Fase preparatória",
      "ETP",
      "Pesquisa de Preços",
      "TR / Projeto Básico",
      "PCA",
    ],
  },
  {
    id: "selecao",
    title: "Seleção do Fornecedor",
    description: "Procedimentos licitatórios e contratação direta",
    themes: [
      "Modalidades",
      "Critério de julgamento",
      "Dispensa e inexigibilidade de licitação",
      "Publicação do edital",
      "Minuta de edital",
      "Impugnação / pedido de esclarecimento",
      "Credenciamento",
      "Aviso de contratação direta",
      "Seleção do fornecedor",
    ],
  },
  {
    id: "execucao",
    title: "Execução Contratual",
    description: "Gestão, fiscalização e acompanhamento",
    themes: [
      "Gestão do contrato",
      "Fiscalização contratual",
      "Sanções",
      "Contrato de eficiência",
      "Assinatura de contrato / ata de registro de preços",
      "Reequilíbrio / reajuste / repactuação",
      "Pagamento",
      "Regime de execução",
      "Aditivos e apostilamentos",
      "Sistema de Registro de Preços",
    ],
  },
  {
    id: "governanca",
    title: "Governança e Controle",
    description: "Transparência, inovação e compliance",
    themes: [
      "Governança",
      "Controle",
      "Análise jurídica",
      "Contratações sustentáveis",
      "Inovação",
      "Transparência",
      "PNCP",
      "Valores da Lei nº 14.133/21",
      "Agentes que atuam no processo de contratação",
    ],
  },
];

// Função para interpolar cores do azul frio ao vermelho quente
const getHeatColor = (intensity: number): string => {
  // intensity: 0 = frio (azul), 1 = quente (vermelho)
  // Gradiente: Azul → Ciano → Verde → Amarelo → Laranja → Vermelho
  
  if (intensity <= 0) {
    return "hsl(220, 70%, 50%)"; // Azul
  } else if (intensity <= 0.2) {
    const t = intensity / 0.2;
    const h = 220 - t * 40; // 220 → 180
    return `hsl(${h}, 70%, ${50 + t * 5}%)`;
  } else if (intensity <= 0.4) {
    const t = (intensity - 0.2) / 0.2;
    const h = 180 - t * 60; // 180 → 120
    return `hsl(${h}, 70%, ${55 + t * 5}%)`;
  } else if (intensity <= 0.6) {
    const t = (intensity - 0.4) / 0.2;
    const h = 120 - t * 70; // 120 → 50
    return `hsl(${h}, 80%, ${60 - t * 5}%)`;
  } else if (intensity <= 0.8) {
    const t = (intensity - 0.6) / 0.2;
    const h = 50 - t * 25; // 50 → 25
    return `hsl(${h}, 85%, ${55 - t * 5}%)`;
  } else {
    const t = (intensity - 0.8) / 0.2;
    const h = 25 - t * 20; // 25 → 5
    return `hsl(${h}, 80%, ${50 - t * 5}%)`;
  }
};

const getHeatLabel = (intensity: number): string => {
  if (intensity <= 0.2) return "Muito baixa";
  if (intensity <= 0.4) return "Baixa";
  if (intensity <= 0.6) return "Média";
  if (intensity <= 0.8) return "Alta";
  return "Muito alta";
};

interface NormaInfo {
  id: string;
  numero: string;
  tipo: string;
}

const MapaCalorTab = () => {
  const [themeCounts, setThemeCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [globalMax, setGlobalMax] = useState(1);
  const [normasByTema, setNormasByTema] = useState<Record<string, NormaInfo[]>>({});
  const isMobile = useIsMobile();

  useEffect(() => {
    const loadThemes = async () => {
      setIsLoading(true);
      try {
        // Carrega contagem de temas
        const { data: temasData, error: temasError } = await supabase
          .from("normas_temas")
          .select("tema");

        if (temasError) throw temasError;

        const counts: Record<string, number> = {};
        (temasData || []).forEach((row) => {
          counts[row.tema] = (counts[row.tema] || 0) + 1;
        });

        // Carrega normas por tema com join
        const { data: normasTemasData, error: normasError } = await supabase
          .from("normas_temas")
          .select("tema, normas(id, numero, tipo)")
          .order("tema");

        if (normasError) throw normasError;

        const normasByTemaMap: Record<string, NormaInfo[]> = {};
        (normasTemasData || []).forEach((row: any) => {
          if (!normasByTemaMap[row.tema]) {
            normasByTemaMap[row.tema] = [];
          }
          if (row.normas) {
            normasByTemaMap[row.tema].push(row.normas);
          }
        });

        setThemeCounts(counts);
        setNormasByTema(normasByTemaMap);
        setGlobalMax(Math.max(...Object.values(counts), 1));
      } catch (err) {
        console.error("Erro ao carregar temas:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemes();
  }, []);

  const totalNormas = Object.values(themeCounts).reduce((sum, c) => sum + c, 0);

  // Pre-calculate all theme data for the heatmap
  const stageData = useMemo(() => {
    return macroStages.map((stage) => {
      const themes = stage.themes
        .map((tema) => ({
          tema,
          count: themeCounts[tema] || 0,
        }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);

      const stageTotal = themes.reduce((sum, t) => sum + t.count, 0);

      return {
        ...stage,
        themes,
        stageTotal,
      };
    });
  }, [themeCounts]);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Flame className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Mapa de Calor Temático
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Intensidade de regulamentação por área temática
          </p>
        </div>
      </div>

      {/* Heat gradient legend */}
      <div className="flex justify-center">
        <div className="flex items-center gap-3 text-xs bg-card border border-border rounded-xl px-5 py-3 shadow-sm">
          <span className="text-muted-foreground font-medium">Intensidade:</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[10px]">Baixa</span>
            <div 
              className="w-32 h-4 rounded-full"
              style={{
                background: "linear-gradient(to right, hsl(220, 70%, 50%), hsl(180, 70%, 55%), hsl(120, 70%, 60%), hsl(50, 80%, 55%), hsl(25, 85%, 50%), hsl(5, 80%, 45%))"
              }}
            />
            <span className="text-muted-foreground text-[10px]">Alta</span>
          </div>
          <div className="flex items-center gap-1 ml-3 pl-3 border-l border-border">
            <span className="text-muted-foreground">Número = qtde de normas que tocam a temática</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {stageData.map((stage) => {
              if (stage.themes.length === 0) return null;

              return (
                <div
                  key={stage.id}
                  className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
                >
                  {/* Stage Header */}
                  <div className="px-4 py-3 bg-muted/50 border-b border-border">
                    <h2 className="font-bold text-foreground">{stage.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {stage.description} • {stage.stageTotal} classificações
                    </p>
                  </div>

                  {/* Heatmap cells */}
                  <div className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {stage.themes.map((theme) => {
                        const intensity = theme.count / globalMax;
                        const heatColor = getHeatColor(intensity);
                        const heatLabel = getHeatLabel(intensity);
                        const percentage = ((theme.count / totalNormas) * 100).toFixed(1);

                        // Determine text color based on intensity
                        const textColor = intensity > 0.5 ? "white" : "hsl(220, 20%, 20%)";

                        const cellContent = (
                          <div
                            className="relative px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg hover:z-10"
                            style={{
                              backgroundColor: heatColor,
                              boxShadow: `0 2px 8px ${heatColor}40`,
                            }}
                          >
                            <span
                              className="text-xs font-medium block max-w-[140px] truncate"
                              style={{ color: textColor }}
                            >
                              {theme.tema}
                            </span>
                            <span
                              className="text-lg font-bold block"
                              style={{ color: textColor }}
                            >
                              {theme.count}
                            </span>
                          </div>
                        );

                        const detailsContent = (
                          <div className="space-y-2">
                            <p className="font-semibold">{theme.tema}</p>
                            <p className="text-sm text-muted-foreground">
                              {theme.count} normas ({percentage}% do total)
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Intensidade: {heatLabel}
                            </p>
                            {normasByTema[theme.tema] && normasByTema[theme.tema].length > 0 && (
                              <div className="border-t border-border pt-2 mt-2">
                                <p className="text-xs font-medium mb-1">Normas:</p>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {normasByTema[theme.tema].slice(0, 10).map((norma) => (
                                    <div key={norma.id} className="text-xs text-muted-foreground">
                                      <span className="inline-block w-16 font-medium">{norma.tipo.toUpperCase()}:</span>
                                      <span>{norma.numero}</span>
                                    </div>
                                  ))}
                                  {normasByTema[theme.tema].length > 10 && (
                                    <p className="text-xs text-muted-foreground italic">
                                      +{normasByTema[theme.tema].length - 10} outras
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );

                        // Mobile: use Popover (click-based)
                        if (isMobile) {
                          return (
                            <Popover key={theme.tema}>
                              <PopoverTrigger asChild>
                                {cellContent}
                              </PopoverTrigger>
                              <PopoverContent side="top" className="max-w-sm">
                                {detailsContent}
                              </PopoverContent>
                            </Popover>
                          );
                        }

                        // Desktop: use Tooltip (hover-based)
                        return (
                          <Tooltip key={theme.tema}>
                            <TooltipTrigger asChild>
                              {cellContent}
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              {detailsContent}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {/* Overall Stats */}
      <div className="flex justify-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl w-full">
          {stageData.map((stage) => {
            const avgIntensity = stage.themes.length > 0
              ? stage.themes.reduce((sum, t) => sum + t.count, 0) / stage.themes.length / globalMax
              : 0;
            const heatColor = getHeatColor(avgIntensity);

            return (
              <div
                key={stage.id}
                className="text-center p-4 rounded-xl border border-border bg-card"
              >
                <div
                  className="w-10 h-10 rounded-full mx-auto mb-2"
                  style={{
                    backgroundColor: heatColor,
                    boxShadow: `0 0 20px ${heatColor}60`,
                  }}
                />
                <p className="text-xs text-muted-foreground">{stage.title}</p>
                <p className="text-lg font-bold text-foreground">{stage.stageTotal}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info footer */}
      <div className="flex justify-center pt-4">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <Info className="h-3.5 w-3.5" />
          <span>
            As cores refletem a densidade de regulamentação: azul (baixa) → vermelho (alta).
          </span>
        </div>
      </div>
    </div>
  );
};

export default MapaCalorTab;
