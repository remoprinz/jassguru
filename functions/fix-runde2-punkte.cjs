const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixRunde2Punkte() {
  console.log('🔧 Korrigiere Runde 2 (Slalom) - verhindere 0-Punkte Kontermatsch...\n');
  
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
    
    console.log(`\n🎮 SPIEL ${gameIndex + 1} - RUNDE 2 KORREKTUR:`);
    console.log(`=====================================`);
    
    // Originale Runde 2 Daten
    const originalRunde2 = game.roundHistory?.[0]; // Index 0 = Runde 2
    if (!originalRunde2) {
      console.log('❌ Runde 2 nicht gefunden!');
      return;
    }
    
    console.log(`\n📊 RUNDE 2 VORHER (Slalom):`);
    console.log(`   Top: ${originalRunde2.jassPoints?.top || 0} Punkte`);
    console.log(`   Bottom: ${originalRunde2.jassPoints?.bottom || 0} Punkte`);
    console.log(`   Problem: Bottom hat 0 Punkte → automatisch Kontermatsch`);
    
    // Neue Punkteverteilung: Bottom bekommt 300, Top verliert 300
    const newTopPoints = (originalRunde2.jassPoints?.top || 0) - 300;
    const newBottomPoints = 300;
    
    console.log(`\n🔧 KORREKTUR:`);
    console.log(`   Top: ${originalRunde2.jassPoints?.top} → ${newTopPoints} (-300)`);
    console.log(`   Bottom: 0 → ${newBottomPoints} (+300)`);
    console.log(`   Summe bleibt gleich: ${(originalRunde2.jassPoints?.top || 0)} = ${newTopPoints + newBottomPoints}`);
    
    // Erstelle korrigierte gameResults
    const updatedGameResults = [...tournament.gameResults];
    const updatedGame = { ...updatedGameResults[gameIndex] };
    const updatedRoundHistory = [...(updatedGame.roundHistory || [])];
    
    // Korrigiere Runde 2
    updatedRoundHistory[0] = {
      ...originalRunde2,
      jassPoints: {
        top: newTopPoints,
        bottom: newBottomPoints
      },
      scores: {
        top: newTopPoints,
        bottom: newBottomPoints
      }
    };
    
    // Berechne alle nachfolgenden Runden neu
    console.log(`\n🔄 Berechne alle nachfolgenden Runden neu:`);
    
    let runningTopScore = newTopPoints;
    let runningBottomScore = newBottomPoints;
    
    for (let i = 1; i < updatedRoundHistory.length; i++) {
      const round = updatedRoundHistory[i];
      const roundPoints = round.jassPoints || { top: 0, bottom: 0 };
      
      runningTopScore += roundPoints.top;
      runningBottomScore += roundPoints.bottom;
      
      // Update die kumulativen Scores
      updatedRoundHistory[i] = {
        ...round,
        scores: {
          top: runningTopScore,
          bottom: runningBottomScore
        }
      };
      
      console.log(`   Runde ${i + 2}: Top ${runningTopScore}, Bottom ${runningBottomScore}`);
    }
    
    // Update finale Scores im Spiel
    updatedGame.topScore = runningTopScore;
    updatedGame.bottomScore = runningBottomScore;
    updatedGame.roundHistory = updatedRoundHistory;
    
    // Entferne den falschen Kontermatsch aus finalStriche
    if (updatedGame.finalStriche?.top?.kontermatsch) {
      updatedGame.finalStriche.top.kontermatsch = 0;
    }
    
    updatedGameResults[gameIndex] = updatedGame;
    
    console.log(`\n💰 FINALE SPIEL-SCORES:`);
    console.log(`   Top Team: ${updatedGame.topScore} Punkte`);
    console.log(`   Bottom Team: ${updatedGame.bottomScore} Punkte`);
    console.log(`   Kontermatsch entfernt: ✅`);
    
    // Speichere die Änderungen
    console.log(`\n💾 Speichere korrigierte Daten...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update({
      gameResults: updatedGameResults,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Runde 2 erfolgreich korrigiert!`);
    
    // Berechne neue Session-Level Aggregationen
    console.log(`\n🔄 Berechne neue Session-Level Aggregationen...`);
    
    const gameResults = updatedGameResults;
    let totalTopScore = 0;
    let totalBottomScore = 0;
    let topWins = 0;
    let bottomWins = 0;
    
    const topStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomStriche = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    const topEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const bottomEventCounts = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    
    for (const gameResult of gameResults) {
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
    
    console.log(`\n📊 NEUE SESSION-LEVEL DATEN:`);
    console.log(`   Total Top: ${totalTopScore}, Total Bottom: ${totalBottomScore}`);
    console.log(`   Top Kontermatsch: ${topEventCounts.kontermatsch}`);
    console.log(`   Bottom Kontermatsch: ${bottomEventCounts.kontermatsch}`);
    
    // Triggere Statistik-Updates
    console.log(`\n🔄 Triggere Statistik-Updates...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    const participants = tournament.participantPlayerIds || [];
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
    }
    
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    
    console.log(`✅ Alle Statistiken aktualisiert!`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Runde 2 Korrektur:', error);
  }
}

fixRunde2Punkte()
  .then(() => {
    console.log('\n🎯 Runde 2 Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
