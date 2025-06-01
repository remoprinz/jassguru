import type {SpruchGenerator} from "../../../types/sprueche";

export const matschSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `Ein Matsch für ${params.winnerNames.join(" & ")}! Weiter so!`,
    icon: "👍",
  }),
  () => ({
    text: "Matsch! Das gibt ordentlich Punkte!",
    icon: "👍",
  }),
];
