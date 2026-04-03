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

const FRAMES_PER_ITEM = 50;

export const MetadataScene = ({ data, colors }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentIndex = Math.min(
    Math.floor(frame / FRAMES_PER_ITEM),
    items.length - 1
  );

  const itemFrame = frame - currentIndex * FRAMES_PER_ITEM;
  const item = items[currentIndex];
  const color = colors[item.colorKey];

  // Enter animation
  const enterSpring = spring({
    frame: itemFrame,
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  const slideX = interpolate(enterSpring, [0, 1], [100, 0]);
  const opacity = interpolate(enterSpring, [0, 1], [0, 1]);

  // Exit animation (fade out before next item)
  const exitStart = FRAMES_PER_ITEM - 10;
  const isLast = currentIndex === items.length - 1;
  const exitOpacity = isLast
    ? 1
    : interpolate(itemFrame, [exitStart, FRAMES_PER_ITEM], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Progress dots
  const progressDots = items.map((_, i) => i <= currentIndex);

  return (
    <AbsoluteFill>
      {/* Progress indicator */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {progressDots.map((active, i) => (
          <div
            key={i}
            style={{
              width: active && i === currentIndex ? 40 : 12,
              height: 12,
              borderRadius: 6,
              background: active
                ? colors[items[i].colorKey]
                : `${colors.muted}30`,
              transition: "none",
            }}
          />
        ))}
      </div>

      {/* Icon */}
      <div
        style={{
          position: "absolute",
          top: 220,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 72,
          opacity: opacity * exitOpacity,
          transform: `translateX(${slideX}px)`,
        }}
      >
        {item.icon}
      </div>

      {/* Label */}
      <div
        style={{
          position: "absolute",
          top: 330,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: opacity * exitOpacity,
          transform: `translateX(${slideX * 0.7}px)`,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 4,
            color: color,
          }}
        >
          {item.label}
        </div>
      </div>

      {/* Content card */}
      <div
        style={{
          position: "absolute",
          top: 400,
          left: 200,
          right: 200,
          opacity: opacity * exitOpacity,
          transform: `translateX(${slideX * 0.5}px)`,
        }}
      >
        <div
          style={{
            padding: "50px 60px",
            borderRadius: 24,
            background: `linear-gradient(135deg, ${color}12, ${color}05)`,
            border: `1px solid ${color}30`,
            position: "relative",
          }}
        >
          {/* Left accent bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 20,
              bottom: 20,
              width: 4,
              borderRadius: 4,
              background: color,
            }}
          />
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: colors.white,
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {data[item.key]}
          </div>
        </div>
      </div>

      {/* Step counter */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          right: 120,
          opacity: opacity * exitOpacity * 0.5,
        }}
      >
        <span
          style={{
            fontSize: 18,
            color: colors.muted,
            fontWeight: 600,
          }}
        >
          {currentIndex + 1} / {items.length}
        </span>
      </div>
    </AbsoluteFill>
  );
};
