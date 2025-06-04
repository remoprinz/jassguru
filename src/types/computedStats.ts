import type { Timestamp } from 'firebase/firestore';

// Basis-Typ für Highlight/Lowlight Einträge mit Datum und optionaler Spiel/Session ID
export interface FrontendStatHighlight {
  type: string; // z.B. "longest_win_streak_games", "highest_striche_session", "tournament_win"
  value: number | string; // Der numerische oder String-Wert des Highlights
  stringValue?: string; // Zusätzlicher String-Wert, z.B. Teamname bei Turniersieg
  date: Date | null; // Datum des Highlights
  relatedId?: string; // ID des zugehörigen Spiels, der Session oder des Turniers
  relatedType?: 'game' | 'session' | 'tournament'; // NEU: Typ der Verknüpfung
  label: string; // Benutzerfreundliche Beschreibung des Highlights
}

export interface FrontendStatStreak {
  value: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface FrontendTournamentPlacement {
  tournamentId: string;
  tournamentName: string;
  rank: number;
  totalParticipants: number;
  totalRankedEntities?: number; 
  date: Date | null;
  teamName?: string; 
}

export interface FrontendPlayerComputedStats {
  // === Letzte Aktivität ===
  lastUpdateTimestamp: Date | null; 
  firstJassTimestamp: Date | null;
  lastJassTimestamp: Date | null;

  // === Zählstatistiken Allgemein ===
  totalSessions: number;
  totalGames: number;
  totalPlayTimeSeconds: number;

  // === Zählstatistiken Partien (Sessions) ===
  sessionWins: number;
  sessionTies: number;
  sessionLosses: number;

  // === Zählstatistiken Spiele (Runden) ===
  gameWins: number;
  gameLosses: number;

  // === Ergebnisbasierte Statistiken ===
  totalStricheMade: number;
  totalStricheReceived: number;
  totalStricheDifference: number;

  totalPointsMade: number;
  totalPointsReceived: number;
  totalPointsDifference: number;

  playerTotalWeisMade: number; 

  totalMatschGamesMade: number; 
  totalSchneiderGamesMade: number;

  totalKontermatschGamesMade: number;
  totalKontermatschGamesReceived: number;

  // === Aktuelle Spiel-Streaks ===
  currentGameWinStreak: number;
  currentGameLossStreak: number;
  currentGameWinlessStreak: number;

  // === Aktuelle Session-Streaks ===
  currentSessionWinStreak: number;
  currentSessionLossStreak: number;
  currentSessionWinlessStreak: number;

  // === Durchschnittswerte pro Spiel ===
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgMatschPerGame: number;
  avgSchneiderPerGame: number;
  avgWeisPointsPerGame: number;
  avgKontermatschPerGame: number;

  // === Turnierstatistiken ===
  totalTournamentsParticipated: number;
  totalTournamentGamesPlayed: number;
  tournamentWins: number;
  bestTournamentPlacement?: FrontendTournamentPlacement | null;
  tournamentPlacements?: FrontendTournamentPlacement[];

  // === Highlights Spiele ===
  highestPointsGame: FrontendStatHighlight | null;
  highestStricheGame: FrontendStatHighlight | null;
  mostMatschGame: FrontendStatHighlight | null;
  mostSchneiderGame: FrontendStatHighlight | null;
  mostWeisPointsGame: FrontendStatHighlight | null;
  mostKontermatschMadeGame: FrontendStatHighlight | null;
  longestWinStreakGames: FrontendStatStreak | null;

  // === Lowlights Spiele ===
  lowestPointsGame: FrontendStatHighlight | null;
  highestStricheReceivedGame: FrontendStatHighlight | null;
  mostMatschReceivedGame: FrontendStatHighlight | null;
  mostSchneiderReceivedGame: FrontendStatHighlight | null;
  mostKontermatschReceivedGame: FrontendStatHighlight | null;
  mostWeisPointsReceivedGame: FrontendStatHighlight | null;
  longestLossStreakGames: FrontendStatStreak | null;
  longestWinlessStreakGames: FrontendStatStreak | null;

  // === Highlights Partien (Sessions) ===
  highestPointsSession: FrontendStatHighlight | null;
  highestStricheSession: FrontendStatHighlight | null;
  longestWinStreakSessions: FrontendStatStreak | null;

  // === Lowlights Partien (Sessions) ===
  lowestPointsSession: FrontendStatHighlight | null;
  highestStricheReceivedSession: FrontendStatHighlight | null;
  mostMatschReceivedSession: FrontendStatHighlight | null;
  mostWeisPointsReceivedSession: FrontendStatHighlight | null;
  longestLossStreakSessions: FrontendStatStreak | null;
  longestWinlessStreakSessions: FrontendStatStreak | null;

  // === Sammlung von bemerkenswerten Ereignissen/Highlights ===
  highlights: FrontendStatHighlight[];
}

// Initialwerte für FrontendPlayerComputedStats (optional, aber hilfreich für Tests/Defaults)
export const initialFrontendPlayerComputedStats: FrontendPlayerComputedStats = {
  lastUpdateTimestamp: null,
  firstJassTimestamp: null,
  lastJassTimestamp: null,
  totalSessions: 0,
  totalGames: 0,
  totalPlayTimeSeconds: 0,
  sessionWins: 0,
  sessionTies: 0,
  sessionLosses: 0,
  gameWins: 0,
  gameLosses: 0,
  totalStricheMade: 0,
  totalStricheReceived: 0,
  totalStricheDifference: 0,
  totalPointsMade: 0,
  totalPointsReceived: 0,
  totalPointsDifference: 0,
  playerTotalWeisMade: 0,
  totalMatschGamesMade: 0,
  totalSchneiderGamesMade: 0,
  totalKontermatschGamesMade: 0,
  totalKontermatschGamesReceived: 0,
  currentGameWinStreak: 0,
  currentGameLossStreak: 0,
  currentGameWinlessStreak: 0,
  currentSessionWinStreak: 0,
  currentSessionLossStreak: 0,
  currentSessionWinlessStreak: 0,
  avgPointsPerGame: 0,
  avgStrichePerGame: 0,
  avgMatschPerGame: 0,
  avgSchneiderPerGame: 0,
  avgWeisPointsPerGame: 0,
  avgKontermatschPerGame: 0,
  totalTournamentsParticipated: 0,
  totalTournamentGamesPlayed: 0,
  tournamentWins: 0,
  bestTournamentPlacement: null,
  tournamentPlacements: [],
  highestPointsGame: null,
  highestStricheGame: null,
  mostMatschGame: null,
  mostSchneiderGame: null,
  mostWeisPointsGame: null,
  mostKontermatschMadeGame: null,
  longestWinStreakGames: null,
  lowestPointsGame: null,
  highestStricheReceivedGame: null,
  mostMatschReceivedGame: null,
  mostSchneiderReceivedGame: null,
  mostKontermatschReceivedGame: null,
  mostWeisPointsReceivedGame: null,
  longestLossStreakGames: null,
  longestWinlessStreakGames: null,
  highestPointsSession: null,
  highestStricheSession: null,
  longestWinStreakSessions: null,
  lowestPointsSession: null,
  highestStricheReceivedSession: null,
  mostMatschReceivedSession: null,
  mostWeisPointsReceivedSession: null,
  longestLossStreakSessions: null,
  longestWinlessStreakSessions: null,
  highlights: [],
}; 