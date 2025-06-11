import { db, firebaseApp } from '@/services/firebaseInit';
import { collection, query, where, getDocs, orderBy, Timestamp, getFirestore, doc, getDoc } from 'firebase/firestore';
import type { StricheRecord, CompletedGameSummary, FirestoreGroup, PlayerId, PlayerNames, SessionSummary as GlobalSessionSummary, PlayerNumber } from '@/types/jass';
import { formatDuration } from '@/utils/timeUtils';
import { getOrtNameByPlz } from '@/utils/locationUtils';
import { DEFAULT_STROKE_SETTINGS } from '@/config/ScoreSettings'; // Importiere die Standard-Konfiguration
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings'; // Importiere die Standard-Konfiguration
import type { GroupComputedStats, GroupStatHighlightPlayer as BackendHighlightPlayer, GroupStatHighlightTeam as BackendHighlightTeam } from '@/../../functions/src/models/group-stats.model'; // NEU: Backend-Typen importieren

// NEUE, SAUBERE FRONTEND-TYPEN
export interface FrontendHighlightPlayer {
  playerId: string;
  name: string;
  value: number;
  eventsPlayed: number;
  lastPlayedTimestamp?: Date | null;
  displayValue?: string;
}

export interface FrontendHighlightTeam {
  names: string[];
  value: number;
  eventsPlayed: number;
}

