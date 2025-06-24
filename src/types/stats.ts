export interface WinRateInfo {
  wins: number;
  total: number;
  rate: number;
  displayText: string;
}

export interface NotableEvent {
  type: string;
  value: number;
  date: any; // Firestore Timestamp, wird im Transformer zu string oder Date
  relatedId?: string;
  label: string;
}

export interface StreakInfo {
  value: number;
  startDate?: any;
  endDate?: any;
  startSessionId?: string;
  endSessionId?: string;
}

export interface PlayerComputedStats {
  totalSessions: number;
  totalGames: number;
  totalTournamentsParticipated: number;
  totalPlayTimeSeconds: number;
  firstJassTimestamp: any;
  lastJassTimestamp: any;
  sessionWinRate: number;
  sessionWinRateInfo?: WinRateInfo;
  gameWinRate: number;
  gameWinRateInfo?: WinRateInfo;
  sessionWins: number;
  sessionLosses: number;
  sessionTies: number;
  gameWins: number;
  gameLosses: number;
  totalPointsDifference: number;
  totalStricheDifference: number;
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgMatschPerGame: number;
  avgSchneiderPerGame: number;
  avgKontermatschPerGame: number;
  avgWeisPointsPerGame: number;
  avgRoundDurationMilliseconds: number;
  totalPointsMade: number;
  totalPointsReceived: number;
  totalStricheMade: number;
  totalStricheReceived: number;
  totalMatschEventsMade: number;
  totalMatschEventsReceived: number;
  totalSchneiderEventsMade: number;
  totalSchneiderEventsReceived: number;
  totalKontermatschEventsMade: number;
  totalKontermatschEventsReceived: number;
  playerTotalWeisMade: number;
  
  // Highlights
  highestPointsSession: NotableEvent | null;
  lowestPointsSession: NotableEvent | null;
  highestStricheSession: NotableEvent | null;
  highestStricheReceivedSession: NotableEvent | null;
  mostMatschSession: NotableEvent | null;
  mostMatschReceivedSession: NotableEvent | null;
  mostSchneiderSession: NotableEvent | null;
  mostSchneiderReceivedSession: NotableEvent | null;
  mostKontermatschSession: NotableEvent | null;
  mostKontermatschReceivedSession: NotableEvent | null;
  mostWeisPointsSession: NotableEvent | null;
  mostWeisPointsReceivedSession: NotableEvent | null;
  
  // Streaks
  longestWinStreakSessions: StreakInfo | null;
  longestLossStreakSessions: StreakInfo | null;
  longestWinlessStreakSessions: StreakInfo | null;
  longestUndefeatedStreakSessions: StreakInfo | null;
  
  [key: string]: any;
} 