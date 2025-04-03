import type {SpieltempoKategorie, SpruchGenerator} from "../../../types/sprueche";

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours} ${hours === 1 ? "Stunde" : "Stunden"} und ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
  }
  return `${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
};

const createZeitSpruch = (
  textTemplate: (duration: string) => string,
  icon: string
): SpruchGenerator =>
  (params) => {
    const duration = params.timerAnalytics.totalJassTime;
    return {
      text: textTemplate(formatDuration(duration)),
      icon,
    };
  };

export const jassEndZeitSprueche: Record<SpieltempoKategorie, SpruchGenerator[]> = {
  blitz_schnell: [
    createZeitSpruch(
      (time) => `Rasanter Jass in nur ${time}!`,
      "🏃"
    ),
    createZeitSpruch(
      (time) => `Schneller als der Blitz: ${time} von Start bis Ziel!`,
      "⚡"
    ),
    createZeitSpruch(
      (time) => `Express-Jass in ${time} - Rekordverdächtig!`,
      "💨"
    ),
  ],
  schnell: [
    createZeitSpruch(
      (time) => `Zügig durchgespielt in ${time}!`,
      "🐇"
    ),
    createZeitSpruch(
      (time) => `Ein flottes Spielchen von ${time}`,
      "🐇"
    ),
    createZeitSpruch(
      (time) => `${time} - das nenne ich effizientes Jassen!`,
      "🐇"
    ),
  ],
  normal: [
    createZeitSpruch(
      (time) => `Ein perfekt getakteter Jass von ${time}`,
      "⏱"
    ),
    createZeitSpruch(
      (time) => `${time} geselliges Jassen - wie es sein soll!`,
      "🥳"
    ),
    createZeitSpruch(
      (time) => `${time} Jassvergnügen in bester Gesellschaft`,
      "🍻"
    ),
  ],
  gemütlich: [
    createZeitSpruch(
      (time) => `Gemütliche ${time} mit viel Zeit zum Überlegen`,
      "🦥"
    ),
    createZeitSpruch(
      (time) => `${time} entspanntes Jassen - Qualität braucht Zeit!`,
      "🐢"
    ),
    createZeitSpruch(
      (time) => `Ein gediegener Jass von ${time} - herrlich!`,
      "🐌"
    ),
  ],
  marathon: [
    createZeitSpruch(
      (time) => `Ein epischer Jass-Marathon von ${time}!`,
      "🏃"
    ),
    createZeitSpruch(
      (time) => `Legendäre ${time} Jassvergnügen!`,
      "👑"
    ),
    createZeitSpruch(
      (time) => `${time} purer Jass-Genuss - ein Fest!`,
      "🏃"
    ),
    createZeitSpruch(
      (time) => `Ein Marathon-Jass für die Geschichtsbücher: ${time}!`,
      "📚"
    ),
  ],
};
