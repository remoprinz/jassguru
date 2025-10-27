import { db } from './firebaseInit';
import { 
  collection, 
  doc, 
  query, 
  orderBy, 
  limit, 
  where, 
  getDocs, 
  getDoc,
  Timestamp 
} from 'firebase/firestore';

// ✅ Interfaces für Rating-Historie V2 (Frontend)
export interface RatingHistoryEntry {
  // 🔑 IDENTIFIERS
  createdAt: Timestamp;
  playerId: string;
  groupId: string;
  
  // 🎮 EVENT CONTEXT
  eventType: 'session_end' | 'tournament_passe' | 'tournament_end' | 'manual_recalc' | 'initial';
  eventId: string;
  
  // 📊 SNAPSHOT (aktueller Stand NACH diesem Event)
  rating: number;
  gamesPlayed: number;
  tier: string;
  tierEmoji: string;
  
  // 🎯 DELTA (Änderungen durch dieses Event)
  delta: {
    rating: number;
    striche: number;
    games: number;
    wins: number;
    losses: number;
    points: number;
  };
  
  // 🔢 CUMULATIVE (Gesamtwerte bis jetzt)
  cumulative?: {
    striche: number;
    wins: number;
    losses: number;
    points: number;
  };
  
  // 🔄 BACKWARDS COMPATIBILITY
  sessionId?: string;
  tournamentId?: string;
  context?: 'session_end' | 'tournament_end' | 'manual_recalc' | 'initial';
}

export interface RatingTrend {
  startRating: number;
  endRating: number;
  delta: number;
  percentChange: number;
  entriesCount: number;
  trend: 'up' | 'down' | 'stable';
  description: string;
}

// ❌ ENTFERNT: PeakRating interface (nicht mehr verwendet)

/**
 * 📊 Hole Rating-Historie für einen Spieler in einer Gruppe
 */
