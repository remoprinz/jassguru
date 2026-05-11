import { getFirestore, collection, query, where, getDocs, documentId, orderBy, limit, limitToLast } from 'firebase/firestore';  
import { db } from '@/services/firebaseInit';
import { getRatingTier } from '@/shared/rating-tiers';

export const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
};

export interface PlayerRating {
  rating: number;
  gamesPlayed: number;
}

export function createDefaultPlayerRating(playerId: string): PlayerRating {
  return {
    rating: JASS_ELO_CONFIG.DEFAULT_RATING,
    gamesPlayed: 0
  };
}

export interface PlayerRatingWithTier {
  id: string;
  rating: number;
  gamesPlayed: number;
  lastUpdated: number;
  displayName: string;
  tier: string;
  tierEmoji: string;
  lastDelta: number; // ✅ Alte Game-Delta (für Kompatibilität)
  lastSessionDelta?: number; // 🆕 SESSION-DELTA: Delta der letzten Session
}

/**
 * 🆕 NEU: Berechnet das Delta zwischen vorletzter und letzter Session
 * Gibt das Rating-Delta zwischen den letzten beiden Sessions zurück
 */
async function calculateLastSessionRatingDelta(playerId: string): Promise<number | null> {
  try {
    // Lade die letzten 2 Sessions aus ratingHistory
    const ratingHistoryRef = collection(db, `players/${playerId}/ratingHistory`);
    
    // Hole die letzten 30 Einträge (chronologisch sortiert)
    // ✅ OPTIMIERT: 30 Einträge = sicher alle Events der letzten 2 Sessions (10 Games × 3 Sessions = 30 max)
    // Wir brauchen nur die letzten Events von letzten 2 Sessions, aber müssen erstmal identifizieren welche das sind
    const historyQuery = query(
      ratingHistoryRef,
      orderBy('completedAt', 'desc'),
      limit(30)
    );
    
    const historySnap = await getDocs(historyQuery);
    
    if (historySnap.empty || historySnap.docs.length < 2) {
      return null; // Keine ausreichenden Daten
    }
    
    // Gruppiere nach Session/Tournament
    const sessionMap = new Map<string, Array<{ rating: number; completedAt: any }>>();
    
    historySnap.docs.forEach(doc => {
      const data = doc.data();
      const sessionKey = data.sessionId || data.tournamentId || 'unknown';
      
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, []);
      }
      
      sessionMap.get(sessionKey)!.push({
        rating: data.rating,
        completedAt: data.completedAt
      });
    });
    
    // Sortiere Sessions nach Datum (nur Sessions MIT completedAt)
    const validSessions = Array.from(sessionMap.entries()).filter(entry => {
      const latest = entry[1][0].completedAt;
      return latest && (latest.toMillis || latest instanceof Date || typeof latest === 'number');
    });
    
    const sortedSessions = validSessions.sort((a, b) => {
      const aLatest = a[1][0].completedAt;
      const bLatest = b[1][0].completedAt;
      
      const aTime = aLatest instanceof Date ? aLatest.getTime() : 
                   (aLatest as any)?.toMillis ? (aLatest as any).toMillis() : 0;
      const bTime = bLatest instanceof Date ? bLatest.getTime() : 
                   (bLatest as any)?.toMillis ? (bLatest as any).toMillis() : 0;
      
      return bTime - aTime; // Neueste zuerst
    });
    
    if (sortedSessions.length === 0) {
      return null; // Keine Sessions vorhanden
    }
    
    // Letzte Session: Neuestes Rating
    const lastSessionLatestRating = sortedSessions[0][1][0].rating;
    
    // ✅ EDGE CASE: Wenn nur 1 Session vorhanden ist, berechne Delta von Baseline 100
    if (sortedSessions.length === 1) {
      const delta = lastSessionLatestRating - 100; // Baseline = 100
      return delta;
    }
    
    // Vorletzte Session: Neuestes Rating
    const secondLastSessionLatestRating = sortedSessions[1][1][0].rating;
    
    // Delta = Letzte Session Rating - Vorletzte Session Rating
    const delta = lastSessionLatestRating - secondLastSessionLatestRating;
    
    return delta;
    
  } catch (error) {
    console.warn(`[jassElo] Fehler beim Berechnen von lastSessionRatingDelta für ${playerId}:`, error);
    return null;
  }
}

/**
 * 🆕 NEU: Optimierte Batch-Berechnung für mehrere Spieler gleichzeitig
 */
async function calculateLastSessionRatingDeltasBatch(playerIds: string[]): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();

  // ⚡ Berechne für alle Spieler parallel (10er-Wellen reichen für typische Gruppen-Größen)
  const batchSize = 10;
  for (let i = 0; i < playerIds.length; i += batchSize) {
    const batch = playerIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (playerId) => {
        const delta = await calculateLastSessionRatingDelta(playerId);
        results.set(playerId, delta);
      })
    );
  }

  return results;
}

