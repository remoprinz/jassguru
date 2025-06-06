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
  // Metadaten
  lastUpdateTimestamp: admin.firestore.Timestamp;
  groupId: string;

  // Gruppenübersicht
  memberCount: number;
  sessionCount: number;
  gameCount: number;
  totalPlayTimeSeconds: number; // Im Backend als Sekunden speichern
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;
  hauptspielortName: string | null;

  // Durchschnittswerte (als Zahlen speichern, Formatierung im Frontend)
  avgSessionDurationSeconds: number;
  avgGameDurationSeconds: number;
  avgGamesPerSession: number;
  avgRoundsPerGame: number;
  avgMatschPerGame: number;
  avgRoundDurationSeconds: number;

  // Trumpffarben-Statistik (Anzahl speichern, Anteil im Frontend berechnen)
  trumpfFarbenStatistik: { farbe: string; anzahl: number }[];

  // Spieler-Highlights - Direkte Speicherung der Top-Listen
  playerWithMostGames: GroupStatHighlightPlayer[] | null;
  playerWithHighestStricheDiff: GroupStatHighlightPlayer[] | null;
  playerWithHighestWinRateSession: GroupStatHighlightPlayer[] | null;
  playerWithHighestWinRateGame: GroupStatHighlightPlayer[] | null;
  playerWithHighestMatschRate: GroupStatHighlightPlayer[] | null;
  playerWithMostWeisPointsAvg: GroupStatHighlightPlayer[] | null;
  playerWithFastestRounds: GroupStatHighlightPlayer[] | null; // Speichert { name, value: milliseconds, displayValue: string }
  playerWithSlowestRounds: GroupStatHighlightPlayer[] | null; // Speichert { name, value: milliseconds, displayValue: string }
  playerAllRoundTimes: (GroupStatHighlightPlayer & { displayValue?: string })[] | null; // value als Millisekunden

  // Team-Highlights - Direkte Speicherung der Top-Listen
  teamWithHighestWinRateSession: GroupStatHighlightTeam[] | null;
  teamWithHighestWinRateGame: GroupStatHighlightTeam[] | null;
  teamWithHighestMatschRate: GroupStatHighlightTeam[] | null;
  teamWithMostWeisPointsAvg: GroupStatHighlightTeam[] | null;

  // TODO: Basisdaten für eventuelle clientseitige Ad-hoc-Analysen oder Filter, falls die festen Highlights nicht reichen
  // Evtl. eine Map von playerAggregates und teamAggregates ähnlich wie in PlayerComputedStats,
  // aber für den Moment fokussieren wir uns auf die Reproduktion der bestehenden Frontend-Statistiken.
}

export const initialGroupComputedStats: GroupComputedStats = {
  lastUpdateTimestamp: admin.firestore.Timestamp.now(),
  groupId: "",
  memberCount: 0,
  sessionCount: 0,
  gameCount: 0,
  totalPlayTimeSeconds: 0,
  firstJassTimestamp: null,
  lastJassTimestamp: null,
  hauptspielortName: null,
  avgSessionDurationSeconds: 0,
  avgGameDurationSeconds: 0,
  avgGamesPerSession: 0,
  avgRoundsPerGame: 0,
  avgMatschPerGame: 0,
  avgRoundDurationSeconds: 0,
  trumpfFarbenStatistik: [],
  playerWithMostGames: null,
  playerWithHighestStricheDiff: null,
  playerWithHighestWinRateSession: null,
  playerWithHighestWinRateGame: null,
  playerWithHighestMatschRate: null,
  playerWithMostWeisPointsAvg: null,
  playerWithFastestRounds: null,
  playerWithSlowestRounds: null,
  playerAllRoundTimes: null,
  teamWithHighestWinRateSession: null,
  teamWithHighestWinRateGame: null,
  teamWithHighestMatschRate: null,
  teamWithMostWeisPointsAvg: null,
}; 