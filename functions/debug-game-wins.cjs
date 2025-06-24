const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert('./serviceAccountKey.json'),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

async function debugGameWins() {
  console.log('🔍 DEBUG: Analysiere Game Win Berechnung...');
  
  try {
    const sessionsSnapshot = await db
      .collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', 'b16c1120111b7d9e7d733837')
      .where('status', '==', 'completed')
      .get();

    let totalGameWinsFromData = 0;
    let totalGamesFromData = 0;

    console.log(`\n📊 Analysiere ${sessionsSnapshot.size} Sessions:\n`);

    for (const sessionDoc of sessionsSnapshot.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      console.log(`=== SESSION: ${sessionId.substring(0, 8)}... ===`);
      console.log(`Turnier: ${session.tournamentId ? 'JA' : 'NEIN'}`);
      
      const winsFromSession = session.gameWinsByPlayer?.['b16c1120111b7d9e7d733837']?.wins || 0;
      const gamesFromSession = session.gamesPlayed || (session.gameResults?.length) || 0;
      
      console.log(`gameWinsByPlayer: ${winsFromSession} Siege`);
      console.log(`gamesPlayed: ${gamesFromSession} Spiele`);
      
      if (session.gameResults) {
        let actualWins = 0;
        console.log('🎮 Manuelle Zählung:');
        
        for (const game of session.gameResults) {
          const gamePlayerTeam = getPlayerTeamInGame('b16c1120111b7d9e7d733837', game);
          if (gamePlayerTeam) {
            const won = game.winnerTeam === gamePlayerTeam;
            if (won) actualWins++;
            console.log(`   Spiel ${game.gameNumber}: Team ${gamePlayerTeam}, Winner: ${game.winnerTeam} → ${won ? 'SIEG' : 'NIEDERLAGE'}`);
          }
        }
        console.log(`Manuelle Zählung: ${actualWins}/${session.gameResults.length} Siege`);
        console.log(`Session-Daten: ${winsFromSession}/${gamesFromSession} Siege`);
        
        if (actualWins !== winsFromSession) {
          console.log(`❌ DISKREPANZ! Manual: ${actualWins}, Session: ${winsFromSession}`);
        }
      }
      
      totalGameWinsFromData += winsFromSession;
      totalGamesFromData += gamesFromSession;
      console.log('');
    }

    console.log('🎯 FINALE SUMME:');
    console.log(`   Total Game Wins (Session-Daten): ${totalGameWinsFromData}`);
    console.log(`   Total Games (Session-Daten): ${totalGamesFromData}`);
    console.log(`   Win-Rate (Session-Daten): ${((totalGameWinsFromData / totalGamesFromData) * 100).toFixed(1)}%`);

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

debugGameWins()
  .then(() => {
    console.log('🎉 Debug abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Kritischer Fehler:', error);
    process.exit(1);
  });
