import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface Props {
  data: Record<string, string>;
  colors: Record<string, string>;
}

const items = [
  { key: "objeto", label: "OBJETO", icon: "📄", colorKey: "accent" },
  { key: "valor_estimado", label: "VALOR ESTIMADO", icon: "💰", colorKey: "green" },
  { key: "criterio_julgamento", label: "CRITÉRIO DE JULGAMENTO", icon: "⚖️", colorKey: "amber" },
  { key: "data_sessao", label: "DATA DA SESSÃO", icon: "📅", colorKey: "purple" },
  { key: "condicoes_habilitacao", label: "HABILITAÇÃO", icon: "🛡️", colorKey: "red" },
  { key: "sistema_licitacao", label: "ONDE LICITAR", icon: "🌐", colorKey: "cyan" },
];

export const MetadataScene = ({ data, colors }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {items.map((item, index) => {
        const startFrame = index * 45;
        const itemFrame = frame - startFrame;

        const s = spring({
          frame: itemFrame,
          fps,
          config: { damping: 18, stiffness: 100 },
        });

        const opacity = interpolate(s, [0, 1], [0, 1]);
        const slideX = interpolate(s, [0, 1], [-80, 0]);

        // Fade out previous items slightly
        const fadeOutStart = startFrame + 120;
        const fadeOut =
          index < items.length - 1
            ? interpolate(frame, [fadeOutStart, fadeOutStart + 30], [1, 0.3], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;

        const color = colors[item.colorKey];
        const isActive =
          frame >= startFrame && (index === items.length - 1 || frame < (index + 1) * 45 + 60);

        // Position: active item is centered, others stack
        const baseY = 200 + index * 120;
        const activeY = 300;
        const y = isActive
          ? interpolate(s, [0, 1], [baseY, activeY])
          : baseY;

        const scale = isActive ? interpolate(s, [0, 1], [0.9, 1]) : 0.85;

        if (itemFrame < -5) return null;

        return (
          <div
            key={item.key}
            style={{
              position: "absolute",
              left: 200,
              right: 200,
              top: isActive ? activeY : baseY,
              opacity: opacity * fadeOut,
              transform: `translateX(${slideX}px) scale(${scale})`,
            }}
          >
            {/* Card */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 30,
                padding: isActive ? "40px 50px" : "20px 30px",
                borderRadius: 20,
                background: isActive
                  ? `linear-gradient(135deg, ${color}15, ${color}08)`
                  : `${colors.bgLight}80`,
                border: `1px solid ${isActive ? `${color}40` : "transparent"}`,
                transition: "none",
              }}
            >
              {/* Icon */}
              <div
                style={{
                  fontSize: isActive ? 48 : 32,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: isActive ? 16 : 13,
                    fontWeight: 700,
                    letterSpacing: 3,
                    color: color,
                    marginBottom: isActive ? 12 : 6,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: isActive ? 30 : 18,
                    fontWeight: isActive ? 600 : 400,
                    color: colors.white,
                    lineHeight: 1.4,
                  }}
                >
                  {data[item.key]}
                </div>
              </div>

              {/* Accent bar */}
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    borderRadius: "20px 0 0 20px",
                    background: color,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
