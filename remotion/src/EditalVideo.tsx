import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const editalData = {
  numero_edital: "Pregão Eletrônico nº 06/2024",
  orgao: "Secretaria de Gestão e Governo Digital",
  objeto: "Serviços continuados de apoio administrativo e operacional",
  valor_estimado: "R$ 2.450.000,00",
  criterio_julgamento: "Menor preço global",
  data_sessao: "15/03/2025 às 10h",
  condicoes_habilitacao: "Regularidade fiscal, qualificação técnica e econômico-financeira",
  sistema_licitacao: "BEC/SP",
};

// ── Palette ──
const C = {
  bg: "#0a0e1a",
  node: "#141c2e",
  nodeBorder: "#1e2d4a",
  accent: "#3b82f6",
  accentGlow: "#60a5fa",
  green: "#10b981",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  red: "#ef4444",
  cyan: "#06b6d4",
  white: "#f0f4ff",
  muted: "#64748b",
  line: "#2a3a5c",
};

// ── Node definitions with positions ──
interface FlowNode {
  id: string;
  label: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string;
  appearFrame: number;
}

interface FlowArrow {
  from: string;
  to: string;
  appearFrame: number;
}

const nodes: FlowNode[] = [
  // Center - main node
  { id: "edital", label: "EDITAL", value: editalData.numero_edital, x: 960, y: 120, w: 420, h: 90, color: C.accent, icon: "📋", appearFrame: 15 },
  // Second row
  { id: "orgao", label: "ÓRGÃO", value: editalData.orgao, x: 960, y: 310, w: 480, h: 80, color: C.purple, icon: "🏛️", appearFrame: 55 },
  // Third row - branch left and right
  { id: "objeto", label: "OBJETO", value: editalData.objeto, x: 500, y: 490, w: 440, h: 90, color: C.cyan, icon: "📄", appearFrame: 110 },
  { id: "valor", label: "VALOR ESTIMADO", value: editalData.valor_estimado, x: 1420, y: 490, w: 360, h: 90, color: C.green, icon: "💰", appearFrame: 140 },
  // Fourth row
  { id: "criterio", label: "CRITÉRIO", value: editalData.criterio_julgamento, x: 300, y: 700, w: 340, h: 80, color: C.amber, icon: "⚖️", appearFrame: 190 },
  { id: "sessao", label: "SESSÃO", value: editalData.data_sessao, x: 720, y: 700, w: 300, h: 80, color: C.red, icon: "📅", appearFrame: 220 },
  { id: "habilitacao", label: "HABILITAÇÃO", value: editalData.condicoes_habilitacao, x: 1200, y: 700, w: 420, h: 90, color: C.purple, icon: "🛡️", appearFrame: 260 },
  { id: "sistema", label: "PLATAFORMA", value: editalData.sistema_licitacao, x: 1620, y: 700, w: 260, h: 80, color: C.accent, icon: "🌐", appearFrame: 300 },
];

const arrows: FlowArrow[] = [
  { from: "edital", to: "orgao", appearFrame: 45 },
  { from: "orgao", to: "objeto", appearFrame: 95 },
  { from: "orgao", to: "valor", appearFrame: 125 },
  { from: "objeto", to: "criterio", appearFrame: 175 },
  { from: "objeto", to: "sessao", appearFrame: 205 },
  { from: "valor", to: "habilitacao", appearFrame: 245 },
  { from: "valor", to: "sistema", appearFrame: 285 },
];

// ── Components ──

