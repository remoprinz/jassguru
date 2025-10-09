import type {SpruchGenerator} from "../../../types/sprueche";

export const knappSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben den Jass knapp für sich entschieden!`,
    icon: "",
  }),
  (params) => ({
    text: `Die Würfel sind knapp zu Gunsten von ${params.winnerNames.join(" & ")} gefallen!`,
    icon: "🎲",
  }),
  (params) => ({
    text: `Ein Kopf-an-Kopf-Rennen, aber ${params.winnerNames.join(" & ")} haben die Nase vorn!`,
    icon: "🏃",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} schnuppern am Sieg - aber es reicht nicht ganz`,
    icon: "👃",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} klettern knapp auf den Siegerthron.`,
    icon: "👑",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben den längeren Atem bewiesen!`,
    icon: "🌬️",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben etwas besser abglupft!`,
    icon: "",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben die wichtigen Trümpfe zur richtigen Zeit gespielt!`,
    icon: "♠️",
  }),
  (params) => ({
    text: `Knapp gewonnen ist auch gewonnen - gut gespielt, ${params.winnerNames.join(" & ")}!`,
    icon: "🎯",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben die entscheidenden Stiche gemacht!`,
    icon: "🃏",
  }),
];
