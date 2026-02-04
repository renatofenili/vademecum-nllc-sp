import { useState } from "react";
import { AlertTriangle, CheckCircle, FileSearch, List, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { validateNormIntegrity, ValidationResult } from "@/lib/normIntegrityValidator";

const NormIntegrityValidator = () => {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidate = () => {
    if (!rawText.trim()) return;
    
    setIsValidating(true);
    
    // Simulate async for UX
    setTimeout(() => {
      const validationResult = validateNormIntegrity(rawText);
      setResult(validationResult);
      setIsValidating(false);
    }, 100);
  };

  const handleClear = () => {
    setRawText("");
    setResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileSearch className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Validador de Integridade da Norma
          </h2>
          <p className="text-sm text-muted-foreground">
            Detecta lacunas e saltos na sequência de artigos
          </p>
        </div>
      </div>

      {/* Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Texto Bruto da Lei</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Cole aqui o texto completo da lei para análise..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button 
              onClick={handleValidate} 
              disabled={!rawText.trim() || isValidating}
            >
              {isValidating ? "Analisando..." : "Validar Integridade"}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary Alert */}
          <Alert variant={result.hasGaps ? "destructive" : "default"}>
            {result.hasGaps ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            <AlertTitle>Resultado da Validação</AlertTitle>
            <AlertDescription>{result.summary}</AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Articles Found */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <List className="h-4 w-4" />
                  Artigos Encontrados
                  <Badge variant="secondary">{result.totalCount}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.articlesFound.length > 0 ? (
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="flex flex-wrap gap-2">
                      {result.articlesFound.map((article, idx) => (
                        <Badge
                          key={`${article.fullId}-${idx}`}
                          variant="outline"
                          className="font-mono"
                        >
                          Art. {article.fullId}
                        </Badge>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nenhum artigo encontrado
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Gaps Detected */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Lacunas Detectadas
                  {result.gaps.length > 0 && (
                    <Badge variant="destructive">{result.gaps.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.gaps.length > 0 ? (
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-3">
                      {result.gaps.map((gap, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            <span className="font-medium text-sm">
                              Salto: Art. {gap.from} → Art. {gap.to}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {gap.count} artigo(s) ausente(s):
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {gap.missing.map((num) => (
                              <Badge
                                key={num}
                                variant="destructive"
                                className="font-mono text-xs"
                              >
                                {num}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">
                      Nenhuma lacuna detectada. Sequência íntegra.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Statistics */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {result.totalCount}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Artigos encontrados
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {result.minArticle || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Primeiro artigo
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {result.maxArticle || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Último artigo
                  </div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${result.hasGaps ? "text-destructive" : "text-primary"}`}>
                    {result.gaps.reduce((sum, g) => sum + g.count, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Artigos ausentes
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default NormIntegrityValidator;
