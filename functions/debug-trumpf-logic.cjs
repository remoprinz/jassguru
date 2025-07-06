const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugTrumpfLogic() {
  console.log('🎯 Analysiere Trumpf-Zählungs-Logik...\n');

  try {
    // Schaue eine Regular Session an, die aggregatedTrumpfCountsByPlayer hat
    const sessionId = 'GvshcbgPDCtbhCeqHApvk'; // Diese hat Trumpf-Daten
    
    console.log(`📋 Analysiere Session: ${sessionId}\n`);
    
    const sessionDoc = await db.collection('jassGameSummaries').doc(sessionId).get();
    if (!sessionDoc.exists) {
      console.log('❌ Session nicht gefunden');
      return;
    }

    const sessionData = sessionDoc.data();
    
    console.log(`🎮 Session Info:`);
    console.log(`- Spiele: ${sessionData.gamesPlayed || 0}`);
    console.log(`- Teilnehmer: ${sessionData.participantPlayerIds?.length || 0}`);
    console.log(`- Teilnehmer IDs: ${sessionData.participantPlayerIds?.join(', ') || 'Keine'}`);
    
    // Schaue die aggregierten Trumpf-Daten an
    if (sessionData.aggregatedTrumpfCountsByPlayer) {
      console.log(`\n🃏 Aggregierte Trumpf-Zählungen:`);
      
      let totalTrumpfEntriesPerPlayer = {};
      
      Object.entries(sessionData.aggregatedTrumpfCountsByPlayer).forEach(([playerId, trumpfCounts]) => {
        const playerName = sessionData.playerNames ? 
          Object.values(sessionData.playerNames).find((name, index) => 
            sessionData.participantPlayerIds[index] === playerId) || 'Unbekannt' 
          : 'Unbekannt';
        
        const totalTrumpfEntries = Object.values(trumpfCounts).reduce((sum, count) => sum + count, 0);
        totalTrumpfEntriesPerPlayer[playerId] = totalTrumpfEntries;
        
        console.log(`\n  👤 ${playerName} (${playerId}):`);
        console.log(`     - Gesamte Trumpf-Einträge: ${totalTrumpfEntries}`);
        Object.entries(trumpfCounts).forEach(([trumpf, count]) => {
          console.log(`     - ${trumpf}: ${count}`);
        });
      });
      
      // Analysiere die Logik
      console.log(`\n🔍 LOGIK-ANALYSE:`);
      console.log(`- Anzahl Spiele: ${sessionData.gamesPlayed || 0}`);
      
      const trumpfEntriesArray = Object.values(totalTrumpfEntriesPerPlayer);
      const minEntries = Math.min(...trumpfEntriesArray);
      const maxEntries = Math.max(...trumpfEntriesArray);
      const avgEntries = trumpfEntriesArray.reduce((sum, count) => sum + count, 0) / trumpfEntriesArray.length;
      
      console.log(`- Min Trumpf-Einträge pro Spieler: ${minEntries}`);
      console.log(`- Max Trumpf-Einträge pro Spieler: ${maxEntries}`);
      console.log(`- Durchschnitt Trumpf-Einträge pro Spieler: ${avgEntries.toFixed(1)}`);
      
      // Interpretation
      console.log(`\n💡 INTERPRETATION:`);
      if (avgEntries <= (sessionData.gamesPlayed || 0)) {
        console.log(`✅ THEORIE 1: Nur der Ansager bekommt die Trumpffarbe`);
        console.log(`   → Jeder Spieler ansagt ca. ${(avgEntries / (sessionData.gamesPlayed || 1)).toFixed(1)} Spiele von ${sessionData.gamesPlayed}`);
      } else {
        console.log(`✅ THEORIE 2: ALLE Spieler bekommen ALLE Trumpffarben`);
        console.log(`   → Jeder Spieler hat ${(avgEntries / (sessionData.gamesPlayed || 1)).toFixed(1)}x so viele Einträge wie Spiele`);
        console.log(`   → Das deutet darauf hin, dass mehrere Trumpffarben pro Spiel gezählt werden`);
      }
      
      // Prüfe ob alle Spieler ähnliche Zahlen haben
      const variance = trumpfEntriesArray.reduce((sum, count) => sum + Math.pow(count - avgEntries, 2), 0) / trumpfEntriesArray.length;
      const standardDeviation = Math.sqrt(variance);
      
      console.log(`\n📊 VERTEILUNG:`);
      console.log(`- Standardabweichung: ${standardDeviation.toFixed(2)}`);
      
      if (standardDeviation < 2) {
        console.log(`✅ Alle Spieler haben ähnliche Trumpf-Zahlen → Wahrscheinlich bekommen ALLE die gleichen Trumpffarben`);
      } else {
        console.log(`⚠️ Spieler haben sehr unterschiedliche Trumpf-Zahlen → Möglicherweise nur Ansager`);
      }
    }
    
    // Schaue in completedGames für detailliertere Analyse
    console.log(`\n🔍 Detailanalyse completedGames:`);
    
    try {
      const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
      if (!completedGamesSnap.empty) {
        console.log(`\n📁 ${completedGamesSnap.docs.length} completedGames gefunden:`);
        
        completedGamesSnap.docs.forEach((gameDoc) => {
          const gameData = gameDoc.data();
          console.log(`\n  🎮 Spiel ${gameData.gameNumber || gameDoc.id}:`);
          
          // Suche nach Trumpf-relevanten Feldern
          Object.keys(gameData).forEach(key => {
            if (key.toLowerCase().includes('trumpf') || key.toLowerCase().includes('starting') || key.toLowerCase().includes('ansag')) {
              console.log(`    - ${key}: ${JSON.stringify(gameData[key])}`);
            }
          });
          
          // Schaue roundHistory für Trumpf-Info
          if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
            console.log(`    - Runden: ${gameData.roundHistory.length}`);
            gameData.roundHistory.forEach((round, index) => {
              if (round.trumpf || round.trumpfart || round.gameType) {
                console.log(`      Runde ${index + 1}: trumpf=${round.trumpf}, trumpfart=${round.trumpfart}, gameType=${round.gameType}`);
              }
            });
          }
        });
      }
    } catch (error) {
      console.log(`❌ Fehler beim Lesen completedGames: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

debugTrumpfLogic().then(() => {
  console.log('\n🏁 Trumpf-Logik-Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Unbehandelter Fehler:', err);
  process.exit(1);
}); 