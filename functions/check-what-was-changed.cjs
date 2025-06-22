const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkWhatWasChanged() {
  console.log('🔍 ÜBERPRÜFE GENAU, WAS VERÄNDERT WURDE...\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📅 Datum: ${tournament.startedAt ? new Date(tournament.startedAt.seconds * 1000).toLocaleDateString('de-CH') : 'Unbekannt'}`);
    
    if (!tournament.gameResults || tournament.gameResults.length === 0) {
      console.log('❌ Keine gameResults gefunden!');
      return;
    }
    
    console.log(`\n📊 ALLE SPIELE IM TURNIER:`);
    console.log(`==============================`);
    
    for (let i = 0; i < tournament.gameResults.length; i++) {
      const game = tournament.gameResults[i];
      const gameNumber = i + 1;
      
      console.log(`\n🎮 SPIEL ${gameNumber}:`);
      console.log(`   Top Score: ${game.topScore}`);
      console.log(`   Bottom Score: ${game.bottomScore}`);
      console.log(`   Winner: ${game.winnerTeam}`);
      console.log(`   Top Striche:`, game.finalStriche?.top || {});
      console.log(`   Bottom Striche:`, game.finalStriche?.bottom || {});
      
      // Prüfe auf verdächtige Werte
      if (game.topScore > 5000 || game.bottomScore > 5000) {
        console.log(`   ⚠️  VERDÄCHTIG: Sehr hohe Scores!`);
      }
      if (game.topScore === 4200 && game.bottomScore === 3550) {
        console.log(`   🔧 GEÄNDERT: Diese Scores wurden vom Script gesetzt!`);
      }
    }
    
    console.log(`\n📈 SESSION-LEVEL AGGREGATIONEN:`);
    console.log(`===============================`);
    console.log(`Total Top Scores: ${tournament.finalScores?.top || 0}`);
    console.log(`Total Bottom Scores: ${tournament.finalScores?.bottom || 0}`);
    console.log(`Top Wins: ${tournament.gameWinsByTeam?.top || 0}`);
    console.log(`Bottom Wins: ${tournament.gameWinsByTeam?.bottom || 0}`);
    console.log(`Winner: ${tournament.winnerTeamKey || 'Unbekannt'}`);
    
    console.log(`\nTop Striche:`, tournament.finalStriche?.top || {});
    console.log(`Bottom Striche:`, tournament.finalStriche?.bottom || {});
    
    console.log(`\nTop Event Counts:`, tournament.eventCounts?.top || {});
    console.log(`Bottom Event Counts:`, tournament.eventCounts?.bottom || {});
    
    // Prüfe, ob nur Spiel 10 verändert wurde
    console.log(`\n🎯 ANALYSE: WAS WURDE VERÄNDERT?`);
    console.log(`=====================================`);
    
    let changedGames = [];
    for (let i = 0; i < tournament.gameResults.length; i++) {
      const game = tournament.gameResults[i];
      const gameNumber = i + 1;
      
      // Prüfe auf typische Script-Änderungen
      if (game.topScore === 4200 && game.bottomScore === 3550) {
        changedGames.push(gameNumber);
      }
    }
    
    if (changedGames.length === 1 && changedGames[0] === 10) {
      console.log(`✅ NUR SPIEL 10 WURDE VERÄNDERT - KORREKT!`);
    } else if (changedGames.length > 1) {
      console.log(`❌ MEHRERE SPIELE WURDEN VERÄNDERT: ${changedGames.join(', ')}`);
      console.log(`🚨 DAS IST NICHT KORREKT!`);
    } else if (changedGames.length === 0) {
      console.log(`❓ KEINE OFFENSICHTLICHEN SCRIPT-ÄNDERUNGEN ERKANNT`);
    }
    
    console.log(`\n🔍 LETZTE ÄNDERUNG:`);
    if (tournament.lastUpdated) {
      const lastUpdate = new Date(tournament.lastUpdated.seconds * 1000);
      console.log(`   ${lastUpdate.toLocaleString('de-CH')}`);
    } else {
      console.log(`   Keine Timestamp verfügbar`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Überprüfung:', error);
  }
}

checkWhatWasChanged()
  .then(() => {
    console.log('\n🔍 Überprüfung abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
