import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getRatingTier } from './shared/rating-tiers';

const db = admin.firestore();

// ✅ Interfaces für Rating-Historie V2
export interface RatingHistoryEntry {
  // 🔑 IDENTIFIERS
  createdAt: admin.firestore.Timestamp;
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

export interface RatingSnapshot {
  playerId: string;
  currentRating: number;
  previousRating?: number;
  gamesPlayed: number;
}

/**
 * 🔧 Hilfsfunktion: Berechne Gesamtstriche aus StricheRecord
 */
function calculateTotalStriche(stricheRecord: any): number {
  if (!stricheRecord) return 0;
  return (stricheRecord.berg || 0) +
         (stricheRecord.sieg || 0) +
         (stricheRecord.matsch || 0) +
         (stricheRecord.schneider || 0) +
         (stricheRecord.kontermatsch || 0);
}

/**
 * 🔧 Hilfsfunktion: Berechne Delta-Werte aus einer Session
 * 
 * @param groupId - Gruppen-ID
 * @param sessionId - Session-ID
 * @param playerId - Spieler-ID
 * @returns Delta-Objekt mit striche, games, wins, losses, points
 */
async function calculateSessionDelta(
  groupId: string,
  sessionId: string,
  playerId: string
): Promise<{
  striche: number;
  games: number;
  wins: number;
  losses: number;
  points: number;
}> {
  try {
    // Lade SessionSummary
    const sessionRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      logger.warn(`[RatingHistory] Session ${sessionId} not found`);
      return { striche: 0, games: 0, wins: 0, losses: 0, points: 0 };
    }
    
    const session = sessionDoc.data();
    
    if (!session) {
      return { striche: 0, games: 0, wins: 0, losses: 0, points: 0 };
    }
    
    // Finde Team des Spielers
    const isTopTeam = session.teams?.top?.players?.some((p: any) => p.playerId === playerId);
    const isBottomTeam = session.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
    
    if (!isTopTeam && !isBottomTeam) {
      logger.warn(`[RatingHistory] Player ${playerId} not found in session ${sessionId} teams`);
      return { striche: 0, games: 0, wins: 0, losses: 0, points: 0 };
    }
    
    const playerTeam = isTopTeam ? 'top' : 'bottom';
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Berechne Striche (eigene - gegner)
    const ownStriche = calculateTotalStriche(session.finalStriche?.[playerTeam]);
    const opponentStriche = calculateTotalStriche(session.finalStriche?.[opponentTeam]);
    const stricheDelta = ownStriche - opponentStriche;
    
    // Berechne Wins/Losses aus gameResults
    let wins = 0;
    let losses = 0;
    
    if (session.gameResults && Array.isArray(session.gameResults)) {
      session.gameResults.forEach((game: any) => {
        if (game.winnerTeam === playerTeam) {
          wins++;
        } else if (game.winnerTeam === opponentTeam) {
          losses++;
        }
      });
    }
    
    // Punkte
    const points = session.finalScores?.[playerTeam] || 0;
    
    // Anzahl Spiele
    const games = session.gamesPlayed || 0;
    
    logger.debug(`[RatingHistory] Session delta for player ${playerId}: striche=${stricheDelta}, wins=${wins}, losses=${losses}, games=${games}`);
    
    return {
      striche: stricheDelta,
      games,
      wins,
      losses,
      points
    };
  } catch (error) {
    logger.error(`[RatingHistory] Error calculating session delta for player ${playerId}:`, error);
    return { striche: 0, games: 0, wins: 0, losses: 0, points: 0 };
  }
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
export async function saveRatingHistorySnapshotWithDate(
  groupId: string,
  sessionId: string | null,
  playerIds: string[],
  context: 'session_end' | 'tournament_end' | 'manual_recalc' | 'initial' = 'session_end',
  tournamentId?: string,
  completedAt?: admin.firestore.Timestamp
): Promise<void> {
  // Verwende das übergebene completedAt oder den aktuellen Timestamp
  const timestamp = completedAt || admin.firestore.Timestamp.now();
  
  try {
    logger.info(`[RatingHistory] Starting snapshot for ${playerIds.length} players in group ${groupId}`, {
      context,
      sessionId,
      tournamentId,
      completedAt: timestamp.toDate()
    });

    if (!playerIds || playerIds.length === 0) {
      logger.warn(`[RatingHistory] No players provided for snapshot in group ${groupId}`);
      return;
    }

    const batch = db.batch();
    const now = timestamp; // 🎯 WICHTIG: Verwende das korrekte completedAt

    for (const playerId of playerIds) {
      try {
        // Hole aktuelle Spielerdaten
        const playerDoc = await db.collection('players').doc(playerId).get();
        
        if (!playerDoc.exists) {
          logger.warn(`[RatingHistory] Player ${playerId} not found, skipping`);
          continue;
        }

        const playerData = playerDoc.data()!;
        const currentRating = playerData.globalRating || 100;
        const currentGamesPlayed = playerData.gamesPlayed || 0;

        // Hole das letzte Historie-Entry für kumulative Werte und Rating-Delta
        const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
        const lastHistorySnap = await globalHistoryRef
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        let previousRating = 100; // Default Startrating
        let previousCumulative = {
          striche: 0,
          wins: 0,
          losses: 0,
          points: 0
        };
        
        if (!lastHistorySnap.empty) {
          const lastEntry = lastHistorySnap.docs[0].data() as RatingHistoryEntry;
          previousRating = lastEntry.rating;
          
          // Hole kumulative Werte aus letztem Snapshot (falls vorhanden)
          if (lastEntry.cumulative) {
            previousCumulative = lastEntry.cumulative;
          }
        }

        const ratingDelta = currentRating - previousRating;

        // 🆕 V2: Berechne Session-Deltas (nur bei session_end)
        let sessionDelta = {
          striche: 0,
          wins: 0,
          losses: 0,
          games: 0,
          points: 0
        };

        if (context === 'session_end' && playerData.lastSessionDelta !== undefined) {
          // Hole Session-Daten aus dem Spielerdokument
          sessionDelta = {
            striche: playerData.lastSessionDelta || 0,
            wins: playerData.lastSessionWins || 0,
            losses: playerData.lastSessionLosses || 0,
            games: playerData.lastSessionGames || 0,
            points: playerData.lastSessionPoints || 0
          };
        }

        // Berechne neue kumulative Werte
        const newCumulative = {
          striche: previousCumulative.striche + sessionDelta.striche,
          wins: previousCumulative.wins + sessionDelta.wins,
          losses: previousCumulative.losses + sessionDelta.losses,
          points: previousCumulative.points + sessionDelta.points
        };

        // Nur speichern wenn sich Rating geändert hat, Session-Delta vorhanden ist, oder es der erste Eintrag ist
        const hasChanges = ratingDelta !== 0 || 
                          sessionDelta.games > 0 || 
                          lastHistorySnap.empty || 
                          context === 'manual_recalc';

        if (hasChanges) {
          // Berechne Tier und Emoji
          const tierInfo = getRatingTier(currentRating);
          
          // 🆕 V2: Erstelle neuen Historie-Eintrag mit erweitertem Schema
          const historyEntry: any = {
            // 🔑 IDENTIFIERS
            createdAt: now,
            completedAt: now, // 🎯 WICHTIG: Für Charts verwenden wir completedAt
            playerId,
            groupId,
            
            // 🎮 EVENT CONTEXT
            eventType: context,
            eventId: sessionId || tournamentId || 'unknown',
            
            // 📊 SNAPSHOT
            rating: currentRating,
            gamesPlayed: currentGamesPlayed,
            tier: tierInfo.name,
            tierEmoji: tierInfo.emoji,
            
            // 🎯 DELTA
            delta: {
              rating: ratingDelta,
              striche: sessionDelta.striche,
              games: sessionDelta.games,
              wins: sessionDelta.wins,
              losses: sessionDelta.losses,
              points: sessionDelta.points
            },
            
            // 🔢 CUMULATIVE
            cumulative: newCumulative,
            
            // 🔄 BACKWARDS COMPATIBILITY
            context: context
          };
          
          // Füge sessionId nur hinzu, wenn es einen Wert hat
          if (sessionId) {
            historyEntry.sessionId = sessionId;
          }
          
          // Füge tournamentId nur hinzu, wenn es einen Wert hat
          if (tournamentId) {
            historyEntry.tournamentId = tournamentId;
          }

          // Erstelle neuen Historie-Eintrag
          const historyRef = globalHistoryRef.doc();
          batch.set(historyRef, historyEntry);

          logger.info(`[RatingHistory] Queued snapshot for player ${playerId}: Rating ${previousRating} → ${currentRating} (Δ${ratingDelta.toFixed(2)}), Striche: ${sessionDelta.striche > 0 ? '+' : ''}${sessionDelta.striche}`, {
            tier: tierInfo.name,
            gamesPlayed: currentGamesPlayed,
            context,
            wins: sessionDelta.wins,
            losses: sessionDelta.losses
          });
        }
      } catch (playerError) {
        logger.error(`[RatingHistory] Error processing player ${playerId}:`, playerError);
      }
    }

    // Führe Batch-Operation aus
    await batch.commit();
    
    logger.info(`[RatingHistory] Successfully saved ${playerIds.length} rating snapshots for group ${groupId}`, {
      context,
      sessionId,
      tournamentId
    });
  } catch (error) {
    logger.error(`[RatingHistory] Error saving rating history snapshot:`, error);
    throw error;
  }
}

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
        // 🌍 NUR NOCH: GLOBALE Player-Daten lesen
        const playerRef = db.collection('players').doc(playerId);
        const playerDoc = await playerRef.get();

