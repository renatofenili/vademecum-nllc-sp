import { useState, useEffect, useCallback } from "react";
import { X, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  icon: string;
  tier: "primary" | "secondary" | "tertiary" | "summary";
  x: number;
  y: number;
  w: number;
  h: number;
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
  { id: "edital", label: "EDITAL", value: a.numero_edital || "Edital", fullValue: a.numero_edital || "Edital", icon: "📋", tier: "primary", x: 50, y: 5, w: 20, h: 7 },
  { id: "orgao", label: "ÓRGÃO", value: truncate(a.orgao, 50), fullValue: a.orgao || "Não identificado", icon: "🏛️", tier: "secondary", x: 75, y: 16, w: 26, h: 7 },
  { id: "modalidade", label: "MODALIDADE", value: a.modalidade || "Não identificado", fullValue: a.modalidade || "Não identificado", icon: "📑", tier: "secondary", x: 25, y: 16, w: 22, h: 7 },
  { id: "objeto", label: "OBJETO", value: truncate(a.objeto, 80), fullValue: a.objeto || "Não identificado", icon: "📄", tier: "secondary", x: 50, y: 30, w: 46, h: 8 },
  { id: "valor", label: "VALOR ESTIMADO", value: a.valor_estimado || "Não informado", fullValue: a.valor_estimado || "Não informado", icon: "💰", tier: "tertiary", x: 82, y: 44, w: 22, h: 7 },
  { id: "criterio", label: "CRITÉRIO DE JULGAMENTO", value: truncate(a.criterio_julgamento, 50), fullValue: a.criterio_julgamento || "Não identificado", icon: "⚖️", tier: "tertiary", x: 18, y: 44, w: 24, h: 7 },
  { id: "sessao", label: "SESSÃO PÚBLICA", value: a.data_sessao || "Não identificado", fullValue: a.data_sessao || "Não identificado", icon: "📅", tier: "tertiary", x: 50, y: 44, w: 22, h: 7 },
  { id: "habilitacao", label: "HABILITAÇÃO", value: truncate(a.condicoes_habilitacao, 60), fullValue: a.condicoes_habilitacao || "Não identificado", icon: "🛡️", tier: "tertiary", x: 18, y: 60, w: 28, h: 7 },
  { id: "sistema", label: "ONDE LICITAR", value: a.sistema_licitacao || "Não identificado", fullValue: a.sistema_licitacao || "Não identificado", icon: "🌐", tier: "tertiary", x: 75, y: 60, w: 22, h: 7 },
  { id: "resumo", label: "EM LINGUAGEM SIMPLES", value: truncate(a.resumo_simples, 100), fullValue: a.resumo_simples || "Não identificado", icon: "💬", tier: "summary", x: 50, y: 78, w: 56, h: 14 },
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

const STAGGER_MS = 380;

// SP institutional palette
const TIER_COLORS = {
  primary: { bg: "hsl(0 72% 42%)", border: "hsl(0 72% 50%)", glow: "hsla(0, 72%, 42%, 0.25)", text: "hsl(0 0% 100%)", label: "hsl(0 72% 85%)" },
  secondary: { bg: "hsl(0 40% 18%)", border: "hsl(0 55% 35%)", glow: "hsla(0, 55%, 35%, 0.15)", text: "hsl(0 0% 95%)", label: "hsl(0 50% 75%)" },
  tertiary: { bg: "hsl(0 20% 14%)", border: "hsl(0 30% 30%)", glow: "hsla(0, 30%, 30%, 0.12)", text: "hsl(0 0% 92%)", label: "hsl(0 30% 68%)" },
  summary: { bg: "hsl(0 35% 16%)", border: "hsl(0 60% 40%)", glow: "hsla(0, 60%, 40%, 0.18)", text: "hsl(0 0% 95%)", label: "hsl(0 60% 80%)" },
};

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
    const t = setTimeout(() => start(), 400);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visibleNodeIds = new Set(nodes.slice(0, visibleCount).map((n) => n.id));
  const visibleArrows = arrowDefs.filter(
    (a) => visibleNodeIds.has(a.from) && visibleNodeIds.has(a.to)
  );

  const toggleExpand = (id: string) => {
    setExpandedNode((prev) => (prev === id ? null : id));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "linear-gradient(145deg, hsl(0 15% 6%), hsl(0 20% 10%), hsl(0 10% 5%))" }}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {!isPlaying && visibleCount >= nodes.length && (
          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10" onClick={start}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Title bar */}
      <div className="absolute bottom-4 left-6 flex items-center gap-3 z-10">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, hsl(0 72% 42%), hsl(0 72% 55%))" }}
        >
          V
        </div>
        <span className="text-xs font-semibold tracking-widest" style={{ color: "hsl(0 30% 45%)" }}>
          VADE MECUM EM LICITAÇÕES
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <BackgroundGrid />

        {/* Ambient red orbs */}
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsla(0,72%,42%,0.06), transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsla(0,50%,35%,0.05), transparent 70%)", filter: "blur(60px)" }} />

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
            expanded={expandedNode === node.id}
            onToggle={() => toggleExpand(node.id)}
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

