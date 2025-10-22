/**
 * 🎯 CHART DATA SERVICE - Backend-precomputed Chart Data
 * =====================================================
 * 
 * Dieser Service lädt vorberechnete Chart-Daten aus dem Backend.
 * Alle komplexen Zeitreihen-Berechnungen werden in Cloud Functions durchgeführt.
 * 
 * ✅ ARCHITEKTUR:
 * - Backend: Cloud Functions berechnen Chart-Daten bei Session/Tournament-End
 * - Frontend: Lädt nur noch die fertigen Daten
 * - Performance: Keine komplexen Frontend-Aggregationen mehr
 * - Konsistenz: Einheitliche Berechnungslogik im Backend
 */

import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// ===== TYPEN =====

export interface ChartData {
  playerId: string;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalChartData;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupChartData;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentChartData;
  };
  
  lastUpdated: Date;
}

export interface GlobalChartData {
  // ✅ ELO-RATING ZEITREIHE
  eloRating: ChartTimeSeries;
  
  // ✅ STRICHDIFFERENZ ZEITREIHE
  stricheDiff: ChartTimeSeries;
  
  // ✅ PUNKTDIFFERENZ ZEITREIHE
  pointsDiff: ChartTimeSeries;
  
  // ✅ WEIS-PUNKTE ZEITREIHE
  weisPoints: ChartTimeSeries;
  
  // ✅ MATSCH-EVENTS ZEITREIHE
  matschEvents: ChartTimeSeries;
  
  // ✅ SCHNEIDER-EVENTS ZEITREIHE
  schneiderEvents: ChartTimeSeries;
  
  // ✅ KONTERMATSCH-EVENTS ZEITREIHE
  kontermatschEvents: ChartTimeSeries;
}

export interface GroupChartData {
  groupId: string;
  groupName: string;
  eloRating: ChartTimeSeries;
  stricheDiff: ChartTimeSeries;
  pointsDiff: ChartTimeSeries;
  weisPoints: ChartTimeSeries;
  matschEvents: ChartTimeSeries;
  schneiderEvents: ChartTimeSeries;
  kontermatschEvents: ChartTimeSeries;
}

export interface TournamentChartData {
  tournamentId: string;
  tournamentName: string;
  eloRating: ChartTimeSeries;
  stricheDiff: ChartTimeSeries;
  pointsDiff: ChartTimeSeries;
  weisPoints: ChartTimeSeries;
  matschEvents: ChartTimeSeries;
  schneiderEvents: ChartTimeSeries;
  kontermatschEvents: ChartTimeSeries;
}

export interface ChartTimeSeries {
  labels: string[];
  datasets: ChartDataset[];
  metadata: {
    totalDataPoints: number;
    firstDataPoint: Date | null;
    lastDataPoint: Date | null;
    minValue: number | null;
    maxValue: number | null;
    avgValue: number | null;
  };
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  tierEmojis?: (string | null)[]; // Für Elo-Rating
  deltas?: (number | null)[]; // Für Delta-Anzeige
}

export interface ChartDataHistoryEntry {
  timestamp: Date;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: GlobalChartData;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: GroupChartData;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: TournamentChartData;
  };
  
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc';
}

// ===== FUNKTIONEN =====

/**
 * Lädt aktuelle Chart-Daten für einen Spieler
 */
export async function loadPlayerChartData(playerId: string): Promise<ChartData | null> {
  try {
    const chartDoc = await getDoc(doc(db, 'players', playerId, 'currentChartData', 'latest'));
    
    if (chartDoc.exists()) {
      const data = chartDoc.data();
      const chartData: ChartData = {
        playerId,
        global: data.global || getDefaultGlobalChartData(),
        groups: data.groups || {},
        tournaments: data.tournaments || {},
        lastUpdated: data.lastUpdated?.toDate() || new Date()
      };
      return chartData;
    } else {
      // Fallback: Leere Chart-Daten
      return {
        playerId,
        global: getDefaultGlobalChartData(),
        groups: {},
        tournaments: {},
        lastUpdated: new Date()
      };
    }
  } catch (error) {
    console.warn(`Fehler beim Laden der Chart-Daten für Spieler ${playerId}:`, error);
    return null;
  }
}

/**
 * Lädt Chart-Daten für eine bestimmte Metrik
 */
