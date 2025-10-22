/**
 * 🎯 PLAYER STATISTICS SERVICE - Backend-precomputed Statistics
 * ============================================================
 * 
 * Dieser Service lädt vorberechnete Spieler-Statistiken aus dem Backend.
 * Alle komplexen Berechnungen werden in Cloud Functions durchgeführt.
 * 
 * ✅ ARCHITEKTUR:
 * - Backend: Cloud Functions berechnen Statistiken bei Session/Tournament-End
 * - Frontend: Lädt nur noch die fertigen Daten
 * - Performance: Keine komplexen Frontend-Aggregationen mehr
 * - Konsistenz: Einheitliche Berechnungslogik im Backend
 */

import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// ===== TYPEN =====

export interface PlayerStatistics {
  playerId: string;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalStatistics;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupStatistics;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentStatistics;
  };
  
  lastUpdated: Date;
}

export interface GlobalStatistics {
  // ✅ KERN-METRIKEN
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string; // formatierte Zeit
  firstJassDate: string | null;
  lastJassDate: string | null;
  groupCount: number;
  
  // ✅ SPIEL-LEISTUNG
  sessionsWon: number;
  sessionsTied: number;
  sessionsLost: number;
  gamesWon: number;
  gamesLost: number;
  sessionWinRate: number; // 0-1
  gameWinRate: number; // 0-1
  
  // ✅ DURCHSCHNITTSWERTE
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgWeisPointsPerGame: number;
  avgMatschPerGame: number;
  
  // ✅ HIGHLIGHTS
  highestPoints: { value: number; gameId: string | null; date: string | null };
  highestWeisPoints: { value: number; gameId: string | null; date: string | null };
  highestStriche: { value: number; gameId: string | null; date: string | null };
  longestSession: { value: string; sessionId: string | null; date: string | null };
  
  // ✅ TRUMPF-STATISTIK
  trumpfStatistik: { [farbe: string]: number };
  totalTrumpfCount: number;
  
  // ✅ PARTNER/GEGNER AGGREGATES
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

export interface PlayerStatisticsHistoryEntry {
  timestamp: Date;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalStatistics;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupStatistics;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentStatistics;
  };
  
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc';
}

// ===== FUNKTIONEN =====

/**
 * Lädt aktuelle Spieler-Statistiken für einen oder mehrere Spieler
 */
export async function loadPlayerStatistics(playerIds: string[]): Promise<Map<string, PlayerStatistics>> {
  const result = new Map<string, PlayerStatistics>();
  
  for (const playerId of playerIds) {
    try {
      const statsDoc = await getDoc(doc(db, 'players', playerId, 'currentStatistics', 'latest'));
      
      if (statsDoc.exists()) {
        const data = statsDoc.data();
        const stats: PlayerStatistics = {
          playerId,
          global: data.global || getDefaultGlobalStatistics(),
          groups: data.groups || {},
          tournaments: data.tournaments || {},
          lastUpdated: data.lastUpdated?.toDate() || new Date()
        };
        result.set(playerId, stats);
      } else {
        // Fallback: Leere Statistiken
        result.set(playerId, {
          playerId,
          global: getDefaultGlobalStatistics(),
          groups: {},
          tournaments: {},
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      console.warn(`Fehler beim Laden der Statistiken für Spieler ${playerId}:`, error);
      result.set(playerId, {
        playerId,
        global: getDefaultGlobalStatistics(),
        groups: {},
        tournaments: {},
        lastUpdated: new Date()
      });
    }
  }
  
  return result;
}

/**
 * Lädt Statistiken-Historie für einen Spieler
 */
export async function getPlayerStatisticsHistory(
  playerId: string,
  limitCount: number = 100
): Promise<PlayerStatisticsHistoryEntry[]> {
  try {
    const historyQuery = query(
      collection(db, 'players', playerId, 'statisticsHistory'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(historyQuery);
    const history: PlayerStatisticsHistoryEntry[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        timestamp: data.timestamp?.toDate() || new Date(),
        global: data.global || getDefaultGlobalStatistics(),
        groups: data.groups || {},
        tournaments: data.tournaments || {},
        eventType: data.eventType || 'session_end'
      });
    });
    
    return history;
  } catch (error) {
    console.warn(`Fehler beim Laden der Statistiken-Historie für Spieler ${playerId}:`, error);
    return [];
  }
}

/**
 * Lädt Zeitreihen-Daten für Charts aus der Statistiken-Historie
 */
export async function getPlayerStatisticsTimeSeries(
  playerId: string,
  metric: 'totalSessions' | 'totalGames' | 'sessionWinRate' | 'gameWinRate' | 'avgPointsPerGame',
  limitCount: number = 100
): Promise<{
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
}> {
  try {
    const history = await getPlayerStatisticsHistory(playerId, limitCount);
    
    if (history.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    // Sortiere chronologisch (älteste zuerst)
    const sortedHistory = history.reverse();
    
    const labels = sortedHistory.map(entry => 
      entry.timestamp.toLocaleDateString('de-CH', { 
        month: 'short', 
        day: 'numeric' 
      })
    );
    
    const data = sortedHistory.map(entry => {
      switch (metric) {
        case 'totalSessions':
          return entry.global.totalSessions;
        case 'totalGames':
          return entry.global.totalGames;
        case 'sessionWinRate':
          return entry.global.sessionWinRate * 100; // Als Prozent
        case 'gameWinRate':
          return entry.global.gameWinRate * 100; // Als Prozent
        case 'avgPointsPerGame':
          return entry.global.avgPointsPerGame;
        default:
          return 0;
      }
    });
    
    return {
      labels,
      datasets: [{
        label: getMetricLabel(metric),
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)'
      }]
    };
  } catch (error) {
    console.warn(`Fehler beim Laden der Zeitreihen für ${metric}:`, error);
    return {
      labels: [],
      datasets: []
    };
  }
}

// ===== HILFSFUNKTIONEN =====

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

function getMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    'totalSessions': 'Anzahl Partien',
    'totalGames': 'Anzahl Spiele',
    'sessionWinRate': 'Siegquote Partien (%)',
    'gameWinRate': 'Siegquote Spiele (%)',
    'avgPointsPerGame': 'Ø Punkte pro Spiel'
  };
  return labels[metric] || metric;
}
