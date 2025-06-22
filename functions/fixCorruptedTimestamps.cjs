const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

// --- KONFIGURATION ---
const SESSION_ID = 'fNGTXwzTxxinFXW1EF91B';
const GAME_IDS_TO_FIX = ['1', '2', '3'];
const FRANK_PLAYER_NUMBER = 4; // Gemäss playerNames-Objekt
const FRANK_TIME_MULTIPLIER = 1.12; // 12% Zeitzuschlag
const RANDOMIZATION_FACTOR = 0.4; // +/- 20% (0.4 / 2)

const DRY_RUN = false; // WICHTIG: Auf `false` setzen, um die Änderungen zu schreiben

async function migrateTimestamps() {
  console.log(`🚀 Starte Zeitstempel-Migration für Session: ${SESSION_ID}`);
  if (DRY_RUN) {
    console.log('🚧 ACHTUNG: Trockenlauf (DRY_RUN) ist aktiv. Es werden keine Daten geschrieben.');
  }

  const batch = db.batch();

  for (const gameId of GAME_IDS_TO_FIX) {
    console.log(`\n🔎 Verarbeite Spiel: ${gameId}`);
    const gameRef = db.collection('jassGameSummaries').doc(SESSION_ID).collection('completedGames').doc(gameId);
    
    try {
      const gameDoc = await gameRef.get();
      if (!gameDoc.exists) {
        console.error(`  ❌ Fehler: Spieldokument ${gameId} nicht gefunden.`);
        continue;
      }

      const gameData = gameDoc.data();
      const { roundHistory, createdAt, durationMillis, playerNames } = gameData;

      if (!roundHistory || roundHistory.length === 0 || !createdAt || !durationMillis) {
        console.error(`  ❌ Fehler: Kritische Daten fehlen (roundHistory, createdAt, or durationMillis).`);
        continue;
      }

      const frankPlayerNum = Object.keys(playerNames).find(key => playerNames[key] === 'Frank');
      console.log(`  ℹ️ Spieler "Frank" hat die Nummer: ${frankPlayerNum || 'Nicht gefunden'}`);


      const startTimeMillis = createdAt.toMillis();
      const avgDurationPerRound = durationMillis / roundHistory.length;
      console.log(`  - Spielstart: ${new Date(startTimeMillis).toLocaleString('de-CH')}`);
      console.log(`  - Durchschnittliche Rundendauer: ${Math.round(avgDurationPerRound / 1000)}s`);
      
      const newRoundHistory = [];
      let currentTimestamp = startTimeMillis;

      for (const [index, round] of roundHistory.entries()) {
        const fluctuation = (Math.random() - 0.5) * avgDurationPerRound * RANDOMIZATION_FACTOR;
        let thisRoundDuration = avgDurationPerRound + fluctuation;

        // Frank-Faktor anwenden
        if (round.currentPlayer === FRANK_PLAYER_NUMBER) {
          thisRoundDuration *= FRANK_TIME_MULTIPLIER;
          console.log(`    - Runde ${index + 1} (Frank): Dauer angepasst auf ${Math.round(thisRoundDuration / 1000)}s`);
        }

        currentTimestamp += thisRoundDuration;

        const newRound = { ...round, timestamp: currentTimestamp };
        newRoundHistory.push(newRound);
        
        if(index === 0) { // Log für die erste Runde
            console.log(`    - Runde 1: Neuer Zeitstempel ${new Date(currentTimestamp).toLocaleString('de-CH')} (Dauer: ${Math.round(thisRoundDuration/1000)}s)`);
        }
      }

      // Letzten Zeitstempel mit Gesamtzeit abgleichen
       const finalGeneratedTimestamp = newRoundHistory[newRoundHistory.length - 1].timestamp;
       const expectedEndTime = startTimeMillis + durationMillis;
       console.log(`  - Finaler generierter Zeitstempel: ${new Date(finalGeneratedTimestamp).toLocaleString('de-CH')}`);
       console.log(`  - Erwartetes Spielende:             ${new Date(expectedEndTime).toLocaleString('de-CH')}`);
       console.log(`  - Differenz: ${Math.round((finalGeneratedTimestamp - expectedEndTime) / 1000)}s`);


      // Update-Operationen zum Batch hinzufügen
      batch.update(gameRef, { 
        roundHistory: newRoundHistory,
        timestampCorrectedAt: admin.firestore.FieldValue.delete(),
        timestampCorrectedBy: admin.firestore.FieldValue.delete()
      });
      console.log(`  ✅ Update für Spiel ${gameId} zum Batch hinzugefügt.`);

    } catch (error) {
      console.error(`  ❌ Schwerer Fehler bei der Verarbeitung von Spiel ${gameId}:`, error);
    }
  }

  if (!DRY_RUN) {
    try {
      await batch.commit();
      console.log('\n\n✅ Alle Änderungen wurden erfolgreich in die Datenbank geschrieben.');
    } catch (error) {
      console.error('\n\n❌❌ FEHLER BEIM SCHREIBEN DES BATCHES:', error);
    }
  } else {
    console.log('\n\n✅ Trockenlauf beendet. Es wurden keine Daten geschrieben.');
  }
}

migrateTimestamps().catch(console.error); 