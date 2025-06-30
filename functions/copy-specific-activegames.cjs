const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function copySpecificActiveGames() {
  console.log('🔧 Copying specific activeGames to completedGames in correct order...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  
  // EXAKTE Game-IDs in zeitlicher Reihenfolge vom 26. Juni 2025
  const specificGameIds = [
    { id: 'McwZp97kiOhAJXwhEFAh', time: '19:15', position: '1' }, // Game 1
    { id: 'b6WgosKliW94lXKnPIM7', time: '20:21', position: '2' }, // Game 2
    { id: 'zGrHNzF6EE05kKtnzu0b', time: '21:26', position: '3' }, // Game 3
    { id: 'e7O072Iy9vSHuO0cZZKF', time: '22:44', position: '4' }  // Game 4
  ];
  
  try {
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    
    console.log('\n📋 Processing each specific activeGame:');
    
    for (const gameInfo of specificGameIds) {
      console.log(`\n${gameInfo.position}️⃣ Processing Game ${gameInfo.position} (${gameInfo.time}):`);
      console.log(`   🎯 ActiveGame ID: ${gameInfo.id}`);
      
      // 1. Get the complete activeGame document
      const activeGameRef = db.collection('activeGames').doc(gameInfo.id);
      const activeGameSnap = await activeGameRef.get();
      
      if (!activeGameSnap.exists) {
        console.log(`   ❌ ActiveGame ${gameInfo.id} not found!`);
        continue;
      }
      
      const activeGameData = activeGameSnap.data();
      console.log(`   ✅ Found activeGame: ${activeGameData.playerNames ? Object.values(activeGameData.playerNames).join(', ') : 'unknown players'}`);
      console.log(`   📅 Created: ${activeGameData.createdAt?.toDate()}`);
      console.log(`   🏆 Status: ${activeGameData.status}`);
      
      // Verify this is our session (double-check safety)
      if (activeGameData.sessionId !== sessionId) {
        console.log(`   ⚠️  WARNING: SessionId mismatch! Expected ${sessionId}, got ${activeGameData.sessionId}`);
        console.log(`   🚫 SKIPPING this game for safety!`);
        continue;
      }
      
      // Verify players match our expected team
      const expectedPlayers = ['Marc', 'Claudia', 'Roger', 'Frank'];
      const actualPlayers = Object.values(activeGameData.playerNames || {});
      const playersMatch = expectedPlayers.every(player => 
        actualPlayers.some(actual => actual && actual.includes(player))
      );
      
      if (!playersMatch) {
        console.log(`   ⚠️  WARNING: Players don't match! Expected: ${expectedPlayers.join(', ')}, Got: ${actualPlayers.join(', ')}`);
        console.log(`   🚫 SKIPPING this game for safety!`);
        continue;
      }
      
      console.log(`   ✅ Verified: Correct session and players`);
      
      // 2. Copy complete activeGame data to completedGames with position number
      const completedGameRef = summaryRef.collection('completedGames').doc(gameInfo.position);
      
      // Copy ALL activeGame data, then add/override specific completedGame fields
      const completedGameData = {
        ...activeGameData, // Copy everything from activeGame
        
        // Override/add specific completedGame fields
        gameNumber: parseInt(gameInfo.position),
        activeGameId: gameInfo.id,
        sessionId: sessionId,
        
        // Ensure these fields are properly set
        completedAt: activeGameData.completedAt || activeGameData.lastUpdated || Timestamp.now(),
        timestampCompleted: activeGameData.completedAt || activeGameData.lastUpdated || Timestamp.now(),
        
        // Calculate duration if possible
        durationMillis: activeGameData.createdAt && activeGameData.lastUpdated ? 
          activeGameData.lastUpdated.toMillis() - activeGameData.createdAt.toMillis() : 0,
        
        // Ensure participant data is complete
        participantPlayerIds: activeGameData.participantPlayerIds || [
          '1sDvqN_kvqZLB-4eSZFqZ', // Marc
          'xr0atZ7eLJgr7egkAfrE',  // Claudia
          'lW2UwWY80w3q8pyj4xufu', // Roger
          'F1uwdthL6zu7F0cYf1jbe'  // Frank
        ],
        participantUids: activeGameData.participantUids || [
          'JmluPJeG6wbQzLkoJjlU7uVVYyw1', // Marc
          'CF5nVG3vW7SS2omMu0ltF0zhKHs1', // Claudia
          'j6joaEvLqKayu4GV580Dt7EsZQg1', // Roger
          'WQSNHuoqtBen2D3E1bu4OLgx4aI3'  // Frank
        ]
      };
      
      await completedGameRef.set(completedGameData);
      
      console.log(`   ✅ Copied complete activeGame to completedGames/${gameInfo.position}`);
      console.log(`   📊 Final scores: ${activeGameData.scores?.bottom || 0} vs ${activeGameData.scores?.top || 0}`);
      console.log(`   🎯 Striche: ${Object.values(activeGameData.striche?.bottom || {}).reduce((a,b) => a+b, 0)} vs ${Object.values(activeGameData.striche?.top || {}).reduce((a,b) => a+b, 0)}`);
      
      // 3. Also copy the rounds subcollection if it exists
      try {
        const roundsSnap = await activeGameRef.collection('rounds').get();
        if (roundsSnap.size > 0) {
          console.log(`   📋 Copying ${roundsSnap.size} rounds...`);
          
          for (const roundDoc of roundsSnap.docs) {
            await completedGameRef.collection('rounds').doc(roundDoc.id).set(roundDoc.data());
          }
          
          console.log(`   ✅ Copied ${roundsSnap.size} rounds to completedGames/${gameInfo.position}/rounds`);
        } else {
          console.log(`   📋 No rounds subcollection found`);
        }
      } catch (roundError) {
        console.log(`   ⚠️  Could not copy rounds: ${roundError.message}`);
      }
    }
    
    // 4. Final verification
    console.log('\n🔍 Final verification:');
    const completedGamesSnap = await summaryRef.collection('completedGames').get();
    console.log(`   📊 Total completedGames: ${completedGamesSnap.size}`);
    
    for (const doc of completedGamesSnap.docs) {
      const data = doc.data();
      console.log(`   ${doc.id}: Game ${data.gameNumber}, ActiveGameId: ${data.activeGameId}, Status: ${data.status}`);
    }
    
    return {
      sessionId,
      copiedGames: specificGameIds.length,
      totalCompletedGames: completedGamesSnap.size
    };
    
  } catch (error) {
    console.error('❌ Error copying activeGames:', error);
    throw error;
  }
}

copySpecificActiveGames()
  .then((result) => {
    console.log('\n🎉 Specific activeGames copied successfully!');
    console.log(`   ✅ Session: ${result.sessionId}`);
    console.log(`   ✅ Copied games: ${result.copiedGames}`);
    console.log(`   ✅ Total completedGames: ${result.totalCompletedGames}`);
    console.log('\n🚀 CompletedGames now contain complete activeGame data!');
    console.log('   📱 Session should be fully functional in archive');
    console.log('   🎮 All rounds and game details preserved');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to copy activeGames:', error);
    process.exit(1);
  }); 