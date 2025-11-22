/**
 * 🎯 UNIFIED PLAYER DATA MODEL
 * ============================
 * 
 * Konsolidierte Datenstruktur für alle Spieler-Daten.
 * Ersetzt die redundanten Collections:
 * - players/{id}/currentScores/latest/ ❌
 * - players/{id}/currentStatistics/latest/ ❌
 * - playerComputedStats/{id} ❌
 * 
 * Neue Struktur:
 * players/{playerId}/
 * ├── (Root Document) ← globalStats, globalRating, displayName
 * ├── groupStats/{groupId} ← gruppen-spezifische Stats
 * ├── partnerStats/{partnerId} ← Partner-Statistiken
 * ├── opponentStats/{opponentId} ← Gegner-Statistiken
 * ├── ratingHistory/{docId} ← Elo-Historie (existiert bereits ✅)
 * └── scoresHistory/{docId} ← Score-Historie
 */

import * as admin from 'firebase-admin';

// =========================================
// ROOT DOCUMENT (players/{playerId})
// =========================================

export interface PlayerRootDocument {
  // 👤 IDENTITÄT
  playerId: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  
  // 🎮 GLOBAL RATING (von jassEloUpdater) - NUR RATING-FELDER
  globalRating: number;
  lastGlobalRatingUpdate?: admin.firestore.Timestamp;
  tier?: string;
  tierEmoji?: string;
  lastDelta?: number;
  lastSessionDelta?: number;
  lowestRating?: number;
  peakRating?: number;
  peakRatingDate?: number;
  
  // 📊 GLOBAL STATS (konsolidiert) - ALLE SPIEL-STATS HIER
  globalStats: GlobalPlayerStats;
  
  // 🏠 GRUPPEN-MITGLIEDSCHAFTEN
  groupIds: string[];
  
  // ⏱️ ZEITSTEMPEL
  createdAt: admin.firestore.Timestamp;
  lastActivity: admin.firestore.Timestamp;
  lastUpdated: admin.firestore.Timestamp;
}

// =========================================
// GLOBAL STATS (im Root Document)
// =========================================

export interface GlobalPlayerStats {
  // ✅ SESSIONS
  totalSessions: number;
  sessionsWon: number;
  sessionsLost: number;
  sessionsDraw: number;
  sessionWinRate: number;
  
  // ✅ TOURNAMENTS
  totalTournaments?: number; // ✅ NEU: Anzahl gespielter Turniere
  
  // ✅ GAMES
  totalGames: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  gameWinRate: number;
  
  // ✅ SCORES
  totalPointsMade: number;
  totalPointsReceived: number;
  pointsDifference: number;
  avgPointsPerGame: number;
  
  totalStricheMade: number;
  totalStricheReceived: number;
  stricheDifference: number;
  avgStrichePerGame: number;
  
  // ✅ WEIS
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  avgWeisPerGame: number;
  
  // ✅ EVENTS
  matschEventsMade: number;
  matschEventsReceived: number;
  matschBilanz: number;
  
  schneiderEventsMade: number;
  schneiderEventsReceived: number;
  schneiderBilanz: number;
  
  kontermatschEventsMade: number;
  kontermatschEventsReceived: number;
  kontermatschBilanz: number;
  
  // ✅ TRUMPF
  trumpfStatistik: { [farbe: string]: number };
  totalTrumpfCount: number;
  
  // ✅ ZEIT
  totalPlayTimeSeconds: number;
  avgRoundDurationMilliseconds: number;
  
  // ✅ HIGHLIGHTS
  highestPointsSession?: HighlightRecord;
  highestStricheSession?: HighlightRecord;
  mostWeisPointsSession?: HighlightRecord;
  longestWinStreakSessions?: StreakRecord;
  longestWinStreakGames?: StreakRecord;
  
  // ✅ ZEITSTEMPEL
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;
}

// =========================================
// GROUP STATS (Subcollection)
// =========================================

export interface GroupPlayerStats {
  groupId: string;
  groupName?: string;
  
  // SESSIONS
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  sessionsDraw: number;
  sessionWinRate: number;
  
  // GAMES
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gameWinRate: number;
  
  // SCORES
  pointsDifference: number;
  stricheDifference: number;
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  
  // EVENTS
  matschBilanz: number;
  schneiderBilanz: number;
  kontermatschBilanz: number;
  
  // WEIS
  weisDifference: number;
  avgWeisPerGame: number;
  
  // ZEIT
  lastPlayedInGroup: admin.firestore.Timestamp;
}

// =========================================
// PARTNER STATS (Subcollection)
// =========================================

export interface PartnerPlayerStats {
  partnerId: string;
  partnerDisplayName: string;
  
  // SESSIONS
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  sessionsLostWith: number;
  sessionsDrawWith: number;
  sessionWinRateWith: number;
  
  // GAMES
  gamesPlayedWith: number;
  gamesWonWith: number;
  gamesLostWith: number;
  gameWinRateWith: number;
  
  // SCORES
  totalStricheDifferenceWith: number;
  totalPointsDifferenceWith: number;
  
  // EVENTS
  matschBilanzWith: number;
  matschEventsMadeWith: number;
  matschEventsReceivedWith: number;
  
  schneiderBilanzWith: number;
  schneiderEventsMadeWith: number;
  schneiderEventsReceivedWith: number;
  
  kontermatschBilanzWith: number;
  kontermatschEventsMadeWith: number;
  kontermatschEventsReceivedWith: number;
  
