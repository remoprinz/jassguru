import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { FrontendPlayerComputedStats, FrontendStatHighlight, FrontendStatStreak, FrontendTournamentPlacement } from '../types/computedStats';

// Dieses Interface definiert die Zielstruktur, die von den Profilseiten erwartet wird.
// Namen und Struktur sind an die Verwendung in src/pages/profile/index.tsx angepasst.
export interface TransformedPlayerStats {
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
  avgSchneiderPerGame?: number;
  
  totalTournaments?: number;
  tournamentWins?: number;
  avgRoundTime?: string;
  totalStrichesDifference?: number;
  totalPointsDifference?: number;

  // Highlights Partien - relatedType spezifisch für Session
  highestStricheSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  longestWinStreakSessions?: { value: number; date: string | null; dateRange?: string | null } | null;
  longestUndefeatedStreakSessions?: { value: number; date: string | null; dateRange?: string | null } | null;
  mostMatschSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  mostWeisPointsSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  
  // Highlights Spiele - relatedType spezifisch für Game
  highestStricheGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;
  longestWinStreakGames?: { value: number; date: string | null; dateRange?: string | null } | null;
  longestUndefeatedStreakGames?: { value: number; date: string | null; dateRange?: string | null } | null;
  mostMatschGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;
  mostWeisPointsGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;

  // Lowlights (Beispiele) - relatedType spezifisch
  highestStricheReceivedSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  highestStricheReceivedGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;
  
  // Lowlights (Beispiele) - relatedType spezifisch
  longestLossStreakSessions?: { value: number; date: string | null; dateRange?: string | null } | null;
  longestWinlessStreakSessions?: { value: number; date: string | null; dateRange?: string | null } | null;
  mostMatschReceivedSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  mostWeisPointsReceivedSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'session' } | null;
  
  longestLossStreakGames?: { value: number; date: string | null; dateRange?: string | null } | null;
  longestWinlessStreakGames?: { value: number; date: string | null; dateRange?: string | null } | null;
  mostMatschReceivedGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;
  mostWeisPointsReceivedGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' } | null;
  
  // dynamicHighlights erwartet jetzt date als Date | null für NotableEventItem Kompatibilität
  dynamicHighlights?: Array<Omit<FrontendStatHighlight, 'date'> & { date: Date | null }>; 
}

const formatDateSafely = (timestampInput: any): string | null => {
  if (!timestampInput) return null;
  try {
    const date = timestampInput.toDate ? timestampInput.toDate() : 
                 (timestampInput.seconds ? new Date(timestampInput.seconds * 1000) : 
                 (timestampInput instanceof Date ? timestampInput : null));
    if (date && !isNaN(date.getTime())) {
      return format(date, 'dd.MM.yyyy', { locale: de });
    }
    return null;
  } catch (e) {
    // console.error("Error formatting date:", timestampInput, e);
    return null;
  }
};

const getRawDate = (timestampInput: any): Date | null => {
  if (!timestampInput) return null;
  try {
    const date = timestampInput.toDate ? timestampInput.toDate() : 
                 (timestampInput.seconds ? new Date(timestampInput.seconds * 1000) : 
                 (timestampInput instanceof Date ? timestampInput : null));
    if (date && !isNaN(date.getTime())) {
      return date;
    }
    return null;
  } catch (e) {
    // console.error("Error formatting date:", timestampInput, e);
    return null;
  }
};

