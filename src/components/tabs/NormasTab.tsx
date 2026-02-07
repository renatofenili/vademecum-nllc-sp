import { useState, useEffect } from "react";
import { Search, FileText, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/date";

const tiposNorma = [
  { value: "all", label: "Todos os tipos" },
  { value: "decreto", label: "Decreto" },
  { value: "resolucao", label: "Resolução" },
  { value: "portaria", label: "Portaria" },
  { value: "lei", label: "Lei" },
  { value: "instrucao_normativa", label: "Instrução Normativa" },
];

interface NormasTabProps {
  initialSearch?: string;
}

const NormasTab = ({ initialSearch = "" }: NormasTabProps) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [tipoFilter, setTipoFilter] = useState("all");
  const [selectedNorma, setSelectedNorma] = useState<string | null>(null);

  useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);

  const { data: normas, isLoading } = useQuery({
    queryKey: ["normas", searchTerm, tipoFilter],
    queryFn: async () => {
      let query = supabase
        .from("normas")
        .select("id, numero, tipo, ementa, data_publicacao, status, texto_extraido")
        .order("data_publicacao", { ascending: false });

      if (searchTerm) {
        query = query.or(`numero.ilike.%${searchTerm}%,ementa.ilike.%${searchTerm}%`);
      }

      if (tipoFilter !== "all") {
        query = query.eq("tipo", tipoFilter as "decreto" | "resolucao" | "portaria" | "lei" | "instrucao_normativa" | "outro");
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: normaDetalhe } = useQuery({
    queryKey: ["norma-detalhe", selectedNorma],
    queryFn: async () => {
      if (!selectedNorma) return null;
      const { data, error } = await supabase
        .from("normas")
        .select("*")
        .eq("id", selectedNorma)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedNorma,
  });

  const formatTipo = (tipo: string) => {
    const tipos: Record<string, string> = {
      decreto: "Decreto",
      resolucao: "Resolução",
      portaria: "Portaria",
      lei: "Lei",
      instrucao_normativa: "Instrução Normativa",
      outro: "Outro",
    };
    return tipos[tipo] || tipo;
  };

  // Apply formal formatting rules to text (IN73 typographic corrections)
  const applyFormalFormatting = (text: string): string => {
    if (!text) return "";
    
    // Normalize line endings
    let formatted = text.replace(/\r\n?/g, "\n");
    
    // === RULE E: Hyphenation at end-of-line ===
    // "eletrô-\nnico" => "eletrônico" (hyphen + newline + lowercase = join without space)
    formatted = formatted.replace(/-\n([a-záàâãéêíóôõúç])/gi, "$1");
    
    // === RULE F: Word split without hyphen ===
    // "la\nnces", "sis\ntema" => "lances", "sistema"
    // Detect: lowercase letter + newline + lowercase letter (mid-word break)
    formatted = formatted.replace(/([a-záàâãéêíóôõúç])\n([a-záàâãéêíóôõúç])/gi, "$1$2");
    
    // === OCR artifact corrections ===
    // Fix "||" -> "II -", "|||" -> "III -", etc.
    formatted = formatted.replace(
      /(^|[.;:\s])\|(\|{0,6})\s*[-–—]?\s*(?=[A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç])/gm,
      (match, prefix, pipes) => {
        const romanMap: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };
        const numPipes = pipes.length + 1;
        return prefix + (romanMap[numPipes] || "I".repeat(numPipes)) + " - ";
      }
    );
    
    // Fix "0" (zero) -> "o" (article) before capitalized word
    formatted = formatted.replace(/\s0\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, " o $1");
    
    // === RULE C/D/G: Merge lines that are NOT new dispositivos ===
    // Pattern for new dispositivo start (must NOT be joined):
    // - Art. / Artigo
    // - §
    // - Parágrafo único
    // - Roman numerals: I, II, III, IV, V, VI, VII, VIII, IX, X (followed by -, ., ), or space+letter)
    // - Alíneas: a), b), c)...
    // - Numbered items: 1., 2., 3....
    
    const lines = formatted.split("\n");
    const result: string[] = [];
    
    const isNewDispositivo = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      
      // Art. or Artigo
      if (/^Art(igo)?\.?\s*\d/i.test(trimmed)) return true;
      
      // § (paragraph marker)
      if (/^§/.test(trimmed)) return true;
      
      // Parágrafo único
      if (/^Parágrafo\s+único/i.test(trimmed)) return true;
      
      // Roman numerals at start (I, II, III... up to X) followed by separator
      if (/^(X{0,1}I{1,3}|IV|VI{0,3}|IX|X)\s*[-–—.)\s]/i.test(trimmed)) return true;
      
      // Alíneas: a), b), c)...
      if (/^[a-z]\)\s/i.test(trimmed)) return true;
      
      // Numbered items: 1., 2., 3.
      if (/^\d{1,2}\.\s/.test(trimmed)) return true;
      
      return false;
    };
    
    const endsWithStrongPunctuation = (line: string): boolean => {
      const trimmed = line.trim();
      return /[.;:?!]$/.test(trimmed);
    };
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const nextLine = lines[i + 1];
      
      if (result.length === 0) {
        result.push(currentLine);
        continue;
      }
      
      const prevLine = result[result.length - 1];
      
      // RULE G: If current line starts a new dispositivo, keep it on new line
      if (isNewDispositivo(currentLine)) {
        result.push(currentLine);
        continue;
      }
      
      // RULE D: If previous line does NOT end with strong punctuation
      // and current line is NOT a new dispositivo, join with space
      if (!endsWithStrongPunctuation(prevLine) && currentLine.trim()) {
        result[result.length - 1] = prevLine.trimEnd() + " " + currentLine.trimStart();
      } else {
        result.push(currentLine);
      }
    }
    
    formatted = result.join("\n");
    
    // === Fix "Art." separated from number ===
    // "Art.\n46" or "Art. \n 46" => "Art. 46"
    formatted = formatted.replace(/\bArt\.?\s*\n+\s*(\d+)/gi, "Art. $1");
    
    // Clean up multiple spaces
    formatted = formatted.replace(/ {2,}/g, " ");
    
    // Clean up more than 2 consecutive newlines
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    
    return formatted.trim();
  };


  // Parse texto_extraido JSON to render formatted text
  const renderTextoExtraido = (textoExtraido: string | null) => {
    if (!textoExtraido) return null;

    try {
      const dispositivos = JSON.parse(textoExtraido) as Array<{
        anchor: string;
        nivel: string;
        texto: string;
      }>;

      if (!Array.isArray(dispositivos) || dispositivos.length === 0) {
        return <p className="text-muted-foreground">Texto sem dispositivos estruturados</p>;
      }

      // Some PDFs split the article prefix and number into separate lines/devices.
      // Merge "Art." + "21. ..." (presentation-only) so it renders as "Art. 21. ...".
      const dispositivosMerged = (() => {
        const merged: typeof dispositivos = [];
        const norm = (s: string) =>
          String(s || "")
            .replace(/\r\n?/g, "\n")
            .replace(/[\f\v\u0085\u2028\u2029]/g, "\n")
            .trim();

        for (let i = 0; i < dispositivos.length; i++) {
          const cur = dispositivos[i];
          const prev = merged[merged.length - 1];

          if (prev) {
            const prevNorm = norm(prev.texto);
            const curNorm = norm(cur.texto);

            if (/^Art\.?$/i.test(prevNorm) && /^\d{1,4}\./.test(curNorm)) {
              merged[merged.length - 1] = {
                ...prev,
                texto: `Art. ${cur.texto.replace(/^[\s\r\n\f\v\u0085\u2028\u2029]+/, "")}`,
              };
              continue;
            }
          }

          merged.push(cur);
        }

        return merged;
      })();

      return (
        <div className="space-y-4 text-justify">
          {dispositivosMerged.map((dispositivo, index) => {
            const nivelStyles: Record<string, string> = {
              ementa: "text-foreground font-medium italic",
              preambulo: "text-foreground",
              artigo: "text-foreground",
              secao: "text-foreground font-semibold text-center mt-6 mb-2",
              paragrafo: "text-foreground ml-4",
              inciso: "text-foreground ml-8",
              alinea: "text-foreground ml-12",
            };

            const style = nivelStyles[dispositivo.nivel] || "text-foreground";
            const formattedText = applyFormalFormatting(dispositivo.texto);

            return (
              <div key={`${dispositivo.anchor}-${index}`} className="group">
                <p className={`${style} leading-relaxed whitespace-pre-line`}>
                  {formattedText}
                </p>
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                  {dispositivo.anchor}
                </span>
              </div>
            );
          })}
        </div>
      );
    } catch (e) {
      // If not valid JSON, apply formatting rules to plain text
      const formattedText = applyFormalFormatting(textoExtraido);
      return (
        <pre className="whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed">
          {formattedText}
        </pre>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Consulta de Normas
          </h1>
          <p className="text-muted-foreground text-lg">
            Acesse o texto completo das leis, decretos, resoluções e portarias que regulamentam as licitações
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por número ou assunto..."
              className="pl-10 h-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-full md:w-[200px] h-12">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Tipo de norma" />
            </SelectTrigger>
            <SelectContent>
              {tiposNorma.map((tipo) => (
                <SelectItem key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Suggestions */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Sugestões:</span>
          {["Decreto 67.608", "Pregão Eletrônico", "Dispensa", "Inexigibilidade"].map((term) => (
            <button
              key={term}
              onClick={() => setSearchTerm(term)}
              className="text-sm text-primary hover:underline underline-offset-2"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Lista de Normas */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lista de Normas
            {normas && <Badge variant="secondary">{normas.length}</Badge>}
          </h2>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando normas...
              </div>
            ) : normas?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma norma encontrada
              </div>
            ) : (
              normas?.map((norma) => (
                <Card
                  key={norma.id}
                  className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
                    selectedNorma === norma.id ? "border-primary shadow-md" : ""
                  }`}
                  onClick={() => setSelectedNorma(norma.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {formatTipo(norma.tipo)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDateBR(norma.data_publicacao)}
                          </span>
                        </div>
                        <h3 className="font-semibold text-foreground">
                          {formatTipo(norma.tipo)} {norma.numero}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {norma.ementa}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Visualização da Norma */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Texto da Norma
          </h2>

          {selectedNorma && normaDetalhe ? (
            <Card className="h-[600px] overflow-hidden flex flex-col">
              <CardHeader className="border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className="mb-2">{formatTipo(normaDetalhe.tipo)}</Badge>
                    <CardTitle className="text-xl">
                      {formatTipo(normaDetalhe.tipo)} {normaDetalhe.numero}
                    </CardTitle>
                  </div>
                  {normaDetalhe.link_externo && (
                    <a
                      href={normaDetalhe.link_externo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline underline-offset-2 flex items-center gap-1"
                    >
                      Publicação oficial →
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {normaDetalhe.ementa}
                </p>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                <ScrollArea className="h-full" type="always">
                  <div className="p-4 pr-6">
                    {normaDetalhe.texto_extraido ? (
                      <div className="prose prose-sm max-w-none">
                        {renderTextoExtraido(normaDetalhe.texto_extraido)}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Texto ainda não extraído para esta norma</p>
                        {normaDetalhe.link_externo && (
                          <a
                            href={normaDetalhe.link_externo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline mt-2 inline-block"
                          >
                            Acessar publicação oficial →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-[600px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Selecione uma norma para visualizar</p>
                <p className="text-sm mt-1">
                  Clique em uma norma na lista ao lado
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default NormasTab;