export async function getPlayerChartTimeSeries(
  playerId: string,
  metric: 'eloRating' | 'stricheDiff' | 'pointsDiff' | 'weisPoints' | 'matschEvents' | 'schneiderEvents' | 'kontermatschEvents',
  limitCount: number = 100,
  profileTheme: string = 'blue'
): Promise<{
  labels: string[];
  datasets: ChartDataset[];
}> {
  try {
    const chartData = await loadPlayerChartData(playerId);
    if (!chartData) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    const timeSeries = chartData.global[metric];
    
    // Limitiere die Datenpunkte
    const limitedLabels = timeSeries.labels.slice(-limitCount);
    const limitedDatasets = timeSeries.datasets.map(dataset => ({
      ...dataset,
      data: dataset.data.slice(-limitCount),
      tierEmojis: dataset.tierEmojis?.slice(-limitCount),
      deltas: dataset.deltas?.slice(-limitCount)
    }));
    
    return {
      labels: limitedLabels,
      datasets: limitedDatasets
    };
  } catch (error) {
    console.warn(`Fehler beim Laden der Zeitreihen für ${metric}:`, error);
    return {
      labels: [],
      datasets: []
    };
  }
}

/**
 * Lädt Chart-Daten für eine bestimmte Gruppe
 */
export async function getGroupChartTimeSeries(
  playerId: string,
  groupId: string,
  metric: 'eloRating' | 'stricheDiff' | 'pointsDiff' | 'weisPoints' | 'matschEvents' | 'schneiderEvents' | 'kontermatschEvents',
  limitCount: number = 100,
  profileTheme: string = 'blue'
): Promise<{
  labels: string[];
  datasets: ChartDataset[];
}> {
  try {
    const chartData = await loadPlayerChartData(playerId);
    if (!chartData || !chartData.groups[groupId]) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    const timeSeries = chartData.groups[groupId][metric];
    
    // Limitiere die Datenpunkte
    const limitedLabels = timeSeries.labels.slice(-limitCount);
    const limitedDatasets = timeSeries.datasets.map(dataset => ({
      ...dataset,
      data: dataset.data.slice(-limitCount),
      tierEmojis: dataset.tierEmojis?.slice(-limitCount),
      deltas: dataset.deltas?.slice(-limitCount)
    }));
    
    return {
      labels: limitedLabels,
      datasets: limitedDatasets
    };
  } catch (error) {
    console.warn(`Fehler beim Laden der Gruppen-Zeitreihen für ${metric}:`, error);
    return {
      labels: [],
      datasets: []
    };
  }
}

/**
 * Lädt Chart-Daten für ein bestimmtes Turnier
 */
export async function getTournamentChartTimeSeries(
  playerId: string,
  tournamentId: string,
  metric: 'eloRating' | 'stricheDiff' | 'pointsDiff' | 'weisPoints' | 'matschEvents' | 'schneiderEvents' | 'kontermatschEvents',
  limitCount: number = 100,
  profileTheme: string = 'blue'
): Promise<{
  labels: string[];
  datasets: ChartDataset[];
}> {
  try {
    const chartData = await loadPlayerChartData(playerId);
    if (!chartData || !chartData.tournaments[tournamentId]) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    const timeSeries = chartData.tournaments[tournamentId][metric];
    
    // Limitiere die Datenpunkte
    const limitedLabels = timeSeries.labels.slice(-limitCount);
    const limitedDatasets = timeSeries.datasets.map(dataset => ({
      ...dataset,
      data: dataset.data.slice(-limitCount),
      tierEmojis: dataset.tierEmojis?.slice(-limitCount),
      deltas: dataset.deltas?.slice(-limitCount)
    }));
    
    return {
      labels: limitedLabels,
      datasets: limitedDatasets
    };
  } catch (error) {
    console.warn(`Fehler beim Laden der Turnier-Zeitreihen für ${metric}:`, error);
    return {
      labels: [],
      datasets: []
    };
  }
}

// ===== HILFSFUNKTIONEN =====

function getDefaultGlobalChartData(): GlobalChartData {
  return {
    eloRating: getDefaultChartTimeSeries('Elo-Rating'),
    stricheDiff: getDefaultChartTimeSeries('Strichdifferenz'),
    pointsDiff: getDefaultChartTimeSeries('Punktdifferenz'),
    weisPoints: getDefaultChartTimeSeries('Weis-Punkte'),
    matschEvents: getDefaultChartTimeSeries('Matsch-Events'),
    schneiderEvents: getDefaultChartTimeSeries('Schneider-Events'),
    kontermatschEvents: getDefaultChartTimeSeries('Kontermatsch-Events')
  };
}

function getDefaultChartTimeSeries(label: string): ChartTimeSeries {
  return {
    labels: [],
    datasets: [{
      label,
      data: [],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)'
    }],
    metadata: {
      totalDataPoints: 0,
      firstDataPoint: null,
      lastDataPoint: null,
      minValue: null,
      maxValue: null,
      avgValue: null
    }
  };
}