import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { FrontendPlayerComputedStats, FrontendStatHighlight, FrontendStatStreak, FrontendTournamentPlacement } from '../types/computedStats';

// Dieses Interface definiert die Zielstruktur, die von den Profilseiten erwartet wird.
// Es basiert auf der Kombination von PlayerStatistics (alt) und den Erweiterungen aus ExtendedPlayerStatistics (alt).
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
  avgSchneiderPerGame?: number; // Aus altem ExtendedPlayerStatistics
  
  totalTournaments?: number; // Aus altem ExtendedPlayerStatistics
  tournamentWins?: number; // Aus altem ExtendedPlayerStatistics
  avgRoundTime?: string; // Aus altem ExtendedPlayerStatistics
  totalStrichesDifference?: number; // Aus altem ExtendedPlayerStatistics
  totalPointsDifference?: number; // Aus altem ExtendedPlayerStatistics

  // Highlights und Lowlights - Struktur angepasst für relatedId/relatedType und | null
  highestPointsGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  highestWeisPointsGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  highestStricheGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  mostMatchGames?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  longestWinStreakGames?: { value: number; date: string | null } | null;
  longestUnbeatenStreakGames?: { value: number; date: string | null } | null; // UI erwartet date, nicht dateRange

  highestStricheSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  longestWinStreakSessions?: { value: number; date: string | null } | null;
  longestUnbeatenStreakSessions?: { value: number; dateRange: string | null } | null;
  mostMatchSessions?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  
  lowestStricheSession?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  longestLossStreakSessions?: { value: number; date: string | null } | null;
  longestWinlessStreakSessions?: { value: number; dateRange: string | null } | null;
  mostMatchReceivedSessions?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  mostWeisPointsReceivedSessions?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  
  lowestStricheGame?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  longestLossStreakGames?: { value: number; date: string | null } | null;
  longestWinlessStreakGames?: { value: number; date: string | null } | null; // UI erwartet date
  mostMatchReceivedGames?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;
  mostWeisPointsReceivedGames?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;

  // Dieses Feld ist nicht direkt im Backend-Modell, aber UI erwartet es (ggf. aus altem highestWeisPoints)
  highestWeisPoints?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament'} | null;
  // Dieses Feld ist nicht direkt im Backend-Modell, aber UI erwartet es (ggf. aus altem highestStriche)
  highestStriche?: { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null;

  // Für die dynamische Liste, falls wir sie implementieren
  dynamicHighlights?: Array<{ label: string; value: string | number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' }>;
}

const formatDate = (date: Date | null, dateFormat: string = 'dd.MM.yyyy'): string | null => {
  return date ? format(date, dateFormat, { locale: de }) : null;
};

const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0s'; // Korrigiert für 0 oder negative Werte
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const getHighlightValueForDisplay = (
  highlight: FrontendStatHighlight | null
): { value: number; date: string | null; relatedId?: string; relatedType?: 'game' | 'session' | 'tournament' } | null => {
  if (!highlight) return null;
  const val = typeof highlight.value === 'string' ? parseFloat(highlight.value) : highlight.value;
  let relatedType: 'game' | 'session' | 'tournament' | undefined = undefined;
  if (highlight.relatedId) {
    // Verbesserte Typerkennung basierend auf Konventionen im highlight.type oder label
    const typeLowerCase = highlight.type.toLowerCase();
    const labelLowerCase = highlight.label.toLowerCase();

    if (typeLowerCase.includes('game') || labelLowerCase.includes('spiel')) relatedType = 'game';
    else if (typeLowerCase.includes('session') || labelLowerCase.includes('partie')) relatedType = 'session';
    else if (typeLowerCase.includes('tournament') || labelLowerCase.includes('turnier')) relatedType = 'tournament';
  }
  return { value: val, date: formatDate(highlight.date), relatedId: highlight.relatedId, relatedType };
};

const getStreakValueForDisplay = (
  streak: FrontendStatStreak | null, 
  formatType: 'end_date' | 'date_range' = 'end_date'
): { value: number; date: string | null } | { value: number; dateRange: string | null } | null => {
  if (!streak || streak.value === 0) return null;
  if (formatType === 'date_range') {
    const startDateStr = formatDate(streak.startDate);
    const endDateStr = formatDate(streak.endDate);
    if (startDateStr && endDateStr && startDateStr !== endDateStr) {
      return { value: streak.value, dateRange: `${startDateStr} - ${endDateStr}` };
    }
    return { value: streak.value, dateRange: endDateStr }; // Fallback auf endDate
  }
  return { value: streak.value, date: formatDate(streak.endDate) };
};

export const transformComputedStatsToExtended = (
  rawStats: FrontendPlayerComputedStats | null,
  currentGroupCount: number = 0 
): TransformedPlayerStats | null => {
  if (!rawStats) return null;

  const transformed: TransformedPlayerStats = {
    totalSessions: rawStats.totalSessions || 0,
    totalGames: rawStats.totalGames || 0,
    totalPlayTime: formatTime(rawStats.totalPlayTimeSeconds || 0),
    firstJassDate: formatDate(rawStats.firstJassTimestamp),
    lastJassDate: formatDate(rawStats.lastJassTimestamp),
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
    totalStrichesDifference: rawStats.totalStricheMade - rawStats.totalStricheReceived, // Korrigierte Berechnung
    totalPointsDifference: rawStats.totalPointsMade - rawStats.totalPointsReceived, // Korrigierte Berechnung
    avgRoundTime: rawStats.totalGames > 0 ? formatTime(Math.round((rawStats.totalPlayTimeSeconds || 0) / rawStats.totalGames)) : '0s',

    // Highlights und Lowlights spezifisch mappen:
    highestPointsGame: getHighlightValueForDisplay(rawStats.highestPointsGame),
    highestWeisPointsGame: getHighlightValueForDisplay(rawStats.mostWeisPointsGame), 
    highestStricheGame: getHighlightValueForDisplay(rawStats.highestStricheGame),
    mostMatchGames: getHighlightValueForDisplay(rawStats.mostMatschGame),
    longestWinStreakGames: getStreakValueForDisplay(rawStats.longestWinStreakGames, 'end_date') as { value: number; date: string | null } | null,
    longestUnbeatenStreakGames: getStreakValueForDisplay(rawStats.longestWinlessStreakGames, 'end_date') as { value: number; date: string | null } | null, // UI erwartet `date` für unbeatean streaks game

    highestStricheSession: getHighlightValueForDisplay(rawStats.highestStricheSession),
    longestWinStreakSessions: getStreakValueForDisplay(rawStats.longestWinStreakSessions, 'end_date') as { value: number; date: string | null } | null,
    longestUnbeatenStreakSessions: getStreakValueForDisplay(rawStats.longestWinlessStreakSessions, 'date_range') as { value: number; dateRange: string | null } | null,
    mostMatchSessions: getHighlightValueForDisplay(rawStats.highlights.find(h => h.type === 'most_matsch_made_session') || null), 
    
    lowestStricheSession: getHighlightValueForDisplay(rawStats.highestStricheReceivedSession),
    longestLossStreakSessions: getStreakValueForDisplay(rawStats.longestLossStreakSessions, 'end_date') as { value: number; date: string | null } | null,
    longestWinlessStreakSessions: getStreakValueForDisplay(rawStats.longestWinlessStreakSessions, 'date_range') as { value: number; dateRange: string | null } | null,
    mostMatchReceivedSessions: getHighlightValueForDisplay(rawStats.highlights.find(h => h.type === 'most_matsch_received_session') || null),
    mostWeisPointsReceivedSessions: getHighlightValueForDisplay(rawStats.highlights.find(h => h.type === 'most_weis_points_received_session') || null), 
    
    lowestStricheGame: getHighlightValueForDisplay(rawStats.highestStricheReceivedGame),
    longestLossStreakGames: getStreakValueForDisplay(rawStats.longestLossStreakGames, 'end_date') as { value: number; date: string | null } | null,
    longestWinlessStreakGames: getStreakValueForDisplay(rawStats.longestWinlessStreakGames, 'end_date') as { value: number; date: string | null } | null, // UI erwartet `date`
    mostMatchReceivedGames: getHighlightValueForDisplay(rawStats.mostMatschReceivedGame),
    mostWeisPointsReceivedGames: getHighlightValueForDisplay(rawStats.mostKontermatschReceivedGame), // Beispiel: Mapping auf mostKontermatschReceivedGame, da es im UI so aussieht

    // Die Felder `highestWeisPoints` und `highestStriche` sind generischer und könnten aus dem `highlights` Array kommen oder spezifischen Feldern.
    // Annahme: Wir mappen sie auf die Spiel-Highlights, falls vorhanden.
    highestWeisPoints: getHighlightValueForDisplay(rawStats.mostWeisPointsGame),
    highestStriche: getHighlightValueForDisplay(rawStats.highestStricheGame),

    dynamicHighlights: rawStats.highlights.map(h => {
      let relatedType: 'game' | 'session' | 'tournament' | undefined = undefined;
      if (h.relatedId) {
        const typeLowerCase = h.type.toLowerCase();
        const labelLowerCase = h.label.toLowerCase();
        if (typeLowerCase.includes('game') || labelLowerCase.includes('spiel')) relatedType = 'game';
        else if (typeLowerCase.includes('session') || labelLowerCase.includes('partie')) relatedType = 'session';
        else if (typeLowerCase.includes('tournament') || labelLowerCase.includes('turnier')) relatedType = 'tournament';
      }
      return {
        label: h.label,
        value: h.value,
        date: formatDate(h.date),
        relatedId: h.relatedId,
        relatedType: relatedType
      }
    })
  };

  return transformed;
}; 