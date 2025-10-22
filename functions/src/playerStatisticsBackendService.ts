/**
 * 🎯 PLAYER STATISTICS BACKEND SERVICE - Cloud Functions
 * =====================================================
 * 
 * Backend-Service für die Berechnung und Speicherung von Spieler-Statistiken.
 * Wird von Cloud Functions aufgerufen bei Session/Tournament-End.
 * 
 * ✅ ARCHITEKTUR:
 * - Berechnet alle Statistiken im Backend
 * - Speichert in players/{playerId}/currentStatistics/latest
 * - Erstellt Historie-Einträge in players/{playerId}/statisticsHistory
 * - Multi-Level: Global, Group, Tournament
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// ===== TYPEN (aus playerStatisticsService.ts) =====

export interface PlayerStatistics {
  playerId: string;
  global: GlobalStatistics;
  groups: { [groupId: string]: GroupStatistics };
  tournaments: { [tournamentId: string]: TournamentStatistics };
  lastUpdated: Date;
}

export interface GlobalStatistics {
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string;
  firstJassDate: string | null;
  lastJassDate: string | null;
  groupCount: number;
  sessionsWon: number;
  sessionsTied: number;
  sessionsLost: number;
  gamesWon: number;
  gamesLost: number;
  sessionWinRate: number;
  gameWinRate: number;
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgWeisPointsPerGame: number;
  avgMatschPerGame: number;
  highestPoints: { value: number; gameId: string | null; date: string | null };
  highestWeisPoints: { value: number; gameId: string | null; date: string | null };
  highestStriche: { value: number; gameId: string | null; date: string | null };
  longestSession: { value: string; sessionId: string | null; date: string | null };
  trumpfStatistik: { [farbe: string]: number };
  totalTrumpfCount: number;
  partnerAggregates: PartnerAggregate[];
  opponentAggregates: OpponentAggregate[];
}

export interface GroupStatistics {
  groupId: string;
  groupName: string;
  gamesPlayed: number;
  gamesWon: number;
  gameWinRate: number;
  avgPoints: number;
  sessionsPlayed: number;
  sessionsWon: number;
  sessionWinRate: number;
}

export interface TournamentStatistics {
  tournamentId: string;
  tournamentName: string;
  gamesPlayed: number;
  gamesWon: number;
  gameWinRate: number;
  avgPoints: number;
  finalRanking?: number;
}

export interface PartnerAggregate {
  partnerId: string;
  partnerDisplayName: string;
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  sessionsLostWith: number;
  gamesPlayedWith: number;
  gamesWonWith: number;
  gamesLostWith: number;
  totalStricheDifferenceWith: number;
  totalPointsDifferenceWith: number;
  sessionWinRate: number;
  gameWinRate: number;
  sessionWinRateInfo: any;
  gameWinRateInfo: any;
}

export interface OpponentAggregate {
  opponentId: string;
  opponentDisplayName: string;
  sessionsPlayedAgainst: number;
  sessionsWonAgainst: number;
  sessionsLostAgainst: number;
  gamesPlayedAgainst: number;
  gamesWonAgainst: number;
  gamesLostAgainst: number;
  totalStricheDifferenceAgainst: number;
  totalPointsDifferenceAgainst: number;
  sessionWinRate: number;
  gameWinRate: number;
  sessionWinRateInfo: any;
  gameWinRateInfo: any;
}

// ===== HAUPTFUNKTIONEN =====

/**
 * Berechnet und speichert Spieler-Statistiken für eine Session
 */
export async function calculatePlayerStatisticsForSession(
  groupId: string,
  sessionId: string,
  participantPlayerIds: string[],
  tournamentId: string | null
): Promise<void> {
  const db = admin.firestore();
  
  try {
    logger.info(`[calculatePlayerStatisticsForSession] Starte Berechnung für Session ${sessionId}`);
    
    // Lade Session-Daten
    const sessionDoc = await db.collection('jassSessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      logger.error(`[calculatePlayerStatisticsForSession] Session ${sessionId} nicht gefunden`);
      return;
    }
    
    const sessionData = sessionDoc.data()!;
    
    // Lade Gruppe-Daten
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) {
      logger.error(`[calculatePlayerStatisticsForSession] Gruppe ${groupId} nicht gefunden`);
      return;
    }
    
    const groupData = groupDoc.data()!;
    
    // Lade Turnier-Daten (falls vorhanden)
    let tournamentData: any = null;
    if (tournamentId) {
      const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
      if (tournamentDoc.exists) {
        tournamentData = tournamentDoc.data();
      }
    }
    
    // Berechne Statistiken für jeden Teilnehmer
    for (const playerId of participantPlayerIds) {
      try {
        await calculatePlayerStatisticsForPlayerInSession(
          playerId,
          sessionId,
          sessionData,
          groupId,
          groupData,
          tournamentId,
          tournamentData
        );
      } catch (error) {
        logger.error(`[calculatePlayerStatisticsForSession] Fehler bei Spieler ${playerId}:`, error);
      }
    }
    
    logger.info(`[calculatePlayerStatisticsForSession] Berechnung abgeschlossen für Session ${sessionId}`);
  } catch (error) {
    logger.error(`[calculatePlayerStatisticsForSession] Fehler bei Session ${sessionId}:`, error);
  }
}

