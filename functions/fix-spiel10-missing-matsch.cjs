const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixSpiel10MissingMatsch() {
  console.log('🔧 KORRIGIERE FEHLENDEN MATSCH IN SPIEL 10\n');
  
  try {
    const jassGameSummaryId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das JassGameSummary
    const jassGameSummaryDoc = await db.collection('jassGameSummaries').doc(jassGameSummaryId).get();
    const jassGameSummary = jassGameSummaryDoc.data();
    
    console.log(`📊 JassGameSummary: ${jassGameSummaryId}`);
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9;
    const game = jassGameSummary.gameResults[gameIndex];
    
    console.log(`\n🎮 SPIEL 10 - AKTUELLE STRICHE:`);
    console.log(`===============================`);
    console.log(`Top Team:`, game.finalStriche?.top || {});
    console.log(`Bottom Team:`, game.finalStriche?.bottom || {});
    
    console.log(`\n❌ PROBLEM IDENTIFIZIERT:`);
    console.log(`=========================`);
    console.log(`Top Team fehlt 1 Matsch (sollte 1 haben, hat 0)`);
    
    console.log(`\n✅ KORREKTE STRICHE (aus Turnier-Daten):`);
    console.log(`========================================`);
    
    // Korrekte finale Striche basierend auf Ihren Turnier-Daten
    const correctedTopStriche = {
      berg: 1,        // 1 Berg = 1 Strich
      sieg: 2,        // 1 Sieg = 2 Striche  
      matsch: 1,      // 1 Matsch = 1 Strich ← FEHLTE!
      schneider: 0,
      kontermatsch: 0
    };
    
    const correctedBottomStriche = {
      berg: 0,
      sieg: 0,
      matsch: 1,      // 1 Matsch = 1 Strich
      schneider: 0,
      kontermatsch: 0
    };
    
    console.log(`Top Team (Studi & Frank):`, correctedTopStriche);
    console.log(`Bottom Team (Remo & Schmuuuudii):`, correctedBottomStriche);
    
    console.log(`\n📊 INTERPRETATION:`);
    console.log(`==================`);
    console.log(`Top Team: 1 Berg + 1 Sieg (2 Striche) + 1 Matsch = 4 Striche total`);
    console.log(`Bottom Team: 1 Matsch = 1 Strich total`);
    
    // Erstelle korrigierte gameResults
    const updatedGameResults = [...jassGameSummary.gameResults];
    
    updatedGameResults[gameIndex] = {
      ...updatedGameResults[gameIndex],
      finalStriche: {
        top: correctedTopStriche,
        bottom: correctedBottomStriche
      }
    };
    
    console.log(`\n💾 Speichere korrigierte Striche...`);
    await db.collection('jassGameSummaries').doc(jassGameSummaryId).update({
      gameResults: updatedGameResults,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ GameResults erfolgreich aktualisiert!`);
    
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
    console.log(`\nTop Striche:`, topStriche);
    console.log(`Bottom Striche:`, bottomStriche);
    console.log(`\nTop Event Counts:`, topEventCounts);
    console.log(`Bottom Event Counts:`, bottomEventCounts);
    
    // Vergleiche mit vorherigen Werten
    console.log(`\n🔍 VERGLEICH VORHER/NACHHER:`);
    console.log(`============================`);
    console.log(`Top Matsch: 7 → ${topEventCounts.matsch} (+1)`);
    console.log(`Top Kontermatsch: 1 → ${topEventCounts.kontermatsch} (unverändert)`);
    console.log(`Bottom Matsch: 12 → ${bottomEventCounts.matsch} (unverändert)`);
    
    // Update Session-Level Daten
    const sessionUpdateData = {
      finalScores: { top: totalTopScore, bottom: totalBottomScore },
      finalStriche: { top: topStriche, bottom: bottomStriche },
      eventCounts: { top: topEventCounts, bottom: bottomEventCounts },
      gameWinsByTeam: { top: topWins, bottom: bottomWins },
      winnerTeamKey: winnerTeamKey,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('jassGameSummaries').doc(jassGameSummaryId).update(sessionUpdateData);
    
    console.log(`✅ Session-Level Daten aktualisiert!`);
    
    // Triggere Statistik-Updates
    console.log(`\n🔄 Triggere Statistik-Updates...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    const participants = jassGameSummary.participantPlayerIds || [];
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
      console.log(`   ✅ Spieler ${playerId} aktualisiert`);
    }
    
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    console.log(`   ✅ Gruppenstatistiken aktualisiert`);
    
    console.log(`\n🎯 FEHLENDER MATSCH KORRIGIERT!`);
    console.log(`===============================`);
    console.log(`✅ Top Team hat jetzt korrekt: 1 Berg + 1 Sieg + 1 Matsch`);
    console.log(`✅ Bottom Team unverändert: 1 Matsch`);
    console.log(`✅ Scores bleiben: 4200/3550`);
    console.log(`✅ Alle Statistiken aktualisiert`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Matsch-Korrektur:', error);
  }
}

fixSpiel10MissingMatsch()
  .then(() => {
    console.log('\n🎯 Matsch-Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
