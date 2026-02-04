import { useState, useEffect } from "react";
import { Search, FileText, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

  // Apply formal formatting rules to text
  const applyFormalFormatting = (text: string): string => {
    let formatted = text;
    
    // 1. "Art." starts new line (but not at the very beginning)
    formatted = formatted.replace(/(?<!^)(\bArt\.?\s*\d)/gi, '\n$1');
    
    // 2. Roman numeral incisos start new line: "I -", "II -", "III -", etc.
    // Must be preceded by whitespace or start of line, and have actual roman numerals
    formatted = formatted.replace(/(?<=\s|^)((?:X{1,3}|X{0,2}(?:IX|IV|V?I{1,3})|V)\s*[-–—]\s)/g, '\n$1');
    
    // 3. Paragraphs "§" start new line - but NOT when it's a reference like "o § 3º", "do § 2º"
    // Only match § at start of sentence (after period/newline) or preceded by colon
    formatted = formatted.replace(/(?<=[.:\n])\s*(§\s*\d+º?|§\s*único)/gi, '\n$1');
    
    // 4. Alíneas "a)", "b)", etc. start new line (must be preceded by space)
    formatted = formatted.replace(/(?<=\s)([a-z]\))/gi, '\n$1');
    
    // Clean up multiple consecutive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
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

      return (
        <div className="space-y-4 text-justify">
          {dispositivos.map((dispositivo, index) => {
            const nivelStyles: Record<string, string> = {
              ementa: "text-foreground font-medium italic",
              preambulo: "text-foreground",
              artigo: "text-foreground",
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
            <Card className="h-[600px] overflow-hidden">
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
              <CardContent className="p-4 h-[calc(100%-140px)] overflow-y-auto">
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
