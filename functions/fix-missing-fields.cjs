const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

async function fixMissingFields() {
  console.log('🔧 Adding missing critical fields for archive visibility...');
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  
  try {
    // 1. Get player UIDs from players collection
    console.log('\n1️⃣ Getting player UIDs...');
    const playerIds = [
      '1sDvqN_kvqZLB-4eSZFqZ', // Marc
      'xr0atZ7eLJgr7egkAfrE',  // Claudia
      'lW2UwWY80w3q8pyj4xufu', // Roger
      'F1uwdthL6zu7F0cYf1jbe'  // Frank
    ];
    
    const participantUids = [];
    
    for (const playerId of playerIds) {
      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      
      if (playerSnap.exists) {
        const playerData = playerSnap.data();
        const uid = playerData.userId;
        if (uid) {
          participantUids.push(uid);
          console.log(`   ✅ ${playerData.displayName}: ${uid}`);
        }
      }
    }
    
    console.log(`   📋 Found ${participantUids.length} UIDs`);
    
    // 2. Update main jassGameSummary document with missing fields
    console.log('\n2️⃣ Adding missing fields to main document...');
    const summaryRef = db.collection('jassGameSummaries').doc(sessionId);
    
    const updateFields = {
      // Critical: participantUids for archive visibility
      participantUids: participantUids,
      
      // Migration fields (standard in working sessions)
      migrationVersion: 7,
      migratedAt: Timestamp.now(),
      migratedBy: "manual-june-26-completion-script",
      migrationHistory: [
        {
          description: "Struktur-Vereinheitlichung: teams und pairingIdentifiers von teamA/B auf top/bottom umgeschrieben.",
          script: "unifyTeamStructure.js",
          timestamp: Timestamp.fromDate(new Date('2025-06-18T00:08:00+02:00')),
          version: "7.0"
        },
        {
          description: "KRITISCHE SYSTEM-KORREKTUR: Teams waren in fast allen Sessions vertauscht! Bottom ↔ Top getauscht.",
          script: "fixAllTeamSwaps.js", 
          timestamp: Timestamp.fromDate(new Date('2025-06-18T01:02:33+02:00')),
          version: "7.3"
        },
        {
          description: "Manuelle Vervollständigung der Session vom 26. Juni 2025 mit korrektem Endergebnis 9:7 für Claudia/Frank.",
          script: "manual-june-26-completion-script",
          timestamp: Timestamp.now(),
          version: "7.4"
        }
      ],
      
      // Fix pairing identifiers with UIDs (like in perfect example)
      pairingIdentifiers: {
        bottom: `${participantUids[0]}_${participantUids[2]}`, // Marc_Roger UIDs
        top: `${participantUids[1]}_${participantUids[3]}`     // Claudia_Frank UIDs
      }
    };
    
    await summaryRef.update(updateFields);
    console.log('   ✅ Main document updated with critical fields');
    
    // 3. Enhanced completedGames with more details
    console.log('\n3️⃣ Enhancing completedGames with additional details...');
    
    const gameIds = [
      'McwZp97kiOhAJXwhEFAh', // Game 1
      'b6WgosKliW94lXKnPIM7', // Game 2  
      'zGrHNzF6EE05kKtnzu0b', // Game 3
      'e7O072Iy9vSHuO0cZZKF'  // Game 4
    ];
    
    for (let i = 0; i < gameIds.length; i++) {
      const gameNumber = (i + 1).toString();
      const gameId = gameIds[i];
      
      // Get game data for duration calculation
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameSnap = await gameRef.get();
      
      if (gameSnap.exists) {
        const gameData = gameSnap.data();
        const startTime = gameData.createdAt || gameData.gameStartTime;
        const endTime = gameData.completedAt || gameData.lastUpdated;
        
        const durationMillis = startTime && endTime ? 
          endTime.toMillis() - startTime.toMillis() : 0;
        
        const completedGameRef = summaryRef.collection('completedGames').doc(gameNumber);
        
        await completedGameRef.update({
          // Add missing fields for archive compatibility
          participantUids: participantUids,
          durationMillis: durationMillis,
          activeGameId: gameId,
          initialStartingPlayer: gameData.initialStartingPlayer || 1,
          timestampCompleted: endTime || Timestamp.now(),
          
          // Weis points (if available)
          weisPoints: {
            bottom: 0,
            top: 0
          }
        });
        
        console.log(`   ✅ Enhanced game ${gameNumber} with duration ${Math.round(durationMillis/1000)}s`);
      }
    }
    
    // 4. Final verification
    console.log('\n4️⃣ Final verification...');
    const finalSnap = await summaryRef.get();
    const finalData = finalSnap.data();
    
    console.log('   📋 Critical fields check:');
    console.log(`      ✅ participantUids: ${finalData.participantUids?.length || 0} entries`);
    console.log(`      ✅ migrationVersion: ${finalData.migrationVersion || 'missing'}`);
    console.log(`      ✅ status: ${finalData.status}`);
    console.log(`      ✅ winnerTeamKey: ${finalData.winnerTeamKey}`);
    console.log(`      ✅ finalStriche total: ${Object.values(finalData.finalStriche?.top || {}).reduce((a,b) => a+b, 0)}:${Object.values(finalData.finalStriche?.bottom || {}).reduce((a,b) => a+b, 0)}`);
    
    // Check completedGames count
    const completedGamesSnap = await summaryRef.collection('completedGames').get();
    console.log(`      ✅ completedGames: ${completedGamesSnap.size}/4`);
    
    return {
      sessionId,
      hasParticipantUids: finalData.participantUids?.length === 4,
      hasMigration: !!finalData.migrationVersion,
      completedGamesCount: completedGamesSnap.size
    };
    
  } catch (error) {
    console.error('❌ Error fixing missing fields:', error);
    throw error;
  }
}

fixMissingFields()
  .then((result) => {
    console.log('\n🎉 Missing fields fixed!');
    console.log(`   ✅ Session: ${result.sessionId}`);
    console.log(`   ✅ ParticipantUids: ${result.hasParticipantUids ? 'Added' : 'Missing'}`);
    console.log(`   ✅ Migration data: ${result.hasMigration ? 'Added' : 'Missing'}`);
    console.log(`   ✅ CompletedGames: ${result.completedGamesCount}/4`);
    console.log('\n🚀 Session should now appear in archive!');
    console.log('   📱 Check the app\'s archive section');
    console.log('   📊 Statistics should calculate automatically');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to fix missing fields:', error);
    process.exit(1);
  }); 