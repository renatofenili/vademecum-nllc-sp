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

interface ThemeCount {
  tema: string;
  count: number;
}

// Mapeamento de temas do banco para labels do fluxograma
const themeMapping: Record<string, string[]> = {
  "PCA": ["PCA"],
  "ETP": ["ETP"],
  "Gestão de riscos": ["Gestão de riscos"],
  "Pesquisa de preços": ["Pesquisa de Preços"],
  "Termo de referência": ["TR / Projeto Básico"],
  "Licitação": ["Seleção do fornecedor", "Modalidades", "Critério de julgamento", "Publicação do edital", "Minuta de edital"],
  "Contratação direta": ["Dispensa e inexigibilidade de licitação"],
  "Dispensa de licitação": ["Dispensa e inexigibilidade de licitação"],
  "Inexigibilidade": ["Dispensa e inexigibilidade de licitação"],
  "Gestão de contrato": ["Gestão do contrato", "Fiscalização contratual", "Sanções"],
  // Transversais
  "A Lei nº 14.133/21": ["Valores da Lei nº 14.133/21"],
  "Governança": ["Governança", "Controle", "Análise jurídica"],
  "Sustentabilidade": ["Contratações sustentáveis"],
  "SRP": ["Sistema de Registro de Preços"],
  "Credenciamento": ["Credenciamento"],
  "Inovação em logística": ["Inovação"],
  "Terceirização": [],
};

// Função para calcular cor baseada na intensidade
const getHeatStyle = (count: number, maxCount: number) => {
  if (count === 0) {
    return {
      backgroundColor: "hsl(220, 10%, 92%)",
      borderColor: "hsl(220, 10%, 80%)",
      textColor: "hsl(220, 10%, 50%)",
      opacity: 0.6,
    };
  }
  
  const intensity = count / maxCount;
  
  if (intensity <= 0.2) {
    return {
      backgroundColor: "hsl(200, 60%, 85%)",
      borderColor: "hsl(200, 60%, 60%)",
      textColor: "hsl(200, 60%, 30%)",
      opacity: 0.7,
    };
  } else if (intensity <= 0.4) {
    return {
      backgroundColor: "hsl(180, 50%, 75%)",
      borderColor: "hsl(180, 50%, 50%)",
      textColor: "hsl(180, 50%, 25%)",
      opacity: 0.8,
    };
  } else if (intensity <= 0.6) {
    return {
      backgroundColor: "hsl(45, 80%, 70%)",
      borderColor: "hsl(45, 80%, 45%)",
      textColor: "hsl(45, 80%, 20%)",
      opacity: 0.9,
    };
  } else if (intensity <= 0.8) {
    return {
      backgroundColor: "hsl(25, 85%, 60%)",
      borderColor: "hsl(25, 85%, 40%)",
      textColor: "hsl(25, 85%, 15%)",
      opacity: 0.95,
    };
  } else {
    return {
      backgroundColor: "hsl(5, 75%, 55%)",
      borderColor: "hsl(5, 75%, 35%)",
      textColor: "white",
      opacity: 1,
    };
  }
};

interface FlowBoxProps {
  label: string;
  count: number;
  maxCount: number;
  rounded?: "left" | "right" | "full" | "none";
  className?: string;
}

