import { useState } from "react";
import { Network, GitBranch, Target, Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface GraphNode {
  document_id: string;
  anchor: string;
}

interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const MapasTab = () => {
  const [selectedNorma, setSelectedNorma] = useState<string>("");
  const [selectedAnchor, setSelectedAnchor] = useState("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: normas } = useQuery({
    queryKey: ["normas-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("normas")
        .select("id, numero, tipo, remissoes_extraidas")
        .not("remissoes_extraidas", "is", null)
        .order("numero");
      if (error) throw error;
      return data;
    },
  });

  const handleBuildChain = async () => {
    if (!selectedNorma || !selectedAnchor) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("build-chain", {
        body: { document_id: selectedNorma, anchor: selectedAnchor },
      });

      if (error) throw error;
      setGraphData(data);
    } catch (err) {
      console.error("Erro ao construir cadeia:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTipo = (tipo: string) => {
    const tipos: Record<string, string> = {
      decreto: "Decreto",
      resolucao: "Resolução",
      portaria: "Portaria",
      lei: "Lei",
      instrucao_normativa: "IN",
    };
    return tipos[tipo] || tipo;
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Mapas Normativos
          </h1>
          <p className="text-muted-foreground text-lg">
            Visualize grafos de dependências e conexões entre dispositivos
          </p>
        </div>
      </div>

      <Tabs defaultValue="dependencias" className="space-y-6">
        <TabsList className="grid w-full max-w-lg mx-auto grid-cols-3">
          <TabsTrigger value="dependencias">Dependências</TabsTrigger>
          <TabsTrigger value="hubs">Dispositivos Centrais</TabsTrigger>
          <TabsTrigger value="caminhos">Caminhos</TabsTrigger>
        </TabsList>

        <TabsContent value="dependencias" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Grafo de Dependências Normativas
              </CardTitle>
              <CardDescription>
                Selecione uma norma e um dispositivo para visualizar suas conexões e dependências.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Select value={selectedNorma} onValueChange={setSelectedNorma}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma norma" />
                  </SelectTrigger>
                  <SelectContent>
                    {normas?.map((norma) => (
                      <SelectItem key={norma.id} value={norma.id}>
                        {formatTipo(norma.tipo)} {norma.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Dispositivo (ex: art.1)"
                  value={selectedAnchor}
                  onChange={(e) => setSelectedAnchor(e.target.value)}
                />

                <Button onClick={handleBuildChain} disabled={!selectedNorma || !selectedAnchor || isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Construindo...
                    </>
                  ) : (
                    <>
                      <GitBranch className="h-4 w-4 mr-2" />
                      Construir Cadeia
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Visualização do Grafo */}
          <Card className="min-h-[500px]">
            <CardHeader className="border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Visualização do Grafo</CardTitle>
                {graphData && (
                  <CardDescription>
                    {graphData.nodes.length} nós • {graphData.edges.length} conexões
                  </CardDescription>
                )}
              </div>
              {graphData && (
                <div className="flex gap-2">
                  <Button variant="outline" size="icon">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-6">
              {graphData ? (
                <div className="space-y-6">
                  {/* Representação simplificada do grafo */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Nós (Dispositivos)
                      </h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {graphData.nodes.map((node, index) => (
                          <div
                            key={`${node.document_id}-${node.anchor}-${index}`}
                            className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg"
                          >
                            <div className="h-3 w-3 rounded-full bg-primary" />
                            <Badge variant="outline" className="font-mono text-xs">
                              {node.anchor}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {node.document_id.substring(0, 8)}...
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Arestas (Remissões)
                      </h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {graphData.edges.map((edge, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg text-sm"
                          >
                            <Badge variant="outline" className="font-mono text-xs">
                              {edge.from.anchor}
                            </Badge>
                            <span className="text-muted-foreground">→</span>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {edge.to.anchor}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
                    <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Visualização gráfica interativa em desenvolvimento.</p>
                    <p className="text-xs mt-1">Os dados acima representam a estrutura do grafo retornado pelo backend.</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Network className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">Selecione uma norma e dispositivo</p>
                  <p className="text-sm mt-1">
                    O grafo será renderizado após o processamento pelo backend
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hubs" className="space-y-6">
          <Card className="py-16">
            <CardContent className="text-center text-muted-foreground">
              <Target className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Dispositivos Centrais (Hubs)
              </h3>
              <p className="max-w-md mx-auto">
                Identifique os dispositivos mais referenciados no sistema normativo.
                Funcionalidade em desenvolvimento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="caminhos" className="space-y-6">
          <Card className="py-16">
            <CardContent className="text-center text-muted-foreground">
              <GitBranch className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Caminhos Normativos
              </h3>
              <p className="max-w-md mx-auto">
                Trace caminhos entre dois dispositivos através da rede de remissões.
                Funcionalidade em desenvolvimento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MapasTab;