/**
 * Berechnet und speichert Spieler-Statistiken für ein Turnier
 */
export async function calculatePlayerStatisticsForTournament(
  tournamentId: string,
  participantPlayerIds: string[],
  tournamentData: any
): Promise<void> {
  const db = admin.firestore();
  
  try {
    logger.info(`[calculatePlayerStatisticsForTournament] Starte Berechnung für Turnier ${tournamentId}`);
    
    // Lade alle Sessions des Turniers
    const sessionsQuery = db.collection('jassSessions')
      .where('tournamentId', '==', tournamentId)
      .where('status', '==', 'completed');
    
    const sessionsSnapshot = await sessionsQuery.get();
    
    if (sessionsSnapshot.empty) {
      logger.warn(`[calculatePlayerStatisticsForTournament] Keine Sessions gefunden für Turnier ${tournamentId}`);
      return;
    }
    
    // Berechne Statistiken für jeden Teilnehmer
    for (const playerId of participantPlayerIds) {
      try {
        await calculatePlayerStatisticsForPlayerInTournament(
          playerId,
          tournamentId,
          tournamentData,
          sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        );
      } catch (error) {
        logger.error(`[calculatePlayerStatisticsForTournament] Fehler bei Spieler ${playerId}:`, error);
      }
    }
    
    logger.info(`[calculatePlayerStatisticsForTournament] Berechnung abgeschlossen für Turnier ${tournamentId}`);
  } catch (error) {
    logger.error(`[calculatePlayerStatisticsForTournament] Fehler bei Turnier ${tournamentId}:`, error);
  }
}

// ===== HILFSFUNKTIONEN =====

async function calculatePlayerStatisticsForPlayerInSession(
  playerId: string,
  sessionId: string,
  sessionData: any,
  groupId: string,
  groupData: any,
  tournamentId: string | null,
  tournamentData: any
): Promise<void> {
  const db = admin.firestore();
  
  // Lade aktuelle Statistiken
  const currentStatsDoc = await db.collection(`players/${playerId}/currentStatistics`).doc('latest').get();
  let currentStats: PlayerStatistics;
  
  if (currentStatsDoc.exists) {
    const data = currentStatsDoc.data()!;
    currentStats = {
      playerId,
      global: data.global || getDefaultGlobalStatistics(),
      groups: data.groups || {},
      tournaments: data.tournaments || {},
      lastUpdated: data.lastUpdated?.toDate() || new Date()
    };
  } else {
    currentStats = {
      playerId,
      global: getDefaultGlobalStatistics(),
      groups: {},
      tournaments: {},
      lastUpdated: new Date()
    };
  }
  
  // Berechne Session-Delta
  const sessionDelta = await calculateSessionDelta(playerId, sessionId, sessionData);
  
  // Aktualisiere globale Statistiken
  currentStats.global = updateGlobalStatistics(currentStats.global, sessionDelta, sessionData);
  
  // Aktualisiere Gruppen-Statistiken
  if (!currentStats.groups[groupId]) {
    currentStats.groups[groupId] = getDefaultGroupStatistics(groupId, groupData.name);
  }
  currentStats.groups[groupId] = updateGroupStatistics(currentStats.groups[groupId], sessionDelta, sessionData);
  
  // Aktualisiere Turnier-Statistiken (falls vorhanden)
  if (tournamentId && tournamentData) {
    if (!currentStats.tournaments[tournamentId]) {
      currentStats.tournaments[tournamentId] = getDefaultTournamentStatistics(tournamentId, tournamentData.name);
    }
    currentStats.tournaments[tournamentId] = updateTournamentStatistics(currentStats.tournaments[tournamentId], sessionDelta, sessionData);
  }
  
  // Speichere aktualisierte Statistiken
  await savePlayerStatistics(playerId, currentStats, 'session_end');
}

