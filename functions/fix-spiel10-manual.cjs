const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixSpiel10Manual() {
  console.log('🔧 Manuelle Korrektur von Spiel 10 und Neuberechnung...\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das aktuelle Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📊 Spiel 10 aktueller Status:`);
    
    if (tournament.gameResults && tournament.gameResults[9]) {
      const game10 = tournament.gameResults[9];
      console.log(`   Top Score: ${game10.topScore}`);
      console.log(`   Bottom Score: ${game10.bottomScore}`);
      console.log(`   Kontermatsch: ${game10.finalStriche?.top?.kontermatsch || 0} / ${game10.finalStriche?.bottom?.kontermatsch || 0}`);
    }
    
    // Manuell neue Session-Level Daten berechnen
    console.log(`\n🔄 Berechne neue Session-Level Aggregationen...`);
    
    const gameResults = tournament.gameResults || [];
    
    // Aggregiere alle Spiele
    let totalTopScore = 0;
    let totalBottomScore = 0;
    let topWins = 0;
    let bottomWins = 0;
    
    const topStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    const topEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    for (const game of gameResults) {
      // Punkte
      totalTopScore += game.topScore || 0;
      totalBottomScore += game.bottomScore || 0;
      
      // Gewinne
      if (game.winnerTeam === 'top') topWins++;
      else if (game.winnerTeam === 'bottom') bottomWins++;
      
      // Striche und Events
      if (game.finalStriche) {
        const gameTopStriche = game.finalStriche.top || {};
        const gameBottomStriche = game.finalStriche.bottom || {};
        
        // Addiere alle Striche-Typen
        for (const type of ['berg', 'sieg', 'matsch', 'schneider', 'kontermatsch']) {
          topStriche[type] += gameTopStriche[type] || 0;
          bottomStriche[type] += gameBottomStriche[type] || 0;
          topEventCounts[type] += gameTopStriche[type] || 0;
          bottomEventCounts[type] += gameBottomStriche[type] || 0;
        }
      }
    }
    
    // Bestimme Gewinner
    let winnerTeamKey = 'tie';
    if (topWins > bottomWins) winnerTeamKey = 'top';
    else if (bottomWins > topWins) winnerTeamKey = 'bottom';
    
    console.log(`📊 Neue Aggregationen:`);
    console.log(`   Top Total: ${totalTopScore} Punkte, ${topWins} Siege`);
    console.log(`   Bottom Total: ${totalBottomScore} Punkte, ${bottomWins} Siege`);
    console.log(`   Gewinner: ${winnerTeamKey}`);
    console.log(`   Top Kontermatsch: ${topEventCounts.kontermatsch}`);
    console.log(`   Bottom Kontermatsch: ${bottomEventCounts.kontermatsch}`);
    
    // Update das Turnier mit neuen Session-Level Daten
    const updateData = {
      finalScores: {
        top: totalTopScore,
        bottom: totalBottomScore
      },
      finalStriche: {
        top: topStriche,
        bottom: bottomStriche
      },
      eventCounts: {
        top: topEventCounts,
        bottom: bottomEventCounts
      },
      gameWinsByTeam: {
        top: topWins,
        bottom: bottomWins
      },
      winnerTeamKey: winnerTeamKey,
      gamesPlayed: gameResults.length,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    
    console.log(`\n💾 Speichere neue Session-Level Daten...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update(updateData);
    
    console.log(`✅ Turnier-Aggregation erfolgreich aktualisiert!`);
    
    // Triggere Neuberechnung der Statistiken
    console.log(`\n🔄 Triggere Neuberechnung der Statistiken...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    // Update Player Stats für alle Teilnehmer
    const participants = tournament.participantPlayerIds || [];
    console.log(`📊 Aktualisiere Statistiken für ${participants.length} Spieler...`);
    
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
      console.log(`   ✅ Spieler ${playerId} aktualisiert`);
    }
    
    // Update Group Stats
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    console.log(`   ✅ Gruppenstatistiken aktualisiert`);
    
    console.log(`\n🎯 KOMPLETTE KORREKTUR ABGESCHLOSSEN!`);
    
    // Prüfe Frank's finale Kontermatsch-Bilanz
    const statsDoc = await db.collection('groupComputedStats').doc('Tz0wgIHMTlhvTtFastiJ').get();
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      const frankStats = stats.playerWithHighestKontermatschBilanz?.find(p => p.playerName === 'Frank');
      if (frankStats) {
        console.log(`\n�� FRANK'S FINALE KONTERMATSCH-BILANZ:`);
        console.log(`   Bilanz: ${frankStats.value >= 0 ? '+' : ''}${frankStats.value}`);
        console.log(`   Gemacht: ${frankStats.eventsMade || 0}`);
        console.log(`   Bekommen: ${frankStats.eventsReceived || 0}`);
        
        if (frankStats.value === 0 && frankStats.eventsMade === 1 && frankStats.eventsReceived === 1) {
          console.log(`   ✅ PERFEKT! Frank: 1 gemacht, 1 bekommen = 0 Bilanz`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der manuellen Korrektur:', error);
  }
}

fixSpiel10Manual()
  .then(() => {
    console.log('\n🎯 Manuelle Spiel 10 Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
