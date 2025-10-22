import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 🔧 MASTER FIX FUNCTION
 * 
 * Repariert fehlende ratingHistory Einträge und aktualisiert Chart-Daten
 * für eine spezifische Session oder alle Sessions nach einem bestimmten Datum
 */
export const masterFix = onCall({ region: "europe-west1" }, async (request) => {
  logger.info('🔧 Master Fix Function started', { data: request.data });
  
  const { groupId, sessionId, fixAllAfterDate } = request.data;
  
  if (!groupId) {
    throw new Error('groupId is required');
  }
  
  try {
    let sessionsToFix: string[] = [];
    
    if (sessionId) {
      // Spezifische Session reparieren
      sessionsToFix = [sessionId];
      logger.info(`🎯 Fixing specific session: ${sessionId}`);
    } else if (fixAllAfterDate) {
      // Alle Sessions nach einem bestimmten Datum reparieren
      const afterDate = new Date(fixAllAfterDate);
      logger.info(`📅 Fixing all sessions after: ${afterDate.toISOString()}`);
      
      const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .where('endedAt', '>=', admin.firestore.Timestamp.fromDate(afterDate))
        .orderBy('endedAt', 'asc');
      
      const sessionsSnap = await sessionsRef.get();
      sessionsToFix = sessionsSnap.docs.map(doc => doc.id);
      
      logger.info(`📊 Found ${sessionsToFix.length} sessions to fix`);
    } else {
      throw new Error('Either sessionId or fixAllAfterDate must be provided');
    }
    
    let fixedCount = 0;
    let errorCount = 0;
    
    // Repariere jede Session
    for (const currentSessionId of sessionsToFix) {
      try {
        logger.info(`🔧 Fixing session: ${currentSessionId}`);
        
        // 1. Hole Session-Daten
        const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${currentSessionId}`);
        const summarySnap = await summaryRef.get();
        
        if (!summarySnap.exists) {
          logger.warn(`⚠️ Session ${currentSessionId} not found, skipping`);
          continue;
        }
        
        const summary = summarySnap.data();
        const participantPlayerIds = summary?.participantPlayerIds || [];
        
        if (participantPlayerIds.length === 0) {
          logger.warn(`⚠️ No participants found for session ${currentSessionId}, skipping`);
          continue;
        }
        
        // 2. Prüfe, ob ratingHistory Einträge fehlen
        let needsFix = false;
        for (const playerId of participantPlayerIds) {
          const historyRef = db.collection(`players/${playerId}/ratingHistory`);
          const historySnap = await historyRef
            .where('sessionId', '==', currentSessionId)
            .limit(1)
            .get();
          
          if (historySnap.empty) {
            needsFix = true;
            break;
          }
        }
        
        if (!needsFix) {
          logger.info(`✅ Session ${currentSessionId} already has ratingHistory entries, skipping`);
          continue;
        }
        
        // 3. Importiere und führe updateEloForSession aus
        const { updateEloForSession } = await import('./jassEloUpdater');
        await updateEloForSession(groupId, currentSessionId);
        
        // 4. Importiere und führe saveRatingHistorySnapshot aus
        const { saveRatingHistorySnapshot } = await import('./ratingHistoryService');
        await saveRatingHistorySnapshot(
          groupId,
          currentSessionId,
          participantPlayerIds,
          'session_end'
        );
        
        logger.info(`✅ Successfully fixed session: ${currentSessionId}`);
        fixedCount++;
      } catch (sessionError) {
        logger.error(`❌ Failed to fix session ${currentSessionId}:`, sessionError);
        errorCount++;
      }
    }
    
    // 5. Aktualisiere Chart-Daten für die Gruppe
    if (fixedCount > 0) {
      logger.info(`📊 Chart data is now read directly from jassGameSummaries - no separate chartData needed`);
    }
    
    const result = {
      success: true,
      groupId,
      sessionsProcessed: sessionsToFix.length,
      sessionsFixed: fixedCount,
      sessionsErrored: errorCount,
      message: `Fixed ${fixedCount} sessions, ${errorCount} errors`
    };
    
    logger.info('🔧 Master Fix Function completed', result);
    return result;
  } catch (error) {
    logger.error('💥 Master Fix Function failed:', error);
    throw error;
  }
});
