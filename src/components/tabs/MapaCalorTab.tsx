import { useState, useEffect } from "react";
import { Flame, Info, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ThemeCount {
  tema: string;
  count: number;
}

interface MacroStage {
  id: string;
  title: string;
  description: string;
  color: string;
  bgColor: string;
  themes: string[];
}

// Macroetapas do fluxo de contratação pública
const macroStages: MacroStage[] = [
  {
    id: "planejamento",
    title: "Planejamento",
    description: "Fase de preparação e estudos preliminares",
    color: "hsl(210, 70%, 45%)",
    bgColor: "hsl(210, 70%, 97%)",
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
    color: "hsl(260, 60%, 50%)",
    bgColor: "hsl(260, 60%, 97%)",
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
    color: "hsl(25, 80%, 50%)",
    bgColor: "hsl(25, 80%, 97%)",
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
    color: "hsl(160, 60%, 40%)",
    bgColor: "hsl(160, 60%, 97%)",
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

// Gradiente de cores para intensidade dentro de cada grupo
const getHeatIntensity = (intensity: number): { opacity: number; glow: boolean } => {
  if (intensity <= 0.2) return { opacity: 0.5, glow: false };
  if (intensity <= 0.4) return { opacity: 0.65, glow: false };
  if (intensity <= 0.6) return { opacity: 0.8, glow: false };
  if (intensity <= 0.8) return { opacity: 0.9, glow: true };
  return { opacity: 1, glow: true };
};

const getHeatLabel = (intensity: number): string => {
  if (intensity <= 0.2) return "Baixa";
  if (intensity <= 0.4) return "Moderada";
  if (intensity <= 0.6) return "Média";
  if (intensity <= 0.8) return "Alta";
  return "Muito Alta";
};

const MapaCalorTab = () => {
  const [themeCounts, setThemeCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [globalMax, setGlobalMax] = useState(1);

  useEffect(() => {
    const loadThemes = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("normas_temas")
          .select("tema");

        if (error) throw error;

        // Agrupa e conta por tema
        const counts: Record<string, number> = {};
        (data || []).forEach((row) => {
          counts[row.tema] = (counts[row.tema] || 0) + 1;
        });

        setThemeCounts(counts);
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
            Jornada da contratação pública × intensidade de regulamentação
          </p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span className="font-medium">Fluxo:</span>
          {macroStages.map((stage, idx) => (
            <span key={stage.id} className="flex items-center gap-1">
              <span
                className="px-2 py-0.5 rounded font-medium text-white"
                style={{ backgroundColor: stage.color }}
              >
                {stage.title}
              </span>
              {idx < macroStages.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Heat map legend */}
      <div className="flex justify-center">
        <div className="flex items-center gap-4 text-xs bg-card border border-border rounded-lg px-4 py-2">
          <span className="text-muted-foreground font-medium">Intensidade normativa:</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded border border-border" style={{ opacity: 0.5, backgroundColor: "hsl(220, 10%, 60%)" }} />
              <span className="text-muted-foreground">Baixa</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded border border-border" style={{ opacity: 0.8, backgroundColor: "hsl(220, 10%, 50%)" }} />
              <span className="text-muted-foreground">Média</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded border border-border shadow-md" style={{ opacity: 1, backgroundColor: "hsl(220, 10%, 40%)" }} />
              <span className="text-muted-foreground">Alta</span>
            </div>
          </div>
        </div>
      </div>

      {/* Macro stages */}
      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-24 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-8">
            {macroStages.map((stage) => {
              // Filtra temas desta etapa que existem no banco
              const stageThemes = stage.themes
                .map((tema) => ({
                  tema,
                  count: themeCounts[tema] || 0,
                }))
                .filter((t) => t.count > 0);

              // Calcula o máximo local para intensidade relativa dentro do grupo
              const localMax = Math.max(...stageThemes.map((t) => t.count), 1);
              const stageTotal = stageThemes.reduce((sum, t) => sum + t.count, 0);

              if (stageThemes.length === 0) return null;

              return (
                <div key={stage.id} className="space-y-3">
                  {/* Stage header */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-1.5 h-8 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div>
                      <h2
                        className="text-lg font-bold"
                        style={{ color: stage.color }}
                      >
                        {stage.title}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {stage.description} • {stageTotal} classificações
                      </p>
                    </div>
                  </div>

                  {/* Stage cards */}
                  <div
                    className="rounded-xl p-4 border"
                    style={{
                      backgroundColor: stage.bgColor,
                      borderColor: `${stage.color}30`,
                    }}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {stageThemes.map((theme) => {
                        const intensity = theme.count / localMax;
                        const { opacity, glow } = getHeatIntensity(intensity);
                        const heatLabel = getHeatLabel(intensity);
                        const percentage = ((theme.count / totalNormas) * 100).toFixed(1);

                        return (
                          <Tooltip key={theme.tema}>
                            <TooltipTrigger asChild>
                              <Card
                                className="relative overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] border-2"
                                style={{
                                  opacity,
                                  borderColor: stage.color,
                                  boxShadow: glow
                                    ? `0 4px 20px -4px ${stage.color}60`
                                    : "none",
                                }}
                              >
                                <CardHeader className="pb-1 pt-3 px-3">
                                  <CardTitle className="text-xs font-semibold text-foreground line-clamp-2">
                                    {theme.tema}
                                  </CardTitle>
                                </CardHeader>

                                <CardContent className="pb-3 px-3">
                                  <p
                                    className="text-xl font-bold"
                                    style={{ color: stage.color }}
                                  >
                                    {theme.count}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    normas
                                  </p>
                                </CardContent>

                                {/* Heat bar at bottom */}
                                <div
                                  className="absolute bottom-0 left-0 h-1 transition-all"
                                  style={{
                                    backgroundColor: stage.color,
                                    width: `${intensity * 100}%`,
                                  }}
                                />
                              </Card>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-semibold">{theme.tema}</p>
                                <p className="text-sm text-muted-foreground">
                                  {theme.count} normas ({percentage}% do total)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Intensidade: {heatLabel}
                                </p>
                              </div>
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

      {/* Info footer */}
      <div className="flex justify-center pt-4">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <Info className="h-3.5 w-3.5" />
          <span>
            A intensidade reflete a quantidade de normas por tema dentro de cada etapa da contratação.
          </span>
        </div>
      </div>
    </div>
  );
};

export default MapaCalorTab;
