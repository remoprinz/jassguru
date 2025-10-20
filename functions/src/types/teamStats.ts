import { Timestamp } from 'firebase-admin/firestore';

/**
 * Team-Statistiken für eine spezifische Spieler-Kombination in einer Gruppe
 */
export interface TeamStats {
  /** Eindeutige Team-ID (sortierte Player-IDs mit Unterstrich) */
  teamId: string;
  
  /** Array der beiden Spieler-IDs */
  playerIds: string[];
  
  /** Gruppe, in der das Team spielt */
  groupId: string;
  
  /** Gesamtanzahl Spiele als Team */
  gamesPlayedAsTeam: number;
  
  /** Siege als Team */
  winsAsTeam: number;
  
  /** Niederlagen als Team */
  lossesAsTeam: number;
  
  /** Striche als Team (kumulativ) */
  stricheAsTeam: number;
  
  /** Punkte gemacht als Team */
  pointsAsTeam: number;
  
  /** Punkte erhalten als Team */
  pointsReceivedAsTeam: number;
  
  /** Session-Gewinne als Team (nur Sessions, nicht Turniere) */
  sessionWinsAsTeam: number;
  
  /** Session-Niederlagen als Team (nur Sessions, nicht Turniere) */
  sessionLossesAsTeam: number;
  
  /** Session-Unentschieden als Team (nur Sessions, nicht Turniere) */
  sessionDrawsAsTeam: number;
  
  /** Matsch gemacht als Team */
  matschMadeAsTeam: number;
  
  /** Matsch erhalten als Team */
  matschReceivedAsTeam: number;
  
  /** Schneider gemacht als Team */
  schneiderMadeAsTeam: number;
  
  /** Schneider erhalten als Team */
  schneiderReceivedAsTeam: number;
  
  /** Kontermatsch gemacht als Team */
  kontermatschMadeAsTeam: number;
  
  /** Kontermatsch erhalten als Team */
  kontermatschReceivedAsTeam: number;
  
  /** Gesamt-Weis-Punkte als Team */
  weisPointsTotalAsTeam: number;
  
  /** Durchschnittliche Weis-Punkte pro Spiel als Team */
  weisPointsAvgAsTeam: number;
  
  /** Letzte Aktualisierung */
  lastUpdated: Timestamp;
  
  /** Peak-Striche als Team */
  peakStricheAsTeam: number;
  
  /** Datum der Peak-Striche als Team */
  peakStricheDateAsTeam: Timestamp;
  
  /** Niedrigste Striche als Team */
  lowestStricheAsTeam: number;
  
  /** Datum der niedrigsten Striche als Team */
  lowestStricheDateAsTeam: Timestamp;
}

/**
 * Team-History-Eintrag für chronologische Verfolgung
 */
export interface TeamHistoryEntry {
  /** Zeitstempel des Events */
  createdAt: Timestamp;
  
  /** Team-ID */
  teamId: string;
  
  /** Array der beiden Spieler-IDs */
  playerIds: string[];
  
  /** Gruppe */
  groupId: string;
  
  /** Event-ID (Session oder Turnier) */
  eventId: string;
  
  /** Event-Typ */
  eventType: 'session_end' | 'tournament_game' | 'tournament_end';
  
  /** Rundennummer (nur für Turniere) */
  roundNumber?: number;
  
  /** Vollständige Team-Stats nach diesem Event */
  teamStats: TeamStats;
  
  /** Delta für dieses Event */
  delta: {
    /** Rating-Änderung (pro Spieler) */
    rating: number;
    
    /** Striche-Änderung */
    striche: number;
    
    /** Spiele-Änderung */
    games: number;
    
    /** Siege-Änderung */
    wins: number;
    
    /** Niederlagen-Änderung */
    losses: number;
    
    /** Punkte-Änderung */
    points: number;
    
    /** Punkte erhalten-Änderung */
    pointsReceived: number;
    
    /** Session-Gewinn (nur Sessions) */
    sessionWin: boolean;
    
    /** Session-Niederlage (nur Sessions) */
    sessionLoss: boolean;
    
    /** Session-Unentschieden (nur Sessions) */
    sessionDraw: boolean;
    
    /** Matsch gemacht */
    matschMade: number;
    
    /** Matsch erhalten */
    matschReceived: number;
    
    /** Schneider gemacht */
    schneiderMade: number;
    
    /** Schneider erhalten */
    schneiderReceived: number;
    
    /** Kontermatsch gemacht */
    kontermatschMade: number;
    
    /** Kontermatsch erhalten */
    kontermatschReceived: number;
    
    /** Weis-Punkte */
    weisPoints: number;
  };
  
  /** Kontext-Information */
  context: string;
}