const BackgroundGrid = () => (
  <svg className="absolute inset-0 w-full h-full opacity-[0.04]">
    <pattern id="spGrid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(0 50% 60%)" strokeWidth="0.5" />
    </pattern>
    <rect width="100%" height="100%" fill="url(#spGrid)" />
  </svg>
);

const FlowNodeEl = ({
  node,
  visible,
  expanded,
  onToggle,
}: {
  node: FlowNode;
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const colors = TIER_COLORS[node.tier];
  const hasMore = node.fullValue.length > node.value.length;

  return (
    <div
      style={{
        position: "absolute",
        left: `${node.x - node.w / 2}%`,
        top: `${node.y - node.h / 2}%`,
        width: `${node.w}%`,
        minHeight: `${node.h}%`,
        transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: visible ? "scale(1)" : "scale(0.3)",
        opacity: visible ? 1 : 0,
        zIndex: expanded ? 50 : 10,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      {/* Glow */}
      <div
        className="absolute -inset-3 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(ellipse, ${colors.glow}, transparent 70%)`,
          filter: "blur(12px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      />
      {/* Card */}
      <div
        className="relative w-full h-full rounded-xl flex flex-col items-center justify-center px-4 py-3 group transition-all duration-200 hover:scale-[1.03]"
        style={{
          background: `linear-gradient(145deg, ${colors.bg}, hsl(0 10% 8%))`,
          border: `1.5px solid ${colors.border}`,
          boxShadow: `0 4px 24px ${colors.glow}, inset 0 1px 0 hsla(0,0%,100%,0.05)`,
        }}
      >
        {/* Top accent line */}
        {node.tier === "primary" && (
          <div className="absolute top-0 left-4 right-4 h-[2px] rounded-b" style={{ background: `linear-gradient(90deg, transparent, ${colors.border}, transparent)` }} />
        )}

        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{node.icon}</span>
          <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: colors.label }}>
            {node.label}
          </span>
        </div>
        <p
          className="text-center leading-snug"
          style={{
            color: colors.text,
            fontSize: node.value.length > 60 ? "10px" : node.value.length > 30 ? "11px" : "13px",
            fontWeight: node.tier === "primary" ? 700 : 500,
            maxWidth: "95%",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: node.tier === "summary" ? 4 : 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {node.value}
        </p>

        {/* Expand hint */}
        {hasMore && (
          <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ChevronDown className="h-3 w-3" style={{ color: colors.label }} />
            <span className="text-[9px]" style={{ color: colors.label }}>clique para expandir</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ExpandedCard = ({ node, onClose }: { node: FlowNode; onClose: () => void }) => {
  const colors = TIER_COLORS[node.tier];

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* Card */}
      <div
        className="absolute z-50 animate-scale-in"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(90%, 560px)",
          maxHeight: "70vh",
        }}
      >
        <div
          className="rounded-2xl p-6 overflow-y-auto"
          style={{
            background: `linear-gradient(145deg, ${colors.bg}, hsl(0 12% 10%))`,
            border: `2px solid ${colors.border}`,
            boxShadow: `0 8px 48px ${colors.glow}, 0 0 80px ${colors.glow}`,
            maxHeight: "70vh",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{node.icon}</span>
              <span className="text-xs font-bold tracking-[0.15em]" style={{ color: colors.label }}>
                {node.label}
              </span>
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 transition-colors hover:bg-white/10"
              style={{ color: colors.label }}
            >
              <ChevronUp className="h-3 w-3" />
              Recolher
            </button>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: colors.text }}>
            {node.fullValue}
          </p>
        </div>
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
        stroke="hsla(0, 50%, 45%, 0.35)"
        strokeWidth="0.25"
        style={{
          strokeDasharray: 200,
          animation: "drawLine 0.8s ease-out forwards",
        }}
      />
      <circle cx={x2} cy={y2} r="0.5" fill="hsl(0 72% 50%)" opacity={0.5} />
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
