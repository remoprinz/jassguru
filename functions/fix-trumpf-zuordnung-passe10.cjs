const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixTrumpfZuordnungPasse10() {
  console.log('🔧 KORRIGIERE TRUMPF-ZUORDNUNG IN PASSE 10\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📅 Datum: ${tournament.startedAt ? new Date(tournament.startedAt.seconds * 1000).toLocaleDateString('de-CH') : 'Unbekannt'}`);
    
    if (!tournament.gameResults || tournament.gameResults.length < 10) {
      console.log('❌ Passe 10 nicht gefunden!');
      return;
    }
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9;
    const game = tournament.gameResults[gameIndex];
    
    console.log(`\n🎮 PASSE 10 - AKTUELLE STRICHE:`);
    console.log(`===============================`);
    console.log(`Top Team (Studi & Frank):`, game.finalStriche?.top || {});
    console.log(`Bottom Team (Remo & Schmuuuudii):`, game.finalStriche?.bottom || {});
    
    console.log(`\n🔍 PROBLEM IDENTIFIZIERT:`);
    console.log(`=========================`);
    console.log(`❌ Top Team hat 1 Kontermatsch → sollte 0 sein`);
    console.log(`❌ Bottom Team hat 0 Kontermatsch → sollte 0 bleiben`);
    console.log(`✅ Korrekte Striche basierend auf Screenshot:`);
    console.log(`   • Top Team: 1 Berg + 2 Siege`);
    console.log(`   • Bottom Team: 1 Matsch`);
    console.log(`   • Beide Teams: 0 Kontermatsch`);
    
    // Erstelle korrigierte Striche
    const correctedTopStriche = {
      berg: 1,
      sieg: 2,
      matsch: 0,
      schneider: 0,
      kontermatsch: 0  // ← KORRIGIERT: War 1, wird 0
    };
    
    const correctedBottomStriche = {
      berg: 0,
      sieg: 0,
      matsch: 1,
      schneider: 0,
      kontermatsch: 0  // ← Bleibt 0
    };
    
    console.log(`\n🔧 KORREKTUR:`);
    console.log(`=============`);
    console.log(`Top Team Striche:`, correctedTopStriche);
    console.log(`Bottom Team Striche:`, correctedBottomStriche);
    
    // Erstelle korrigierte gameResults
    const updatedGameResults = [...tournament.gameResults];
    
    updatedGameResults[gameIndex] = {
      ...updatedGameResults[gameIndex],
      finalStriche: {
        top: correctedTopStriche,
        bottom: correctedBottomStriche
      }
    };
    
    console.log(`\n💾 Speichere korrigierte Striche...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update({
      gameResults: updatedGameResults,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Striche erfolgreich korrigiert!`);
    
    // Berechne neue Session-Level Aggregationen
    console.log(`\n🔄 Berechne neue Session-Level Aggregationen...`);
    
    let totalTopScore = 0;
    let totalBottomScore = 0;
    let topWins = 0;
    let bottomWins = 0;
    
    const topStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    const topEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    for (const gameResult of updatedGameResults) {
      totalTopScore += gameResult.topScore || 0;
      totalBottomScore += gameResult.bottomScore || 0;
      
      if (gameResult.winnerTeam === 'top') topWins++;
      else if (gameResult.winnerTeam === 'bottom') bottomWins++;
      
      if (gameResult.finalStriche) {
        const gameTopStriche = gameResult.finalStriche.top || {};
        const gameBottomStriche = gameResult.finalStriche.bottom || {};
        
        for (const type of ['berg', 'sieg', 'matsch', 'schneider', 'kontermatsch']) {
          topStriche[type] += gameTopStriche[type] || 0;
          bottomStriche[type] += gameBottomStriche[type] || 0;
          topEventCounts[type] += gameTopStriche[type] || 0;
          bottomEventCounts[type] += gameBottomStriche[type] || 0;
        }
      }
    }
    
    let winnerTeamKey = 'tie';
    if (topWins > bottomWins) winnerTeamKey = 'top';
    else if (bottomWins > topWins) winnerTeamKey = 'bottom';
    
    console.log(`📊 NEUE AGGREGATIONEN:`);
    console.log(`======================`);
    console.log(`Total Top: ${totalTopScore} Punkte`);
    console.log(`Total Bottom: ${totalBottomScore} Punkte`);
    console.log(`Top Wins: ${topWins}, Bottom Wins: ${bottomWins}`);
    console.log(`Winner: ${winnerTeamKey}`);
    console.log(`Top Kontermatsch: ${topEventCounts.kontermatsch} ← KORRIGIERT!`);
    console.log(`Bottom Kontermatsch: ${bottomEventCounts.kontermatsch}`);
    
    // Update Session-Level Daten
    const sessionUpdateData = {
      finalScores: { top: totalTopScore, bottom: totalBottomScore },
      finalStriche: { top: topStriche, bottom: bottomStriche },
      eventCounts: { top: topEventCounts, bottom: bottomEventCounts },
      gameWinsByTeam: { top: topWins, bottom: bottomWins },
      winnerTeamKey: winnerTeamKey,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('jassGameSummaries').doc(tournamentId).update(sessionUpdateData);
    
    console.log(`✅ Session-Level Daten aktualisiert!`);
    
    // Triggere Statistik-Updates
    console.log(`\n🔄 Triggere Statistik-Updates...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    const participants = tournament.participantPlayerIds || [];
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
      console.log(`   ✅ Spieler ${playerId} aktualisiert`);
    }
    
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    console.log(`   ✅ Gruppenstatistiken aktualisiert`);
    
    // Prüfe Frank's finale Kontermatsch-Bilanz
    const statsDoc = await db.collection('groupComputedStats').doc('Tz0wgIHMTlhvTtFastiJ').get();
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      const frankStats = stats.playerWithHighestKontermatschBilanz?.find(p => p.playerName === 'Frank');
      if (frankStats) {
        console.log(`\n👤 FRANK'S FINALE KONTERMATSCH-BILANZ:`);
        console.log(`   Bilanz: ${frankStats.value >= 0 ? '+' : ''}${frankStats.value}`);
        console.log(`   Gemacht: ${frankStats.eventsMade || 0}`);
        console.log(`   Bekommen: ${frankStats.eventsReceived || 0}`);
        
        if (frankStats.value === 0 && frankStats.eventsMade === 1 && frankStats.eventsReceived === 1) {
          console.log(`   ✅ PERFEKT! Frank: 1 gemacht, 1 bekommen = 0 Bilanz`);
        } else if (frankStats.value === 1 && frankStats.eventsMade === 1 && frankStats.eventsReceived === 0) {
          console.log(`   ✅ KORRIGIERT! Frank: 1 gemacht, 0 bekommen = +1 Bilanz`);
        }
      }
    }
    
    console.log(`\n🎯 TRUMPF-ZUORDNUNG KORRIGIERT!`);
    console.log(`===============================`);
    console.log(`✅ Kontermatsch entfernt (war fälschlich zugeordnet)`);
    console.log(`✅ Korrekte Striche: Top 1 Berg + 2 Siege, Bottom 1 Matsch`);
    console.log(`✅ Alle Statistiken aktualisiert`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Trumpf-Zuordnung-Korrektur:', error);
  }
}

fixTrumpfZuordnungPasse10()
  .then(() => {
    console.log('\n🎯 Trumpf-Zuordnung-Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
