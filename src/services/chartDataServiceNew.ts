import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getRankingColor } from '../config/chartColors';

/**
 * 🎯 CHART DATA SERVICE - NEUE ARCHITEKTUR
 * ========================================= 
 * 
 * Liest Elo-Chart-Daten direkt aus jassGameSummaries (gruppenspezifisch)
 * statt aus ratingHistory (global).
 * 
 * Vorteile:
 * - Semantisch korrekt: GroupView → groups/{groupId}/jassGameSummaries
 * - Performance: Alle Daten in einem Pfad
 * - Turniere: Automatisch inkludiert (z.B. Krakau 2025)
 * - Keine Cross-Group-Probleme
 */

// ✅ Chart-Typen
export type ChartType = 'rating' | 'striche' | 'points';

/**
 * 🚀 Lade Elo-Rating-Chart aus jassGameSummaries
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
    
    // Sammle alle Spieler und ihre Rating-Verläufe
    const playerData: Map<string, {
      displayName: string;
      dataPoints: { date: string; rating: number; timestamp: Date }[];
    }> = new Map();
    
    const allLabels = new Set<string>();
    
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      
      // Prüfe ob playerFinalRatings existiert
      if (!data.playerFinalRatings) {
        return;
      }
      
      // Extrahiere completedAt
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      let timestamp: Date;
      if (completedAt.toDate && typeof completedAt.toDate === 'function') {
        timestamp = completedAt.toDate();
      } else if (completedAt._seconds !== undefined) {
        timestamp = new Date(completedAt._seconds * 1000);
      } else {
        return;
      }
      
      const dateLabel = timestamp.toLocaleDateString('de-DE');
      allLabels.add(dateLabel);
      
      // Für jeden Spieler: Speichere Rating
      Object.entries(data.playerFinalRatings).forEach(([playerId, ratingData]: [string, any]) => {
        if (!playerData.has(playerId)) {
          playerData.set(playerId, {
            displayName: ratingData.displayName || playerId,
            dataPoints: []
          });
        }
        
        const player = playerData.get(playerId)!;
        player.dataPoints.push({
          date: dateLabel,
          rating: ratingData.rating || 0,
          timestamp
        });
      });
    });
    
    // Sortiere Labels chronologisch
    const sortedLabels = Array.from(allLabels).sort((a, b) => {
      const dateA = new Date(a.split('.').reverse().join('-'));
      const dateB = new Date(b.split('.').reverse().join('-'));
      return dateA.getTime() - dateB.getTime();
    });
    
    // Erstelle Datasets für jeden Spieler
    const datasets: any[] = [];
    
    playerData.forEach((player, playerId) => {
      // ✅ FILTER: Spieler mit zu wenigen Sessions ausschließen
      if (player.dataPoints.length < (options?.minDataPoints || 2)) {
        return;
      }
      
      // Erstelle Datenpunkte für jeden Label
      const data: (number | null)[] = [];
      
      sortedLabels.forEach(label => {
        // Finde ALLE Einträge für dieses Datum
        const pointsForDate = player.dataPoints.filter(p => p.date === label);
        
        if (pointsForDate.length > 0) {
          // Nehme den LETZTEN Eintrag (neuestes Rating des Tages)
          const sortedPoints = pointsForDate.sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
          );
          const lastPoint = sortedPoints[sortedPoints.length - 1];
          data.push(lastPoint.rating);
        } else {
          data.push(null);
        }
      });
      
      // ✅ FILTER: Prüfe ob Spieler genug gültige Datenpunkte hat
      const validPoints = data.filter(point => point !== null && point !== undefined && !isNaN(point));
      if (validPoints.length < (options?.minDataPoints || 2)) {
        return;
      }
      
      datasets.push({
        label: player.displayName,
        data: data,
        playerId: playerId,
        borderColor: '#000000', // Temporär - wird nach Sortierung überschrieben
        backgroundColor: '#000000',
        borderWidth: 2,
        fill: false,
        tension: 0.4
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

// 🎨 FARBPALETTE wird jetzt aus chartColors.ts importiert
// Hinweis: Diese Datei hatte Darkening/Lightening für viele Spieler (>10), aber die 
// zentrale Version in chartColors.ts verwendet jetzt die einfachere zyklische Wiederholung

// Backfill-Status (für Kompatibilität)
export async function getBackfillStatus(groupId: string): Promise<{
  isBackfilled: boolean;
  lastUpdated?: Date;
}> {
  return {
    isBackfilled: true,
    lastUpdated: new Date()
  };
}

// Placeholder für Striche/Points (falls später benötigt)
export async function getOptimizedStricheChart(groupId: string, options?: any) {
  // TODO: Implementiere aus scoresHistory
  return {
    labels: [],
    datasets: [],
    source: 'live' as const,
    lastUpdated: new Date()
  };
}

export async function getOptimizedPointsChart(groupId: string, options?: any) {
  // TODO: Implementiere aus scoresHistory
  return {
    labels: [],
    datasets: [],
    source: 'live' as const,
    lastUpdated: new Date()
  };
}

