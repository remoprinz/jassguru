const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function debugTournamentFrank() {
  console.log('🔍 Debugge Frank im Turnier...\n');
  
  try {
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc('6eNr8fnsTO06jgCqjelt').get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentDoc.id}`);
    console.log(`📊 participantPlayerIds:`, tournament.participantPlayerIds);
    console.log(`👥 Teams:`, tournament.teams);
    
    // Frank's Player-ID
    const frankPlayerId = 'F1uwdthL6zu7F0cYf1jbe';
    
    console.log(`\n👤 Frank Player-ID: ${frankPlayerId}`);
    console.log(`✅ Frank in participantPlayerIds: ${tournament.participantPlayerIds?.includes(frankPlayerId)}`);
    
    // Prüfe Teams
    let frankInTopTeam = false;
    let frankInBottomTeam = false;
    
    if (tournament.teams?.top?.players) {
      frankInTopTeam = tournament.teams.top.players.some(p => p.playerId === frankPlayerId);
    }
    if (tournament.teams?.bottom?.players) {
      frankInBottomTeam = tournament.teams.bottom.players.some(p => p.playerId === frankPlayerId);
    }
    
    console.log(`🔝 Frank in Top Team: ${frankInTopTeam}`);
    console.log(`🔻 Frank in Bottom Team: ${frankInBottomTeam}`);
    
    // Analysiere gameResults
    if (tournament.gameResults) {
      console.log(`\n🎮 Analysiere ${tournament.gameResults.length} Spiele:`);
      
      for (const [gameIndex, game] of tournament.gameResults.entries()) {
        console.log(`\n   Spiel ${gameIndex + 1}:`);
        
        // Prüfe Frank's Team in diesem Spiel
        let frankGameTeam = null;
        if (game.teams?.top?.players?.some(p => p.playerId === frankPlayerId)) {
          frankGameTeam = 'top';
        } else if (game.teams?.bottom?.players?.some(p => p.playerId === frankPlayerId)) {
          frankGameTeam = 'bottom';
        }
        
        console.log(`     Frank's Team: ${frankGameTeam || 'NICHT GEFUNDEN'}`);
        
        if (frankGameTeam && game.finalStriche) {
          const frankStriche = game.finalStriche[frankGameTeam] || {};
          const opponentStriche = game.finalStriche[frankGameTeam === 'top' ? 'bottom' : 'top'] || {};
          
          console.log(`     Frank's Striche:`, frankStriche);
          console.log(`     Opponent Striche:`, opponentStriche);
          
          const kontermatschMade = frankStriche.kontermatsch || 0;
          const kontermatschReceived = opponentStriche.kontermatsch || 0;
          
          if (kontermatschMade > 0 || kontermatschReceived > 0) {
            console.log(`     �� KONTERMATSCH: ${kontermatschMade} gemacht, ${kontermatschReceived} bekommen`);
          }
        } else {
          console.log(`     ❌ Keine finalStriche oder Frank nicht gefunden`);
        }
      }
    } else {
      console.log(`\n❌ Keine gameResults gefunden!`);
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Debug:', error);
  }
}

debugTournamentFrank()
  .then(() => {
    console.log('\n🎯 Turnier-Debug abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
