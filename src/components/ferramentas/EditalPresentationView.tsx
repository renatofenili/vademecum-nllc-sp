import { useState } from "react";
import {
  FileText, DollarSign, Scale, Calendar, Globe, Building2, Hash,
  AlertTriangle, ArrowLeft, RefreshCw, Download, Save, Quote, Users, Info,
  ChevronDown, ChevronUp, ShoppingCart, BookOpen, UserCheck, FileCheck,
  Gavel, Clock, Lightbulb, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ── Types ── */
interface ItemLote {
  numero: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
  valor_total: string;
}

interface ResumoEstruturado {
  visao_geral: string;
  quem_pode_participar: string;
  documentos_necessarios: string;
  como_funciona_disputa: string;
  prazos_importantes: string;
  dicas_praticas: string;
}

interface ComplexidadeEixo {
  eixo: string;
  score: number;
  justificativa: string;
}

interface MapaMentalRamo {
  titulo: string;
  itens: string[];
}

interface MapaMental {
  centro: string;
  ramos: MapaMentalRamo[];
}

export interface EditalAnalysisResult {
  numero_edital: string;
  numero_edital_fonte: string;
  orgao: string;
  orgao_fonte: string;
  objeto: string;
  objeto_fonte: string;
  modalidade: string;
  modalidade_fonte: string;
  valor_estimado: string;
  valor_estimado_fonte: string;
  criterio_julgamento: string;
  criterio_julgamento_fonte: string;
  data_sessao: string;
  data_sessao_fonte: string;
  plataforma: string;
  plataforma_fonte: string;
  participacao: string;
  participacao_fonte: string;
  itens?: ItemLote[];
  resumo_linguagem_simples: string | ResumoEstruturado;
  pontos_atencao: Array<{ ponto: string; trecho_fonte: string }>;
  complexidade_score: number;
  complexidade_justificativa: string;
  complexidade_eixos?: ComplexidadeEixo[];
  complexidade_fatores: string[];
  mapa_mental?: MapaMental;
}

interface Props {
  analysis: EditalAnalysisResult;
  fileName?: string;
  onBack?: () => void;
  onNewAnalysis?: () => void;
}

/* ── Source Badge ── */
const SourceBadge = ({ fonte }: { fonte?: string }) => {
  if (!fonte || fonte === "Não localizado") return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors mt-0.5 group"
        >
          <Quote className="h-3 w-3 group-hover:scale-110 transition-transform" />
          <span className="underline underline-offset-2 decoration-dotted">Fonte</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm w-auto p-0 z-[200]" side="bottom" align="start">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Quote className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trecho do edital</span>
          </div>
          <blockquote className="text-xs leading-relaxed text-foreground/90 italic border-l-2 border-primary/30 pl-3 py-1 bg-primary/[0.03] rounded-r-md">
            "{fonte}"
          </blockquote>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Metadata field ── */
const MetaField = ({ icon: Icon, label, value, fonte }: {
  icon: React.ElementType; label: string; value: string; fonte?: string;
}) => {
  if (!value || /não identificado/i.test(value)) return null;
  return (
    <div className="flex items-start gap-2.5 p-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block">{label}</span>
        <span className="text-sm font-medium text-foreground block">{value}</span>
        <SourceBadge fonte={fonte} />
      </div>
    </div>
  );
};

/* ── Complexity helpers ── */
const getScoreStyle = (v: number) => {
  if (v <= 3) return { bg: "bg-emerald-500/10", text: "text-emerald-600", bar: "bg-emerald-500", label: "Simples" };
  if (v <= 6) return { bg: "bg-amber-500/10", text: "text-amber-600", bar: "bg-amber-500", label: "Moderado" };
  return { bg: "bg-red-500/10", text: "text-red-600", bar: "bg-red-500", label: "Complexo" };
};

/* ── Resumo section component ── */
const ResumoSection = ({ icon: Icon, title, text }: {
  icon: React.ElementType; title: string; text: string;
}) => {
  if (!text) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-foreground/85 pl-6 whitespace-pre-line">{text}</p>
    </div>
  );
};

/* ── PDF export ── */
const exportHtml = (a: EditalAnalysisResult) => {
  const resumo = typeof a.resumo_linguagem_simples === "object" ? a.resumo_linguagem_simples : null;
  const resumoStr = typeof a.resumo_linguagem_simples === "string" ? a.resumo_linguagem_simples : "";

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossiê - ${a.numero_edital}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-size:22px;color:#991b1b;border-bottom:2px solid #991b1b;padding-bottom:8px}
h2{font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;margin-top:24px;margin-bottom:4px}
h3{font-size:14px;color:#374151;margin-top:16px;margin-bottom:4px}
p{font-size:14px;line-height:1.7;margin:4px 0 16px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 16px}
th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}
th{background:#f9fafb;font-weight:600}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
</style></head><body>`;
  html += `<h1>Dossiê — ${a.numero_edital}</h1>`;
  html += `<h2>ÓRGÃO</h2><p>${a.orgao}</p>`;
  html += `<h2>OBJETO</h2><p>${a.objeto}</p>`;
  html += `<h2>VALOR ESTIMADO</h2><p>${a.valor_estimado}</p>`;
  html += `<h2>MODALIDADE</h2><p>${a.modalidade}</p>`;
  html += `<h2>SESSÃO PÚBLICA</h2><p>${a.data_sessao}</p>`;

  if (a.itens && a.itens.length > 0) {
    html += `<h2>ITENS DISPUTADOS (${a.itens.length})</h2>`;
    html += `<table><tr><th>#</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Unit.</th><th>Total</th></tr>`;
    a.itens.forEach(it => {
      html += `<tr><td>${it.numero}</td><td>${it.descricao}</td><td>${it.quantidade}</td><td>${it.unidade}</td><td>${it.valor_unitario}</td><td>${it.valor_total}</td></tr>`;
    });
    html += `</table>`;
  }

  if (resumo) {
    html += `<h2>EM LINGUAGEM SIMPLES</h2>`;
    html += `<h3>Visão Geral</h3><p>${resumo.visao_geral}</p>`;
    html += `<h3>Quem Pode Participar</h3><p>${resumo.quem_pode_participar}</p>`;
    html += `<h3>Documentos Necessários</h3><p>${resumo.documentos_necessarios}</p>`;
    html += `<h3>Como Funciona a Disputa</h3><p>${resumo.como_funciona_disputa}</p>`;
    html += `<h3>Prazos Importantes</h3><p>${resumo.prazos_importantes}</p>`;
    html += `<h3>Dicas Práticas</h3><p>${resumo.dicas_praticas}</p>`;
  } else if (resumoStr) {
    html += `<h2>EM LINGUAGEM SIMPLES</h2><div style="white-space:pre-line;font-size:14px;line-height:1.8">${resumoStr}</div>`;
  }

  html += `<h2>PONTOS DE ATENÇÃO</h2><ul>`;
  a.pontos_atencao.forEach(p => { html += `<li style="margin-bottom:8px">${p.ponto}</li>`; });
  html += `</ul>`;
  html += `<h2>COMPLEXIDADE: ${a.complexidade_score}/10</h2><p>${a.complexidade_justificativa}</p>`;

  html += `<div style="margin-top:32px;padding:16px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;font-size:12px;color:#92400e;line-height:1.6">
    <strong>⚠ VERSÃO BETA</strong><br>
    Este dossiê foi gerado automaticamente por inteligência artificial e tem caráter meramente informativo.
    <strong>Não substitui a análise jurídica própria nem o exame completo do edital.</strong>
    Recomenda-se sempre a leitura integral do instrumento convocatório e a consulta a profissional habilitado.
  </div>`;

  html += `<div class="footer">Gerado por Vade Mecum em Licitações — ${new Date().toLocaleDateString("pt-BR")}</div></body></html>`;

  return html;
};

const handlePrint = (a: EditalAnalysisResult) => {
  const html = exportHtml(a);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) w.onload = () => setTimeout(() => w.print(), 500);
};