const FlowBox = ({ label, count, maxCount, rounded = "none", className = "" }: FlowBoxProps) => {
  const style = getHeatStyle(count, maxCount);
  
  const roundedClass = {
    left: "rounded-l-2xl rounded-r-md",
    right: "rounded-r-2xl rounded-l-md",
    full: "rounded-2xl",
    none: "rounded-md",
  }[rounded];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative px-4 py-3 min-w-[100px] text-center font-medium text-sm border-2 cursor-pointer transition-transform hover:scale-105 hover:shadow-lg ${roundedClass} ${className}`}
          style={{
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.textColor,
            opacity: style.opacity,
          }}
        >
          <span className="block">{label}</span>
          {count > 0 && (
            <span 
              className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
              style={{ 
                backgroundColor: style.borderColor,
                color: "white",
              }}
            >
              {count}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">
          {count} {count === 1 ? "norma" : "normas"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

const Arrow = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="text-muted-foreground">
      <path d="M0 8H20M20 8L14 2M20 8L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>
);

const VerticalArrow = ({ direction = "down" }: { direction?: "up" | "down" }) => (
  <div className="flex items-center justify-center h-6">
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" className="text-muted-foreground">
      {direction === "down" ? (
        <path d="M8 0V16M8 16L2 10M8 16L14 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      ) : (
        <path d="M8 20V4M8 4L2 10M8 4L14 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  </div>
);

const MapaCalorTab = () => {
  const [themeCounts, setThemeCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadThemes = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("normas_temas")
          .select("tema");

        if (error) throw error;

        const counts: Record<string, number> = {};
        (data || []).forEach((row) => {
          counts[row.tema] = (counts[row.tema] || 0) + 1;
        });

        setThemeCounts(counts);
      } catch (err) {
        console.error("Erro ao carregar temas:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemes();
  }, []);

  // Calcula contagem para cada box do fluxograma
  const getBoxCount = (boxLabel: string): number => {
    const dbThemes = themeMapping[boxLabel] || [];
    return dbThemes.reduce((sum, tema) => sum + (themeCounts[tema] || 0), 0);
  };

  const maxCount = useMemo(() => {
    const allBoxLabels = Object.keys(themeMapping);
    const counts = allBoxLabels.map(getBoxCount);
    return Math.max(...counts, 1);
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
            Fluxo da contratação pública × intensidade de regulamentação
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center">
        <div className="flex items-center gap-4 text-xs bg-card border border-border rounded-lg px-4 py-2">
          <span className="text-muted-foreground font-medium">Intensidade:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border" style={{ backgroundColor: "hsl(200, 60%, 85%)", borderColor: "hsl(200, 60%, 60%)" }} />
            <span className="text-muted-foreground">Baixa</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border" style={{ backgroundColor: "hsl(45, 80%, 70%)", borderColor: "hsl(45, 80%, 45%)" }} />
            <span className="text-muted-foreground">Média</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border" style={{ backgroundColor: "hsl(5, 75%, 55%)", borderColor: "hsl(5, 75%, 35%)" }} />
            <span className="text-muted-foreground">Alta</span>
          </div>
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border">
            <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">5</span>
            <span className="text-muted-foreground">nº de normas</span>
          </div>
        </div>
      </div>

      {/* Flowchart */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Skeleton className="h-96 w-full max-w-5xl rounded-xl" />
        </div>
      ) : (
        <TooltipProvider>
          <div className="bg-slate-800 rounded-xl p-6 md:p-8 overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Main Flow */}
              <div className="flex items-center gap-2 mb-8">
                <FlowBox label="PCA" count={getBoxCount("PCA")} maxCount={maxCount} rounded="left" />
                <Arrow />
                <FlowBox label="ETP" count={getBoxCount("ETP")} maxCount={maxCount} />
                <Arrow />
                <FlowBox label="Pesquisa de preços" count={getBoxCount("Pesquisa de preços")} maxCount={maxCount} />
                <Arrow />
                <FlowBox label="Termo de referência" count={getBoxCount("Termo de referência")} maxCount={maxCount} />
                
                {/* Bifurcation after Termo de referência */}
                <div className="flex flex-col items-start">
                  {/* Arrow splitting down */}
                  <div className="flex">
                    <svg width="40" height="80" viewBox="0 0 40 80" fill="none" className="text-muted-foreground">
                      <path d="M0 40H20V10H35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M29 4L35 10L29 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M20 40V70H35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M29 64L35 70L29 76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    
                    <div className="flex flex-col gap-6">
                      {/* Top path: Licitação → Gestão de contrato */}
                      <div className="flex items-center gap-2">
                        <FlowBox label="Licitação" count={getBoxCount("Licitação")} maxCount={maxCount} rounded="full" />
                        <Arrow />
                        <FlowBox label="Gestão de contrato" count={getBoxCount("Gestão de contrato")} maxCount={maxCount} rounded="right" />
                      </div>
                      
                      {/* Bottom path: Contratação direta → Dispensa/Inexigibilidade → Gestão de contrato */}
                      <div className="flex items-center gap-2">
                        <FlowBox label="Contratação direta" count={getBoxCount("Contratação direta")} maxCount={maxCount} rounded="full" />
                        <Arrow />
                        
                        {/* Sub-bifurcation for Dispensa and Inexigibilidade */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <FlowBox label="Dispensa de licitação" count={getBoxCount("Dispensa de licitação")} maxCount={maxCount} />
                            <svg width="50" height="20" viewBox="0 0 50 20" fill="none" className="text-muted-foreground">
                              <path d="M0 10H30C40 10 40 -15 60 -15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div className="flex items-center gap-2">
                            <FlowBox label="Inexigibilidade" count={getBoxCount("Inexigibilidade")} maxCount={maxCount} />
                            <svg width="50" height="20" viewBox="0 0 50 20" fill="none" className="text-muted-foreground">
                              <path d="M0 10H30C40 10 40 -40 60 -40" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transversal content section */}
              <div className="border-t-2 border-dashed border-slate-600 pt-6 mt-6">
                <h3 className="text-orange-400 font-semibold text-lg mb-4 underline underline-offset-4">
                  Conteúdos transversais ou específicos
                </h3>
                
                <div className="flex flex-wrap gap-4">
                  {/* Row 1 */}
                  <div className="flex items-center gap-3">
                    <FlowBox 
                      label="A Lei nº 14.133/21" 
                      count={getBoxCount("A Lei nº 14.133/21")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-500/80 !border-stone-400"
                    />
                    <FlowBox 
                      label="Governança" 
                      count={getBoxCount("Governança")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-500/80 !border-stone-400"
                    />
                    <FlowBox 
                      label="Sustentabilidade" 
                      count={getBoxCount("Sustentabilidade")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-500/80 !border-stone-400"
                    />
                  </div>
                  
                  {/* Row 2 */}
                  <div className="flex items-center gap-3 mt-2">
                    <FlowBox 
                      label="SRP" 
                      count={getBoxCount("SRP")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-600/80 !border-stone-500"
                    />
                    <FlowBox 
                      label="Credenciamento" 
                      count={getBoxCount("Credenciamento")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-600/80 !border-stone-500"
                    />
                    <FlowBox 
                      label="Inovação em logística" 
                      count={getBoxCount("Inovação em logística")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-600/80 !border-stone-500"
                    />
                    <FlowBox 
                      label="Terceirização" 
                      count={getBoxCount("Terceirização")} 
                      maxCount={maxCount} 
                      rounded="full"
                      className="!bg-stone-600/80 !border-stone-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TooltipProvider>
      )}

      {/* Info footer */}
      <div className="flex justify-center pt-4">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <Info className="h-3.5 w-3.5" />
          <span>
            A intensidade das cores reflete a quantidade de normas que tratam cada tema. Passe o mouse para ver detalhes.
          </span>
        </div>
      </div>
    </div>
  );
};

export default MapaCalorTab;
