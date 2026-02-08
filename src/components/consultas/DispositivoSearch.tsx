import { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText, X, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Dispositivo {
  normaId: string;
  normaTipo: string;
  normaNumero: string;
  anchor: string;
  nivel: string;
  texto: string;
}

interface DispositivoSearchProps {
  onSelectDispositivo?: (dispositivo: Dispositivo) => void;
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
    instrucao_normativa: "IN",
    outro: "Outro",
  };
  return tipos[tipo] || tipo;
};

const formatNivel = (nivel: string) => {
  const niveis: Record<string, string> = {
    artigo: "Artigo",
    paragrafo: "Parágrafo",
    inciso: "Inciso",
    alinea: "Alínea",
    ementa: "Ementa",
    preambulo: "Preâmbulo",
    secao: "Seção",
  };
  return niveis[nivel] || nivel;
};

const DispositivoSearch = ({
  onSelectDispositivo,
  placeholder = "Buscar dispositivo (ex: Art. 75, §1º, dispensa...)",
  className,
}: DispositivoSearchProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Dispositivo[]>([]);
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

    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const term = searchTerm.toLowerCase().trim();
        
        // Fetch normas with texto_extraido that might contain the search term
        const { data: normas, error } = await supabase
          .from("normas")
          .select("id, tipo, numero, texto_extraido")
          .not("texto_extraido", "is", null)
          .limit(100);

        if (error) throw error;

        const matchedDispositivos: Dispositivo[] = [];

        for (const norma of normas || []) {
          if (!norma.texto_extraido) continue;

          try {
            const dispositivos = JSON.parse(norma.texto_extraido) as Array<{
              anchor: string;
              nivel: string;
              texto: string;
            }>;

            if (!Array.isArray(dispositivos)) continue;

            for (const disp of dispositivos) {
              const anchorMatch = disp.anchor?.toLowerCase().includes(term);
              const textoMatch = disp.texto?.toLowerCase().includes(term);

              if (anchorMatch || textoMatch) {
                matchedDispositivos.push({
                  normaId: norma.id,
                  normaTipo: norma.tipo,
                  normaNumero: norma.numero,
                  anchor: disp.anchor,
                  nivel: disp.nivel,
                  texto: disp.texto,
                });
              }

              // Limit results for performance
              if (matchedDispositivos.length >= 20) break;
            }
          } catch {
            // Skip if texto_extraido is not valid JSON
          }

          if (matchedDispositivos.length >= 20) break;
        }

        setResults(matchedDispositivos);
        setIsOpen(matchedDispositivos.length > 0);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error("Erro na busca de dispositivos:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
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

  const handleSelectResult = (result: Dispositivo) => {
    onSelectDispositivo?.(result);
    setIsOpen(false);
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

  const truncateText = (text: string, maxLength = 150) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const clearSearch = () => {
    setSearchTerm("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          className="pl-10 pr-10 h-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
        />
        {isLoading && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {searchTerm && (
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
          <div className="py-1 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={`${result.normaId}-${result.anchor}-${index}`}
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
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatTipo(result.normaTipo)} {result.normaNumero}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                      {highlightMatch(result.anchor, searchTerm)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatNivel(result.nivel)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {highlightMatch(truncateText(result.texto), searchTerm)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {results.length} dispositivo{results.length !== 1 ? "s" : ""} encontrado
            {results.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* No results message */}
      {isOpen && searchTerm.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 text-center text-muted-foreground">
          Nenhum dispositivo encontrado para "{searchTerm}"
        </div>
      )}
    </div>
  );
};

export default DispositivoSearch;
