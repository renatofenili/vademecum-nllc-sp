import { useState } from "react";
import { Sparkles, BookOpen, ChevronRight, FileText, Calendar, Building2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";

interface NormaSimplificada {
  id: string;
  tipo: string;
  numero: string;
  ementa: string;
  data_publicacao: string;
  orgao_emissor: string | null;
  analise_norma: string;
}

const formatTipo = (tipo: string) => {
  const tipos: Record<string, string> = {
    decreto: "Decreto",
    resolucao: "Resolução",
    portaria: "Portaria",
    lei: "Lei",
    lei_federal: "Lei Federal",
    lei_estadual: "Lei Estadual",
    instrucao_normativa: "Instrução Normativa",
    outro: "Outro",
  };
  return tipos[tipo] || tipo;
};

const getTipoColor = (tipo: string): string => {
  const cores: Record<string, string> = {
    decreto: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    resolucao: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    portaria: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    lei: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    lei_federal: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    lei_estadual: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    instrucao_normativa: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  };
  return cores[tipo] || "bg-muted text-muted-foreground border-border";
};

const getIconForTipo = (tipo: string) => {
  return FileText;
};

// Extrai o resumo inicial da análise (primeiros parágrafos)
const extrairResumo = (analise: string, maxLength = 200): string => {
  if (!analise) return "";
  // Remove emojis e títulos
  let texto = analise.replace(/^[\s\S]*?(?=\n\n)/m, "").trim();
  texto = texto.replace(/^[📘📗📙🔍✅❌⚠️💡🎯📋]+\s*/gm, "");
  // Pega as primeiras linhas
  const linhas = texto.split("\n").filter(l => l.trim());
  let resumo = "";
  for (const linha of linhas) {
    if (resumo.length + linha.length > maxLength) break;
    resumo += (resumo ? " " : "") + linha.trim();
  }
  return resumo || texto.substring(0, maxLength);
};

const RelatoriosTab = () => {
  const [selectedNorma, setSelectedNorma] = useState<NormaSimplificada | null>(null);

  const { data: normas, isLoading } = useQuery({
    queryKey: ["normas-linguagem-simples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("normas")
        .select("id, tipo, numero, ementa, data_publicacao, orgao_emissor, analise_norma");
      
      if (error) throw error;
      
      // Ordenar manualmente: Decreto 67.985 primeiro, depois por data
      const sorted = (data as NormaSimplificada[])?.sort((a, b) => {
        // Normas COM análise vêm primeiro
        if (a.analise_norma && !b.analise_norma) return -1;
        if (!a.analise_norma && b.analise_norma) return 1;
        // Dentro das que têm análise, Decreto 67.985 primeiro
        if (a.analise_norma && b.analise_norma) {
          if (a.numero === "67.985/2023") return -1;
          if (b.numero === "67.985/2023") return 1;
        }
        return new Date(b.data_publicacao).getTime() - new Date(a.data_publicacao).getTime();
      });
      
      return sorted;
      
      if (error) throw error;
      return data as NormaSimplificada[];
    },
  });

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-10 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Análise em Linguagem Acessível</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Linguagem Simples!
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Normas jurídicas traduzidas para uma linguagem clara e objetiva. 
            Entenda o que cada lei, decreto ou resolução significa na prática.
          </p>
          <p className="text-xs text-primary max-w-2xl mx-auto mt-4 italic">
            Importante! O conteúdo desta página tem fim didático, não podendo substituir, para fins jurídicos, o texto da norma em si.
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          // Skeleton loading
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-6 w-3/4 mt-3" />
                <Skeleton className="h-4 w-full mt-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : normas?.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma análise disponível
            </h3>
            <p className="text-muted-foreground">
              Em breve novas normas serão disponibilizadas em linguagem simples.
            </p>
          </div>
        ) : (
          normas?.map((norma) => {
            const Icon = getIconForTipo(norma.tipo);
            const temAnalise = !!norma.analise_norma;
            return (
              <Card
                key={norma.id}
                className={cn(
                  "group transition-all duration-300 overflow-hidden border",
                  temAnalise 
                    ? "cursor-pointer hover:shadow-xl hover:scale-[1.02] border-primary/30 bg-card shadow-md" 
                    : "bg-slate-800/90 dark:bg-slate-900 border-slate-700",
                  selectedNorma?.id === norma.id && "ring-2 ring-primary"
                )}
                onClick={() => temAnalise && setSelectedNorma(norma)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300",
                      temAnalise ? getTipoColor(norma.tipo) : "bg-slate-600 text-slate-400",
                      temAnalise && "group-hover:scale-110"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs border", 
                        temAnalise ? getTipoColor(norma.tipo) : "bg-slate-700 text-slate-400 border-slate-600"
                      )}
                    >
                      {formatTipo(norma.tipo)}
                    </Badge>
                  </div>
                  <CardTitle className={cn(
                    "text-lg mt-3 transition-colors line-clamp-1",
                    temAnalise ? "text-foreground group-hover:text-primary" : "text-slate-400"
                  )}>
                    {formatTipo(norma.tipo)} {norma.numero}
                  </CardTitle>
                  <CardDescription className={cn(
                    "line-clamp-2 text-sm",
                    !temAnalise && "text-slate-500"
                  )}>
                    {norma.ementa}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className={cn(
                    "rounded-lg p-3 mb-3",
                    temAnalise ? "bg-muted/40" : "bg-slate-700/50"
                  )}>
                    <p className={cn(
                      "text-sm line-clamp-3",
                      temAnalise ? "text-muted-foreground" : "text-slate-500"
                    )}>
                      {temAnalise 
                        ? `${extrairResumo(norma.analise_norma, 150)}...`
                        : "Texto em linguagem simples em breve..."
                      }
                    </p>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between text-xs",
                    temAnalise ? "text-muted-foreground" : "text-slate-500"
                  )}>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateBR(norma.data_publicacao)}
                    </span>
                    {temAnalise ? (
                      <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 font-medium">
                        Ler análise <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-slate-700 text-slate-400 border-slate-600">
                        Em breve
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal de Leitura */}
      {selectedNorma && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl h-[90vh] flex flex-col shadow-2xl">
            <CardHeader className="border-b border-border bg-muted/30 flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={getTipoColor(selectedNorma.tipo)}>
                      {formatTipo(selectedNorma.tipo)}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {selectedNorma.numero}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl">
                    {formatTipo(selectedNorma.tipo)} nº {selectedNorma.numero}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {selectedNorma.ementa}
                  </CardDescription>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateBR(selectedNorma.data_publicacao)}
                    </span>
                    {selectedNorma.orgao_emissor && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {selectedNorma.orgao_emissor}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedNorma(null)}
                  className="flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea type="always" className="h-full">
                <div className="p-6">
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full mb-4">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Análise em Linguagem Simples</span>
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <div className="text-foreground leading-relaxed whitespace-pre-line">
                      {selectedNorma.analise_norma}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RelatoriosTab;
