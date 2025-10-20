import { db } from '@/services/firebaseInit';
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

/**
 * 🌍 GLOBALE ELO-RATING ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * 
 * Diese Funktion lädt die **globale** Rating-Historie eines Spielers
 * aus `players/{playerId}/ratingHistory` - chronologisch über alle
 * Gruppen und Turniere hinweg.
 * 
 * ✅ VORTEILE:
 * - Keine Aggregation aus verschiedenen Gruppen nötig
 * - Keine Sprünge durch Deduplizierung
 * - Echte chronologische Reihenfolge
 * - Performance: Eine Query statt N Queries
 */
export async function getGlobalPlayerRatingTimeSeries(
  playerId: string,
  limitCount: number = 100,
  profileTheme: string = 'blue'
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
    // 🌍 SCHRITT 1: Lade GLOBALE Rating-Historie (alle Gruppen/Turniere chronologisch)
    const globalHistoryRef = collection(db, `players/${playerId}/ratingHistory`);
    const historyQuery = query(
      globalHistoryRef,
      orderBy('createdAt', 'asc'),
      limit(limitCount)
    );
    
    const historySnap = await getDocs(historyQuery);
    
    if (historySnap.empty) {
      // Keine globale Historie gefunden
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 2: Sammle alle Datenpunkte (keine Deduplizierung nötig!)
    const historyEntries: { date: Date; rating: number }[] = [];
    
      historySnap.forEach(doc => {
        const data = doc.data();
        if (data.createdAt && data.rating) {
          // Handle Firestore Timestamp
          let date: Date;
          if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
            // Native Firestore Timestamp
            date = data.createdAt.toDate();
          } else if (data.createdAt instanceof Date) {
            // Already a Date
            date = data.createdAt;
          } else if (typeof data.createdAt === 'object' && '_seconds' in data.createdAt) {
            // Plain object with _seconds and _nanoseconds (from serialized Timestamp)
            const seconds = (data.createdAt as any)._seconds;
            const nanoseconds = (data.createdAt as any)._nanoseconds || 0;
            date = new Date(seconds * 1000 + nanoseconds / 1000000);
          } else if (typeof data.createdAt === 'object' && 'seconds' in data.createdAt) {
            // Plain object with seconds and nanoseconds
            const seconds = (data.createdAt as any).seconds;
            const nanoseconds = (data.createdAt as any).nanoseconds || 0;
            date = new Date(seconds * 1000 + nanoseconds / 1000000);
          } else {
            console.warn(`[GlobalChart] Ungültiger Timestamp für Eintrag ${doc.id}:`, data.createdAt);
            return;
          }
          
          historyEntries.push({
            date: date,
            rating: data.rating
          });
        } else {
          console.warn(`[GlobalChart] Fehlende Daten für Eintrag ${doc.id}:`, { createdAt: data.createdAt, rating: data.rating });
        }
      });
    
    // Datenpunkte geladen
    
    if (historyEntries.length === 0) {
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 3: Erstelle Chart-Datasets (bereits chronologisch sortiert!)
    const labels = historyEntries.map(entry => {
      return entry.date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    });
    
    const ratings = historyEntries.map(entry => entry.rating);
    
    // Theme-basierte Farben
    const themeColors = {
      blue: { border: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)' },
      green: { border: '#10B981', background: 'rgba(16, 185, 129, 0.1)' },
      purple: { border: '#8B5CF6', background: 'rgba(139, 92, 246, 0.1)' },
      orange: { border: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)' },
      red: { border: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' },
      yellow: { border: '#EAB308', background: 'rgba(234, 179, 8, 0.1)' },
      pink: { border: '#EC4899', background: 'rgba(236, 72, 153, 0.1)' },
      teal: { border: '#14B8A6', background: 'rgba(20, 184, 166, 0.1)' },
      cyan: { border: '#06B6D4', background: 'rgba(6, 182, 212, 0.1)' }
    };
    
    const colors = themeColors[profileTheme as keyof typeof themeColors] || themeColors.yellow;

    return {
      labels,
      datasets: [{
        label: 'Elo-Rating',
        data: ratings,
        borderColor: colors.border,
        backgroundColor: colors.background
      }]
    };
  } catch (error) {
    console.error(`[GlobalChart] ❌ Fehler beim Laden der globalen Rating-Historie für Spieler ${playerId}:`, error);
    return { labels: [], datasets: [] };
  }
}