        if (!playerDoc.exists) {
          logger.warn(`[RatingHistory] Player not found for ${playerId}`);
          continue;
        }

        const currentRatingData = playerDoc.data();
        const currentRating = currentRatingData?.globalRating || 100; // ✅ KUMULATIVE GLOBAL RATING
        const currentGamesPlayed = currentRatingData?.gamesPlayed || 0;

        // Hole das letzte Historie-Entry für kumulative Werte und Rating-Delta
        const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
        const lastHistorySnap = await globalHistoryRef
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        let previousRating = 100; // Default Startrating
        let previousCumulative = {
          striche: 0,
          wins: 0,
          losses: 0,
          points: 0
        };
        
        if (!lastHistorySnap.empty) {
          const lastEntry = lastHistorySnap.docs[0].data() as RatingHistoryEntry;
          previousRating = lastEntry.rating;
          
          // Hole kumulative Werte aus letztem Snapshot (falls vorhanden)
          if (lastEntry.cumulative) {
            previousCumulative = lastEntry.cumulative;
          }
        }

        const ratingDelta = currentRating - previousRating;

        // 🆕 V2: Berechne Session-Deltas (nur bei session_end)
        let sessionDelta = {
          striche: 0,
          games: 0,
          wins: 0,
          losses: 0,
          points: 0
        };
        