async function calculatePlayerStatisticsForPlayerInTournament(
  playerId: string,
  tournamentId: string,
  tournamentData: any,
  tournamentSessions: any[]
): Promise<void> {
  const db = admin.firestore();
  
  // Lade aktuelle Statistiken
  const currentStatsDoc = await db.collection(`players/${playerId}/currentStatistics`).doc('latest').get();
  let currentStats: PlayerStatistics;
  
  if (currentStatsDoc.exists) {
    const data = currentStatsDoc.data()!;
    currentStats = {
      playerId,
      global: data.global || getDefaultGlobalStatistics(),
      groups: data.groups || {},
      tournaments: data.tournaments || {},
      lastUpdated: data.lastUpdated?.toDate() || new Date()
    };
  } else {
    currentStats = {
      playerId,
      global: getDefaultGlobalStatistics(),
      groups: {},
      tournaments: {},
      lastUpdated: new Date()
    };
  }
  
  // Berechne Turnier-Delta
  const tournamentDelta = await calculateTournamentDelta(playerId, tournamentId, tournamentSessions);
  
  // Aktualisiere Turnier-Statistiken
  if (!currentStats.tournaments[tournamentId]) {
    currentStats.tournaments[tournamentId] = getDefaultTournamentStatistics(tournamentId, tournamentData.name);
  }
  currentStats.tournaments[tournamentId] = updateTournamentStatistics(currentStats.tournaments[tournamentId], tournamentDelta, tournamentSessions);
  
  // Speichere aktualisierte Statistiken
  await savePlayerStatistics(playerId, currentStats, 'tournament_end');
}

async function calculateSessionDelta(playerId: string, sessionId: string, sessionData: any): Promise<any> {
  // TODO: Implementiere Session-Delta-Berechnung
  // Diese Funktion sollte die Statistiken für diese spezifische Session berechnen
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    totalPoints: 0,
    totalStriche: 0,
    totalWeisPoints: 0,
    totalMatsch: 0,
    trumpfStatistik: {},
    partners: [],
    opponents: []
  };
}

async function calculateTournamentDelta(playerId: string, tournamentId: string, tournamentSessions: any[]): Promise<any> {
  // TODO: Implementiere Turnier-Delta-Berechnung
  // Diese Funktion sollte die Statistiken für alle Sessions des Turniers berechnen
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    totalPoints: 0,
    totalStriche: 0,
    totalWeisPoints: 0,
    totalMatsch: 0,
    trumpfStatistik: {},
    partners: [],
    opponents: []
  };
}

function updateGlobalStatistics(global: GlobalStatistics, delta: any, sessionData: any): GlobalStatistics {
  // TODO: Implementiere globale Statistiken-Update
  return global;
}

function updateGroupStatistics(group: GroupStatistics, delta: any, sessionData: any): GroupStatistics {
  // TODO: Implementiere Gruppen-Statistiken-Update
  return group;
}

function updateTournamentStatistics(tournament: TournamentStatistics, delta: any, sessionData: any): TournamentStatistics {
  // TODO: Implementiere Turnier-Statistiken-Update
  return tournament;
}

async function savePlayerStatistics(
  playerId: string,
  statistics: PlayerStatistics,
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc'
): Promise<void> {
  const db = admin.firestore();
  
  // Speichere aktuelle Statistiken
  await db.collection(`players/${playerId}/currentStatistics`).doc('latest').set({
    ...statistics,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Erstelle Historie-Eintrag
  await db.collection(`players/${playerId}/statisticsHistory`).add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    global: statistics.global,
    groups: statistics.groups,
    tournaments: statistics.tournaments,
    eventType
  });
}

// ===== DEFAULT-FUNKTIONEN =====

function getDefaultGlobalStatistics(): GlobalStatistics {
  return {
    totalSessions: 0,
    totalGames: 0,
    totalPlayTime: '0h 0m',
    firstJassDate: null,
    lastJassDate: null,
    groupCount: 0,
    sessionsWon: 0,
    sessionsTied: 0,
    sessionsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    sessionWinRate: 0,
    gameWinRate: 0,
    avgPointsPerGame: 0,
    avgStrichePerGame: 0,
    avgWeisPointsPerGame: 0,
    avgMatschPerGame: 0,
    highestPoints: { value: 0, gameId: null, date: null },
    highestWeisPoints: { value: 0, gameId: null, date: null },
    highestStriche: { value: 0, gameId: null, date: null },
    longestSession: { value: '0h 0m', sessionId: null, date: null },
    trumpfStatistik: {},
    totalTrumpfCount: 0,
    partnerAggregates: [],
    opponentAggregates: []
  };
}

function getDefaultGroupStatistics(groupId: string, groupName: string): GroupStatistics {
  return {
    groupId,
    groupName,
    gamesPlayed: 0,
    gamesWon: 0,
    gameWinRate: 0,
    avgPoints: 0,
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionWinRate: 0
  };
}

function getDefaultTournamentStatistics(tournamentId: string, tournamentName: string): TournamentStatistics {
  return {
    tournamentId,
    tournamentName,
    gamesPlayed: 0,
    gamesWon: 0,
    gameWinRate: 0,
    avgPoints: 0,
    finalRanking: undefined
  };
}
