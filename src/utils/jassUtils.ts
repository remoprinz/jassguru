/**
 * Generiert eine kanonische (d.h. immer gleiche, unabhängig von der Reihenfolge der IDs) Paarungs-ID für zwei Spieler.
 * @param playerId1 Die ID des ersten Spielers.
 * @param playerId2 Die ID des zweiten Spielers.
 * @returns Eine Paarungs-ID im Format "id1_id2" (alphabetisch sortiert) oder einen Fehlerstring, falls IDs fehlen.
 */
export const generatePairingId = (playerId1: string, playerId2: string): string => {
  if (!playerId1 || !playerId2) {
    console.warn("generatePairingId: Eine oder beide PlayerIDs fehlen.", { playerId1, playerId2 });
    // Rückgabe eines Strings, der das Problem anzeigt, anstatt einen Fehler zu werfen,
    // um den Programmfluss nicht zwingend zu unterbrechen, aber das Problem erkennbar zu machen.
    return "invalid_pairing_missing_ids";
  }
  // Sicherstellen, dass die Reihenfolge immer gleich ist, um eine kanonische ID zu erhalten
  const ids = [playerId1, playerId2].sort();
  return `${ids[0]}_${ids[1]}`;
};

// Hier könnten weitere Jass-spezifische Utility-Funktionen stehen... 