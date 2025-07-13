import type {SpruchGenerator} from "../../../types/sprueche";

export const vernichtendSprueche: SpruchGenerator[] = [
  (params) => ({
    text: `${params.winnerNames.join(" & ")} richten ein Massaker an!`,
    icon: "🔪",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden gerade öffentlich hingerichtet!`,
    icon: "⚰️",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} zermalmen alles zu Staub!`,
    icon: "💣",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden atomisiert - das tat beim Zuschauen weh!`,
    icon: "☢️",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} veranstalten hier ein Blutbad!`,
    icon: "🩸",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden gerade aus dem Jass-Universum geschossen!`,
    icon: "🚀",
  }),
  (params) => ({
    text: `Brutaler geht's nicht! ${params.winnerNames.join(" & ")} zerstören alles!`,
    icon: "💥",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} sollten sich einen neuen Sport suchen...`,
    icon: "🏳️",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} spielen wie die Götter - das ist Jass-Perfektion!`,
    icon: "👹",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden gerade aus allen Dimensionen gejasst!`,
    icon: "🌪️",
  }),
  // NEUE EXTREME SPRÜCHE für 14+ Striche Differenz
  (params) => ({
    text: `APOKALYPSE NOW! ${params.winnerNames.join(" & ")} haben ${params.loserNames.join(" & ")} dem Erdboden gleichgemacht!`,
    icon: "🌋",
  }),
  (params) => ({
    text: `${params.loserNames.join(" & ")} wurden soeben ins Mittelalter zurückgejasst!`,
    icon: "⚔️",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben die Genfer Konvention des Jassens verletzt!`,
    icon: "🚨",
  }),
  (params) => ({
    text: `NOTARZT! ${params.loserNames.join(" & ")} brauchen psychologische Betreuung nach dieser Demütigung!`,
    icon: "🚑",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben ${params.loserNames.join(" & ")} in ihre Einzelteile zerlegt!`,
    icon: "🔨",
  }),
  (params) => ({
    text: `Das war kein Jass, das war eine EXEKUTION! ${params.loserNames.join(" & ")} R.I.P.`,
    icon: "💀",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben den JASS-THRON bestiegen - ${params.loserNames.join(" & ")} knien!`,
    icon: "👑",
  }),
  (params) => ({
    text: `UNFASSBAR! ${params.loserNames.join(" & ")} wurden gerade live im TV vernichtet!`,
    icon: "📺",
  }),
  (params) => ({
    text: `${params.winnerNames.join(" & ")} haben ${params.loserNames.join(" & ")} ins Schattenreich verbannt!`,
    icon: "🌑",
  }),
  (params) => ({
    text: `GAME OVER! ${params.loserNames.join(" & ")} wurden aus dem Spiel gelöscht!`,
    icon: "🎮",
  }),
];
