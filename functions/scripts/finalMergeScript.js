const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Konfiguration ---
const MAIN_SESSION_ID = "Ph8oDZYvcV5y3NkFBiZDu";
const SESSION_TO_MERGE_ID = "tPE0JJoJAYpRZO9Scefrp";
const PROJECT_ID = "jassguru";
const COLLECTION_PATH = "gameSessions"; // Annahme, passen Sie dies bei Bedarf an

const TEMP_DIR = path.join(__dirname, 'temp_merge');
const MAIN_SESSION_FILE = path.join(TEMP_DIR, 'main_session.json');
const MERGE_SESSION_FILE = path.join(TEMP_DIR, 'session_to_merge.json');
const FINAL_SESSION_FILE = path.join(TEMP_DIR, 'final_session.json');

// Manuell extrahierte Daten, da CLI versagt
const mainSessionData = {
    "completedGames": {
        "1": { /* Spiel 1 Daten aus Session 1 */ },
        "2": { /* Spiel 2 Daten aus Session 1 */ }
    }
};

const mergeSessionData = {
    "completedGames": {
        "1": { /* Spiel 1 aus Session 2 */ },
        "2": { /* Spiel 2 aus Session 2 */ }
    }
};

// --- Hilfsfunktionen ---

function printHeader(text) {
  console.log('\n' + '─'.repeat(50));
  console.log(` ${text}`);
  console.log('─'.repeat(50));
}

function runCliCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Fehler beim Ausführen: ${command}`);
        console.error(stderr);
        reject(new Error(`Befehl fehlgeschlagen: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// --- Hauptlogik ---

async function mergeSessions() {
  try {
    printHeader("Vorbereitung");
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR);
      console.log(`✅ Temporäres Verzeichnis erstellt: ${TEMP_DIR}`);
    } else {
      console.log(`✅ Temporäres Verzeichnis bereits vorhanden.`);
    }

    // 1. Daten von Firestore herunterladen
    printHeader("Schritt 1: Daten von Firestore herunterladen");
    console.log(`Lade Haupt-Session ${MAIN_SESSION_ID}...`);
    const mainSessionJson = await runCliCommand(
      `firebase firestore:get "${COLLECTION_PATH}/${MAIN_SESSION_ID}" --project ${PROJECT_ID}`
    );
    const mainSessionData = JSON.parse(mainSessionJson);
    fs.writeFileSync(MAIN_SESSION_FILE, JSON.stringify(mainSessionData, null, 2));
    console.log(`✅ Haupt-Session gespeichert in ${MAIN_SESSION_FILE}`);
    
    console.log(`Lade zu mergende Session ${SESSION_TO_MERGE_ID}...`);
    const mergeSessionJson = await runCliCommand(
      `firebase firestore:get "${COLLECTION_PATH}/${SESSION_TO_MERGE_ID}" --project ${PROJECT_ID}`
    );
    const mergeSessionData = JSON.parse(mergeSessionJson);
    fs.writeFileSync(MERGE_SESSION_FILE, JSON.stringify(mergeSessionData, null, 2));
    console.log(`✅ Session zum Mergen gespeichert in ${MERGE_SESSION_FILE}`);

    // 2. Daten zusammenführen
    printHeader("Schritt 2: Daten lokal zusammenführen");
    const mainGames = mainSessionData.completedGames || {};
    const gamesToMerge = mergeSessionData.completedGames || {};
    const mainGameCount = Object.keys(mainGames).length;
    console.log(`Haupt-Session hat ${mainGameCount} Spiel(e).`);
    console.log(`Zu mergende Session hat ${Object.keys(gamesToMerge).length} Spiel(e).`);

    const finalGames = { ...mainGames };
    const maxGameNumber = mainGameCount > 0 ? Math.max(...Object.keys(mainGames).map(Number)) : 0;
    
    Object.values(gamesToMerge).sort((a, b) => a.gameNumber - b.gameNumber).forEach((gameData, index) => {
      const newGameNumber = maxGameNumber + index + 1;
      console.log(`  - Spiel ${gameData.gameNumber} wird zu Spiel ${newGameNumber}`);
      finalGames[newGameNumber] = {
        ...gameData,
        gameNumber: newGameNumber,
        sessionId: MAIN_SESSION_ID,
      };
    });

    const finalSessionData = {
      ...mainSessionData,
      completedGames: finalGames,
      mergedData: {
        mergedAt: new Date().toISOString(),
        mergedSessionId: SESSION_TO_MERGE_ID,
      }
    };
    
    fs.writeFileSync(FINAL_SESSION_FILE, JSON.stringify(finalSessionData, null, 2));
    console.log(`✅ Zusammengeführte Session bereit in ${FINAL_SESSION_FILE}`);
    console.log(`📊 Neue Gesamtanzahl Spiele: ${Object.keys(finalGames).length}`);

    // 3. Daten in Firestore hochladen
    printHeader("Schritt 3: Zusammengeführte Daten in Firestore hochladen");
    console.log(`Aktualisiere Haupt-Session ${MAIN_SESSION_ID}...`);
    await runCliCommand(
      `firebase firestore:set "${COLLECTION_PATH}/${MAIN_SESSION_ID}" "${FINAL_SESSION_FILE}" --project ${PROJECT_ID}`
    );
    console.log(`✅ Haupt-Session erfolgreich aktualisiert.`);

    // 4. Alte Session löschen
    printHeader("Schritt 4: Alte Session löschen");
    console.log(`Lösche Session ${SESSION_TO_MERGE_ID}...`);
    await runCliCommand(
      `firebase firestore:delete "${COLLECTION_PATH}/${SESSION_TO_MERGE_ID}" -r --project ${PROJECT_ID}`
    );
    console.log(`✅ Alte Session erfolgreich gelöscht.`);

    printHeader("🎉 Erfolgreich abgeschlossen!");

  } catch (error) {
    printHeader("❌ FEHLER");
    console.error("Der Prozess wurde aufgrund eines Fehlers abgebrochen:", error.message);
  } finally {
    // Temporäres Verzeichnis aufräumen
    if (fs.existsSync(TEMP_DIR)) {
      // fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      // console.log("🧹 Temporäres Verzeichnis aufgeräumt.");
       console.log(`🧹 Temporäre Dateien sind in ${TEMP_DIR} gespeichert für eine Überprüfung.`);
    }
  }
}