export async function loadGroupLeaderboard(groupId: string): Promise<Map<string, PlayerRatingWithTier>> {
  const ratings = new Map<string, PlayerRatingWithTier>();
  
  try {
    const membersRef = collection(db, `groups/${groupId}/members`);
    const snapshot = await getDocs(membersRef);
    const playerIds: string[] = [];
    
    snapshot.forEach(doc => {
      playerIds.push(doc.id);
    });
    
    if (playerIds.length === 0) return ratings;
    
    // Lade alle Spieler-Ratings parallel
    const allRatings = await loadPlayerRatings(playerIds);
    
    // Sortiere nach Rating (höchstes zuerst)
    const sortedRatings = Array.from(allRatings.entries()).sort((a, b) => {
      const ratingDiff = b[1].rating - a[1].rating;
      if (Math.abs(ratingDiff) > 0.001) return ratingDiff;
      return b[1].gamesPlayed - a[1].gamesPlayed;
    });
    
    sortedRatings.forEach(([playerId, rating]) => {
      ratings.set(playerId, rating);
    });
    
  } catch (error) {
    console.warn('Fehler beim Laden des Leaderboards:', error);
  }
  
  return ratings;
}

/**
 * 🆕 ERWEITERT: Lädt Elo-Ratings UND (optional) berechnet das Delta zwischen vorletzter und letzter Session
 *
 * @param computeSessionDeltas Wenn true (default), wird pro Spieler eine zusätzliche ratingHistory-Query
 *   (30 docs) ausgeführt um lastSessionDelta live zu berechnen. Aufrufer, die diesen Wert nicht
 *   benötigen (z.B. GroupView, das deltas aus playerDeltas-Map bezieht), sollten false übergeben
 *   — spart bei n Spielern n × ratingHistory-Reads.
 */
export async function loadPlayerRatings(
  playerIds: string[],
  computeSessionDeltas: boolean = true,
): Promise<Map<string, PlayerRatingWithTier>> {
  const ratings = new Map<string, PlayerRatingWithTier>();

  if (playerIds.length === 0) return ratings;
  
  try {
    // Batch-Load in Gruppen von 10 (Firestore 'in' limit)
    const batches: string[][] = [];
    for (let i = 0; i < playerIds.length; i += 10) {
      batches.push(playerIds.slice(i, i + 10));
    }

    // ⚡ Batches parallel statt sequentiell ausführen
    const snapshots = await Promise.all(
      batches.map(batch =>
        getDocs(query(collection(db, 'players'), where(documentId(), 'in', batch)))
      )
    );

    snapshots.forEach(snapshot => {
      snapshot.forEach(doc => {
        const data: any = doc.data();
        const ratingValRaw = data?.globalRating;
        const ratingVal = typeof ratingValRaw === 'number' ? ratingValRaw : (Number(ratingValRaw) || JASS_ELO_CONFIG.DEFAULT_RATING);
        const gamesPlayedValRaw = data?.totalGamesPlayed;
        const gamesPlayedVal = typeof gamesPlayedValRaw === 'number' ? gamesPlayedValRaw : (Number(gamesPlayedValRaw) || 0);
        const lastUpdatedTs = data?.lastGlobalRatingUpdate;
        const lastUpdated = lastUpdatedTs?.toMillis ? lastUpdatedTs.toMillis() : Date.now();
        const name = data?.displayName || `Spieler_${doc.id.slice(0, 6)}`;
        const tierInfo = getRatingTier(ratingVal);

        ratings.set(doc.id, {
          id: doc.id,
          rating: ratingVal,
          gamesPlayed: gamesPlayedVal,
          lastUpdated,
          displayName: name,
          tier: tierInfo.name,
          tierEmoji: tierInfo.emoji,
          lastDelta: data?.lastDelta || 0, // Game-Delta (für Kompatibilität)
          lastSessionDelta: data?.lastSessionDelta || data?.lastDelta || 0, // Session-Delta (Fallback)
        });
      });
    });
    
    // 🆕 Berechne (optional) live das Delta zwischen vorletzter und letzter Session
    // — wird nur ausgeführt wenn der Aufrufer das wirklich braucht (siehe Param-Doc).
    if (computeSessionDeltas) {
      const deltaResults = await calculateLastSessionRatingDeltasBatch(playerIds);

      // Ersetze lastSessionDelta mit den berechneten Werten
      deltaResults.forEach((delta, playerId) => {
        const rating = ratings.get(playerId);
        if (rating && delta !== null) {
          rating.lastSessionDelta = delta;
        }
      });
    }
    
  } catch (error) {
    console.warn('Fehler beim Laden der Elo-Ratings:', error);
  }
  
  return ratings;
}