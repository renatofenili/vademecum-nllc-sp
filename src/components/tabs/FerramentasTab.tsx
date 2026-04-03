import { useState } from "react";
import { Building2, Store, FileSearch, ArrowLeft, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Profile = null | "orgao" | "licitante";

const orgaoTools = [
  { id: "etp", label: "Analisador ETP", description: "Análise do Estudo Técnico Preliminar" },
  { id: "tr", label: "Analisador TR", description: "Análise do Termo de Referência" },
  { id: "pesquisa", label: "Analisador Pesquisa de Preços", description: "Análise da pesquisa de preços" },
  { id: "preparatoria", label: "Analisador Fase Preparatória", description: "Análise da fase preparatória do processo" },
];

const licitanteTools = [
  { id: "edital", label: "Analisador Edital", description: "Análise do edital de licitação" },
];

const FerramentasTab = () => {
  const [profile, setProfile] = useState<Profile>(null);

  if (profile === null) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Wrench className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Ferramentas</h2>
          <p className="text-muted-foreground">Selecione seu perfil para acessar as ferramentas disponíveis</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1"
            onClick={() => setProfile("orgao")}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-lg">Sou órgão / entidade pública</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Ferramentas para gestão de riscos na fase de planejamento do processo licitatório
              </CardDescription>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1"
            onClick={() => setProfile("licitante")}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Store className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-lg">Sou licitante / fornecedor</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Ferramentas para análise de editais e participação em licitações
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const tools = profile === "orgao" ? orgaoTools : licitanteTools;
  const title = profile === "orgao" ? "Órgão / Entidade Pública" : "Licitante / Fornecedor";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setProfile(null)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">Selecione a ferramenta desejada</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tools.map((tool) => (
          <Card
            key={tool.id}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileSearch className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{tool.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{tool.description}</CardDescription>
              <p className="text-xs text-muted-foreground mt-2 italic">Em breve</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FerramentasTab;
