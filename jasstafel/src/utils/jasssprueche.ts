import type {
  GameEndKategorie,
  JassEndKategorie,
  SpruchMitIcon,
  SpruchGenerator,
  KombinierterSpruch,
  ErweiterterKombinierterSpruch,
  SpieltempoKategorie,
} from "@/types/sprueche";
import type {
  GameEndType,
  TimerAnalytics,
} from "@/types/jass";
import type {TeamCalculationResult} from "./teamCalculations";
import {
  gameEndSprueche,
  jassEndSprueche,
  zeitSprueche,
} from "./sprueche";
import {resultatDetailsSprueche} from "./sprueche/jassEnd/details/resultatDetails";
import {matchDetailsSprueche} from "./sprueche/jassEnd/details/matchDetails";

// Parameter Interface (erweitert von TeamCalculationResult)
export interface JassSpruchParams extends Pick<TeamCalculationResult,
  "stricheDifference" |
  "pointDifference" |
  "winnerNames" |
  "loserNames" |
  "totalMatsche" |
  "gameStats" |
  "gesamtStand" |
  "previousGesamtStand"
> {
  isUnentschieden: boolean;
  isStricheMode: boolean;
  type: GameEndType;
  timerAnalytics: TimerAnalytics;
  isSchneider: boolean;
  matchCount: {
    team1: number;
    team2: number;
  };
}

// Schwellwerte für die Kategorisierung (unverändert)
const ERGEBNIS_THRESHOLDS = {
  GAME: {
    KNAPP_GESAMT: 2,
    DOMINIEREND: 5,
    EHRENPUNKTE: 6,
  },
  JASS: {
    HAUCHDÜNN: 1,
    KNAPP: 3,
    DEUTLICH: 5,
    HOCH: 7,
    SEHR_HOCH: 9,
    VERNICHTEND: 10,
  },
} as const;

// Zeit-Kategorien (unverändert)
const TIME_THRESHOLDS = {
  GAME: {
    BLITZ: 20 * 60 * 1000,
    SCHNELL: 40 * 60 * 1000,
    NORMAL: 80 * 60 * 1000,
    GEMÜTLICH: Number.MAX_VALUE,
  },
  JASS: {
    BLITZ: 60 * 60 * 1000,
    SCHNELL: 90 * 60 * 1000,
    NORMAL: 3 * 60 * 60 * 1000,
    GEMÜTLICH: 5 * 60 * 60 * 1000,
    MARATHON: Number.MAX_VALUE,
  },
} as const;

// Helper für zufällige Spruchauswahl
function getRandomSpruch(sprueche: SpruchGenerator[], params: JassSpruchParams): SpruchMitIcon | undefined {
  if (!sprueche || sprueche.length === 0) return undefined;

  const validSprueche = sprueche
    .map((generator) => generator(params))
    .filter((spruch): spruch is SpruchMitIcon => spruch !== null);

  if (validSprueche.length === 0) return undefined;

  return validSprueche[Math.floor(Math.random() * validSprueche.length)];
}

