import { db } from './firebaseInit';
import { 
  collection, 
  doc, 
  query, 
  orderBy, 
  limit, 
  where, 
  getDocs, 
  Timestamp 
} from 'firebase/firestore';

// ✅ Interfaces für Rating-Historie (Frontend)
export interface RatingHistoryEntry {
  rating: number;
  delta: number;
  gamesPlayed: number;
  sessionId?: string;
  tournamentId?: string;
  context: 'session_end' | 'tournament_end' | 'manual_recalc' | 'initial';
  createdAt: Timestamp;
  tier: string;
  tierEmoji: string;
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

export interface PeakRating {
  rating: number;
  date: Timestamp;
  tier: string;
  tierEmoji: string;
  daysAgo: number;
}

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
      history.push({
        rating: data.rating,
        delta: data.delta,
        gamesPlayed: data.gamesPlayed,
        sessionId: data.sessionId,
        tournamentId: data.tournamentId,
        context: data.context,
        createdAt: data.createdAt,
        tier: data.tier,
        tierEmoji: data.tierEmoji
      });
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

/**
 * 🏆 Finde höchstes je erreichtes Rating
 */
export async function getPlayerPeakRating(
  groupId: string,
  playerId: string
): Promise<PeakRating | null> {
  try {
    const historyRef = collection(
      db, 
      `groups/${groupId}/playerRatings/${playerId}/history`
    );
    
    const peakQuery = query(
      historyRef,
      orderBy('rating', 'desc'),
      limit(1)
    );

    const peakSnap = await getDocs(peakQuery);
    
    if (peakSnap.empty) {
      return null;
    }

    const peakData = peakSnap.docs[0].data() as RatingHistoryEntry;
    const daysAgo = Math.floor((Date.now() - peakData.createdAt.toMillis()) / (24 * 60 * 60 * 1000));

    return {
      rating: peakData.rating,
      date: peakData.createdAt,
      tier: peakData.tier,
      tierEmoji: peakData.tierEmoji,
      daysAgo
    };

  } catch (error) {
    console.error(`[RatingHistory] Error fetching peak rating for player ${playerId}:`, error);
    return null;
  }
}

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
      chartData.push({
        date: data.createdAt.toDate(),
        rating: data.rating,
        delta: data.delta,
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

    const totalRatingChange = allHistory.reduce((sum, entry) => sum + entry.delta, 0);
    const averageRatingChange = totalRatingChange / allHistory.length;
    
    // Berechne Streaks
    let currentStreak = 0;
    let bestStreak = 0;
    let worstStreak = 0;
    
    allHistory.forEach(entry => {
      if (entry.delta > 0) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (entry.delta < 0) {
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
