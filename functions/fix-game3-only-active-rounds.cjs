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

async function fixGame3OnlyActiveRounds() {
  console.log('🔧 Korrigiere Spiel 3 - nur aktive Runden...\n');
  
  try {
    // Hole Spiel 3 Daten
    const sessionDoc = await db.collection('jassGameSummaries').doc(SESSION_ID);
    const game3Doc = await sessionDoc.collection('completedGames').doc(GAME_3_ID).get();
    
    const game3Data = game3Doc.data();
    
    console.log('📋 Alle Runden (aktiv und inaktiv):');
    game3Data.roundHistory.forEach((round, index) => {
      console.log(`Runde ${index}: ${round.farbe} - Player ${round.currentPlayer} - isActive: ${round.isActive !== false ? 'true' : 'false'}`);
    });
    
    // Filter nur aktive Runden
    const activeRounds = game3Data.roundHistory.filter(round => round.isActive !== false);
    console.log(`\n✅ Gefiltert: ${activeRounds.length} aktive Runden von ${game3Data.roundHistory.length} total`);
    
    console.log('\n📋 Nur aktive Runden:');
    activeRounds.forEach((round, index) => {
      console.log(`Screenshot Runde ${index + 1}: ${round.farbe}`);
    });
    
    // Das korrekte Pattern für die aktiven Runden:
    // Basierend auf Screenshots: L, R, L, R, L, R, L, L, L, R, L, R
         const correctPatternForActiveRounds = [
       1, // Screenshot Runde 1: Schilten -> Studi (LINKS)
       2, // Screenshot Runde 2: Schilten -> Michael (RECHTS)  
       3, // Screenshot Runde 3: Rosen -> Remo (LINKS)
       4, // Screenshot Runde 4: 3x3 -> Roger (RECHTS)
       1, // Screenshot Runde 5: Eichel -> Studi (LINKS)
       2, // Screenshot Runde 6: Misère -> Michael (RECHTS)
       3, // Screenshot Runde 7: Eichel -> Remo (LINKS)
       1, // Screenshot Runde 8: Schilten -> Studi (LINKS)
       3, // Screenshot Runde 9: Rosen -> Remo (LINKS)
       2, // Screenshot Runde 10: Eichel -> Michael (RECHTS)
       1, // Screenshot Runde 11: Unde -> Studi (LINKS)
       2  // Screenshot Runde 12: Eichel -> Michael (RECHTS)
     ];
    
    console.log('\n🎯 Korrekte Zuordnung für aktive Runden:');
    activeRounds.forEach((round, index) => {
      if (index < correctPatternForActiveRounds.length) {
        const correctPlayer = correctPatternForActiveRounds[index];
        const playerName = game3Data.playerNames[correctPlayer];
        const isBottom = correctPlayer === 1 || correctPlayer === 3;
        const side = isBottom ? 'LINKS' : 'RECHTS';
        
        console.log(`Screenshot Runde ${index + 1}: ${round.farbe} -> Player ${correctPlayer} (${playerName}, ${side})`);
      }
    });
    
    // Korrigiere die roundHistory mit dem neuen Pattern
    let activeRoundIndex = 0;
    const correctedRoundHistory = game3Data.roundHistory.map((round, index) => {
      if (round.isActive !== false) {
        // Aktive Runde - Pattern anwenden
        const correctPlayer = correctPatternForActiveRounds[activeRoundIndex];
        const oldPlayer = round.currentPlayer;
        
        console.log(`\n✏️ Korrigiere aktive Runde ${activeRoundIndex}: ${round.farbe}`);
        console.log(`  ALT: Player ${oldPlayer} (${game3Data.playerNames[oldPlayer]})`);
        console.log(`  NEU: Player ${correctPlayer} (${game3Data.playerNames[correctPlayer]})`);
        
        activeRoundIndex++;
        
        return {
          ...round,
          currentPlayer: correctPlayer
        };
      } else {
        // Inaktive Runde - unverändert lassen
        console.log(`\n⏭️ Überspringe inaktive Runde: ${round.farbe} (Player ${round.currentPlayer})`);
        return round;
      }
    });
    
    // Schreibe korrigierte Daten
    await game3Doc.ref.update({
      roundHistory: correctedRoundHistory,
      lastUpdated: admin.firestore.Timestamp.now(),
      'migrationHistory': admin.firestore.FieldValue.arrayUnion({
        script: 'fix-game3-only-active-rounds.cjs',
        timestamp: admin.firestore.Timestamp.now(),
        description: 'Korrigierte nur aktive Runden mit Screenshot-Pattern',
        version: '3.0'
      })
    });
    
    console.log('\n✅ Spiel 3 korrigiert - nur aktive Runden!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

fixGame3OnlyActiveRounds().then(() => {
  console.log('\n🏁 Korrektur abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 