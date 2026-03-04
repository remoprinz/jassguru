/**
 * 🚀 EXECUTABLE SCRIPT: Führt removeParticipantUidsFromCompletedGames aus
 * 
 * Usage: node functions/scripts/runRemoveParticipantUids.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Lade Service Account Key (relativ zum Script)
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

// Initialisiere Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function removeParticipantUidsFromCompletedGames() {
  console.log('🚀 START: Entferne participantUids aus allen completedGames...\n');
  
  try {
    // 1. Hole alle Groups
    const groupsSnap = await db.collection('groups').get();
    console.log(`📊 Found ${groupsSnap.size} groups\n`);
    
    let totalSummariesProcessed = 0;
    let totalGamesProcessed = 0;
    let totalGamesUpdated = 0;
    
    // 2. Für jede Gruppe
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      console.log(`📁 Processing group: ${groupId}`);
      
      // 3. Hole alle jassGameSummaries dieser Gruppe
      const summariesSnap = await db
        .collection(`groups/${groupId}/jassGameSummaries`)
        .get();
      
      console.log(`   Found ${summariesSnap.size} sessions in group ${groupId}`);
      
      // 4. Für jede Session
      for (const summaryDoc of summariesSnap.docs) {
        const sessionId = summaryDoc.id;
        
        totalSummariesProcessed++;
        
        // 5. Hole completedGames Subcollection
        const completedGamesSnap = await db
          .collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
          .get();
        
        if (completedGamesSnap.empty) {
          continue;
        }
        
        // 6. Erstelle Batch für diese Session
        const batch = db.batch();
        let gamesInBatch = 0;
        
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
          }
        }
        
        // Commit Batch für diese Session
        if (gamesInBatch > 0) {
          await batch.commit();
        }
      }
      
      console.log(`   ✅ Group ${groupId} complete`);
    }
    
    // 7. Zusammenfassung
    console.log('\n═══════════════════════════════════════');
    console.log('📊 ZUSAMMENFASSUNG:');
    console.log('═══════════════════════════════════════');
    console.log(`   Groups processed: ${groupsSnap.size}`);
    console.log(`   Sessions processed: ${totalSummariesProcessed}`);
    console.log(`   Games scanned: ${totalGamesProcessed}`);
    console.log(`   Games updated: ${totalGamesUpdated}`);
    console.log('═══════════════════════════════════════\n');
    
    console.log('✅ SUCCESS: participantUids entfernt aus allen completedGames!\n');
    
    return {
      groupsProcessed: groupsSnap.size,
      sessionsProcessed: totalSummariesProcessed,
      gamesProcessed: totalGamesProcessed,
      gamesUpdated: totalGamesUpdated
    };
    
  } catch (error) {
    console.error('❌ ERROR beim Entfernen von participantUids:', error);
    throw error;
  }
}

// Führe aus
removeParticipantUidsFromCompletedGames()
  .then(result => {
    console.log('✅ Script completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

