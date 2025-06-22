const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function resolvePlayerDocIdsFromUids(participantUids) {
  try {
    const playerPromises = participantUids.map(async (uid) => {
      try {
        // Suche Player Document mit dieser Auth UID
        const playersQuery = await db.collection('players')
          .where('userId', '==', uid)
          .limit(1)
          .get();
          
        if (!playersQuery.empty) {
          return playersQuery.docs[0].id; // Player Document ID
        } else {
          console.warn(`⚠️  No player document found for Auth UID: ${uid}`);
          return null;
        }
      } catch (error) {
        console.error(`❌ Error resolving player for UID ${uid}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(playerPromises);
    return results.filter((id) => id !== null);
  } catch (error) {
    console.error('❌ Error resolving player document IDs:', error);
    return [];
  }
}

async function fixMissingParticipantPlayerIds() {
  console.log('🔧 Starting to fix missing participantPlayerIds in sessions...\n');
  
  try {
    // Finde alle completed Sessions
    const sessionsQuery = await db.collection('jassGameSummaries')
      .where('status', '==', 'completed')
      .get();
    
    console.log(`🔍 Found ${sessionsQuery.docs.length} completed sessions to analyze...`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const sessionDoc of sessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      
      // Prüfe ob participantPlayerIds fehlt oder leer ist
      const hasParticipantUids = sessionData.participantUids && sessionData.participantUids.length > 0;
      const hasParticipantPlayerIds = sessionData.participantPlayerIds && sessionData.participantPlayerIds.length > 0;
      
      if (hasParticipantUids && !hasParticipantPlayerIds) {
        console.log(`\n🔧 Fixing Session: ${sessionDoc.id}`);
        console.log(`   participantUids: ${sessionData.participantUids.length} entries`);
        
        try {
          // Resolve Player Document IDs
          const resolvedPlayerIds = await resolvePlayerDocIdsFromUids(sessionData.participantUids);
          
          if (resolvedPlayerIds.length === sessionData.participantUids.length) {
            // Update Session mit participantPlayerIds
            await sessionDoc.ref.update({ 
              participantPlayerIds: resolvedPlayerIds,
              fixedAt: admin.firestore.Timestamp.now(),
              fixedBy: 'fix-missing-participant-player-ids-script'
            });
            
            console.log(`   ✅ Fixed: Added ${resolvedPlayerIds.length} participantPlayerIds`);
            console.log(`   PlayerIDs: ${resolvedPlayerIds.join(', ')}`);
            fixedCount++;
          } else {
            console.log(`   ⚠️  Skipped: Could only resolve ${resolvedPlayerIds.length}/${sessionData.participantUids.length} player IDs`);
            skippedCount++;
          }
        } catch (error) {
          console.error(`   ❌ Error fixing session ${sessionDoc.id}:`, error);
          errorCount++;
        }
      } else if (hasParticipantPlayerIds) {
        // Session hat bereits participantPlayerIds
        skippedCount++;
      } else {
        console.log(`\n⚠️  Session ${sessionDoc.id} has no participantUids - skipping`);
        skippedCount++;
      }
    }
    
    console.log('\n🎉 Fix completed!');
    console.log(`   ✅ Fixed sessions: ${fixedCount}`);
    console.log(`   ⏭️  Skipped sessions: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (fixedCount > 0) {
      console.log('\n🔄 Recommendation: Run group statistics recalculation to update stats with the fixed data.');
    }
    
  } catch (error) {
    console.error('❌ Critical error during fix:', error);
  }
}

// Sicherheitsabfrage
async function confirmFix() {
  console.log('⚠️  This script will modify existing session data in Firebase.');
  console.log('⚠️  It will add missing participantPlayerIds to completed sessions.');
  console.log('⚠️  This is a one-time fix to solve the statistics calculation issue.\n');
  
  // In produktiven Umgebungen könnte hier eine Bestätigung erforderlich sein
  console.log('🚀 Starting fix process...\n');
  
  await fixMissingParticipantPlayerIds();
}

// Führe das Fix aus
confirmFix()
  .then(() => {
    console.log('\n🎉 Fix script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fix script failed:', error);
    process.exit(1);
  }); 