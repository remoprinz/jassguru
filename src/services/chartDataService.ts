import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, FieldPath } from 'firebase/firestore';
import { getRankingColor } from '../config/chartColors';

/**
 * Helper: Lädt lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
 */
async function loadPlayerLastActivityForFilter(playerIds: Set<string>): Promise<Map<string, Date | null>> {
  const lastActivityMap = new Map<string, Date | null>();
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  
  if (playerIds.size === 0) {
    return lastActivityMap;
  }
  
  // Lade alle Player-Dokumente in Batches (Firestore 'in' Query Limit: 10)
  const playerIdsArray = Array.from(playerIds);
  const batchSize = 10;
  
  for (let i = 0; i < playerIdsArray.length; i += batchSize) {
    const batch = playerIdsArray.slice(i, i + batchSize);
    try {
      const playerDocs = await getDocs(
        query(
          collection(db, 'players'),
          where(new FieldPath('__name__'), 'in', batch)
        )
      );
      
      playerDocs.forEach(doc => {
        const data = doc.data();
        const globalStats = data?.globalStats || {};
        const lastJassTimestamp = globalStats?.lastJassTimestamp;
        if (lastJassTimestamp) {
          const timestamp = lastJassTimestamp.toDate ? lastJassTimestamp.toDate() : 
                           (lastJassTimestamp._seconds ? new Date(lastJassTimestamp._seconds * 1000) : null);
          lastActivityMap.set(doc.id, timestamp);
        } else {
          lastActivityMap.set(doc.id, null);
        }
      });
    } catch (error) {
      console.warn('[loadPlayerLastActivityForFilter] Error loading batch:', error);
      // Setze null für Spieler, die nicht geladen werden konnten
      batch.forEach(playerId => {
        if (!lastActivityMap.has(playerId)) {
          lastActivityMap.set(playerId, null);
        }
      });
    }
  }
  
  return lastActivityMap;
}

/**
 * Helper: Prüft, ob ein Spieler aktiv ist (<1 Jahr inaktiv)
 */
function isPlayerActive(playerId: string, lastActivityMap: Map<string, Date | null>): boolean {
  const lastActivity = lastActivityMap.get(playerId);
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  
  // Wenn kein lastJassTimestamp vorhanden ist, behalte den Spieler (für Rückwärtskompatibilität)
  if (!lastActivity) {
    return true;
  }
  
  return lastActivity.getTime() >= oneYearAgo;
}

/**
 * 🎯 CHART DATA SERVICE - AGGREGATED ARCHITEKTUR
 * ============================================== 
 * 
 * Liest Chart-Daten direkt aus groups/{groupId}/aggregated/chartData_*
 * 
 * Vorteile:
 * - Semantisch korrekt: GroupView → groups/{groupId}/aggregated
 * - Performance: Alle Chart-Daten in separatem Ordner
 * - Sauber: jassGameSummaries nicht mit Chart-Daten überladen
 * - Einfach: chartData_elo, chartData_striche, chartData_points sind fertige Chart-Daten
 */

// ✅ Chart-Typen
export type ChartType = 'rating' | 'striche' | 'points';

/**
 * 🚀 Lade Elo-Rating-Chart aus jassGameSummaries (BEREITS KORREKT!)
 * 
 * ELO-Chart wird NICHT aus aggregated geladen, sondern berechnet aus:
 * - jassGameSummaries → playerFinalRatings
 * - ratingHistory (global, nicht gruppenspezifisch!)
 */
