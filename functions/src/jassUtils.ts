/**
 * Backend-Version der Jass Utility Funktionen
 * 
 * Diese Datei enthält die Server-seitigen Versionen der Aggregations-Funktionen
 * für die Session-Finalisierung und Statistik-Berechnung.
 */

// === TYPE DEFINITIONS ===

export interface EventCountRecord {
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

// NEU: Geteilte Logik zur Berechnung von Spiel-Events, um Konsistenz zu gewährleisten
export interface GameDataForEventCalc {
  roundHistory?: Array<{ strichInfo?: { type?: string; team?: 'top' | 'bottom' } }>;
  finalStriche?: { 
    top: { sieg: number; berg: number; schneider: number };
    bottom: { sieg: number; berg: number; schneider: number };
  };
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

export function calculateEventCountsForGame(game: GameDataForEventCalc): EventCounts {
  const events: EventCounts = {
    top: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
    bottom: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
  };

  // 1. Matsch/Kontermatsch aus der roundHistory des Spiels
  if (game.roundHistory && Array.isArray(game.roundHistory)) {
    game.roundHistory.forEach(round => {
      if (round.strichInfo?.type && round.strichInfo.team) {
        const teamKey = round.strichInfo.team;
        if (round.strichInfo.type === 'matsch') {
          events[teamKey].matsch++;
        } else if (round.strichInfo.type === 'kontermatsch') {
          events[teamKey].kontermatsch++;
        }
      }
    });
  }

  // 2. Sieg, Berg, Schneider aus finalStriche des Spiels
  if (game.finalStriche) {
    if (game.finalStriche.top.sieg > 0) events.top.sieg = 1;
    if (game.finalStriche.bottom.sieg > 0) events.bottom.sieg = 1;
    
    if (game.finalStriche.top.berg > 0) events.top.berg = 1;
    if (game.finalStriche.bottom.berg > 0) events.bottom.berg = 1;
    
    if (game.finalStriche.top.schneider > 0) events.top.schneider = 1;
    if (game.finalStriche.bottom.schneider > 0) events.bottom.schneider = 1;
  }

  return events;
} 