const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert('./serviceAccountKey.json'),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

async function debugTournamentPoints() {
  console.log('🔍 DEBUG: Analysiere Turnier-Punkte-Berechnung...');
  
  try {
    // Lade nur das Turnier
    const tournamentSession = await db
      .collection('jassGameSummaries')
      .doc('6eNr8fnsTO06jgCqjelt')
      .get();

    if (!tournamentSession.exists) {
      console.log('❌ Turnier nicht gefunden!');
      return;
    }

    const session = tournamentSession.data();
    const playerId = 'b16c1120111b7d9e7d733837'; // Remo

    console.log('📊 TURNIER-DATEN:');
    console.log(`   Tournament ID: ${session.tournamentId}`);
    console.log(`   Spiele: ${session.gameResults?.length || 0}`);
    console.log(`   Final Scores: bottom=${session.finalScores?.bottom}, top=${session.finalScores?.top}`);
    
    if (session.gameResults) {
      let totalPointsMade = 0;
      let totalPointsReceived = 0;
      
      console.log('\n🎮 SPIEL-DETAILS:');
      
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (!gamePlayerTeam) {
          console.log(`   Spiel ${game.gameNumber}: Remo nicht gefunden!`);
          continue;
        }
        
        const gameOpponentTeam = gamePlayerTeam === 'top' ? 'bottom' : 'top';
        
        const gamePointsMade = game.topScore && gamePlayerTeam === 'top' ? game.topScore : 
                              game.bottomScore && gamePlayerTeam === 'bottom' ? game.bottomScore : 0;
        const gamePointsReceived = game.topScore && gamePlayerTeam === 'bottom' ? game.topScore : 
                                  game.bottomScore && gamePlayerTeam === 'top' ? game.bottomScore : 0;
        
        totalPointsMade += gamePointsMade;
        totalPointsReceived += gamePointsReceived;
        
        console.log(`   Spiel ${game.gameNumber}: Team ${gamePlayerTeam}, Made: ${gamePointsMade}, Received: ${gamePointsReceived}`);
        console.log(`      Bottom: ${game.bottomScore}, Top: ${game.topScore}, Winner: ${game.winnerTeam}`);
      }
      
      console.log('\n📈 TURNIER-SUMME:');
      console.log(`   Total Points Made: ${totalPointsMade}`);
      console.log(`   Total Points Received: ${totalPointsReceived}`);
      console.log(`   Total Combined: ${totalPointsMade + totalPointsReceived}`);
      console.log(`   Ø pro Spiel: ${((totalPointsMade + totalPointsReceived) / session.gameResults.length).toFixed(1)}`);
    }

  } catch (error) {
    console.error('❌ FEHLER:', error);
  }
}

function getPlayerTeamInGame(playerId, gameResult) {
  if (gameResult.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
    return 'bottom';
  }
  if (gameResult.teams?.top?.players?.some(p => p.playerId === playerId)) {
    return 'top';
  }
  return null;
}

debugTournamentPoints()
  .then(() => {
    console.log('🎉 Debug abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Kritischer Fehler:', error);
    process.exit(1);
  });
