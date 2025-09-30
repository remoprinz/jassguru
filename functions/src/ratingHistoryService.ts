import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getRatingTier } from './shared/rating-tiers';

const db = admin.firestore();

// ✅ Interfaces für Rating-Historie
export interface RatingHistoryEntry {
  rating: number;
  delta: number;
  gamesPlayed: number;
  sessionId?: string;
  tournamentId?: string;
  context: 'session_end' | 'tournament_end' | 'manual_recalc' | 'initial';
  createdAt: admin.firestore.Timestamp;
  tier: string;
  tierEmoji: string;
}

export interface RatingSnapshot {
  playerId: string;
  currentRating: number;
  previousRating?: number;
  gamesPlayed: number;
}

/**
 * 🎯 HAUPTFUNKTION: Speichere Rating-Historie-Snapshots für Spieler
 * 
 * @param groupId - Gruppen-ID
 * @param sessionId - Session-ID (null bei Turnier-Updates)
 * @param playerIds - Array von Player-IDs
 * @param context - Kontext des Updates
 * @param tournamentId - Turnier-ID (optional, nur bei tournament_end)
 */
export async function saveRatingHistorySnapshot(
  groupId: string,
  sessionId: string | null,
  playerIds: string[],
  context: 'session_end' | 'tournament_end' | 'manual_recalc' | 'initial' = 'session_end',
  tournamentId?: string
): Promise<void> {
  try {
    logger.info(`[RatingHistory] Starting snapshot for ${playerIds.length} players in group ${groupId}`, {
      context,
      sessionId,
      tournamentId
    });

    if (!playerIds || playerIds.length === 0) {
      logger.warn(`[RatingHistory] No players provided for snapshot in group ${groupId}`);
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    let snapshotsCreated = 0;

    // Verarbeite jeden Spieler einzeln
    for (const playerId of playerIds) {
      try {
        const playerRatingRef = db.collection(`groups/${groupId}/playerRatings`).doc(playerId);
        const playerRatingDoc = await playerRatingRef.get();

        if (!playerRatingDoc.exists) {
          logger.warn(`[RatingHistory] Player rating not found for ${playerId} in group ${groupId}`);
          continue;
        }

        const currentRatingData = playerRatingDoc.data();
        const currentRating = currentRatingData?.rating || 100;
        const currentGamesPlayed = currentRatingData?.gamesPlayed || 0;

        // Hole das letzte Historie-Entry um Delta zu berechnen
        const historyRef = playerRatingRef.collection('history');
        const lastHistorySnap = await historyRef
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        let previousRating = 100; // Default Startrating (neue Skala)
        if (!lastHistorySnap.empty) {
          const lastEntry = lastHistorySnap.docs[0].data() as RatingHistoryEntry;
          previousRating = lastEntry.rating;
        }

        const delta = currentRating - previousRating;

        // Nur speichern wenn sich Rating geändert hat oder es der erste Eintrag ist
        if (delta !== 0 || lastHistorySnap.empty || context === 'manual_recalc') {
          // Berechne Tier und Emoji
          const tierInfo = getRatingTier(currentRating);
          
          // Erstelle neuen Historie-Eintrag
          const historyEntry: RatingHistoryEntry = {
            rating: currentRating,
            delta: delta,
            gamesPlayed: currentGamesPlayed,
            context: context,
            createdAt: now,
            tier: tierInfo.name,
            tierEmoji: tierInfo.emoji
          };

          // Füge kontext-spezifische Daten hinzu
          if (sessionId) {
            historyEntry.sessionId = sessionId;
          }
          if (tournamentId) {
            historyEntry.tournamentId = tournamentId;
          }

          // Nutze Timestamp als Document-ID für chronologische Sortierung
          const timestampId = now.toMillis().toString();
          const historyDocRef = historyRef.doc(timestampId);
          
          batch.set(historyDocRef, historyEntry);
          snapshotsCreated++;

          logger.info(`[RatingHistory] Queued snapshot for player ${playerId}: ${previousRating} → ${currentRating} (Δ${delta >= 0 ? '+' : ''}${delta})`, {
            tier: tierInfo.name,
            gamesPlayed: currentGamesPlayed,
            context
          });
        } else {
          logger.debug(`[RatingHistory] Skipping snapshot for player ${playerId} - no rating change (${currentRating})`);
        }
      } catch (playerError) {
        logger.error(`[RatingHistory] Error processing player ${playerId}:`, playerError);
        // Weiter mit nächstem Spieler, um Batch nicht zu blockieren
      }
    }

    // Commit alle Snapshots auf einmal
    if (snapshotsCreated > 0) {
      await batch.commit();
      logger.info(`[RatingHistory] Successfully saved ${snapshotsCreated} rating snapshots for group ${groupId}`, {
        context,
        sessionId,
        tournamentId
      });
    } else {
      logger.info(`[RatingHistory] No rating changes detected, no snapshots saved for group ${groupId}`);
    }

    // 🧹 Cleanup: Behalte nur die letzten 100 Einträge pro Spieler
    await cleanupOldHistoryEntries(groupId, playerIds);
  } catch (error) {
    logger.error(`[RatingHistory] Critical error saving snapshots for group ${groupId}:`, error);
    // Fehler nicht weiterwerfen, um Haupt-Workflow nicht zu blockieren
  }
}

/**
 * 🧹 Cleanup-Funktion: Behalte nur die letzten N Einträge pro Spieler
 */
async function cleanupOldHistoryEntries(
  groupId: string,
  playerIds: string[],
  maxEntries: number = 100
): Promise<void> {
  try {
    const cleanupBatch = db.batch();
    let totalDeleted = 0;

    for (const playerId of playerIds) {
      try {
        const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
        
        // Hole alle Einträge chronologisch sortiert
        const allEntriesSnap = await historyRef
          .orderBy('createdAt', 'desc')
          .get();

        // Lösche alles ab dem maxEntries-Index
        if (allEntriesSnap.docs.length > maxEntries) {
          const toDelete = allEntriesSnap.docs.slice(maxEntries);
          
          toDelete.forEach(doc => {
            cleanupBatch.delete(doc.ref);
            totalDeleted++;
          });

          logger.debug(`[RatingHistory] Queued deletion of ${toDelete.length} old entries for player ${playerId}`);
        }
      } catch (playerCleanupError) {
        logger.warn(`[RatingHistory] Error during cleanup for player ${playerId}:`, playerCleanupError);
      }
    }

    if (totalDeleted > 0) {
      await cleanupBatch.commit();
      logger.info(`[RatingHistory] Cleanup completed: deleted ${totalDeleted} old entries from group ${groupId}`);
    }
  } catch (cleanupError) {
    logger.warn(`[RatingHistory] Cleanup failed for group ${groupId}:`, cleanupError);
    // Cleanup-Fehler sind nicht kritisch
  }
}

/**
 * 📊 Query-Funktion: Hole Rating-Historie für einen Spieler
 */
export async function getRatingHistory(
  groupId: string,
  playerId: string,
  limit: number = 50
): Promise<RatingHistoryEntry[]> {
  try {
    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const historySnap = await historyRef
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const history: RatingHistoryEntry[] = [];
    historySnap.forEach(doc => {
      history.push(doc.data() as RatingHistoryEntry);
    });

    return history;
  } catch (error) {
    logger.error(`[RatingHistory] Error fetching history for player ${playerId} in group ${groupId}:`, error);
    return [];
  }
}

/**
 * 📈 Analyse-Funktion: Berechne Rating-Trend über bestimmten Zeitraum
 */
export async function getRatingTrend(
  groupId: string,
  playerId: string,
  days: number = 30
): Promise<{
  startRating: number;
  endRating: number;
  delta: number;
  percentChange: number;
  entriesCount: number;
}> {
  try {
    const cutoffDate = admin.firestore.Timestamp.fromMillis(
      Date.now() - (days * 24 * 60 * 60 * 1000)
    );

    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const recentHistorySnap = await historyRef
      .where('createdAt', '>=', cutoffDate)
      .orderBy('createdAt', 'asc')
      .get();

    if (recentHistorySnap.empty) {
      return {
        startRating: 100,
        endRating: 100,
        delta: 0,
        percentChange: 0,
        entriesCount: 0
      };
    }

    const entries = recentHistorySnap.docs.map(doc => doc.data() as RatingHistoryEntry);
    const startRating = entries[0].rating;
    const endRating = entries[entries.length - 1].rating;
    const delta = endRating - startRating;
    const percentChange = startRating > 0 ? (delta / startRating) * 100 : 0;

    return {
      startRating,
      endRating,
      delta,
      percentChange,
      entriesCount: entries.length
    };
  } catch (error) {
    logger.error(`[RatingHistory] Error calculating trend for player ${playerId}:`, error);
    return {
      startRating: 100,
      endRating: 100,
      delta: 0,
      percentChange: 0,
      entriesCount: 0
    };
  }
}

/**
 * 🏆 Peak-Rating-Funktion: Finde höchstes je erreichtes Rating
 */
export async function getPlayerPeakRating(
  groupId: string,
  playerId: string
): Promise<{
  rating: number;
  date: admin.firestore.Timestamp;
  tier: string;
  tierEmoji: string;
} | null> {
  try {
    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const allHistorySnap = await historyRef
      .orderBy('rating', 'desc')
      .limit(1)
      .get();

    if (allHistorySnap.empty) {
      return null;
    }

    const peakEntry = allHistorySnap.docs[0].data() as RatingHistoryEntry;
    return {
      rating: peakEntry.rating,
      date: peakEntry.createdAt,
      tier: peakEntry.tier,
      tierEmoji: peakEntry.tierEmoji
    };
  } catch (error) {
    logger.error(`[RatingHistory] Error fetching peak rating for player ${playerId}:`, error);
    return null;
  }
}
