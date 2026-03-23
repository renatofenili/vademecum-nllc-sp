import { useState, useEffect, useMemo } from "react";
import { Search, Scale, Calendar, Tag, ChevronDown, ChevronUp, X, BookOpen, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import logoTCESP from "@/assets/logo-tcesp.png";

interface Jurisprudencia {
  id: string;
  numero_tc: string;
  temas: string[];
  materia: string | null;
  objeto: string | null;
  resumo: string | null;
  sessao_data: string | null;
  boletim_referencia: string | null;
  link_relatorio_voto: string | null;
}

const INITIAL_TEMAS_VISIBLE = 12;

const JurisprudenciaTab = () => {
  const [dados, setDados] = useState<Jurisprudencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemas, setSelectedTemas] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAllTemas, setShowAllTemas] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("jurisprudencia")
        .select("*")
        .order("sessao_data", { ascending: false });

      if (!error && data) {
        setDados(data as unknown as Jurisprudencia[]);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Extract all unique themes
  const allTemas = useMemo(() => {
    const temaSet = new Set<string>();
    dados.forEach((d) => d.temas?.forEach((t) => temaSet.add(t)));
    return Array.from(temaSet).sort();
  }, [dados]);

  // Filter data
  const filtered = useMemo(() => {
    return dados.filter((item) => {
      const matchSearch =
        !searchTerm ||
        item.numero_tc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.objeto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.resumo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.temas?.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchTemas =
        selectedTemas.length === 0 ||
        selectedTemas.some((st) => item.temas?.includes(st));

      return matchSearch && matchTemas;
    });
  }, [dados, searchTerm, selectedTemas]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTema = (tema: string) => {
    setSelectedTemas((prev) =>
      prev.includes(tema) ? prev.filter((t) => t !== tema) : [...prev, tema]
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /** Limpa o texto extraído do PDF: junta linhas quebradas, remove artefatos,
   *  e separa em parágrafos reais. */
  const formatResumo = (text: string): string[] => {
    // Remove page numbers (standalone 1-3 digit numbers on their own line)
    let cleaned = text.replace(/\n\d{1,3}\n/g, "\n");
    // Remove trailing "ODS:" or "ODS: ..." at the end
    cleaned = cleaned.replace(/\nODS:.*$/s, "").trim();
    // Remove "Sessão: DD/MM/YYYY" lines that leaked into the resumo
    cleaned = cleaned.replace(/\nSessão:\s*\d{2}\/\d{2}\/\d{4}.*$/gm, "");
    // Remove standalone page numbers at start/end of text
    cleaned = cleaned.replace(/^\d{1,3}\s*\n/gm, "");

    // First pass: join ALL lines into continuous text, preserving intentional breaks
    // An intentional paragraph break = blank line where previous text ended with sentence-ending punctuation
    const lines = cleaned.split("\n");
    const chunks: string[] = [];
    let buf = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === "") {
        // Blank line: only break paragraph if buffer ends with sentence-ending punctuation
        if (buf && /[.;:!?)""]$/.test(buf.trim())) {
          chunks.push(buf.trim());
          buf = "";
        }
        // Otherwise ignore the blank line (it's a PDF artifact)
        continue;
      }

      // List item markers start a new paragraph
      const isListItem = /^[-–•]\s/.test(line) || /^[a-z]\)\s/.test(line) || /^\d+[).]\s/.test(line);
      if (isListItem && buf.trim()) {
        chunks.push(buf.trim());
        buf = line;
        continue;
      }

      // Join with previous line
      if (buf) {
        // Hyphenated word break at end of line
        if (buf.endsWith("-") && /^[a-záàâãéèêíïóôõúüç]/.test(line)) {
          buf = buf.slice(0, -1) + line;
        } else {
          buf += " " + line;
        }
      } else {
        buf = line;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());

    return chunks.filter((p) => p.length > 0);
  };

  // Group temas by frequency for showing popular ones first
  const temasByFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    dados.forEach((d) => d.temas?.forEach((t) => { freq[t] = (freq[t] || 0) + 1; }));
    return allTemas.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  }, [dados, allTemas]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <img 
            src={logoTCESP} 
            alt="Tribunal de Contas do Estado de São Paulo" 
            className="h-16 md:h-20 w-auto object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Jurisprudência TCE/SP
            </h1>
            <p className="text-sm text-muted-foreground">
              Decisões de destaque em licitações e contratos — Boletim de Atualização
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Pesquise por número do TC, tema, objeto ou palavras-chave do resumo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-11 h-12 text-base rounded-xl border-2 border-border/50 focus:border-primary/50 bg-card shadow-sm"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Thematic Menu */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Filtrar por Temática
          </p>
          {selectedTemas.length > 0 && (
            <button
              onClick={() => setSelectedTemas([])}
              className="text-xs text-destructive hover:text-destructive/80 font-medium flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Limpar ({selectedTemas.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(showAllTemas ? temasByFrequency : temasByFrequency.slice(0, INITIAL_TEMAS_VISIBLE)).map((tema) => {
            const isSelected = selectedTemas.includes(tema);
            const count = dados.filter((d) => d.temas?.includes(tema)).length;
            return (
              <button
                key={tema}
                onClick={() => toggleTema(tema)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tema}
                <span className={cn(
                  "text-[10px] font-bold opacity-70",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            );
          })}

          {temasByFrequency.length > INITIAL_TEMAS_VISIBLE && (
            <button
              onClick={() => setShowAllTemas(!showAllTemas)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-all"
            >
              {showAllTemas ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Menos temas
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  +{temasByFrequency.length - INITIAL_TEMAS_VISIBLE} temas
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Results Counter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando..." : (
            <>
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {" "}decisão{filtered.length !== 1 ? "ões" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
            </>
          )}
        </p>
      </div>

      <Separator />

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhuma decisão encontrada para os critérios informados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            return (
              <Card
                key={item.id}
                onClick={() => toggleExpand(item.id)}
                className={cn(
                  "rounded-xl transition-all duration-200 hover:shadow-md border-l-4 cursor-pointer",
                  isExpanded ? "border-l-primary shadow-md" : "border-l-transparent hover:border-l-primary/40"
                )}
              >
                  <CardHeader className="pb-3 pt-4 px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">
                            {item.numero_tc}
                          </span>
                          {item.link_relatorio_voto && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                window.open(item.link_relatorio_voto!, "_blank", "noopener,noreferrer");
                              }}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 underline underline-offset-2 cursor-pointer bg-transparent border-none p-0"
                              title="Ver Relatório/Voto no TCE/SP"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Inteiro teor
                            </button>
                          )}
                          {item.sessao_data && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(item.sessao_data)}
                            </span>
                          )}
                          {item.materia && (
                            <Badge variant="outline" className="text-xs rounded-md font-normal">
                              {item.materia}
                            </Badge>
                          )}
                        </div>
                        {item.objeto && (
                          <p className="text-sm text-foreground/80 line-clamp-2">
                            {item.objeto}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Tema badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.temas?.map((tema) => (
                        <Badge
                          key={tema}
                          variant="secondary"
                          className="text-xs rounded-md font-normal px-2 py-0.5"
                        >
                          <Tag className="h-3 w-3 mr-1 opacity-60" />
                          {tema}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>

                {isExpanded && item.resumo && (
                  <CardContent className="px-5 pb-5 pt-0">
                    <Separator className="mb-4" />
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Resumo da Decisão
                      </p>
                      <div className="text-sm leading-relaxed text-foreground/90 bg-muted/30 rounded-lg p-4 border space-y-3 text-justify">
                        {formatResumo(item.resumo).map((paragraph, idx) => (
                          <p key={idx}>{paragraph}</p>
                        ))}
                      </div>
                      {item.boletim_referencia && (
                        <p className="text-xs text-muted-foreground italic">
                          Fonte: Boletim de Atualização de Licitações e Contratos — {item.boletim_referencia}
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JurisprudenciaTab;