export async function getOptimizedRatingChart(
  groupId: string,
  options?: {
    minDataPoints?: number;
    customColors?: boolean;
    sortByRating?: boolean;
  }
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 📊 Lade alle completed jassGameSummaries für diese Gruppe
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // NEU: Sessions sequenziell aufbauen – keine Tages-Bündelung
    type SessionPoint = { label: string; timestamp: Date; players: Record<string, { rating: number; displayName?: string }> };
    const sessionPoints: SessionPoint[] = [];

    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      if (!data.playerFinalRatings) return;
      const completedAt = data.completedAt;
      if (!completedAt) return;
      let timestamp: Date;
      if (completedAt?.toDate && typeof completedAt.toDate === 'function') timestamp = completedAt.toDate();
      else if (completedAt?._seconds !== undefined) timestamp = new Date(completedAt._seconds * 1000);
      else return;
      const label = timestamp.toLocaleDateString('de-DE'); // Anzeige bleibt Datum – Sessions können gleiche Labels haben
      sessionPoints.push({ label, timestamp, players: data.playerFinalRatings });
    });

    // Chronologisch sortieren (stabil)
    sessionPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Labels 1:1 aus Sessions
    const sortedLabels = sessionPoints.map(p => p.label);

    // Erstelle Datasets für jeden Spieler
    const datasets: any[] = [];

    // Alle beteiligten Spieler sammeln
    const allPlayerIds = new Set<string>();
    sessionPoints.forEach(p => Object.keys(p.players || {}).forEach(pid => allPlayerIds.add(pid)));

    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = new Map<string, Date | null>();
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    
    if (allPlayerIds.size > 0) {
      // Lade Player-Dokumente in Batches (Firestore 'in' Query Limit: 10)
      const playerIdsArray = Array.from(allPlayerIds);
      const batchSize = 10;
      
      for (let i = 0; i < playerIdsArray.length; i += batchSize) {
        const batch = playerIdsArray.slice(i, i + batchSize);
        try {
          const { getDocs, query, where, collection, FieldPath } = await import('firebase/firestore');
          const playerDocs = await getDocs(
            query(
              collection(db, 'players'),
              where(new FieldPath('__name__'), 'in', batch)
            )
          );
          
          playerDocs.forEach(doc => {
            const data = doc.data();
            const globalStats = data?.globalStats || {};
            const lastJassTimestamp = globalStats?.lastJassTimestamp;
            if (lastJassTimestamp) {
              const timestamp = lastJassTimestamp.toDate ? lastJassTimestamp.toDate() : 
                               (lastJassTimestamp._seconds ? new Date(lastJassTimestamp._seconds * 1000) : null);
              playerLastActivityMap.set(doc.id, timestamp);
            } else {
              playerLastActivityMap.set(doc.id, null);
            }
          });
        } catch (error) {
          console.warn('[getOptimizedRatingChart] Error loading player last activity:', error);
          // Setze null für Spieler, die nicht geladen werden konnten
          batch.forEach(playerId => {
            if (!playerLastActivityMap.has(playerId)) {
              playerLastActivityMap.set(playerId, null);
            }
          });
        }
      }
    }

    allPlayerIds.forEach(playerId => {
      // 🎯 NEU: Filtere Spieler, die >1 Jahr inaktiv sind
      const lastActivity = playerLastActivityMap.get(playerId);
      if (lastActivity && lastActivity.getTime() < oneYearAgo) {
        return; // Überspringe inaktive Spieler
      }
      const displayName = (() => {
        for (const p of sessionPoints) {
          const r = p.players?.[playerId];
          if (r && (r as any).displayName) return (r as any).displayName as string;
        }
        return playerId;
      })();

      const data: (number | null)[] = sessionPoints.map(p => {
        const r = p.players?.[playerId];
        return r ? (r as any).rating || 0 : null;
      });
      
      // ✅ NEU: Lade auch ratingDelta pro Datenpunkt für korrekte Tooltips
      const deltas: (number | null)[] = sessionPoints.map(p => {
        const r = p.players?.[playerId];
        return r ? (r as any).ratingDelta || 0 : null;
      });

      const validPoints = data.filter(v => v !== null && v !== undefined && !isNaN(v as any));
      if (validPoints.length < (options?.minDataPoints || 2)) return;

      datasets.push({
        label: displayName,
        data,
        deltas, // ✅ NEU: ratingDelta pro Session für Tooltips
        playerId,
        borderColor: '#000000',
        backgroundColor: '#000000',
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        spanGaps: true, // ✅ ELO: Verbinde Lücken (kontinuierliche Rating-History)
      });
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    datasets.sort((a, b) => {
      const getLastValidValue = (dataset: any) => {
        for (let i = dataset.data.length - 1; i >= 0; i--) {
          const value = dataset.data[i];
          if (value !== null && value !== undefined && !isNaN(value)) {
            return value;
          }
        }
        return 0;
      };
      
      const aValue = getLastValidValue(a);
      const bValue = getLastValidValue(b);
      
      return bValue - aValue; // Absteigend
    });
    
    // ✅ Farbzuweisung passiert im Frontend (PowerRatingChart.tsx)
    
    return {
      labels: sortedLabels,
      datasets: datasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedRatingChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🚀 Lade Strichdifferenz-Chart aus aggregated/chartData_striche
 */
export async function getOptimizedStricheChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 📊 Lade chartData_striche aus aggregated
    const stricheDocRef = doc(db, `groups/${groupId}/aggregated/chartData_striche`);
    const stricheDoc = await getDoc(stricheDocRef);
    
    if (!stricheDoc.exists()) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    const chartData = stricheDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    // ✅ Chart-Daten sind bereits fertig formatiert
    // Einfach zurückgeben mit spanGaps: true für verbundene Linien
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true, // ✅ STRICHE: Verbinde ALLE Datenpunkte
    }));
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels: sortedLabels,
      datasets: enhancedDatasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedStricheChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🚀 Lade Punktedifferenz-Chart aus aggregated/chartData_points
 */
