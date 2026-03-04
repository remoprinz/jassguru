const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeWinRateIssue() {
  console.log('🔍 ANALYSE: Siegquote-Partien Problem\n');
  
  // 1. Hole eine Beispiel-Session mit gameWinsByPlayer
  const groupsSnapshot = await db.collection('groups').limit(1).get();
  if (groupsSnapshot.empty) {
    console.log('❌ Keine Gruppen gefunden');
    return;
  }
  
  const groupId = groupsSnapshot.docs[0].id;
  console.log(`📊 Analysiere Gruppe: ${groupId}\n`);
  
  // Hole Sessions dieser Gruppe
  const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
  const sessionsSnapshot = await sessionsRef.limit(5).get();
  
  if (sessionsSnapshot.empty) {
    console.log('❌ Keine Sessions gefunden');
    return;
  }
  
  console.log(`✅ Gefunden: ${sessionsSnapshot.size} Sessions\n`);
  
  for (const sessionDoc of sessionsSnapshot.docs) {
    const sessionData = sessionDoc.data();
    const sessionId = sessionDoc.id;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 SESSION: ${sessionId}`);
    console.log(`${'='.repeat(80)}`);
    
    // Session Info
    console.log(`\n📊 Session Info:`);
    console.log(`  - Status: ${sessionData.status}`);
    console.log(`  - Games Played: ${sessionData.gamesPlayed || 0}`);
    console.log(`  - Winner Team: ${sessionData.winnerTeamKey || 'N/A'}`);
    console.log(`  - Tournament: ${sessionData.tournamentId ? 'YES' : 'NO'}`);
    
    // Teams
    if (sessionData.teams) {
      console.log(`\n👥 Teams:`);
      console.log(`  TOP: ${sessionData.teams.top?.players?.map(p => p.displayName || p.playerId).join(', ') || 'N/A'}`);
      console.log(`  BOTTOM: ${sessionData.teams.bottom?.players?.map(p => p.displayName || p.playerId).join(', ') || 'N/A'}`);
    }
    
    // gameWinsByPlayer
    if (sessionData.gameWinsByPlayer) {
      console.log(`\n🎮 gameWinsByPlayer (Session-Level):`);
      for (const [playerId, stats] of Object.entries(sessionData.gameWinsByPlayer)) {
        const playerName = sessionData.playerNames?.[playerId] || playerId;
        const wins = stats.wins || 0;
        const losses = stats.losses || 0;
        const total = wins + losses;
        const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
        console.log(`  ${playerName}: ${wins}W / ${losses}L (${winRate}%)`);
      }
    } else {
      console.log(`\n⚠️  KEIN gameWinsByPlayer gefunden!`);
    }
    
    // gameResults
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
      console.log(`\n🎲 gameResults (${sessionData.gameResults.length} Spiele):`);
      
      // Berechne manuell die Wins/Losses aus gameResults
      const manualWinsByPlayer = {};
      const participantIds = sessionData.participantPlayerIds || [];
      participantIds.forEach(pid => {
        manualWinsByPlayer[pid] = { wins: 0, losses: 0 };
      });
      
      sessionData.gameResults.forEach((game, idx) => {
        console.log(`\n  Spiel ${game.gameNumber}:`);
        console.log(`    Score: TOP ${game.topScore} vs BOTTOM ${game.bottomScore}`);
        console.log(`    Winner: ${game.winnerTeam}`);
        
        // Teams pro Spiel
        if (game.teams) {
          const topIds = game.teams.top?.players?.map(p => p.playerId) || [];
          const bottomIds = game.teams.bottom?.players?.map(p => p.playerId) || [];
          console.log(`    TOP Players: ${topIds.map(id => sessionData.playerNames?.[id] || id).join(', ')}`);
          console.log(`    BOTTOM Players: ${bottomIds.map(id => sessionData.playerNames?.[id] || id).join(', ')}`);
          
          // Manuelle Berechnung
          if (game.winnerTeam === 'top') {
            topIds.forEach(pid => {
              if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].wins++;
            });
            bottomIds.forEach(pid => {
              if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].losses++;
            });
          } else if (game.winnerTeam === 'bottom') {
            bottomIds.forEach(pid => {
              if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].wins++;
            });
            topIds.forEach(pid => {
              if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].losses++;
            });
          }
        } else {
          console.log(`    ⚠️  KEINE Teams pro Spiel! Verwende Session-Level Teams`);
          // Fallback zu Session-Level Teams
          if (sessionData.teams) {
            const topIds = sessionData.teams.top?.players?.map(p => p.playerId) || [];
            const bottomIds = sessionData.teams.bottom?.players?.map(p => p.playerId) || [];
            
            if (game.winnerTeam === 'top') {
              topIds.forEach(pid => {
                if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].wins++;
              });
              bottomIds.forEach(pid => {
                if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].losses++;
              });
            } else if (game.winnerTeam === 'bottom') {
              bottomIds.forEach(pid => {
                if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].wins++;
              });
              topIds.forEach(pid => {
                if (manualWinsByPlayer[pid]) manualWinsByPlayer[pid].losses++;
              });
            }
          }
        }
      });
      
      // Vergleich: Manuelle Berechnung vs. gameWinsByPlayer
      console.log(`\n📊 VERGLEICH: Manuelle Berechnung vs. gameWinsByPlayer`);
      console.log(`${'─'.repeat(80)}`);
      
      const allPlayerIds = new Set([
        ...Object.keys(manualWinsByPlayer),
        ...Object.keys(sessionData.gameWinsByPlayer || {})
      ]);
      
      let hasMismatch = false;
      for (const playerId of allPlayerIds) {
        const playerName = sessionData.playerNames?.[playerId] || playerId;
        const manual = manualWinsByPlayer[playerId] || { wins: 0, losses: 0 };
        const stored = sessionData.gameWinsByPlayer?.[playerId] || { wins: 0, losses: 0 };
        
        const match = manual.wins === stored.wins && manual.losses === stored.losses;
        const marker = match ? '✅' : '❌';
        
        if (!match) hasMismatch = true;
        
        console.log(`${marker} ${playerName}:`);
        console.log(`     Manuell:   ${manual.wins}W / ${manual.losses}L`);
        console.log(`     Gespeichert: ${stored.wins}W / ${stored.losses}L`);
      }
      
      if (hasMismatch) {
        console.log(`\n⚠️  MISMATCH GEFUNDEN! Die gespeicherten Werte stimmen nicht mit der manuellen Berechnung überein.`);
      } else {
        console.log(`\n✅ Alle Werte stimmen überein.`);
      }
    } else {
      console.log(`\n⚠️  KEINE gameResults gefunden!`);
    }
    
    // Final Scores
    if (sessionData.finalScores) {
      console.log(`\n📈 Final Scores:`);
      console.log(`  TOP: ${sessionData.finalScores.top || 0}`);
      console.log(`  BOTTOM: ${sessionData.finalScores.bottom || 0}`);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Analyse abgeschlossen');
  console.log(`${'='.repeat(80)}\n`);
}

analyzeWinRateIssue()
  .then(() => {
    console.log('✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });

