const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function analyzeGameDetails() {
  console.log('🔍 Analyzing detailed game data from June 26, 2025...');
  
  // Game IDs from previous analysis
  const gameIds = [
    'McwZp97kiOhAJXwhEFAh', // 19:15
    'b6WgosKliW94lXKnPIM7', // 20:21
    'zGrHNzF6EE05kKtnzu0b', // 21:26
    'e7O072Iy9vSHuO0cZZKF'  // 22:44
  ];
  
  let totalBottom = 0;
  let totalTop = 0;
  let totalStricheBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
  let totalStricheTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
  
  for (let i = 0; i < gameIds.length; i++) {
    const gameId = gameIds[i];
    console.log(`\n${i + 1}️⃣ Analyzing Game ${i + 1}: ${gameId}`);
    
    try {
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameSnap = await gameRef.get();
      
      if (!gameSnap.exists) {
        console.log(`   ❌ Game not found`);
        continue;
      }
      
      const gameData = gameSnap.data();
      
      console.log(`   Status: ${gameData.status}`);
      console.log(`   Created: ${gameData.createdAt?.toDate()}`);
      console.log(`   Players: ${JSON.stringify(gameData.playerNames)}`);
      
      // Analyze current scores
      if (gameData.currentScores) {
        console.log(`   Current Scores: ${JSON.stringify(gameData.currentScores)}`);
      }
      
      // Analyze final scores
      if (gameData.finalScores) {
        console.log(`   Final Scores: ${JSON.stringify(gameData.finalScores)}`);
        totalBottom += gameData.finalScores.bottom || 0;
        totalTop += gameData.finalScores.top || 0;
      } else {
        console.log(`   ⚠️  No final scores available`);
      }
      
      // Analyze Striche
      if (gameData.finalStriche) {
        console.log(`   Final Striche: ${JSON.stringify(gameData.finalStriche)}`);
        
        // Add to totals
        const bottomStriche = gameData.finalStriche.bottom || {};
        const topStriche = gameData.finalStriche.top || {};
        
        Object.keys(totalStricheBottom).forEach(key => {
          totalStricheBottom[key] += bottomStriche[key] || 0;
          totalStricheTop[key] += topStriche[key] || 0;
        });
      } else {
        console.log(`   ⚠️  No final Striche available`);
      }
      
      // Analyze rounds if available
      const roundsSnap = await gameRef.collection('rounds').get();
      console.log(`   Rounds: ${roundsSnap.size}`);
      
      if (roundsSnap.size > 0) {
        let roundScores = { bottom: 0, top: 0 };
        roundsSnap.docs.forEach(roundDoc => {
          const roundData = roundDoc.data();
          if (roundData.roundScores) {
            roundScores.bottom += roundData.roundScores.bottom || 0;
            roundScores.top += roundData.roundScores.top || 0;
          }
        });
        console.log(`   Calculated from rounds: Bottom ${roundScores.bottom}, Top ${roundScores.top}`);
      }
      
      // Check if game is completed
      if (gameData.status === 'live') {
        console.log(`   🔴 Game is still LIVE - needs to be completed!`);
        
        // Show current state
        if (gameData.currentScores) {
          console.log(`   Current state: ${JSON.stringify(gameData.currentScores)}`);
        }
        
        if (gameData.currentStriche) {
          console.log(`   Current Striche: ${JSON.stringify(gameData.currentStriche)}`);
        }
      }
      
    } catch (error) {
      console.error(`   ❌ Error analyzing game ${gameId}:`, error);
    }
  }
  
  console.log('\n📊 TOTAL SUMMARY:');
  console.log(`   Total Scores: Bottom ${totalBottom}, Top ${totalTop}`);
  console.log(`   Expected: 9:7 for Claudia and Frank`);
  
  console.log('\n🎯 Total Striche:');
  console.log(`   Bottom Team (Marc + Roger): ${JSON.stringify(totalStricheBottom)}`);
  console.log(`   Top Team (Claudia + Frank): ${JSON.stringify(totalStricheTop)}`);
  
  // Calculate total Striche
  const totalStricheBottomSum = Object.values(totalStricheBottom).reduce((a, b) => a + b, 0);
  const totalStricheTopSum = Object.values(totalStricheTop).reduce((a, b) => a + b, 0);
  
  console.log(`   Bottom Team Total: ${totalStricheBottomSum} Striche`);
  console.log(`   Top Team Total: ${totalStricheTopSum} Striche`);
  
  // Team assignments
  console.log('\n👥 Team Assignments:');
  console.log(`   Team 1 (Bottom): Marc + Roger`);
  console.log(`   Team 2 (Top): Claudia + Frank`);
  
  if (totalStricheTopSum === 9 && totalStricheBottomSum === 7) {
    console.log('   ✅ Matches expected result: 9:7 for Claudia and Frank!');
  } else if (totalStricheBottomSum === 9 && totalStricheTopSum === 7) {
    console.log('   ✅ Matches expected result: 9:7 for Marc and Roger!');
  } else {
    console.log(`   ⚠️  Result ${totalStricheTopSum}:${totalStricheBottomSum} does not match expected 9:7`);
  }
  
  // Check session
  console.log('\n📋 Session Analysis:');
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  
  if (sessionSnap.exists) {
    const sessionData = sessionSnap.data();
    console.log(`   Session ${sessionId}:`);
    console.log(`   Status: ${sessionData.status}`);
    console.log(`   Created: ${sessionData.createdAt?.toDate()}`);
    console.log(`   Participants: ${JSON.stringify(sessionData.participantPlayerIds)}`);
    
    const completedGamesSnap = await sessionRef.collection('completedGames').get();
    console.log(`   Completed games in session: ${completedGamesSnap.size}`);
  }
  
}

analyzeGameDetails()
  .then(() => {
    console.log('\n✅ Detailed analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }); 