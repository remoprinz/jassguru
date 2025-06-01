import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler"; 
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { google } from "googleapis";

const db = admin.firestore();

const CLEANUP_THRESHOLD_HOURS = 72; // 3 Tage
const BATCH_SIZE = 400; // Sicherheitshalber etwas unter dem 500er Limit

/**
 * Geplante Cloud Function für automatisches Firestore-Backup.
 * Läuft jeden Freitag um 4:00 Uhr und exportiert alle Firestore-Daten.
 */
export const scheduledFirestoreBackup = onSchedule({
    schedule: '0 4 * * 5', // Jeden Freitag um 4:00 Uhr
    timeZone: 'Europe/Zurich',
    region: "europe-west1",
    memory: '512MiB',
    timeoutSeconds: 540, // 9 Minuten Timeout
  }, async (event: ScheduledEvent) => {
    logger.info(`Starting scheduled Firestore backup (Schedule Time: ${event.scheduleTime})...`);

    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    if (!projectId) {
      logger.error('Project ID not found in environment variables');
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const bucket = `gs://jassguru-firestore-backups/backup-${dateStr}`;
    
    try {
      const firestore = google.firestore('v1');
      
      await firestore.projects.databases.exportDocuments({
        name: `projects/${projectId}/databases/(default)`,
        requestBody: {
          outputUriPrefix: bucket,
        },
      });
      
      logger.info(`Firestore backup successfully started. Output: ${bucket}`);
    } catch (error) {
      logger.error('Error during Firestore backup:', error);
      throw error;
    }
});

/**
 * Geplante Cloud Function für Datenbereinigung.
 * Läuft jeden Dienstag um 4:00 Uhr und löscht alte activeGames und Sessions.
 */
export const cleanupOldData = onSchedule({
    schedule: '0 4 * * 2', // Jeden Dienstag um 4:00 Uhr (Montag auf Dienstag)
    timeZone: 'Europe/Zurich',
    region: "europe-west1",
    memory: '512MiB',
    timeoutSeconds: 540, // 9 Minuten Timeout
  }, async (event: ScheduledEvent) => {
    logger.info(`Starting scheduled cleanup task (Threshold: ${CLEANUP_THRESHOLD_HOURS} hours, Schedule Time: ${event.scheduleTime})...`);

    const now = admin.firestore.Timestamp.now();
    const cutoffMillis = now.toMillis() - (CLEANUP_THRESHOLD_HOURS * 60 * 60 * 1000);
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoffMillis);

    let totalDeletedCount = 0;

    try {
        // --- Bereinigung: activeGames --- 
        logger.info(`Querying activeGames older than ${cutoffTimestamp.toDate().toISOString()}...`);
        const activeGamesQuery = db.collection('activeGames')
                                   .where('lastUpdated', '<', cutoffTimestamp);
        totalDeletedCount += await deleteQueryBatch(activeGamesQuery, BATCH_SIZE, 'activeGames');

        // --- Bereinigung: sessions (NEU hinzugefügt) ---
        logger.info(`Querying sessions older than ${cutoffTimestamp.toDate().toISOString()}...`);
        const sessionsQuery = db.collection('sessions')
                                .where('lastActivity', '<', cutoffTimestamp);
        totalDeletedCount += await deleteQueryBatch(sessionsQuery, BATCH_SIZE, 'sessions');

        // --- Bereinigung: jassGameSummaries (nicht abgeschlossen) ---
        logger.info(`Querying non-completed jassGameSummaries older than ${cutoffTimestamp.toDate().toISOString()}...`);
        const summariesQuery = db.collection('jassGameSummaries')
                                 .where('status', 'not-in', ['completed', 'completed_empty'])
                                 .where('updatedAt', '<', cutoffTimestamp);
         totalDeletedCount += await deleteQueryBatch(summariesQuery, BATCH_SIZE, 'jassGameSummaries (non-completed)');

        logger.info(`Scheduled cleanup finished. Total documents deleted: ${totalDeletedCount}.`);
    } catch (error) {
        logger.error('Error during scheduled cleanup task:', error);
    }
});

/**
 * Helper function to delete documents from a query in batches.
 * @param query The Firestore query identifying documents to delete.
 * @param batchSize The number of documents to delete per batch.
 * @param collectionName A descriptive name for logging.
 * @returns The total number of documents deleted.
 */
async function deleteQueryBatch(query: admin.firestore.Query, batchSize: number, collectionName: string): Promise<number> {
    const snapshot = await query.get();
    let deletedCount = 0;

    if (snapshot.empty) {
        logger.info(`No documents to delete in ${collectionName}.`);
        return 0;
    }

    logger.info(`Found ${snapshot.size} documents to delete in ${collectionName}. Processing in batches of ${batchSize}...`);
    const batches: admin.firestore.WriteBatch[] = [];
    batches.push(db.batch());
    let operationCounter = 0;
    let batchIndex = 0;

    snapshot.docs.forEach(doc => {
        batches[batchIndex].delete(doc.ref);
        operationCounter++;
        deletedCount++;

        if (operationCounter === batchSize) {
            batches.push(db.batch());
            batchIndex++;
            operationCounter = 0;
        }
    });

    logger.info(`Executing ${batches.length} delete batches for ${collectionName}.`);
    try {
        await Promise.all(batches.map(batch => batch.commit()));
        logger.info(`Successfully deleted ${deletedCount} documents from ${collectionName}.`);
    } catch (error) {
        logger.error(`Error committing delete batches for ${collectionName}:`, error);
        return 0; 
    }
    return deletedCount;
} 