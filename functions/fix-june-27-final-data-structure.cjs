const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialisierung der Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

async function fixJune27DataStructure() {
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  console.log(`🔧 BEGINNE FINALE DATEN-REPARATUR für Session: ${sessionId}`);
  console.log('='.repeat(60));

  const completedGamesRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames');
  const gamesSnapshot = await completedGamesRef.get();

  if (gamesSnapshot.empty) {
    console.log('❌ Keine abgeschlossenen Spiele in dieser Session gefunden.');
    return;
  }

  const batch = db.batch();
  let changesMade = false;

  console.log(`🔎 Analysiere ${gamesSnapshot.size} Spiele...`);

  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const gameId = gameDoc.id;
    const gameNumber = gameData.gameNumber || gameId;
    let needsUpdate = false;

    console.log(`\n--- Spiel ${gameNumber} (${gameId}) ---`);

    if (!gameData.roundHistory || gameData.roundHistory.length === 0) {
      console.log('   -> Keine roundHistory vorhanden, wird übersprungen.');
      continue;
    }

    const newRoundHistory = gameData.roundHistory.map((round, index) => {
      const newRound = { ...round };
      let roundChanged = false;

      // 1. Matsch-Problem beheben: eventType -> strichInfo
      if (newRound.eventType && newRound.eventTeam) {
        newRound.strichInfo = {
          type: newRound.eventType,
          team: newRound.eventTeam
        };
        delete newRound.eventType;
        delete newRound.eventTeam;
        console.log(`   [Runde ${index + 1}] ✅ FIX: 'eventType' (${newRound.strichInfo.type}) wurde zu 'strichInfo' konvertiert.`);
        roundChanged = true;
      }
      
      // 2. Weis-Problem beheben: _savedWeisPoints entfernen
      if (newRound.hasOwnProperty('_savedWeisPoints')) {
        // Nur entfernen, wenn es auch ein weisPoints-Feld als Alternative gibt
        if (newRound.weisPoints) {
            delete newRound._savedWeisPoints;
            console.log(`   [Runde ${index + 1}] ✅ FIX: Irreführendes '_savedWeisPoints' wurde entfernt.`);
            roundChanged = true;
        } else {
            console.log(`   [Runde ${index + 1}] ⚠️ WARNUNG: '_savedWeisPoints' gefunden, aber kein 'weisPoints' als Ersatz. Feld wird nicht entfernt.`);
        }
      }

      if (roundChanged) {
        needsUpdate = true;
      }

      return newRound;
    });

    if (needsUpdate) {
      batch.update(gameDoc.ref, { roundHistory: newRoundHistory });
      changesMade = true;
      console.log(`   -> 🚀 Spiel ${gameNumber} wird für das Update vorgemerkt.`);
    } else {
      console.log('   -> Keine Änderungen für dieses Spiel notwendig.');
    }
  }

  if (changesMade) {
    console.log('\n\n🚀 Führe Batch-Update für alle Änderungen aus...');
    try {
      await batch.commit();
      console.log('🎉 DATEN-REPARATUR ERFOLGREICH ABGESCHLOSSEN!');
      console.log('Die Anzeige in der App sollte jetzt für die Juni-27-Session korrekt sein.');
    } catch (error) {
      console.error('🔥 FEHLER beim Ausführen des Batch-Updates:', error);
    }
  } else {
    console.log('\n\n✅ Keine Änderungen notwendig. Die Datenstruktur scheint bereits korrekt zu sein.');
  }
}

fixJune27DataStructure().catch(console.error); 