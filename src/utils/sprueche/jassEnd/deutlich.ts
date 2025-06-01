import type {SpruchGenerator} from "../../../types/sprueche";

export const deutlichSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(" & ")} lassen keine Zweifel am Sieg - das war deutlich!`,
    icon: "💪",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} müssen sich geschlagen geben - da war mehr drin!`,
    icon: "🤷",
  }),
  (params) => ({
    text: `Klarer Sieg für ${params.winnerNames.join(" & ")} - die Karten haben heute gesprochen!`,
    icon: "🎴",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben den Jass im Griff gehabt!`,
    icon: "✊",
  }),
  (params) => ({
    text: `Da hilft auch kein Jammern mehr - ${params.winnerNames.join(" & ")} waren einfach besser!`,
    icon: "😤",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} haben heute mit Trump statt Trumpf gespielt!`,
    icon: "🃏",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} zeigen, wie man einen Jass nach Hause bringt!`,
    icon: "🏆",
  }),
  (params) => ({
    text: `Die Rechnung geht auf: ${params.winnerNames.join(" & ")} gewinnen souverän!`,
    icon: "🧮",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} haben beim Ablupfen die Nerven verloren!`,
    icon: "🎯",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben das Spiel diktiert - verdienter Sieg!`,
    icon: "👊",
  }),
];
