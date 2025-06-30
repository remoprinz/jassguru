const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function fixSessionStructure() {
  console.log('🔧 Fixing June 26 session structure...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const gameIds = [
    'McwZp97kiOhAJXwhEFAh', // Game 1
    'b6WgosKliW94lXKnPIM7', // Game 2
    'zGrHNzF6EE05kKtnzu0b', // Game 3
    'e7O072Iy9vSHuO0cZZKF'  // Game 4
  ];
  
  try {
    // 1. Fix Game 4 team striche inconsistency
    console.log('\n1️⃣ Fixing Game 4 team striche...');
    const game4Ref = db.collection('activeGames').doc('e7O072Iy9vSHuO0cZZKF');
    
    await game4Ref.update({
      'teams.top.striche': {
        berg: 1,
        sieg: 1,
        matsch: 2,
        schneider: 0,
        kontermatsch: 0,
        total: 4
      },
      'teams.bottom.striche': {
        berg: 0,
        sieg: 0,
        matsch: 0,
        schneider: 0,
        kontermatsch: 0,
        total: 0
      }
    });
    
    console.log('   ✅ Game 4 team striche fixed');
    
    // 2. Clean up wrong completedGames in jassGameSummaries
    console.log('\n2️⃣ Cleaning up completedGames in jassGameSummaries...');
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    
    // Delete wrong numeric subcollection documents
    const wrongDocs = ['1', '2', '3'];
    for (const docId of wrongDocs) {
      try {
        await summaryRef.collection('completedGames').doc(docId).delete();
        console.log(`   🗑️ Deleted wrong document: ${docId}`);
      } catch (error) {
        console.log(`   ⚠️  Could not delete ${docId}: ${error.message}`);
      }
    }
    
    // 3. Create proper completedGames with correct structure
    console.log('\n3️⃣ Creating proper completedGames...');
    
    for (let i = 0; i < gameIds.length; i++) {
      const gameId = gameIds[i];
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameSnap = await gameRef.get();
      
      if (gameSnap.exists) {
        const gameData = gameSnap.data();
        
        // Calculate striche for this game
        const gameStricheBottom = Object.values(gameData.striche?.bottom || {}).reduce((a, b) => a + b, 0);
        const gameStricheTop = Object.values(gameData.striche?.top || {}).reduce((a, b) => a + b, 0);
        
        const completedGame = {
          gameNumber: i + 1,
          gameId: gameId,
          finalScores: {
            bottom: gameData.scores?.bottom || 0,
            top: gameData.scores?.top || 0
          },
          finalStriche: gameData.striche || {
            bottom: {},
            top: {}
          },
          winnerTeamKey: gameStricheTop > gameStricheBottom ? 'top' : 'bottom',
          completedAt: gameData.completedAt || gameData.lastUpdated || Timestamp.now(),
          playerNames: gameData.playerNames || {
            '1': 'Marc',
            '2': 'Claudia',
            '3': 'Roger',
            '4': 'Frank'
          },
          createdAt: gameData.createdAt,
          sessionId: sessionId,
          groupId: gameData.groupId
        };
        
        // Save with gameId as document ID
        await summaryRef.collection('completedGames').doc(gameId).set(completedGame);
        
        console.log(`   ✅ Game ${i + 1} (${gameId}): Bottom ${gameStricheBottom}, Top ${gameStricheTop}`);
      }
    }
    
    // 4. Update main jassGameSummary document with missing fields
    console.log('\n4️⃣ Updating main jassGameSummary document...');
    
    // Get session data for startedAt
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    const sessionData = sessionSnap.data();
    
    await summaryRef.update({
      createdAt: sessionData.startedAt || Timestamp.now(),
      // Make sure all required fields are present
      groupId: sessionData.groupId || 'Tz0wgIHMTlhvTtFastiJ',
      participantPlayerIds: sessionData.participantPlayerIds || [
        '1sDvqN_kvqZLB-4eSZFqZ', // Marc
        'xr0atZ7eLJgr7egkAfrE',  // Claudia
        'lW2UwWY80w3q8pyj4xufu', // Roger
        'F1uwdthL6zu7F0cYf1jbe'  // Frank
      ]
    });
    
    console.log('   ✅ Main document updated');
    
    // 5. Verify final structure
    console.log('\n5️⃣ Verifying final structure...');
    
    const summarySnap = await summaryRef.get();
    const summaryData = summarySnap.data();
    
    console.log('   📋 jassGameSummary fields:', Object.keys(summaryData));
    console.log(`   📊 Final scores: ${summaryData.finalScores?.top}:${summaryData.finalScores?.bottom}`);
    console.log(`   🏆 Winner: ${summaryData.winnerTeamKey}`);
    console.log(`   🎮 Games played: ${summaryData.gamesPlayed}`);
    
    // Check completedGames
    const completedGamesSnap = await summaryRef.collection('completedGames').get();
    console.log(`   🎯 CompletedGames count: ${completedGamesSnap.size}`);
    
    completedGamesSnap.docs.forEach(doc => {
      const gameData = doc.data();
      console.log(`      ${doc.id}: Game ${gameData.gameNumber}, Winner: ${gameData.winnerTeamKey}`);
    });
    
    // 6. Trigger statistics recalculation
    console.log('\n6️⃣ Session structure is now complete!');
    console.log('   📈 Statistics should now be calculated automatically');
    console.log('   🔗 Session can be found in jassGameSummaries collection');
    
    return {
      sessionId,
      finalResult: `${summaryData.finalScores?.top}:${summaryData.finalScores?.bottom}`,
      winner: summaryData.winnerTeamKey,
      gamesCount: completedGamesSnap.size
    };
    
  } catch (error) {
    console.error('❌ Error fixing session structure:', error);
    throw error;
  }
}

fixSessionStructure()
  .then((result) => {
    console.log('\n🎉 Session structure fixed successfully!');
    console.log(`   Session: ${result.sessionId}`);
    console.log(`   Result: ${result.finalResult}`);
    console.log(`   Winner: ${result.winner}`);
    console.log(`   Games: ${result.gamesCount}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to fix session structure:', error);
    process.exit(1);
  }); 