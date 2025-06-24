const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert('./serviceAccountKey.json'),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

const PLAYER_ID = 'b16c1120111b7d9e7d733837'; // Remo's player ID

async function debugPlayerCalculation() {
  console.log('🔍 DEBUG: Analysiere Remo\'s Spiel-Daten...');
  
  try {
    // Lade alle Sessions
    const sessionsSnapshot = await db
      .collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', PLAYER_ID)
      .where('status', '==', 'completed')
      .get();

    let totalGames = 0;
    let totalWins = 0;
    let totalPointsMade = 0;
    let totalPointsReceived = 0;
    let totalStricheMade = 0;
    let totalStricheReceived = 0;

    console.log(`\n📊 Gefundene Sessions: ${sessionsSnapshot.size}\n`);

    for (const sessionDoc of sessionsSnapshot.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      console.log(`=== SESSION: ${sessionId} ===`);
      console.log(`Turnier: ${session.tournamentId ? 'JA' : 'NEIN'}`);
      
      if (session.tournamentId && session.gameResults) {
        // Tournament: Iterate through gameResults
        console.log(`🏆 TURNIER mit ${session.gameResults.length} Spielen:`);
        
        for (const game of session.gameResults) {
          const playerTeam = getPlayerTeamInGame(PLAYER_ID, game);
          if (!playerTeam) continue;
          
          totalGames++;
          const won = game.winnerTeam === playerTeam;
          if (won) totalWins++;
          
          const pointsMade = game[`${playerTeam}Score`] || 0;
          const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
          const pointsReceived = game[`${opponentTeam}Score`] || 0;
          
          totalPointsMade += pointsMade;
          totalPointsReceived += pointsReceived;
          
          console.log(`   Spiel ${game.gameNumber}: ${playerTeam} ${pointsMade} vs ${opponentTeam} ${pointsReceived} → ${won ? 'SIEG' : 'NIEDERLAGE'}`);
        }
      } else {
        // Regular session
        console.log(`📝 NORMALE SESSION mit ${session.gamesPlayed || 0} Spielen:`);
        
        const playerTeam = getPlayerTeam(PLAYER_ID, session);
        if (!playerTeam) continue;
        
        const sessionGames = session.gamesPlayed || 0;
        const sessionWins = session.gameWinsByPlayer?.[PLAYER_ID]?.wins || 0;
        
        totalGames += sessionGames;
        totalWins += sessionWins;
        
        const pointsMade = session.finalScores?.[playerTeam] || 0;
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        const pointsReceived = session.finalScores?.[opponentTeam] || 0;
        
        totalPointsMade += pointsMade;
        totalPointsReceived += pointsReceived;
        
        const stricheMade = session.finalStriche?.[playerTeam]?.sieg || 0;
        const stricheReceived = session.finalStriche?.[opponentTeam]?.sieg || 0;
        
        totalStricheMade += stricheMade;
        totalStricheReceived += stricheReceived;
        
        console.log(`   Team: ${playerTeam}, Spiele: ${sessionGames}, Siege: ${sessionWins}`);
        console.log(`   Punkte: ${pointsMade} (gemacht) vs ${pointsReceived} (erhalten)`);
      }
      console.log('');
    }

    console.log('🎯 FINALE BERECHNUNG:');
    console.log(`   Total Spiele: ${totalGames}`);
    console.log(`   Total Siege: ${totalWins}`);
    console.log(`   Siegquote: ${totalWins}/${totalGames} = ${((totalWins / totalGames) * 100).toFixed(1)}%`);
    console.log(`   Total Punkte gemacht: ${totalPointsMade}`);
    console.log(`   Total Punkte erhalten: ${totalPointsReceived}`);
    console.log(`   Ø Punkte pro Spiel: ${((totalPointsMade + totalPointsReceived) / totalGames).toFixed(1)}`);
    console.log(`   Total Striche gemacht: ${totalStricheMade}`);
    console.log(`   Total Striche erhalten: ${totalStricheReceived}`);
    console.log(`   Ø Striche pro Spiel: ${((totalStricheMade + totalStricheReceived) / totalGames).toFixed(1)}`);

  } catch (error) {
    console.error('❌ FEHLER:', error);
  }
}

function getPlayerTeam(playerId, sessionData) {
  if (sessionData.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
    return 'bottom';
  }
  if (sessionData.teams?.top?.players?.some(p => p.playerId === playerId)) {
    return 'top';
  }
  return null;
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

debugPlayerCalculation()
  .then(() => {
    console.log('🎉 Debug abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Kritischer Fehler:', error);
    process.exit(1);
  });