const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Angepasste interne Transformationsfunktion für Highlights
const transformHighlightInternal = (
  highlight: any, 
  defaultRelatedType?: 'game' | 'session' | 'tournament',
  preserveDateObject: boolean = false // Neuer Parameter
): { value: number; date: string | Date | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null => {
  if (!highlight || highlight.value === null || highlight.value === undefined) return null;
  const val = typeof highlight.value === 'string' ? parseFloat(highlight.value) : highlight.value;
  
  let relatedTypeCalculated: 'game' | 'session' | 'tournament' | undefined = defaultRelatedType;
  if (highlight.relatedId && highlight.type && !defaultRelatedType) { 
    const typeLowerCase = String(highlight.type).toLowerCase();
    if (typeLowerCase.includes('game')) relatedTypeCalculated = 'game';
    else if (typeLowerCase.includes('session')) relatedTypeCalculated = 'session';
    else if (typeLowerCase.includes('tournament')) relatedTypeCalculated = 'tournament';
  }

  return { 
    value: val, 
    date: preserveDateObject ? getRawDate(highlight.date) : formatDateSafely(highlight.date), 
    relatedId: highlight.relatedId,
    relatedType: relatedTypeCalculated 
  };
};

// Interne Transformationsfunktion für Streaks
const transformStreakInternal = (
  streak: any // Nimmt 'any' wegen potenziell veraltetem FrontendStatStreak Typ
): { value: number; date: string | null; // End-Datum formatiert
         startDate: string | null; // Start-Datum formatiert
         endDate: string | null; // End-Datum formatiert (redundant zu date, aber explizit)
         dateRange?: string | null // Kombinierter Datumsbereich
} | null => {
  if (!streak || streak.value === null || streak.value === undefined || streak.value === 0) return null;
  
  const startDateStr = formatDateSafely(streak.startDate);
  const endDateStr = formatDateSafely(streak.endDate);
  let dateRangeStr: string | null = endDateStr;

  if (startDateStr && endDateStr && startDateStr !== endDateStr) {
    dateRangeStr = `${startDateStr} - ${endDateStr}`;
  }
  
  return { 
    value: streak.value, 
    date: endDateStr, 
    startDate: startDateStr, 
    endDate: endDateStr,
    dateRange: dateRangeStr
  };
};

export const transformComputedStatsToExtended = (
  rawStatsInput: FrontendPlayerComputedStats | null, 
  currentGroupCount: number = 0 
): TransformedPlayerStats | null => {
  if (!rawStatsInput) return null;

  // WICHTIG: Type Assertion zu 'any', um auf Felder zuzugreifen, die in FrontendPlayerComputedStats
  // (aus src/types/computedStats.ts) möglicherweise noch nicht (korrekt) deklariert sind.
  // Der BENUTZER MUSS src/types/computedStats.ts aktualisieren, um FrontendPlayerComputedStats
  // mit den Backend-Feldern (aus functions/src/models/player-stats.model.ts) zu synchronisieren.
  const rawStats = rawStatsInput as any; 

  const transformed: TransformedPlayerStats = {
    totalSessions: rawStats.totalSessions || 0,
    totalGames: rawStats.totalGames || 0,
    totalPlayTime: formatTime(rawStats.totalPlayTimeSeconds || 0),
    firstJassDate: formatDateSafely(rawStats.firstJassTimestamp),
    lastJassDate: formatDateSafely(rawStats.lastJassTimestamp),
    groupCount: currentGroupCount,
    sessionsWon: rawStats.sessionWins || 0,
    sessionsTied: rawStats.sessionTies || 0,
    sessionsLost: rawStats.sessionLosses || 0,
    gamesWon: rawStats.gameWins || 0,
    gamesLost: rawStats.gameLosses || 0,
    sessionWinRate: rawStats.totalSessions > 0 ? (rawStats.sessionWins || 0) / rawStats.totalSessions : 0,
    gameWinRate: rawStats.totalGames > 0 ? (rawStats.gameWins || 0) / rawStats.totalGames : 0,
    avgPointsPerGame: rawStats.avgPointsPerGame || 0,
    avgStrichePerGame: rawStats.avgStrichePerGame || 0,
    avgWeisPointsPerGame: rawStats.avgWeisPointsPerGame || 0,
    avgMatschPerGame: rawStats.avgMatschPerGame || 0,
    avgSchneiderPerGame: rawStats.avgSchneiderPerGame || 0,
    totalTournaments: rawStats.totalTournamentsParticipated || 0,
    tournamentWins: rawStats.tournamentWins || 0,
    totalStrichesDifference: rawStats.totalStricheDifference,
    totalPointsDifference: rawStats.totalPointsDifference,
    avgRoundTime: rawStats.totalGames > 0 && rawStats.totalPlayTimeSeconds > 0 ? formatTime(Math.round(rawStats.totalPlayTimeSeconds / rawStats.totalGames)) : '0s',

    // Highlights Partien - Zugriff auf rawStats mit korrekten Backend-Feldnamen
    highestStricheSession: transformHighlightInternal(rawStats.highestStricheSession, 'session', false) as TransformedPlayerStats['highestStricheSession'],
    longestWinStreakSessions: transformStreakInternal(rawStats.longestWinStreakSessions),
    longestUndefeatedStreakSessions: transformStreakInternal(rawStats.longestUndefeatedStreakSessions),
    mostMatschSession: transformHighlightInternal(rawStats.mostMatschSession, 'session', false) as TransformedPlayerStats['mostMatschSession'],
    mostWeisPointsSession: transformHighlightInternal(rawStats.mostWeisPointsSession, 'session', false) as TransformedPlayerStats['mostWeisPointsSession'],
    
    // Highlights Spiele - Zugriff auf rawStats mit korrekten Backend-Feldnamen
    highestStricheGame: transformHighlightInternal(rawStats.highestStricheGame, 'game', false) as TransformedPlayerStats['highestStricheGame'],
    longestWinStreakGames: transformStreakInternal(rawStats.longestWinStreakGames),
    longestUndefeatedStreakGames: transformStreakInternal(rawStats.longestUndefeatedStreakGames),
    mostMatschGame: transformHighlightInternal(rawStats.mostMatschGame, 'game', false) as TransformedPlayerStats['mostMatschGame'],
    mostWeisPointsGame: transformHighlightInternal(rawStats.mostWeisPointsGame, 'game', false) as TransformedPlayerStats['mostWeisPointsGame'],

    // Lowlights (Beispiele)
    highestStricheReceivedSession: transformHighlightInternal(rawStats.highestStricheReceivedSession, 'session', false) as TransformedPlayerStats['highestStricheReceivedSession'],
    highestStricheReceivedGame: transformHighlightInternal(rawStats.highestStricheReceivedGame, 'game', false) as TransformedPlayerStats['highestStricheReceivedGame'],
    // -- TRANSFORMATION FÜR NEUE LOWLIGHTS --
    longestLossStreakSessions: transformStreakInternal(rawStats.longestLossStreakSessions),
    longestWinlessStreakSessions: transformStreakInternal(rawStats.longestWinlessStreakSessions),
    mostMatschReceivedSession: transformHighlightInternal(rawStats.mostMatschReceivedSession, 'session', false) as TransformedPlayerStats['mostMatschReceivedSession'],
    mostWeisPointsReceivedSession: transformHighlightInternal(rawStats.mostWeisPointsReceivedSession, 'session', false) as TransformedPlayerStats['mostWeisPointsReceivedSession'],

    longestLossStreakGames: transformStreakInternal(rawStats.longestLossStreakGames),
    longestWinlessStreakGames: transformStreakInternal(rawStats.longestWinlessStreakGames),
    mostMatschReceivedGame: transformHighlightInternal(rawStats.mostMatschReceivedGame, 'game', false) as TransformedPlayerStats['mostMatschReceivedGame'],
    mostWeisPointsReceivedGame: transformHighlightInternal(rawStats.mostWeisPointsReceivedGame, 'game', false) as TransformedPlayerStats['mostWeisPointsReceivedGame'],
    // -- ENDE TRANSFORMATION FÜR NEUE LOWLIGHTS --

    dynamicHighlights: rawStats.highlights 
      ? rawStats.highlights.map((h: any) => transformHighlightInternal(h, undefined, true)!)
      : [],
  };
  
  return transformed;
}; 