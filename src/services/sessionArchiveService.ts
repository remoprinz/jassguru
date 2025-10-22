/**
 * 🎯 SESSION ARCHIVE SERVICE - Backend-precomputed Session Data
 * =============================================================
 * 
 * Dieser Service lädt vorberechnete Session-Archive aus dem Backend.
 * Alle komplexen Berechnungen werden in Cloud Functions durchgeführt.
 * 
 * ✅ ARCHITEKTUR:
 * - Backend: Cloud Functions berechnen Session-Archive bei Session-End
 * - Frontend: Lädt nur noch die fertigen Daten
 * - Performance: Keine komplexen Frontend-Aggregationen mehr
 * - Konsistenz: Einheitliche Berechnungslogik im Backend
 */

import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// ===== TYPEN =====

export interface SessionArchive {
  playerId: string;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalSessionArchive;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupSessionArchive;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentSessionArchive;
  };
  
  lastUpdated: Date;
}

export interface GlobalSessionArchive {
  // ✅ ABGESCHLOSSENE SESSIONS
  completedSessions: CompletedSessionSummary[];
  
  // ✅ STATISTIKEN
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  
  // ✅ SORTIERTE JAHRE
  sortedYears: string[];
  groupedByYear: { [year: string]: CompletedSessionSummary[] };
}

export interface GroupSessionArchive {
  groupId: string;
  groupName: string;
  completedSessions: CompletedSessionSummary[];
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
}

export interface TournamentSessionArchive {
  tournamentId: string;
  tournamentName: string;
  completedSessions: CompletedSessionSummary[];
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
}

export interface CompletedSessionSummary {
  id: string;
  groupId: string;
  groupName: string;
  tournamentId?: string;
  tournamentName?: string;
  startedAt: Date;
  completedAt: Date;
  duration: string; // formatierte Zeit
  participantCount: number;
  gameCount: number;
  playerStats: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    totalPoints: number;
    totalStriche: number;
    totalWeisPoints: number;
    totalMatsch: number;
    winRate: number;
    avgPointsPerGame: number;
    avgStrichePerGame: number;
  };
  partners: string[];
  opponents: string[];
  type: 'session' | 'tournament';
}

export interface SessionArchiveHistoryEntry {
  timestamp: Date;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalSessionArchive;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupSessionArchive;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentSessionArchive;
  };
  
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc';
}

// ===== FUNKTIONEN =====

/**
 * Lädt aktuelles Session-Archive für einen Spieler
 */
export async function loadPlayerSessionArchive(playerId: string): Promise<SessionArchive | null> {
  try {
    const archiveDoc = await getDoc(doc(db, 'players', playerId, 'currentSessionArchive', 'latest'));
    
    if (archiveDoc.exists()) {
      const data = archiveDoc.data();
      const archive: SessionArchive = {
        playerId,
        global: data.global || getDefaultGlobalSessionArchive(),
        groups: data.groups || {},
        tournaments: data.tournaments || {},
        lastUpdated: data.lastUpdated?.toDate() || new Date()
      };
      return archive;
    } else {
      // Fallback: Leeres Archive
      return {
        playerId,
        global: getDefaultGlobalSessionArchive(),
        groups: {},
        tournaments: {},
        lastUpdated: new Date()
      };
    }
  } catch (error) {
    console.warn(`Fehler beim Laden des Session-Archives für Spieler ${playerId}:`, error);
    return null;
  }
}

/**
 * Lädt Session-Archive-Historie für einen Spieler
 */
export async function getPlayerSessionArchiveHistory(
  playerId: string,
  limitCount: number = 100
): Promise<SessionArchiveHistoryEntry[]> {
  try {
    const historyQuery = query(
      collection(db, 'players', playerId, 'sessionArchiveHistory'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(historyQuery);
    const history: SessionArchiveHistoryEntry[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        timestamp: data.timestamp?.toDate() || new Date(),
        global: data.global || getDefaultGlobalSessionArchive(),
        groups: data.groups || {},
        tournaments: data.tournaments || {},
        eventType: data.eventType || 'session_end'
      });
    });
    
    return history;
  } catch (error) {
    console.warn(`Fehler beim Laden der Session-Archive-Historie für Spieler ${playerId}:`, error);
    return [];
  }
}

/**
 * Lädt Sessions für ein bestimmtes Jahr
 */
export async function getSessionsForYear(
  playerId: string,
  year: string
): Promise<CompletedSessionSummary[]> {
  try {
    const archive = await loadPlayerSessionArchive(playerId);
    if (!archive) return [];
    
    return archive.global.groupedByYear[year] || [];
  } catch (error) {
    console.warn(`Fehler beim Laden der Sessions für Jahr ${year}:`, error);
    return [];
  }
}

/**
 * Lädt Sessions für eine bestimmte Gruppe
 */
export async function getSessionsForGroup(
  playerId: string,
  groupId: string
): Promise<CompletedSessionSummary[]> {
  try {
    const archive = await loadPlayerSessionArchive(playerId);
    if (!archive) return [];
    
    return archive.groups[groupId]?.completedSessions || [];
  } catch (error) {
    console.warn(`Fehler beim Laden der Sessions für Gruppe ${groupId}:`, error);
    return [];
  }
}

/**
 * Lädt Sessions für ein bestimmtes Turnier
 */
export async function getSessionsForTournament(
  playerId: string,
  tournamentId: string
): Promise<CompletedSessionSummary[]> {
  try {
    const archive = await loadPlayerSessionArchive(playerId);
    if (!archive) return [];
    
    return archive.tournaments[tournamentId]?.completedSessions || [];
  } catch (error) {
    console.warn(`Fehler beim Laden der Sessions für Turnier ${tournamentId}:`, error);
    return [];
  }
}

// ===== HILFSFUNKTIONEN =====

function getDefaultGlobalSessionArchive(): GlobalSessionArchive {
  return {
    completedSessions: [],
    totalSessions: 0,
    totalGames: 0,
    totalPlayTime: '0h 0m',
    firstSessionDate: null,
    lastSessionDate: null,
    sortedYears: [],
    groupedByYear: {}
  };
}
