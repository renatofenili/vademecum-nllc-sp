import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface Props {
  data: { numero_edital: string; orgao: string; modalidade: string };
  colors: Record<string, string>;
}

export const IntroScene = ({ data, colors }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Line sweep
  const lineWidth = interpolate(frame, [10, 50], [0, 1920], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge
  const badgeSpring = spring({ frame: frame - 20, fps, config: { damping: 15, stiffness: 120 } });

  // Title
  const titleSpring = spring({ frame: frame - 35, fps, config: { damping: 20, stiffness: 100 } });
  const titleY = interpolate(titleSpring, [0, 1], [60, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Subtitle
  const subSpring = spring({ frame: frame - 50, fps, config: { damping: 20, stiffness: 100 } });
  const subY = interpolate(subSpring, [0, 1], [40, 0]);
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);

  // Orgao
  const orgaoSpring = spring({ frame: frame - 65, fps, config: { damping: 20 } });

  // Bottom bar
  const barWidth = interpolate(frame, [80, 110], [0, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Accent line */}
      <div
        style={{
          position: "absolute",
          top: 340,
          left: (1920 - lineWidth) / 2,
          width: lineWidth,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
        }}
      />

      {/* Badge */}
      <div
        style={{
          position: "absolute",
          top: 370,
          opacity: badgeSpring,
          transform: `scale(${interpolate(badgeSpring, [0, 1], [0.8, 1])})`,
        }}
      >
        <div
          style={{
            padding: "8px 24px",
            borderRadius: 24,
            background: `${colors.accent}20`,
            border: `1px solid ${colors.accent}40`,
            color: colors.accentGlow,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Análise em Linguagem Simples
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 440,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
          width: "100%",
          padding: "0 200px",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: colors.white,
            lineHeight: 1.2,
          }}
        >
          {data.numero_edital}
        </div>
      </div>

      {/* Modalidade */}
      <div
        style={{
          position: "absolute",
          top: 540,
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: colors.muted,
            fontWeight: 400,
          }}
        >
          {data.modalidade}
        </div>
      </div>

      {/* Orgao */}
      <div
        style={{
          position: "absolute",
          top: 610,
          opacity: orgaoSpring,
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: colors.accent,
            fontWeight: 600,
          }}
        >
          {data.orgao}
        </div>
      </div>

      {/* Bottom accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: (1920 - barWidth) / 2,
          width: barWidth,
          height: 3,
          background: `linear-gradient(90deg, ${colors.accent}, ${colors.purple})`,
          borderRadius: 2,
        }}
      />
    </AbsoluteFill>
  );
};
