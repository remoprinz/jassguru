const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function analyzeRoundsDetail() {
  console.log('🔍 Analyzing detailed rounds data from June 26, 2025...');
  
  // Game IDs from previous analysis
  const gameIds = [
    'McwZp97kiOhAJXwhEFAh', // 19:15
    'b6WgosKliW94lXKnPIM7', // 20:21
    'zGrHNzF6EE05kKtnzu0b', // 21:26
    'e7O072Iy9vSHuO0cZZKF'  // 22:44
  ];
  
  const gameResults = [];
  
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
      
      // Analyze rounds in detail
      const roundsSnap = await gameRef.collection('rounds').orderBy('createdAt').get();
      console.log(`   Total rounds: ${roundsSnap.size}`);
      
      let totalScores = { bottom: 0, top: 0 };
      let totalStriche = { 
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      };
      
      let roundDetails = [];
      
      roundsSnap.docs.forEach((roundDoc, index) => {
        const roundData = roundDoc.data();
        
        console.log(`      Round ${index + 1}:`);
        console.log(`         Round ID: ${roundDoc.id}`);
        console.log(`         Round scores: ${JSON.stringify(roundData.roundScores)}`);
        console.log(`         Round striche: ${JSON.stringify(roundData.roundStriche)}`);
        console.log(`         Trump: ${roundData.trump}`);
        console.log(`         Winner: ${roundData.winnerTeamKey}`);
        
        // Add to totals
        if (roundData.roundScores) {
          totalScores.bottom += roundData.roundScores.bottom || 0;
          totalScores.top += roundData.roundScores.top || 0;
        }
        
        if (roundData.roundStriche) {
          const bottomStriche = roundData.roundStriche.bottom || {};
          const topStriche = roundData.roundStriche.top || {};
          
          Object.keys(totalStriche.bottom).forEach(key => {
            totalStriche.bottom[key] += bottomStriche[key] || 0;
            totalStriche.top[key] += topStriche[key] || 0;
          });
        }
        
        roundDetails.push({
          roundNumber: index + 1,
          roundId: roundDoc.id,
          scores: roundData.roundScores,
          striche: roundData.roundStriche,
          trump: roundData.trump,
          winner: roundData.winnerTeamKey
        });
      });
      
      console.log(`   Game totals:`);
      console.log(`      Scores: Bottom ${totalScores.bottom}, Top ${totalScores.top}`);
      console.log(`      Striche Bottom: ${JSON.stringify(totalStriche.bottom)}`);
      console.log(`      Striche Top: ${JSON.stringify(totalStriche.top)}`);
      
      // Calculate total striche
      const totalStricheBottom = Object.values(totalStriche.bottom).reduce((a, b) => a + b, 0);
      const totalStricheTop = Object.values(totalStriche.top).reduce((a, b) => a + b, 0);
      
      console.log(`      Total Striche: Bottom ${totalStricheBottom}, Top ${totalStricheTop}`);
      
      // Determine winner
      let gameWinner = 'unknown';
      if (totalStricheBottom > totalStricheTop) {
        gameWinner = 'bottom';
      } else if (totalStricheTop > totalStricheBottom) {
        gameWinner = 'top';
      }
      
      console.log(`      Game Winner: ${gameWinner}`);
      
      gameResults.push({
        gameId,
        gameNumber: i + 1,
        status: gameData.status,
        created: gameData.createdAt?.toDate(),
        totalScores,
        totalStriche,
        totalStricheBottom,
        totalStricheTop,
        gameWinner,
        roundDetails
      });
      
    } catch (error) {
      console.error(`   ❌ Error analyzing game ${gameId}:`, error);
    }
  }
  
  // Calculate overall totals
  console.log('\n📊 OVERALL TOTALS:');
  let overallTotalBottom = 0;
  let overallTotalTop = 0;
  let overallStricheBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
  let overallStricheTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
  
  gameResults.forEach((game, index) => {
    console.log(`   Game ${index + 1}: Bottom ${game.totalStricheBottom}, Top ${game.totalStricheTop} (Winner: ${game.gameWinner})`);
    
    overallTotalBottom += game.totalStricheBottom;
    overallTotalTop += game.totalStricheTop;
    
    Object.keys(overallStricheBottom).forEach(key => {
      overallStricheBottom[key] += game.totalStriche.bottom[key];
      overallStricheTop[key] += game.totalStriche.top[key];
    });
  });
  
  console.log(`\n🏆 FINAL RESULT:`);
  console.log(`   Total Striche: Bottom Team ${overallTotalBottom}, Top Team ${overallTotalTop}`);
  console.log(`   Bottom Team (Marc + Roger): ${JSON.stringify(overallStricheBottom)}`);
  console.log(`   Top Team (Claudia + Frank): ${JSON.stringify(overallStricheTop)}`);
  
  if (overallTotalTop === 9 && overallTotalBottom === 7) {
    console.log('   ✅ MATCHES EXPECTED: 9:7 for Claudia and Frank!');
  } else if (overallTotalBottom === 9 && overallTotalTop === 7) {
    console.log('   ✅ MATCHES EXPECTED: 9:7 for Marc and Roger!');
  } else {
    console.log(`   ⚠️  Result ${overallTotalTop}:${overallTotalBottom} does not match expected 9:7`);
  }
  
  // Check if we need to fix the 4th game
  const game4 = gameResults.find(g => g.gameNumber === 4);
  if (game4 && game4.status === 'live') {
    console.log('\n🔧 GAME 4 NEEDS TO BE COMPLETED:');
    console.log(`   Current status: ${game4.status}`);
    console.log(`   Current result: Bottom ${game4.totalStricheBottom}, Top ${game4.totalStricheTop}`);
    console.log(`   Expected final result based on statement: Claudia & Frank won with 2 Matsch + Berg + Sieg = 4 Striche`);
    
    // If the expected result is 9:7 for Claudia/Frank, and we have incomplete data
    if (overallTotalTop < 9 || overallTotalBottom < 7) {
      console.log('   🔧 Need to complete this game with correct final scores!');
    }
  }
  
  return gameResults;
}

analyzeRoundsDetail()
  .then((results) => {
    console.log('\n✅ Detailed rounds analysis completed');
    console.log(`📈 Analyzed ${results.length} games with detailed round data`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }); 