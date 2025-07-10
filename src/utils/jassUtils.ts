import type { CompletedGameSummary, EventCounts, EventCountRecord, TeamScores, StricheRecord, RoundEntry, TrumpfCountsByPlayer, RoundDurationsByPlayer } from '@/types/jass';
import { isJassRoundEntry } from '@/types/jass';

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

/**
 * Berechnet die Event-Zähler aus einer abgeschlossenen Spielzusammenfassung.
 * Diese Funktion analysiert finalStriche und finalScores, um die tatsächlichen 
 * Ereignisse (Berg, Sieg, Matsch, etc.) zu bestimmen, anstatt nur die Striche zu zählen.
 * 
 * @param gameSummary Die Spielzusammenfassung, aus der die Events extrahiert werden sollen
 * @returns EventCounts Objekt mit bottom und top Event-Zählern
 */
export const calculateEventCounts = (gameSummary: CompletedGameSummary): EventCounts => {
  const { finalStriche, finalScores, roundHistory } = gameSummary;
  
  // Initialisiere Event-Zähler
  const bottomEvents: EventCountRecord = {
    sieg: 0,
    berg: 0,
    matsch: 0,
    kontermatsch: 0,
    schneider: 0
  };
  
  const topEvents: EventCountRecord = {
    sieg: 0,
    berg: 0,
    matsch: 0,
    kontermatsch: 0,
    schneider: 0
  };

  // 1. ✅ MAXIMAL ROBUST: Zähle Matsch/Kontermatsch Events direkt aus der roundHistory
  if (roundHistory && Array.isArray(roundHistory)) {
    roundHistory.forEach((round, index) => {

      
      // ✅ MAXIMAL ROBUSTE Prüfung: Mehrere Zugriffsmuster ausprobieren
      let strichInfo: { team?: string; type?: string } | null = null;
      
      // Muster 1: Direkter Zugriff auf strichInfo
      if (round && typeof round === 'object' && 'strichInfo' in round && round.strichInfo) {
        strichInfo = round.strichInfo as { team?: string; type?: string };
      }
      // Muster 2: Nested object prüfen (falls die Struktur anders ist)
      else if (round && typeof round === 'object' && (round as any).roundState?.strichInfo) {
        strichInfo = (round as any).roundState.strichInfo as { team?: string; type?: string };
      }
      // Muster 3: Alternative Struktur-Prüfung
      else if (round && typeof round === 'object') {
        // Prüfe alle Properties der Runde auf strichInfo
        const roundObj = round as any;
        for (const key in roundObj) {
          if (key.includes('strich') && roundObj[key] && typeof roundObj[key] === 'object') {
            if (roundObj[key].team && roundObj[key].type) {
              strichInfo = roundObj[key];
              break;
            }
          }
        }
      }
      
      // ✅ Wenn wir strichInfo gefunden haben, Events zählen
      if (strichInfo && strichInfo.type && strichInfo.team) {
        const teamKey = strichInfo.team as 'top' | 'bottom';
        
        if (strichInfo.type === 'matsch') {
          if (teamKey === 'bottom') {
            bottomEvents.matsch++;
            if (process.env.NODE_ENV === 'development') {
              console.log(`[calculateEventCounts] MATSCH für bottom gefunden in Runde ${index}`);
            }
          } else if (teamKey === 'top') {
            topEvents.matsch++;
            if (process.env.NODE_ENV === 'development') {
              console.log(`[calculateEventCounts] MATSCH für top gefunden in Runde ${index}`);
            }
          }
        } else if (strichInfo.type === 'kontermatsch') {
          if (teamKey === 'bottom') {
            bottomEvents.kontermatsch++;
            if (process.env.NODE_ENV === 'development') {
              console.log(`[calculateEventCounts] KONTERMATSCH für bottom gefunden in Runde ${index}`);
            }
          } else if (teamKey === 'top') {
            topEvents.kontermatsch++;
            if (process.env.NODE_ENV === 'development') {
              console.log(`[calculateEventCounts] KONTERMATSCH für top gefunden in Runde ${index}`);
            }
          }
        }
      }
    });
  }

  // 2. SIEG: Wird aus finalStriche gelesen. Nur ein Team kann sich bedanken.
  if (finalStriche.bottom.sieg > 0) {
    bottomEvents.sieg = 1;
  } else if (finalStriche.top.sieg > 0) {
    topEvents.sieg = 1;
  }

  // 3. BERG: Wird aus finalStriche gelesen. Nur ein Team kann Berg ansagen.
  if (finalStriche.bottom.berg > 0) {
    bottomEvents.berg = 1; // Ein Berg-Event pro Spiel
  } else if (finalStriche.top.berg > 0) {
    topEvents.berg = 1; // Ein Berg-Event pro Spiel
  }

  // 4. SCHNEIDER: Wird aus finalStriche gelesen. Nur das gewinnende Team kann Schneider haben.
  if (finalStriche.bottom.schneider > 0) {
    bottomEvents.schneider = 1; // Ein Schneider-Event pro Spiel
  } else if (finalStriche.top.schneider > 0) {
    topEvents.schneider = 1; // Ein Schneider-Event pro Spiel
  }

  return {
    bottom: bottomEvents,
    top: topEvents
  };
};