// Hauptfunktion für die Kategoriebestimmung (unverändert)
function getGameEndKategorie(params: JassSpruchParams): (GameEndKategorie | JassEndKategorie)[] {
  const {isSchneider, gameStats, gesamtStand, type, isUnentschieden, previousGesamtStand} = params;

  if (isSchneider) return ["schneider"];

  const differenz = Math.abs(gesamtStand.team1 - gesamtStand.team2);

  if (type === "jassEnd") {
    if (isUnentschieden) return ["unentschieden"];

    // Comeback-Check für jassEnd
    const previousDiff = previousGesamtStand.team1 - previousGesamtStand.team2;
    const currentDiff = gesamtStand.team1 - gesamtStand.team2;
    const isComeback = (previousDiff < -3 && currentDiff > 0) || (previousDiff > 3 && currentDiff < 0);

    if (isComeback) return ["comeback"];

    if (differenz <= ERGEBNIS_THRESHOLDS.JASS.HAUCHDÜNN) return ["hauchdünn"];
    if (differenz <= ERGEBNIS_THRESHOLDS.JASS.KNAPP) return ["knapp"];
    if (differenz <= ERGEBNIS_THRESHOLDS.JASS.DEUTLICH) return ["deutlich"];
    if (differenz <= ERGEBNIS_THRESHOLDS.JASS.HOCH) return ["hoch"];
    if (differenz <= ERGEBNIS_THRESHOLDS.JASS.SEHR_HOCH) return ["sehr_hoch"];
    return ["vernichtend"];
  } else {
    const kategorien: GameEndKategorie[] = [];
    if (gameStats.isComeback) kategorien.push("comeback");
    if (gameStats.führungsWechsel) kategorien.push("führungswechsel");
    if (differenz <= ERGEBNIS_THRESHOLDS.GAME.KNAPP_GESAMT) kategorien.push("knapp_gesamt");
    if (differenz >= ERGEBNIS_THRESHOLDS.GAME.DOMINIEREND) kategorien.push("dominierend");
    if (differenz > ERGEBNIS_THRESHOLDS.GAME.EHRENPUNKTE) kategorien.push("ehrenpunkte");
    return kategorien.length > 0 ? kategorien : ["knapp_gesamt"];
  }
}

// Neue Funktion für erweiterte Spruchkombination
function getErweiterteSpruchKombination(params: JassSpruchParams): ErweiterterKombinierterSpruch {
  const hauptKategorie = getGameEndKategorie(params)[0];
  const hauptSpruch = getEinzelSpruch(params, hauptKategorie);

  // Nur für JassEnd: Resultat- und Spielstatistik-Details
  const resultatDetails = params.type === "jassEnd" ?
    getRandomSpruch(resultatDetailsSprueche, params) :
    undefined;

  // Spielstatistik basierend auf GameStats
  const spielstatistik = params.type === "jassEnd" && params.gameStats.führungsWechsel ?
    {
      text: `${params.gameStats.führungsWechsel ? "Mit Führungswechsel" : "Durchgehende Führung"}`,
      icon: "📊",
    } :
    undefined;

  // Match-Details immer generieren (auch bei 0 Matschen)
  const matchDetails = getRandomSpruch(matchDetailsSprueche, params);

  // Zeit-Kategorie
  const zeitKategorie = getTimeCategory(
    params.timerAnalytics.totalJassTime,
    params.type
  );
  const zeitSpruch = getZeitSpruch(params, zeitKategorie);

  return {
    hauptSpruch,
    resultatDetails,
    spielstatistik,
    zeitSpruch,
    matchDetails,
  };
}

// Formatierung der erweiterten Sprüche
function formatiereErweiterteSprüche(sprueche: ErweiterterKombinierterSpruch): SpruchMitIcon {
  const parts: string[] = [];
  let icons = "";

  // Hauptspruch immer zuerst
  parts.push(sprueche.hauptSpruch.text);
  icons += sprueche.hauptSpruch.icon;

  // Resultat-Details (nur bei JassEnd)
  if (sprueche.resultatDetails) {
    parts.push(sprueche.resultatDetails.text);
    icons += sprueche.resultatDetails.icon;
  }

  // Match-Details wenn vorhanden
  if (sprueche.matchDetails) {
    parts.push(sprueche.matchDetails.text);
    icons += sprueche.matchDetails.icon;
  }

  // Spielstatistik wenn relevant
  if (sprueche.spielstatistik) {
    parts.push(sprueche.spielstatistik.text);
    icons += sprueche.spielstatistik.icon;
  }

  // Zeit immer am Ende
  if (sprueche.zeitSpruch) {
    parts.push(sprueche.zeitSpruch.text);
    icons += sprueche.zeitSpruch.icon;
  }

  return {
    text: parts.join("! ") + "!",
    icon: icons,
  };
}

