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
const GAMES_TO_FIX = [
  'jassGameSummaries/UIamH_JPMb9Yd5-sWHr-U/completedGames/3',
  'jassGameSummaries/ra677t9Bg3fswFEewcS3U/completedGames/3',
  'jassGameSummaries/uqTh87TcPRpEkmiQAUp0_/completedGames/1',
  'jassGameSummaries/zW1cqUo43ed-imk_RintC/completedGames/3'
];

const DRY_RUN = false; // WICHTIG: Auf `false` setzen, um die Änderungen zu schreiben

// Hilfsfunktion zum Konvertieren von Timestamps
function convertToMillis(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp === 'number') return timestamp;
    if (timestamp.toDate) return timestamp.toDate().getTime();
    if (timestamp._seconds) return (timestamp._seconds * 1000) + (timestamp._nanoseconds / 1000000);
    return null;
}


async function fixMissingDurations() {
  console.log('🚀 Starte Reparatur für Spiele mit fehlender `durationMillis`.');
  if (DRY_RUN) {
    console.log('🚧 ACHTUNG: Trockenlauf (DRY_RUN) ist aktiv. Es werden keine Daten geschrieben.');
  }

  const batch = db.batch();

  for (const gamePath of GAMES_TO_FIX) {
    console.log(`\n🔎 Verarbeite Spiel: ${gamePath}`);
    const gameRef = db.doc(gamePath);
    
    try {
      const gameDoc = await gameRef.get();
      if (!gameDoc.exists) {
        console.error(`  ❌ Fehler: Spieldokument nicht gefunden.`);
        continue;
      }

      const gameData = gameDoc.data();
      const { roundHistory, timestampCompleted, completedAt, durationMillis } = gameData;

      if (durationMillis && durationMillis > 0) {
          console.log(`  ⏩ Spiel wird übersprungen, durationMillis (${durationMillis}) ist bereits vorhanden.`);
          continue;
      }

      if (!roundHistory || roundHistory.length === 0) {
        console.error(`  ❌ Fehler: Keine 'roundHistory' zum Berechnen der Dauer gefunden.`);
        continue;
      }

      let gameEndTime = convertToMillis(timestampCompleted || completedAt);
      const firstRoundTime = convertToMillis(roundHistory[0].timestamp);

      if (!gameEndTime) {
          console.warn(`  ⚠️ Warnung: 'timestampCompleted' oder 'completedAt' fehlt. Versuche Fallback mit letzter Runde...`);
          const lastRoundTime = convertToMillis(roundHistory[roundHistory.length - 1].timestamp);
          if (lastRoundTime) {
              gameEndTime = lastRoundTime;
              console.log(`  - Fallback erfolgreich: Endzeit von letzter Runde wird verwendet.`);
          }
      }

      if (!gameEndTime || !firstRoundTime) {
          console.error(`  ❌ Fehler: Wichtige Zeitstempel fehlen (gameEnd oder firstRound). gameEndTime: ${gameEndTime}, firstRoundTime: ${firstRoundTime}`);
          continue;
      }
      
      const newDuration = gameEndTime - firstRoundTime;

      if (newDuration <= 0) {
          console.warn(`  ⚠️ Warnung: Berechnete Dauer ist negativ oder null (${newDuration}ms). Spiel wird übersprungen.`);
          continue;
      }

      console.log(`  - Aktuelle durationMillis: ${durationMillis || 'Nicht vorhanden'}`);
      console.log(`  - Berechnete neue durationMillis: ${newDuration}ms (~${Math.round(newDuration / 1000 / 60)} min)`);

      // Update-Operation zum Batch hinzufügen
      batch.update(gameRef, { durationMillis: newDuration });
      console.log(`  ✅ Update für Spiel ${gameDoc.id} zum Batch hinzugefügt.`);

    } catch (error) {
      console.error(`  ❌ Schwerer Fehler bei der Verarbeitung von ${gamePath}:`, error);
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

fixMissingDurations().catch(console.error); 