export async function getRatingHistory(
  groupId: string,
  playerId: string,
  limitCount: number = 50
): Promise<RatingHistoryEntry[]> {
  try {
    const historyRef = collection(
      db, 
      `groups/${groupId}/playerRatings/${playerId}/history`
    );
    
    const historyQuery = query(
      historyRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const historySnap = await getDocs(historyQuery);
    
    const history: RatingHistoryEntry[] = [];
    historySnap.forEach(doc => {
      const data = doc.data();
      
      // 🔄 Backwards Compatibility: Support both old and new schema
      const entry: RatingHistoryEntry = {
        // 🔑 IDENTIFIERS
        createdAt: data.createdAt,
        playerId: data.playerId || playerId, // Fallback für alte Dokumente
        groupId: data.groupId || groupId, // Fallback für alte Dokumente
        
        // 🎮 EVENT CONTEXT
        eventType: data.eventType || data.context || 'session_end',
        eventId: data.eventId || data.sessionId || data.tournamentId || 'unknown',
        
        // 📊 SNAPSHOT
        rating: data.rating,
        gamesPlayed: data.gamesPlayed,
        tier: data.tier,
        tierEmoji: data.tierEmoji,
        
        // 🎯 DELTA
        delta: data.delta && typeof data.delta === 'object' 
          ? data.delta // Neue Struktur
          : { // Alte Struktur: Nur Rating-Delta vorhanden
              rating: data.delta || 0,
              striche: 0,
              games: 0,
              wins: 0,
              losses: 0,
              points: 0
            },
        
        // 🔢 CUMULATIVE (optional)
        cumulative: data.cumulative,
        
        // 🔄 BACKWARDS COMPATIBILITY
        sessionId: data.sessionId,
        tournamentId: data.tournamentId,
        context: data.context
      };
      
      history.push(entry);
    });

    return history;
  } catch (error) {
    console.error(`[RatingHistory] Error fetching history for player ${playerId}:`, error);
    return [];
  }
}

/**
 * 📈 Berechne Rating-Trend über bestimmten Zeitraum
 */
export async function getRatingTrend(
  groupId: string,
  playerId: string,
  days: number = 30
): Promise<RatingTrend> {
  try {
    const cutoffDate = Timestamp.fromMillis(
      Date.now() - (days * 24 * 60 * 60 * 1000)
    );

    const historyRef = collection(
      db, 
      `groups/${groupId}/playerRatings/${playerId}/history`
    );
    
    const trendQuery = query(
      historyRef,
      where('createdAt', '>=', cutoffDate),
      orderBy('createdAt', 'asc')
    );

    const trendSnap = await getDocs(trendQuery);
    
    if (trendSnap.empty) {
      return {
        startRating: 1000,
        endRating: 1000,
        delta: 0,
        percentChange: 0,
        entriesCount: 0,
        trend: 'stable',
        description: `Keine Änderungen in den letzten ${days} Tagen`
      };
    }

    const entries: RatingHistoryEntry[] = [];
    trendSnap.forEach(doc => {
      entries.push(doc.data() as RatingHistoryEntry);
    });

    const startRating = entries[0].rating;
    const endRating = entries[entries.length - 1].rating;
    const delta = endRating - startRating;
    const percentChange = startRating > 0 ? (delta / startRating) * 100 : 0;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    let description = '';

    if (delta > 0) {
      trend = 'up';
      description = `+${delta} Punkte in ${days} Tagen (+${percentChange.toFixed(1)}%)`;
    } else if (delta < 0) {
      trend = 'down';
      description = `${delta} Punkte in ${days} Tagen (${percentChange.toFixed(1)}%)`;
    } else {
      description = `Stabil in den letzten ${days} Tagen`;
    }

    return {
      startRating,
      endRating,
      delta,
      percentChange,
      entriesCount: entries.length,
      trend,
      description
    };

  } catch (error) {
    console.error(`[RatingHistory] Error calculating trend for player ${playerId}:`, error);
    return {
      startRating: 1000,
      endRating: 1000,
      delta: 0,
      percentChange: 0,
      entriesCount: 0,
      trend: 'stable',
      description: 'Fehler beim Laden des Trends'
    };
  }
}

// ❌ ENTFERNT: getPlayerPeakRating() (nicht mehr verwendet, Werte aus players/{playerId}.tier & tierEmoji)

/**
 * 📉 Hole Rating-Historie für Chart-Darstellung (vereinfacht)
 */
export async function getRatingHistoryForChart(
  groupId: string,
  playerId: string,
  days: number = 90
): Promise<{ date: Date; rating: number; delta: number; tier: string }[]> {
  try {
    const cutoffDate = Timestamp.fromMillis(
      Date.now() - (days * 24 * 60 * 60 * 1000)
    );

    const historyRef = collection(
      db, 
      `groups/${groupId}/playerRatings/${playerId}/history`
    );
    
    const chartQuery = query(
      historyRef,
      where('createdAt', '>=', cutoffDate),
      orderBy('createdAt', 'asc')
    );

    const chartSnap = await getDocs(chartQuery);
    
    const chartData: { date: Date; rating: number; delta: number; tier: string }[] = [];
    
    chartSnap.forEach(doc => {
      const data = doc.data() as RatingHistoryEntry;
      // Handle both old (number) and new (object) delta format
      const ratingDelta = typeof data.delta === 'object' ? data.delta.rating : data.delta;
      chartData.push({
        date: data.createdAt.toDate(),
        rating: data.rating,
        delta: ratingDelta,
        tier: data.tier
      });
    });

    return chartData;

  } catch (error) {
    console.error(`[RatingHistory] Error fetching chart data for player ${playerId}:`, error);
    return [];
  }
}

/**
 * 🎯 Hole Rating-Historie mit Session-Kontext
 */
export async function getRatingHistoryWithSessions(
  groupId: string,
  playerId: string,
  limitCount: number = 20
): Promise<(RatingHistoryEntry & { sessionDate?: Date; tournamentName?: string })[]> {
  try {
    const history = await getRatingHistory(groupId, playerId, limitCount);
    
    // TODO: Erweitere mit Session-Details wenn benötigt
    // Könnte Session-Namen, Gegner, etc. aus Firestore laden
    
    return history.map(entry => ({
      ...entry,
      sessionDate: entry.createdAt.toDate(),
      tournamentName: entry.tournamentId ? `Turnier #${entry.tournamentId.substring(0, 8)}` : undefined
    }));

  } catch (error) {
    console.error(`[RatingHistory] Error fetching history with sessions for player ${playerId}:`, error);
    return [];
  }
}

/**
 * 📊 Hole Rating-Zeitreihen für alle Gruppenmitglieder (für Chart)
 */
export async function getGroupRatingTimeSeries(
  groupId: string
): Promise<{
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    playerId: string;
    displayName: string;
  }[];
}> {
  try {
    // Hole alle Mitglieder der Gruppe
    const membersRef = collection(db, `groups/${groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    
    if (membersSnap.empty) {
      return { labels: [], datasets: [] };
    }

    // 🎨 Verbesserte Farbpalette - keine Wiederholungen, keine Grautöne
    const colors = [
      { border: '#059669', background: 'rgba(5, 150, 105, 0.1)' }, // Emerald (Grün)
      { border: '#ea580c', background: 'rgba(234, 88, 12, 0.1)' }, // Orange
      { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }, // Blue
      { border: '#dc2626', background: 'rgba(220, 38, 38, 0.1)' }, // Red
      { border: '#9333ea', background: 'rgba(147, 51, 234, 0.1)' }, // Violet
      { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' }, // Pink
      { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }, // Amber (Gelb)
      { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }, // Emerald-500
      { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }, // Violet-500
      { border: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }, // Red-500
      { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }, // Cyan
      { border: '#84cc16', background: 'rgba(132, 204, 22, 0.1)' }, // Lime
      { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' }, // Orange-500
      { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }, // Purple
    ];

    const datasets: any[] = [];
    
    // 🔧 SCHRITT 1: Sammle ALLE Datenpunkte ALLER Spieler mit aktuellem Rating
    const playerHistories = new Map<string, { 
      displayName: string; 
      currentRating: number; // Für Sortierung
      history: Map<string, number>; // dateKey -> rating
    }>();

    // Hole Rating-Historie für jeden Spieler aus der globalen players-Collection
    for (let i = 0; i < membersSnap.docs.length; i++) {
      const memberDoc = membersSnap.docs[i];
      const playerId = memberDoc.id;
      const memberData = memberDoc.data();
      
      // Hole globale Rating-Historie aus players/{playerId}/ratingHistory
      const historyRef = collection(db, `players/${playerId}/ratingHistory`);
      const chartQuery = query(
        historyRef,
        orderBy('createdAt', 'asc')
      );

      const historySnap = await getDocs(chartQuery);
      
      if (historySnap.empty) continue;

      const historyMap = new Map<string, number>();
      
      // Hole aktuelles Rating aus der players-Collection
      const playerDocRef = doc(db, 'players', playerId);
      const playerDocSnap = await getDoc(playerDocRef);
      let currentRating = 100; // Default
      
      if (playerDocSnap.exists()) {
        const playerData = playerDocSnap.data();
        currentRating = playerData?.globalRating || playerData?.rating || 100;
      }
      
      historySnap.forEach(doc => {
        const data = doc.data();
        if (data.createdAt && data.rating) {
          // Handle Firestore Timestamp
          let date: Date;
          if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
            date = data.createdAt.toDate();
          } else if (data.createdAt instanceof Date) {
            date = data.createdAt;
          } else if (typeof data.createdAt === 'object' && '_seconds' in data.createdAt) {
            const seconds = (data.createdAt as any)._seconds;
            const nanoseconds = (data.createdAt as any)._nanoseconds || 0;
            date = new Date(seconds * 1000 + nanoseconds / 1000000);
          } else {
            return; // Skip invalid timestamps
          }
          
          const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          historyMap.set(dateKey, data.rating);
        }
      });

      // Nur Spieler mit mehr als einem Datenpunkt speichern
      if (historyMap.size > 1) {
        playerHistories.set(playerId, {
          displayName: memberData.displayName || `Spieler_${playerId.slice(0,6)}`,
          currentRating, // 🎯 Das aktuelle globalRating für Sortierung
          history: historyMap
        });
      }
    }
    
    // 🔧 SCHRITT 2: Erstelle sortierte Liste ALLER vorkommenden Daten
    const allDatesSet = new Set<string>();
    playerHistories.forEach(player => {
      player.history.forEach((_, dateKey) => {
        allDatesSet.add(dateKey);
      });
    });
    const sortedDates = Array.from(allDatesSet).sort();
    
    // 🔧 SCHRITT 3: Sortiere Spieler nach aktuellem Rating (höchstes zuerst)
    const sortedPlayers = Array.from(playerHistories.entries())
      .sort(([, a], [, b]) => b.currentRating - a.currentRating);
    
    // 🔧 SCHRITT 4: Erstelle Datasets mit aligned Daten (null für fehlende Datenpunkte)
    sortedPlayers.forEach(([playerId, player], colorIndex) => {
      const alignedData: (number | null)[] = sortedDates.map(dateKey => {
        return player.history.get(dateKey) ?? null;
      });
      
      datasets.push({
        label: player.displayName,
        data: alignedData,
        borderColor: colors[colorIndex % colors.length].border,
        backgroundColor: colors[colorIndex % colors.length].background,
        playerId,
        displayName: player.displayName,
        spanGaps: true, // ✅ WICHTIG: Verbinde Datenpunkte auch wenn Lücken existieren
        // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
      });
    });

    // Erstelle Labels (Datum-Strings)
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      });
    });

    return { labels, datasets };

  } catch (error) {
    console.error(`[RatingHistory] Error fetching group time series for group ${groupId}:`, error);
    return { labels: [], datasets: [] };
  }
}

/**
 * 📊 Hole Rating-Zeitreihen für einen einzelnen Spieler (für Profile)
 */
export async function getPlayerRatingTimeSeries(
  groupId: string,
  playerId: string
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
    const historyRef = collection(
      db, 
      `groups/${groupId}/playerRatings/${playerId}/history`
    );
    
    const chartQuery = query(
      historyRef,
      orderBy('createdAt', 'asc')
    );

    const historySnap = await getDocs(chartQuery);
    
    if (historySnap.empty) {
      return { labels: [], datasets: [] };
    }

    const playerHistory: { date: Date; rating: number }[] = [];
    
    historySnap.forEach(doc => {
      const data = doc.data() as RatingHistoryEntry;
      playerHistory.push({
        date: data.createdAt.toDate(),
        rating: data.rating
      });
    });

    const labels = playerHistory.map(h => 
      h.date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      })
    );

    const datasets = [{
      label: 'Elo-Rating',
      data: playerHistory.map(h => h.rating),
      borderColor: '#059669',
      backgroundColor: 'rgba(5, 150, 105, 0.1)',
      // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
    }];

    return { labels, datasets };

  } catch (error) {
    console.error(`[RatingHistory] Error fetching player time series for player ${playerId}:`, error);
    return { labels: [], datasets: [] };
  }
}

/**
 * 📊 Statistiken über Rating-Entwicklung
 */
export async function getRatingStatistics(
  groupId: string,
  playerId: string
): Promise<{
  totalGames: number;
  averageRatingChange: number;
  bestStreak: number;
  worstStreak: number;
  sessionsPlayed: number;
  tournamentsPlayed: number;
  daysActive: number;
}> {
  try {
    const allHistory = await getRatingHistory(groupId, playerId, 1000); // Alle Einträge
    
    if (allHistory.length === 0) {
      return {
        totalGames: 0,
        averageRatingChange: 0,
        bestStreak: 0,
        worstStreak: 0,
        sessionsPlayed: 0,
        tournamentsPlayed: 0,
        daysActive: 0
      };
    }

    // Handle both old (number) and new (object) delta format
    const totalRatingChange = allHistory.reduce((sum, entry) => {
      const ratingDelta = typeof entry.delta === 'object' ? entry.delta.rating : entry.delta;
      return sum + ratingDelta;
    }, 0);
    const averageRatingChange = totalRatingChange / allHistory.length;
    
    // Berechne Streaks
    let currentStreak = 0;
    let bestStreak = 0;
    let worstStreak = 0;
    
    allHistory.forEach(entry => {
      const ratingDelta = typeof entry.delta === 'object' ? entry.delta.rating : entry.delta;
      if (ratingDelta > 0) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (ratingDelta < 0) {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        worstStreak = Math.min(worstStreak, currentStreak);
      }
    });

    const sessionsPlayed = allHistory.filter(entry => 
      entry.context === 'session_end' && entry.sessionId
    ).length;
    
    const tournamentsPlayed = allHistory.filter(entry => 
      entry.context === 'tournament_end' && entry.tournamentId
    ).length;

    const firstEntry = allHistory[allHistory.length - 1];
    const lastEntry = allHistory[0];
    const daysActive = Math.floor(
      (lastEntry.createdAt.toMillis() - firstEntry.createdAt.toMillis()) / (24 * 60 * 60 * 1000)
    );

    return {
      totalGames: allHistory.length,
      averageRatingChange,
      bestStreak,
      worstStreak: Math.abs(worstStreak),
      sessionsPlayed,
      tournamentsPlayed,
      daysActive
    };

  } catch (error) {
    console.error(`[RatingHistory] Error calculating statistics for player ${playerId}:`, error);
    return {
      totalGames: 0,
      averageRatingChange: 0,
      bestStreak: 0,
      worstStreak: 0,
      sessionsPlayed: 0,
      tournamentsPlayed: 0,
      daysActive: 0
    };
  }
}
