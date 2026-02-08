import { useState } from "react";
import { Search, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import DispositivoSearch from "@/components/consultas/DispositivoSearch";

interface DispositivoSelecionado {
  normaId: string;
  normaTipo: string;
  normaNumero: string;
  anchor: string;
  nivel: string;
  texto: string;
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

const ConsultasTab = () => {
  const [dispositivoSelecionado, setDispositivoSelecionado] = useState<DispositivoSelecionado | null>(null);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Consulta por Dispositivo
          </h1>
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
          <DispositivoSearch
            onSelectDispositivo={setDispositivoSelecionado}
            placeholder="Buscar por dispositivo (ex: Art. 75, §1º, dispensa, inexigibilidade...)"
          />

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Exemplos:</span>
            {["Art. 75", "§1º", "dispensa", "inexigibilidade", "pregão"].map((term) => (
              <button
                key={term}
                className="text-sm text-primary hover:underline underline-offset-2"
                onClick={() => {
                  const input = document.querySelector('input[placeholder*="dispositivo"]') as HTMLInputElement;
                  if (input) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    nativeInputValueSetter?.call(input, term);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }}
              >
                {term}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dispositivo Selecionado */}
      {dispositivoSelecionado && (
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
                <Search className="h-4 w-4 mr-1" />
                Nova busca
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[400px]">
              <div className="p-6">
                <p className="text-foreground leading-relaxed whitespace-pre-line text-justify">
                  {dispositivoSelecionado.texto}
                </p>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConsultasTab;
