const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const SESSION_ID = 'GvshcbgPDCtbhCeqHApvk';

// Hilfsfunktion um Trumpffarbe zu normalisieren
function normalizeTrumpfFarbe(farbe) {
  const mapping = {
    'Schilten': 'schilten',
    'Schellen': 'schellen', 
    'Rosen': 'rosen',
    'Eichel': 'eichel',
    'Unde': 'unde',
    'Quer': 'quer',
    '3x3': '3x3',
    'Slalom': 'slalom',
    'Misère': 'misere'
  };
  return mapping[farbe] || farbe.toLowerCase();
}

// Hilfsfunktion um Trumpf-Statistiken zu berechnen
function calculateTrumpfStats(roundHistory, playerNames) {
  const trumpColorsPlayed = [];
  const trumpfCountsByPlayer = {};
  
  // Initialisiere Zähler für alle Spieler
  Object.keys(playerNames).forEach(playerId => {
    trumpfCountsByPlayer[playerId] = {};
  });
  
  // Analysiere nur aktive Runden
  const activeRounds = roundHistory.filter(round => round.isActive !== false);
  
  console.log(`  📊 Analysiere ${activeRounds.length} aktive Runden von ${roundHistory.length} total`);
  
  activeRounds.forEach((round, index) => {
    const farbe = round.farbe;
    const currentPlayer = round.currentPlayer;
    const playerName = playerNames[currentPlayer];
    
    console.log(`    Runde ${index + 1}: ${farbe} -> Player ${currentPlayer} (${playerName})`);
    
    // Füge Trumpffarbe zur Liste hinzu
    trumpColorsPlayed.push(farbe);
    
    // Zähle Trumpf für Spieler
    const normalizedFarbe = normalizeTrumpfFarbe(farbe);
    if (!trumpfCountsByPlayer[currentPlayer][normalizedFarbe]) {
      trumpfCountsByPlayer[currentPlayer][normalizedFarbe] = 0;
    }
    trumpfCountsByPlayer[currentPlayer][normalizedFarbe]++;
  });
  
  return {
    trumpColorsPlayed,
    trumpfCountsByPlayer
  };
}

async function fixAllSessionGamesComplete() {
  console.log('🔧 Korrigiere alle Spiele der Session - Vollständig...\n');
  
  try {
    const sessionDoc = await db.collection('jassGameSummaries').doc(SESSION_ID);
    const completedGamesSnapshot = await sessionDoc.collection('completedGames').get();
    
    console.log(`📋 Gefunden: ${completedGamesSnapshot.size} Spiele\n`);
    
    // Verarbeite jedes Spiel
    for (const gameDoc of completedGamesSnapshot.docs) {
      const gameId = gameDoc.id;
      const gameData = gameDoc.data();
      
      console.log(`🎮 === SPIEL ${gameId} (Game ${gameData.gameNumber}) ===`);
      
      // Zeige alle Runden
      console.log('📋 Runden-Übersicht:');
      gameData.roundHistory.forEach((round, index) => {
        const status = round.isActive !== false ? '✅ AKTIV' : '❌ INAKTIV';
        console.log(`  ${index}: ${round.farbe} - Player ${round.currentPlayer} (${gameData.playerNames[round.currentPlayer]}) - ${status}`);
      });
      
      // Berechne Trumpf-Statistiken nur für aktive Runden
      const trumpfStats = calculateTrumpfStats(gameData.roundHistory, gameData.playerNames);
      
      console.log('\n📊 Neu berechnete Trumpf-Statistiken:');
      console.log('  🃏 trumpColorsPlayed:', trumpfStats.trumpColorsPlayed);
      console.log('  👥 trumpfCountsByPlayer:', JSON.stringify(trumpfStats.trumpfCountsByPlayer, null, 2));
      
      // Bereite Update-Daten vor
      const updateData = {
        trumpColorsPlayed: trumpfStats.trumpColorsPlayed,
        trumpfCountsByPlayer: trumpfStats.trumpfCountsByPlayer,
        lastUpdated: admin.firestore.Timestamp.now(),
        'migrationHistory': admin.firestore.FieldValue.arrayUnion({
          script: 'fix-all-session-games-complete.cjs',
          timestamp: admin.firestore.Timestamp.now(),
          description: 'Korrigierte Trumpf-Statistiken basierend nur auf aktiven Runden',
          version: '4.0',
          activeRoundsCount: trumpfStats.trumpColorsPlayed.length,
          totalRoundsCount: gameData.roundHistory.length
        })
      };
      
      // Schreibe korrigierte Daten
      await gameDoc.ref.update(updateData);
      
      console.log(`✅ Spiel ${gameId} korrigiert!\n`);
    }
    
    console.log('🎉 Alle Spiele der Session wurden korrigiert!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

fixAllSessionGamesComplete().then(() => {
  console.log('\n🏁 Vollständige Korrektur abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 