/**
 * Berechnet alle Aggregationen für ein abgeschlossenes Spiel aus der roundHistory
 * Diese Funktion ersetzt multiple Iterationen durch eine einzige, effiziente Durchlauf
 * @param roundHistory Die Runden-History des Spiels
 * @returns Objekt mit allen aggregierten Daten
 */
export const calculateGameAggregations = (
  roundHistory: RoundEntry[]
): {
  totalRoundDurationMillis: number;
  trumpfCountsByPlayer: TrumpfCountsByPlayer;
  roundDurationsByPlayer: RoundDurationsByPlayer;
  Rosen10player: string | null;
} => {
  let totalRoundDurationMillis = 0;
  const trumpfCountsByPlayer: TrumpfCountsByPlayer = {};
  const roundDurationsByPlayer: RoundDurationsByPlayer = {};
  let Rosen10player: string | null = null;
  let jassRoundIndex = 0; // Separater Index nur für JassRounds

  // Eine einzige Iteration durch alle Runden
  roundHistory.forEach((round) => {
    // Nur bei JassRoundEntry haben wir die Felder, die wir brauchen
    if (!isJassRoundEntry(round)) {
      return; // Skip WeisRoundEntry
    }

    // Nach der Type Guard ist round jetzt typisiert als JassRoundEntry
    const jassRound = round;

    // Rundendauer aggregieren (prüfen, ob das Feld existiert)
    const durationMillis = (jassRound as any).durationMillis;
    if (durationMillis && typeof durationMillis === 'number') {
      totalRoundDurationMillis += durationMillis;
    }

    // Spieler-spezifische Rundendauer
    if (jassRound.currentPlayer && durationMillis && typeof durationMillis === 'number') {
      const playerId = jassRound.currentPlayer.toString(); // Konvertiere PlayerNumber zu string
      
      if (!roundDurationsByPlayer[playerId]) {
        roundDurationsByPlayer[playerId] = {
          totalDuration: 0,
          roundCount: 0
        };
      }
      
      roundDurationsByPlayer[playerId].totalDuration += durationMillis;
      roundDurationsByPlayer[playerId].roundCount += 1;
    }

    // Trumpf-Zählungen pro Spieler (farbe ist garantiert bei JassRoundEntry)
    if (jassRound.farbe && jassRound.currentPlayer) {
      const playerId = jassRound.currentPlayer.toString();
      const farbe = jassRound.farbe.toLowerCase();
      
      if (!trumpfCountsByPlayer[playerId]) {
        trumpfCountsByPlayer[playerId] = {};
      }
      
      if (!trumpfCountsByPlayer[playerId][farbe]) {
        trumpfCountsByPlayer[playerId][farbe] = 0;
      }
      
      trumpfCountsByPlayer[playerId][farbe] += 1;
    }

    // Rosen10player: Der Spieler der allerersten JassRunde
    if (jassRoundIndex === 0 && jassRound.currentPlayer && jassRound.farbe) {
      // Hier brauchen wir die Player-ID, nicht die PlayerNumber
      // Diese Logik wird später beim tatsächlichen Spielabschluss implementiert,
      // wo wir Zugriff auf die Player-Mappings haben
      Rosen10player = jassRound.currentPlayer.toString(); // Placeholder - wird später gemappt
    }

    jassRoundIndex++; // Nur für JassRounds erhöhen
  });

  return {
    totalRoundDurationMillis,
    trumpfCountsByPlayer,
    roundDurationsByPlayer,
    Rosen10player
  };
};

