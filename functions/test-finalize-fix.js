const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function testParticipantPlayerIdsResolution() {
  console.log('🔍 Testing participantPlayerIds resolution...');
  
  try {
    // Test: Finde eine Session mit participantUids aber ohne participantPlayerIds
    const sessionsQuery = await db.collection('jassGameSummaries')
      .where('status', '==', 'completed')
      .limit(5)
      .get();
    
    console.log(`Found ${sessionsQuery.docs.length} completed sessions to analyze...`);
    
    for (const sessionDoc of sessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      console.log(`\n📊 Session: ${sessionDoc.id}`);
      console.log(`participantUids: ${sessionData.participantUids?.length || 0} entries`);
      console.log(`participantPlayerIds: ${sessionData.participantPlayerIds?.length || 0} entries`);
      
      if (sessionData.participantUids && !sessionData.participantPlayerIds) {
        console.log('❌ Missing participantPlayerIds! This session needs fixing.');
        
        // Test die resolvePlayerDocIdsFromUids Funktion
        const resolvedPlayerIds = await resolvePlayerDocIdsFromUids(sessionData.participantUids);
        console.log(`✅ Resolved ${resolvedPlayerIds.length} player document IDs:`);
        console.log(resolvedPlayerIds);
        
        // Optional: Aktualisiere die Session (VORSICHTIG!)
        // await sessionDoc.ref.update({ participantPlayerIds: resolvedPlayerIds });
        // console.log('✅ Updated session with participantPlayerIds');
      }
    }
    
    console.log('\n✅ Analysis complete!');
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

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
          console.warn(`No player document found for Auth UID: ${uid}`);
          return null;
        }
      } catch (error) {
        console.error(`Error resolving player for UID ${uid}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(playerPromises);
    return results.filter((id) => id !== null);
  } catch (error) {
    console.error('Error resolving player document IDs:', error);
    return [];
  }
}

// Führe den Test aus
testParticipantPlayerIdsResolution()
  .then(() => {
    console.log('🎉 Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  }); 