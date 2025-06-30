const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function createProperSessionStructure() {
  console.log('🔧 Creating proper session structure for June 26...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const gameIds = [
    'McwZp97kiOhAJXwhEFAh', // Game 1
    'b6WgosKliW94lXKnPIM7', // Game 2
    'zGrHNzF6EE05kKtnzu0b', // Game 3
    'e7O072Iy9vSHuO0cZZKF'  // Game 4
  ];
  
  // Player mappings
  const playerMappings = {
    '1': { name: 'Marc', id: '1sDvqN_kvqZLB-4eSZFqZ' },
    '2': { name: 'Claudia', id: 'xr0atZ7eLJgr7egkAfrE' },
    '3': { name: 'Roger', id: 'lW2UwWY80w3q8pyj4xufu' },
    '4': { name: 'Frank', id: 'F1uwdthL6zu7F0cYf1jbe' }
  };
  
  try {
    // 1. Delete existing jassGameSummary to start fresh
    console.log('\n1️⃣ Cleaning existing structure...');
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    
    // Delete all existing completedGames
    const existingGamesSnap = await summaryRef.collection('completedGames').get();
    for (const doc of existingGamesSnap.docs) {
      await doc.ref.delete();
      console.log(`   🗑️ Deleted existing completedGame: ${doc.id}`);
    }
    
    // 2. Collect data from all 4 games
    console.log('\n2️⃣ Collecting game data...');
    const gameData = [];
    let sessionStartTime = null;
    let sessionEndTime = null;
    
    for (let i = 0; i < gameIds.length; i++) {
      const gameRef = db.collection('activeGames').doc(gameIds[i]);
      const gameSnap = await gameRef.get();
      
      if (gameSnap.exists) {
        const data = gameSnap.data();
        gameData.push({
          gameNumber: i + 1,
          gameId: gameIds[i],
          data: data
        });
        
        // Track session times
        if (!sessionStartTime || (data.createdAt && data.createdAt.toMillis() < sessionStartTime.toMillis())) {
          sessionStartTime = data.createdAt;
        }
        
        if (!sessionEndTime || (data.lastUpdated && data.lastUpdated.toMillis() > sessionEndTime.toMillis())) {
          sessionEndTime = data.lastUpdated || data.completedAt;
        }
        
        console.log(`   ✅ Game ${i + 1}: ${Object.values(data.striche?.bottom || {}).reduce((a, b) => a + b, 0)} vs ${Object.values(data.striche?.top || {}).reduce((a, b) => a + b, 0)}`);
      }
    }
    
    // 3. Calculate aggregated data
    console.log('\n3️⃣ Calculating aggregated data...');
    
    // Final scores and striche
    let totalScoresBottom = 0, totalScoresTop = 0;
    let totalStricheBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    let totalStricheTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    // Game results array
    const gameResults = [];
    const gameWinsByTeam = { bottom: 0, top: 0 };
    
    gameData.forEach(game => {
      const bottomScore = game.data.scores?.bottom || 0;
      const topScore = game.data.scores?.top || 0;
      const bottomStriche = Object.values(game.data.striche?.bottom || {}).reduce((a, b) => a + b, 0);
      const topStriche = Object.values(game.data.striche?.top || {}).reduce((a, b) => a + b, 0);
      
      totalScoresBottom += bottomScore;
      totalScoresTop += topScore;
      
      // Aggregate striche
      Object.keys(totalStricheBottom).forEach(key => {
        totalStricheBottom[key] += game.data.striche?.bottom?.[key] || 0;
        totalStricheTop[key] += game.data.striche?.top?.[key] || 0;
      });
      
      // Game result
      const winnerTeam = bottomStriche > topStriche ? 'bottom' : 'top';
      gameWinsByTeam[winnerTeam]++;
      
      gameResults.push({
        gameNumber: game.gameNumber,
        bottomScore,
        topScore,
        winnerTeam
      });
    });
    
    // Game wins by player
    const gameWinsByPlayer = {};
    Object.values(playerMappings).forEach(player => {
      gameWinsByPlayer[player.id] = { wins: 0, losses: 0 };
    });
    
    gameResults.forEach(result => {
      const bottomPlayers = [playerMappings['1'].id, playerMappings['3'].id]; // Marc, Roger
      const topPlayers = [playerMappings['2'].id, playerMappings['4'].id]; // Claudia, Frank
      
      if (result.winnerTeam === 'bottom') {
        bottomPlayers.forEach(playerId => gameWinsByPlayer[playerId].wins++);
        topPlayers.forEach(playerId => gameWinsByPlayer[playerId].losses++);
      } else {
        topPlayers.forEach(playerId => gameWinsByPlayer[playerId].wins++);
        bottomPlayers.forEach(playerId => gameWinsByPlayer[playerId].losses++);
      }
    });
    
    // Calculate total striche counts
    const totalStricheBottomCount = Object.values(totalStricheBottom).reduce((a, b) => a + b, 0);
    const totalStricheTopCount = Object.values(totalStricheTop).reduce((a, b) => a + b, 0);
    
    // 4. Create main jassGameSummary document
    console.log('\n4️⃣ Creating main document...');
    
    const jassGameSummary = {
      // Basic info
      sessionId: sessionId,
      status: 'completed',
      startedAt: sessionStartTime,
      endedAt: sessionEndTime,
      lastActivity: sessionEndTime,
      lastCompletedGameUpdate: sessionEndTime,
      gamesPlayed: 4,
      totalRounds: 51, // Estimated based on 12+10+12+17
      
      // Group and players
      groupId: 'Tz0wgIHMTlhvTtFastiJ',
      participantPlayerIds: [
        playerMappings['1'].id, // Marc
        playerMappings['2'].id, // Claudia  
        playerMappings['3'].id, // Roger
        playerMappings['4'].id  // Frank
      ],
      playerNames: {
        '1': 'Marc',
        '2': 'Claudia',
        '3': 'Roger', 
        '4': 'Frank'
      },
      
      // Teams structure
      teams: {
        bottom: {
          players: [
            { displayName: 'Marc', playerId: playerMappings['1'].id },
            { displayName: 'Roger', playerId: playerMappings['3'].id }
          ]
        },
        top: {
          players: [
            { displayName: 'Claudia', playerId: playerMappings['2'].id },
            { displayName: 'Frank', playerId: playerMappings['4'].id }
          ]
        }
      },
      
      // Final results
      finalScores: {
        bottom: totalScoresBottom,
        top: totalScoresTop
      },
      finalStriche: {
        bottom: totalStricheBottom,
        top: totalStricheTop
      },
      winnerTeamKey: totalStricheTopCount > totalStricheBottomCount ? 'top' : 'bottom',
      
      // Game statistics
      gameResults: gameResults,
      gameWinsByTeam: gameWinsByTeam,
      gameWinsByPlayer: gameWinsByPlayer,
      
      // Event counts (same as finalStriche for this data)
      eventCounts: {
        bottom: totalStricheBottom,
        top: totalStricheTop
      },
      
      // Minimal aggregated data (would normally come from rounds analysis)
      aggregatedRoundDurationsByPlayer: {},
      aggregatedTrumpfCountsByPlayer: {},
      sessionTotalWeisPoints: { bottom: 0, top: 0 },
      weisPoints: { bottom: 0, top: 0 },
      
      // Duration
      durationSeconds: sessionEndTime && sessionStartTime ? 
        Math.floor((sessionEndTime.toMillis() - sessionStartTime.toMillis()) / 1000) : 0,
      
      // Pairing identifiers
      pairingIdentifiers: {
        bottom: `${playerMappings['1'].id}_${playerMappings['3'].id}`,
        top: `${playerMappings['2'].id}_${playerMappings['4'].id}`
      }
    };
    
    // Save main document
    await summaryRef.set(jassGameSummary);
    console.log('   ✅ Main document created');
    
    // 5. Create numbered completedGames (1, 2, 3, 4)
    console.log('\n5️⃣ Creating numbered completedGames...');
    
    for (let i = 0; i < gameData.length; i++) {
      const game = gameData[i];
      const gameNumber = (i + 1).toString();
      
      const completedGame = {
        gameNumber: i + 1,
        gameId: game.gameId,
        sessionId: sessionId,
        groupId: 'Tz0wgIHMTlhvTtFastiJ',
        
        // Scores and results
        finalScores: {
          bottom: game.data.scores?.bottom || 0,
          top: game.data.scores?.top || 0
        },
        finalStriche: game.data.striche,
        
        // Winner
        winnerTeamKey: Object.values(game.data.striche?.bottom || {}).reduce((a, b) => a + b, 0) > 
                      Object.values(game.data.striche?.top || {}).reduce((a, b) => a + b, 0) ? 'bottom' : 'top',
        
        // Times
        createdAt: game.data.createdAt,
        completedAt: game.data.completedAt || game.data.lastUpdated,
        
        // Players
        playerNames: game.data.playerNames,
        participantPlayerIds: [
          playerMappings['1'].id,
          playerMappings['2'].id,
          playerMappings['3'].id,
          playerMappings['4'].id
        ],
        
        // Game-specific data
        currentRound: game.data.currentRound || 0,
        status: 'completed'
      };
      
      // Save with numeric ID
      await summaryRef.collection('completedGames').doc(gameNumber).set(completedGame);
      console.log(`   ✅ Game ${gameNumber} created`);
    }
    
    // 6. Final verification
    console.log('\n6️⃣ Final verification...');
    console.log(`   📊 Final result: ${totalStricheTopCount}:${totalStricheBottomCount}`);
    console.log(`   🏆 Winner: ${totalStricheTopCount > totalStricheBottomCount ? 'Claudia + Frank' : 'Marc + Roger'}`);
    console.log(`   🎮 Games: ${gameResults.length}`);
    console.log(`   ⏱️ Duration: ${jassGameSummary.durationSeconds} seconds`);
    
    return {
      sessionId,
      result: `${totalStricheTopCount}:${totalStricheBottomCount}`,
      winner: totalStricheTopCount > totalStricheBottomCount ? 'top' : 'bottom',
      isComplete: true
    };
    
  } catch (error) {
    console.error('❌ Error creating proper structure:', error);
    throw error;
  }
}

createProperSessionStructure()
  .then((result) => {
    console.log('\n🎉 Proper session structure created!');
    console.log(`   ✅ Session: ${result.sessionId}`);
    console.log(`   📊 Result: ${result.result}`);
    console.log(`   🏆 Winner: ${result.winner} team`);
    console.log('\n🚀 Session should now appear in archive and trigger statistics!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to create proper structure:', error);
    process.exit(1);
  }); 