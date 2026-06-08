import { useState } from "react";
import { Sparkles, BookOpen, ChevronRight, FileText, Calendar, Building2, X, Play, ExternalLink } from "lucide-react";
import logoSP from "@/assets/logo-sp-governo.png.asset.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
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
  video_storage_path: string | null;
  link_externo: string | null;
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

const getVideoUrl = (path: string | null): string | null => {
  if (!path) return null;
  const { data } = supabase.storage.from("normas-videos").getPublicUrl(path);
  return data?.publicUrl || null;
};

const RelatoriosTab = () => {
  const [selectedNorma, setSelectedNorma] = useState<NormaSimplificada | null>(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  const { data: normas, isLoading } = useQuery({
    queryKey: ["normas-linguagem-simples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("normas")
        .select("id, tipo, numero, ementa, data_publicacao, orgao_emissor, analise_norma, video_storage_path, link_externo");
      
      if (error) throw error;
      
       // Ordenação fixa por prioridade: 1º 67.985, 2º por data, 3º 12.807, 4º 68.422
        const ordemFixa: Record<string, number> = {
          "67.985/2023": 1,
          "12.807/2025": 3,
          "68.422/2024": 4,
          "68.304/2024": 5,
          "60/2025": 6,
          "69.861/2025": 7,
        };
        const sorted = (data as NormaSimplificada[])?.sort((a, b) => {
          // Normas COM análise vêm primeiro
          if (a.analise_norma && !b.analise_norma) return -1;
          if (!a.analise_norma && b.analise_norma) return 1;
          // Dentro das que têm análise: prioridade fixa
          if (a.analise_norma && b.analise_norma) {
            const pa = ordemFixa[a.numero] ?? 2;
            const pb = ordemFixa[b.numero] ?? 2;
            if (pa !== pb) return pa - pb;
          }
          return new Date(b.data_publicacao).getTime() - new Date(a.data_publicacao).getTime();
        });
      
      return sorted;
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
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Linguagem Simples!
            </h1>
            <img src={logoSP.url} alt="Governo do Estado de São Paulo" className="h-12 md:h-14 w-auto object-contain" />
          </div>
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
            const temVideo = !!norma.video_storage_path;
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
                  {/* Miniatura do vídeo */}
                  {temVideo && (
                    <div 
                      className="relative rounded-lg overflow-hidden mb-3 cursor-pointer group/video"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = getVideoUrl(norma.video_storage_path);
                        if (url) setPlayingVideoUrl(url);
                      }}
                    >
                      <AspectRatio ratio={16 / 9} className="bg-muted">
                        <video
                          src={getVideoUrl(norma.video_storage_path) || ""}
                          preload="metadata"
                          muted
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover/video:bg-black/30 transition-colors">
                          <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover/video:scale-110 transition-transform">
                            <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                          </div>
                        </div>
                      </AspectRatio>
                    </div>
                  )}
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
                    <div className="flex items-center gap-2">
                      {norma.link_externo && (
                        <a
                          href={norma.link_externo}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                          title="Ver publicação oficial"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Oficial
                        </a>
                      )}
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
                  {/* Vídeo explicativo */}
                  {selectedNorma.video_storage_path && (
                    <div className="mb-6">
                      <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full mb-3">
                        <Play className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Vídeo Explicativo</span>
                      </div>
                      <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg bg-muted">
                        <video
                          controls
                          className="h-full w-full object-contain"
                          src={getVideoUrl(selectedNorma.video_storage_path) || ""}
                          preload="metadata"
                        >
                          Seu navegador não suporta vídeos.
                        </video>
                      </AspectRatio>
                    </div>
                  )}
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

      {/* Modal de Vídeo Expandido */}
      {playingVideoUrl && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPlayingVideoUrl(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPlayingVideoUrl(null)}
            className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
          >
            <X className="h-6 w-6" />
          </Button>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg">
              <video
                controls
                autoPlay
                className="h-full w-full object-contain bg-black"
                src={playingVideoUrl}
              >
                Seu navegador não suporta vídeos.
              </video>
            </AspectRatio>
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatoriosTab;
