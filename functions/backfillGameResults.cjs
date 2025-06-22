const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

async function backfillGameResults() {
  console.log('🚀 Starting backfill of gameResults for all completed sessions...');

  try {
    // 1. Finde alle abgeschlossenen Sessions
    console.log('🔎 Step 1: Finding all completed sessions...');
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where('status', '==', 'completed')
      .get();

    console.log(`✅ Found ${sessionsSnap.docs.length} completed sessions to process.`);

    if (sessionsSnap.docs.length === 0) {
      console.log('No completed sessions found. Exiting.');
      return;
    }

    // 2. Iteriere über jede Session
    console.log('\n🔥 Step 2: Processing each session...');
    let processedCount = 0;
    const batchSize = 10;
    let batch = db.batch();
    let batchCounter = 0;

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      console.log(`  -> Processing session ${sessionId}...`);
      
      // Überspringe Sessions, die bereits gameResults haben
      if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
        console.log(`    Session ${sessionId} already has gameResults. Skipping.`);
        continue;
      }

      // 3. Lade completedGames für diese Session
      const gamesSnap = await sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION)
        .orderBy('gameNumber')
        .get();

      if (gamesSnap.empty) {
        console.log(`    No completed games found for session ${sessionId}. Skipping.`);
        continue;
      }

      // 4. Extrahiere Spiel-Ergebnisse
      const gameResults = [];
      const gameWinsByTeam = { top: 0, bottom: 0 };
      const gameWinsByPlayer = {};

      // Initialisiere Spieler-Statistiken
      if (sessionData.participantPlayerIds && Array.isArray(sessionData.participantPlayerIds)) {
        sessionData.participantPlayerIds.forEach(playerId => {
          gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
        });
      }

      gamesSnap.docs.forEach(gameDoc => {
        const gameData = gameDoc.data();
        
        if (gameData.finalScores && typeof gameData.gameNumber === 'number') {
          const topScore = gameData.finalScores.top || 0;
          const bottomScore = gameData.finalScores.bottom || 0;
          let winnerTeam;
          
          if (topScore > bottomScore) {
            winnerTeam = 'top';
            gameWinsByTeam.top++;
          } else {
            winnerTeam = 'bottom';
            gameWinsByTeam.bottom++;
          }
          
          // Füge Spiel-Ergebnis hinzu
          gameResults.push({
            gameNumber: gameData.gameNumber,
            winnerTeam,
            topScore,
            bottomScore
          });
          
          // Aktualisiere Spieler-Statistiken basierend auf Team-Zuordnung
          if (sessionData.teams) {
            const topPlayerIds = sessionData.teams.top?.players?.map(p => p.playerId) || [];
            const bottomPlayerIds = sessionData.teams.bottom?.players?.map(p => p.playerId) || [];
            
            if (winnerTeam === 'top') {
              topPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].wins++;
              });
              bottomPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].losses++;
              });
            } else {
              bottomPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].wins++;
              });
              topPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].losses++;
              });
            }
          }
        }
      });

      // Sortiere gameResults nach gameNumber
      gameResults.sort((a, b) => a.gameNumber - b.gameNumber);

      // 5. Bereite Update-Daten vor
      const updateData = {};
      
      if (gameResults.length > 0) {
        updateData.gameResults = gameResults;
        updateData.gameWinsByTeam = gameWinsByTeam;
        updateData.gameWinsByPlayer = gameWinsByPlayer;
        
        console.log(`    Extracted ${gameResults.length} game results for session ${sessionId}`);
        console.log(`    Team wins: top=${gameWinsByTeam.top}, bottom=${gameWinsByTeam.bottom}`);
      }

      // 6. Füge zum Batch hinzu
      if (Object.keys(updateData).length > 0) {
        batch.update(sessionDoc.ref, updateData);
        batchCounter++;
      }

      if (batchCounter >= batchSize) {
        console.log(`  📦 Committing batch of ${batchCounter} sessions...`);
        await batch.commit();
        batch = db.batch();
        batchCounter = 0;
      }
      
      processedCount++;
    }

    // Commit des letzten, unvollständigen Batches
    if (batchCounter > 0) {
      console.log(`  📦 Committing final batch of ${batchCounter} sessions...`);
      await batch.commit();
    }

    console.log(`\n🎉 Success! Processed ${processedCount} sessions and backfilled gameResults.`);

  } catch (error) {
    console.error('❌ An error occurred during the backfill process:', error);
  }
}

backfillGameResults().then(() => {
  console.log('Script finished.');
}).catch(err => {
  console.error('Script failed with unhandled error:', err);
}); 