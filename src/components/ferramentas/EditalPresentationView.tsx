import { useState, useMemo, useCallback } from "react";
import {
  X, Download, ChevronDown, ChevronUp, FileText, DollarSign, Scale,
  Calendar, Shield, Globe, Building2, Hash, Info, AlertTriangle,
  CheckCircle2, Ban, Wallet, ListChecks, Eye, Users, FileCheck,
  Gavel, ScrollText, ClipboardList, BarChart3, Zap, ArrowLeft, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditalAnalysis } from "./EditalAnalyzer";

interface Props {
  analysis: EditalAnalysis;
  fileName?: string;
  onBack?: () => void;
  onClose?: () => void;
  onNewAnalysis?: () => void;
}
/* ────────────────────────────────────────────
   Bullet formatter – normalizes inline markers
   into real multi-line bullet text
   ──────────────────────────────────────────── */
const bulletLineStart = /^(?:•|✅|⚠️|❌|📌|🔒|💳|📈|🏗️|📜|🏦|🔧|📊|📝|⚡|🤝|🔄|🌱|🔎|🏆|🚫|📍|⏰|📐|🧪|💻|💡|📋|📦|🖥️|📑|📅|🚨|🎯|🏁|❓|⏱️|🔗)/;

const formatBulletLines = (text: string, maxLines?: number) => {
  if (!text) return "";

  const normalized = text
    .replace(/\s*([□☐■◻◾▪▸►●◦•])\s*/g, "\n• ")
    .replace(/\s*;\s*/g, "\n• ")
    .replace(/\s*[–—]\s+/g, "\n• ")
    .replace(/\s*\d+[\)\.]\s+/g, "\n• ")
    .replace(/\s*(✅|⚠️|❌|📌|🔒|💳|📈|🏗️|📜|🏦|🔧|📊|📝|⚡|🤝|🔄|🌱|🔎|🏆|🚫|📍|⏰|📐|🧪|💻|💡|📋|📦|🖥️|📑|📅|🚨|🎯|🏁|❓|⏱️|🔗)\s*/g, "\n$1 ")
    .replace(/\s*\n+\s*/g, "\n")
    .trim();

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return text;

  const bulletLines = lines.map((line) => (bulletLineStart.test(line) ? line : `• ${line}`));
  if (!maxLines || bulletLines.length <= maxLines) return bulletLines.join("\n");
  return `${bulletLines.slice(0, maxLines).join("\n")}\n…`;
};

const renderWithBullets = (text: string, maxLines?: number) => (
  <div className="whitespace-pre-line">{formatBulletLines(text, maxLines)}</div>
);

/* ────────────────────────────────────────────
   Section parser – extracts numbered sections
   from the resumo_simples text
   ──────────────────────────────────────────── */
interface ParsedSection {
  number: number;
  title: string;
  body: string;
}

const parseSections = (resumo: string): ParsedSection[] => {
  if (!resumo) return [];
  const sections: ParsedSection[] = [];

  // Split by --- separators first, then by numbered headers
  const rawBlocks = resumo.split(/\n\n---\n\n|\n---\n/);

  for (const block of rawBlocks) {
    const headerMatch = block.match(/^[^\n]*?(\d+)\.\s+(.+?)(?:\n|$)/);
    if (headerMatch) {
      const num = parseInt(headerMatch[1]);
      const title = headerMatch[2].replace(/\*\*/g, "").trim();
      const body = block.slice(headerMatch[0].length).trim();
      sections.push({ number: num, title, body });
    } else if (block.trim()) {
      // Fallback: unnumbered block
      const firstLine = block.split("\n")[0]?.trim() || "";
      sections.push({ number: 0, title: firstLine, body: block.trim() });
    }
  }
  return sections;
};

const getSectionByKeyword = (sections: ParsedSection[], ...keywords: string[]): ParsedSection | undefined =>
  sections.find((s) =>
    keywords.some((kw) => s.title.toLowerCase().includes(kw.toLowerCase()))
  );

const getSectionBody = (sections: ParsedSection[], ...keywords: string[]): string =>
  getSectionByKeyword(sections, ...keywords)?.body || "";

/* ────────────────────────────────────────────
   Formatting helpers
   ──────────────────────────────────────────── */
const formatBold = (text: string): string =>
  text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');

const stripEmoji = (text: string): string =>
  text.replace(/^[^\w\s]*\s*/, "").trim();

