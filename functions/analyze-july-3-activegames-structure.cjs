const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function analyzeJuly3ActiveGames() {
  console.log('🔍 [ANALYZE] Vollständige Analyse der Juli-3-ActiveGames...');
  
  const activeGameIds = [
    'BddFeTmedf7hipTcMcGk',
    'viQQv1biZzrahe1iQ4Cd', 
    'KqErTLHxrfe5IMQKAGTW'
  ];
  
  try {
    for (const gameId of activeGameIds) {
      console.log(`\n🎮 === SPIEL ${gameId} VOLLSTÄNDIGE ANALYSE ===`);
      
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameDoc = await gameRef.get();
      
      if (!gameDoc.exists) {
        console.log(`❌ Spiel ${gameId} existiert nicht!`);
        continue;
      }
      
      const gameData = gameDoc.data();
      console.log(`📋 GRUNDDATEN:`);
      console.log(`   Status: ${gameData.status}`);
      console.log(`   currentRound: ${gameData.currentRound}`);
      console.log(`   gameType: ${gameData.gameType}`);
      console.log(`   createdAt: ${gameData.createdAt}`);
      console.log(`   startedAt: ${gameData.startedAt}`);
      console.log(`   completedAt: ${gameData.completedAt}`);
      console.log(`   timestampCompleted: ${gameData.timestampCompleted}`);
      console.log(`   durationMillis: ${gameData.durationMillis}`);
      
      console.log(`\n🎯 SCORES UND STRICHE:`);
      console.log(`   finalScores: ${JSON.stringify(gameData.finalScores)}`);
      console.log(`   finalStriche: ${JSON.stringify(gameData.finalStriche)}`);
      console.log(`   weisPoints: ${JSON.stringify(gameData.weisPoints)}`);
      console.log(`   currentScores: ${JSON.stringify(gameData.currentScores)}`);
      console.log(`   striche: ${JSON.stringify(gameData.striche)}`);
      console.log(`   visualStriche: ${JSON.stringify(gameData.visualStriche)}`);
      
      console.log(`\n👥 SPIELER:`);
      console.log(`   participantUids: ${JSON.stringify(gameData.participantUids)}`);
      console.log(`   participantPlayerIds: ${JSON.stringify(gameData.participantPlayerIds)}`);
      console.log(`   playerNames: ${JSON.stringify(gameData.playerNames)}`);
      console.log(`   teams: ${JSON.stringify(gameData.teams)}`);
      console.log(`   teamScoreMapping: ${JSON.stringify(gameData.teamScoreMapping)}`);
      
      console.log(`\n📖 ROUND HISTORY:`);
      if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
        console.log(`   roundHistory: ${gameData.roundHistory.length} Runden`);
        if (gameData.roundHistory.length > 0) {
          console.log(`   Erste Runde: ${JSON.stringify(gameData.roundHistory[0])}`);
          console.log(`   Letzte Runde: ${JSON.stringify(gameData.roundHistory[gameData.roundHistory.length - 1])}`);
        }
      } else {
        console.log(`   roundHistory: ${gameData.roundHistory}`);
      }
      
      console.log(`\n🎲 WEITERE DATEN:`);
      console.log(`   currentPlayer: ${gameData.currentPlayer}`);
      console.log(`   initialStartingPlayer: ${gameData.initialStartingPlayer}`);
      console.log(`   winnerTeam: ${gameData.winnerTeam}`);
      console.log(`   groupId: ${gameData.groupId}`);
      console.log(`   sessionId: ${gameData.sessionId}`);
      console.log(`   Rosen10player: ${gameData.Rosen10player}`);
      
      console.log(`\n📊 ALLE FELDER:`);
      const allFields = Object.keys(gameData).sort();
      console.log(`   Felder (${allFields.length}): ${allFields.join(', ')}`);
      
      // Prüfe auf unerwartete Null/Undefined Werte
      console.log(`\n⚠️  NULL/UNDEFINED WERTE:`);
      allFields.forEach(field => {
        const value = gameData[field];
        if (value === null || value === undefined) {
          console.log(`   ${field}: ${value}`);
        }
      });
    }
    
    console.log('\n🔍 ANALYSE ABGESCHLOSSEN!');
    
  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
  
  process.exit(0);
}

analyzeJuly3ActiveGames().catch(console.error); 