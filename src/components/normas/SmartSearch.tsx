import { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface NormaResult {
  id: string;
  numero: string;
  tipo: string;
  ementa: string;
  data_publicacao: string;
  matchField?: string;
}

interface SmartSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelectNorma?: (normaId: string) => void;
  placeholder?: string;
  className?: string;
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

const SmartSearch = ({ 
  value, 
  onChange, 
  onSelectNorma, 
  placeholder = "Buscar em todos os campos...",
  className 
}: SmartSearchProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<NormaResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search when value changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value || value.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchTerm = value.trim();
        
        // Format search term for PostgreSQL full-text search (tsquery)
        // Split into words, filter empties, add :* for prefix matching
        const tsQuery = searchTerm
          .split(/\s+/)
          .filter(Boolean)
          .map(word => `${word}:*`)
          .join(" & ");
        
        // Use PostgreSQL full-text search with search_vector column (much faster than ILIKE)
        const { data, error } = await supabase
          .from("normas")
          .select("id, numero, tipo, ementa, data_publicacao, orgao_emissor, observacoes, analise_norma")
          .textSearch("search_vector", tsQuery, { type: "websearch", config: "portuguese" })
          .order("data_publicacao", { ascending: false })
          .limit(10);

        if (error) throw error;

        // Determine which field matched for each result (approximate, since FTS doesn't tell us)
        const resultsWithMatch = (data || []).map((norma) => {
          let matchField = "";
          const term = searchTerm.toLowerCase();
          
          if (norma.numero?.toLowerCase().includes(term)) {
            matchField = "número";
          } else if (norma.ementa?.toLowerCase().includes(term)) {
            matchField = "ementa";
          } else if (norma.orgao_emissor?.toLowerCase().includes(term)) {
            matchField = "órgão emissor";
          } else if (norma.analise_norma?.toLowerCase().includes(term)) {
            matchField = "linguagem simples";
          } else if (norma.observacoes?.toLowerCase().includes(term)) {
            matchField = "observações";
          } else {
            matchField = "texto completo";
          }

          return {
            id: norma.id,
            numero: norma.numero,
            tipo: norma.tipo,
            ementa: norma.ementa,
            data_publicacao: norma.data_publicacao,
            matchField,
          };
        });

        setResults(resultsWithMatch);
        setIsOpen(resultsWithMatch.length > 0);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error("Erro na busca:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelectResult(results[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelectResult = (result: NormaResult) => {
    onSelectNorma?.(result.id);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query || !text) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-primary/20 text-foreground px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const clearSearch = () => {
    onChange("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          className="pl-10 pr-10 h-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
        />
        {isLoading && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {value && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="py-1 max-h-80 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={result.id}
                className={cn(
                  "w-full px-4 py-3 text-left flex items-start gap-3 transition-colors",
                  highlightedIndex === index
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
                onClick={() => handleSelectResult(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-foreground">
                      {formatTipo(result.tipo)} {highlightMatch(result.numero, value)}
                    </span>
                    {result.matchField && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {result.matchField}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {highlightMatch(result.ementa, value)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {results.length} resultado{results.length !== 1 ? "s" : ""} • Busca em número, ementa, análise e texto
          </div>
        </div>
      )}

      {/* No results message */}
      {isOpen && value.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 text-center text-muted-foreground">
          Nenhuma norma encontrada para "{value}"
        </div>
      )}
    </div>
  );
};

export default SmartSearch;