export async function getOptimizedPointsChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 📊 Lade chartData_points aus aggregated
    const pointsDocRef = doc(db, `groups/${groupId}/aggregated/chartData_points`);
    const pointsDoc = await getDoc(pointsDocRef);
    
    if (!pointsDoc.exists()) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    const chartData = pointsDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    // ✅ Chart-Daten sind bereits fertig formatiert
    // Einfach zurückgeben mit spanGaps: true für verbundene Linien
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true, // ✅ PUNKTE: Verbinde ALLE Datenpunkte
    }));
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels: sortedLabels,
      datasets: enhancedDatasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedPointsChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

// 🎨 FARBPALETTE wird jetzt aus chartColors.ts importiert

/**
 * 🚀 Lade Matsch-Bilanz-Chart aus aggregated/chartData_matsch
 */
export async function getOptimizedMatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const matschDocRef = doc(db, `groups/${groupId}/aggregated/chartData_matsch`);
    const matschDoc = await getDoc(matschDocRef);
    
    if (!matschDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = matschDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedMatschChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * 🚀 Lade Schneider-Bilanz-Chart aus aggregated/chartData_schneider
 */
export async function getOptimizedSchneiderChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const schneiderDocRef = doc(db, `groups/${groupId}/aggregated/chartData_schneider`);
    const schneiderDoc = await getDoc(schneiderDocRef);
    
    if (!schneiderDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = schneiderDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedSchneiderChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * 🚀 Lade Kontermatsch-Bilanz-Chart aus aggregated/chartData_kontermatsch
 */
export async function getOptimizedKontermatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const kontermatschDocRef = doc(db, `groups/${groupId}/aggregated/chartData_kontermatsch`);
    const kontermatschDoc = await getDoc(kontermatschDocRef);
    
    if (!kontermatschDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = kontermatschDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedKontermatschChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * Getzt Backfill Status (für zukünftige Implementierung)
 */
export async function getBackfillStatus(groupId: string): Promise<{
  isBackfilled: boolean;
  lastUpdated?: Date;
}> {
  try {
    const eloDocRef = doc(db, `groups/${groupId}/aggregated/chartData_elo`);
    const eloDoc = await getDoc(eloDocRef);
    
    if (!eloDoc.exists()) {
      return {
        isBackfilled: false,
        lastUpdated: undefined
      };
    }
    
    const chartData = eloDoc.data();
    return {
      isBackfilled: true,
      lastUpdated: chartData.lastUpdated?.toDate?.() || new Date()
    };
  } catch (error) {
    console.error('[getBackfillStatus] Fehler:', error);
    return {
      isBackfilled: false
    };
  }
}

/**
 * 🚀 Lade Team-Matsch-Bilanz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamMatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamMatschChart] Could not load player names:', error);
    }
    
    // 📊 Lade alle completed Sessions
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0);
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0) ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameEventCounts = game.eventCounts || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Matsch-Bilanz für dieses Game
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentTeamEvents = gameEventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamMade = teamEvents.matsch || 0;
            const opponentMade = opponentTeamEvents.matsch || 0;
            const delta = teamMade - opponentMade;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const eventCounts = data.eventCounts || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Matsch-Bilanz für dieses Team
          const teamEvents = eventCounts[teamKey] || {};
          const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const teamMade = teamEvents.matsch || 0;
          const opponentMade = opponentTeamEvents.matsch || 0;
          const delta = teamMade - opponentMade;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamMatschChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * ✅ NEU: Berechnet Team Event-Counts (Made/Received) direkt aus jassGameSummaries
 * Gibt eine Map zurück: Team-Name -> { eventsMade, eventsReceived }
 */
export async function getTeamEventCounts(
  groupId: string
): Promise<Map<string, { eventsMade: number; eventsReceived: number }>> {
  const teamEventCountsMap = new Map<string, { eventsMade: number; eventsReceived: number }>();
  
  try {
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => p.displayName || p.playerId).join(' & ');
    };
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      const isTournament = data.isTournamentSession || sessionId === '6eNr8fnsTO06jgCqjelt';
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere Event-Counts pro Game
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameEventCounts = game.eventCounts || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Team-Level Event-Counts aus diesem Game
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentTeamEvents = gameEventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamMade = teamEvents.matsch || 0;
            const teamReceived = opponentTeamEvents.matsch || 0;
            
            // Aggregiere für dieses Team
            if (!teamEventCountsMap.has(teamName)) {
              teamEventCountsMap.set(teamName, { eventsMade: 0, eventsReceived: 0 });
            }
            const stats = teamEventCountsMap.get(teamName)!;
            stats.eventsMade += teamMade;
            stats.eventsReceived += teamReceived;
          });
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level Event-Counts
        const eventCounts = data.eventCounts || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return;
          
          const teamName = getTeamName(teamPlayers);
          
          // Team-Level Event-Counts aus dieser Session
          const teamEvents = eventCounts[teamKey] || {};
          const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const teamMade = teamEvents.matsch || 0;
          const teamReceived = opponentTeamEvents.matsch || 0;
          
          // Aggregiere für dieses Team
          if (!teamEventCountsMap.has(teamName)) {
            teamEventCountsMap.set(teamName, { eventsMade: 0, eventsReceived: 0 });
          }
          const stats = teamEventCountsMap.get(teamName)!;
          stats.eventsMade += teamMade;
          stats.eventsReceived += teamReceived;
        });
      }
    });
  } catch (error) {
    console.error('[getTeamEventCounts] Fehler:', error);
  }
  
  return teamEventCountsMap;
}

