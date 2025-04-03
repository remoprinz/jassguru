import type {
  TeamPosition,
  StricheRecord,
  StrichTyp,
  StricheTotals,
  GameEntry, // GameEntry aus types/jass importieren
} from "../types/jass";

/**
 * Berechnet die Gesamtzahl der Striche für eine bestimmte Kategorie
 */
export const calculateStricheTotal = (striche: StricheRecord): number => {
  return Object.values(striche).reduce((sum, count) => sum + count, 0);
};

/**
 * Validiert einen Strich-Update und gibt den neuen Stand zurück
 */
export const validateStricheUpdate = (
  currentStriche: StricheRecord,
  type: StrichTyp,
  increment: number
): StricheRecord => {
  const newValue = currentStriche[type] + increment;
  if (newValue < 0) return currentStriche;

  return {
    ...currentStriche,
    [type]: newValue,
  };
};

/**
 * Aggregiert Striche über mehrere Spiele für eine bestimmte Position
 */
export const aggregateStricheForTeam = (
  games: GameEntry[],
  position: TeamPosition
): StricheRecord => {
  return games.reduce((total, game) => ({
    berg: total.berg + (game.teams[position].striche?.berg ?? 0),
    sieg: total.sieg + (game.teams[position].striche?.sieg ?? 0),
    matsch: total.matsch + (game.teams[position].striche?.matsch ?? 0),
    schneider: total.schneider + (game.teams[position].striche?.schneider ?? 0),
    kontermatsch: total.kontermatsch + (game.teams[position].striche?.kontermatsch ?? 0),
  }), {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0});
};

/**
 * Aggregiert Striche für beide Teams
 */
export const aggregateStricheTotal = (games: GameEntry[]): StricheTotals => {
  return {
    top: aggregateStricheForTeam(games, "top"),
    bottom: aggregateStricheForTeam(games, "bottom"),
  };
};

/**
 * Debug-Utility für Striche-Änderungen
 */
export const logStricheUpdate = (
  team: TeamPosition,
  type: StrichTyp,
  oldValue: number,
  newValue: number
): void => {
  console.log("🎲 Strich Update:", {
    team,
    type,
    oldValue,
    newValue,
    difference: newValue - oldValue,
  });
};

export const getNormalStricheCount = (striche: StricheRecord): number => {
  // Als "normal" zählen wir berg, sieg und schneider
  // (alles außer matsch und kontermatsch)
  return striche.berg + striche.sieg + striche.schneider;
};
