import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * Nächtliche Batch-Aktualisierung von Gruppenstatistiken für große Gruppen
 * Läuft täglich um 02:00 Uhr (Schweizer Zeit)
 */
export const batchUpdateGroupStats = onSchedule(
  {
    schedule: "0 2 * * *", // Täglich um 02:00 Uhr
    timeZone: "Europe/Zurich",
    region: "europe-west1",
    timeoutSeconds: 3600, // 1 Stunde Timeout für große Gruppen
    memory: "2GiB",
  },
  async (event) => {
    logger.info("--- batchUpdateGroupStats START ---");

    try {
      // Finde alle Gruppen, die eine Statistik-Aktualisierung benötigen
      const groupsNeedingUpdate = await db.collection('groups')
        .where('needsStatsRecalculation', '==', true)
        .limit(50) // Maximal 50 Gruppen pro Batch
        .get();

      if (groupsNeedingUpdate.empty) {
        logger.info("No groups need stats recalculation. Batch job completed.");
        return;
      }

      logger.info(`Found ${groupsNeedingUpdate.docs.length} groups needing stats recalculation`);

      const updatePromises = groupsNeedingUpdate.docs.map(async (groupDoc) => {
        const groupId = groupDoc.id;
        
        try {
          logger.info(`Processing batch stats update for group ${groupId}`);
          
          // Importiere Statistik-Berechnung
          const groupStatsModule = await import('./groupStatsCalculator');
          await groupStatsModule.updateGroupComputedStatsAfterSession(groupId);
          
          // Aktualisiere Gruppe-Flag
          await groupDoc.ref.update({
            needsStatsRecalculation: false, // Flag zurücksetzen
            lastBatchUpdate: admin.firestore.Timestamp.now()
          });
          
          logger.info(`Batch stats update completed for group ${groupId}`);
          return { groupId, status: 'success' };
        } catch (error) {
          logger.error(`Batch stats update failed for group ${groupId}:`, error);
          
          // Markiere Fehler, aber setze Flag nicht zurück für Retry
          await groupDoc.ref.update({
            lastBatchUpdateError: error instanceof Error ? error.message : String(error),
            lastBatchUpdateAttempt: admin.firestore.Timestamp.now()
          });
          
          return { groupId, status: 'error', error: error instanceof Error ? error.message : String(error) };
        }
      });

      // Warte auf alle Updates
      const results = await Promise.allSettled(updatePromises);
      
      // Sammle Ergebnisse
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length;
      
      logger.info(`--- batchUpdateGroupStats COMPLETED ---`);
      logger.info(`Successful updates: ${successful}`);
      logger.info(`Failed updates: ${failed}`);
      
      // Optional: Sende Monitoring-Metriken oder Benachrichtigungen bei Fehlern
      if (failed > 0) {
        logger.warn(`${failed} group stats updates failed. Check individual group logs for details.`);
      }
    } catch (error) {
      logger.error("--- batchUpdateGroupStats CRITICAL ERROR ---", error);
      throw error;
    }
  }
);

/**
 * Manuelle Trigger-Funktion für Batch-Updates (für Admin-Zwecke)
 */
export const triggerBatchUpdateGroupStats = onSchedule(
  {
    schedule: "0 0 1 1 *", // Läuft nie automatisch (1. Januar um 00:00)
    timeZone: "Europe/Zurich",
    region: "europe-west1",
    timeoutSeconds: 3600,
    memory: "2GiB",
  },
  async (event) => {
    // Diese Funktion kann manuell über die Firebase Console getriggert werden
    logger.info("Manual batch update triggered");
    
    // Führe die gleiche Logik wie die automatische Batch-Funktion aus
    // Aber ohne Limit, um alle Gruppen zu verarbeiten
    const allGroupsNeedingUpdate = await db.collection('groups')
      .where('needsStatsRecalculation', '==', true)
      .get();
    
    logger.info(`Manual batch processing ${allGroupsNeedingUpdate.docs.length} groups`);
    
    // Verarbeite in Batches von 10 für bessere Performance
    const batchSize = 10;
    for (let i = 0; i < allGroupsNeedingUpdate.docs.length; i += batchSize) {
      const batch = allGroupsNeedingUpdate.docs.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (groupDoc) => {
        const groupId = groupDoc.id;
        
        try {
          const groupStatsModule = await import('./groupStatsCalculator');
          await groupStatsModule.updateGroupComputedStatsAfterSession(groupId);
          
          await groupDoc.ref.update({
            needsStatsRecalculation: false,
            lastManualBatchUpdate: admin.firestore.Timestamp.now()
          });
          
          logger.info(`Manual batch update completed for group ${groupId}`);
        } catch (error) {
          logger.error(`Manual batch update failed for group ${groupId}:`, error);
        }
      });
      
      await Promise.allSettled(batchPromises);
      
      // Kurze Pause zwischen Batches
      if (i + batchSize < allGroupsNeedingUpdate.docs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.info("Manual batch update completed");
  }
); 