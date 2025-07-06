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

async function fixGame3PlayerOrder() {
  console.log('🔧 Korrigiere Spieler-Reihenfolge in Spiel 3...\n');
  
  try {
    // Hole Spiel 3 Daten
    const sessionDoc = await db.collection('jassGameSummaries').doc(SESSION_ID);
    const game3Doc = await sessionDoc.collection('completedGames').doc(GAME_3_ID).get();
    
    if (!game3Doc.exists) {
      console.log('❌ Spiel 3 nicht gefunden!');
      return;
    }
    
    const game3Data = game3Doc.data();
    console.log('📋 Spiel 3 gefunden mit', game3Data.roundHistory?.length || 0, 'Runden');
    
    if (!game3Data.roundHistory || !Array.isArray(game3Data.roundHistory)) {
      console.log('❌ Keine roundHistory gefunden!');
      return;
    }
    
    console.log('\n🔍 Aktuelle Player-Reihenfolge:');
    game3Data.roundHistory.forEach((round, index) => {
      console.log(`Runde ${index}: Player ${round.currentPlayer} -> ${round.farbe}`);
    });
    
    // Korrigiere die Player-Reihenfolge
    // Bottom Team eröffnet: Studi (1) -> Michael (2) -> Remo (3) -> Roger (4) -> repeat
    console.log('\n🔧 Korrigiere currentPlayer Reihenfolge...');
    
    const correctedRoundHistory = game3Data.roundHistory.map((round, index) => {
      // Starting player ist 1 (Studi), da Bottom Team eröffnet
      const newCurrentPlayer = ((index % 4) + 1); // 1, 2, 3, 4, 1, 2, 3, 4, ...
      
      const oldPlayer = round.currentPlayer;
      const newPlayer = newCurrentPlayer;
      
      console.log(`Runde ${index}: ${round.farbe} - Player ${oldPlayer} -> ${newPlayer}`);
      
      return {
        ...round,
        currentPlayer: newPlayer
      };
    });
    
    console.log('\n📊 Neue Player-Reihenfolge:');
    correctedRoundHistory.forEach((round, index) => {
      const playerName = game3Data.playerNames[round.currentPlayer] || `Player ${round.currentPlayer}`;
      console.log(`Runde ${index}: Player ${round.currentPlayer} (${playerName}) -> ${round.farbe}`);
    });
    
    // Schreibe korrigierte Daten zurück
    console.log('\n💾 Schreibe korrigierte Daten...');
    
    await game3Doc.ref.update({
      roundHistory: correctedRoundHistory,
      lastUpdated: admin.firestore.Timestamp.now(),
      'migrationHistory': admin.firestore.FieldValue.arrayUnion({
        script: 'fix-game3-player-order.cjs',
        timestamp: admin.firestore.Timestamp.now(),
        description: 'Korrigierte currentPlayer Reihenfolge in Spiel 3 - Bottom Team eröffnete',
        version: '1.0'
      })
    });
    
    console.log('✅ Spiel 3 Player-Reihenfolge erfolgreich korrigiert!');
    
    // Zeige neue Trumpf-Zuordnung
    console.log('\n🎯 Neue Trumpf-Zuordnung:');
    correctedRoundHistory.forEach((round, index) => {
      if (round.farbe) {
        const playerName = game3Data.playerNames[round.currentPlayer] || `Player ${round.currentPlayer}`;
        const isBottomTeam = round.currentPlayer === 1 || round.currentPlayer === 3; // Studi oder Remo
        const teamName = isBottomTeam ? 'BOTTOM' : 'TOP';
        
        console.log(`Runde ${index}: ${round.farbe} -> ${playerName} (${teamName})`);
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Korrigieren:', error);
  }
}

fixGame3PlayerOrder().then(() => {
  console.log('\n🏁 Korrektur abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 