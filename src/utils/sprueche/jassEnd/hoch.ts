import type {SpruchGenerator} from "../../../types/sprueche";

export const hochSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(" & ")} dominieren den Jass!`,
    icon: "👑",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} haben vergeblich auf ein Comeback gehofft...`,
    icon: "😔",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben heute alle Trümpfe in der Hand gehabt!`,
    icon: "🎯",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden regelrecht übertrumpft!`,
    icon: "💥",
  }),
  (params) => ({
    text: `Eine Jass-Lektion von ${params.winnerNames.join(" & ")}!`,
    icon: "📚",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} hatten heute keine Chance gegen diese Kartenkunst!`,
    icon: "🎴",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben die Karten heute tanzen lassen!`,
    icon: "💃",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden heute richtig alt aussehen gelassen!`,
    icon: "👴",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben heute alle Register gezogen!`,
    icon: "🎪",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden heute regelrecht vorgeführt!`,
    icon: "🎭",
  }),
];
