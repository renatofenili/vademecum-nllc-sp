import { useState, useRef, useEffect } from "react";
import { Search, FileText, Loader2, ExternalLink } from "lucide-react";
import logoLaboratorio from "@/assets/logo-laboratorio.png";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface ConsultasTabProps {
  onNavigateToNorma?: (normaId: string) => void;
}

interface DispositivoSelecionado {
  normaId: string;
  normaTipo: string;
  normaNumero: string;
  anchor: string;
  nivel: string;
  texto: string;
}

interface ResultadoDispositivo {
  normaId: string;
  normaTipo: string;
  normaNumero: string;
  anchor: string;
  nivel: string;
  texto: string;
  contexto: string; // Trecho ao redor do match
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

// Extrai um trecho de contexto ao redor do termo encontrado
const extrairContexto = (texto: string, termo: string, tamanho = 150): string => {
  if (!texto || !termo) return texto?.substring(0, tamanho * 2) || "";
  
  const textoLower = texto.toLowerCase();
  const termoLower = termo.toLowerCase();
  const posicao = textoLower.indexOf(termoLower);
  
  if (posicao === -1) return texto.substring(0, tamanho * 2);
  
  const inicio = Math.max(0, posicao - tamanho);
  const fim = Math.min(texto.length, posicao + termo.length + tamanho);
  
  let contexto = texto.substring(inicio, fim);
  if (inicio > 0) contexto = "..." + contexto;
  if (fim < texto.length) contexto = contexto + "...";
  
  return contexto;
};

// Destaca o termo no texto
const destacarTermo = (texto: string, termo: string) => {
  if (!termo || !texto) return texto;
  
  const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const partes = texto.split(regex);
  
  return partes.map((parte, i) =>
    regex.test(parte) ? (
      <mark key={i} className="bg-primary/20 text-foreground px-0.5 rounded font-medium">
        {parte}
      </mark>
    ) : (
      parte
    )
  );
};

const ConsultasTab = ({ onNavigateToNorma }: ConsultasTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDispositivo[]>([]);
  const [dispositivoSelecionado, setDispositivoSelecionado] = useState<DispositivoSelecionado | null>(null);
  const [searchRealizada, setSearchRealizada] = useState(false);
  const [termoBuscado, setTermoBuscado] = useState("");
  const dispositivoDetalheRef = useRef<HTMLDivElement>(null);

  // Scroll to dispositivo detail when selected
  useEffect(() => {
    if (dispositivoSelecionado && dispositivoDetalheRef.current) {
      dispositivoDetalheRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [dispositivoSelecionado]);

  const handlePesquisar = async () => {
    if (!searchTerm.trim() || searchTerm.length < 2) return;

    setIsLoading(true);
    setSearchRealizada(true);
    setTermoBuscado(searchTerm.trim());
    
    try {
      const term = searchTerm.toLowerCase().trim();

      // Fetch normas with texto_extraido that might contain the search term
      const { data: normas, error } = await supabase
        .from("normas")
        .select("id, tipo, numero, texto_extraido")
        .not("texto_extraido", "is", null)
        .limit(100);

      if (error) throw error;

      const matchedDispositivos: ResultadoDispositivo[] = [];

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
            const textoMatch = disp.texto?.toLowerCase().includes(term);

            if (textoMatch) {
              matchedDispositivos.push({
                normaId: norma.id,
                normaTipo: norma.tipo,
                normaNumero: norma.numero,
                anchor: disp.anchor,
                nivel: disp.nivel,
                texto: disp.texto,
                contexto: extrairContexto(disp.texto, term, 120),
              });
            }

            if (matchedDispositivos.length >= 50) break;
          }
        } catch {
          // Skip if texto_extraido is not valid JSON
        }

        if (matchedDispositivos.length >= 50) break;
      }

      setResultados(matchedDispositivos);
    } catch (err) {
      console.error("Erro na busca de dispositivos:", err);
      setResultados([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      handlePesquisar();
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Busca por Dispositivo
            </h1>
            <img src={logoLaboratorio} alt="Laboratório de Inovação em Logística Pública" className="h-10 md:h-12 w-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-lg">
            Pesquise por artigo, parágrafo, inciso ou texto de qualquer norma cadastrada
          </p>
        </div>
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Buscar Dispositivo
          </CardTitle>
          <CardDescription>
            Digite o número do artigo, parágrafo ou termo para encontrar dispositivos específicos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="search"
              placeholder="Ex: Art. 75, §1º, dispensa, inexigibilidade, credenciamento..."
              className="h-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <Button
              onClick={handlePesquisar}
              disabled={!searchTerm.trim() || isLoading}
              className="px-8"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pesquisando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Pesquisar
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Exemplos:</span>
            {["Art. 75", "dispensa", "inexigibilidade", "credenciamento", "pregão"].map((term) => (
              <button
                key={term}
                className="text-sm text-primary hover:underline underline-offset-2"
                onClick={() => setSearchTerm(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {searchRealizada && (
        <>
          {resultados.length > 0 ? (
            <Card>
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle>
                  Dispositivos Encontrados ({resultados.length})
                </CardTitle>
                <CardDescription>
                  Resultados para "<span className="font-medium text-foreground">{termoBuscado}</span>" • Clique para ver o texto completo
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  {resultados.map((resultado, index) => (
                    <button
                      key={`${resultado.normaId}-${resultado.anchor}-${index}`}
                      onClick={() => setDispositivoSelecionado(resultado)}
                      className={cn(
                        "w-full px-4 py-3 text-left border-b border-border hover:bg-muted/50 transition-colors last:border-b-0",
                        dispositivoSelecionado?.anchor === resultado.anchor && dispositivoSelecionado?.normaId === resultado.normaId
                          ? "bg-muted"
                          : ""
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary text-sm font-semibold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {formatTipo(resultado.normaTipo)} {resultado.normaNumero}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                              {resultado.anchor}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatNivel(resultado.nivel)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {destacarTermo(resultado.contexto, termoBuscado)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum dispositivo encontrado para "{termoBuscado}"
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dispositivo Selecionado */}
      {dispositivoSelecionado && (
        <div ref={dispositivoDetalheRef}>
          <Card>
            <CardHeader className="border-b border-border bg-muted/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>{formatTipo(dispositivoSelecionado.normaTipo)}</Badge>
                    <Badge variant="outline" className="font-mono">
                      {dispositivoSelecionado.anchor}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">
                    {formatTipo(dispositivoSelecionado.normaTipo)} {dispositivoSelecionado.normaNumero}
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDispositivoSelecionado(null)}
                >
                  Fechar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea type="always" className="max-h-[500px]">
                <div className="p-6">
                  <p className="text-foreground leading-relaxed whitespace-pre-line text-justify">
                    {destacarTermo(dispositivoSelecionado.texto, termoBuscado)}
                  </p>
                </div>
              </ScrollArea>
              
              {/* Link para norma completa */}
              <div className="border-t border-border bg-muted/30 px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => onNavigateToNorma?.(dispositivoSelecionado.normaId)}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver norma completa: {formatTipo(dispositivoSelecionado.normaTipo)} {dispositivoSelecionado.normaNumero}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConsultasTab;