/* ────────────────────────────────────────────
   Complexity per-axis derivation
   ──────────────────────────────────────────── */
interface AxisScore {
  label: string;
  score: number;
  justification: string;
  icon: React.ElementType;
}

const deriveAxes = (analysis: EditalAnalysis, sections: ParsedSection[]): AxisScore[] => {
  const base = analysis.score_complexidade?.valor ?? 5;
  const resumo = analysis.resumo_simples?.toLowerCase() || "";
  const habBody = getSectionBody(sections, "habilitação", "habilitacao").toLowerCase();
  const riskBody = getSectionBody(sections, "risco").toLowerCase();
  const propBody = getSectionBody(sections, "proposta").toLowerCase();
  const execBody = getSectionBody(sections, "execução", "execucao", "impacto").toLowerCase();
  const prazoBody = getSectionBody(sections, "prazo").toLowerCase();

  const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));

  return [
    {
      label: "Objeto e especificação",
      icon: FileText,
      score: clamp(base + (resumo.includes("amostra") ? 1 : 0) + (resumo.includes("catálogo") || resumo.includes("catalogo") ? 1 : 0) - 1),
      justification: resumo.includes("amostra") ? "Exigência de amostra eleva a complexidade do objeto." :
        resumo.includes("catálogo") ? "Exigência de catálogo ou ficha técnica." : "Objeto com especificação padrão.",
    },
    {
      label: "Habilitação",
      icon: Shield,
      score: clamp(base + (habBody.includes("técnic") ? 1 : 0) + (habBody.includes("econômico") || habBody.includes("econômic") ? 1 : 0) - 1),
      justification: habBody.includes("técnic") ? "Qualificação técnica exigida aumenta barreira." :
        "Habilitação com requisitos padrão.",
    },
    {
      label: "Proposta e julgamento",
      icon: Scale,
      score: clamp(base + (propBody.includes("marca") || propBody.includes("modelo") ? 1 : 0) - 1),
      justification: propBody.includes("marca") ? "Exigência de marca/modelo na proposta." :
        "Proposta com formatação padrão.",
    },
    {
      label: "Execução contratual",
      icon: ClipboardList,
      score: clamp(base + (execBody.includes("garantia") ? 1 : 0) - 1),
      justification: execBody.includes("garantia") ? "Garantia contratual ou de execução exigida." :
        "Execução sem complexidade adicional identificada.",
    },
    {
      label: "Procedimento e prazos",
      icon: Calendar,
      score: clamp(base + (prazoBody.includes("curto") || prazoBody.includes("imediato") ? 1 : 0) - 1),
      justification: prazoBody.includes("curto") ? "Prazos curtos exigem ação rápida." :
        "Prazos dentro da normalidade.",
    },
    {
      label: "Risco econômico-sancionatório",
      icon: AlertTriangle,
      score: clamp(base + (riskBody.includes("multa") || riskBody.includes("sanç") ? 1 : 0) + (riskBody.includes("suspens") ? 1 : 0) - 1),
      justification: riskBody.includes("multa") ? "Sanções com multas relevantes identificadas." :
        riskBody.includes("sanç") ? "Cláusulas sancionatórias presentes." : "Risco sancionatório padrão.",
    },
  ];
};

const getScoreColor = (v: number) => {
  if (v <= 2) return { bg: "bg-emerald-500/10", text: "text-emerald-600", bar: "bg-emerald-500", label: "Muito simples" };
  if (v <= 4) return { bg: "bg-emerald-500/10", text: "text-emerald-600", bar: "bg-emerald-500", label: "Simples" };
  if (v <= 6) return { bg: "bg-amber-500/10", text: "text-amber-600", bar: "bg-amber-500", label: "Moderado" };
  if (v <= 8) return { bg: "bg-red-500/10", text: "text-red-600", bar: "bg-red-500", label: "Complexo" };
  return { bg: "bg-red-500/10", text: "text-red-600", bar: "bg-red-500", label: "Muito complexo" };
};

/* ────────────────────────────────────────────
   Diagnosis card builder
   ──────────────────────────────────────────── */
interface DiagCard {
  title: string;
  icon: React.ElementType;
  content: string;
  severity: "low" | "medium" | "high";
}

