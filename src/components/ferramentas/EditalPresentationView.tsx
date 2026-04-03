import { useState, useEffect } from "react";
import { X, Play, RotateCcw } from "lucide-react";
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
  icon: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlowArrow {
  from: string;
  to: string;
}

const buildNodes = (a: EditalAnalysis): FlowNode[] => {
  const nodes: FlowNode[] = [
    { id: "edital", label: "EDITAL", value: a.numero_edital || "Edital", icon: "📋", color: "#3b82f6", x: 50, y: 2, w: 22, h: 9 },
    { id: "orgao", label: "ÓRGÃO", value: a.orgao || "Não identificado", icon: "🏛️", color: "#8b5cf6", x: 50, y: 16, w: 28, h: 8 },
    { id: "modalidade", label: "MODALIDADE", value: a.modalidade || "Não identificado", icon: "📑", color: "#6366f1", x: 18, y: 16, w: 20, h: 8 },
    { id: "objeto", label: "OBJETO", value: truncate(a.objeto, 90), icon: "📄", color: "#06b6d4", x: 30, y: 32, w: 40, h: 10 },
    { id: "valor", label: "VALOR ESTIMADO", value: a.valor_estimado || "Não informado", icon: "💰", color: "#10b981", x: 78, y: 32, w: 20, h: 10 },
    { id: "criterio", label: "CRITÉRIO", value: a.criterio_julgamento || "Não identificado", icon: "⚖️", color: "#f59e0b", x: 16, y: 50, w: 20, h: 9 },
    { id: "sessao", label: "SESSÃO PÚBLICA", value: a.data_sessao || "Não identificado", icon: "📅", color: "#ef4444", x: 42, y: 50, w: 20, h: 9 },
    { id: "habilitacao", label: "HABILITAÇÃO", value: truncate(a.condicoes_habilitacao, 70), icon: "🛡️", color: "#8b5cf6", x: 68, y: 50, w: 24, h: 9 },
    { id: "sistema", label: "ONDE LICITAR", value: a.sistema_licitacao || "Não identificado", icon: "🌐", color: "#3b82f6", x: 50, y: 68, w: 20, h: 9 },
    { id: "resumo", label: "LINGUAGEM SIMPLES", value: truncate(a.resumo_simples, 120), icon: "💬", color: "#10b981", x: 50, y: 84, w: 50, h: 12 },
  ];
  return nodes;
};

