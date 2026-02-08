import { useState, useEffect } from "react";
import { Flame, TrendingUp, Info } from "lucide-react";
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

// Gradiente de cores: azul frio → amarelo → laranja → vermelho quente
const getHeatColor = (intensity: number): string => {
  // intensity vai de 0 (mínimo) a 1 (máximo)
  if (intensity <= 0.2) {
    return "hsl(210, 60%, 55%)"; // Azul frio
  } else if (intensity <= 0.4) {
    return "hsl(180, 50%, 45%)"; // Ciano/Verde-água
  } else if (intensity <= 0.6) {
    return "hsl(50, 80%, 50%)"; // Amarelo
  } else if (intensity <= 0.8) {
    return "hsl(30, 85%, 50%)"; // Laranja
  } else {
    return "hsl(5, 75%, 50%)"; // Vermelho quente
  }
};

const getHeatLabel = (intensity: number): string => {
  if (intensity <= 0.2) return "Baixa";
  if (intensity <= 0.4) return "Moderada";
  if (intensity <= 0.6) return "Média";
  if (intensity <= 0.8) return "Alta";
  return "Muito Alta";
};

const MapaCalorTab = () => {
  const [themes, setThemes] = useState<ThemeCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxCount, setMaxCount] = useState(1);

  useEffect(() => {
    const loadThemes = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("normas_temas")
          .select("tema");

        if (error) throw error;

        // Agrupa e conta por tema
        const themeCounts: Record<string, number> = {};
        (data || []).forEach((row) => {
          themeCounts[row.tema] = (themeCounts[row.tema] || 0) + 1;
        });

        // Converte para array e ordena por contagem
        const sortedThemes = Object.entries(themeCounts)
          .map(([tema, count]) => ({ tema, count }))
          .sort((a, b) => b.count - a.count);

        setThemes(sortedThemes);
        setMaxCount(sortedThemes[0]?.count || 1);
      } catch (err) {
        console.error("Erro ao carregar temas:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemes();
  }, []);

  const totalNormas = themes.reduce((sum, t) => sum + t.count, 0);

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

      {/* Stats summary */}
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{themes.length}</strong> temas identificados
          </span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{totalNormas}</strong> classificações temáticas
          </span>
        </div>
      </div>

      {/* Heat map legend */}
      <div className="flex justify-center">
        <div className="flex items-center gap-2 text-xs bg-card border border-border rounded-lg px-4 py-2">
          <span className="text-muted-foreground font-medium">Intensidade:</span>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded" style={{ backgroundColor: "hsl(210, 60%, 55%)" }} />
            <span className="text-muted-foreground">Baixa</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded" style={{ backgroundColor: "hsl(50, 80%, 50%)" }} />
            <span className="text-muted-foreground">Média</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded" style={{ backgroundColor: "hsl(5, 75%, 50%)" }} />
            <span className="text-muted-foreground">Alta</span>
          </div>
        </div>
      </div>

      {/* Grid de cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <TooltipProvider>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {themes.map((theme, index) => {
              const intensity = theme.count / maxCount;
              const heatColor = getHeatColor(intensity);
              const heatLabel = getHeatLabel(intensity);
              const percentage = ((theme.count / totalNormas) * 100).toFixed(1);

              return (
                <Tooltip key={theme.tema}>
                  <TooltipTrigger asChild>
                    <Card
                      className="relative overflow-hidden cursor-pointer transition-transform hover:scale-105 hover:shadow-lg border-2"
                      style={{
                        borderColor: heatColor,
                        background: `linear-gradient(135deg, ${heatColor}15 0%, ${heatColor}30 100%)`,
                      }}
                    >
                      {/* Ranking badge */}
                      <div
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: heatColor }}
                      >
                        {index + 1}
                      </div>

                      <CardHeader className="pb-2 pt-3 px-3">
                        <CardTitle className="text-sm font-semibold text-foreground line-clamp-2 pr-6">
                          {theme.tema}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="pb-3 px-3">
                        <div className="flex items-end justify-between">
                          <div>
                            <p
                              className="text-2xl font-bold"
                              style={{ color: heatColor }}
                            >
                              {theme.count}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              normas
                            </p>
                          </div>
                          <div
                            className="text-[10px] font-medium px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: heatColor,
                              color: "white",
                            }}
                          >
                            {heatLabel}
                          </div>
                        </div>
                      </CardContent>

                      {/* Heat bar at bottom */}
                      <div
                        className="h-1 w-full"
                        style={{ backgroundColor: heatColor }}
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
        </TooltipProvider>
      )}

      {/* Info footer */}
      <div className="flex justify-center pt-4">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <Info className="h-3.5 w-3.5" />
          <span>
            Cores indicam a densidade relativa de regulamentação por tema. Quanto mais quente, mais normas tratam do assunto.
          </span>
        </div>
      </div>
    </div>
  );
};

export default MapaCalorTab;
