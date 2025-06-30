const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function showFullCompletedGameContent() {
  console.log('🔍 Showing FULL content of completedGames/1...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
  
  try {
    const completedGame1Ref = summaryRef.collection('completedGames').doc('1');
    const completedGame1Snap = await completedGame1Ref.get();
    
    if (completedGame1Snap.exists) {
      const data = completedGame1Snap.data();
      
      console.log('\n📋 COMPLETE DATA in completedGames/1:');
      console.log(JSON.stringify(data, null, 2));
      
      // Check specific important fields
      console.log('\n🔍 KEY FIELDS CHECK:');
      console.log(`activeFarbeSettings:`, data.activeFarbeSettings);
      console.log(`activeScoreSettings:`, data.activeScoreSettings);
      console.log(`activeStrokeSettings:`, data.activeStrokeSettings);
      console.log(`teams:`, data.teams);
      console.log(`currentRound:`, data.currentRound);
      console.log(`scores:`, data.scores);
      console.log(`striche:`, data.striche);
      
      // Check if rounds subcollection exists
      const roundsSnap = await completedGame1Ref.collection('rounds').get();
      console.log(`\n📋 Rounds subcollection: ${roundsSnap.size} documents`);
      
      if (roundsSnap.size > 0) {
        console.log('   Sample round IDs:', roundsSnap.docs.slice(0, 3).map(d => d.id));
      }
      
    } else {
      console.log('❌ completedGames/1 does not exist!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

showFullCompletedGameContent()
  .then(() => {
    console.log('\n✅ Full content display completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  }); 