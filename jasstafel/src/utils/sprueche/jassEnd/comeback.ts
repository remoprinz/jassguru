import type {SpruchGenerator, SpruchMitIcon} from "../../../types/sprueche";

export const comebackSprueche: SpruchGenerator[] = [
  (params): SpruchMitIcon | null => {
    // Prüfen ob es ein echtes Comeback über mehrere Spiele war
    const previousDiff = params.previousGesamtStand.team1 - params.previousGesamtStand.team2;
    const currentDiff = params.gesamtStand.team1 - params.gesamtStand.team2;

    // Comeback nur wenn vorher zurückgelegen und jetzt gewonnen
    const isComeback = (previousDiff < -3 && currentDiff > 0) || (previousDiff > 3 && currentDiff < 0);

    if (!isComeback) return null;

    return {
      text: `Was für eine Aufholjagd! ${params.winnerNames.join(" & ")} drehen einen ${Math.abs(previousDiff)}-Punkte-Rückstand!`,
      icon: "🥳",
    };
  },
  (params): SpruchMitIcon | null => {
    const previousDiff = params.previousGesamtStand.team1 - params.previousGesamtStand.team2;
    const currentDiff = params.gesamtStand.team1 - params.gesamtStand.team2;
    const isComeback = (previousDiff < -3 && currentDiff > 0) || (previousDiff > 3 && currentDiff < 0);
    if (!isComeback) return null;

    return {
      text: `${params.winnerNames.join(" & ")} beweisen Kampfgeist - vom Rückstand zum Sieg!`,
      icon: "🤩",
    };
  },
  // ... weitere Comeback-Sprüche ...
];