/**
 * 🚀 Lade Team-Strichdifferenz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamStricheChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamStricheChart] Could not load player names:', error);
    }
    
    // 📊 Lade alle completed Sessions
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0);
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0) ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        const calculateTotalStriche = (striche: any) => {
          return (striche?.sieg || 0) + (striche?.berg || 0) + (striche?.matsch || 0) + (striche?.schneider || 0) + (striche?.kontermatsch || 0);
        };
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameFinalStriche = game.finalStriche || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Strichdifferenz für dieses Game
            const teamStriche = gameFinalStriche[teamKey] || {};
            const opponentTeamStriche = gameFinalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamTotal = calculateTotalStriche(teamStriche);
            const opponentTotal = calculateTotalStriche(opponentTeamStriche);
            const delta = teamTotal - opponentTotal;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const finalStriche = data.finalStriche || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Strichdifferenz für dieses Team
          const teamStriche = finalStriche[teamKey] || {};
          const opponentTeamStriche = finalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const calculateTotalStriche = (striche: any) => {
            return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
          };
          
          const teamTotal = calculateTotalStriche(teamStriche);
          const opponentTotal = calculateTotalStriche(opponentTeamStriche);
          const delta = teamTotal - opponentTotal;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamStricheChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🚀 Lade Team-Punktedifferenz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamPointsChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamPointsChart] Could not load player names:', error);
    }
    
    // 📊 Lade alle completed Sessions
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0);
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           (Array.isArray(data.gameResults) && data.gameResults.length > 0) ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameScores = { top: game.topScore || 0, bottom: game.bottomScore || 0 };
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Punktedifferenz für dieses Game
            const teamScore = gameScores[teamKey] || 0;
            const opponentScore = gameScores[teamKey === 'top' ? 'bottom' : 'top'] || 0;
            const delta = teamScore - opponentScore;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const finalScores = data.finalScores || { top: 0, bottom: 0 };
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Punktedifferenz für dieses Team
          const teamScore = finalScores[teamKey] || 0;
          const opponentScore = finalScores[teamKey === 'top' ? 'bottom' : 'top'] || 0;
          const delta = teamScore - opponentScore;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamPointsChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🎯 TRUMPF-VERTEILUNG zu Chart-Daten transformieren
 * Wandelt trumpfStatistik (groupStats) in PieChart-Format um
 */
export interface TrumpfDistributionData {
  labels: string[];
  values: number[];
  backgroundColor?: string[];
  pictogramPaths?: string[]; // ✅ NEU: Pfade zu Bild-Pictogrammen
  percentages?: number[]; // ✅ NEU: Prozentsätze (sortiert nach Häufigkeit)
}

