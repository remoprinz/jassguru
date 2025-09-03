const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function analyzeGameData() {
  try {
    console.log('=== Analyzing Game Win Statistics ===\n');
    
    // Analysiere Sessions in der größten Gruppe
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    const sessions = await db.collection(`groups/${groupId}/jassGameSummaries`).limit(3).get();
    
    for (const sessionDoc of sessions.docs) {
      const sessionId = sessionDoc.id;
      const data = sessionDoc.data();
      
      console.log('\n=== Session:', sessionId, '===');
      console.log('Games Played:', data.gamesPlayed || 'N/A');
      console.log('Status:', data.status);
      
      // Analysiere gameResults vs. andere Felder
      if (data.gameResults && Array.isArray(data.gameResults)) {
        const topWins = data.gameResults.filter(g => g.winnerTeam === 'top').length;
        const bottomWins = data.gameResults.filter(g => g.winnerTeam === 'bottom').length;
        const drawGames = data.gameResults.filter(g => g.winnerTeam === 'draw').length;
        
        console.log('\nGameResults Analysis:');
        console.log('  Total games in gameResults:', data.gameResults.length);
        console.log('  Top team wins:', topWins);
        console.log('  Bottom team wins:', bottomWins);
        console.log('  Draw games:', drawGames);
        
        // Vergleiche mit gameWinsByTeam
        if (data.gameWinsByTeam) {
          console.log('\nGameWinsByTeam:');
          console.log('  Top team wins:', data.gameWinsByTeam.top);
          console.log('  Bottom team wins:', data.gameWinsByTeam.bottom);
          
          const topConsistent = topWins === data.gameWinsByTeam.top;
          const bottomConsistent = bottomWins === data.gameWinsByTeam.bottom;
          
          console.log('\n✓ Consistency Check:');
          console.log('  Top team:', topConsistent ? '✅ CONSISTENT' : '❌ INCONSISTENT');
          console.log('  Bottom team:', bottomConsistent ? '✅ CONSISTENT' : '❌ INCONSISTENT');
          
          if (!topConsistent || !bottomConsistent) {
            console.log('  🚨 PROBLEM DETECTED!');
          }
        }
        
        // Analysiere eventCounts.sieg
        if (data.eventCounts) {
          console.log('\nEventCounts.sieg:');
          console.log('  Top team sieg events:', data.eventCounts.top?.sieg || 0);
          console.log('  Bottom team sieg events:', data.eventCounts.bottom?.sieg || 0);
          
          const topEventConsistent = topWins === (data.eventCounts.top?.sieg || 0);
          const bottomEventConsistent = bottomWins === (data.eventCounts.bottom?.sieg || 0);
          
          console.log('\n✓ EventCounts Consistency:');
          console.log('  Top team:', topEventConsistent ? '✅ CONSISTENT' : '❌ INCONSISTENT');
          console.log('  Bottom team:', bottomEventConsistent ? '✅ CONSISTENT' : '❌ INCONSISTENT');
        }
        
        // Analysiere die ersten 2 individuellen Spiele
        console.log('\n--- Individual Games (first 2) ---');
        const completedGamesRef = db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`);
        const completedGames = await completedGamesRef.orderBy('gameNumber').limit(2).get();
        
        console.log('CompletedGames found:', completedGames.size);
        
        completedGames.docs.forEach((gameDoc) => {
          const gameData = gameDoc.data();
          const gameNumber = gameData.gameNumber || parseInt(gameDoc.id);
          const gameResult = data.gameResults.find(g => g.gameNumber === gameNumber);
          
          console.log(`  Game ${gameDoc.id} (gameNumber: ${gameNumber}):`);
          console.log(`    GameResult winnerTeam: ${gameResult?.winnerTeam || 'N/A'}`);
          console.log(`    CompletedGame winnerTeam: ${gameData.winnerTeam || 'N/A'}`);
          
          if (gameData.finalScores) {
            console.log(`    Final Scores - Top: ${gameData.finalScores.top}, Bottom: ${gameData.finalScores.bottom}`);
            
            // Prüfe Punkte-basierte vs. Striche-basierte Logik
            const pointWinner = gameData.finalScores.top >= gameData.finalScores.bottom ? 'top' : 'bottom';
            console.log(`    Point-based winner would be: ${pointWinner}`);
          }
          
          if (gameData.finalStriche) {
            const topSieg = gameData.finalStriche.top?.sieg || 0;
            const bottomSieg = gameData.finalStriche.bottom?.sieg || 0;
            console.log(`    Final Striche - Top sieg: ${topSieg}, Bottom sieg: ${bottomSieg}`);
            
            // Striche-basierte Gewinner-Bestimmung
            const strichWinner = topSieg > bottomSieg ? 'top' : (bottomSieg > topSieg ? 'bottom' : 'draw');
            console.log(`    Striche-based winner: ${strichWinner}`);
          }
          
          // Consistency check
          if (gameResult && gameResult.winnerTeam !== gameData.winnerTeam && gameData.winnerTeam) {
            console.log('    🚨 INCONSISTENT winnerTeam between gameResult and completedGame!');
          }
        });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeGameData();
