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

export const OutroScene = ({ colors }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const lineW = interpolate(frame, [10, 40], [0, 500], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          textAlign: "center",
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`,
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: colors.white,
            marginBottom: 20,
          }}
        >
          Vade Mecum em Licitações
        </div>
        <div
          style={{
            width: lineW,
            height: 3,
            margin: "0 auto 24px",
            background: `linear-gradient(90deg, ${colors.accent}, ${colors.purple})`,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            fontSize: 22,
            color: colors.muted,
            fontWeight: 400,
          }}
        >
          SGGD SP · Análise automatizada de editais
        </div>
      </div>
    </AbsoluteFill>
  );
};
