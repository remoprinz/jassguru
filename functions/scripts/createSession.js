const admin = require('firebase-admin');

// Läd den Service-Account-Schlüssel.
// Stellen Sie sicher, dass die Datei unter 'jasstafel/functions/serviceAccountKey.json' liegt.
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Konfiguration ---
const newSessionId = '_JnhFz9Qvn5PIhmYqtrT6';
const groupId = 'Tz0wgIHMTlhvTtFastiJ';
const playerUids = [
    'AaTUBO0SbWVfStdHmD7zi3qAMww2', // Remo
    'R16Pv2RKBwaYtSGyL7UMThIyALg1', // Michael
    'j6joaEvLqKayu4GV580Dt7EsZQg1', // Roger
    'CF5nVG3vW7SS2omMu0ltF0zhKHs1'  // Claudia
];
const playerNames = { '1': 'Remo', '2': 'Michael', '3': 'Roger', '4': 'Claudia' };


// --- Zeitstempel ---
const startedAtTimestamp = admin.firestore.Timestamp.fromDate(new Date('2025-06-06T19:00:00.000+02:00'));
const endedAtTimestamp = new admin.firestore.Timestamp(1749161310, 64000000); // 6. Juni 2025 20:21:50.064


// --- Das komplette Datenobjekt ---
const sessionData = {
  // Hauptdokument-Felder
  gamesPlayed: 4,
  groupId: groupId,
  sessionId: newSessionId,
  status: 'completed',
  startedAt: startedAtTimestamp,
  endedAt: endedAtTimestamp,
  lastActivity: endedAtTimestamp,
  lastCompletedGameUpdate: endedAtTimestamp,
  participantUids: playerUids,
  playerNames: playerNames,
  finalScores: { bottom: 19346, top: 17413 },
  weisPoints: { bottom: 180, top: 380 },
  sessionTotalWeisPoints: { bottom: '180', top: '380' },
  finalStriche: {
    bottom: { berg: 3, matsch: 5, sieg: 4, kontermatsch: 0, schneider: 0 },
    top: { berg: 1, matsch: 3, sieg: 4, kontermatsch: 0, schneider: 0 }
  },
  teams: {
    teamA: { // Team Remo & Roger
      players: [
        { displayName: "Remo", playerId: "AaTUBO0SbWVfStdHmD7zi3qAMww2" },
        { displayName: "Roger", playerId: "j6joaEvLqKayu4GV580Dt7EsZQg1" }
      ]
    },
    teamB: { // Team Michael & Claudia
      players: [
        { displayName: "Michael", playerId: "R16Pv2RKBwaYtSGyL7UMThIyALg1" },
        { displayName: "Claudia", playerId: "CF5nVG3vW7SS2omMu0ltF0zhKHs1" }
      ]
    }
  },
  pairingIdentifiers: {
      teamA: "AaTUBO0SbWVfStdHmD7zi3qAMww2_j6joaEvLqKayu4GV580Dt7EsZQg1",
      teamB: "CF5nVG3vW7SS2omMu0ltF0zhKHs1_R16Pv2RKBwaYtSGyL7UMThIyALg1"
  },
  completedGames: JSON.parse(JSON.stringify({
    "1": {
        "activeGameId": "1eJCqxkHGYh9IEMM3TJC", "durationMillis": 2354953, "finalScores": { "bottom": 5092, "top": 3402 }, "finalStriche": { "bottom": { "sieg": 2, "matsch": 2, "schneider": 0, "kontermatsch": 0, "berg": 1 }, "top": { "sieg": 0, "matsch": 1, "schneider": 0, "kontermatsch": 0, "berg": 0 } }, "gameNumber": 1, "groupId": groupId, "initialStartingPlayer": 4, "participantUids": playerUids, "playerNames": playerNames, "roundHistory": [ ], "sessionId": newSessionId, "startingPlayer": 4, "timestampCompleted": new admin.firestore.Timestamp(1749147770, 0), "weisPoints": { "bottom": 0, "top": 0 }
    },
    "2": {
        "activeGameId": "YbYvtXDS8pbxvs9DiNF7", "durationMillis": 4529871, "finalScores": { "bottom": 5269, "top": 4300 }, "finalStriche": { "bottom": { "sieg": 2, "matsch": 2, "schneider": 0, "kontermatsch": 0, "berg": 1 }, "top": { "sieg": 0, "matsch": 0, "schneider": 0, "kontermatsch": 0, "berg": 0 } }, "gameNumber": 2, "groupId": groupId, "initialStartingPlayer": 4, "participantUids": playerUids, "playerNames": playerNames, "roundHistory": [ ], "sessionId": newSessionId, "startingPlayer": 4, "timestampCompleted": new admin.firestore.Timestamp(1749152301, 0), "weisPoints": { "bottom": 0, "top": 0 }
    },
    "3": {
        "activeGameId": "DlbRLA6Fx2KMplTj4YVE", "durationMillis": 3581077, "finalScores": { "bottom": 4308, "top": 4987 }, "finalStriche": { "bottom": { "sieg": 0, "matsch": 0, "schneider": 0, "kontermatsch": 0, "berg": 0 }, "top": { "sieg": 2, "matsch": 1, "schneider": 0, "kontermatsch": 0, "berg": 1 } }, "gameNumber": 3, "groupId": groupId, "initialStartingPlayer": 4, "participantUids": playerUids, "playerNames": playerNames, "roundHistory": [ ], "sessionId": newSessionId, "startingPlayer": 2, "timestampCompleted": new admin.firestore.Timestamp(1749156329, 0), "weisPoints": { "bottom": 0, "top": 0 }
    },
    "4": {
        "activeGameId": "k8a4OIHjZCmef8kCTYci", "completedAt": endedAtTimestamp, "durationMillis": 4980446, "finalScores": { "bottom": 4677, "top": 4724 }, "finalStriche": { "bottom": { "sieg": 0, "matsch": 1, "schneider": 0, "kontermatsch": 0, "berg": 1 }, "top": { "sieg": 2, "matsch": 1, "schneider": 0, "kontermatsch": 0, "berg": 0 } }, "gameNumber": 4, "groupId": groupId, "initialStartingPlayer": 3, "participantUids": playerUids, "playerNames": playerNames, "roundHistory": [ ], "sessionId": newSessionId, "startingPlayer": 4, "timestampCompleted": endedAtTimestamp, "weisPoints": { "bottom": 0, "top": 80 }
    }
  })) // Wir lassen roundHistory weg, da es sehr gross ist und für die Statistik nicht benötigt wird.
};

async function createNewSession() {
  try {
    console.log(`Versuche, neue Session mit ID zu erstellen: ${newSessionId}`);
    const docRef = db.collection('jassGameSummaries').doc(newSessionId);
    await docRef.set(sessionData);
    console.log('----------------------------------------------------');
    console.log('✅ ERFOLG! Die neue Jass-Session wurde erstellt.');
    console.log(`Sie können sie in Firebase unter jassGameSummaries/${newSessionId} überprüfen.`);
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ FEHLER beim Erstellen der neuen Session:', error);
  }
}

createNewSession(); 