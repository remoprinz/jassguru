
import * as admin from 'firebase-admin';
// 🔧 FIX: Korrekter Import für Commander
import { Command } from 'commander';

// WICHTIG: Pfad anpassen, falls das Skript aus einem anderen Verzeichnis ausgeführt wird
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://jassguru-8c8d8.firebaseio.com`
});

const db = admin.firestore();

async function debugSpecificTournament(tournamentId: string) {
  if (!tournamentId) {
    console.error("FEHLER: Bitte geben Sie eine Turnier-ID an.");
    return;
  }

  console.log(`Starte Debugging für Turnier-ID: ${tournamentId}`);

  try {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      console.error(`FEHLER: Turnier mit ID ${tournamentId} wurde nicht gefunden.`);
      return;
    }

    const tournamentData = tournamentDoc.data();
    // ✅ FIX: Zusätzlicher Check, um TypeScript zufriedenzustellen
    if (!tournamentData) {
      console.error(`FEHLER: Turnier-Dokument ${tournamentId} hat keine Daten.`);
      return;
    }

    console.log("\n--- Turnier-Dokument ---");
    console.log("Status:", tournamentData.status);
    console.log("FinalizedAt:", tournamentData.finalizedAt ? tournamentData.finalizedAt.toDate() : "Nicht gesetzt");
    console.log("ParticipantPlayerIds (im Dokument):", tournamentData.participantPlayerIds || "Nicht vorhanden");
    console.log("--------------------------\n");

    const gamesSnapshot = await tournamentRef.collection('games').get();

    if (gamesSnapshot.empty) {
      console.warn("WARNUNG: Keine 'games' in der Subcollection für dieses Turnier gefunden!");
      console.log("Dies ist der wahrscheinlichste Grund für das Scheitern der Finalisierung.");
      return;
    }

    console.log(`\n--- Gefundene Spiele (${gamesSnapshot.docs.length}) ---`);
    const allPlayerIdsFromGames = new Set<string>();
    let gameCounter = 0;

    for (const gameDoc of gamesSnapshot.docs) {
      gameCounter++;
      const gameData = gameDoc.data();
      console.log(`\n[Spiel ${gameCounter} - ID: ${gameDoc.id}]`);

      // ✅ ERWEITERTE PRÜFUNG: Überprüfe alle kritischen Felder
      let isGameDataValid = true;

      if (!gameData.teams || typeof gameData.teams !== 'object') {
        console.log(`  WARNUNG: game.teams ist nicht vorhanden oder kein Objekt.`);
        isGameDataValid = false;
      } else {
        if (!gameData.teams.top?.players || !Array.isArray(gameData.teams.top.players)) {
          console.log(`  WARNUNG: game.teams.top.players ist nicht vorhanden oder kein Array.`);
          isGameDataValid = false;
        } else {
          console.log(`  Team Oben Spieler:`);
          gameData.teams.top.players.forEach((p: any, i: number) => {
            console.log(`    - Spieler ${i + 1}: ${JSON.stringify(p)}`);
            if (p.playerId) allPlayerIdsFromGames.add(p.playerId);
          });
        }
        if (!gameData.teams.bottom?.players || !Array.isArray(gameData.teams.bottom.players)) {
          console.log(`  WARNUNG: game.teams.bottom.players ist nicht vorhanden oder kein Array.`);
          isGameDataValid = false;
        } else {
          console.log(`  Team Unten Spieler:`);
          gameData.teams.bottom.players.forEach((p: any, i: number) => {
            console.log(`    - Spieler ${i + 1}: ${JSON.stringify(p)}`);
            if (p.playerId) allPlayerIdsFromGames.add(p.playerId);
          });
        }
      }

      if (!gameData.teamScoresPasse || typeof gameData.teamScoresPasse !== 'object') {
        console.log(`  WARNUNG: game.teamScoresPasse ist nicht vorhanden oder kein Objekt.`);
        isGameDataValid = false;
      } else {
        if (typeof gameData.teamScoresPasse.top !== 'number' || typeof gameData.teamScoresPasse.bottom !== 'number') {
          console.log(`  WARNUNG: game.teamScoresPasse.top oder .bottom ist keine Zahl.`);
          isGameDataValid = false;
        } else {
          console.log(`  Team Scores: Top ${gameData.teamScoresPasse.top}, Bottom ${gameData.teamScoresPasse.bottom}`);
        }
      }

      if (isGameDataValid) {
        console.log(`  STATUS: ✅ Dieses Spieldokument scheint GÜLTIG zu sein.`);
      } else {
        console.log(`  STATUS: 🚨 Dieses Spieldokument scheint UNGÜLTIG/ALT zu sein.`);
      }
    }

    console.log(`\n--- Zusammenfassung ---`);
    console.log(`Insgesamt gefundene, einzigartige PlayerIDs in Spielen: ${allPlayerIdsFromGames.size}`);
    console.log(`IDs: [\n  ${Array.from(allPlayerIdsFromGames).join(',\n  ')}\n]`);
    
    if (gamesSnapshot.docs.length > 0 && allPlayerIdsFromGames.size === 0) {
      console.log(`\n!!! FAZIT: Es wurden KEINE PlayerIDs in den Spieldokumenten gefunden. Die Finalisierung wird daher korrekt abbrechen, ohne Rankings zu erstellen. Das Problem liegt in den Spieldaten, nicht in der Finalisierungslogik. !!!`);
    } else if (allPlayerIdsFromGames.size > 0) {
       console.log(`\nFAZIT: Es wurden PlayerIDs gefunden. Wenn trotzdem keine Rankings erstellt wurden, muss der Fehler an einer anderen Stelle in der Logik liegen, z.B. durch ein ungültiges Spieldokument.`);
    } else {
      console.log(`\nFAZIT: Keine Spiele für dieses Turnier gefunden.`);
    }

  } catch (error) {
    console.error("Ein unerwarteter Fehler ist im Debug-Skript aufgetreten:", error);
  }
}

// 🔧 FIX: 'program' Instanz erstellen
const program = new Command();

program
  .version('1.0.0')
  .description('Ein Skript zum detaillierten Debuggen eines einzelnen Turniers.')
  .option('-t, --tournament <id>', 'Die ID des zu debuggenden Turniers')
  .parse(process.argv);

const options = program.opts();

if (options.tournament) {
  debugSpecificTournament(options.tournament);
} else {
  console.log("Bitte geben Sie eine Turnier-ID mit der Option -t an.");
  program.help();
}
