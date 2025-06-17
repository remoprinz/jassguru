/**
 * Backend-Version der Jass Utility Funktionen
 * 
 * Diese Datei enthält die Server-seitigen Versionen der Aggregations-Funktionen
 * für die Session-Finalisierung und Statistik-Berechnung.
 */

// === TYPE DEFINITIONS ===

interface EventCountRecord {
  sieg: number;
  berg: number;
  matsch: number;
  kontermatsch: number;
  schneider: number;
}

interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}

interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

interface TeamScores {
  top: number;
  bottom: number;
}

interface TrumpfCountsByPlayer {
  [playerId: string]: {
    [farbe: string]: number;
  };
}

interface RoundDurationsByPlayer {
  [playerId: string]: {
    totalDuration: number;
    roundCount: number;
  };
}

interface CompletedGameData {
  finalScores: TeamScores;
  finalStriche: { top: StricheRecord; bottom: StricheRecord };
  roundHistory?: any[];
  trumpfCountsByPlayer?: TrumpfCountsByPlayer;
  roundDurationsByPlayer?: RoundDurationsByPlayer;
  Rosen10player?: string | null;
}

// === UTILITY FUNCTIONS ===

/**
 * Type Guard für JassRoundEntry
 */
function isJassRoundEntry(entry: any): boolean {
  return entry && entry.actionType === 'jass';
}

/**
 * Berechnet die Event-Zähler aus finalStriche und roundHistory
 */
export function calculateEventCounts(gameData: CompletedGameData): EventCounts {
  const { finalStriche, roundHistory } = gameData;
  
  const bottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const topEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

  // 1. Matsch/Kontermatsch aus roundHistory
  if (roundHistory && Array.isArray(roundHistory)) {
    roundHistory.forEach(round => {
      if ('strichInfo' in round && round.strichInfo && round.strichInfo.type) {
        const teamKey = round.strichInfo.team as 'top' | 'bottom' | undefined;
        if (!teamKey) return;

        if (round.strichInfo.type === 'matsch') {
          if (teamKey === 'bottom') bottomEvents.matsch++;
          else if (teamKey === 'top') topEvents.matsch++;
        } else if (round.strichInfo.type === 'kontermatsch') {
          if (teamKey === 'bottom') bottomEvents.kontermatsch++;
          else if (teamKey === 'top') topEvents.kontermatsch++;
        }
      }
    });
  }

  // 2. Sieg aus finalStriche
  if (finalStriche.bottom.sieg > 0) {
    bottomEvents.sieg = 1;
  } else if (finalStriche.top.sieg > 0) {
    topEvents.sieg = 1;
  }

  // 3. Berg aus finalStriche
  if (finalStriche.bottom.berg > 0) {
    bottomEvents.berg = 1;
  } else if (finalStriche.top.berg > 0) {
    topEvents.berg = 1;
  }

  // 4. Schneider aus finalStriche
  if (finalStriche.bottom.schneider > 0) {
    bottomEvents.schneider = 1;
  } else if (finalStriche.top.schneider > 0) {
    topEvents.schneider = 1;
  }

  return { bottom: bottomEvents, top: topEvents };
}

/**
 * Aggregiert Session-Level Daten aus allen abgeschlossenen Spielen
 */
export function calculateSessionAggregations(
  completedGames: CompletedGameData[],
  playerNumberToIdMap: Map<number, string>
): {
  totalRounds: number;
  aggregatedTrumpfCountsByPlayer: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer: RoundDurationsByPlayer;
  Rosen10player: string | null;
} {
  let totalRounds = 0;
  const aggregatedTrumpfCountsByPlayer: TrumpfCountsByPlayer = {};
  const aggregatedRoundDurationsByPlayer: RoundDurationsByPlayer = {};
  let Rosen10player: string | null = null;

  completedGames.forEach((game, gameIndex) => {
    // Runden zählen
    if (game.roundHistory) {
      const jassRoundsCount = game.roundHistory.filter(round => isJassRoundEntry(round)).length;
      totalRounds += jassRoundsCount;
    }

    // Trumpf-Counts aggregieren
    if (game.trumpfCountsByPlayer) {
      Object.entries(game.trumpfCountsByPlayer).forEach(([playerIdStr, trumpfCounts]) => {
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

    // Rundendauer aggregieren
    if (game.roundDurationsByPlayer) {
      Object.entries(game.roundDurationsByPlayer).forEach(([playerIdStr, durations]) => {
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

    // Rosen10player vom ersten Spiel
    if (gameIndex === 0 && game.Rosen10player) {
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
} 