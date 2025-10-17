import { db } from '../services/firebaseInit';
import { doc, getDoc } from 'firebase/firestore';

// 🎯 Chart-Daten-Interface (identisch zum Backend)
export interface ChartDataset {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
  playerId: string;
  displayName: string;
  tension: number;
  pointRadius: number;
  pointHoverRadius: number;
  spanGaps: boolean;
}

export interface ChartDataSnapshot {
  labels: string[];
  datasets: ChartDataset[];
  lastUpdated: any; // Firestore Timestamp
  totalPlayers: number;
  totalSessions: number;
}

/**
 * 🚀 HAUPTFUNKTION: Lade Pre-computed Chart Data für sofortige Performance
 * 
 * Diese Funktion lädt die vom Backend vorberechneten Chart-Daten
 * für sofortige Darstellung ohne Frontend-Berechnung.
 */
export async function getPrecomputedChartData(groupId: string): Promise<ChartDataSnapshot | null> {
  try {
    const chartDataRef = doc(db, `groups/${groupId}/aggregated/chartData`);
    const chartDataSnap = await getDoc(chartDataRef);
    
    if (!chartDataSnap.exists()) {
      console.warn(`[ChartData] No pre-computed chart data found for group ${groupId}`);
      return null;
    }
    
    const chartData = chartDataSnap.data() as ChartDataSnapshot;
    
    console.log(`[ChartData] Loaded pre-computed chart data for group ${groupId}:`, {
      players: chartData.totalPlayers,
      sessions: chartData.totalSessions,
      dataPoints: chartData.labels.length,
      datasets: chartData.datasets.length,
      lastUpdated: chartData.lastUpdated?.toDate?.() || 'unknown'
    });
    
    return chartData;
    
  } catch (error) {
    console.error(`[ChartData] Error loading chart data for group ${groupId}:`, error);
    return null;
  }
}

/**
 * 🔄 Fallback: Falls Pre-computed Data nicht verfügbar ist
 * 
 * Diese Funktion wird nur verwendet, wenn die Pre-computed Daten
 * nicht verfügbar sind (z.B. bei sehr alten Gruppen).
 */
export async function getChartDataFallback(groupId: string): Promise<ChartDataSnapshot | null> {
  console.warn(`[ChartData] Using fallback calculation for group ${groupId}`);
  
  // Hier könnte man die alte getGroupRatingTimeSeries() Logik verwenden
  // Für jetzt geben wir null zurück, damit das Frontend entsprechend reagiert
  return null;
}

/**
 * 🎯 Intelligente Chart-Daten-Ladung mit Fallback
 * 
 * Versucht zuerst Pre-computed Data zu laden, falls das fehlschlägt,
 * verwendet es den Fallback (alte Berechnung).
 */
export async function getChartData(groupId: string): Promise<ChartDataSnapshot | null> {
  // 1. Versuche Pre-computed Data zu laden
  const precomputedData = await getPrecomputedChartData(groupId);
  if (precomputedData) {
    return precomputedData;
  }
  
  // 2. Fallback auf alte Berechnung
  console.warn(`[ChartData] Pre-computed data not available for group ${groupId}, using fallback`);
  return await getChartDataFallback(groupId);
}
