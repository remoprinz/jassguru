import { db } from '@/services/firebaseInit';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getRatingTier } from '@/shared/rating-tiers'; // 🔧 FIX: Single Source of Truth für Emojis

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
      orderBy('createdAt', 'asc')
      // ✅ KEIN LIMIT HIER! Limit wird nach dem Laden angewendet (Zeile ~122)
    );
    
    const historySnap = await getDocs(historyQuery);
    
    if (historySnap.empty) {
      // Keine globale Historie gefunden
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 2: Sammle alle Datenpunkte (keine Deduplizierung nötig!)
    const historyEntries: { date: Date; rating: number; delta: number; gameNumber?: number; sessionId?: string }[] = [];
    
      historySnap.forEach(doc => {
        const data = doc.data();
        
        // ✅ WICHTIG: Verwende completedAt (Spiel-abschluss) statt createdAt (Dokument-Erstellung)
        const timestamp = data.completedAt || data.createdAt;
        
        if (timestamp && data.rating) {
          // Handle Firestore Timestamp
          let date: Date;
          if (timestamp.toDate && typeof timestamp.toDate === 'function') {
            // Native Firestore Timestamp
            date = timestamp.toDate();
          } else if (timestamp instanceof Date) {
            // Already a Date
            date = timestamp;
          } else if (typeof timestamp === 'object' && '_seconds' in timestamp) {
            // Plain object with _seconds and _nanoseconds (from serialized Timestamp)
            const seconds = (timestamp as any)._seconds;
            const nanoseconds = (timestamp as any)._nanoseconds || 0;
            date = new Date(seconds * 1000 + nanoseconds / 1000000);
          } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
            // Plain object with seconds and nanoseconds
            const seconds = (timestamp as any).seconds;
            const nanoseconds = (timestamp as any).nanoseconds || 0;
            date = new Date(seconds * 1000 + nanoseconds / 1000000);
          } else {
            console.warn(`[GlobalChart] Ungültiger Timestamp für Eintrag ${doc.id}:`, timestamp);
            return;
          }
          
          historyEntries.push({
            date: date,
            rating: data.rating,
            delta: data.delta || 0,
            gameNumber: data.gameNumber || 0,
            sessionId: data.sessionId || ''
          });
        } else {
          console.warn(`[GlobalChart] Fehlende Daten für Eintrag ${doc.id}:`, { timestamp, rating: data.rating });
        }
      });
    
    // ✅ KORREKTUR: Sortiere nach Spielnummer innerhalb jeder Session
    historyEntries.sort((a, b) => {
      // Hauptsortierung nach Datum
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      // Tie-Breaker: Sortiere nach sessionId, dann nach gameNumber
      if (a.sessionId && b.sessionId && a.sessionId !== b.sessionId) {
        return a.sessionId.localeCompare(b.sessionId);
      }
      
      // Innerhalb der gleichen Session: nach gameNumber sortieren
      const gameNumA = a.gameNumber || 0;
      const gameNumB = b.gameNumber || 0;
      return gameNumA - gameNumB;
    });
    
    // Datenpunkte geladen und sortiert
    
    if (historyEntries.length === 0) {
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 3: Filtere Spieler mit nur einem Event heraus (KEINE Tag-Gruppierung mehr!)
    if (historyEntries.length < 2) {
      console.log(`[GlobalChart] Spieler ${playerId} hat nur ${historyEntries.length} Event(s) - wird herausgefiltert`);
      return { labels: [], datasets: [] };
    }
    
    // 🎯 SCHRITT 4: Limitiere auf die letzten N Datenpunkte (alle Spiele einzeln!)
    const limitedHistory = historyEntries.slice(-limitCount);
    
    // 🎯 SCHRITT 5: Erstelle Chart-Datasets aus allen Einträgen (kein Gruppieren mehr!)
    // ✅ WICHTIG: Labels müssen EINDEUTIG sein, sonst gruppiert Chart.js sie!
    const labels = limitedHistory.map((entry, index, array) => {
      const dateLabel = entry.date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
      
      // Prüfe ob mehrere Einträge am selben Tag
      const entriesOnSameDay = array.filter(e => {
        return e.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) === dateLabel;
      });
      
      // Wenn mehrere Einträge am selben Tag, füge gameNumber oder Uhrzeit hinzu
      if (entriesOnSameDay.length > 1) {
        if (entry.gameNumber) {
          return `${dateLabel} (${entry.gameNumber})`;
        } else {
          // Fallback: Uhrzeit hinzufügen
          const time = entry.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          return `${dateLabel} ${time}`;
        }
      }
      
      return dateLabel;
    });
    
    const ratings = limitedHistory.map(entry => entry.rating);
    
    // 🆕 NEU: Berechne Emojis für jeden Datenpunkt
    const tierEmojis = limitedHistory.map(entry => getTierEmojiForRating(entry.rating));
    
    // 🆕 NEU: Extrahiere Delta-Werte für jeden Datenpunkt
    const deltas = limitedHistory.map(entry => entry.delta);
    
    // Theme-basierte Farben
    const themeColors = {
      blue: { border: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)' },
      green: { border: '#10B981', background: 'rgba(16, 185, 129, 0.1)' },
      purple: { border: '#8B5CF6', background: 'rgba(139, 92, 246, 0.1)' },
      orange: { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' },
      red: { border: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' },
      yellow: { border: '#EAB308', background: 'rgba(234, 179, 8, 0.1)' },
      pink: { border: '#EC4899', background: 'rgba(236, 72, 153, 0.1)' },
      teal: { border: '#14B8A6', background: 'rgba(20, 184, 166, 0.1)' },
      cyan: { border: '#06B6D4', background: 'rgba(6, 182, 212, 0.1)' }
    };
    
    const colors = themeColors[profileTheme as keyof typeof themeColors] || themeColors.yellow;

    // 🎯 Tier-Emoji basierend auf Rating - Verwende getRatingTier() als Single Source of Truth
    function getTierEmojiForRating(rating: number): string {
      return getRatingTier(rating).emoji;
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