function generateManualInstructions() {
  printHeader("🔧 Manuelle Merge-Anleitung (Copy & Paste)");

  // Daten zusammenführen (Logik von oben)
  const finalGames = {
    // Hier die kompletten Daten der Spiele 1 & 2 aus Session 1 einfügen
  };
  
  const gamesToMerge = {
      // Spiel 1 aus Session 2 wird zu Spiel 3
      "3": {
          "activeGameId": "DlbRLA6Fx2KMplTj4YVE",
          "durationMillis": 3581077,
          // ... restliche Daten hier einfügen ...
          "gameNumber": 3,
          "sessionId": MAIN_SESSION_ID
      },
      // Spiel 2 aus Session 2 wird zu Spiel 4
      "4": {
          "activeGameId": "k8a4OIHjZCmef8kCTYci",
          "durationMillis": 4980446,
          // ... restliche Daten hier einfügen ...
          "gameNumber": 4,
          "sessionId": MAIN_SESSION_ID
      }
  };
  
  const finalCompletedGames = { ...finalGames, ...gamesToMerge };

  console.log(`
Schritt 1: Gehen Sie zur Haupt-Session in Firestore:
Navigieren Sie zu: collections/gameSessions/documents/${MAIN_SESSION_ID}

Schritt 2: Ersetzen Sie das 'completedGames' Feld
Kopieren Sie den gesamten folgenden JSON-Block und fügen Sie ihn als Wert für das Feld 'completedGames' ein.

👇 ALLES AB HIER KOPIEREN 👇
`);

  console.log(JSON.stringify(finalCompletedGames, null, 2));
  
  console.log(`
👆 BIS HIER KOPIEREN 👆

Schritt 3: Löschen Sie die alte Session
Navigieren Sie zu: collections/gameSessions/documents/${SESSION_TO_MERGE_ID}
Und löschen Sie das gesamte Dokument.

🎉 FERTIG!
`);
}

mergeSessions();
generateManualInstructions(); 