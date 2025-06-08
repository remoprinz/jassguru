import * as admin from "firebase-admin";

// Hilfsinterfaces, die von GroupStatistics im Frontend verwendet werden
// Diese müssen ggf. angepasst werden, wenn die genauen Spieler-/Teamdaten anders aggregiert werden
export interface GroupStatHighlightPlayer {
  playerId: string;
  playerName: string;
  value: number;
  eventsPlayed?: number;
  displayValue?: string; // Für formatierte Werte wie Zeit
  lastPlayedTimestamp?: admin.firestore.Timestamp | null; // NEU: Für Filterung im Frontend
  // id?: string; // Spieler-ID, falls für Links benötigt
}

export interface GroupStatHighlightTeam {
  names: string[];
  value: number | string; // Kann Zahl oder formatierter String sein, im Backend eher Zahl
  eventsPlayed?: number;
  // playerIds?: string[]; // Spieler-IDs des Teams
}

export interface GroupComputedStats {
  groupId: string | null;
  lastUpdateTimestamp: admin.firestore.Timestamp | null;
  memberCount: number;
  sessionCount: number;
  gameCount: number;
  totalPlayTimeSeconds: number;
  avgSessionDurationSeconds: number;
  avgGameDurationSeconds: number;
  avgGamesPerSession: number;
  avgRoundsPerGame: number;
  avgRoundDurationSeconds: number;
  avgMatschPerGame: number;
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;
  hauptspielortName: string | null;

  // --- Statistiken zu den Spielern ---
  playerWithMostGames: GroupStatHighlightPlayer[] | null;
  playerWithHighestStricheDiff: GroupStatHighlightPlayer[] | null;
  playerWithHighestPointsDiff: GroupStatHighlightPlayer[] | null;
  playerWithHighestWinRateSession: GroupStatHighlightPlayer[] | null;
  playerWithHighestWinRateGame: GroupStatHighlightPlayer[] | null;
  playerWithHighestMatschRate: GroupStatHighlightPlayer[] | null;
  playerWithHighestSchneiderRate: GroupStatHighlightPlayer[] | null;
  playerWithHighestKontermatschRate: GroupStatHighlightPlayer[] | null;
  playerWithMostWeisPointsAvg: GroupStatHighlightPlayer[] | null;
  playerWithFastestRounds: GroupStatHighlightPlayer[] | null;
  playerWithSlowestRounds: GroupStatHighlightPlayer[] | null;
  playerAllRoundTimes: GroupStatHighlightPlayer[] | null;
  
  // --- Statistiken zu den Teams ---
  teamWithHighestWinRateSession: GroupStatHighlightTeam[] | null;
  teamWithHighestWinRateGame: GroupStatHighlightTeam[] | null;
  teamWithHighestPointsDiff: GroupStatHighlightTeam[] | null;
  teamWithHighestStricheDiff: GroupStatHighlightTeam[] | null;
  teamWithHighestMatschRate: GroupStatHighlightTeam[] | null;
  teamWithHighestSchneiderRate: GroupStatHighlightTeam[] | null;
  teamWithHighestKontermatschRate: GroupStatHighlightTeam[] | null;
  teamWithMostWeisPointsAvg: GroupStatHighlightTeam[] | null;
  teamWithFastestRounds: GroupStatHighlightTeam[] | null;

  // --- Trumpf-Statistiken ---
  trumpfStatistik: { [key: string]: number } | null;
  totalTrumpfCount: number;
}

export const initialGroupComputedStats: GroupComputedStats = {
  groupId: null,
  lastUpdateTimestamp: null,
  memberCount: 0,
  sessionCount: 0,
  gameCount: 0,
  totalPlayTimeSeconds: 0,
  avgSessionDurationSeconds: 0,
  avgGameDurationSeconds: 0,
  avgGamesPerSession: 0,
  avgRoundsPerGame: 0,
  avgRoundDurationSeconds: 0,
  avgMatschPerGame: 0,
  firstJassTimestamp: null,
  lastJassTimestamp: null,
  hauptspielortName: null,
  playerWithMostGames: null,
  playerWithHighestStricheDiff: null,
  playerWithHighestPointsDiff: null,
  playerWithHighestWinRateSession: null,
  playerWithHighestWinRateGame: null,
  playerWithHighestMatschRate: null,
  playerWithHighestSchneiderRate: null,
  playerWithHighestKontermatschRate: null,
  playerWithMostWeisPointsAvg: null,
  playerWithFastestRounds: null,
  playerWithSlowestRounds: null,
  playerAllRoundTimes: null,
  teamWithHighestWinRateSession: null,
  teamWithHighestWinRateGame: null,
  teamWithHighestPointsDiff: null,
  teamWithHighestStricheDiff: null,
  teamWithHighestMatschRate: null,
  teamWithHighestSchneiderRate: null,
  teamWithHighestKontermatschRate: null,
  teamWithMostWeisPointsAvg: null,
  teamWithFastestRounds: null,
  trumpfStatistik: null,
  totalTrumpfCount: 0,
}; 