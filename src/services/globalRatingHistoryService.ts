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
    tierEmojis?: (string | null)[]; // 🆕 NEU: Tier-Emojis für jeden Datenpunkt
    deltas?: (number | null)[]; // 🆕 NEU: Delta-Werte für jeden Datenpunkt
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
    const historyEntries: { date: Date; rating: number; delta: number }[] = [];
    
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
            rating: data.rating,
            delta: data.delta || 0
          });
        } else {
          console.warn(`[GlobalChart] Fehlende Daten für Eintrag ${doc.id}:`, { createdAt: data.createdAt, rating: data.rating });
        }
      });
    
    // Datenpunkte geladen
    
    if (historyEntries.length === 0) {
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 3: Filtere Spieler mit nur einem Event heraus
    if (historyEntries.length < 2) {
      console.log(`[GlobalChart] Spieler ${playerId} hat nur ${historyEntries.length} Event(s) - wird herausgefiltert`);
      return { labels: [], datasets: [] };
    }
    
    // 🎯 SCHRITT 4: Erstelle Chart-Datasets (bereits chronologisch sortiert!)
    const labels = historyEntries.map(entry => {
      return entry.date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    });
    
    const ratings = historyEntries.map(entry => entry.rating);
    
    // 🆕 NEU: Berechne Emojis für jeden Datenpunkt
    const tierEmojis = historyEntries.map(entry => getTierEmojiForRating(entry.rating));
    
    // 🆕 NEU: Extrahiere Delta-Werte für jeden Datenpunkt
    const deltas = historyEntries.map(entry => entry.delta);
    
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

    // 🎯 Tier-Emoji basierend auf Rating (KORREKTE JASSGURU-TIERE)
    function getTierEmojiForRating(rating: number): string {
      if (rating >= 150) return '👼';      // Göpf Egg
      if (rating >= 145) return '🔱';      // Jassgott
      if (rating >= 140) return '👑';      // Jasskönig
      if (rating >= 135) return '🏆';      // Grossmeister
      if (rating >= 130) return '🎖️';      // Jasser mit Auszeichnung
      if (rating >= 125) return '💎';      // Diamantjasser II
      if (rating >= 120) return '💍';      // Diamantjasser I
      if (rating >= 115) return '🥇';      // Goldjasser
      if (rating >= 110) return '🥈';      // Silberjasser
      if (rating >= 105) return '🥉';      // Bronzejasser
      if (rating >= 100) return '👨‍🎓';      // Jassstudent (START)
      if (rating >= 95) return '🍀';       // Kleeblatt vierblättrig
      if (rating >= 90) return '☘️';       // Kleeblatt dreiblättrig
      if (rating >= 85) return '🌱';       // Sprössling
      if (rating >= 80) return '🐓';       // Hahn
      if (rating >= 75) return '🐔';       // Huhn
      if (rating >= 70) return '🐥';       // Kücken
      if (rating >= 65) return '🎅';       // Chlaus
      if (rating >= 60) return '🧀';       // Chäs
      if (rating >= 55) return '🦆';       // Ente
      if (rating >= 50) return '🥒';       // Gurke
      return '🥚';                         // Just Egg
    }

    return {
      labels,
      datasets: [{
        label: 'Elo-Rating',
        data: ratings,
        borderColor: colors.border,
        backgroundColor: colors.background,
        tierEmojis: tierEmojis, // 🆕 NEU: Tier-Emojis für jeden Datenpunkt
        deltas: deltas // 🆕 NEU: Delta-Werte für jeden Datenpunkt
      }]
    };
  } catch (error) {
    console.error(`[GlobalChart] ❌ Fehler beim Laden der globalen Rating-Historie für Spieler ${playerId}:`, error);
    return { labels: [], datasets: [] };
  }
}