const buildDiagCards = (sections: ParsedSection[], analysis: EditalAnalysis): DiagCard[] => {
  const participacao = getSectionBody(sections, "participar", "participação", "participacao");
  const eliminar = getSectionBody(sections, "eliminar", "habilitação", "habilitacao", "risco de habilitação");
  const custo = getSectionBody(sections, "custo", "impacto", "financeiro", "caixa");
  const agora = getSectionBody(sections, "fazer agora", "checklist", "antes de participar", "providência");

  const truncBody = (b: string, max = 250) => {
    if (!b) return "Informação não identificada de forma expressa no edital.";
    const clean = b.replace(/^[^\w]*/, "").trim();
    return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, "") + "…" : clean;
  };

  const scoreSeverity = (score: number): DiagCard["severity"] =>
    score <= 3 ? "low" : score <= 6 ? "medium" : "high";

  const base = analysis.score_complexidade?.valor ?? 5;

  return [
    {
      title: "Posso participar?",
      icon: Users,
      content: truncBody(participacao),
      severity: participacao.toLowerCase().includes("exclusiv") || participacao.toLowerCase().includes("restrit") ? "high" : "low",
    },
    {
      title: "O que pode me eliminar",
      icon: Ban,
      content: truncBody(eliminar),
      severity: scoreSeverity(Math.min(base + 1, 10)),
    },
    {
      title: "O que pesa no custo",
      icon: Wallet,
      content: truncBody(custo),
      severity: custo.toLowerCase().includes("garantia") || custo.toLowerCase().includes("caução") ? "high" : "medium",
    },
    {
      title: "O que preciso fazer agora",
      icon: Zap,
      content: truncBody(agora),
      severity: "medium",
    },
  ];
};

/* ────────────────────────────────────────────
   Executive reading panels
   ──────────────────────────────────────────── */
interface ExecPanel {
  title: string;
  icon: React.ElementType;
  body: string;
}

const buildExecPanels = (sections: ParsedSection[]): ExecPanel[] => [
  { title: "Visão Geral", icon: Eye, body: getSectionBody(sections, "visão geral", "visao geral") },
  { title: "Participação", icon: Users, body: getSectionBody(sections, "participar", "participação") },
  { title: "Proposta", icon: FileCheck, body: getSectionBody(sections, "proposta comercial", "proposta") },
  { title: "Habilitação", icon: Shield, body: getSectionBody(sections, "habilitação", "habilitacao") },
  { title: "Execução", icon: ClipboardList, body: getSectionBody(sections, "execução", "impacto prático", "impacto") },
  { title: "Sanções", icon: Gavel, body: getSectionBody(sections, "sanç", "risco sancion", "pontos de atenção") },
];

/* ────────────────────────────────────────────
   PDF Export
   ──────────────────────────────────────────── */
const exportPdf = (analysis: EditalAnalysis) => {
  const fields = [
    { label: "EDITAL", value: analysis.numero_edital },
    { label: "ÓRGÃO", value: analysis.orgao },
    { label: "MODALIDADE", value: analysis.modalidade },
    { label: "OBJETO", value: analysis.objeto },
    { label: "VALOR ESTIMADO", value: analysis.valor_estimado },
    { label: "CRITÉRIO", value: analysis.criterio_julgamento },
    { label: "SESSÃO", value: analysis.data_sessao },
    { label: "HABILITAÇÃO", value: analysis.condicoes_habilitacao },
    { label: "PLATAFORMA", value: analysis.sistema_licitacao },
  ];

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossiê - ${analysis.numero_edital || "Edital"}</title>
<style>@media print{@page{margin:20mm}}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-size:22px;color:#991b1b;border-bottom:2px solid #991b1b;padding-bottom:8px}
h2{font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;margin-top:24px;margin-bottom:4px}
p{font-size:14px;line-height:1.7;margin:4px 0 16px}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
</style></head><body>`;
  html += `<h1>Dossiê Executivo — ${analysis.numero_edital || "Edital"}</h1>`;
  fields.forEach((f) => { html += `<h2>${f.label}</h2><p>${f.value || "Não identificado"}</p>`; });
  html += `<h2>ANÁLISE COMPLETA</h2><div style="white-space:pre-line;font-size:14px;line-height:1.8">${analysis.resumo_simples || ""}</div>`;
  html += `<div class="footer">Dossiê gerado por Vade Mecum em Licitações — ${new Date().toLocaleDateString("pt-BR")}</div></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) w.onload = () => setTimeout(() => w.print(), 500);
};

/* ────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────── */

