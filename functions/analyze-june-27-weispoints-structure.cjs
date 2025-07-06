const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

async function analyzeJune27WeisPointsStructure() {
  console.log('🔍 ANALYSE DER WEISPOINTS-STRUKTUR');
  console.log('='.repeat(60));
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l'; // Juni 27
  
  try {
    // Lade alle completed games
    const completedGamesSnap = await db
      .collection('jassGameSummaries')
      .doc(sessionId)
      .collection('completedGames')
      .get();
    
    console.log(`📊 Gefundene Spiele: ${completedGamesSnap.size}`);
    console.log();
    
    for (const gameDoc of completedGamesSnap.docs) {
      const gameData = gameDoc.data();
      const gameNumber = gameData.gameNumber || gameDoc.id;
      
      console.log(`🎮 SPIEL ${gameNumber} (${gameDoc.id}):`);
      console.log('-'.repeat(40));
      
      // 1. Prüfe weisPoints auf oberster Ebene
      console.log(`📍 weisPoints (direkt): ${gameData.weisPoints ? 'JA' : 'NEIN'}`);
      if (gameData.weisPoints) {
        console.log(`   ├─ bottom: ${gameData.weisPoints.bottom || 0}`);
        console.log(`   └─ top: ${gameData.weisPoints.top || 0}`);
      }
      
      // 2. Prüfe roundHistory
      console.log(`📍 roundHistory: ${gameData.roundHistory ? gameData.roundHistory.length + ' Runden' : 'NEIN'}`);
      
      if (gameData.roundHistory && gameData.roundHistory.length > 0) {
        let totalWeisBottom = 0;
        let totalWeisTop = 0;
        let roundsWithWeis = 0;
        
        gameData.roundHistory.forEach((round, index) => {
          let roundWeisBottom = 0;
          let roundWeisTop = 0;
          
          // Prüfe verschiedene Weis-Felder
          if (round.weisPoints) {
            roundWeisBottom += round.weisPoints.bottom || 0;
            roundWeisTop += round.weisPoints.top || 0;
          }
          
          if (round._savedWeisPoints) {
            roundWeisBottom += round._savedWeisPoints.bottom || 0;
            roundWeisTop += round._savedWeisPoints.top || 0;
          }
          
          if (round.weisActions && round.weisActions.length > 0) {
            round.weisActions.forEach(action => {
              if (action.position === 'bottom') {
                roundWeisBottom += action.points || 0;
              } else if (action.position === 'top') {
                roundWeisTop += action.points || 0;
              }
            });
          }
          
          if (roundWeisBottom > 0 || roundWeisTop > 0) {
            roundsWithWeis++;
            console.log(`   ├─ Runde ${index + 1}: bottom=${roundWeisBottom}, top=${roundWeisTop}`);
          }
          
          totalWeisBottom += roundWeisBottom;
          totalWeisTop += roundWeisTop;
        });
        
        console.log(`📍 Weis-Zusammenfassung:`);
        console.log(`   ├─ Runden mit Weis: ${roundsWithWeis}`);
        console.log(`   ├─ Total bottom: ${totalWeisBottom}`);
        console.log(`   └─ Total top: ${totalWeisTop}`);
      }
      
      // 3. Prüfe finalScores
      console.log(`📍 finalScores:`);
      if (gameData.finalScores) {
        console.log(`   ├─ bottom: ${gameData.finalScores.bottom || 0}`);
        console.log(`   └─ top: ${gameData.finalScores.top || 0}`);
      }
      
      console.log();
    }
    
    // Vergleiche mit Juli 3 Session (funktionierend)
    console.log('🔄 VERGLEICH MIT JULI 3 SESSION:');
    console.log('='.repeat(40));
    
    const juli3SessionId = 'GvshcbgPDCtbhCeqHApvk';
    const juli3CompletedGamesSnap = await db
      .collection('jassGameSummaries')
      .doc(juli3SessionId)
      .collection('completedGames')
      .limit(1)
      .get();
    
    if (!juli3CompletedGamesSnap.empty) {
      const juli3Game = juli3CompletedGamesSnap.docs[0].data();
      console.log(`Juli 3 - weisPoints direkt: ${juli3Game.weisPoints ? 'JA' : 'NEIN'}`);
      if (juli3Game.weisPoints) {
        console.log(`   ├─ bottom: ${juli3Game.weisPoints.bottom || 0}`);
        console.log(`   └─ top: ${juli3Game.weisPoints.top || 0}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
analyzeJune27WeisPointsStructure(); 