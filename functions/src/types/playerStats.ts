import { Timestamp } from 'firebase-admin/firestore';

/**
 * Erweiterte Spieler-Statistiken für eine Gruppe
 */
export interface PlayerStats {
  /** Eindeutige Spieler-ID */
  playerId: string;
  
  /** Gruppe */
  groupId: string;
  
  /** Aktuelles Elo-Rating in dieser Gruppe */
  rating: number;
  
  /** Gesamtanzahl gespielter Spiele */
  gamesPlayed: number;
  
  /** Gesamtanzahl Siege */
  wins: number;
  
  /** Gesamtanzahl Niederlagen */
  losses: number;
  
  /** Gesamt-Striche */
  striche: number;
  
  /** Gesamt-Punkte gemacht */
  points: number;
  
  /** Gesamt-Punkte erhalten */
  pointsReceived: number;
  
  /** Session-Gewinne (nur Sessions, nicht Turniere) */
  sessionWins: number;
  
  /** Session-Niederlagen (nur Sessions, nicht Turniere) */
  sessionLosses: number;
  
  /** Session-Unentschieden (nur Sessions, nicht Turniere) */
  sessionDraws: number;
  
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
  
  /** Gesamt-Weis-Punkte */
  weisPointsTotal: number;
  
  /** Durchschnittliche Weis-Punkte pro Spiel */
  weisPointsAvg: number;
  
  /** Peak-Rating in dieser Gruppe */
  peakRating: number;
  
  /** Datum des Peak-Ratings */
  peakRatingDate: Timestamp;
  
  /** Niedrigstes Rating in dieser Gruppe */
  lowestRating: number;
  
  /** Datum des niedrigsten Ratings */
  lowestRatingDate: Timestamp;
  
  /** Peak-Striche in dieser Gruppe */
  peakStriche: number;
  
  /** Datum der Peak-Striche */
  peakStricheDate: Timestamp;
  
  /** Niedrigste Striche in dieser Gruppe */
  lowestStriche: number;
  
  /** Datum der niedrigsten Striche */
  lowestStricheDate: Timestamp;
  
  /** Letzte Rating-Änderung */
  lastDelta: number;
  
  /** Tier-Name */
  tier: string;
  
  /** Tier-Emoji */
  tierEmoji: string;
  
  /** Letzte Aktualisierung */
  lastUpdated: Timestamp;
}

/**
 * Erweiterte Spieler-History-Einträge
 */
export interface PlayerHistoryEntry {
  /** Zeitstempel des Events */
  createdAt: Timestamp;
  
  /** Spieler-ID */
  playerId: string;
  
  /** Gruppe */
  groupId: string;
  
  /** Event-Typ */
  eventType: 'session_end' | 'tournament_game' | 'tournament_end';
  
  /** Event-ID */
  eventId: string;
  
  /** Rundennummer (nur für Turniere) */
  roundNumber?: number;
  
  /** Globales Elo-Rating nach diesem Event */
  globalRating: number;
  
  /** Gruppen-spezifisches Elo-Rating nach diesem Event */
  rating: number;
  
  /** Anzahl gespielter Spiele */
  gamesPlayed: number;
  
  /** Tier-Name */
  tier: string;
  
  /** Tier-Emoji */
  tierEmoji: string;
  
  /** Delta für dieses Event */
  delta: {
    /** Rating-Änderung */
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
  
  /** Kumulative Statistiken nach diesem Event */
  cumulative: {
    /** Gesamt-Striche */
    striche: number;
    
    /** Gesamt-Siege */
    wins: number;
    
    /** Gesamt-Niederlagen */
    losses: number;
    
    /** Gesamt-Punkte gemacht */
    points: number;
    
    /** Gesamt-Punkte erhalten */
    pointsReceived: number;
    
    /** Gesamt-Session-Gewinne */
    sessionWins: number;
    
    /** Gesamt-Session-Niederlagen */
    sessionLosses: number;
    
    /** Gesamt-Session-Unentschieden */
    sessionDraws: number;
    
    /** Gesamt-Matsch gemacht */
    matschMade: number;
    
    /** Gesamt-Matsch erhalten */
    matschReceived: number;
    
    /** Gesamt-Schneider gemacht */
    schneiderMade: number;
    
    /** Gesamt-Schneider erhalten */
    schneiderReceived: number;
    
    /** Gesamt-Kontermatsch gemacht */
    kontermatschMade: number;
    
    /** Gesamt-Kontermatsch erhalten */
    kontermatschReceived: number;
    
    /** Gesamt-Weis-Punkte */
    weisPointsTotal: number;
    
    /** Durchschnittliche Weis-Punkte */
    weisPointsAvg: number;
  };
  
  /** Solo-Statistiken (ohne Partner-Aggregation) */
  soloStats: {
    /** Solo-Striche */
    striche: number;
    
    /** Solo-Siege */
    wins: number;
    
    /** Solo-Niederlagen */
    losses: number;
    
    /** Solo-Punkte gemacht */
    points: number;
    
    /** Solo-Punkte erhalten */
    pointsReceived: number;
    
    /** Solo-Session-Gewinne */
    sessionWins: number;
    
    /** Solo-Session-Niederlagen */
    sessionLosses: number;
    
    /** Solo-Session-Unentschieden */
    sessionDraws: number;
    
    /** Solo-Matsch gemacht */
    matschMade: number;
    
    /** Solo-Matsch erhalten */
    matschReceived: number;
    
    /** Solo-Schneider gemacht */
    schneiderMade: number;
    
    /** Solo-Schneider erhalten */
    schneiderReceived: number;
    
    /** Solo-Kontermatsch gemacht */
    kontermatschMade: number;
    
    /** Solo-Kontermatsch erhalten */
    kontermatschReceived: number;
    
    /** Solo-Weis-Punkte */
    weisPointsTotal: number;
    
    /** Solo-Weis-Punkte Durchschnitt */
    weisPointsAvg: number;
  };
  
  /** Kontext-Information */
  context: string;
}