const AnimatedNode = ({ node, frame, fps }: { node: FlowNode; frame: number; fps: number }) => {
  const localFrame = frame - node.appearFrame;
  if (localFrame < -5) return null;

  const s = spring({ frame: Math.max(0, localFrame), fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const scale = interpolate(s, [0, 1], [0.3, 1]);
  const opacity = interpolate(s, [0, 1], [0, 1]);

  // Subtle breathing glow
  const glowPulse = Math.sin(frame * 0.04 + node.appearFrame) * 0.15 + 0.85;

  // Text reveal
  const textDelay = 12;
  const textLocalFrame = localFrame - textDelay;
  const textOpacity = interpolate(textLocalFrame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textSlide = interpolate(textLocalFrame, [0, 15], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const left = node.x - node.w / 2;
  const top = node.y - node.h / 2;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: node.w,
        height: node.h,
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "center center",
      }}
    >
      {/* Glow behind */}
      <div
        style={{
          position: "absolute",
          inset: -8,
          borderRadius: 20,
          background: `radial-gradient(ellipse, ${node.color}20, transparent 70%)`,
          opacity: glowPulse,
          filter: "blur(12px)",
        }}
      />
      {/* Card */}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 16,
          background: `linear-gradient(145deg, ${C.node}, ${C.bg})`,
          border: `1.5px solid ${node.color}50`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "10px 20px",
          boxShadow: `0 4px 30px ${node.color}15, inset 0 1px 0 ${node.color}10`,
        }}
      >
        {/* Label row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: textOpacity,
            transform: `translateY(${textSlide}px)`,
          }}
        >
          <span style={{ fontSize: 18 }}>{node.icon}</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2.5,
              color: node.color,
              fontFamily,
            }}
          >
            {node.label}
          </span>
        </div>
        {/* Value */}
        <div
          style={{
            marginTop: 6,
            fontSize: node.value.length > 50 ? 14 : 17,
            fontWeight: 500,
            color: C.white,
            textAlign: "center",
            lineHeight: 1.35,
            opacity: textOpacity,
            transform: `translateY(${textSlide * 1.3}px)`,
            fontFamily,
            maxWidth: node.w - 40,
            overflow: "hidden",
          }}
        >
          {node.value}
        </div>
      </div>
    </div>
  );
};

const AnimatedArrow = ({
  fromNode,
  toNode,
  arrow,
  frame,
  fps,
}: {
  fromNode: FlowNode;
  toNode: FlowNode;
  arrow: FlowArrow;
  frame: number;
  fps: number;
}) => {
  const localFrame = frame - arrow.appearFrame;
  if (localFrame < 0) return null;

  // Arrow draw progress
  const drawProgress = interpolate(localFrame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const x1 = fromNode.x;
  const y1 = fromNode.y + fromNode.h / 2;
  const x2 = toNode.x;
  const y2 = toNode.y - toNode.h / 2;

  // Curved path
  const midY = (y1 + y2) / 2;
  const cx1 = x1;
  const cy1 = midY;
  const cx2 = x2;
  const cy2 = midY;

  const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

  // Calculate total path length (approximate for cubic bezier)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const approxLen = Math.sqrt(dx * dx + dy * dy) * 1.3;

  // Arrowhead position (at the end of drawn portion)
  const t = drawProgress;
  const arrowX = (1-t)*(1-t)*(1-t)*x1 + 3*(1-t)*(1-t)*t*cx1 + 3*(1-t)*t*t*cx2 + t*t*t*x2;
  const arrowY = (1-t)*(1-t)*(1-t)*y1 + 3*(1-t)*(1-t)*t*cy1 + 3*(1-t)*t*t*cy2 + t*t*t*y2;

  // Tangent for arrowhead direction
  const dt = 0.01;
  const t2 = Math.min(t + dt, 1);
  const ax2 = (1-t2)*(1-t2)*(1-t2)*x1 + 3*(1-t2)*(1-t2)*t2*cx1 + 3*(1-t2)*t2*t2*cx2 + t2*t2*t2*x2;
  const ay2 = (1-t2)*(1-t2)*(1-t2)*y1 + 3*(1-t2)*(1-t2)*t2*cy1 + 3*(1-t2)*t2*t2*cy2 + t2*t2*t2*y2;
  const angle = Math.atan2(ay2 - arrowY, ax2 - arrowX);

  const arrowSize = 10;
  const headOpacity = interpolate(drawProgress, [0.7, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Flowing particle along the path
  const particleT = localFrame > 25 ? ((localFrame - 25) % 40) / 40 : drawProgress;
  const particleX = (1-particleT)*(1-particleT)*(1-particleT)*x1 + 3*(1-particleT)*(1-particleT)*particleT*cx1 + 3*(1-particleT)*particleT*particleT*cx2 + particleT*particleT*particleT*x2;
  const particleY = (1-particleT)*(1-particleT)*(1-particleT)*y1 + 3*(1-particleT)*(1-particleT)*particleT*cy1 + 3*(1-particleT)*particleT*particleT*cy2 + particleT*particleT*particleT*y2;
  const showParticle = localFrame > 25;

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, width: 1920, height: 1080, pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id={`grad-${arrow.from}-${arrow.to}`} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={fromNode.color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={toNode.color} stopOpacity="0.8" />
        </linearGradient>
        <filter id={`glow-${arrow.from}-${arrow.to}`}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Path glow */}
      <path
        d={pathD}
        fill="none"
        stroke={fromNode.color}
        strokeWidth={4}
        strokeOpacity={0.15}
        strokeDasharray={approxLen}
        strokeDashoffset={approxLen * (1 - drawProgress)}
        filter={`url(#glow-${arrow.from}-${arrow.to})`}
      />
      {/* Main path */}
      <path
        d={pathD}
        fill="none"
        stroke={`url(#grad-${arrow.from}-${arrow.to})`}
        strokeWidth={2.5}
        strokeDasharray={approxLen}
        strokeDashoffset={approxLen * (1 - drawProgress)}
        strokeLinecap="round"
      />
      {/* Arrowhead */}
      {drawProgress > 0.9 && (
        <polygon
          points={`
            ${arrowX + Math.cos(angle) * arrowSize},${arrowY + Math.sin(angle) * arrowSize}
            ${arrowX + Math.cos(angle + 2.5) * arrowSize * 0.7},${arrowY + Math.sin(angle + 2.5) * arrowSize * 0.7}
            ${arrowX + Math.cos(angle - 2.5) * arrowSize * 0.7},${arrowY + Math.sin(angle - 2.5) * arrowSize * 0.7}
          `}
          fill={toNode.color}
          opacity={headOpacity}
        />
      )}
      {/* Flowing particle */}
      {showParticle && (
        <circle cx={particleX} cy={particleY} r={3} fill={C.white} opacity={0.6}>
        </circle>
      )}
    </svg>
  );
};

// ── Title bar at bottom ──
const TitleBar = ({ frame, fps }: { frame: number; fps: number }) => {
  const s = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 20, stiffness: 100 } });
  const slideUp = interpolate(s, [0, 1], [40, 0]);
  const opacity = interpolate(s, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 30,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        opacity,
        transform: `translateY(${slideUp}px)`,
        fontFamily,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 800, color: C.white,
        }}>
          V
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.muted, letterSpacing: 1 }}>
          VADE MECUM EM LICITAÇÕES
        </span>
      </div>
      <span style={{ fontSize: 14, color: `${C.muted}80`, fontWeight: 500 }}>
        Análise automática de edital
      </span>
    </div>
  );
};

