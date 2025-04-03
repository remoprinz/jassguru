import type {SpruchGenerator} from "../../../types/sprueche";

export const schneiderSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Autsch! ${params.loserNames.join(" & ")} wurden beschneidert! Das tut weh!`,
    icon: "✂️",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} haben gekämpft wie das tapfere Schneiderlein... am Ende wurden sie trotzdem beschnitten!`,
    icon: "✂️",
  }),
  // ... weitere Schneider-Sprüche ...
];
