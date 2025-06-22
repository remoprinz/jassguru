const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Import NACH der Initialisierung, um "app/no-app"-Fehler zu vermeiden
const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');

const db = admin.firestore();
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

/**
 * Berechnet die Dauer einer einzelnen Runde basierend auf den Timestamps
 * und wendet die Filterlogik an (2min <= dauer < 15min).
 * Dies ist eine Kopie der Logik aus `finalizeSession.ts`.
 */
function calculateRoundDuration(round, roundIndex, game) {
  let roundDuration = 0;

  if (round.timestamp && typeof round.timestamp === 'number') {
    const currentTimestamp = round.timestamp;
    let previousTimestamp;

    if (roundIndex > 0) {
      const previousRound = game.roundHistory?.[roundIndex - 1];
      if (previousRound?.timestamp && typeof previousRound.timestamp === 'number') {
        previousTimestamp = previousRound.timestamp;
      }
    } else {
      let completionTimestampMs;
      // Korrekter Zugriff auf Timestamp-Objekte aus Firestore
      if (game.completedAt && typeof game.completedAt.toMillis === 'function') {
        completionTimestampMs = game.completedAt.toMillis();
      } else if (game.timestampCompleted && typeof game.timestampCompleted.toMillis === 'function') {
        completionTimestampMs = game.timestampCompleted.toMillis();
      }

      if (completionTimestampMs && game.durationMillis && typeof game.durationMillis === 'number' && game.durationMillis > 0) {
        previousTimestamp = completionTimestampMs - game.durationMillis;
      } else if (game.durationMillis && typeof game.durationMillis === 'number' && game.roundHistory && game.roundHistory.length > 0) {
        previousTimestamp = currentTimestamp - (game.durationMillis / game.roundHistory.length);
      }
    }

    if (previousTimestamp && currentTimestamp > previousTimestamp) {
      roundDuration = currentTimestamp - previousTimestamp;
    }
  }

  // Fallback auf alte Felder (sollte nicht mehr oft vorkommen)
  if (roundDuration === 0) {
    if (round.durationMillis && typeof round.durationMillis === 'number') {
      roundDuration = round.durationMillis;
    } else if (round.startTime && round.endTime && typeof round.startTime === 'number' && typeof round.endTime === 'number') {
      roundDuration = round.endTime - round.startTime;
    }
  }

  // Filter anwenden
  if (roundDuration >= 120000 && roundDuration < 900000) {
    return roundDuration;
  }
  
  return 0; // Ungültige Dauer
}

async function recalculateAllRoundDurations() {
  console.log('🔄 Starte Neuberechnung der Runden-Statistiken für ALLE Sessions...');

  const summariesRef = db.collection(JASS_SUMMARIES_COLLECTION);
  const snapshot = await summariesRef.where('status', '==', 'completed').get();

  if (snapshot.empty) {
    console.log('✅ Keine abgeschlossenen Sessions gefunden. Nichts zu tun.');
    return;
  }

  console.log(`🔎 ${snapshot.docs.length} abgeschlossene Sessions gefunden. Verarbeite jede einzelne...`);
  
  const groupIdsToUpdate = new Set();
  const batchSize = 10;
  let batch = db.batch();
  let writeCounter = 0;

  for (const sessionDoc of snapshot.docs) {
    const sessionData = sessionDoc.data();
    const sessionId = sessionDoc.id;

    if (!sessionData.participantPlayerIds || sessionData.participantPlayerIds.length === 0) {
      console.log(`⏩ Überspringe Session ${sessionId}: Keine participantPlayerIds gefunden.`);
      continue;
    }
    
    // Sammle die Gruppen-ID für die finale Aggregation
    if (sessionData.groupId) {
      groupIdsToUpdate.add(sessionData.groupId);
    }
    
    console.log(`\n--- Verarbeite Session: ${sessionId} ---`);

    const playerNumberToIdMap = new Map();
    sessionData.participantPlayerIds.forEach((playerId, index) => {
      playerNumberToIdMap.set(index + 1, playerId);
    });

    const aggregatedRoundDurations = {};
    sessionData.participantPlayerIds.forEach(playerId => {
      aggregatedRoundDurations[playerId] = { totalDuration: 0, roundCount: 0 };
    });

    const completedGamesRef = sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION);
    const gamesSnapshot = await completedGamesRef.get();

    if (gamesSnapshot.empty) {
      console.log('  - Keine Spiele in dieser Session gefunden. Überspringe.');
      continue;
    }
    
    console.log(`  - ${gamesSnapshot.docs.length} Spiele gefunden.`);

    gamesSnapshot.forEach(gameDoc => {
      const game = gameDoc.data();
      if (game.roundHistory && Array.isArray(game.roundHistory)) {
        game.roundHistory.forEach((round, roundIndex) => {
          if (round.currentPlayer) {
            const playerId = playerNumberToIdMap.get(round.currentPlayer);
            if (playerId) {
              const duration = calculateRoundDuration(round, roundIndex, game);
              if (duration > 0) {
                aggregatedRoundDurations[playerId].totalDuration += duration;
                aggregatedRoundDurations[playerId].roundCount += 1;
              }
            }
          }
        });
      }
    });

    const hasValidData = Object.values(aggregatedRoundDurations).some(p => p.roundCount > 0);

    if (hasValidData) {
      console.log('  - ✅ Gültige Rundenzeiten gefunden. Füge Update zum Batch hinzu.');
      batch.update(sessionDoc.ref, { aggregatedRoundDurationsByPlayer: aggregatedRoundDurations });
      writeCounter++;
    } else {
      console.log('  - ℹ️ Keine Runden im gültigen Zeitfenster (2-15min). Stelle sicher, dass das Feld gelöscht ist.');
      batch.update(sessionDoc.ref, { aggregatedRoundDurationsByPlayer: admin.firestore.FieldValue.delete() });
      writeCounter++;
    }
    
    if (writeCounter >= batchSize) {
        console.log(`📝 Schreibe Batch mit ${writeCounter} Updates...`);
        await batch.commit();
        batch = db.batch();
        writeCounter = 0;
    }
  }
  
  if (writeCounter > 0) {
      console.log(`📝 Schreibe letzten Batch mit ${writeCounter} Updates...`);
      await batch.commit();
  }

  console.log('\n=================================================');
  console.log('✅ Neuberechnung der Session-Daten abgeschlossen!');
  console.log('=================================================');
  
  // SCHRITT 2: Gruppen-Statistiken neu auslösen
  if (groupIdsToUpdate.size > 0) {
    console.log(`\n🔄 Löse jetzt die Neuberechnung für ${groupIdsToUpdate.size} betroffene Gruppen aus...`);
    for (const groupId of groupIdsToUpdate) {
      try {
        console.log(`  - Berechne Gruppe ${groupId}...`);
        await updateGroupComputedStatsAfterSession(groupId);
        console.log(`  - ✅ Gruppe ${groupId} erfolgreich aktualisiert.`);
      } catch (error) {
        console.error(`  - ❌ Fehler bei der Aktualisierung von Gruppe ${groupId}:`, error);
      }
    }
    console.log('\n=================================================');
    console.log('✅ Alle Gruppen-Statistiken wurden aktualisiert.');
    console.log('=================================================');
  } else {
    console.log('\nℹ️ Keine Gruppen-IDs gefunden, die eine Statistik-Aktualisierung benötigen.');
  }
}

recalculateAllRoundDurations().catch(console.error); 