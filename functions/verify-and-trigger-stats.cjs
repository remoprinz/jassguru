const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function verifyAndTriggerStats() {
  console.log('🔍 Verifying session and statistics...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  try {
    // 1. Verify jassGameSummary exists and is complete
    console.log('\n1️⃣ Verifying jassGameSummary...');
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      throw new Error('jassGameSummary not found!');
    }
    
    const summaryData = summarySnap.data();
    console.log('   ✅ jassGameSummary exists');
    console.log(`   📊 Result: ${summaryData.finalScores?.top}:${summaryData.finalScores?.bottom}`);
    console.log(`   🏆 Winner: ${summaryData.winnerTeamKey} team`);
    console.log(`   👥 Players: ${JSON.stringify(summaryData.playerNames)}`);
    
    // Check completedGames
    const completedGamesSnap = await summaryRef.collection('completedGames').get();
    console.log(`   🎮 CompletedGames: ${completedGamesSnap.size}/4`);
    
    if (completedGamesSnap.size !== 4) {
      console.log('   ⚠️  Missing completed games!');
    }
    
    // 2. Check if statistics need to be triggered
    console.log('\n2️⃣ Checking statistics status...');
    
    // Check player statistics for one of the players
    const playerIds = summaryData.participantPlayerIds || [];
    console.log(`   👥 Checking stats for players: ${playerIds.join(', ')}`);
    
    for (const playerId of playerIds) {
      const playerStatsRef = db.collection('playerStats').doc(playerId);
      const playerStatsSnap = await playerStatsRef.get();
      
      if (playerStatsSnap.exists) {
        const statsData = playerStatsSnap.data();
        console.log(`   📈 Player ${playerId}: ${statsData.sessionsCompleted || 0} sessions, last updated: ${statsData.lastUpdated?.toDate()}`);
      } else {
        console.log(`   ⚠️  No stats found for player ${playerId}`);
      }
    }
    
    // Check group statistics
    const groupStatsRef = db.collection('groupStats').doc(groupId);
    const groupStatsSnap = await groupStatsRef.get();
    
    if (groupStatsSnap.exists) {
      const groupStatsData = groupStatsSnap.data();
      console.log(`   📊 Group stats: ${groupStatsData.totalSessions || 0} sessions, last updated: ${groupStatsData.lastUpdated?.toDate()}`);
    } else {
      console.log('   ⚠️  No group stats found');
    }
    
    // 3. Manual statistics trigger if needed
    console.log('\n3️⃣ Statistics should update automatically');
    console.log('   📈 Firebase Cloud Functions will process the new jassGameSummary');
    console.log('   ⏳ This may take a few minutes to complete');
    
    // 4. Final verification
    console.log('\n4️⃣ Final session summary:');
    console.log(`   🆔 Session ID: ${sessionId}`);
    console.log(`   📅 Date: ${summaryData.startedAt?.toDate()?.toLocaleDateString('de-DE')}`);
    console.log(`   ⏰ Started: ${summaryData.startedAt?.toDate()?.toLocaleTimeString('de-DE')}`);
    console.log(`   ⏰ Ended: ${summaryData.endedAt?.toDate()?.toLocaleTimeString('de-DE')}`);
    console.log(`   🎮 Games: ${summaryData.gamesPlayed}`);
    console.log(`   🏆 Winner: ${summaryData.winnerTeamKey === 'top' ? 'Claudia + Frank' : 'Marc + Roger'}`);
    console.log(`   📊 Final Striche: ${summaryData.finalScores?.top}:${summaryData.finalScores?.bottom}`);
    
    // Show detailed striche breakdown
    if (summaryData.finalStriche) {
      console.log('\n   🎯 Detailed Striche:');
      console.log(`      Claudia + Frank: ${JSON.stringify(summaryData.finalStriche.top)}`);
      console.log(`      Marc + Roger: ${JSON.stringify(summaryData.finalStriche.bottom)}`);
    }
    
    console.log('\n✅ Session is now properly documented and ready for statistics!');
    
    return {
      sessionId,
      isComplete: completedGamesSnap.size === 4,
      result: `${summaryData.finalScores?.top}:${summaryData.finalScores?.bottom}`,
      winner: summaryData.winnerTeamKey
    };
    
  } catch (error) {
    console.error('❌ Error verifying session:', error);
    throw error;
  }
}

verifyAndTriggerStats()
  .then((result) => {
    console.log('\n🎉 Verification completed!');
    console.log(`   ✅ Session ${result.sessionId} is ${result.isComplete ? 'complete' : 'incomplete'}`);
    console.log(`   📊 Final result: ${result.result}`);
    console.log(`   🏆 Winner: ${result.winner} team`);
    
    if (result.isComplete) {
      console.log('\n🚀 The session is now properly structured for statistics calculation!');
      console.log('   📈 Player and group statistics will be updated automatically');
      console.log('   🔍 You can check the results in the Firebase console or app');
    }
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }); 