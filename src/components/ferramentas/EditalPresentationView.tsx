import { useState, useEffect, useCallback } from "react";
import { X, RotateCcw, ChevronDown, ChevronUp, FileText, DollarSign, Scale, Calendar, Shield, Globe, Building2, Hash, Clipboard, MessageSquare, TableProperties, Download, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { EditalAnalysis } from "./EditalAnalyzer";

interface Props {
  analysis: EditalAnalysis;
  onClose: () => void;
}

interface FlowNode {
  id: string;
  label: string;
  value: string;
  fullValue: string;
  icon: React.ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  expandable: boolean;
  extraContent?: unknown;
}

interface FlowArrow {
  from: string;
  to: string;
}

const truncate = (s: string | undefined, max: number) => {
  if (!s) return "Não identificado";
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const buildNodes = (a: EditalAnalysis): FlowNode[] => [
  { id: "edital", label: "Edital", value: a.numero_edital || "Edital", fullValue: a.numero_edital || "Edital", icon: Hash, x: 50, y: 4, w: 16, h: 0, expandable: false },
  { id: "modalidade", label: "Modalidade", value: truncate(a.modalidade, 25), fullValue: a.modalidade || "Não identificado", icon: Clipboard, x: 25, y: 18, w: 18, h: 0, expandable: false },
  { id: "orgao", label: "Órgão", value: truncate(a.orgao, 30), fullValue: a.orgao || "Não identificado", icon: Building2, x: 75, y: 18, w: 22, h: 0, expandable: true },
  { id: "objeto", label: "Objeto", value: truncate(a.objeto, 55), fullValue: a.objeto || "Não identificado", icon: FileText, x: 50, y: 32, w: 44, h: 0, expandable: true },
  { id: "criterio", label: "Critério", value: truncate(a.criterio_julgamento, 22), fullValue: a.criterio_julgamento || "Não identificado", icon: Scale, x: 17, y: 47, w: 18, h: 0, expandable: true },
  { id: "sessao", label: "Sessão Pública", value: truncate(a.data_sessao, 25), fullValue: a.data_sessao || "Não identificado", icon: Calendar, x: 50, y: 47, w: 18, h: 0, expandable: false },
  { id: "valor", label: "Valor Estimado", value: truncate(a.valor_estimado, 20), fullValue: a.valor_estimado || "Não informado", icon: DollarSign, x: 83, y: 47, w: 18, h: 0, expandable: true, extraContent: a.planilha_estimada },
  { id: "habilitacao", label: "Habilitação", value: truncate(a.condicoes_habilitacao, 30), fullValue: a.condicoes_habilitacao || "Não identificado", icon: Shield, x: 22, y: 62, w: 24, h: 0, expandable: true },
  { id: "sistema", label: "Onde Licitar", value: truncate(a.sistema_licitacao, 30), fullValue: a.sistema_licitacao || "Não identificado", icon: Globe, x: 75, y: 62, w: 22, h: 0, expandable: false },
  { id: "resumo", label: "Em Linguagem Simples", value: truncate(a.resumo_simples, 70), fullValue: a.resumo_simples || "Não identificado", icon: MessageSquare, x: 50, y: 80, w: 54, h: 0, expandable: true },
];

const arrowDefs: FlowArrow[] = [
  { from: "edital", to: "modalidade" },
  { from: "edital", to: "orgao" },
  { from: "modalidade", to: "objeto" },
  { from: "orgao", to: "objeto" },
  { from: "objeto", to: "criterio" },
  { from: "objeto", to: "sessao" },
  { from: "objeto", to: "valor" },
  { from: "criterio", to: "habilitacao" },
  { from: "sessao", to: "sistema" },
  { from: "valor", to: "sistema" },
  { from: "habilitacao", to: "resumo" },
  { from: "sistema", to: "resumo" },
];

const STAGGER_MS = 350;

// ── Complexity Score ──
const ComplexityScore = ({ analysis }: { analysis: EditalAnalysis }) => {
  const [showMethodology, setShowMethodology] = useState(false);
  const score = analysis.score_complexidade?.valor ?? 5;
  const justificativa = analysis.score_complexidade?.justificativa ?? "Score calculado com base na análise geral do edital.";

  const getColor = (v: number) => {
    if (v <= 3) return { stroke: "#22c55e", glow: "rgba(34,197,94,0.25)", label: "Baixa", textClass: "text-emerald-500" };
    if (v <= 6) return { stroke: "#f59e0b", glow: "rgba(245,158,11,0.25)", label: "Média", textClass: "text-amber-500" };
    return { stroke: "#ef4444", glow: "rgba(239,68,68,0.25)", label: "Alta", textClass: "text-red-500" };
  };
  const c = getColor(score);

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 10) * circumference;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMethodology(!showMethodology)}
        className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card border border-border/80 shadow-md hover:shadow-lg transition-all cursor-pointer group"
        title="Clique para ver a metodologia"
      >
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} stroke="hsl(var(--muted))" strokeWidth="4" fill="none" />
            <circle
              cx="32" cy="32" r={radius}
              stroke={c.stroke}
              strokeWidth="4.5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
                filter: `drop-shadow(0 0 6px ${c.glow})`,
              }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-base font-extrabold text-foreground">
            {score}
          </span>
        </div>
        <div className="text-left">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Complexidade</div>
          <div className={`text-sm font-bold ${c.textClass}`}>{c.label}</div>
          <div className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors flex items-center gap-0.5">
            <Info className="h-2.5 w-2.5" />
            Ver metodologia
          </div>
        </div>
      </button>

      {showMethodology && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMethodology(false)} />
          <div className="absolute top-full mt-2 right-0 w-80 bg-card border border-border rounded-xl shadow-2xl p-5 z-50 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                <Info className="h-3 w-3 text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Metodologia do Score</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground mb-4">{justificativa}</p>
            <Separator className="mb-3" />
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                ⚠️ Este score é calculado automaticamente por análise textual do edital (sem IA).
                Fatores considerados: extensão do documento, valor estimado, exigências de habilitação,
                complexidade do objeto, garantias, subcontratação e especificidades técnicas.
                <strong className="block mt-1.5 text-foreground/80">Não substitui análise jurídica profissional.</strong>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Timeline ──
