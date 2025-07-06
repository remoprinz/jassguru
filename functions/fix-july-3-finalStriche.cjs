const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBmvHu1pNzTLJhLWF2KdmJuXlPUJqKrxUo",
  authDomain: "jassguru-7a213.firebaseapp.com",
  projectId: "jassguru-7a213",
  storageBucket: "jassguru-7a213.appspot.com",
  messagingSenderId: "266239362897",
  appId: "1:266239362897:web:e0b8b7d8a9d9a8b5dc6c6f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Funktion zur Berechnung der finalStriche aus roundHistory
function calculateFinalStricheFromRoundHistory(roundHistory) {
  const finalStriche = {
    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
  };

  // Durchlaufe alle Runden und aggregiere die Striche
  for (const round of roundHistory) {
    if (round.result) {
      // Berg
      if (round.result.berg) {
        const bergTeam = round.result.berg;
        finalStriche[bergTeam].berg += 1;
      }

      // Sieg (normale Runde)
      if (round.result.siegTeam) {
        finalStriche[round.result.siegTeam].sieg += 1;
      }

      // Matsch
      if (round.result.matsch) {
        finalStriche[round.result.matsch].matsch += 1;
      }

      // Schneider
      if (round.result.schneider) {
        finalStriche[round.result.schneider].schneider += 1;
      }

      // Kontermatsch
      if (round.result.kontermatsch) {
        finalStriche[round.result.kontermatsch].kontermatsch += 1;
      }
    }
  }

  return finalStriche;
}

async function fixJuly3FinalStriche() {
  console.log('🔧 Fixe fehlende finalStriche für Juli 3. Session...');
  
  const gameIds = ['BddFeTmedf7hipTcMcGk', 'viQQv1biZzrahe1iQ4Cd', 'KqErTLHxrfe5IMQKAGTW'];
  
  for (const gameId of gameIds) {
    console.log(`\n=== Fixing Game ${gameId} ===`);
    
    try {
      // Lade das CompletedGameSummary-Dokument
      const gameRef = doc(db, 'jassGameSummaries', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log('❌ Game existiert nicht in jassGameSummaries');
        continue;
      }
      
      const gameData = gameDoc.data();
      
      // Prüfe, ob finalStriche bereits existiert
      if (gameData.finalStriche && gameData.finalStriche.top && gameData.finalStriche.bottom) {
        console.log('✅ finalStriche bereits vorhanden');
        console.log('- top:', JSON.stringify(gameData.finalStriche.top, null, 2));
        console.log('- bottom:', JSON.stringify(gameData.finalStriche.bottom, null, 2));
        continue;
      }
      
      // Prüfe, ob roundHistory existiert
      if (!gameData.roundHistory || gameData.roundHistory.length === 0) {
        console.log('❌ Keine roundHistory gefunden');
        continue;
      }
      
      console.log(`🔄 Berechne finalStriche aus ${gameData.roundHistory.length} Runden...`);
      
      // Berechne finalStriche aus roundHistory
      const finalStriche = calculateFinalStricheFromRoundHistory(gameData.roundHistory);
      
      console.log('📊 Berechnete finalStriche:');
      console.log('- top:', JSON.stringify(finalStriche.top, null, 2));
      console.log('- bottom:', JSON.stringify(finalStriche.bottom, null, 2));
      
      // Update das Dokument
      await updateDoc(gameRef, {
        finalStriche: finalStriche
      });
      
      console.log('✅ finalStriche erfolgreich aktualisiert');
      
    } catch (error) {
      console.error(`❌ Fehler beim Fixing Game ${gameId}:`, error);
    }
  }
  
  console.log('\n🎉 Alle Juli 3. finalStriche wurden gefixt!');
}

fixJuly3FinalStriche().catch(console.error); 