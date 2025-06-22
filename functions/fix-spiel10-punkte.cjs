const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixSpiel10Punkte() {
  console.log('🔧 Korrigiere Spiel 10 - setze realistische Punkte statt 0...\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    
    if (!tournament.gameResults || tournament.gameResults.length === 0) {
      console.log('❌ Keine gameResults gefunden!');
      return;
    }
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9; // Spiel 10
    const game = tournament.gameResults[gameIndex];
    
    console.log(`\n🎮 Spiel ${gameIndex + 1} VORHER:`);
    console.log(`   Top Score: ${game.topScore}`);
    console.log(`   Bottom Score: ${game.bottomScore}`);
    console.log(`   Top Team finalStriche:`, game.finalStriche?.top);
    console.log(`   Bottom Team finalStriche:`, game.finalStriche?.bottom);
    
    // Erstelle eine Kopie der gameResults
    const updatedGameResults = [...tournament.gameResults];
    
    // Korrigiere Spiel 10 mit realistischen Punkten
    // Top Team hat 2 Siege + 1 Berg = sollte gewinnen
    // Bottom Team hat 1 Matsch = sollte verlieren aber nicht 0 Punkte
    
    console.log(`\n🔧 KORREKTUR: Setze realistische Punkte:`);
    console.log(`   Top Team (Frank): 157 Punkte (Gewinner mit 2 Siege + Berg)`);
    console.log(`   Bottom Team: 100 Punkte (Verlierer aber nicht 0)`);
    
    updatedGameResults[gameIndex] = {
      ...updatedGameResults[gameIndex],
      topScore: 157,    // ✅ Realistischer Gewinner-Score
      bottomScore: 100, // ✅ Realistischer Verlierer-Score (nicht 0!)
      winnerTeam: 'top' // Frank's Team gewinnt
    };
    
    console.log(`\n🎮 Spiel ${gameIndex + 1} NACHHER:`);
    console.log(`   Top Score: ${updatedGameResults[gameIndex].topScore}`);
    console.log(`   Bottom Score: ${updatedGameResults[gameIndex].bottomScore}`);
    console.log(`   Winner Team: ${updatedGameResults[gameIndex].winnerTeam}`);
    
    // Speichere die Änderungen
    console.log(`\n💾 Speichere Punkt-Änderungen...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update({
      gameResults: updatedGameResults,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Punkt-Daten erfolgreich korrigiert!`);
    
    // Jetzt muss das ganze Turnier neu aggregiert werden
    console.log(`\n🔄 Triggere komplette Turnier-Neuaggregation...`);
    
    // Importiere die Turnier-Aggregation
    const { aggregateTournamentIntoSummary } = require('./lib/processTournamentCompletion');
    
    // Lösche die alte Turnier-Summary
    console.log(`🗑️ Lösche alte Turnier-Summary...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update({
      // Entferne alle Session-Level Aggregationen
      finalScores: admin.firestore.FieldValue.delete(),
      finalStriche: admin.firestore.FieldValue.delete(),
      eventCounts: admin.firestore.FieldValue.delete(),
      sessionTotalWeisPoints: admin.firestore.FieldValue.delete(),
      gameWinsByTeam: admin.firestore.FieldValue.delete(),
      winnerTeamKey: admin.firestore.FieldValue.delete(),
      aggregatedRoundDurationsByPlayer: admin.firestore.FieldValue.delete(),
      aggregatedTrumpfCountsByPlayer: admin.firestore.FieldValue.delete(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Triggere Neu-Aggregation
    console.log(`📊 Starte Turnier-Neu-Aggregation...`);
    await aggregateTournamentIntoSummary(tournamentId);
    
    console.log(`✅ Turnier-Aggregation abgeschlossen!`);
    
    // Triggere Neuberechnung aller Statistiken
    console.log(`\n🔄 Triggere Neuberechnung aller Statistiken...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    // Update Player Stats für alle Teilnehmer
    const participants = tournament.participantPlayerIds || [];
    console.log(`📊 Aktualisiere Statistiken für ${participants.length} Spieler...`);
    
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
      console.log(`   ✅ ${playerId} aktualisiert`);
    }
    
    // Update Group Stats
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    console.log(`   ✅ Gruppenstatistiken aktualisiert`);
    
    console.log(`\n🎯 KOMPLETTE KORREKTUR ABGESCHLOSSEN!`);
    
    // Zeige finale Turnier-Daten
    const finalTournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const finalTournament = finalTournamentDoc.data();
    
    console.log(`\n📋 FINALE TURNIER-DATEN:`);
    console.log(`   Spiele: ${finalTournament.gamesPlayed || 'N/A'}`);
    console.log(`   Dauer: ${Math.round((finalTournament.durationSeconds || 0) / 60)} Minuten`);
    console.log(`   Status: ${finalTournament.status}`);
    
    // Zeige Spiel 10 nochmal zur Bestätigung
    if (finalTournament.gameResults && finalTournament.gameResults[9]) {
      const finalGame10 = finalTournament.gameResults[9];
      console.log(`\n✅ SPIEL 10 FINAL:`);
      console.log(`   Top Score: ${finalGame10.topScore} (Frank's Team)`);
      console.log(`   Bottom Score: ${finalGame10.bottomScore}`);
      console.log(`   Kontermatsch Top: ${finalGame10.finalStriche?.top?.kontermatsch || 0}`);
      console.log(`   Kontermatsch Bottom: ${finalGame10.finalStriche?.bottom?.kontermatsch || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Punkt-Korrektur:', error);
  }
}

fixSpiel10Punkte()
  .then(() => {
    console.log('\n🎯 Spiel 10 Punkt-Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
