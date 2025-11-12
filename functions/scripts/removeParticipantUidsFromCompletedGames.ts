/**
 * 🔧 CLEANUP SCRIPT: Entfernt participantUids aus allen completedGames
 * 
 * Problem: participantUids (alte Firebase Auth UIDs) sollten nicht mehr
 * in den Daten gespeichert werden. participantPlayerIds (Player Document IDs)
 * ist die neue Single Source of Truth.
 * 
 * Dieses Script entfernt participantUids aus ALLEN completedGames Subcollections
 * in allen jassGameSummaries in allen Groups.
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

async function removeParticipantUidsFromCompletedGames() {
  logger.info('🚀 START: Entferne participantUids aus allen completedGames...');
  
  try {
    // 1. Hole alle Groups
    const groupsSnap = await db.collection('groups').get();
    logger.info(`📊 Found ${groupsSnap.size} groups`);
    
    let totalSummariesProcessed = 0;
    let totalGamesProcessed = 0;
    let totalGamesUpdated = 0;
    
    // 2. Für jede Gruppe
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      logger.info(`\n📁 Processing group: ${groupId}`);
      
      // 3. Hole alle jassGameSummaries dieser Gruppe
      const summariesSnap = await db
        .collection(`groups/${groupId}/jassGameSummaries`)
        .get();
      
      logger.info(`   Found ${summariesSnap.size} sessions in group ${groupId}`);
      
      // 4. Für jede Session
      for (const summaryDoc of summariesSnap.docs) {
        const sessionId = summaryDoc.id;
        
        totalSummariesProcessed++;
        
        // 5. Hole completedGames Subcollection
        const completedGamesSnap = await db
          .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
          .get();
        
        if (completedGamesSnap.empty) {
          logger.info(`   Session ${sessionId}: No completedGames found`);
          continue;
        }
        
        logger.info(`   Session ${sessionId}: Processing ${completedGamesSnap.size} games`);
        
        // 6. Erstelle Batch für diese Session
        const batch = db.batch();
        let gamesInBatch = 0;
        const maxBatchSize = 500; // Firestore Batch-Limit
        
        for (const gameDoc of completedGamesSnap.docs) {
          totalGamesProcessed++;
          const gameData = gameDoc.data();
          
          // Prüfe ob participantUids existiert
          if (gameData.participantUids !== undefined) {
            // Entferne participantUids
            const gameRef = gameDoc.ref;
            batch.update(gameRef, {
              participantUids: admin.firestore.FieldValue.delete()
            });
            
            gamesInBatch++;
            totalGamesUpdated++;
            
            // Commit wenn Batch voll
            if (gamesInBatch >= maxBatchSize) {
              await batch.commit();
              logger.info(`   ✅ Committed batch of ${gamesInBatch} games`);
              
              // Neuer Batch
              gamesInBatch = 0;
            }
          }
        }
        
        // Commit verbleibende Updates
        if (gamesInBatch > 0) {
          await batch.commit();
          logger.info(`   ✅ Committed batch of ${gamesInBatch} games`);
        }
        
        logger.info(`   ✅ Session ${sessionId}: Cleaned up completedGames`);
      }
    }
    
    // 7. Zusammenfassung
    logger.info('\n📊 ZUSAMMENFASSUNG:');
    logger.info(`   Groups processed: ${groupsSnap.size}`);
    logger.info(`   Sessions processed: ${totalSummariesProcessed}`);
    logger.info(`   Games scanned: ${totalGamesProcessed}`);
    logger.info(`   Games updated: ${totalGamesUpdated}`);
    
    logger.info('\n✅ SUCCESS: participantUids entfernt aus allen completedGames!');
    
    return {
      groupsProcessed: groupsSnap.size,
      sessionsProcessed: totalSummariesProcessed,
      gamesProcessed: totalGamesProcessed,
      gamesUpdated: totalGamesUpdated
    };
    
  } catch (error) {
    logger.error('❌ ERROR beim Entfernen von participantUids:', error);
    throw error;
  }
}

// Nur ausführen wenn direkt aufgerufen
if (require.main === module) {
  // Service Account Key wird automatisch geladen
  // (Funktioniert wenn als Cloud Function deployed)
  
  removeParticipantUidsFromCompletedGames()
    .then(result => {
      console.log('✅ Script completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

// Export für möglichen Import
export { removeParticipantUidsFromCompletedGames };

