import { Composition } from "remotion";
import { EditalVideo } from "./EditalVideo";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={EditalVideo}
    durationInFrames={600}
    fps={30}
    width={1920}
    height={1080}
  />
);
