import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import EditalAnalysisResult from "./EditalAnalysisResult";

export interface EditalAnalysis {
  objeto: string;
  valor_estimado: string;
  planilha_estimada: unknown;
  criterio_julgamento: string;
  data_sessao: string;
  condicoes_habilitacao: string;
  sistema_licitacao: string;
  modalidade: string;
  numero_edital: string;
  orgao: string;
  resumo_simples: string;
}

interface EditalAnalyzerProps {
  onBack: () => void;
}

const EditalAnalyzer = ({ onBack }: EditalAnalyzerProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<EditalAnalysis | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      toast({ title: "Formato inválido", description: "Envie um arquivo PDF.", variant: "destructive" });
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O limite é 20 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-edital`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao analisar");
      }

      const data: EditalAnalysis = await response.json();
      setResult(data);
    } catch (error: any) {
      toast({
        title: "Erro na análise",
        description: error.message || "Não foi possível analisar o edital.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  if (result) {
    return (
      <EditalAnalysisResult
        analysis={result}
        fileName={file?.name || ""}
        onBack={() => setResult(null)}
        onNewAnalysis={() => {
          setFile(null);
          setResult(null);
        }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-foreground">Analisador de Edital</h2>
          <p className="text-sm text-muted-foreground">
            Envie o PDF do edital para uma análise em linguagem simples
          </p>
        </div>
      </div>

      {/* Upload area */}
      <Card
        className={`border-2 border-dashed transition-all ${
          dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : file
            ? "border-primary/50 bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          {file ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setFile(null); setResult(null); }}
                >
                  Trocar arquivo
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  Arraste o edital aqui ou clique para selecionar
                </p>
                <p className="text-sm text-muted-foreground">PDF até 20 MB</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFile(f);
                  };
                  input.click();
                }}
              >
                Selecionar PDF
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Analyze button */}
      {file && (
        <Button
          className="w-full h-12 text-base gap-2"
          onClick={handleAnalyze}
          disabled={analyzing}
        >
          {analyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Analisando edital... Isso pode levar alguns segundos
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Analisar Edital
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default EditalAnalyzer;
