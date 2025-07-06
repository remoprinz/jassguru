const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

async function fixJune27WeisPointsStructure() {
  console.log('🔧 FIX JUNI 27 WEISPOINTS-STRUKTUR');
  console.log('='.repeat(50));
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l'; // Juni 27
  
  try {
    // Lade alle completed games
    const completedGamesSnap = await db
      .collection('jassGameSummaries')
      .doc(sessionId)
      .collection('completedGames')
      .get();
    
    console.log(`📊 Gefundene Spiele: ${completedGamesSnap.size}`);
    
    const batch = db.batch();
    let sessionTotalBottom = 0;
    let sessionTotalTop = 0;
    
    for (const gameDoc of completedGamesSnap.docs) {
      const gameData = gameDoc.data();
      const gameNumber = gameData.gameNumber || gameDoc.id;
      
      console.log(`\n🎮 SPIEL ${gameNumber}:`);
      
      // Berechne Weis-Totals aus roundHistory
      let totalWeisBottom = 0;
      let totalWeisTop = 0;
      
      if (gameData.roundHistory && gameData.roundHistory.length > 0) {
        gameData.roundHistory.forEach((round, index) => {
          let roundWeisBottom = 0;
          let roundWeisTop = 0;
          
          // Sammle Weis aus verschiedenen Feldern
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
          
          totalWeisBottom += roundWeisBottom;
          totalWeisTop += roundWeisTop;
          
          if (roundWeisBottom > 0 || roundWeisTop > 0) {
            console.log(`   └─ Runde ${index + 1}: bottom=${roundWeisBottom}, top=${roundWeisTop}`);
          }
        });
      }
      
      console.log(`📝 Weis-Total: bottom=${totalWeisBottom}, top=${totalWeisTop}`);
      
      // Füge sessionTotals hinzu
      sessionTotalBottom += totalWeisBottom;
      sessionTotalTop += totalWeisTop;
      
      // Prüfe ob weisPoints bereits existiert
      if (!gameData.weisPoints) {
        console.log(`✅ Füge weisPoints hinzu`);
        
        const gameRef = db
          .collection('jassGameSummaries')
          .doc(sessionId)
          .collection('completedGames')
          .doc(gameDoc.id);
        
        batch.update(gameRef, {
          weisPoints: {
            bottom: totalWeisBottom,
            top: totalWeisTop
          }
        });
      } else {
        console.log(`ℹ️  weisPoints bereits vorhanden`);
      }
    }
    
    // Update Session-Total weisPoints
    console.log(`\n📊 SESSION-TOTALS:`);
    console.log(`   ├─ bottom: ${sessionTotalBottom}`);
    console.log(`   └─ top: ${sessionTotalTop}`);
    
    const sessionRef = db.collection('jassGameSummaries').doc(sessionId);
    batch.update(sessionRef, {
      sessionTotalWeisPoints: {
        bottom: sessionTotalBottom,
        top: sessionTotalTop
      }
    });
    
    // Führe Batch-Update aus
    console.log(`\n🚀 Führe Batch-Update aus...`);
    await batch.commit();
    console.log(`✅ Alle Updates erfolgreich!`);
    
    // Verification
    console.log(`\n🔍 VERIFIKATION:`);
    const updatedGamesSnap = await db
      .collection('jassGameSummaries')
      .doc(sessionId)
      .collection('completedGames')
      .get();
    
    let verificationPassed = true;
    for (const gameDoc of updatedGamesSnap.docs) {
      const gameData = gameDoc.data();
      if (!gameData.weisPoints) {
        console.log(`❌ Spiel ${gameData.gameNumber || gameDoc.id} hat immer noch kein weisPoints`);
        verificationPassed = false;
      } else {
        console.log(`✅ Spiel ${gameData.gameNumber || gameDoc.id}: bottom=${gameData.weisPoints.bottom}, top=${gameData.weisPoints.top}`);
      }
    }
    
    if (verificationPassed) {
      console.log(`\n🎉 FIX ERFOLGREICH ABGESCHLOSSEN!`);
      console.log(`\n📍 Jetzt sollten in GameViewerKreidetafel funktionieren:`);
      console.log(`   ├─ Weise werden angezeigt`);
      console.log(`   └─ Matsches werden lila gefärbt`);
    } else {
      console.log(`\n❌ VERIFIKATION FEHLGESCHLAGEN!`);
    }
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
fixJune27WeisPointsStructure(); 