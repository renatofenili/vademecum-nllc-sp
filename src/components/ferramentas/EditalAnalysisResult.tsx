import { useState, useEffect } from "react";
import EditalPresentationView from "./EditalPresentationView";
import {
  ArrowLeft,
  FileText,
  DollarSign,
  Scale,
  Calendar,
  Shield,
  Globe,
  Building2,
  Hash,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { EditalAnalysis } from "./EditalAnalyzer";

interface Props {
  analysis: EditalAnalysis;
  fileName: string;
  onBack: () => void;
  onNewAnalysis: () => void;
}

const metadataItems = [
  { key: "objeto" as const, label: "Objeto", icon: FileText, color: "from-blue-500 to-blue-600" },
  { key: "valor_estimado" as const, label: "Valor Estimado", icon: DollarSign, color: "from-emerald-500 to-emerald-600" },
  { key: "criterio_julgamento" as const, label: "Critério de Julgamento", icon: Scale, color: "from-amber-500 to-amber-600" },
  { key: "data_sessao" as const, label: "Data da Sessão", icon: Calendar, color: "from-purple-500 to-purple-600" },
  { key: "condicoes_habilitacao" as const, label: "Condições de Habilitação", icon: Shield, color: "from-red-500 to-red-600" },
  { key: "sistema_licitacao" as const, label: "Onde Licitar", icon: Globe, color: "from-cyan-500 to-cyan-600" },
];

const EditalAnalysisResult = ({ analysis, fileName, onBack, onNewAnalysis }: Props) => {
  const [visibleCards, setVisibleCards] = useState(0);
  const [showResumo, setShowResumo] = useState(false);
  const [resumoExpanded, setResumoExpanded] = useState(false);

  // Staggered animation
  useEffect(() => {
    const total = metadataItems.length;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleCards(i);
      if (i >= total) {
        clearInterval(interval);
        setTimeout(() => setShowResumo(true), 300);
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">Análise do Edital</h2>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onNewAnalysis} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Nova análise
        </Button>
      </div>

      {/* Quick info badges */}
      <div className="flex flex-wrap gap-2">
        {analysis.modalidade && analysis.modalidade !== "Não identificado no edital" && (
          <Badge variant="secondary" className="gap-1.5 py-1 px-3">
            <Scale className="h-3 w-3" />
            {analysis.modalidade}
          </Badge>
        )}
        {analysis.numero_edital && analysis.numero_edital !== "Não identificado no edital" && (
          <Badge variant="secondary" className="gap-1.5 py-1 px-3">
            <Hash className="h-3 w-3" />
            {analysis.numero_edital}
          </Badge>
        )}
        {analysis.orgao && analysis.orgao !== "Não identificado no edital" && (
          <Badge variant="secondary" className="gap-1.5 py-1 px-3">
            <Building2 className="h-3 w-3" />
            {analysis.orgao}
          </Badge>
        )}
      </div>

      {/* Metadata cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metadataItems.map((item, index) => {
          const value = analysis[item.key];
          const isVisible = index < visibleCards;

          return (
            <Card
              key={item.key}
              className={`overflow-hidden transition-all duration-500 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              } ${item.key === "objeto" ? "md:col-span-2" : ""}`}
            >
              <CardContent className="p-0">
                <div className="flex items-start gap-0">
                  <div
                    className={`flex-shrink-0 flex items-center justify-center w-12 min-h-full bg-gradient-to-b ${item.color}`}
                  >
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {value || "Não identificado"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resumo em linguagem simples */}
      <div
        className={`transition-all duration-700 ${
          showResumo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <Separator className="my-2" />

        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Em linguagem simples
              </h3>
            </div>

            <div
              className={`text-sm text-foreground/90 leading-relaxed whitespace-pre-line overflow-hidden transition-all duration-500 ${
                resumoExpanded ? "max-h-[2000px]" : "max-h-40"
              }`}
            >
              {analysis.resumo_simples}
            </div>

            {analysis.resumo_simples && analysis.resumo_simples.length > 300 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 gap-1 text-primary"
                onClick={() => setResumoExpanded(!resumoExpanded)}
              >
                {resumoExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Ler análise completa
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditalAnalysisResult;
