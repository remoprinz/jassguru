const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function analyzeActualData() {
  console.log('🔍 Analyzing actual game data from June 26, 2025...');
  
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
      
      // Get current game totals from main document
      if (gameData.scores) {
        console.log(`   Current scores: ${JSON.stringify(gameData.scores)}`);
      }
      
      if (gameData.striche) {
        console.log(`   Current striche: ${JSON.stringify(gameData.striche)}`);
      }
      
      // Analyze rounds in detail with correct structure
      const roundsSnap = await gameRef.collection('rounds').get();
      console.log(`   Total rounds: ${roundsSnap.size}`);
      
      let totalScores = { bottom: 0, top: 0 };
      let totalStriche = { 
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      };
      
      // Get the final state from the game document (should be most up-to-date)
      if (gameData.scores) {
        totalScores = { ...gameData.scores };
      }
      
      if (gameData.striche) {
        // Structure might be different, let's check
        console.log(`   Striche structure: ${JSON.stringify(gameData.striche)}`);
        
        // Try to parse striche structure
        if (gameData.striche.bottom && gameData.striche.top) {
          totalStriche = { ...gameData.striche };
        } else {
          // Maybe it's stored differently
          console.log(`   Need to parse striche differently`);
        }
      }
      
      // Calculate total striche from the parsed structure
      let totalStricheBottom = 0;
      let totalStricheTop = 0;
      
      if (totalStriche.bottom && typeof totalStriche.bottom === 'object') {
        totalStricheBottom = Object.values(totalStriche.bottom).reduce((a, b) => a + b, 0);
      }
      
      if (totalStriche.top && typeof totalStriche.top === 'object') {
        totalStricheTop = Object.values(totalStriche.top).reduce((a, b) => a + b, 0);
      }
      
      console.log(`   Game totals:`);
      console.log(`      Scores: Bottom ${totalScores.bottom || 0}, Top ${totalScores.top || 0}`);
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
        currentGameState: {
          scores: gameData.scores,
          striche: gameData.striche,
          currentRound: gameData.currentRound,
          lastUpdated: gameData.lastUpdated?.toDate()
        }
      });
      
    } catch (error) {
      console.error(`   ❌ Error analyzing game ${gameId}:`, error);
    }
  }
  
  // Calculate overall totals
  console.log('\n📊 OVERALL TOTALS:');
  let overallTotalBottom = 0;
  let overallTotalTop = 0;
  
  gameResults.forEach((game, index) => {
    console.log(`   Game ${index + 1}: Bottom ${game.totalStricheBottom}, Top ${game.totalStricheTop} (Winner: ${game.gameWinner}, Status: ${game.status})`);
    
    overallTotalBottom += game.totalStricheBottom;
    overallTotalTop += game.totalStricheTop;
  });
  
  console.log(`\n🏆 CURRENT RESULT:`);
  console.log(`   Total Striche: Bottom Team ${overallTotalBottom}, Top Team ${overallTotalTop}`);
  console.log(`   Bottom Team (Marc + Roger): ${overallTotalBottom} Striche`);
  console.log(`   Top Team (Claudia + Frank): ${overallTotalTop} Striche`);
  console.log(`   Expected final: 9:7 for Claudia and Frank`);
  
  // Show what needs to be done for game 4
  const game4 = gameResults.find(g => g.gameNumber === 4);
  if (game4) {
    console.log('\n🔧 GAME 4 STATUS:');
    console.log(`   Status: ${game4.status}`);
    console.log(`   Current Striche: Bottom ${game4.totalStricheBottom}, Top ${game4.totalStricheTop}`);
    
    if (game4.status === 'live') {
      const neededTop = 9 - (overallTotalTop - game4.totalStricheTop);
      console.log(`   🎯 Needs to add ${neededTop} more Striche for Claudia/Frank (Berg + Sieg = 2)`);
      console.log(`   Current game 4 state:`, game4.currentGameState);
    }
  }
  
  return gameResults;
}

analyzeActualData()
  .then((results) => {
    console.log('\n✅ Actual data analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }); 