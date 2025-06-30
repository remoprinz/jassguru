const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function completeJune26Session() {
  console.log('🔧 Completing June 26, 2025 session...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const game4Id = 'e7O072Iy9vSHuO0cZZKF';
  
  try {
    // 1. Complete Game 4 - Add Berg + Sieg for Claudia/Frank (Top team)
    console.log('\n1️⃣ Completing Game 4...');
    const game4Ref = db.collection('activeGames').doc(game4Id);
    const game4Snap = await game4Ref.get();
    
    if (!game4Snap.exists) {
      throw new Error('Game 4 not found');
    }
    
    const game4Data = game4Snap.data();
    console.log('   Current Game 4 striche:', JSON.stringify(game4Data.striche));
    
    // Update striche: Add Berg + Sieg for top team (Claudia + Frank)
    const updatedStriche = {
      ...game4Data.striche,
      top: {
        ...game4Data.striche.top,
        berg: 1,  // Add Berg
        sieg: 1   // Add Sieg
      }
    };
    
    console.log('   Updated striche:', JSON.stringify(updatedStriche));
    
    // Calculate final scores for game 4
    const finalScores = {
      bottom: game4Data.scores?.bottom || 0,
      top: game4Data.scores?.top || 0
    };
    
    // Update game 4 to completed
    await game4Ref.update({
      status: 'completed',
      striche: updatedStriche,
      finalScores: finalScores,
      finalStriche: updatedStriche,
      completedAt: Timestamp.now(),
      lastUpdated: Timestamp.now()
    });
    
    console.log('   ✅ Game 4 completed with Berg + Sieg for Claudia/Frank');
    
    // 2. Calculate total results for all 4 games
    console.log('\n2️⃣ Calculating session totals...');
    
    const gameIds = [
      'McwZp97kiOhAJXwhEFAh', // Game 1
      'b6WgosKliW94lXKnPIM7', // Game 2
      'zGrHNzF6EE05kKtnzu0b', // Game 3
      'e7O072Iy9vSHuO0cZZKF'  // Game 4
    ];
    
    let totalStricheBottom = 0;
    let totalStricheTop = 0;
    let totalScoresBottom = 0;
    let totalScoresTop = 0;
    const completedGames = [];
    
    for (let i = 0; i < gameIds.length; i++) {
      const gameRef = db.collection('activeGames').doc(gameIds[i]);
      const gameSnap = await gameRef.get();
      
      if (gameSnap.exists) {
        const gameData = gameSnap.data();
        
        // Calculate game striche
        const gameStricheBottom = Object.values(gameData.striche?.bottom || {}).reduce((a, b) => a + b, 0);
        const gameStricheTop = Object.values(gameData.striche?.top || {}).reduce((a, b) => a + b, 0);
        
        totalStricheBottom += gameStricheBottom;
        totalStricheTop += gameStricheTop;
        
        totalScoresBottom += gameData.scores?.bottom || 0;
        totalScoresTop += gameData.scores?.top || 0;
        
        // Prepare completed game data
        completedGames.push({
          gameNumber: i + 1,
          gameId: gameIds[i],
          finalScores: {
            bottom: gameData.scores?.bottom || 0,
            top: gameData.scores?.top || 0
          },
          finalStriche: gameData.striche,
          winnerTeamKey: gameStricheTop > gameStricheBottom ? 'top' : 'bottom',
          completedAt: gameData.completedAt || Timestamp.now(),
          playerNames: gameData.playerNames
        });
        
        console.log(`   Game ${i + 1}: Bottom ${gameStricheBottom}, Top ${gameStricheTop}`);
      }
    }
    
    console.log(`   Session totals: Bottom ${totalStricheBottom}, Top ${totalStricheTop}`);
    console.log(`   Winner: ${totalStricheTop > totalStricheBottom ? 'Top Team (Claudia + Frank)' : 'Bottom Team (Marc + Roger)'}`);
    
    // 3. Update session to completed
    console.log('\n3️⃣ Updating session status...');
    const sessionRef = db.collection('sessions').doc(sessionId);
    
    await sessionRef.update({
      status: 'completed',
      endedAt: Timestamp.now(),
      gamesPlayed: 4,
      winnerTeamKey: totalStricheTop > totalStricheBottom ? 'top' : 'bottom',
      finalScores: {
        bottom: totalStricheBottom,
        top: totalStricheTop
      },
      finalStriche: {
        bottom: totalStricheBottom,
        top: totalStricheTop
      },
      lastUpdated: Timestamp.now()
    });
    
    // Add completed games to session
    for (const game of completedGames) {
      await sessionRef.collection('completedGames').doc(game.gameId).set(game);
    }
    
    console.log('   ✅ Session updated to completed');
    
    // 4. Create jassGameSummary
    console.log('\n4️⃣ Creating jassGameSummary...');
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data();
    
    const jassGameSummary = {
      id: sessionId,
      status: 'completed',
      createdAt: sessionData.createdAt || Timestamp.now(),
      startedAt: sessionData.startedAt || sessionData.createdAt || Timestamp.now(),
      endedAt: Timestamp.now(),
      gamesPlayed: 4,
      participantPlayerIds: sessionData.participantPlayerIds || [],
      playerNames: {
        '1': 'Marc',
        '2': 'Claudia', 
        '3': 'Roger',
        '4': 'Frank'
      },
      finalScores: {
        bottom: totalStricheBottom,
        top: totalStricheTop
      },
      finalStriche: {
        bottom: {
          berg: 1,    // From game 1
          sieg: 4,    // Game 1: 2, Game 2: 2
          matsch: 2,  // From game 2
          schneider: 0,
          kontermatsch: 0
        },
        top: {
          berg: 2,    // Game 3: 1, Game 4: 1
          sieg: 3,    // Game 3: 2, Game 4: 1
          matsch: 3,  // Game 3: 1, Game 4: 2
          schneider: 0,
          kontermatsch: 0
        }
      },
      winnerTeamKey: totalStricheTop > totalStricheBottom ? 'top' : 'bottom',
      teams: {
        bottom: ['Marc', 'Roger'],
        top: ['Claudia', 'Frank']
      },
      groupId: sessionData.groupId,
      sessionId: sessionId
    };
    
    await db.collection('jassGameSummaries').doc(sessionId).set(jassGameSummary);
    
    // Add completed games to jassGameSummary as well
    for (const game of completedGames) {
      await db.collection('jassGameSummaries').doc(sessionId).collection('completedGames').doc(game.gameId).set(game);
    }
    
    console.log('   ✅ jassGameSummary created');
    
    // 5. Verify results
    console.log('\n5️⃣ Verification:');
    console.log(`   ✅ Final Result: ${totalStricheTop}:${totalStricheBottom} for Claudia/Frank:Marc/Roger`);
    
    if (totalStricheTop === 9 && totalStricheBottom === 7) {
      console.log('   🎉 SUCCESS: Matches expected 9:7 for Claudia and Frank!');
    } else {
      console.log(`   ⚠️  Result ${totalStricheTop}:${totalStricheBottom} - verify if this is correct`);
    }
    
    console.log('\n📋 Session Summary:');
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Status: completed`);  
    console.log(`   Games: 4`);
    console.log(`   Winner: ${totalStricheTop > totalStricheBottom ? 'Claudia + Frank' : 'Marc + Roger'}`);
    console.log(`   Final Striche: ${totalStricheTop}:${totalStricheBottom}`);
    
  } catch (error) {
    console.error('❌ Error completing session:', error);
    throw error;
  }
}

completeJune26Session()
  .then(() => {
    console.log('\n🎉 June 26 session completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to complete session:', error);
    process.exit(1);
  }); 