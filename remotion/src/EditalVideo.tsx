import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { IntroScene } from "./scenes/IntroScene";
import { MetadataScene } from "./scenes/MetadataScene";
import { ResumoScene } from "./scenes/ResumoScene";
import { OutroScene } from "./scenes/OutroScene";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const editalData = {
  numero_edital: "Pregão Eletrônico nº 06/2024",
  orgao: "Secretaria de Gestão e Governo Digital",
  modalidade: "Pregão Eletrônico",
  objeto:
    "Contratação de empresa especializada na prestação de serviços continuados de apoio administrativo e operacional",
  valor_estimado: "R$ 2.450.000,00",
  criterio_julgamento: "Menor preço global",
  data_sessao: "15 de março de 2025, às 10h00",
  condicoes_habilitacao:
    "Regularidade fiscal e trabalhista, qualificação técnica com atestados de capacidade, e qualificação econômico-financeira",
  sistema_licitacao: "Bolsa Eletrônica de Compras – BEC/SP",
};

const COLORS = {
  bg: "#0f172a",
  bgLight: "#1e293b",
  accent: "#3b82f6",
  accentGlow: "#60a5fa",
  green: "#10b981",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  red: "#ef4444",
  cyan: "#06b6d4",
  white: "#f8fafc",
  muted: "#94a3b8",
};

export const EditalVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Persistent subtle grid background
  const gridOpacity = interpolate(frame, [0, 30], [0, 0.04], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily,
        overflow: "hidden",
      }}
    >
      {/* Subtle grid */}
      <AbsoluteFill style={{ opacity: gridOpacity }}>
        <svg width="1920" height="1080">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </AbsoluteFill>

      {/* Floating accent orbs */}
      <FloatingOrb x={1600} y={200} size={400} color={COLORS.accent} delay={0} />
      <FloatingOrb x={200} y={700} size={300} color={COLORS.purple} delay={60} />
      <FloatingOrb x={1400} y={800} size={250} color={COLORS.cyan} delay={120} />

      {/* Scenes */}
      <Sequence from={0} durationInFrames={120}>
        <IntroScene data={editalData} colors={COLORS} />
      </Sequence>

      <Sequence from={120} durationInFrames={300}>
        <MetadataScene data={editalData} colors={COLORS} />
      </Sequence>

      <Sequence from={420} durationInFrames={120}>
        <ResumoScene colors={COLORS} />
      </Sequence>

      <Sequence from={540} durationInFrames={60}>
        <OutroScene colors={COLORS} />
      </Sequence>
    </AbsoluteFill>
  );
};

const FloatingOrb = ({
  x,
  y,
  size,
  color,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin((frame + delay) * 0.015) * 20;
  const driftY = Math.cos((frame + delay) * 0.012) * 15;

  return (
    <div
      style={{
        position: "absolute",
        left: x + drift,
        top: y + driftY,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}15, transparent 70%)`,
        filter: "blur(40px)",
      }}
    />
  );
};