export function getTrumpfDistributionChartData(
  trumpfStatistik: { [farbe: string]: number },
  totalTrumpfCount: number
): TrumpfDistributionData | null {
  if (!trumpfStatistik || totalTrumpfCount === 0) {
    return null;
  }

  // ✅ KORREKTUR: Duplikate zusammenfassen (eichel+eicheln, unde+une) - WIE IN GROUPVIEW!
  const consolidatedStats: Record<string, number> = {};
  
  Object.entries(trumpfStatistik).forEach(([farbe, anzahl]) => {
    const normalizedFarbe = farbe.toLowerCase();
    
    // Mapping für Duplikate
    let mappedFarbe = normalizedFarbe;
    if (normalizedFarbe === 'eicheln') {
      mappedFarbe = 'eichel';
    } else if (normalizedFarbe === 'une') {
      mappedFarbe = 'unde';
    }
    
    // Zusammenfassen
    consolidatedStats[mappedFarbe] = (consolidatedStats[mappedFarbe] || 0) + anzahl;
  });
  
  // ✅ Verwende konsolidierte Stats
  const trumpfStatistikConsolidated = consolidatedStats;

  // Pictogramm-Pfade für Trumpffarben (DE + FR)
  const trumpfPictogramMap: { [key: string]: string } = {
    // Deutsche Farben (PNG-Dateien)
    'eichel': '/assets/pictograms/standardDE/eichel.png',
    'eicheln': '/assets/pictograms/standardDE/eichel.png',
    'rosen': '/assets/pictograms/standardDE/rosen.png',
    'rose': '/assets/pictograms/standardDE/rosen.png',
    'schellen': '/assets/pictograms/standardDE/schellen.png',
    'schelle': '/assets/pictograms/standardDE/schellen.png',
    'schilten': '/assets/pictograms/standardDE/schilten.png',
    'schilte': '/assets/pictograms/standardDE/schilten.png',
    // Französische Farben (PNG-Dateien)
    'gras': '/assets/pictograms/standardFR/schaufel.png',
    'schaufel': '/assets/pictograms/standardFR/schaufel.png',
    'herz': '/assets/pictograms/standardFR/herz.png',
    'kreuz': '/assets/pictograms/standardFR/kreuz.png',
    'ecke': '/assets/pictograms/standardFR/ecke.png',
    // Spezielle Trumpf-Typen (SVG-Dateien)
    'unde': '/assets/pictograms/standardDE/unde.svg',
    'une': '/assets/pictograms/standardDE/unde.svg',
    'obe': '/assets/pictograms/standardDE/obe.svg',
    'quer': '/assets/pictograms/standardDE/quer.svg',
    'misère': '/assets/pictograms/standardDE/misere.svg',
    'misèrefr': '/assets/pictograms/standardFR/misereFR.svg',
    'slalom': '/assets/pictograms/standardDE/slalom.svg',
    '3x3': '/assets/pictograms/standardDE/3x3.svg'
  };
  
  // ✅ Verwende GLEICHE Farbreihenfolge wie Verlaufcharts (getRankingColor wird aus chartColors.ts importiert)
  
  // ✅ Farben zuordnen nach Rang (sortiert bereits nach Häufigkeit)

  // Sortiere nach Häufigkeit (höchste zuerst) - ✅ Verwende konsolidierte Stats!
  const sortedEntries = Object.entries(trumpfStatistikConsolidated)
    .map(([farbe, anzahl]) => ({
      farbe: farbe.toLowerCase(),
      anzahl,
      percentage: (anzahl / totalTrumpfCount) * 100
    }))
    .sort((a, b) => b.anzahl - a.anzahl);

  // Nur Farben mit Daten
  const filteredEntries = sortedEntries.filter(entry => entry.anzahl > 0);

  if (filteredEntries.length === 0) {
    return null;
  }

  return {
    labels: filteredEntries.map(entry => entry.farbe.charAt(0).toUpperCase() + entry.farbe.slice(1)),
    values: filteredEntries.map(entry => entry.anzahl),
    percentages: filteredEntries.map(entry => entry.percentage), // ✅ NEU: Bereits berechnete Prozentsätze
    // ✅ Farben basierend auf Rang (sortiert nach Häufigkeit)
    backgroundColor: filteredEntries.map((entry, idx) => 
      getRankingColor(idx + 1) // Rank 1, 2, 3, ... (Grün, Blau, Lila, ...)
    ),
    pictogramPaths: filteredEntries.map(entry => 
      trumpfPictogramMap[entry.farbe.toLowerCase()] || '' // ✅ NEU: Pictogramm-Pfade
    )
  };
}