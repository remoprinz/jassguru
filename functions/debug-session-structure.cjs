const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const STUDI_ID = 'PLaDRlPBo91yu5Ij8MOT2';
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';

async function debugSessionStructure() {
  console.log('🔍 Analysiere Session-Strukturen für Trumpf-Daten...\n');

  try {
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where('participantPlayerIds', 'array-contains', STUDI_ID)
      .where('status', '==', 'completed')
      .get();

    console.log(`✅ ${sessionsSnap.docs.length} Sessions gefunden\n`);

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      const isTournament = Boolean(sessionData.tournamentId);
      
      console.log(`📋 === SESSION ${sessionId} (${isTournament ? 'Tournament' : 'Regular'}) ===`);
      console.log(`Spiele: ${sessionData.gamesPlayed || 0}`);
      
      // 1. Schaue in gameResults
      if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
        console.log(`\n🎯 GameResults (${sessionData.gameResults.length} Einträge):`);
        
        sessionData.gameResults.forEach((game, index) => {
          console.log(`  Spiel ${index + 1}:`);
          console.log(`    - trumpf: ${game.trumpf || 'NICHT VORHANDEN'}`);
          console.log(`    - trumpfart: ${game.trumpfart || 'NICHT VORHANDEN'}`);
          console.log(`    - gameType: ${game.gameType || 'NICHT VORHANDEN'}`);
          console.log(`    - topScore: ${game.topScore || 0}`);
          console.log(`    - bottomScore: ${game.bottomScore || 0}`);
          console.log(`    - winnerTeam: ${game.winnerTeam || 'NICHT VORHANDEN'}`);
          
          // Schaue tiefer in die Struktur
          const gameKeys = Object.keys(game);
          const interessanteKeys = gameKeys.filter(key => 
            key.toLowerCase().includes('trumpf') || 
            key.toLowerCase().includes('type') ||
            key.toLowerCase().includes('farbe')
          );
          
          if (interessanteKeys.length > 0) {
            console.log(`    - Weitere relevante Keys: ${interessanteKeys.join(', ')}`);
            interessanteKeys.forEach(key => {
              console.log(`      ${key}: ${JSON.stringify(game[key])}`);
            });
          }
          
          console.log(`    - Alle Keys: ${gameKeys.join(', ')}`);
        });
      } else {
        console.log('\n❌ Keine gameResults gefunden');
      }

      // 2. Schaue in completedGames Subkollektion
      try {
        const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
        if (!completedGamesSnap.empty) {
          console.log(`\n📁 CompletedGames Subkollektion (${completedGamesSnap.docs.length} Einträge):`);
          
          completedGamesSnap.docs.forEach((gameDoc, index) => {
            const gameData = gameDoc.data();
            console.log(`  CompletedGame ${index + 1} (${gameDoc.id}):`);
            console.log(`    - trumpf: ${gameData.trumpf || 'NICHT VORHANDEN'}`);
            console.log(`    - trumpfart: ${gameData.trumpfart || 'NICHT VORHANDEN'}`);
            console.log(`    - gameType: ${gameData.gameType || 'NICHT VORHANDEN'}`);
            
            // Schaue tiefer in die Struktur
            const gameKeys = Object.keys(gameData);
            const interessanteKeys = gameKeys.filter(key => 
              key.toLowerCase().includes('trumpf') || 
              key.toLowerCase().includes('type') ||
              key.toLowerCase().includes('farbe')
            );
            
            if (interessanteKeys.length > 0) {
              console.log(`    - Weitere relevante Keys: ${interessanteKeys.join(', ')}`);
              interessanteKeys.forEach(key => {
                console.log(`      ${key}: ${JSON.stringify(gameData[key])}`);
              });
            }
            
            console.log(`    - Alle Keys: ${gameKeys.join(', ')}`);
          });
        } else {
          console.log('\n📁 CompletedGames Subkollektion: Leer');
        }
      } catch (error) {
        console.log(`\n❌ Fehler beim Lesen der completedGames: ${error.message}`);
      }

      // 3. Schaue nach anderen trumpf-relevanten Feldern auf Session-Level
      console.log(`\n🔍 Session-Level Trumpf-Daten:`);
      const sessionKeys = Object.keys(sessionData);
      const trumpfKeys = sessionKeys.filter(key => 
        key.toLowerCase().includes('trumpf') || 
        key.toLowerCase().includes('type') ||
        key.toLowerCase().includes('farbe')
      );
      
      if (trumpfKeys.length > 0) {
        console.log(`- Trumpf-relevante Keys: ${trumpfKeys.join(', ')}`);
        trumpfKeys.forEach(key => {
          console.log(`  ${key}: ${JSON.stringify(sessionData[key])}`);
        });
      } else {
        console.log(`- Keine Trumpf-relevanten Keys auf Session-Level gefunden`);
      }
      
      console.log(`\n`);
    }

  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

debugSessionStructure().then(() => {
  console.log('🏁 Session-Struktur-Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Unbehandelter Fehler:', err);
  process.exit(1);
}); 