// Einzelspruch Helper
function getEinzelSpruch(params: JassSpruchParams, kategorie: GameEndKategorie | JassEndKategorie): SpruchMitIcon {
  // Type Guard für die Kategorie
  const isJassEndKategorie = (kat: string): kat is JassEndKategorie =>
    Object.keys(jassEndSprueche).includes(kat);

  const sprueche = params.type === "jassEnd" && isJassEndKategorie(kategorie) ?
    jassEndSprueche[kategorie] :
    gameEndSprueche[kategorie as GameEndKategorie];

  const spruch = getRandomSpruch(sprueche, params);
  if (!spruch) throw new Error(`Keine Sprüche für Kategorie ${kategorie} gefunden`);
  return spruch;
}

// Vereinfachte Zeit-Kategorisierung mit Logging
function getTimeCategory(duration: number, type: GameEndType): SpieltempoKategorie {
  const thresholds = type === "jassEnd" ? TIME_THRESHOLDS.JASS : TIME_THRESHOLDS.GAME;

  // Vereinfachtes Logging
  console.log(`[Zeit-Kategorie] ${type}:`, {
    duration: `${(duration / 1000 / 60).toFixed(2)} Minuten`,
  });

  if (duration >= thresholds.GEMÜTLICH) return "marathon";
  if (duration >= thresholds.NORMAL) return "gemütlich";
  if (duration >= thresholds.SCHNELL) return "normal";
  if (duration >= thresholds.BLITZ) return "schnell";
  return "blitz_schnell";
}

// Zeit-Spruch Helper
function getZeitSpruch(params: JassSpruchParams, kategorie: SpieltempoKategorie): SpruchMitIcon | undefined {
  const sprueche = zeitSprueche[params.type === "jassEnd" ? "jassEnd" : "gameEnd"][kategorie];
  return getRandomSpruch(sprueche, params);
}

// Kombinationsformatierer für GameEnd
function formatiereKombiniertenSpruch(spruch: KombinierterSpruch): SpruchMitIcon {
  const parts: string[] = [];
  let icons = "";

  parts.push(spruch.hauptSpruch.text);
  icons += spruch.hauptSpruch.icon;

  if (spruch.zusatzSpruch) {
    parts.push(spruch.zusatzSpruch.text);
    icons += spruch.zusatzSpruch.icon;
  }

  if (spruch.zeitSpruch) {
    parts.push(spruch.zeitSpruch.text);
    icons += spruch.zeitSpruch.icon;
  }

  return {
    text: parts.join("! ") + "!",
    icon: icons,
  };
}

// Hauptfunktion für Sprüche mit Timer-Integration
export function getJassSpruch(params: JassSpruchParams): SpruchMitIcon {
  const {totalJassTime, currentGameDuration} = params.timerAnalytics;

  console.log("[Spruch-Parameter]", {
    type: params.type,
    analytics: {
      currentGameDuration: `${(currentGameDuration / 1000 / 60).toFixed(2)} Minuten`,
      totalJassTime: `${(totalJassTime / 1000 / 60).toFixed(2)} Minuten`,
    },
  });

  if (params.type === "jassEnd") {
    const kombiniert = getErweiterteSpruchKombination(params);
    const zeitKategorie = getTimeCategory(totalJassTime, params.type);

    return formatiereErweiterteSprüche({
      ...kombiniert,
      zeitSpruch: getZeitSpruch(params, zeitKategorie),
    });
  }

  // GameEnd Logik
  const kategorien = getGameEndKategorie(params);
  const hauptSpruch = getEinzelSpruch(params, kategorien[0]);
  const zeitKategorie = getTimeCategory(currentGameDuration, "gameEnd");

  return formatiereKombiniertenSpruch({
    hauptSpruch,
    zeitSpruch: getZeitSpruch(params, zeitKategorie),
  });
}