        if (context === 'session_end' && sessionId) {
          sessionDelta = await calculateSessionDelta(groupId, sessionId, playerId);
        }

        // 🆕 V2: Berechne neue kumulative Werte
        const newCumulative = {
          striche: previousCumulative.striche + sessionDelta.striche,
          wins: previousCumulative.wins + sessionDelta.wins,
          losses: previousCumulative.losses + sessionDelta.losses,
          points: previousCumulative.points + sessionDelta.points
        };

        // Nur speichern wenn sich Rating geändert hat, Session-Delta vorhanden ist, oder es der erste Eintrag ist
        const hasChanges = ratingDelta !== 0 || 
                          sessionDelta.games > 0 || 
                          lastHistorySnap.empty || 
                          context === 'manual_recalc';

        if (hasChanges) {
          // Berechne Tier und Emoji
          const tierInfo = getRatingTier(currentRating);
          
          // 🆕 V2: Erstelle neuen Historie-Eintrag mit erweitertem Schema
          const historyEntry: any = {
            // 🔑 IDENTIFIERS
            createdAt: now,
            completedAt: now, // 🎯 WICHTIG: Für Charts verwenden wir completedAt
            playerId,
            groupId,
            
            // 🎮 EVENT CONTEXT
            eventType: context,
            eventId: sessionId || tournamentId || 'unknown',
            
            // 📊 SNAPSHOT
            rating: currentRating,
            gamesPlayed: currentGamesPlayed,
            tier: tierInfo.name,
            tierEmoji: tierInfo.emoji,
            
            // 🎯 DELTA
            delta: {
              rating: ratingDelta,
              striche: sessionDelta.striche,
              games: sessionDelta.games,
              wins: sessionDelta.wins,
              losses: sessionDelta.losses,
              points: sessionDelta.points
            },
            
            // 🔢 CUMULATIVE
            cumulative: newCumulative,
            
            // 🔄 BACKWARDS COMPATIBILITY
            context: context
          };
          
          // Füge sessionId nur hinzu, wenn es einen Wert hat
          if (sessionId) {
            historyEntry.sessionId = sessionId;
          }
          
          // Füge tournamentId nur hinzu, wenn es einen Wert hat
          if (tournamentId) {
            historyEntry.tournamentId = tournamentId;
          }

          // Nutze Timestamp als Document-ID für chronologische Sortierung
          const timestampId = now.toMillis().toString();
          
          // 🌍 NUR NOCH: GLOBALE Historie (für spieler-übergreifende Charts)
          const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`).doc(timestampId);
          batch.set(globalHistoryRef, historyEntry);
          
          snapshotsCreated++;

          logger.info(`[RatingHistory] Queued snapshot for player ${playerId}: Rating ${previousRating} → ${currentRating} (Δ${ratingDelta >= 0 ? '+' : ''}${ratingDelta}), Striche: ${sessionDelta.striche >= 0 ? '+' : ''}${sessionDelta.striche}`, {
            tier: tierInfo.name,
            gamesPlayed: currentGamesPlayed,
            context,
            wins: sessionDelta.wins,
            losses: sessionDelta.losses
          });
        } else {
          logger.debug(`[RatingHistory] Skipping snapshot for player ${playerId} - no changes (Rating: ${currentRating})`);
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
        // 🌍 NUR NOCH: GLOBALE Historie bereinigen
        const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
        
        // Hole alle Einträge chronologisch sortiert
        const allEntriesSnap = await globalHistoryRef
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
      logger.info(`[RatingHistory] Cleanup completed: deleted ${totalDeleted} old entries from global history`);
    }
  } catch (cleanupError) {
    logger.warn(`[RatingHistory] Cleanup failed for group ${groupId}:`, cleanupError);
    // Cleanup-Fehler sind nicht kritisch
  }
}

/**
 * 📊 Query-Funktion: Hole Rating-Historie für einen Spieler (NUR NOCH GLOBAL)
 */
export async function getRatingHistory(
  groupId: string,
  playerId: string,
  limit: number = 50
): Promise<RatingHistoryEntry[]> {
  try {
    // 🌍 NUR NOCH: GLOBALE Historie lesen
    const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
    const historySnap = await globalHistoryRef
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const history: RatingHistoryEntry[] = [];
    historySnap.forEach(doc => {
      history.push(doc.data() as RatingHistoryEntry);
    });

    return history;
  } catch (error) {
    logger.error(`[RatingHistory] Error fetching global history for player ${playerId}:`, error);
    return [];
  }
}

/**
 * 🌍 Query-Funktion: Hole GLOBALE Rating-Historie für einen Spieler (über alle Gruppen)
 */
export async function getGlobalRatingHistory(
  playerId: string,
  limit: number = 100
): Promise<RatingHistoryEntry[]> {
  try {
    const globalHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
    const historySnap = await globalHistoryRef
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const history: RatingHistoryEntry[] = [];
    historySnap.forEach(doc => {
      history.push(doc.data() as RatingHistoryEntry);
    });

    logger.info(`[RatingHistory] Loaded ${history.length} global history entries for player ${playerId}`);
    return history;
  } catch (error) {
    logger.error(`[RatingHistory] Error fetching global history for player ${playerId}:`, error);
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