// ── Subtle background grid ──
const BackgroundGrid = ({ frame }: { frame: number }) => {
  const opacity = interpolate(frame, [0, 40], [0, 0.03], { extrapolateRight: "clamp" });
  const drift = frame * 0.08;

  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width="1920" height="1080">
        <defs>
          <pattern id="bgGrid" width="80" height="80" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${drift}, ${drift * 0.5})`}>
            <circle cx="40" cy="40" r="1" fill={C.line} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGrid)" />
      </svg>
    </AbsoluteFill>
  );
};

// ── Main ──
export const EditalVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Overall fade in
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // Outro fade
  const totalFrames = 420;
  const outroOpacity = interpolate(frame, [totalFrames - 30, totalFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily,
        overflow: "hidden",
        opacity: bgOpacity * outroOpacity,
      }}
    >
      <BackgroundGrid frame={frame} />

      {/* Ambient orbs */}
      <div style={{
        position: "absolute",
        left: 100 + Math.sin(frame * 0.01) * 30,
        top: 300 + Math.cos(frame * 0.008) * 20,
        width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.accent}08, transparent 70%)`,
        filter: "blur(60px)",
      }} />
      <div style={{
        position: "absolute",
        right: 100 + Math.cos(frame * 0.012) * 25,
        top: 500 + Math.sin(frame * 0.009) * 15,
        width: 400, height: 400, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.purple}08, transparent 70%)`,
        filter: "blur(60px)",
      }} />

      {/* Arrows layer */}
      {arrows.map((arrow) => {
        const fromNode = nodeMap.get(arrow.from)!;
        const toNode = nodeMap.get(arrow.to)!;
        return (
          <AnimatedArrow
            key={`${arrow.from}-${arrow.to}`}
            fromNode={fromNode}
            toNode={toNode}
            arrow={arrow}
            frame={frame}
            fps={fps}
          />
        );
      })}

      {/* Nodes layer */}
      {nodes.map((node) => (
        <AnimatedNode key={node.id} node={node} frame={frame} fps={fps} />
      ))}

      {/* Title bar */}
      <TitleBar frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
