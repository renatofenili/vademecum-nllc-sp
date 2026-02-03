import { useState } from "react";
import { Search, MessageSquare, Link2, FileText, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

interface DispositivoAplicavel {
  document_id: string;
  anchor: string;
  texto_resumido: string;
}

interface ResultadoConsulta {
  evento: string;
  dispositivos_aplicaveis: DispositivoAplicavel[];
}

const ConsultasTab = () => {
  const [eventoDescricao, setEventoDescricao] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConsultaEvento = async () => {
    if (!eventoDescricao.trim()) return;

    setIsLoading(true);
    setError(null);
    setResultado(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("find-applicable", {
        body: { evento: eventoDescricao },
      });

      if (fnError) throw fnError;
      setResultado(data);
    } catch (err) {
      console.error("Erro na consulta:", err);
      setError("Erro ao processar consulta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const exemplosConsulta = [
    "Dispensa de licitação para contratação de advocacia",
    "Contratação emergencial de medicamentos",
    "Aquisição de software por inexigibilidade",
    "Prazos para impugnação de edital",
  ];

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Consultas Normativas
          </h1>
          <p className="text-muted-foreground text-lg">
            Descreva uma situação e receba os dispositivos legais aplicáveis
          </p>
        </div>
      </div>

      <Tabs defaultValue="evento" className="space-y-6">
        <TabsList className="grid w-full max-w-lg mx-auto grid-cols-3">
          <TabsTrigger value="evento">Por Evento</TabsTrigger>
          <TabsTrigger value="dispositivo">Por Dispositivo</TabsTrigger>
          <TabsTrigger value="combinacao">Combinação</TabsTrigger>
        </TabsList>

        <TabsContent value="evento" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Consulta por Evento ou Situação
              </CardTitle>
              <CardDescription>
                Descreva a situação ou evento que deseja consultar e o sistema identificará os dispositivos normativos aplicáveis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Ex: Preciso contratar serviços de advocacia para defesa em processo judicial. Qual o procedimento licitatório aplicável?"
                className="min-h-[120px] resize-none"
                value={eventoDescricao}
                onChange={(e) => setEventoDescricao(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Exemplos:</span>
                {exemplosConsulta.map((exemplo) => (
                  <button
                    key={exemplo}
                    onClick={() => setEventoDescricao(exemplo)}
                    className="text-sm text-primary hover:underline underline-offset-2"
                  >
                    {exemplo}
                  </button>
                ))}
              </div>

              <Button
                onClick={handleConsultaEvento}
                disabled={!eventoDescricao.trim() || isLoading}
                className="w-full md:w-auto"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Consultar Dispositivos
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Resultado da Consulta */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="py-6 text-center text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          {resultado && (
            <Card>
              <CardHeader className="border-b border-border">
                <CardTitle>Dispositivos Aplicáveis</CardTitle>
                <CardDescription>
                  Encontrados {resultado.dispositivos_aplicaveis.length} dispositivos para: "{resultado.evento}"
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {resultado.dispositivos_aplicaveis.map((dispositivo, index) => (
                    <div
                      key={`${dispositivo.document_id}-${dispositivo.anchor}-${index}`}
                      className="p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary text-sm font-semibold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {dispositivo.anchor}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {dispositivo.document_id}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">
                            {dispositivo.texto_resumido}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="flex-shrink-0">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dispositivo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Consulta a partir de Dispositivo
              </CardTitle>
              <CardDescription>
                Selecione um dispositivo específico para visualizar sua cadeia normativa e conexões.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Selecione uma norma na aba "Normas" e depois acesse um dispositivo específico para consultar suas conexões.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="combinacao" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Consulta por Combinação de Normas
              </CardTitle>
              <CardDescription>
                Selecione múltiplas normas para identificar interseções e conflitos normativos.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Funcionalidade em desenvolvimento. Em breve você poderá selecionar múltiplas normas para análise cruzada.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsultasTab;
