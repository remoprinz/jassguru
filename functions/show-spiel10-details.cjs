const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function showSpiel10Details() {
  console.log('📊 Zeige detaillierte Rohdaten von Spiel 10...\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    
    if (!tournament.gameResults || tournament.gameResults.length < 10) {
      console.log('❌ Spiel 10 nicht gefunden!');
      return;
    }
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9;
    const game = tournament.gameResults[gameIndex];
    
    console.log(`\n🎮 SPIEL ${gameIndex + 1} - KOMPLETTE ROHDATEN:`);
    console.log(`=====================================`);
    
    // Teams
    console.log(`\n👥 TEAMS:`);
    if (game.teams?.top?.players) {
      console.log(`   Top Team:`);
      game.teams.top.players.forEach((player, idx) => {
        console.log(`     ${idx + 1}. ${player.displayName} (ID: ${player.playerId})`);
      });
    }
    
    if (game.teams?.bottom?.players) {
      console.log(`   Bottom Team:`);
      game.teams.bottom.players.forEach((player, idx) => {
        console.log(`     ${idx + 1}. ${player.displayName} (ID: ${player.playerId})`);
      });
    }
    
    // Punkte
    console.log(`\n💰 PUNKTE:`);
    console.log(`   Top Team: ${game.topScore || 'N/A'} Punkte`);
    console.log(`   Bottom Team: ${game.bottomScore || 'N/A'} Punkte`);
    console.log(`   Gewinner: ${game.winnerTeam || 'N/A'}`);
    
    // Striche
    console.log(`\n🎯 STRICHE:`);
    if (game.finalStriche) {
      console.log(`   Top Team:`);
      const topStriche = game.finalStriche.top || {};
      console.log(`     Berg: ${topStriche.berg || 0}`);
      console.log(`     Sieg: ${topStriche.sieg || 0}`);
      console.log(`     Matsch: ${topStriche.matsch || 0}`);
      console.log(`     Schneider: ${topStriche.schneider || 0}`);
      console.log(`     Kontermatsch: ${topStriche.kontermatsch || 0}`);
      
      console.log(`   Bottom Team:`);
      const bottomStriche = game.finalStriche.bottom || {};
      console.log(`     Berg: ${bottomStriche.berg || 0}`);
      console.log(`     Sieg: ${bottomStriche.sieg || 0}`);
      console.log(`     Matsch: ${bottomStriche.matsch || 0}`);
      console.log(`     Schneider: ${bottomStriche.schneider || 0}`);
      console.log(`     Kontermatsch: ${bottomStriche.kontermatsch || 0}`);
    }
    
    // Trumpffarben
    console.log(`\n🃏 TRUMPFFARBEN:`);
    if (game.trumpfCountsByPlayer) {
      console.log(`   Trumpf-Zählungen pro Spieler:`);
      for (const [playerId, trumpfData] of Object.entries(game.trumpfCountsByPlayer)) {
        // Finde Spielername
        let playerName = 'Unbekannt';
        if (game.teams?.top?.players) {
          const topPlayer = game.teams.top.players.find(p => p.playerId === playerId);
          if (topPlayer) playerName = topPlayer.displayName;
        }
        if (game.teams?.bottom?.players) {
          const bottomPlayer = game.teams.bottom.players.find(p => p.playerId === playerId);
          if (bottomPlayer) playerName = bottomPlayer.displayName;
        }
        
        console.log(`     ${playerName} (${playerId}):`);
        for (const [farbe, count] of Object.entries(trumpfData)) {
          if (count > 0) {
            console.log(`       ${farbe}: ${count}x`);
          }
        }
      }
    } else {
      console.log(`   ❌ Keine Trumpffarben-Daten gefunden`);
    }
    
    // Spieldauer
    console.log(`\n⏱️ SPIELDAUER:`);
    console.log(`   Dauer: ${game.durationSeconds ? Math.round(game.durationSeconds / 60) : 'N/A'} Minuten`);
    console.log(`   Abgeschlossen: ${game.completedAt ? new Date(game.completedAt.seconds * 1000).toLocaleString('de-CH') : 'N/A'}`);
    
    // Zusätzliche Daten
    console.log(`\n📋 ZUSÄTZLICHE DATEN:`);
    console.log(`   Spiel-Nummer: ${game.gameNumber || 'N/A'}`);
    console.log(`   Startender Spieler: ${game.initialStartingPlayer || 'N/A'}`);
    
    // Weis-Punkte (falls vorhanden)
    if (game.weisPoints) {
      console.log(`\n✨ WEIS-PUNKTE:`);
      console.log(`   Top Team: ${game.weisPoints.top || 0}`);
      console.log(`   Bottom Team: ${game.weisPoints.bottom || 0}`);
    }
    
    console.log(`\n=====================================`);
    console.log(`✅ Spiel 10 Details vollständig angezeigt`);
    
  } catch (error) {
    console.error('❌ Fehler beim Anzeigen der Spiel-Details:', error);
  }
}

showSpiel10Details()
  .then(() => {
    console.log('\n🎯 Spiel 10 Details-Anzeige abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
