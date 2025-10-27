import { db } from '@/services/firebaseInit';
import { collection, getDocs } from 'firebase/firestore';

/**
 * 🌍 GLOBALE SCHNEIDER-BILANZ ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * Quelle: players/{playerId}/scoresHistory (neue unified Struktur)
 * SCHNELL: Direkt aus Precomputed-Daten!
 */
export async function getGlobalPlayerSchneiderTimeSeries(
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
    // 📊 NEUE STRUKTUR: Aus players/{playerId}/scoresHistory lesen
    const scoresHistorySnapshot = await getDocs(
      collection(db, 'players', playerId, 'scoresHistory')
    );
    
    if (scoresHistorySnapshot.empty) {
      console.warn(`[getGlobalPlayerSchneiderTimeSeries] Keine ScoresHistory für ${playerId}`);
      return {
        labels: [],
        datasets: []
      };
    }

    // Konvertiere zu Array und sortiere nach completedAt
    const historyEntries = scoresHistorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as any)).sort((a, b) => {
      const dateA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
      const dateB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
      return dateA.getTime() - dateB.getTime();
    });

    // Begrenze auf die neuesten Einträge
    const limitedHistory = historyEntries.slice(-limitCount);

    // Extrahiere Schneider-Bilanz-Daten (PRO-SPIEL - nicht kumulativ!)
    const schneiderBilanzData: number[] = [];
    const filteredLabels: string[] = [];
    let cumulativeSchneiderBilanz = 0;
    
    limitedHistory.forEach(entry => {
      // ✅ KUMULATIVE LOGIK: Addiere Pro-Spiel-Entries
      cumulativeSchneiderBilanz += entry.schneiderBilanz || 0;
      
      schneiderBilanzData.push(cumulativeSchneiderBilanz);
      filteredLabels.push(entry.completedAt?.toDate ? 
        entry.completedAt.toDate().toLocaleDateString('de-DE') : 
        'Unbekannt'
      );
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
      datasets: [{
        label: 'Schneider-Bilanz',
        data: schneiderBilanzData,
        borderColor: colors.border,
        backgroundColor: colors.background
      } as any]
    };

  } catch (error) {
    console.error('[getGlobalPlayerSchneiderTimeSeries] Fehler:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}
