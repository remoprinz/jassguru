import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

interface MigrateRoundDurationsData {
  groupId?: string; // Optional: Nur eine Gruppe migrieren
  dryRun?: boolean; // Test-Modus: Keine Änderungen schreiben
}

interface RoundDurationsByPlayer {
  [playerId: string]: {
    totalDuration: number;
    roundCount: number;
    roundDurations: number[]; // ← NEU!
  };
}

/**
 * 🔧 MIGRATION: Berechnet roundDurations für alle bestehenden Sessions
 * 
 * Diese Funktion:
 * 1. Lädt alle completed Sessions (ohne tournamentId)
 * 2. Geht in jedes completedGame
 * 3. Berechnet Rundenzeiten aus timestamps
 * 4. Speichert roundDurations Array in aggregatedRoundDurationsByPlayer
 */
export const migrateRoundDurations = onCall<MigrateRoundDurationsData>(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (request: CallableRequest<MigrateRoundDurationsData>) => {
    logger.info("--- migrateRoundDurations START ---", { data: request.data });

    // Admin-Check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
    }

    const { groupId, dryRun = false } = request.data;

    try {
      let sessionsToMigrate: admin.firestore.QueryDocumentSnapshot[] = [];

      if (groupId) {
        // Nur Sessions einer Gruppe
        logger.info(`Migrating sessions for group: ${groupId}`);
        const groupSessionsSnap = await db
          .collection(`groups/${groupId}/jassGameSummaries`)
          .where("status", "==", "completed")
          .get();
        
        sessionsToMigrate = groupSessionsSnap.docs.filter(
          doc => !doc.data().tournamentId // Keine Turniere
        );
      } else {
        // Alle Gruppen
        logger.info("Migrating sessions for ALL groups");
        const groupsSnap = await db.collection("groups").get();
        
        for (const groupDoc of groupsSnap.docs) {
          const groupSessionsSnap = await db
            .collection(`groups/${groupDoc.id}/jassGameSummaries`)
            .where("status", "==", "completed")
            .get();
          
          const regularSessions = groupSessionsSnap.docs.filter(
            doc => !doc.data().tournamentId
          );
          
          sessionsToMigrate.push(...regularSessions);
        }
      }

      logger.info(`Found ${sessionsToMigrate.length} sessions to migrate`);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;
      const errors: { sessionId: string; error: string }[] = [];

      // Verarbeite jede Session
      for (const sessionDoc of sessionsToMigrate) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;

        try {
          // Prüfe ob bereits migriert
          if (
            sessionData.aggregatedRoundDurationsByPlayer &&
            Object.values(sessionData.aggregatedRoundDurationsByPlayer).some(
              (playerData: any) => Array.isArray(playerData.roundDurations)
            )
          ) {
            logger.info(`Session ${sessionId} already migrated, skipping`);
            skipCount++;
            continue;
          }

          // Prüfe ob participantUids vorhanden
          if (!sessionData.participantUids || !Array.isArray(sessionData.participantUids)) {
            logger.warn(`Session ${sessionId} has no participantUids, skipping`);
            skipCount++;
            continue;
          }

          // Erstelle Player Number → Player ID Mapping
          const playerNumberToIdMap = new Map<number, string>();
          sessionData.participantUids.forEach((uid: string, index: number) => {
            playerNumberToIdMap.set(index + 1, uid); // 1-basiert
          });

          // Sammle Rundenzeiten pro Spieler
          const roundDurationsByPlayer = new Map<string, number[]>();
          sessionData.participantUids.forEach((uid: string) => {
            roundDurationsByPlayer.set(uid, []);
          });

          // Lade completedGames
          const completedGamesSnap = await sessionDoc.ref
            .collection("completedGames")
            .get();

          if (completedGamesSnap.empty) {
            logger.warn(`Session ${sessionId} has no completedGames, skipping`);
            skipCount++;
            continue;
          }

          // Verarbeite jedes Spiel
          for (const gameDoc of completedGamesSnap.docs) {
            const gameData = gameDoc.data();

            if (!gameData.roundHistory || !Array.isArray(gameData.roundHistory)) {
              continue;
            }

            const rounds = gameData.roundHistory;
            let previousTimestamp: number | null = null;

            // Verarbeite jede Runde
            for (let i = 0; i < rounds.length; i++) {
              const round = rounds[i];
              const currentTimestamp = round.timestamp;
              const startingPlayer = round.startingPlayer;

              if (
                previousTimestamp &&
                currentTimestamp &&
                currentTimestamp > previousTimestamp &&
                typeof startingPlayer === "number"
              ) {
                const roundDuration = currentTimestamp - previousTimestamp;

                // Filter: 2min <= duration < 15min
                if (roundDuration >= 120000 && roundDuration < 900000) {
                  const playerId = playerNumberToIdMap.get(startingPlayer);

                  if (playerId && roundDurationsByPlayer.has(playerId)) {
                    roundDurationsByPlayer.get(playerId)!.push(roundDuration);
                  }
                }
              }

              previousTimestamp = currentTimestamp;
            }
          }

          // Erstelle neue aggregatedRoundDurationsByPlayer Struktur
          const newAggregatedData: RoundDurationsByPlayer = {};

          roundDurationsByPlayer.forEach((durations, playerId) => {
            if (durations.length > 0) {
              const totalDuration = durations.reduce((sum, d) => sum + d, 0);
              newAggregatedData[playerId] = {
                totalDuration,
                roundCount: durations.length,
                roundDurations: durations, // ← NEU!
              };
            }
          });

          // Speichere nur wenn Daten vorhanden
          if (Object.keys(newAggregatedData).length > 0) {
            if (!dryRun) {
              await sessionDoc.ref.update({
                aggregatedRoundDurationsByPlayer: newAggregatedData,
                _roundDurationsMigrated: true,
                _roundDurationsMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            logger.info(
              `✅ Session ${sessionId}: Migrated ${Object.keys(newAggregatedData).length} players, ${Object.values(newAggregatedData).reduce((sum, p) => sum + p.roundCount, 0)} rounds total`
            );
            successCount++;
          } else {
            logger.warn(`Session ${sessionId} has no round durations, skipping`);
            skipCount++;
          }
        } catch (sessionError) {
          logger.error(`❌ Error migrating session ${sessionId}:`, sessionError);
          errors.push({
            sessionId,
            error: sessionError instanceof Error ? sessionError.message : String(sessionError),
          });
          errorCount++;
        }
      }

      const summary = {
        totalSessions: sessionsToMigrate.length,
        successCount,
        skipCount,
        errorCount,
        dryRun,
        errors: errors.slice(0, 10), // Nur erste 10 Fehler
      };

      logger.info("--- migrateRoundDurations COMPLETE ---", summary);

      return {
        success: true,
        message: `Migration ${dryRun ? "(DRY RUN) " : ""}completed: ${successCount} sessions migrated, ${skipCount} skipped, ${errorCount} errors`,
        ...summary,
      };
    } catch (error) {
      logger.error("--- migrateRoundDurations CRITICAL ERROR ---", error);
      throw new HttpsError(
        "internal",
        `Migration fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);

