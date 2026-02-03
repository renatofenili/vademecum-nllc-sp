import { useState } from "react";
import { FileBarChart, Download, Play, Clock, FileText, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Relatorio {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  ultimaAtualizacao?: string;
}

const relatoriosProntos: Relatorio[] = [
  {
    id: "cadeia-dispensa-valor",
    titulo: "Cadeia Normativa da Dispensa por Valor",
    descricao: "Mapeamento completo dos dispositivos que regulamentam a dispensa de licitação por valor, incluindo limites, exceções e procedimentos.",
    categoria: "Dispensa",
    ultimaAtualizacao: "2025-01-15",
  },
  {
    id: "inexigibilidade",
    titulo: "Normas Incidentes na Inexigibilidade",
    descricao: "Consolidação de todos os dispositivos aplicáveis aos casos de inexigibilidade de licitação, com referências cruzadas.",
    categoria: "Inexigibilidade",
    ultimaAtualizacao: "2025-01-10",
  },
  {
    id: "recomposicao-central",
    titulo: "Recomposição de Dispositivos Centrais",
    descricao: "Análise estrutural dos dispositivos mais referenciados e suas conexões normativas.",
    categoria: "Estrutural",
    ultimaAtualizacao: "2025-01-08",
  },
  {
    id: "pregao-eletronico",
    titulo: "Cadeia do Pregão Eletrônico",
    descricao: "Dispositivos aplicáveis ao pregão eletrônico no Estado de São Paulo, desde a fase preparatória até a homologação.",
    categoria: "Pregão",
    ultimaAtualizacao: "2025-01-05",
  },
  {
    id: "contratos-continuados",
    titulo: "Contratos de Serviços Continuados",
    descricao: "Normas específicas para contratação e gestão de serviços de natureza continuada.",
    categoria: "Contratos",
    ultimaAtualizacao: "2025-01-03",
  },
];

const RelatoriosTab = () => {
  const [selectedRelatorio, setSelectedRelatorio] = useState<Relatorio | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGerarRelatorio = async (relatorio: Relatorio) => {
    setSelectedRelatorio(relatorio);
    setIsGenerating(true);
    // Simula chamada ao backend
    setTimeout(() => {
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Relatórios Analíticos
          </h1>
          <p className="text-muted-foreground text-lg">
            Relatórios pré-definidos e análises consolidadas geradas pelo sistema
          </p>
        </div>
      </div>

      <Tabs defaultValue="catalogo" className="space-y-6">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
          <TabsTrigger value="catalogo">Catálogo de Relatórios</TabsTrigger>
          <TabsTrigger value="gerados">Meus Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatoriosProntos.map((relatorio) => (
              <Card
                key={relatorio.id}
                className="group cursor-pointer transition-all hover:shadow-lg hover:border-primary/30"
                onClick={() => handleGerarRelatorio(relatorio)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <FileBarChart className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {relatorio.categoria}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-3">{relatorio.titulo}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {relatorio.descricao}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {relatorio.ultimaAtualizacao
                        ? new Date(relatorio.ultimaAtualizacao).toLocaleDateString("pt-BR")
                        : "—"}
                    </span>
                    <Button variant="ghost" size="sm" className="gap-1">
                      Gerar <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="gerados" className="space-y-6">
          {selectedRelatorio ? (
            <Card>
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className="mb-2">{selectedRelatorio.categoria}</Badge>
                    <CardTitle>{selectedRelatorio.titulo}</CardTitle>
                    <CardDescription className="mt-2">
                      {selectedRelatorio.descricao}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={isGenerating}>
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                    <Button variant="outline" size="sm" disabled={isGenerating}>
                      <FileText className="h-4 w-4 mr-2" />
                      DOC
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {isGenerating ? (
                  <div className="text-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-muted-foreground">Gerando relatório...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      O backend está processando sua solicitação
                    </p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <div className="bg-muted/30 rounded-lg p-6 text-center">
                      <FileBarChart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">
                        Relatório gerado com sucesso.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        O conteúdo do relatório será exibido aqui após processamento pelo backend.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="py-16">
              <CardContent className="text-center">
                <FileBarChart className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Nenhum relatório gerado
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Selecione um relatório do catálogo para gerar uma análise consolidada.
                  Os relatórios são processados pelo backend e retornam dados estruturados.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RelatoriosTab;
