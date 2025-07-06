const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugRoundHistory() {
  console.log('🔍 Analysiere roundHistory für Trumpf-Daten...\n');

  try {
    const sessionId = 'GvshcbgPDCtbhCeqHApvk';
    console.log(`📋 Analysiere Session: ${sessionId}\n`);
    
    const sessionDoc = await db.collection('jassGameSummaries').doc(sessionId).get();
    const sessionData = sessionDoc.data();
    
    // Schaue in completedGames
    const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
    
    console.log(`📁 ${completedGamesSnap.docs.length} completedGames gefunden:\n`);
    
    let totalTrumpfEntries = {};
    
    completedGamesSnap.docs.forEach((gameDoc, gameIndex) => {
      const gameData = gameDoc.data();
      console.log(`🎮 === SPIEL ${gameData.gameNumber || gameIndex + 1} ===`);
      
      if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
        console.log(`🔄 ${gameData.roundHistory.length} Runden gefunden:`);
        
        gameData.roundHistory.forEach((round, roundIndex) => {
          console.log(`  Runde ${roundIndex + 1}:`);
          console.log(`    - trumpf: ${round.trumpf || 'NICHT VORHANDEN'}`);
          console.log(`    - trumpfart: ${round.trumpfart || 'NICHT VORHANDEN'}`);
          console.log(`    - gameType: ${round.gameType || 'NICHT VORHANDEN'}`);
          
          // Zähle Trumpf-Einträge
          if (round.trumpf) {
            if (!totalTrumpfEntries[round.trumpf]) {
              totalTrumpfEntries[round.trumpf] = 0;
            }
            totalTrumpfEntries[round.trumpf]++;
          }
          
          // Schaue nach anderen interessanten Feldern
          const roundKeys = Object.keys(round);
          const interessanteKeys = roundKeys.filter(key => 
            key.toLowerCase().includes('trumpf') || 
            key.toLowerCase().includes('ansag') ||
            key.toLowerCase().includes('spieler') ||
            key.toLowerCase().includes('player')
          );
          
          if (interessanteKeys.length > 1) { // Mehr als nur 'trumpf'
            console.log(`    - Weitere Keys: ${interessanteKeys.join(', ')}`);
            interessanteKeys.forEach(key => {
              if (key !== 'trumpf') {
                console.log(`      ${key}: ${JSON.stringify(round[key])}`);
              }
            });
          }
        });
        
        console.log(`\n`);
      } else {
        console.log(`❌ Keine roundHistory gefunden\n`);
      }
    });
    
    // Vergleiche mit aggregatedTrumpfCountsByPlayer
    console.log(`🎯 TRUMPF-VERGLEICH:`);
    console.log(`\nAus roundHistory extrahiert:`);
    const totalFromRounds = Object.values(totalTrumpfEntries).reduce((sum, count) => sum + count, 0);
    console.log(`- Gesamte Trumpf-Einträge: ${totalFromRounds}`);
    Object.entries(totalTrumpfEntries).forEach(([trumpf, count]) => {
      console.log(`  - ${trumpf}: ${count}`);
    });
    
    console.log(`\nAus aggregatedTrumpfCountsByPlayer:`);
    if (sessionData.aggregatedTrumpfCountsByPlayer) {
      const studi = sessionData.aggregatedTrumpfCountsByPlayer['PLaDRlPBo91yu5Ij8MOT2'];
      const studiTotal = Object.values(studi).reduce((sum, count) => sum + count, 0);
      console.log(`- Studi Gesamte: ${studiTotal}`);
      Object.entries(studi).forEach(([trumpf, count]) => {
        console.log(`  - ${trumpf}: ${count}`);
      });
      
      console.log(`\n💡 LOGIK-INTERPRETATION:`);
      if (totalFromRounds === studiTotal) {
        console.log(`✅ PERFEKTE ÜBEREINSTIMMUNG: Jeder Spieler bekommt ALLE Trumpffarben aus allen Runden`);
      } else if (totalFromRounds > 0) {
        console.log(`🤔 UNTERSCHIED: roundHistory hat ${totalFromRounds}, Studi hat ${studiTotal}`);
        console.log(`   → Faktor: ${(studiTotal / totalFromRounds).toFixed(2)}x`);
      }
    }

  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

debugRoundHistory().then(() => {
  console.log('\n🏁 RoundHistory-Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Unbehandelter Fehler:', err);
  process.exit(1);
}); 