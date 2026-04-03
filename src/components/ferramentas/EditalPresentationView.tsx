import { useState, useEffect, useCallback } from "react";
import { X, RotateCcw, ChevronDown, ChevronUp, FileText, DollarSign, Scale, Calendar, Shield, Globe, Building2, Hash, Clipboard, MessageSquare, TableProperties } from "lucide-react";
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
  /** Extra content for special expandable nodes */
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
  { id: "edital", label: "Edital", value: a.numero_edital || "Edital", fullValue: a.numero_edital || "Edital", icon: Hash, x: 50, y: 4, w: 18, h: 6, expandable: false },
  { id: "orgao", label: "Órgão", value: truncate(a.orgao, 40), fullValue: a.orgao || "Não identificado", icon: Building2, x: 76, y: 14, w: 24, h: 6, expandable: true },
  { id: "modalidade", label: "Modalidade", value: a.modalidade || "Não identificado", fullValue: a.modalidade || "Não identificado", icon: Clipboard, x: 24, y: 14, w: 20, h: 6, expandable: false },
  { id: "objeto", label: "Objeto", value: truncate(a.objeto, 70), fullValue: a.objeto || "Não identificado", icon: FileText, x: 50, y: 27, w: 50, h: 7, expandable: true },
  { id: "valor", label: "Valor Estimado", value: a.valor_estimado || "Não informado", fullValue: a.valor_estimado || "Não informado", icon: DollarSign, x: 82, y: 40, w: 20, h: 6, expandable: true, extraContent: a.planilha_estimada },
  { id: "criterio", label: "Critério de Julgamento", value: truncate(a.criterio_julgamento, 40), fullValue: a.criterio_julgamento || "Não identificado", icon: Scale, x: 18, y: 40, w: 22, h: 6, expandable: true },
  { id: "sessao", label: "Sessão Pública", value: a.data_sessao || "Não identificado", fullValue: a.data_sessao || "Não identificado", icon: Calendar, x: 50, y: 40, w: 20, h: 6, expandable: false },
  { id: "habilitacao", label: "Habilitação", value: truncate(a.condicoes_habilitacao, 50), fullValue: a.condicoes_habilitacao || "Não identificado", icon: Shield, x: 20, y: 55, w: 28, h: 6, expandable: true },
  { id: "sistema", label: "Onde Licitar", value: a.sistema_licitacao || "Não identificado", fullValue: a.sistema_licitacao || "Não identificado", icon: Globe, x: 74, y: 55, w: 22, h: 6, expandable: false },
  { id: "resumo", label: "Em Linguagem Simples", value: truncate(a.resumo_simples, 90), fullValue: a.resumo_simples || "Não identificado", icon: MessageSquare, x: 50, y: 72, w: 60, h: 16, expandable: true },
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
      <div className="flex-1 relative overflow-hidden bg-muted/40">
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
    </div>
  );
};

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
        top: `${node.y - node.h / 2}%`,
        width: `${node.w}%`,
        minHeight: `${node.h}%`,
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: visible ? "scale(1)" : "scale(0.5)",
        opacity: visible ? 1 : 0,
        zIndex: 10,
        cursor: node.expandable ? "pointer" : "default",
      }}
      onClick={node.expandable ? onExpand : undefined}
    >
      <Card className={`h-full transition-shadow duration-200 shadow-sm border-border bg-card ${node.expandable ? "hover:shadow-lg hover:border-primary/40 group" : ""}`}>
        <CardContent className="p-3 flex flex-col items-center justify-center h-full gap-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {node.label}
            </span>
          </div>
          <p
            className="text-center leading-snug text-foreground"
            style={{
              fontSize: node.value.length > 60 ? "10px" : node.value.length > 30 ? "11px" : "12px",
              fontWeight: node.id === "edital" ? 700 : 500,
              maxWidth: "95%",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: node.id === "resumo" ? 5 : 2,
              WebkitBoxOrient: "vertical",
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
          width: "min(92%, 600px)",
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

            <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
              {node.fullValue}
            </p>

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
                <div className="text-sm leading-relaxed text-foreground whitespace-pre-line bg-muted/50 rounded-lg p-4 border border-border">
                  {typeof node.extraContent === "string"
                    ? node.extraContent
                    : Array.isArray(node.extraContent)
                      ? (node.extraContent as Array<Record<string, unknown>>).map((item, i) =>
                          typeof item === "string" ? item : `${i + 1}. ${Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(" | ")}`
                        ).join("\n")
                      : JSON.stringify(node.extraContent, null, 2)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

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
