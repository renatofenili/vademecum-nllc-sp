import { useState } from "react";
import logoLaboratorio from "@/assets/logo-laboratorio.png";
import { RefreshCw, Calendar, GitCompare, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDateBR } from "@/lib/date";

const MudancasTab = () => {
  const [periodoFilter, setPeriodoFilter] = useState("30");

  const { data: normasRecentes, isLoading } = useQuery({
    queryKey: ["normas-recentes", periodoFilter],
    queryFn: async () => {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - parseInt(periodoFilter));

      const { data, error } = await supabase
        .from("normas")
        .select("id, numero, tipo, ementa, data_publicacao, status, updated_at")
        .gte("data_publicacao", dataLimite.toISOString().split("T")[0])
        .order("data_publicacao", { ascending: false });

      if (error) throw error;
      return data;
    },
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

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-hero py-8 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              O que Mudou
            </h1>
            <img src={logoLaboratorio} alt="Laboratório de Inovação em Logística Pública" className="h-10 md:h-12 w-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-lg">
            Acompanhe alterações normativas e impactos no sistema jurídico
          </p>
        </div>
      </div>

      <Tabs defaultValue="alteracoes" className="space-y-6">
        <TabsList className="grid w-full max-w-lg mx-auto grid-cols-3">
          <TabsTrigger value="alteracoes">Alterações Recentes</TabsTrigger>
          <TabsTrigger value="comparacao">Comparar Versões</TabsTrigger>
          <TabsTrigger value="impactos">Impactos</TabsTrigger>
        </TabsList>

        <TabsContent value="alteracoes" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Alterações por Período
                </CardTitle>
                <CardDescription>
                  Normas publicadas ou atualizadas no período selecionado
                </CardDescription>
              </div>
              <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="180">Últimos 6 meses</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando alterações...
                </div>
              ) : normasRecentes?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhuma alteração encontrada no período selecionado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {normasRecentes?.map((norma) => (
                    <div
                      key={norma.id}
                      className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                        <RefreshCw className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {formatTipo(norma.tipo)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDateBR(norma.data_publicacao)}
                          </span>
                          {norma.status === "revogada" && (
                            <Badge variant="destructive" className="text-xs">
                              Revogada
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground">
                          {formatTipo(norma.tipo)} {norma.numero}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {norma.ementa}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparacao" className="space-y-6">
          <Card className="py-16">
            <CardContent className="text-center text-muted-foreground">
              <GitCompare className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Comparação entre Versões
              </h3>
              <p className="max-w-md mx-auto">
                Compare diferentes versões de um ato normativo para identificar alterações no texto.
                Funcionalidade em desenvolvimento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impactos" className="space-y-6">
          <Card className="py-16">
            <CardContent className="text-center text-muted-foreground">
              <AlertCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Dispositivos Impactados
              </h3>
              <p className="max-w-md mx-auto">
                Identifique quais dispositivos de outras normas são afetados por uma alteração legislativa.
                Funcionalidade em desenvolvimento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MudancasTab;