const SeverityDot = ({ severity }: { severity: "low" | "medium" | "high" }) => {
  const cls =
    severity === "low" ? "bg-emerald-500" :
    severity === "medium" ? "bg-amber-500" : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls} shrink-0`} />;
};

const DiagCardExpandable = ({ card, Icon }: { card: DiagCard; Icon: React.ElementType }) => {
  const [expanded, setExpanded] = useState(false);
  const plainPreview = card.content.length > 120 ? card.content.slice(0, 120).replace(/\s+\S*$/, "") + "…" : card.content;
  const bulletPreview = formatBulletLines(card.content, 3);
  const preview = bulletPreview === card.content ? plainPreview : bulletPreview;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
      className="rounded-xl border border-border/60 bg-card p-5 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 select-none"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground flex-1">{card.title}</h3>
        <SeverityDot severity={card.severity} />
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </div>
      <div className="text-sm text-foreground/80 leading-relaxed">
        {expanded ? renderWithBullets(card.content) : renderWithBullets(preview)}
      </div>
    </div>
  );
};

const HeroField = ({ icon: Icon, label, value, onClick }: { icon: React.ElementType; label: string; value: string | undefined; onClick?: () => void }) => {
  if (!value || value === "Não identificado no edital") return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2.5 text-left rounded-lg p-2 -m-2 transition-colors hover:bg-accent/50 cursor-pointer group"
    >
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block">{label}</span>
        <div className="text-sm font-medium text-foreground">{renderWithBullets(value)}</div>
      </div>
    </button>
  );
};

const ExpandableSection = ({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-card hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 bg-card">
          {children}
        </div>
      )}
    </div>
  );
};

const RichText = ({ text }: { text: string }) => {
  if (!text) return <p className="text-sm text-muted-foreground italic">Informação não identificada de forma expressa no edital.</p>;

  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Numbered list
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <ol key={i} className="space-y-2 pl-1">
              {trimmed.split("\n").filter(Boolean).map((item, j) => (
                <li key={j} className="flex gap-3 text-sm text-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                    {item.match(/^(\d+)\./)?.[1]}
                  </span>
                  <span className="flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatBold(item.replace(/^\d+\.\s*/, "")) }} />
                </li>
              ))}
            </ol>
          );
        }

        // Bullet list (emoji bullets)
        if (/^[•✅⚠️❌📌🔒💳📈🏗️📜🏦🔧📊📝⚡🤝🔄🌱🔎🏆🚫📍⏰📐🧪💻💡📋📦🖥️📑📅🚨🎯🏁❓⏱️🔗]/.test(trimmed)) {
          return (
            <ul key={i} className="space-y-2 pl-1">
              {trimmed.split("\n").filter(Boolean).map((item, j) => {
                const emoji = item.match(/^[^\w\s]*/u)?.[0]?.trim() || "•";
                const rest = item.replace(/^[^\w\s]*\s*/, "");
                return (
                  <li key={j} className="flex gap-3 text-sm text-foreground">
                    <span className="shrink-0 text-base">{emoji}</span>
                    <span className="flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatBold(rest) }} />
                  </li>
                );
              })}
            </ul>
          );
        }

        // Blockquote
        if (trimmed.startsWith(">")) {
          return (
            <blockquote key={i} className="border-l-2 border-primary/30 pl-4 py-2 bg-primary/[0.03] rounded-r-lg text-sm text-foreground/90 italic">
              {trimmed.replace(/^>\s*/, "").replace(/^"/, "").replace(/"$/, "")}
            </blockquote>
          );
        }

        // Regular paragraph
        return <p key={i} className="text-sm leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />;
      })}
    </div>
  );
};

/* ────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────── */
const EditalPresentationView = ({ analysis, fileName, onClose, onBack, onNewAnalysis }: Props) => {
  const sections = useMemo(() => parseSections(analysis.resumo_simples || ""), [analysis.resumo_simples]);
  const diagCards = useMemo(() => buildDiagCards(sections, analysis), [sections, analysis]);
  const execPanels = useMemo(() => buildExecPanels(sections), [sections]);
  const axes = useMemo(() => deriveAxes(analysis, sections), [analysis, sections]);

  const [detailOpen, setDetailOpen] = useState(false);

  const score = analysis.score_complexidade?.valor ?? 5;
  const scoreColor = getScoreColor(score);

  // Checklist
  const checklistBody = getSectionBody(sections, "fazer antes", "checklist", "antes de participar", "fazer agora");

  // Conclusion
  const conclusionBody = getSectionBody(sections, "conclusão", "conclusao");

  // Simple language
  const simpleLangBody = getSectionBody(sections, "linguagem simples", "em linguagem");

  const allFields = [
    { icon: FileText, label: "Número do Edital", value: analysis.numero_edital },
    { icon: Building2, label: "Órgão", value: analysis.orgao },
    { icon: Scale, label: "Modalidade", value: analysis.modalidade },
    { icon: FileText, label: "Objeto", value: analysis.objeto },
    { icon: DollarSign, label: "Valor Estimado", value: analysis.valor_estimado },
    { icon: BarChart3, label: "Critério de Julgamento", value: analysis.criterio_julgamento },
    { icon: Calendar, label: "Sessão Pública", value: analysis.data_sessao },
    { icon: Globe, label: "Plataforma", value: analysis.sistema_licitacao },
    { icon: Users, label: "Participação", value: analysis.participacao },
    { icon: Hash, label: "Unidade da Disputa", value: analysis.unidade_disputa },
    { icon: Shield, label: "Habilitação", value: analysis.condicoes_habilitacao },
  ].filter(f => f.value && f.value !== "Não identificado" && f.value !== "Não identificado no edital");

  const openDetail = useCallback(() => setDetailOpen(true), []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack ?? onClose} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <span className="text-sm font-semibold text-foreground">Dossiê Executivo</span>
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPdf(analysis)} className="gap-1.5 text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          {onNewAnalysis && (
            <Button variant="outline" size="sm" onClick={onNewAnalysis} className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Nova análise
            </Button>
          )}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

          {/* ━━━━ 1. HERO EXECUTIVO ━━━━ */}
          <section>
            {/* Object title – prominent */}
            {analysis.objeto && analysis.objeto !== "Não identificado no edital" && (
              <p className="text-[0.68rem] md:text-xs font-medium text-muted-foreground leading-relaxed mb-4">
                {analysis.objeto}
              </p>
            )}

            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-1">
                <p className="text-lg font-bold text-foreground tracking-tight">
                  {analysis.numero_edital || "Edital"}
                </p>
                {analysis.orgao && analysis.orgao !== "Não identificado no edital" && (
                  <p className="text-sm text-muted-foreground">{analysis.orgao}</p>
                )}
              </div>

              {/* Complexity badge */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-border ${scoreColor.bg}`}>
                <div className="text-center">
                  <span className={`text-2xl font-extrabold ${scoreColor.text}`}>{score}</span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
                <div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${scoreColor.text}`}>
                    {analysis.score_complexidade?.faixa || scoreColor.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">Complexidade</span>
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            {/* Metadata grid – each card opens the detail dialog */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
              <HeroField icon={Scale} label="Modalidade" value={analysis.modalidade} onClick={openDetail} />
              <HeroField icon={Calendar} label="Sessão Pública" value={analysis.data_sessao} onClick={openDetail} />
              <HeroField icon={Globe} label="Plataforma" value={analysis.sistema_licitacao} onClick={openDetail} />
              <HeroField icon={BarChart3} label="Critério" value={analysis.criterio_julgamento} onClick={openDetail} />
              <HeroField icon={DollarSign} label="Valor Estimado" value={analysis.valor_estimado} onClick={openDetail} />
              <HeroField icon={Users} label="Participação" value={analysis.participacao} onClick={openDetail} />
              <HeroField icon={Hash} label="Unidade da Disputa" value={analysis.unidade_disputa} onClick={openDetail} />
              <HeroField icon={Building2} label="Órgão" value={analysis.orgao} onClick={openDetail} />
            </div>

            {/* Extraction confidence */}
            <div className="mt-4 flex items-center gap-2">
              <Info className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Análise por extração textual automatizada (regex) — sem custo de IA. Não substitui análise jurídica profissional.
              </span>
            </div>
          </section>

          {/* ━━━━ 2. DIAGNÓSTICO RÁPIDO ━━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Diagnóstico Rápido
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diagCards.map((card) => {
                const Icon = card.icon;
                return (
                  <DiagCardExpandable key={card.title} card={card} Icon={Icon} />
                );
              })}
            </div>
          </section>

          {/* ━━━━ 3. LEITURA EXECUTIVA ━━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Leitura Executiva
            </h2>
            <div className="space-y-3">
              {execPanels.map((panel, i) => (
                <ExpandableSection
                  key={panel.title}
                  title={panel.title}
                  icon={panel.icon}
                  defaultOpen={i === 0}
                >
                  <RichText text={panel.body} />
                </ExpandableSection>
              ))}
            </div>
          </section>

          {/* ━━━━ 4. COMPLEXIDADE POR EIXO ━━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Complexidade por Eixo
            </h2>
            <Card className="border-border/60">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {axes.map((axis) => {
                    const Icon = axis.icon;
                    const color = getScoreColor(axis.score);
                    return (
                      <div key={axis.label} className="flex items-center gap-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground">{axis.label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${color.text}`}>{axis.score}/10</span>
                              <Badge variant="outline" className={`text-[10px] ${color.text} border-transparent ${color.bg}`}>
                                {color.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${color.bar} transition-all duration-700`}
                              style={{ width: `${(axis.score / 10) * 100}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{axis.justification}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator className="my-5" />

                {/* Overall */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-extrabold ${scoreColor.text}`}>{score}</span>
                    <div>
                      <span className={`text-sm font-bold ${scoreColor.text}`}>
                        {analysis.score_complexidade?.faixa
                          ? `Complexidade ${analysis.score_complexidade.faixa}`
                          : `Complexidade ${scoreColor.label}`}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        {analysis.score_complexidade?.frase_faixa || analysis.score_complexidade?.justificativa || "Baseado na análise textual do edital."}
                      </span>
                    </div>
                  </div>

                  {/* Fatores que elevaram */}
                  {analysis.score_complexidade?.fatores_elevaram && analysis.score_complexidade.fatores_elevaram.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fatores que elevaram a nota</span>
                      <ul className="mt-1.5 space-y-1">
                        {analysis.score_complexidade.fatores_elevaram.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="text-amber-500 mt-0.5 shrink-0">▲</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Fatores que impediram nota maior */}
                  {analysis.score_complexidade?.fatores_impediram && analysis.score_complexidade.fatores_impediram.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fatores que impediram nota maior</span>
                      <ul className="mt-1.5 space-y-1">
                        {analysis.score_complexidade.fatores_impediram.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                            <span className="text-emerald-500 mt-0.5 shrink-0">▼</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ━━━━ 5. CHECKLIST OPERACIONAL ━━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Checklist Operacional
            </h2>
            <Card className="border-border/60">
              <CardContent className="p-5">
                {checklistBody ? (
                  <RichText text={checklistBody} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Checklist não identificado de forma expressa na análise. Consulte o edital original.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ━━━━ 6. EVIDÊNCIAS ━━━━ */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Evidências e Seções Completas
            </h2>
            <div className="space-y-2">
              {sections.filter((s) => s.body.length > 20).map((sec, i) => (
                <ExpandableSection
                  key={i}
                  title={sec.number > 0 ? `${sec.number}. ${stripEmoji(sec.title)}` : stripEmoji(sec.title)}
                  icon={ScrollText}
                >
                  <RichText text={sec.body} />
                </ExpandableSection>
              ))}
            </div>
          </section>

          {/* ━━━━ CONCLUSÃO ━━━━ */}
          {conclusionBody && (
            <section className="pb-8">
              <Card className="border-primary/20 bg-primary/[0.02]">
                <CardContent className="p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
                    Conclusão Executiva
                  </h2>
                  <RichText text={conclusionBody} />
                </CardContent>
              </Card>
            </section>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-6 py-2 border-t border-border bg-card shrink-0 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">
          Dossiê gerado por extração textual automatizada — não substitui análise jurídica profissional
        </span>
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Ficha Completa do Edital
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {allFields.map((field, i) => {
              const Icon = field.icon;
              const isLong = (field.value?.length || 0) > 80;
              return (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block">
                      {field.label}
                    </span>
                    <div className="text-sm font-medium text-foreground">
                      {renderWithBullets(field.value || "")}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Complexity score */}
            {analysis.score_complexidade && (
              <div className="flex gap-3 items-start pt-2 border-t border-border">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block">
                    Complexidade
                  </span>
                  <span className={`text-lg font-extrabold ${scoreColor.text}`}>
                    {score}<span className="text-xs text-muted-foreground font-normal">/10</span>
                  </span>
                  <span className={`text-xs font-bold uppercase ml-2 ${scoreColor.text}`}>
                    {analysis.score_complexidade.faixa}
                  </span>
                  {analysis.score_complexidade.frase_faixa && (
                    <p className="text-xs text-muted-foreground mt-1">{analysis.score_complexidade.frase_faixa}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Todos os dados extraídos diretamente do PDF — sem inferências ou dados inventados.
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EditalPresentationView;
