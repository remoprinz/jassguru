const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const SESSION_ID = 'GvshcbgPDCtbhCeqHApvk';
const GAME_3_ID = '3';

async function fixGame3CorrectPattern() {
  console.log('🔧 Korrigiere Spiel 3 mit korrektem Pattern aus Screenshots...\n');
  
  try {
    // Hole Spiel 3 Daten
    const sessionDoc = await db.collection('jassGameSummaries').doc(SESSION_ID);
    const game3Doc = await sessionDoc.collection('completedGames').doc(GAME_3_ID).get();
    
    const game3Data = game3Doc.data();
    
    // Das korrekte Pattern basierend auf Screenshot-Analyse:
    // L, R, L, R, L, R, L, R, R, L, R, L
    // Bottom, Top, Bottom, Top, Bottom, Top, Bottom, Top, Top, Bottom, Top, Bottom
    
    const correctPattern = [
      1, // Runde 0: Studi (Bottom) -> LINKS
      2, // Runde 1: Michael (Top) -> RECHTS  
      3, // Runde 2: Remo (Bottom) -> LINKS
      4, // Runde 3: Roger (Top) -> RECHTS
      1, // Runde 4: Studi (Bottom) -> LINKS
      2, // Runde 5: Michael (Top) -> RECHTS
      3, // Runde 6: Remo (Bottom) -> LINKS
      2, // Runde 7: Michael (Top) -> RECHTS
      4, // Runde 8: Roger (Top) -> RECHTS
      3, // Runde 9: Remo (Bottom) -> LINKS
      2, // Runde 10: Michael (Top) -> RECHTS
      1, // Runde 11: Studi (Bottom) -> LINKS
      2  // Runde 12: Michael (Top) -> RECHTS
    ];
    
    console.log('📋 Korrigiere mit Pattern:');
    correctPattern.forEach((player, index) => {
      const isBottom = player === 1 || player === 3;
      const side = isBottom ? 'LINKS' : 'RECHTS';
      const playerName = game3Data.playerNames[player];
      console.log(`Runde ${index}: Player ${player} (${playerName}) -> ${side}`);
    });
    
    // Korrigiere die roundHistory
    const correctedRoundHistory = game3Data.roundHistory.map((round, index) => {
      const correctPlayer = correctPattern[index];
      const oldPlayer = round.currentPlayer;
      
      console.log(`\nRunde ${index}: ${round.farbe}`);
      console.log(`  ALT: Player ${oldPlayer} (${game3Data.playerNames[oldPlayer]})`);
      console.log(`  NEU: Player ${correctPlayer} (${game3Data.playerNames[correctPlayer]})`);
      
      return {
        ...round,
        currentPlayer: correctPlayer
      };
    });
    
    // Schreibe korrigierte Daten
    await game3Doc.ref.update({
      roundHistory: correctedRoundHistory,
      lastUpdated: admin.firestore.Timestamp.now(),
      'migrationHistory': admin.firestore.FieldValue.arrayUnion({
        script: 'fix-game3-correct-pattern.cjs',
        timestamp: admin.firestore.Timestamp.now(),
        description: 'Korrigierte currentPlayer mit korrektem Pattern aus Screenshots',
        version: '2.0'
      })
    });
    
    console.log('\n✅ Spiel 3 mit korrektem Pattern erfolgreich korrigiert!');
    
    // Zeige finale Trumpf-Zuordnung
    console.log('\n🎯 FINALE Trumpf-Zuordnung:');
    correctedRoundHistory.forEach((round, index) => {
      if (round.farbe) {
        const playerName = game3Data.playerNames[round.currentPlayer];
        const isBottomTeam = round.currentPlayer === 1 || round.currentPlayer === 3;
        const teamName = isBottomTeam ? 'BOTTOM' : 'TOP';
        const side = isBottomTeam ? 'LINKS' : 'RECHTS';
        
        console.log(`Runde ${index}: ${round.farbe} -> ${playerName} (${teamName}, ${side})`);
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

fixGame3CorrectPattern().then(() => {
  console.log('\n🏁 Korrektur abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 