const handleSave = (a: EditalAnalysisResult) => {
  const html = exportHtml(a);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dossie-${a.numero_edital?.replace(/[^a-zA-Z0-9]/g, "-") || "edital"}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
const EditalPresentationView = ({ analysis, fileName, onBack, onNewAnalysis }: Props) => {
  const [showAllPontos, setShowAllPontos] = useState(false);
  const [showAllItens, setShowAllItens] = useState(false);
  const score = analysis.complexidade_score ?? 5;
  const scoreStyle = getScoreStyle(score);

  const pontos = analysis.pontos_atencao || [];
  const visiblePontos = showAllPontos ? pontos : pontos.slice(0, 4);

  const itens = analysis.itens || [];
  const visibleItens = showAllItens ? itens : itens.slice(0, 5);

  // Handle both string (legacy) and object (new) format
  const resumo = typeof analysis.resumo_linguagem_simples === "object"
    ? analysis.resumo_linguagem_simples as ResumoEstruturado
    : null;
  const resumoStr = typeof analysis.resumo_linguagem_simples === "string"
    ? analysis.resumo_linguagem_simples
    : "";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <span className="text-sm font-semibold text-foreground">Dossiê do Edital</span>
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave(analysis)} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Gerar PDF
          </Button>
          {onNewAnalysis && (
            <Button variant="outline" size="sm" onClick={onNewAnalysis} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Nova análise
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

          {/* ━━━ 1. METADADOS ━━━ */}
          <section>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h1 className="text-lg font-bold text-foreground">{analysis.numero_edital || "Edital"}</h1>
                {analysis.orgao && !/não identificado/i.test(analysis.orgao) && (
                  <p className="text-sm text-muted-foreground">{analysis.orgao}</p>
                )}
                <SourceBadge fonte={analysis.orgao_fonte} />
              </div>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-border ${scoreStyle.bg}`}>
                <div className="text-center">
                  <span className={`text-2xl font-extrabold ${scoreStyle.text}`}>{score}</span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${scoreStyle.text}`}>{scoreStyle.label}</span>
                  <span className="text-[10px] text-muted-foreground block">Complexidade</span>
                </div>
              </div>
            </div>

            {analysis.objeto && !/não identificado/i.test(analysis.objeto) && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground leading-relaxed">{analysis.objeto}</p>
                <SourceBadge fonte={analysis.objeto_fonte} />
              </div>
            )}

            <Separator className="my-4" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
              <MetaField icon={Scale} label="Modalidade" value={analysis.modalidade} fonte={analysis.modalidade_fonte} />
              <MetaField icon={DollarSign} label="Valor Estimado" value={analysis.valor_estimado} fonte={analysis.valor_estimado_fonte} />
              <MetaField icon={Calendar} label="Sessão Pública" value={analysis.data_sessao} fonte={analysis.data_sessao_fonte} />
              <MetaField icon={FileText} label="Critério" value={analysis.criterio_julgamento} fonte={analysis.criterio_julgamento_fonte} />
              <MetaField icon={Globe} label="Plataforma" value={analysis.plataforma} fonte={analysis.plataforma_fonte} />
              <MetaField icon={Users} label="Participação" value={analysis.participacao} fonte={analysis.participacao_fonte} />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Info className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Clique em "Fonte" para ver o trecho exato do edital. Não substitui análise jurídica profissional.
              </span>
            </div>
          </section>

          {/* ━━━ 2. LINGUAGEM SIMPLES ━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Edital em Linguagem Simples
            </h2>
            <Card className="border-border/60">
              <CardContent className="p-6 space-y-6">
                {resumo ? (
                  <>
                    <ResumoSection icon={BookOpen} title="Visão Geral" text={resumo.visao_geral} />
                    <Separator />
                    <ResumoSection icon={UserCheck} title="Quem Pode Participar" text={resumo.quem_pode_participar} />
                    <Separator />
                    <ResumoSection icon={FileCheck} title="Documentos Necessários" text={resumo.documentos_necessarios} />
                    <Separator />
                    <ResumoSection icon={Gavel} title="Como Funciona a Disputa" text={resumo.como_funciona_disputa} />
                    <Separator />
                    <ResumoSection icon={Clock} title="Prazos Importantes" text={resumo.prazos_importantes} />
                    <Separator />
                    <ResumoSection icon={Lightbulb} title="Dicas Práticas" text={resumo.dicas_praticas} />
                  </>
                ) : (
                  <div className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                    {resumoStr || "Resumo não disponível."}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ━━━ 3. ITENS DISPUTADOS ━━━ */}
          {itens.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-4 w-4 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Itens Disputados ({itens.length})
                </h2>
              </div>
              <Card className="border-border/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20">#</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descrição</th>
                        <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-16">Qtd</th>
                        <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-14">Un</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-28">Unit.</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItens.map((item, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-medium text-primary">{item.numero}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground leading-snug">{item.descricao}</td>
                          <td className="px-3 py-2.5 text-xs text-center text-foreground/80">{item.quantidade}</td>
                          <td className="px-3 py-2.5 text-xs text-center text-foreground/80">{item.unidade}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-foreground/80">{item.valor_unitario}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-medium text-foreground">{item.valor_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              {itens.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-muted-foreground gap-1"
                  onClick={() => setShowAllItens(!showAllItens)}
                >
                  {showAllItens ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAllItens ? "Mostrar menos" : `Ver todos os ${itens.length} itens`}
                </Button>
              )}
            </section>
          )}

          {/* ━━━ 4. PONTOS DE ATENÇÃO ━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Pontos de Atenção
            </h2>
            <div className="space-y-3">
              {visiblePontos.map((p, i) => (
                <Card key={i} className="border-border/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground leading-relaxed">{p.ponto}</p>
                      <SourceBadge fonte={p.trecho_fonte} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {pontos.length > 4 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-muted-foreground gap-1"
                onClick={() => setShowAllPontos(!showAllPontos)}
              >
                {showAllPontos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showAllPontos ? "Mostrar menos" : `Mostrar todos (${pontos.length})`}
              </Button>
            )}
          </section>

          {/* ━━━ 5. MAPA MENTAL ━━━ */}
          {analysis.mapa_mental && analysis.mapa_mental.ramos?.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Mapa Mental do Edital
              </h2>
              <Card className="border-border/60">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center">
                    {/* Centro */}
                    <div className="bg-primary text-primary-foreground rounded-xl px-5 py-3 text-sm font-bold text-center max-w-[250px] shadow-md">
                      {analysis.mapa_mental.centro}
                    </div>
                    {/* Ramos */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 w-full">
                      {analysis.mapa_mental.ramos.map((ramo, i) => {
                        const colors = [
                          "border-l-primary bg-primary/5",
                          "border-l-amber-500 bg-amber-500/5",
                          "border-l-emerald-500 bg-emerald-500/5",
                          "border-l-violet-500 bg-violet-500/5",
                          "border-l-rose-500 bg-rose-500/5",
                          "border-l-sky-500 bg-sky-500/5",
                        ];
                        return (
                          <div key={i} className={`border-l-4 rounded-lg p-3 ${colors[i % colors.length]}`}>
                            <span className="text-xs font-bold text-foreground block mb-1.5">{ramo.titulo}</span>
                            <ul className="space-y-1">
                              {ramo.itens.map((item, j) => (
                                <li key={j} className="text-[11px] text-foreground/75 flex items-start gap-1.5">
                                  <span className="text-muted-foreground shrink-0 mt-px">›</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* ━━━ 6. COMPLEXIDADE ━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Análise de Complexidade
            </h2>
            <Card className="border-border/60">
              <CardContent className="p-6 space-y-5">
                {/* Score geral */}
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-16 h-16 rounded-xl ${scoreStyle.bg}`}>
                    <span className={`text-2xl font-extrabold ${scoreStyle.text}`}>{score}</span>
                  </div>
                  <div className="flex-1">
                    <Badge variant="outline" className={`${scoreStyle.text} border-transparent ${scoreStyle.bg} mb-1`}>
                      {scoreStyle.label}
                    </Badge>
                    <p className="text-sm text-foreground">{analysis.complexidade_justificativa}</p>
                  </div>
                </div>

                {/* Barras por eixo */}
                {analysis.complexidade_eixos && analysis.complexidade_eixos.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Complexidade por eixo</span>
                    {analysis.complexidade_eixos.map((eixo, i) => {
                      const eixoStyle = getScoreStyle(eixo.score);
                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-foreground">{eixo.eixo}</span>
                            <span className={`text-xs font-bold ${eixoStyle.text}`}>{eixo.score}/10</span>
                          </div>
                          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${eixoStyle.bar} transition-all duration-700`}
                              style={{ width: `${(eixo.score / 10) * 100}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {eixo.justificativa}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Fatores */}
                {analysis.complexidade_fatores && analysis.complexidade_fatores.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fatores</span>
                    <ul className="mt-1.5 space-y-1">
                      {analysis.complexidade_fatores.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                          <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-2 border-t border-border bg-card shrink-0 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">
          Dossiê gerado por extração textual automatizada — não substitui análise jurídica profissional
        </span>
      </div>
    </div>
  );
};

export default EditalPresentationView;
