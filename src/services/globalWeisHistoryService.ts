import { db } from '@/services/firebaseInit';
import { doc, getDoc } from 'firebase/firestore';

/**
 * 🌍 GLOBALE WEIS-DIFFERENZ ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * Quelle: playerScores/{playerId}.global.history (weisDifference)
 * SCHNELL: Direkt aus Precomputed-Daten!
 */
export async function getGlobalPlayerWeisTimeSeries(
  playerId: string,
  limitCount: number = 100,
  profileTheme: string = 'yellow'
): Promise<{
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
}> {
  try {
    // 📊 Direkt aus playerScores.global.history lesen
    const playerScoresDoc = await getDoc(doc(db, 'playerScores', playerId));
    
    if (!playerScoresDoc.exists()) {
      console.warn(`[getGlobalPlayerWeisTimeSeries] Player Scores nicht gefunden für ${playerId}`);
      return {
        labels: [],
        datasets: []
      };
    }

    const playerScores = playerScoresDoc.data();
    const history = playerScores?.global?.history || [];

    if (history.length === 0) {
      console.warn(`[getGlobalPlayerWeisTimeSeries] Keine History-Daten für ${playerId}`);
      return {
        labels: [],
        datasets: []
      };
    }

    // Sortiere nach Datum (sollte bereits sortiert sein, aber sicherheitshalber)
    const sortedHistory = [...history].sort((a, b) => {
      const dateA = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0);
      const dateB = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0);
      return dateA.getTime() - dateB.getTime();
    });

    // Begrenze auf die neuesten Einträge
    const limitedHistory = sortedHistory.slice(-limitCount);

    // Berechne kumulative Werte - NUR bei Events (weisDifference !== 0)
    let cumulativeWeisDiff = 0;
    const weisDiffData: number[] = [];
    const filteredLabels: string[] = [];
    
    limitedHistory.forEach(entry => {
      const weisDiff = entry.weisDifference || 0;
      // 🎯 NUR BEI EVENTS: Weis-Differenz ungleich 0
      if (weisDiff !== 0) {
        cumulativeWeisDiff += weisDiff;
        weisDiffData.push(cumulativeWeisDiff);
        filteredLabels.push(entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000).toLocaleDateString('de-DE', { 
          day: '2-digit', 
          month: '2-digit',
          year: '2-digit'
        }) : '');
      }
    });

    // Theme-Farben (identisch mit PowerRatingChart)
    const themeColors = {
      green: { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' },
      blue: { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' },
      purple: { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' },
      yellow: { border: '#eab308', background: 'rgba(234, 179, 8, 0.1)' },
      orange: { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' },
      cyan: { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' },
      pink: { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' },
      teal: { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.1)' }
    };

    const colors = themeColors[profileTheme as keyof typeof themeColors] || themeColors.blue;

    return {
      labels: filteredLabels,
      datasets: [
        {
          label: 'Weis-Differenz',
          data: weisDiffData,
          borderColor: colors.border,
          backgroundColor: colors.background
        }
      ]
    };

  } catch (error) {
    console.error('[getGlobalPlayerWeisTimeSeries] Fehler:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}