const TimelineBar = ({ analysis }: { analysis: EditalAnalysis }) => {
  const t = analysis.timeline;
  if (!t) return null;

  const steps = [
    { label: "Publicação", value: t.data_publicacao, icon: FileText },
    { label: "Impugnação", value: t.prazo_impugnacao, icon: Shield, sublabel: "Prazo limite" },
    { label: "Esclarecimento", value: t.prazo_esclarecimento, icon: MessageSquare, sublabel: "Prazo limite" },
    { label: "Abertura", value: t.data_abertura, icon: Calendar },
  ].filter(s => s.value);

  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-0 justify-center w-full px-6">
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center px-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                {step.label}
              </span>
              <span className="text-[11px] font-medium text-foreground">
                {step.value}
              </span>
              {step.sublabel && (
                <span className="text-[9px] text-muted-foreground">{step.sublabel}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className="w-12 h-px bg-primary/20 relative -mt-6">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-transparent border-l-primary/30" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── PDF Export ──
const exportPdf = (analysis: EditalAnalysis) => {
  const sections = [
    { title: "EDITAL", value: analysis.numero_edital },
    { title: "MODALIDADE", value: analysis.modalidade },
    { title: "ÓRGÃO", value: analysis.orgao },
    { title: "OBJETO", value: analysis.objeto },
    { title: "VALOR ESTIMADO", value: analysis.valor_estimado },
    { title: "CRITÉRIO DE JULGAMENTO", value: analysis.criterio_julgamento },
    { title: "DATA DA SESSÃO", value: analysis.data_sessao },
    { title: "CONDIÇÕES DE HABILITAÇÃO", value: analysis.condicoes_habilitacao },
    { title: "ONDE LICITAR", value: analysis.sistema_licitacao },
  ];

  const score = analysis.score_complexidade;
  const timeline = analysis.timeline;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Análise - ${analysis.numero_edital || "Edital"}</title>
<style>
  @media print { @page { margin: 20mm; } }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
  h1 { font-size: 20px; color: #b91c1c; border-bottom: 2px solid #b91c1c; padding-bottom: 8px; }
  h2 { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 2px; margin-top: 24px; margin-bottom: 4px; }
  p { font-size: 14px; line-height: 1.7; margin: 4px 0 16px; }
  .score { display: inline-block; background: #f3f4f6; padding: 8px 16px; border-radius: 8px; margin: 8px 0; font-weight: 600; }
  .timeline { display: flex; gap: 20px; margin: 12px 0 24px; flex-wrap: wrap; }
  .timeline-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 16px; text-align: center; }
  .timeline-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; font-weight: 600; }
  .timeline-value { font-size: 13px; font-weight: 600; color: #1a1a1a; margin-top: 2px; }
  .resumo { background: #fef2f2; border-left: 3px solid #b91c1c; padding: 16px; border-radius: 0 8px 8px 0; margin-top: 8px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head><body>`;

  html += `<h1>📋 Análise de Edital</h1>`;

  if (score) {
    const label = score.valor <= 3 ? "Baixa" : score.valor <= 6 ? "Média" : "Alta";
    html += `<div class="score">Complexidade: ${score.valor}/10 — ${label}</div>`;
    html += `<p style="font-size:12px;color:#6b7280;">${score.justificativa}</p>`;
  }

  if (timeline) {
    const items = [
      { label: "Publicação", value: timeline.data_publicacao },
      { label: "Impugnação", value: timeline.prazo_impugnacao },
      { label: "Esclarecimento", value: timeline.prazo_esclarecimento },
      { label: "Abertura", value: timeline.data_abertura },
    ].filter(i => i.value);
    if (items.length > 0) {
      html += `<h2>📅 Cronograma</h2><div class="timeline">`;
      items.forEach(i => {
        html += `<div class="timeline-item"><div class="timeline-label">${i.label}</div><div class="timeline-value">${i.value}</div></div>`;
      });
      html += `</div>`;
    }
  }

  sections.forEach(s => {
    html += `<h2>${s.title}</h2><p>${s.value || "Não identificado"}</p>`;
  });

  html += `<h2>📝 EM LINGUAGEM SIMPLES</h2><div class="resumo"><p>${(analysis.resumo_simples || "").replace(/\n/g, "</p><p>")}</p></div>`;

  html += `<div class="footer">Gerado por Vade Mecum em Licitações — ${new Date().toLocaleDateString("pt-BR")}</div>`;
  html += `</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.onload = () => {
      setTimeout(() => { w.print(); }, 500);
    };
  }
};

// ── Main ──
const EditalPresentationView = ({ analysis, onClose }: Props) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const nodes = buildNodes(analysis);

  const start = useCallback(() => {
    setVisibleCount(0);
    setExpandedNode(null);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    if (visibleCount >= nodes.length) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), STAGGER_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, visibleCount, nodes.length]);

  useEffect(() => {
    const t = setTimeout(() => start(), 300);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedNode) setExpandedNode(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, expandedNode]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visibleNodeIds = new Set(nodes.slice(0, visibleCount).map((n) => n.id));
  const visibleArrows = arrowDefs.filter(
    (a) => visibleNodeIds.has(a.from) && visibleNodeIds.has(a.to)
  );

  const allVisible = visibleCount >= nodes.length && !isPlaying;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-primary-foreground bg-primary">
            V
          </div>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Mapa do Edital
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allVisible && <ComplexityScore analysis={analysis} />}
          {allVisible && (
            <Button variant="outline" size="sm" onClick={() => exportPdf(analysis)} className="gap-1.5 text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          )}
          {!isPlaying && visibleCount >= nodes.length && (
            <Button variant="ghost" size="sm" onClick={start} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Replay
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(var(--muted) / 0.5), hsl(var(--background)), hsl(var(--muted) / 0.3))" }}>
        {/* Subtle grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
          <pattern id="cleanGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--foreground))" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#cleanGrid)" />
        </svg>

        {/* SVG arrows */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
          {visibleArrows.map((arrow) => {
            const from = nodeMap.get(arrow.from)!;
            const to = nodeMap.get(arrow.to)!;
            return <FlowArrowSVG key={`${arrow.from}-${arrow.to}`} from={from} to={to} />;
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node, i) => (
          <FlowNodeEl
            key={node.id}
            node={node}
            visible={i < visibleCount}
            onExpand={() => node.expandable && setExpandedNode(node.id)}
          />
        ))}

        {/* Expanded overlay */}
        {expandedNode && (
          <ExpandedCard
            node={nodes.find((n) => n.id === expandedNode)!}
            onClose={() => setExpandedNode(null)}
          />
        )}
      </div>

      {/* Bottom timeline */}
      {allVisible && analysis.timeline && (
        <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-center">
          <div className="flex items-center gap-2 mr-4">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cronograma</span>
          </div>
          <TimelineBar analysis={analysis} />
        </div>
      )}
    </div>
  );
};

// ── FlowNodeEl ──
const FlowNodeEl = ({
  node,
  visible,
  onExpand,
}: {
  node: FlowNode;
  visible: boolean;
  onExpand: () => void;
}) => {
  const Icon = node.icon;

  return (
    <div
      style={{
        position: "absolute",
        left: `${node.x - node.w / 2}%`,
        top: `${node.y}%`,
        width: `${node.w}%`,
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: visible ? "scale(1) translateY(-50%)" : "scale(0.5) translateY(-50%)",
        opacity: visible ? 1 : 0,
        zIndex: 10,
        cursor: node.expandable ? "pointer" : "default",
      }}
      onClick={node.expandable ? onExpand : undefined}
    >
      <Card className={`transition-shadow duration-200 ${
        node.id === "resumo"
          ? "shadow-lg border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10"
          : "shadow-md border-border/60 bg-card ring-1 ring-black/[0.04]"
      } ${node.expandable ? "hover:shadow-xl hover:border-primary/40 hover:ring-primary/10 group" : ""}`}>
        <CardContent className={`px-3 py-2 flex flex-col items-center justify-center gap-0.5 ${node.id === "resumo" ? "py-3" : ""}`}>
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-primary" />
            <span className={`font-semibold uppercase tracking-wider ${node.id === "resumo" ? "text-[11px] text-primary" : "text-[10px] text-muted-foreground"}`}>
              {node.label}
            </span>
          </div>
          <p
            className="text-center text-foreground overflow-hidden text-ellipsis"
            style={{
              fontSize: node.id === "resumo" ? "12px" : "11px",
              fontWeight: node.id === "edital" ? 700 : 500,
              maxWidth: "95%",
              display: "-webkit-box",
              WebkitLineClamp: node.id === "resumo" ? 3 : 1,
              WebkitBoxOrient: "vertical",
              lineHeight: "1.4",
            }}
          >
            {node.value}
          </p>
          {node.expandable && (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ── ExpandedCard ──
const ExpandedCard = ({ node, onClose }: { node: FlowNode; onClose: () => void }) => {
  const Icon = node.icon;
  const hasPlanilha = node.id === "valor" && node.extraContent && node.extraContent !== "Não disponível no edital";

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />
      <div
        className="absolute z-50 animate-scale-in"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(95%, 900px)",
          maxHeight: "75vh",
        }}
      >
        <Card className="border-primary/20 shadow-xl">
          <CardContent className="p-6 overflow-y-auto" style={{ maxHeight: "75vh" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {node.label}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-muted-foreground">
                <ChevronUp className="h-3.5 w-3.5" />
                Fechar
              </Button>
            </div>

            {node.id === "habilitacao" && node.fullValue ? (
              <ul className="list-disc list-inside space-y-1.5 text-sm leading-relaxed text-foreground">
                {node.fullValue.split(/[;.\n]/).map((item: string) => item.trim()).filter(Boolean).map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : node.id === "resumo" && node.fullValue ? (
              <div className="space-y-8">
                {node.fullValue.split(/\n\n---\n\n/).map((section: string, si: number) => {
                  const lines = section.split('\n');
                  const title = lines[0]?.trim();
                  const body = lines.slice(1).join('\n').trim();
                  const isHeader = /^[📋💰🖥️📑📅📝🚨✅🏢⚡🤝🔄🌱🔎🏆🚫📌]/.test(title);

                  return (
                    <div key={si}>
                      {si > 0 && <Separator className="mb-6" />}
                      {isHeader && (
                        <h4 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                          <span className="text-lg">{title.match(/^./u)?.[0]}</span>
                          <span>{title.replace(/^.\s*/, '')}</span>
                        </h4>
                      )}
                      <div className="text-sm leading-[1.85] text-foreground space-y-3">
                        {(isHeader ? body : section).split('\n\n').map((para: string, pi: number) => {
                          // Blockquotes (> "...")
                          if (para.trim().startsWith('>')) {
                            return (
                              <blockquote key={pi} className="border-l-3 border-primary/30 pl-4 py-2 bg-primary/[0.03] rounded-r-lg italic text-foreground/90">
                                {para.replace(/^>\s*/, '').replace(/^"/, '').replace(/"$/, '')}
                              </blockquote>
                            );
                          }
                          // Numbered lists
                          if (/^\d+\.\s/.test(para.trim())) {
                            return (
                              <ol key={pi} className="space-y-3 pl-1">
                                {para.split('\n').filter(Boolean).map((item: string, ii: number) => (
                                  <li key={ii} className="flex gap-3 text-sm">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                                      {item.match(/^(\d+)\./)?.[1]}
                                    </span>
                                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: formatBold(item.replace(/^\d+\.\s*/, '')) }} />
                                  </li>
                                ))}
                              </ol>
                            );
                          }
                          // Bullet lists
                          if (/^[•⚡🤝🔗🔄🌱📋📌📰⚠️❓🏁⏱️🚫🔒📍⏰💳📈📐🧪💻🏗️📜🏦🔧📊💡📝]/.test(para.trim())) {
                            return (
                              <ul key={pi} className="space-y-3 pl-1">
                                {para.split('\n').filter(Boolean).map((item: string, ii: number) => (
                                  <li key={ii} className="flex gap-3 text-sm">
                                    <span className="shrink-0 text-base mt-0.5">{item.match(/^[^\s]*/u)?.[0]?.replace(/\*\*/g, '') || '•'}</span>
                                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: formatBold(item.replace(/^[^\s]*\s*/, '')) }} />
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          // Regular paragraph with bold support
                          return <p key={pi} className="whitespace-pre-line" dangerouslySetInnerHTML={{ __html: formatBold(para) }} />;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                {node.fullValue}
              </p>
            )}

            {hasPlanilha && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <TableProperties className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Planilha Estimativa
                  </h4>
                </div>
                {Array.isArray(node.extraContent) && typeof node.extraContent[0] === "object" ? (
                  <div className="rounded-lg border border-border">
                    <table className="w-full text-xs table-fixed">
                      <thead>
                        <tr className="bg-muted">
                          {Object.keys(node.extraContent[0] as Record<string, unknown>).map((h) => (
                            <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                              {h.replace(/_/g, " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(node.extraContent as Array<Record<string, unknown>>).map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-2 py-2 text-foreground text-[11px] break-words">{String(v ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed text-foreground whitespace-pre-line bg-muted/50 rounded-lg p-4 border border-border">
                    {typeof node.extraContent === "string" ? node.extraContent : JSON.stringify(node.extraContent, null, 2)}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

// ── FlowArrowSVG ──
const FlowArrowSVG = ({ from, to }: { from: FlowNode; to: FlowNode }) => {
  const x1 = from.x;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y - to.h / 2;
  const midY = (y1 + y2) / 2;

  const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--primary) / 0.2)"
        strokeWidth="0.2"
        style={{
          strokeDasharray: 200,
          animation: "drawLine 0.8s ease-out forwards",
        }}
      />
      <circle cx={x2} cy={y2} r="0.4" fill="hsl(var(--primary))" opacity={0.3} />
    </svg>
  );
};

// Inject keyframe
if (typeof document !== "undefined" && !document.querySelector("[data-flow-anim]")) {
  const s = document.createElement("style");
  s.setAttribute("data-flow-anim", "true");
  s.textContent = `@keyframes drawLine { from { stroke-dashoffset: 200; } to { stroke-dashoffset: 0; } }`;
  document.head.appendChild(s);
}

export default EditalPresentationView;
