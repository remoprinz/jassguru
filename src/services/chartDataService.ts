import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

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

    allPlayerIds.forEach(playerId => {
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
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
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

// 🎨 FARBPALETTE
function getRankingColor(rank: number, alpha: number = 1): string {
  const baseColors = [
    '#10b981', // Grün
    '#3b82f6', // Blau
    '#a855f7', // Lila
    '#f97316', // Orange
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#eab308', // Gelb
    '#14b8a6', // Teal
    '#ef4444', // Rot
    '#6366f1'  // Indigo
  ];
  
  const colorIndex = (rank - 1) % baseColors.length;
  const color = baseColors[colorIndex];
  
  if (alpha === 1) {
    return color;
  }
  
  // Convert hex to rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 10 Teams
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
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => p.displayName || p.playerId).join(' & ');
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
      
      // Extrahiere Teams aus eventCounts (top/bottom)
      const eventCounts = data.eventCounts || {};
      const teams = data.teams || {};
      
      ['top', 'bottom'].forEach(teamKey => {
        const teamPlayers = teams[teamKey]?.players || [];
        if (teamPlayers.length !== 2) return; // Nur 2er-Teams
        
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
    
    // 🔥 TOP 10 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 10);
    
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
 * 🚀 Lade Team-Strichdifferenz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 10 Teams
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
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => p.displayName || p.playerId).join(' & ');
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
      
      // Extrahiere Teams aus finalStriche (top/bottom)
      const finalStriche = data.finalStriche || {};
      const teams = data.teams || {};
      
      ['top', 'bottom'].forEach(teamKey => {
        const teamPlayers = teams[teamKey]?.players || [];
        if (teamPlayers.length !== 2) return; // Nur 2er-Teams
        
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
        const delta = teamTotal - opponentTotal; // ✅ KORRIGIERT: Gleiche Berechnung für alle Teams
        
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
    
    // 🔥 TOP 10 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 10);
    
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
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 10 Teams
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
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      return players.map(p => p.displayName || p.playerId).join(' & ');
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
      
      // Extrahiere Teams aus finalScores (top/bottom)
      const finalScores = data.finalScores || { top: 0, bottom: 0 };
      const teams = data.teams || {};
      
      ['top', 'bottom'].forEach(teamKey => {
        const teamPlayers = teams[teamKey]?.players || [];
        if (teamPlayers.length !== 2) return; // Nur 2er-Teams
        
        const teamId = getTeamId(teamPlayers);
        const teamName = getTeamName(teamPlayers);
        
        // Berechne Punktedifferenz für dieses Team
        const teamScore = finalScores[teamKey] || 0;
        const opponentScore = finalScores[teamKey === 'top' ? 'bottom' : 'top'] || 0;
        const delta = teamScore - opponentScore; // ✅ KORRIGIERT: Gleiche Berechnung für alle Teams
        
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
    
    // 🔥 TOP 10 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 10);
    
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