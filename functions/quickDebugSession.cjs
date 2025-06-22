const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function debugSession() {
  const targetSessionId = '83fBU_l0Rcok3a_DRt0-Z';
  
  console.log(`🔍 Debugging session ${targetSessionId}...`);
  
  try {
    // 1. Check sessions collection
    console.log('\n📋 Checking sessions collection...');
    const sessionRef = db.collection('sessions').doc(targetSessionId);
    const sessionSnap = await sessionRef.get();
    
    if (sessionSnap.exists) {
      const sessionData = sessionSnap.data();
      console.log('✅ Session found in sessions collection');
      console.log(`   Status: ${sessionData.status}`);
      console.log(`   Created: ${sessionData.createdAt?.toDate?.()}`);
      console.log(`   Started: ${sessionData.startedAt?.toDate?.()}`);
      console.log(`   Last updated: ${sessionData.lastUpdated?.toDate?.()}`);
      console.log(`   Participant Player IDs: ${JSON.stringify(sessionData.participantPlayerIds)}`);
      
      // Check completedGames in sessions
      const completedGamesSnap = await sessionRef.collection('completedGames').get();
      console.log(`   CompletedGames in sessions: ${completedGamesSnap.size}`);
      if (completedGamesSnap.size > 0) {
        completedGamesSnap.docs.forEach(doc => {
          const gameData = doc.data();
          console.log(`     Game ${gameData.gameNumber}: ${JSON.stringify(gameData.finalScores)}`);
        });
      }
    } else {
      console.log('❌ Session NOT found in sessions collection');
    }
    
    // 2. Check jassGameSummaries collection
    console.log('\n📋 Checking jassGameSummaries collection...');
    const summaryRef = db.collection('jassGameSummaries').doc(targetSessionId);
    const summarySnap = await summaryRef.get();
    
    if (summarySnap.exists) {
      const summaryData = summarySnap.data();
      console.log('✅ Session found in jassGameSummaries collection');
      console.log(`   Status: ${summaryData.status}`);
      console.log(`   Games played: ${summaryData.gamesPlayed}`);
      console.log(`   Winner: ${summaryData.winnerTeamKey}`);
      console.log(`   Created: ${summaryData.createdAt?.toDate?.()}`);
      console.log(`   Started: ${summaryData.startedAt?.toDate?.()}`);
      console.log(`   Ended: ${summaryData.endedAt?.toDate?.()}`);
      
      // Check completedGames in jassGameSummaries
      const completedGamesSnap = await summaryRef.collection('completedGames').get();
      console.log(`   CompletedGames in jassGameSummaries: ${completedGamesSnap.size}`);
      if (completedGamesSnap.size > 0) {
        completedGamesSnap.docs.forEach(doc => {
          const gameData = doc.data();
          console.log(`     Game ${gameData.gameNumber}: ${JSON.stringify(gameData.finalScores)}`);
        });
      }
    } else {
      console.log('❌ Session NOT found in jassGameSummaries collection');
    }
    
    // 3. Check all sessions for debugging
    console.log('\n📋 Listing all sessions...');
    const allSessionsSnap = await db.collection('sessions').get();
    console.log(`Total sessions in collection: ${allSessionsSnap.size}`);
    
    for (const sessionDoc of allSessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
      
      if (completedGamesSnap.size > 0) {
        console.log(`Session ${sessionDoc.id}: ${completedGamesSnap.size} completed games (status: ${sessionData.status})`);
        if (sessionData.participantPlayerIds && sessionData.participantPlayerIds.includes('xr0atZ7eLJgr7egkAfrE')) {
          console.log(`  → Contains Claudia's ID! Participant IDs: ${JSON.stringify(sessionData.participantPlayerIds)}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugSession()
  .then(() => {
    console.log('\n✅ Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }); 