/**
 * Aggregiert Daten von mehreren abgeschlossenen Spielen zu Session-Level Daten
 * @param completedGames Array aller abgeschlossenen Spiele der Session
 * @param playerNumberToIdMap Mapping von PlayerNumber zu Player Document ID
 * @returns Session-Level Aggregationen
 */
export const calculateSessionAggregations = (
  completedGames: CompletedGameSummary[],
  playerNumberToIdMap: Map<number, string>
): {
  totalRounds: number;
  aggregatedTrumpfCountsByPlayer: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer: RoundDurationsByPlayer;
  Rosen10player: string | null;
} => {
  let totalRounds = 0;
  const aggregatedTrumpfCountsByPlayer: TrumpfCountsByPlayer = {};
  const aggregatedRoundDurationsByPlayer: RoundDurationsByPlayer = {};
  let Rosen10player: string | null = null;

  // Iteriere durch alle Spiele der Session
  completedGames.forEach((game, gameIndex) => {
    // Addiere Runden dieses Spiels
    if (game.roundHistory) {
      const jassRoundsCount = game.roundHistory.filter(round => isJassRoundEntry(round)).length;
      totalRounds += jassRoundsCount;
    }

    // Trumpf-Counts pro Spieler aggregieren
    if (game.trumpfCountsByPlayer) {
      Object.entries(game.trumpfCountsByPlayer).forEach(([playerIdStr, trumpfCounts]) => {
        // Konvertiere PlayerNumber zu Player Document ID
        const playerNum = parseInt(playerIdStr, 10);
        const actualPlayerId = playerNumberToIdMap.get(playerNum) || playerIdStr;
        
        if (!aggregatedTrumpfCountsByPlayer[actualPlayerId]) {
          aggregatedTrumpfCountsByPlayer[actualPlayerId] = {};
        }
        
        Object.entries(trumpfCounts).forEach(([farbe, count]) => {
          if (!aggregatedTrumpfCountsByPlayer[actualPlayerId][farbe]) {
            aggregatedTrumpfCountsByPlayer[actualPlayerId][farbe] = 0;
          }
          aggregatedTrumpfCountsByPlayer[actualPlayerId][farbe] += count;
        });
      });
    }

    // Rundendauer pro Spieler aggregieren
    if (game.roundDurationsByPlayer) {
      Object.entries(game.roundDurationsByPlayer).forEach(([playerIdStr, durations]) => {
        // Konvertiere PlayerNumber zu Player Document ID
        const playerNum = parseInt(playerIdStr, 10);
        const actualPlayerId = playerNumberToIdMap.get(playerNum) || playerIdStr;
        
        if (!aggregatedRoundDurationsByPlayer[actualPlayerId]) {
          aggregatedRoundDurationsByPlayer[actualPlayerId] = {
            totalDuration: 0,
            roundCount: 0
          };
        }
        
        aggregatedRoundDurationsByPlayer[actualPlayerId].totalDuration += durations.totalDuration;
        aggregatedRoundDurationsByPlayer[actualPlayerId].roundCount += durations.roundCount;
      });
    }

    // Rosen10player: Nur vom ersten Spiel nehmen
    if (gameIndex === 0 && game.Rosen10player) {
      // Konvertiere PlayerNumber zu Player Document ID
      const playerNum = parseInt(game.Rosen10player, 10);
      Rosen10player = playerNumberToIdMap.get(playerNum) || game.Rosen10player;
    }
  });

  return {
    totalRounds,
    aggregatedTrumpfCountsByPlayer,
    aggregatedRoundDurationsByPlayer,
    Rosen10player
  };
};

// Hier könnten weitere Jass-spezifische Utility-Funktionen stehen... 