const truncate = (s: string | undefined, max: number) => {
  if (!s) return "Não identificado";
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const arrowDefs: FlowArrow[] = [
  { from: "edital", to: "orgao" },
  { from: "edital", to: "modalidade" },
  { from: "orgao", to: "objeto" },
  { from: "orgao", to: "valor" },
  { from: "objeto", to: "criterio" },
  { from: "objeto", to: "sessao" },
  { from: "valor", to: "habilitacao" },
  { from: "sessao", to: "sistema" },
  { from: "habilitacao", to: "sistema" },
  { from: "sistema", to: "resumo" },
];

const STAGGER_MS = 350;

const EditalPresentationView = ({ analysis, onClose }: Props) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const nodes = buildNodes(analysis);

  const start = () => {
    setVisibleCount(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!isPlaying) return;
    if (visibleCount >= nodes.length) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), STAGGER_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, visibleCount, nodes.length]);

  // Auto-start
  useEffect(() => {
    const t = setTimeout(() => start(), 400);
    return () => clearTimeout(t);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Which arrows are visible (arrow appears when both endpoints are visible)
  const visibleNodeIds = new Set(nodes.slice(0, visibleCount).map((n) => n.id));
  const visibleArrows = arrowDefs.filter(
    (a) => visibleNodeIds.has(a.from) && visibleNodeIds.has(a.to)
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "linear-gradient(135deg, #0a0e1a, #111827, #0a0e1a)" }}>
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {!isPlaying && visibleCount >= nodes.length && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10"
            onClick={start}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {!isPlaying && visibleCount === 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10"
            onClick={start}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Title bar */}
      <div className="absolute bottom-4 left-6 flex items-center gap-3 z-10">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          V
        </div>
        <span className="text-xs font-semibold tracking-widest text-slate-500">
          VADE MECUM EM LICITAÇÕES
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {/* Background dots */}
        <BackgroundDots />

        {/* Ambient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08), transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)", filter: "blur(60px)" }} />

        {/* SVG arrows */}
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
          {visibleArrows.map((arrow) => {
            const from = nodeMap.get(arrow.from)!;
            const to = nodeMap.get(arrow.to)!;
            return (
              <FlowArrowSVG key={`${arrow.from}-${arrow.to}`} from={from} to={to} />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node, i) => (
          <FlowNodeEl key={node.id} node={node} visible={i < visibleCount} index={i} />
        ))}
      </div>
    </div>
  );
};

const BackgroundDots = () => (
  <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
    <pattern id="flowDots" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="1" fill="#94a3b8" />
    </pattern>
    <rect width="100%" height="100%" fill="url(#flowDots)" />
  </svg>
);

const FlowNodeEl = ({ node, visible, index }: { node: FlowNode; visible: boolean; index: number }) => {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${node.x - node.w / 2}%`,
    top: `${node.y - node.h / 2}%`,
    width: `${node.w}%`,
    height: `${node.h}%`,
    transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
    transform: visible ? "scale(1)" : "scale(0.3)",
    opacity: visible ? 1 : 0,
    zIndex: 10,
  };

  return (
    <div style={style}>
      {/* Glow */}
      <div
        className="absolute -inset-2 rounded-2xl"
        style={{
          background: `radial-gradient(ellipse, ${node.color}15, transparent 70%)`,
          filter: "blur(10px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      />
      {/* Card */}
      <div
        className="relative w-full h-full rounded-xl flex flex-col items-center justify-center px-3 py-2"
        style={{
          background: "linear-gradient(145deg, #141c2e, #0a0e1a)",
          border: `1.5px solid ${node.color}40`,
          boxShadow: `0 4px 20px ${node.color}10`,
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{node.icon}</span>
          <span
            className="text-[10px] font-bold tracking-[0.15em]"
            style={{ color: node.color }}
          >
            {node.label}
          </span>
        </div>
        <p
          className="text-center leading-snug"
          style={{
            color: "#f0f4ff",
            fontSize: node.value.length > 80 ? "10px" : node.value.length > 40 ? "11px" : "13px",
            fontWeight: 500,
            maxWidth: "95%",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {node.value}
        </p>
      </div>
    </div>
  );
};

const FlowArrowSVG = ({ from, to }: { from: FlowNode; to: FlowNode }) => {
  const x1Pct = from.x;
  const y1Pct = from.y + from.h / 2;
  const x2Pct = to.x;
  const y2Pct = to.y - to.h / 2;

  // Control points for curve
  const midY = (y1Pct + y2Pct) / 2;

  const pathD = `M ${x1Pct} ${y1Pct} C ${x1Pct} ${midY}, ${x2Pct} ${midY}, ${x2Pct} ${y2Pct}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <path
        d={pathD}
        fill="none"
        stroke={`${from.color}50`}
        strokeWidth="0.2"
        className="animate-draw-line"
        style={{
          strokeDasharray: 200,
          animation: "drawLine 0.8s ease-out forwards",
        }}
      />
      {/* Arrow dot at end */}
      <circle cx={x2Pct} cy={y2Pct} r="0.4" fill={to.color} opacity={0.6} />
    </svg>
  );
};

// Inject keyframe animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
@keyframes drawLine {
  from { stroke-dashoffset: 200; }
  to { stroke-dashoffset: 0; }
}
`;
if (!document.querySelector("[data-flow-anim]")) {
  styleSheet.setAttribute("data-flow-anim", "true");
  document.head.appendChild(styleSheet);
}

export default EditalPresentationView;