  // WEIS
  totalWeisPointsWith: number;
  totalWeisReceivedWith: number;
  weisDifferenceWith: number;
  
  // ✅ NEU: RUNDENTEMPO & TRUMPFANSAGEN
  totalRoundDurationWith?: number;
  totalRoundsWith?: number;
  avgRoundDurationWith?: number;
  trumpfStatistikWith?: { [farbe: string]: number };
  
  // ZEIT
  lastPlayedWithTimestamp: admin.firestore.Timestamp;
}

// =========================================
// OPPONENT STATS (Subcollection)
// =========================================

export interface OpponentPlayerStats {
  opponentId: string;
  opponentDisplayName: string;
  
  // SESSIONS
  sessionsPlayedAgainst: number;
  sessionsWonAgainst: number;
  sessionsLostAgainst: number;
  sessionsDrawAgainst: number;
  sessionWinRateAgainst: number;
  
  // GAMES
  gamesPlayedAgainst: number;
  gamesWonAgainst: number;
  gamesLostAgainst: number;
  gameWinRateAgainst: number;
  
  // SCORES
  totalStricheDifferenceAgainst: number;
  totalPointsDifferenceAgainst: number;
  
  // EVENTS
  matschBilanzAgainst: number;
  matschEventsMadeAgainst: number;
  matschEventsReceivedAgainst: number;
  
  schneiderBilanzAgainst: number;
  schneiderEventsMadeAgainst: number;
  schneiderEventsReceivedAgainst: number;
  
  kontermatschBilanzAgainst: number;
  kontermatschEventsMadeAgainst: number;
  kontermatschEventsReceivedAgainst: number;
  
  // WEIS
  totalWeisPointsAgainst: number;
  totalWeisReceivedAgainst: number;
  weisDifferenceAgainst: number;
  
  // ✅ NEU: RUNDENTEMPO & TRUMPFANSAGEN
  totalRoundDurationAgainst?: number;
  totalRoundsAgainst?: number;
  avgRoundDurationAgainst?: number;
  trumpfStatistikAgainst?: { [farbe: string]: number };
  
  // ZEIT
  lastPlayedAgainstTimestamp: admin.firestore.Timestamp;
}

// =========================================
// SCORES HISTORY (Subcollection)
// =========================================

export interface ScoresHistoryEntry {
  completedAt: admin.firestore.Timestamp; // ✅ KONSISTENT mit ratingHistory!
  groupId: string;
  sessionId?: string; // ✅ NEU: Für Queries nach Session
  tournamentId?: string | null;
  gameNumber?: number; // Optional: vorhanden für Pro-Spiel-Entries (completedGames.gameNumber oder Tournament passeNumber)
  
  // Pro-Spiel-Delta (was sich durch dieses Spiel geändert hat)
  stricheDiff: number;
  pointsDiff: number;
  wins: number;
  losses: number;
  
  matschBilanz: number;
  schneiderBilanz: number;
  kontermatschBilanz: number;
  
  weisDifference: number;
  
  eventType: 'game' | 'session' | 'tournament_session'; // ✅ Updated to allow session level entries
}

// =========================================
// HELPER TYPES
// =========================================

export interface HighlightRecord {
  value: number;
  sessionId: string;
  date: admin.firestore.Timestamp;
  label?: string;
}

export interface StreakRecord {
  value: number;
  startDate: admin.firestore.Timestamp | null;
  endDate: admin.firestore.Timestamp | null;
  startSessionId?: string;
  endSessionId?: string;
}

// =========================================
// DEFAULT VALUES
// =========================================

export function getDefaultGlobalPlayerStats(): GlobalPlayerStats {
  return {
    totalSessions: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    sessionsDraw: 0,
    sessionWinRate: 0,
    
    totalGames: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
    gameWinRate: 0,
    
    totalPointsMade: 0,
    totalPointsReceived: 0,
    pointsDifference: 0,
    avgPointsPerGame: 0,
    
    totalStricheMade: 0,
    totalStricheReceived: 0,
    stricheDifference: 0,
    avgStrichePerGame: 0,
    
    totalWeisPoints: 0,
    totalWeisReceived: 0,
    weisDifference: 0,
    avgWeisPerGame: 0,
    
    matschEventsMade: 0,
    matschEventsReceived: 0,
    matschBilanz: 0,
    
    schneiderEventsMade: 0,
    schneiderEventsReceived: 0,
    schneiderBilanz: 0,
    
    kontermatschEventsMade: 0,
    kontermatschEventsReceived: 0,
    kontermatschBilanz: 0,
    
    trumpfStatistik: {},
    totalTrumpfCount: 0,
    
    totalPlayTimeSeconds: 0,
    avgRoundDurationMilliseconds: 0,
    
    firstJassTimestamp: null,
    lastJassTimestamp: null,
  };
}

export function getDefaultGroupPlayerStats(groupId: string, groupName?: string): GroupPlayerStats {
  return {
    groupId,
    groupName,
    
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    sessionsDraw: 0,
    sessionWinRate: 0,
    
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gameWinRate: 0,
    
    pointsDifference: 0,
    stricheDifference: 0,
    avgPointsPerGame: 0,
    avgStrichePerGame: 0,
    
    matschBilanz: 0,
    schneiderBilanz: 0,
    kontermatschBilanz: 0,
    
    weisDifference: 0,
    avgWeisPerGame: 0,
    
    lastPlayedInGroup: admin.firestore.Timestamp.now(),
  };
}

