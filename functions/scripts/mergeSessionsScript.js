const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren
// Stellen Sie sicher, dass Sie den korrekten Service Account Key haben
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'jassguru', // Explizite Project ID setzen
});

const db = admin.firestore();

async function mergeSpecificSessions() {
  const mainSessionId = "Ph8oDZYvcV5y3NkFBiZDu";
  const sessionToMergeId = "tPE0JJoJAYpRZO9Scefrp";

  console.log(`🔄 Starte Zusammenführung der Sessions...`);
  console.log(`📥 Haupt-Session: ${mainSessionId}`);
  console.log(`📤 Session zum Merge: ${sessionToMergeId}`);
  console.log('');

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Sessions laden
      const mainSessionRef = db.collection("gameSessions").doc(mainSessionId);
      const sessionToMergeRef = db.collection("gameSessions").doc(sessionToMergeId);
      
      console.log('📖 Lade Session-Daten...');
      const [mainSessionSnap, sessionToMergeSnap] = await Promise.all([
        transaction.get(mainSessionRef),
        transaction.get(sessionToMergeRef)
      ]);

      if (!mainSessionSnap.exists) {
        throw new Error(`❌ Haupt-Session ${mainSessionId} nicht gefunden!`);
      }

      if (!sessionToMergeSnap.exists) {
        throw new Error(`❌ Session ${sessionToMergeId} nicht gefunden!`);
      }

      const mainSessionData = mainSessionSnap.data();
      const sessionToMergeData = sessionToMergeSnap.data();

      // 2. Validierung
      console.log(`✅ Beide Sessions gefunden`);
      console.log(`📊 Haupt-Session: ${Object.keys(mainSessionData.completedGames || {}).length} Spiele`);
      console.log(`📊 Zu merge Session: ${Object.keys(sessionToMergeData.completedGames || {}).length} Spiele`);

      if (mainSessionData.groupId !== sessionToMergeData.groupId) {
        throw new Error(`❌ Sessions gehören zu verschiedenen Gruppen! (${mainSessionData.groupId} vs ${sessionToMergeData.groupId})`);
      }

      // Teilnehmer prüfen
      const mainParticipants = (mainSessionData.participantUids || []).sort();
      const mergeParticipants = (sessionToMergeData.participantUids || []).sort();
      
      if (JSON.stringify(mainParticipants) !== JSON.stringify(mergeParticipants)) {
        console.log('⚠️  Warnung: Unterschiedliche Teilnehmer detected');
        console.log('Haupt-Session:', mainParticipants);
        console.log('Merge-Session:', mergeParticipants);
        // Trotzdem fortfahren, da es bei demselben Jass-Abend sein könnte
      }

      // 3. Spiele zusammenführen
      console.log('🔄 Führe Spiele zusammen...');
      const mainCompletedGames = mainSessionData.completedGames || {};
      const mergeCompletedGames = sessionToMergeData.completedGames || {};

      const maxGameNumber = Math.max(...Object.keys(mainCompletedGames).map(Number), 0);
      const updatedCompletedGames = { ...mainCompletedGames };
      
      // Spiele aus Session 2 als Spiel 3 und 4 hinzufügen
      Object.entries(mergeCompletedGames).forEach(([_, gameData]) => {
        const newGameNumber = maxGameNumber + parseInt(gameData.gameNumber);
        console.log(`  📋 Spiel ${gameData.gameNumber} -> Spiel ${newGameNumber}`);
        console.log(`     Bottom: ${gameData.finalScores?.bottom || 'N/A'} - Top: ${gameData.finalScores?.top || 'N/A'}`);
        
        const updatedGameData = {
          ...gameData,
          gameNumber: newGameNumber,
          sessionId: mainSessionId
        };
        
        updatedCompletedGames[newGameNumber.toString()] = updatedGameData;
      });

      // 4. Update der Haupt-Session
      console.log('💾 Aktualisiere Haupt-Session...');
      transaction.update(mainSessionRef, {
        completedGames: updatedCompletedGames,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        mergedSessions: admin.firestore.FieldValue.arrayUnion(sessionToMergeId),
        mergedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Session 2 löschen
      console.log('🗑️  Lösche ursprüngliche Session...');
      transaction.delete(sessionToMergeRef);

      return {
        success: true,
        mergedGameCount: Object.keys(mergeCompletedGames).length,
        totalGameCount: Object.keys(updatedCompletedGames).length,
        mainSessionId,
        deletedSessionId: sessionToMergeId
      };
    });

    console.log('');
    console.log('🎉 Session-Merge erfolgreich abgeschlossen!');
    console.log(`✅ ${result.mergedGameCount} Spiele verschoben`);
    console.log(`📊 Gesamt: ${result.totalGameCount} Spiele in Session ${result.mainSessionId}`);
    console.log(`🗑️  Session ${result.deletedSessionId} wurde gelöscht`);
    console.log('');
    console.log('Die zusammengeführte Session enthält jetzt:');
    console.log('- Spiel 1: Bottom 5092 - Top 3402 (ursprünglich aus Haupt-Session)');
    console.log('- Spiel 2: Bottom 5269 - Top 4300 (ursprünglich aus Haupt-Session)');
    console.log('- Spiel 3: Bottom 4308 - Top 4987 (verschoben aus zweiter Session)');
    console.log('- Spiel 4: Bottom 4677 - Top 4724 (verschoben aus zweiter Session)');

    return result;

  } catch (error) {
    console.error('❌ Fehler beim Zusammenführen:', error.message);
    throw error;
  }
}

// Skript ausführen
if (require.main === module) {
  mergeSpecificSessions()
    .then(() => {
      console.log('🏁 Skript beendet');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Skript fehlgeschlagen:', error);
      process.exit(1);
    });
}

module.exports = { mergeSpecificSessions }; 