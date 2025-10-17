import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

// 🎨 Chart-Farbpalette (identisch zum Frontend)
const CHART_COLORS = [
  { border: '#059669', background: 'rgba(5, 150, 105, 0.1)' }, // Emerald
  { border: '#ea580c', background: 'rgba(234, 88, 12, 0.1)' }, // Orange
  { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }, // Blue
  { border: '#dc2626', background: 'rgba(220, 38, 38, 0.1)' }, // Red
  { border: '#9333ea', background: 'rgba(147, 51, 234, 0.1)' }, // Violet
  { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' }, // Pink
  { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }, // Amber
  { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }, // Emerald-500
  { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }, // Violet-500
  { border: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }, // Red-500
  { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }, // Cyan
  { border: '#84cc16', background: 'rgba(132, 204, 22, 0.1)' }, // Lime
  { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' }, // Orange-500
  { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }, // Purple
];

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
  lastUpdated: admin.firestore.Timestamp;
  totalPlayers: number;
  totalSessions: number;
}

/**
 * 🎯 HAUPTFUNKTION: Berechne und speichere Chart-Daten für eine Gruppe
 * 
 * Diese Funktion wird nach jeder Session aufgerufen und berechnet
 * die kompletten Chart-Daten für sofortige Frontend-Performance.
 */
export async function saveChartDataSnapshot(groupId: string): Promise<void> {
  logger.info(`[ChartData] Starting chart data calculation for group ${groupId}`);
  
  try {
    // 1. Hole alle Spieler der Gruppe
    const playersRef = db.collection(`groups/${groupId}/playerRatings`);
    const playersSnap = await playersRef.get();
    
    if (playersSnap.empty) {
      logger.warn(`[ChartData] No players found for group ${groupId}`);
      return;
    }

    // 2. Sammle alle Spieler mit History-Daten
    const playerHistories = new Map<string, { 
      displayName: string; 
      currentRating: number;
      history: Map<string, number>; // dateKey -> rating
    }>();

    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      
      const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
      const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
      
      if (historySnap.empty) continue;

      const historyMap = new Map<string, number>();
      let currentRating = playerData.rating || 100;
      
      historySnap.forEach(doc => {
        const data = doc.data();
        const date = data.createdAt.toDate();
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
        historyMap.set(dateKey, data.rating);
        currentRating = data.rating; // Letztes Rating ist das aktuelle
      });

      // Nur Spieler mit mehr als einem Datenpunkt
      if (historyMap.size > 1) {
        playerHistories.set(playerId, {
          displayName: playerData.displayName || `Spieler_${playerId.slice(0, 6)}`,
          currentRating,
          history: historyMap
        });
      }
    }

    if (playerHistories.size === 0) {
      logger.warn(`[ChartData] No players with sufficient history for group ${groupId}`);
      return;
    }

    // 3. Erstelle sortierte Liste ALLER vorkommenden Daten
    const allDatesSet = new Set<string>();
    playerHistories.forEach(player => {
      player.history.forEach((_, dateKey) => {
        allDatesSet.add(dateKey);
      });
    });
    const sortedDates = Array.from(allDatesSet).sort();

    // 4. Sortiere Spieler nach aktuellem Rating (höchstes zuerst)
    const sortedPlayers = Array.from(playerHistories.entries())
      .sort(([, a], [, b]) => b.currentRating - a.currentRating);

    // 5. Erstelle Chart-Datasets
    const datasets: ChartDataset[] = [];
    sortedPlayers.forEach(([playerId, player], colorIndex) => {
      const alignedData: (number | null)[] = sortedDates.map(dateKey => {
        return player.history.get(dateKey) ?? null;
      });
      
      datasets.push({
        label: player.displayName,
        data: alignedData,
        borderColor: CHART_COLORS[colorIndex % CHART_COLORS.length].border,
        backgroundColor: CHART_COLORS[colorIndex % CHART_COLORS.length].background,
        playerId,
        displayName: player.displayName,
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 4,
        spanGaps: true,
      });
    });

    // 6. Erstelle Labels (Datum-Strings)
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      });
    });

    // 7. Hole Session-Anzahl für Metadaten
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();

    // 8. Erstelle Chart-Data-Snapshot
    const chartDataSnapshot: ChartDataSnapshot = {
      labels,
      datasets,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalPlayers: playerHistories.size,
      totalSessions: sessionsSnap.size,
    };

    // 9. Speichere in Firestore
    await db.doc(`groups/${groupId}/aggregated/chartData`).set(chartDataSnapshot);
    
    logger.info(`[ChartData] Successfully saved chart data for group ${groupId}:`, {
      players: playerHistories.size,
      sessions: sessionsSnap.size,
      dataPoints: labels.length,
      datasets: datasets.length
    });
  } catch (error) {
    logger.error(`[ChartData] Error calculating chart data for group ${groupId}:`, error);
    throw error;
  }
}

/**
 * 🧹 Cleanup: Entferne alte Chart-Daten (falls nötig)
 */
export async function cleanupChartData(groupId: string): Promise<void> {
  try {
    // Für jetzt: Einfach das aktuelle Dokument löschen
    // Später könnte man hier eine Retention-Policy implementieren
    await db.doc(`groups/${groupId}/aggregated/chartData`).delete();
    logger.info(`[ChartData] Cleaned up chart data for group ${groupId}`);
  } catch (error) {
    logger.warn(`[ChartData] Error during cleanup for group ${groupId}:`, error);
  }
}
