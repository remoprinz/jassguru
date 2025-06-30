const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function debugCompletedGamesContent() {
  console.log('🔍 Debugging completedGames content vs activeGames...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
  
  try {
    // 1. Check what's actually in completedGames/1
    console.log('\n1️⃣ Checking completedGames/1 content:');
    const completedGame1Ref = summaryRef.collection('completedGames').doc('1');
    const completedGame1Snap = await completedGame1Ref.get();
    
    if (completedGame1Snap.exists) {
      const data = completedGame1Snap.data();
      console.log('   📋 Fields in completedGames/1:', Object.keys(data));
      console.log('   📊 Data size:', JSON.stringify(data).length, 'characters');
    } else {
      console.log('   ❌ completedGames/1 does not exist!');
    }
    
    // 2. Check what's in the corresponding activeGame
    console.log('\n2️⃣ Checking activeGame McwZp97kiOhAJXwhEFAh content:');
    const activeGameRef = db.collection('activeGames').doc('McwZp97kiOhAJXwhEFAh');
    const activeGameSnap = await activeGameRef.get();
    
    if (activeGameSnap.exists) {
      const data = activeGameSnap.data();
      console.log('   📋 Fields in activeGame:', Object.keys(data));
      console.log('   📊 Data size:', JSON.stringify(data).length, 'characters');
      
      // Show some key fields that should be there
      console.log('\n   🔍 Key fields check:');
      console.log(`      activeFarbeSettings: ${data.activeFarbeSettings ? 'EXISTS' : 'MISSING'}`);
      console.log(`      activeScoreSettings: ${data.activeScoreSettings ? 'EXISTS' : 'MISSING'}`);
      console.log(`      activeStrokeSettings: ${data.activeStrokeSettings ? 'EXISTS' : 'MISSING'}`);
      console.log(`      teams: ${data.teams ? 'EXISTS' : 'MISSING'}`);
      console.log(`      playerNames: ${data.playerNames ? 'EXISTS' : 'MISSING'}`);
      console.log(`      currentRound: ${data.currentRound}`);
      console.log(`      status: ${data.status}`);
      console.log(`      scores: ${JSON.stringify(data.scores)}`);
      console.log(`      striche: ${JSON.stringify(data.striche)}`);
      
    } else {
      console.log('   ❌ ActiveGame does not exist!');
    }
    
    // 3. Compare field counts
    if (completedGame1Snap.exists && activeGameSnap.exists) {
      const completedFields = Object.keys(completedGame1Snap.data()).length;
      const activeFields = Object.keys(activeGameSnap.data()).length;
      
      console.log('\n3️⃣ Comparison:');
      console.log(`   📊 CompletedGame fields: ${completedFields}`);
      console.log(`   📊 ActiveGame fields: ${activeFields}`);
      console.log(`   ${completedFields === activeFields ? '✅' : '❌'} Fields match: ${completedFields === activeFields}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugCompletedGamesContent()
  .then(() => {
    console.log('\n✅ Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }); 