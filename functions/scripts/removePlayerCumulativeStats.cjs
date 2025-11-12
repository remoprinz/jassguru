const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

// ✅ Initialize Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://jassguru-8c8d8.firebaseio.com`
});

const db = admin.firestore();

/**
 * Entfernt playerCumulativeStats aus ALLEN jassGameSummaries in ALLEN Gruppen
 */
async function removePlayerCumulativeStatsFromAllGroups() {
  console.log('🧹 Starte Cleanup von playerCumulativeStats aus jassGameSummaries...\n');
  
  const groupsSnap = await db.collection('groups').get();
  const groupIds = groupsSnap.docs.map(doc => doc.id);
  
  console.log(`📊 Gefunden: ${groupIds.length} Gruppen\n`);
  
  let totalSessionsProcessed = 0;
  let totalSessionsUpdated = 0;
  let totalErrors = 0;
  
  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing group ${i + 1}/${groupIds.length}: ${groupId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      const sessionsSnap = await db
        .collection(`groups/${groupId}/jassGameSummaries`)
        .get();
      
      console.log(`Found ${sessionsSnap.size} sessions`);
      
      if (sessionsSnap.empty) {
        console.log('No sessions to process');
        continue;
      }
      
      for (const sessionDoc of sessionsSnap.docs) {
        const sessionData = sessionDoc.data();
        totalSessionsProcessed++;
        
        // Check ob playerCumulativeStats existiert
        if (sessionData.playerCumulativeStats) {
          console.log(`  Removing playerCumulativeStats from session ${sessionDoc.id}`);
          
          await db
            .collection(`groups/${groupId}/jassGameSummaries`)
            .doc(sessionDoc.id)
            .update({
              playerCumulativeStats: admin.firestore.FieldValue.delete()
            });
          
          totalSessionsUpdated++;
        }
      }
      
      console.log(`✅ Group ${groupId} completed`);
      
    } catch (error) {
      totalErrors++;
      console.error(`❌ Error processing group ${groupId}:`, error.message || error);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 CLEANUP SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Total Sessions Processed: ${totalSessionsProcessed}`);
  console.log(`✅ Total Sessions Updated: ${totalSessionsUpdated}`);
  console.log(`❌ Total Errors: ${totalErrors}`);
  console.log(`${'='.repeat(60)}\n`);
}

async function main() {
  try {
    await removePlayerCumulativeStatsFromAllGroups();
    console.log('🎉 Cleanup erfolgreich abgeschlossen!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

main();
