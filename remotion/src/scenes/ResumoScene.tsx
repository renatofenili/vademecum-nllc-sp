import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface Props {
  colors: Record<string, string>;
}

const resumoText =
  "Este edital busca contratar uma empresa para prestar serviços de apoio administrativo e operacional de forma continuada. Qualquer empresa que atenda aos requisitos de habilitação pode participar pela plataforma BEC/SP. O critério é menor preço global, e a sessão acontece em 15 de março de 2025.";

export const ResumoScene = ({ colors }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const textSpring = spring({ frame: frame - 20, fps, config: { damping: 25, stiffness: 80 } });

  // Typewriter effect
  const chars = Math.floor(
    interpolate(frame, [25, 100], [0, resumoText.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const displayText = resumoText.slice(0, chars);

  // Cursor blink
  const cursorVisible = chars < resumoText.length && Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 280,
          textAlign: "center",
          width: "100%",
          opacity: headerSpring,
          transform: `translateY(${interpolate(headerSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 32px",
            borderRadius: 16,
            background: `${colors.accent}15`,
            border: `1px solid ${colors.accent}30`,
          }}
        >
          <span style={{ fontSize: 32 }}>📝</span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: colors.accentGlow,
              letterSpacing: 2,
            }}
          >
            EM LINGUAGEM SIMPLES
          </span>
        </div>
      </div>

      {/* Text card */}
      <div
        style={{
          position: "absolute",
          top: 400,
          left: 250,
          right: 250,
          opacity: textSpring,
          transform: `translateY(${interpolate(textSpring, [0, 1], [40, 0])}px)`,
        }}
      >
        <div
          style={{
            padding: "50px 60px",
            borderRadius: 24,
            background: `linear-gradient(135deg, ${colors.bgLight}, ${colors.bg})`,
            border: `1px solid ${colors.accent}20`,
          }}
        >
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.7,
              color: colors.white,
              fontWeight: 400,
            }}
          >
            {displayText}
            {cursorVisible && (
              <span style={{ color: colors.accent, fontWeight: 300 }}>|</span>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