// Füge diese Hilfsfunktion am Anfang der Datei nach den Imports hinzu
// Diese Funktion kann verschiedene Timestamp-Formate in ein Date-Objekt konvertieren
function getDateFromTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  // Fall 1: Es ist bereits ein Date-Objekt
  if (timestamp instanceof Date) return timestamp;
  
  // Fall 2: Firebase Timestamp-Objekt mit toDate()-Methode
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // Fall 3: Serialisiertes Timestamp-Objekt mit seconds/nanoseconds
  if (timestamp.seconds !== undefined && (timestamp.nanoseconds !== undefined || timestamp._nanoseconds !== undefined)) {
    const nanos = timestamp.nanoseconds !== undefined ? timestamp.nanoseconds : timestamp._nanoseconds;
    return new Date((timestamp.seconds || timestamp._seconds) * 1000 + nanos / 1000000);
  }
  
  // Fall 4: Timestamp als Zahl (Millisekunden seit Epoch)
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  
  // Fall 5: ISO-String
  if (typeof timestamp === 'string') {
    try {
      return new Date(timestamp);
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

// Hilfsfunktion zur Umrechnung von Millisekunden in lesbare Zeit
export function formatDurationForStats(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  
  return `${seconds}s`;
}

/**
 * Extrahiert Weispunkte für eine gegebene Teamposition aus einem Spiel.
 * Priorität: 
 * 1. Positive game.weisPoints
 * 2. Positive _savedWeisPoints aus der ersten Runde
 * 3. Summe aller weisAction-Punkte aus der roundHistory
 * Der höchste Wert aus diesen Quellen wird zurückgegeben.
 */
function extractWeisPointsFromGameData(teamPosition: 'top' | 'bottom', game: CompletedGameSummary): number {
  // Initialwerte
  let weisFromGameObject = 0;
  let weisFromSavedPoints = 0;
  let weisFromActions = 0;
  
  // 1. Versuche game.weisPoints direkt zu verwenden
  if (game.weisPoints) {
    // Konvertiere zu Zahl falls es ein String ist
    if (typeof game.weisPoints[teamPosition] === 'number') {
      weisFromGameObject = game.weisPoints[teamPosition];
    } else if (typeof game.weisPoints[teamPosition] === 'string') {
      // Konvertiere String zu Zahl
      const parsed = parseInt(game.weisPoints[teamPosition] as string, 10);
      if (!isNaN(parsed)) {
        weisFromGameObject = parsed;
      }
    }
  }
  
  // 2. Versuche _savedWeisPoints aus der ersten Runde zu extrahieren
  if (game.roundHistory && game.roundHistory.length > 0) {
    const firstRound = game.roundHistory[0] as unknown as Record<string, unknown>;
    if (firstRound._savedWeisPoints && typeof firstRound._savedWeisPoints === 'object') {
      const savedWeis = firstRound._savedWeisPoints as Record<string, unknown>;
      if (savedWeis[teamPosition] && typeof savedWeis[teamPosition] === 'number') {
        weisFromSavedPoints = savedWeis[teamPosition] as number;
      } else if (savedWeis[teamPosition] && typeof savedWeis[teamPosition] === 'string') {
        // Konvertiere String zu Zahl
        const parsed = parseInt(savedWeis[teamPosition] as string, 10);
        if (!isNaN(parsed)) {
          weisFromSavedPoints = parsed;
        }
      }
    }
  }
  
  // 3. Berechne die Summe aller weisActions in der roundHistory
  if (game.roundHistory && game.roundHistory.length > 0) {
    let roundWeisSum = 0;
    for (const round of game.roundHistory) {
      const roundCast = round as unknown as Record<string, unknown>;
      if (roundCast.weisActions && Array.isArray(roundCast.weisActions)) {
        for (const action of roundCast.weisActions) {
          if (typeof action === 'object' && action !== null && 
              'position' in action && 'points' in action && 
              action.position === teamPosition) {
            let points = 0;
            if (typeof action.points === 'number') {
              points = action.points;
            } else if (typeof action.points === 'string') {
              const parsed = parseInt(action.points, 10);
              if (!isNaN(parsed)) {
                points = parsed;
              }
            }
            roundWeisSum += points;
          }
        }
      }
    }
    weisFromActions = roundWeisSum;
  }
  
  // Nimm den höchsten Wert aus allen drei Quellen
  const maxWeis = Math.max(weisFromGameObject, weisFromSavedPoints, weisFromActions);
  
  // Debug-Logging für die gesamte Weispunkte-Extraktion
  // console.log(`[DEBUG-WEIS] Game ${game.activeGameId}: Team ${teamPosition} - weisFromGameObject: ${weisFromGameObject}, weisFromSavedPoints: ${weisFromSavedPoints}, weisFromActions: ${weisFromActions}, FINAL: ${maxWeis}`);
  
  return maxWeis;
}

// NEUE Schwellenwerte für Highlight-Qualifikation und Gewichtung
const PLAYER_GAMES_FULL_WEIGHT_THRESHOLD = 50;
const PLAYER_SESSIONS_FULL_WEIGHT_THRESHOLD = 10;
const TEAM_GAMES_FULL_WEIGHT_THRESHOLD = 30;
const TEAM_SESSIONS_FULL_WEIGHT_THRESHOLD = 5;
const MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT = 1;

// Typen für die Statistik-Ergebnisse (ANGEPASST)
export interface GroupStatistics {
  groupId: string;
  memberCount: number;
  sessionCount: number;
  gameCount: number;
  totalPlayTime: string; 
  firstJassDate: string;
  lastJassDate: string;
  hauptspielortName: string | null; 
  avgSessionDuration: string;
  avgGameDuration: string;
  avgGamesPerSession: number;
  avgRoundsPerGame: number;
  avgMatschPerGame: number;
  avgRoundDuration: string;
  playerWithMostGames: FrontendHighlightPlayer[];
  playerWithHighestStricheDiff: FrontendHighlightPlayer[];
  playerWithHighestPointsDiff: FrontendHighlightPlayer[];
  playerWithHighestWinRateSession: FrontendHighlightPlayer[];
  playerWithHighestWinRateGame: FrontendHighlightPlayer[];
  playerWithHighestMatschRate: FrontendHighlightPlayer[];
  playerWithHighestSchneiderRate: FrontendHighlightPlayer[];
  playerWithHighestKontermatschRate: FrontendHighlightPlayer[];
  playerWithMostWeisPointsAvg: FrontendHighlightPlayer[];
  playerAllRoundTimes: (FrontendHighlightPlayer & { displayValue?: string })[];
  playerWithFastestRounds: FrontendHighlightPlayer[];
  playerWithSlowestRounds: FrontendHighlightPlayer[];
  teamWithHighestWinRateSession: FrontendHighlightTeam[];
  teamWithHighestWinRateGame: FrontendHighlightTeam[];
  teamWithHighestPointsDiff: FrontendHighlightTeam[];
  teamWithHighestStricheDiff: FrontendHighlightTeam[];
  teamWithHighestMatschRate: FrontendHighlightTeam[];
  teamWithHighestSchneiderRate: FrontendHighlightTeam[];
  teamWithHighestKontermatschRate: FrontendHighlightTeam[];
  teamWithMostWeisPointsAvg: FrontendHighlightTeam[];
  teamWithFastestRounds: FrontendHighlightTeam[];
  trumpfStatistik: { [key: string]: number };
  totalTrumpfCount: number;
}

export const initialGroupStatistics: GroupStatistics = {
  groupId: "",
  memberCount: 0,
  sessionCount: 0,
  gameCount: 0,
  totalPlayTime: "-",
  firstJassDate: "-",
  lastJassDate: "-",
  hauptspielortName: null,
  avgSessionDuration: "-",
  avgGameDuration: "-",
  avgGamesPerSession: 0,
  avgRoundsPerGame: 0,
  avgMatschPerGame: 0,
  avgRoundDuration: "-",
  playerWithMostGames: [],
  playerWithHighestStricheDiff: [],
  playerWithHighestPointsDiff: [],
  playerWithHighestWinRateSession: [],
  playerWithHighestWinRateGame: [],
  playerWithHighestMatschRate: [],
  playerWithHighestSchneiderRate: [],
  playerWithHighestKontermatschRate: [],
  playerWithMostWeisPointsAvg: [],
  playerAllRoundTimes: [],
  playerWithFastestRounds: [],
  playerWithSlowestRounds: [],
  teamWithHighestWinRateSession: [],
  teamWithHighestWinRateGame: [],
  teamWithHighestPointsDiff: [],
  teamWithHighestStricheDiff: [],
  teamWithHighestMatschRate: [],
  teamWithHighestSchneiderRate: [],
  teamWithHighestKontermatschRate: [],
  teamWithMostWeisPointsAvg: [],
  teamWithFastestRounds: [],
  trumpfStatistik: {},
  totalTrumpfCount: 0,
};

// Hilfsfunktion zum Berechnen der Strich-Summe
const sumStriche = (striche: StricheRecord): number => {
  return (
    (striche.berg || 0) +
    (striche.sieg || 0) +
    (striche.matsch || 0) +
    (striche.schneider || 0) +
    (striche.kontermatsch || 0)
  );
};

// Hilfsfunktion zum Formatieren von Prozentangaben
const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

// Hilfsfunktion zur sicheren Prüfung auf Firestore Timestamp
function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return Boolean(value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function');
}

// Verbindung zum Service
import {
  fetchAllGroupSessions,
  fetchAllGamesForSession,
  fetchAllGamesForGroup,
  getGroupDetails,
  SessionSummary,
} from '@/services/sessionService';

// Hilfsfunktionen aus statisticsUtils importieren
import {
  calculateTotalStriche, // Wird im neuen fetchGroupStatistics nicht mehr direkt benötigt
  determineWinningTeam, // Wird im neuen fetchGroupStatistics nicht mehr direkt benötigt
} from '@/utils/statisticsUtils';
import { generatePairingId } from '@/utils/jassUtils'; // Für Team-Paarungs-IDs

// Hilfsfunktion für leere Statistiken (angepasst an neue Feldnamen und Array-Typen in Highlights)
export function createEmptyStatistics(): GroupStatistics {
  return JSON.parse(JSON.stringify(initialGroupStatistics));
}

// Hauptfunktion zum Abrufen der Gruppenstatistiken (ANGEPASST)
export const fetchGroupStatistics = async (groupId: string, groupMainLocationZip: string | null | undefined): Promise<GroupStatistics> => {
  try {
    const groupStatsRef = doc(db, "groupComputedStats", groupId);
    const groupStatsSnap = await getDoc(groupStatsRef);

    if (!groupStatsSnap.exists()) {
      console.warn(`[fetchGroupStatistics] No computed stats found for groupId: ${groupId}. Returning empty stats.`);
      return createEmptyStatistics();
    }

    const backendData = groupStatsSnap.data() as GroupComputedStats;

    const transformPlayerHighlights = (backendHighlights: BackendHighlightPlayer[] | undefined | null): FrontendHighlightPlayer[] => {
      if (!backendHighlights) return [];
      return backendHighlights.map(p => ({
        playerId: p.playerId,
        name: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed || 0,
        lastPlayedTimestamp: p.lastPlayedTimestamp ? getDateFromTimestamp(p.lastPlayedTimestamp) : null,
        displayValue: p.displayValue,
      }));
    };

    const transformTeamHighlights = (backendHighlights: BackendHighlightTeam[] | undefined | null): FrontendHighlightTeam[] => {
      if (!backendHighlights) return [];
      return backendHighlights.map(t => ({
          names: t.names,
        value: typeof t.value === 'number' ? t.value : parseFloat(t.value as string),
        eventsPlayed: t.eventsPlayed || 0,
      }));
    };
    
    // Hauptspielort bestimmen (bleibt wie im Backend, da es dort schon mit getOrtNameByPlz Logik versehen ist)
    const ermittelterHauptspielortName = backendData.hauptspielortName;

    return {
      groupId,
      memberCount: backendData.memberCount,
      sessionCount: backendData.sessionCount,
      gameCount: backendData.gameCount,
      totalPlayTime: formatDurationForStats(backendData.totalPlayTimeSeconds * 1000),
      firstJassDate: backendData.firstJassTimestamp ? getDateFromTimestamp(backendData.firstJassTimestamp)?.toLocaleDateString('de-CH') || "-" : "-",
      lastJassDate: backendData.lastJassTimestamp ? getDateFromTimestamp(backendData.lastJassTimestamp)?.toLocaleDateString('de-CH') || "-" : "-",
      hauptspielortName: ermittelterHauptspielortName,
      
      avgSessionDuration: formatDurationForStats(backendData.avgSessionDurationSeconds * 1000),
      avgGameDuration: formatDurationForStats(backendData.avgGameDurationSeconds * 1000),
      avgGamesPerSession: backendData.avgGamesPerSession,
      avgRoundsPerGame: backendData.avgRoundsPerGame,
      avgMatschPerGame: backendData.avgMatschPerGame,
      avgRoundDuration: backendData.avgRoundDurationSeconds
        ? formatDurationForStats(backendData.avgRoundDurationSeconds * 1000)
        : "-",
      
      // NEU: Übernehme die neue Map-Struktur direkt
      trumpfStatistik: backendData.trumpfStatistik || {},
      totalTrumpfCount: backendData.totalTrumpfCount || 0,
      
      playerWithMostGames: transformPlayerHighlights(backendData.playerWithMostGames),
      playerWithHighestStricheDiff: transformPlayerHighlights(backendData.playerWithHighestStricheDiff),
      playerWithHighestPointsDiff: transformPlayerHighlights(backendData.playerWithHighestPointsDiff),
      playerWithHighestWinRateSession: transformPlayerHighlights(backendData.playerWithHighestWinRateSession),
      playerWithHighestWinRateGame: transformPlayerHighlights(backendData.playerWithHighestWinRateGame),
      playerWithHighestMatschRate: transformPlayerHighlights(backendData.playerWithHighestMatschRate),
      playerWithHighestSchneiderRate: transformPlayerHighlights(backendData.playerWithHighestSchneiderRate),
      playerWithHighestKontermatschRate: transformPlayerHighlights(backendData.playerWithHighestKontermatschRate),
      playerWithMostWeisPointsAvg: transformPlayerHighlights(backendData.playerWithMostWeisPointsAvg),
      playerAllRoundTimes: transformPlayerHighlights(backendData.playerAllRoundTimes),
      playerWithFastestRounds: transformPlayerHighlights(backendData.playerWithFastestRounds),
      playerWithSlowestRounds: transformPlayerHighlights(backendData.playerWithSlowestRounds),
      
      teamWithHighestWinRateSession: transformTeamHighlights(backendData.teamWithHighestWinRateSession),
      teamWithHighestWinRateGame: transformTeamHighlights(backendData.teamWithHighestWinRateGame),
      teamWithHighestPointsDiff: transformTeamHighlights(backendData.teamWithHighestPointsDiff),
      teamWithHighestStricheDiff: transformTeamHighlights(backendData.teamWithHighestStricheDiff),
      teamWithHighestMatschRate: transformTeamHighlights(backendData.teamWithHighestMatschRate),
      teamWithHighestSchneiderRate: transformTeamHighlights(backendData.teamWithHighestSchneiderRate),
      teamWithHighestKontermatschRate: transformTeamHighlights(backendData.teamWithHighestKontermatschRate),
      teamWithMostWeisPointsAvg: transformTeamHighlights(backendData.teamWithMostWeisPointsAvg),
      teamWithFastestRounds: transformTeamHighlights(backendData.teamWithFastestRounds),
    };

  } catch (error) {
    console.error('[fetchGroupStatistics] Fehler beim Abrufen der Gruppenstatistiken:', error);
    return createEmptyStatistics();
  }
}; 

// Aktualisierte Spielerstatistik-Schnittstelle
export interface PlayerStatistics {
  // Spielerübersicht
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string; // formatierte Zeit
  firstJassDate: string | null; // formatiertes Datum
  lastJassDate: string | null; // formatiertes Datum
  groupCount: number;
  
  // Spiel-Leistung
  sessionsWon: number;
  sessionsTied: number;
  sessionsLost: number;
  gamesWon: number;
  gamesLost: number;
  sessionWinRate: number; // 0-1
  gameWinRate: number; // 0-1
  
  // Durchschnittswerte
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgWeisPointsPerGame: number;
  avgMatschPerGame: number;
  
  // Highlights
  highestPoints: { value: number; gameId: string | null; date: string | null };
  highestWeisPoints: { value: number; gameId: string | null; date: string | null };
  highestStriche: { value: number; gameId: string | null; date: string | null };
  longestSession: { value: string; sessionId: string | null; date: string | null };
  
  // Per-Group Statistiken (Map mit Gruppen-ID als Schlüssel)
  groupStats: Map<string, {
    groupName: string;
    gamesPlayed: number;
    gamesWon: number;
    gameWinRate: number;
    avgPoints: number;
  }>;
}

// Funktion für leere Spielerstatistiken
export function createEmptyPlayerStatistics(): PlayerStatistics {
  return {
    totalSessions: 0,
    totalGames: 0,
    totalPlayTime: '-',
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
    longestSession: { value: '-', sessionId: null, date: null },
    
    groupStats: new Map()
  };
}

// Hilfsfunktion zum Bestimmen des Teams eines Spielers in einer Session
function getPlayerTeamInSession(playerId: string, session: SessionSummary): 'top' | 'bottom' | null {
  // Prüfe zuerst, ob wir die Team-Struktur aus dem teams-objekt lesen können - höchste Priorität
  if (session.teams && typeof session.teams === 'object') {
    const teamsData = session.teams as any;
    
    // Prüfe, ob der Spieler in Team A (bottom) ist
    if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players)) {
      if (teamsData.teamA.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom'; // Team A entspricht dem "bottom" Team
      }
    }
    
    // Prüfe, ob der Spieler in Team B (top) ist
    if (teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
      if (teamsData.teamB.players.some((p: any) => p.playerId === playerId)) {
        return 'top'; // Team B entspricht dem "top" Team
      }
    }
  }
  
  // Als nächstes pairingIdentifiers prüfen - beide Schreibweisen berücksichtigen
  if (session.pairingIdentifiers && typeof session.pairingIdentifiers === 'object') {
    const pairingData = session.pairingIdentifiers as any;
    
    // Prüfe "teamA" (klein geschrieben)
    if (pairingData.teamA && typeof pairingData.teamA === 'string') {
      const playerIds = pairingData.teamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "TeamA" (groß geschrieben)
    if (pairingData.TeamA && typeof pairingData.TeamA === 'string') {
      const playerIds = pairingData.TeamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "teamB" (klein geschrieben)
    if (pairingData.teamB && typeof pairingData.teamB === 'string') {
      const playerIds = pairingData.teamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
    
    // Prüfe "TeamB" (groß geschrieben)
    if (pairingData.TeamB && typeof pairingData.TeamB === 'string') {
      const playerIds = pairingData.TeamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
  }
  
  // Fallback auf die Position im Array
  if (!session.participantUids) return null;
  
  const playerIndex = session.participantUids.indexOf(playerId);
  if (playerIndex === -1) return null;
  
  // Konvention: Spieler 1 & 3 (Index 0 & 2) sind Team "bottom", Spieler 2 & 4 (Index 1 & 3) sind Team "top"
  return (playerIndex === 0 || playerIndex === 2) ? 'bottom' : 'top';
}

// Hilfsfunktion zum Bestimmen des Teams eines Spielers in einem Spiel - VERBESSERT
function getPlayerTeamInGame(playerId: string, game: CompletedGameSummary): 'top' | 'bottom' | null {
  // Prüfe zuerst, ob wir die Team-Struktur aus dem teams-Objekt lesen können - höchste Priorität
  if (game.teams && typeof game.teams === 'object') {
    const teamsData = game.teams as any;
    
    // Prüfe, ob der Spieler in Team A/bottom ist (alle möglichen Feldnamen berücksichtigen)
    if (teamsData.bottom?.players && Array.isArray(teamsData.bottom.players)) {
      if (teamsData.bottom.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom';
      }
    } else if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players)) {
      if (teamsData.teamA.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe, ob der Spieler in Team B/top ist (alle möglichen Feldnamen berücksichtigen)
    if (teamsData.top?.players && Array.isArray(teamsData.top.players)) {
      if (teamsData.top.players.some((p: any) => p.playerId === playerId)) {
        return 'top';
      }
    } else if (teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
      if (teamsData.teamB.players.some((p: any) => p.playerId === playerId)) {
        return 'top';
      }
    }
  }
  
  // Als nächstes pairingIdentifiers prüfen - beide Schreibweisen berücksichtigen
  const gameAny = game as any;
  if (gameAny.pairingIdentifiers && typeof gameAny.pairingIdentifiers === 'object') {
    const pairingData = gameAny.pairingIdentifiers;
    
    // Prüfe "teamA" (klein geschrieben) - entspricht 'bottom'
    if (pairingData.teamA && typeof pairingData.teamA === 'string') {
      const playerIds = pairingData.teamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "TeamA" (groß geschrieben) - entspricht 'bottom'
    if (pairingData.TeamA && typeof pairingData.TeamA === 'string') {
      const playerIds = pairingData.TeamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "teamB" (klein geschrieben) - entspricht 'top'
    if (pairingData.teamB && typeof pairingData.teamB === 'string') {
      const playerIds = pairingData.teamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
    
    // Prüfe "TeamB" (groß geschrieben) - entspricht 'top'
    if (pairingData.TeamB && typeof pairingData.TeamB === 'string') {
      const playerIds = pairingData.TeamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
  }
  
  // Verbesserter Fallback: Prüfe auf playerPositions oder gameSettings
  if (gameAny.playerPositions && typeof gameAny.playerPositions === 'object') {
    for (const [position, pid] of Object.entries(gameAny.playerPositions)) {
      if (pid === playerId) {
        // Konvention: Positionen 1 & 3 sind Team 'bottom', 2 & 4 sind Team 'top'
        const posNum = parseInt(position, 10);
        if (posNum === 1 || posNum === 3) return 'bottom';
        if (posNum === 2 || posNum === 4) return 'top';
      }
    }
  }
  
  // Letzter Fallback: Positionen im participantUids-Array
  if (!game.participantUids) return null;
  
  const playerIndex = game.participantUids.indexOf(playerId);
  if (playerIndex === -1) return null;
  
  // Konvention: Spieler 1 & 3 (Index 0 & 2) sind Team "bottom", Spieler 2 & 4 (Index 1 & 3) sind Team "top"
  return (playerIndex === 0 || playerIndex === 2) ? 'bottom' : 'top';
}

interface GameWithId extends CompletedGameSummary {
  id: string;
  timestamp?: number;
}

// Hauptfunktion zum Abrufen der Spielerstatistiken
export const fetchPlayerStatistics = async (playerId: string): Promise<PlayerStatistics | null> => {
  try {
    // Alle Sessions abrufen, an denen der Spieler teilgenommen hat
    const db = getFirestore(firebaseApp);
    const sessionsCollection = collection(db, 'jassSessions');
    const sessionsQuery = query(
      sessionsCollection,
      where('participantUids', 'array-contains', playerId),
      // Nur abgeschlossene Sessions berücksichtigen
      where('status', 'in', ['completed']),
      orderBy('startedAt', 'desc')
    );
    
    const sessionsSnapshot = await getDocs(sessionsQuery);
    const playerSessions: SessionSummary[] = [];
    
    sessionsSnapshot.forEach(doc => {
      const sessionData = doc.data() as SessionSummary;
      sessionData.id = doc.id;
      playerSessions.push(sessionData);
    });
    
    if (playerSessions.length === 0) {
      // console.log(`[fetchPlayerStatistics] Keine Sessions gefunden für Spieler: ${playerId}`);
      return createEmptyPlayerStatistics();
    }
    
    // Alle Spiele für diese Sessions abrufen
    const gamesBySession: Map<string, CompletedGameSummary[]> = new Map();
    const allPlayerGames: CompletedGameSummary[] = [];
    
    // Gruppiere alle Sessions nach Gruppen-ID
    const groupsMap = new Map<string, {
      groupId: string;
      groupName: string | null;
      sessions: SessionSummary[];
      games: CompletedGameSummary[];
    }>();
    
    // Initialisiere die Statistik mit leeren Werten
    const stats = createEmptyPlayerStatistics();
    
    // Setze grundlegende Werte
    stats.totalSessions = playerSessions.length;
    
    // Verarbeite alle Sessions des Spielers
    for (const session of playerSessions) {
      // Füge die Session der entsprechenden Gruppe hinzu
      const groupId = session.groupId || 'unknown';
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId,
          groupName: null, // Einfach null verwenden anstatt session.groupName
          sessions: [],
          games: []
        });
      }
      groupsMap.get(groupId)!.sessions.push(session);
      
      // Lade alle Spiele dieser Session
      const games = await fetchAllGamesForSession(session.id);
      if (games.length > 0) {
        gamesBySession.set(session.id, games);
        allPlayerGames.push(...games);
        
        // Füge die Spiele auch zur Gruppenstatistik hinzu
        groupsMap.get(groupId)!.games.push(...games);
      }
      
      // Bestimme das Team des Spielers in der Session
      const playerTeam = getPlayerTeamInSession(playerId, session);
      
      // Ergebnis der Session für den Spieler bestimmen
      if (playerTeam && session.finalScores) {
        if (session.finalScores.top === session.finalScores.bottom) {
          stats.sessionsTied++;
        } else if ((playerTeam === 'top' && session.finalScores.top > session.finalScores.bottom) ||
                   (playerTeam === 'bottom' && session.finalScores.bottom > session.finalScores.top)) {
          stats.sessionsWon++;
        } else {
          stats.sessionsLost++;
        }
      }
    }
    
    // Gruppenzählung aktualisieren
    stats.groupCount = groupsMap.size;
    
    // Zeitraum-Berechnungen
    let firstJassDateMs: number | null = null;
    let lastJassDateMs: number | null = null;
    
    const validSessionDates = playerSessions
      .map(s => s.startedAt)
      .filter(d => d !== null) as number[];
      
    if (validSessionDates.length > 0) {
      firstJassDateMs = Math.min(...validSessionDates);
      
      const validEndDates = playerSessions
        .map(s => s.endedAt || s.startedAt) // Fallback auf startedAt falls endedAt fehlt
        .filter(d => d !== null) as number[];
      if (validEndDates.length > 0) {
        lastJassDateMs = Math.max(...validEndDates);
      }
    }
    
    if (firstJassDateMs) {
      stats.firstJassDate = getDateFromTimestamp(firstJassDateMs)?.toLocaleDateString('de-CH') || null;
    }
    
    if (lastJassDateMs) {
      stats.lastJassDate = getDateFromTimestamp(lastJassDateMs)?.toLocaleDateString('de-CH') || null;
    }
    
    // Spielstatistiken berechnen
    stats.totalGames = allPlayerGames.length;
    
    // Gesamtspielzeit berechnen
    let totalPlayTimeMillis = 0;
    let maxSessionDurationMillis = 0;
    let longestSessionId: string | null = null;
    let longestSessionDate: number | null = null;
    
    // Variablen für Spiel-Höchstwerte
    let maxPoints = 0;
    let maxPointsGameId: string | null = null;
    let maxPointsDate: number | null = null;
    
    let maxWeisPoints = 0;
    let maxWeisPointsGameId: string | null = null;
    let maxWeisPointsDate: number | null = null;
    
    let maxStriche = 0;
    let maxStricheGameId: string | null = null;
    let maxStricheDate: number | null = null;
    
    playerSessions.forEach(session => {
      // Berechne Dauer der Session
      if (session.startedAt && session.endedAt) {
        const sessionDuration = session.endedAt - session.startedAt;
        totalPlayTimeMillis += sessionDuration;
        
        // Prüfe, ob dies die längste Session ist
        if (sessionDuration > maxSessionDurationMillis) {
          maxSessionDurationMillis = sessionDuration;
          longestSessionId = session.id;
          longestSessionDate = session.startedAt;
        }
      }
    });
    
    // Aktualisiere die Spielzeit-Statistiken
    stats.totalPlayTime = formatDurationForStats(totalPlayTimeMillis);
    if (maxSessionDurationMillis > 0) {
      stats.longestSession = {
        value: formatDurationForStats(maxSessionDurationMillis),
        sessionId: longestSessionId,
        date: longestSessionDate ? getDateFromTimestamp(longestSessionDate)?.toLocaleDateString('de-CH') || null : null
      };
    }
    
    // Auswertung der Spiele
    let totalPlayerPoints = 0;
    let totalPlayerStriche = 0;
    let totalPlayerWeis = 0;
    let totalPlayerMatsch = 0;
    
    allPlayerGames.forEach(game => {
      const playerTeam = getPlayerTeamInGame(playerId, game);
      if (!playerTeam) return; // Überspringe Spiele, in denen der Spieler nicht eindeutig identifiziert werden kann
      
      // Bestimme das Spielergebnis
      const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
      if (gameWinningTeam === playerTeam) {
        stats.gamesWon++;
      } else if (gameWinningTeam !== 'draw') {
        stats.gamesLost++;
      }
      
      // Sammle Punkte und Statistiken
      const teamScores = playerTeam === 'top' ? game.finalScores?.top : game.finalScores?.bottom;
      const teamStriche = playerTeam === 'top' ? game.finalStriche?.top : game.finalStriche?.bottom;
      
      // Punkte aktualisieren
      if (teamScores) {
        totalPlayerPoints += teamScores;
        
        // Höchstpunktezahl prüfen
        if (teamScores > maxPoints) {
          maxPoints = teamScores;
          maxPointsGameId = (game as GameWithId).id || null;
          maxPointsDate = (game as GameWithId).timestamp || null;
        }
      }
      
      // Striche berechnen
      if (teamStriche) {
        // KORREKTUR: Verwende die Standardwerte aus der Konfiguration
        const strokeSettings = {
          kontermatsch: DEFAULT_STROKE_SETTINGS.kontermatsch, // Standardwert aus der Konfiguration
          schneider: DEFAULT_STROKE_SETTINGS.schneider     // Standardwert aus der Konfiguration
        };
        // NEU: Verwende Standard-scoreEnabledSettings
        const scoreEnabledSettings = {
            berg: DEFAULT_SCORE_SETTINGS.enabled.berg,
            schneider: DEFAULT_SCORE_SETTINGS.enabled.schneider
        };
        
        // Berechne Striche mit den Multiplikatoren und aktivierten Regeln
        const totalStriche = calculateTotalStriche(teamStriche, strokeSettings, scoreEnabledSettings);
        totalPlayerStriche += totalStriche;
        
        // Höchste Striche prüfen
        if (totalStriche > maxStriche) {
          maxStriche = totalStriche;
          maxStricheGameId = (game as GameWithId).id || null;
          maxStricheDate = (game as GameWithId).timestamp || null;
        }
        
        // Matsch zählen
        if (teamStriche.matsch) {
          totalPlayerMatsch += teamStriche.matsch;
        }
      }
      
      // Weis-Punkte mit der zentralen Funktion extrahieren
      const gameWeisPoints = extractWeisPointsFromGameData(playerTeam, game);
      
      // Füge die Weis-Punkte zur Gesamtsumme hinzu und aktualisiere ggf. den Höchstwert
      totalPlayerWeis += gameWeisPoints;
      if (gameWeisPoints > maxWeisPoints) {
        maxWeisPoints = gameWeisPoints;
          maxWeisPointsGameId = (game as GameWithId).id || null;
          maxWeisPointsDate = (game as GameWithId).timestamp || null;
      }
    });
    
    // Durchschnittswerte berechnen
    if (stats.totalGames > 0) {
      stats.avgPointsPerGame = parseFloat((totalPlayerPoints / stats.totalGames).toFixed(1));
      stats.avgStrichePerGame = parseFloat((totalPlayerStriche / stats.totalGames).toFixed(1));
      stats.avgWeisPointsPerGame = parseFloat((totalPlayerWeis / stats.totalGames).toFixed(1));
      stats.avgMatschPerGame = parseFloat((totalPlayerMatsch / stats.totalGames).toFixed(2));
    }
    
    // Gewinnraten berechnen
    stats.sessionWinRate = stats.totalSessions > 0 ? stats.sessionsWon / stats.totalSessions : 0;
    stats.gameWinRate = stats.totalGames > 0 ? stats.gamesWon / stats.totalGames : 0;
    
    // Höchstwerte aktualisieren
    stats.highestPoints = {
      value: maxPoints,
      gameId: maxPointsGameId,
      date: maxPointsDate ? getDateFromTimestamp(maxPointsDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    stats.highestWeisPoints = {
      value: maxWeisPoints,
      gameId: maxWeisPointsGameId,
      date: maxWeisPointsDate ? getDateFromTimestamp(maxWeisPointsDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    stats.highestStriche = {
      value: maxStriche,
      gameId: maxStricheGameId,
      date: maxStricheDate ? getDateFromTimestamp(maxStricheDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    // Gruppenstatistiken berechnen
    for (const [groupId, groupData] of groupsMap.entries()) {
      const groupGamesCount = groupData.games.length;
      if (groupGamesCount === 0) continue;
      
      let groupGamesWon = 0;
      let groupTotalPoints = 0;
      
      groupData.games.forEach(game => {
        const playerTeam = getPlayerTeamInGame(playerId, game);
        if (!playerTeam) return;
        
        // Zähle gewonnene Spiele
        const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
        if (gameWinningTeam === playerTeam) {
          groupGamesWon++;
        }
        
        // Sammle Punkte
        const teamScores = playerTeam === 'top' ? game.finalScores?.top : game.finalScores?.bottom;
        if (teamScores) {
          groupTotalPoints += teamScores;
        }
      });
      
      // Füge Gruppenstatistik hinzu
      stats.groupStats.set(groupId, {
        groupName: groupData.groupName || `Gruppe ${groupId.substring(0, 4)}`,
        gamesPlayed: groupGamesCount,
        gamesWon: groupGamesWon,
        gameWinRate: groupGamesCount > 0 ? groupGamesWon / groupGamesCount : 0,
        avgPoints: groupGamesCount > 0 ? parseFloat((groupTotalPoints / groupGamesCount).toFixed(1)) : 0
      });
    }
    
    return stats;
    
  } catch (error) {
    console.error('[fetchPlayerStatistics] Fehler beim Abrufen der Spielerstatistiken:', error);
    return createEmptyPlayerStatistics();
  }
}; 