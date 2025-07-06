const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

async function analyzeJune27Session() {
  console.log('🔍 ANALYSE DER JUNI 27 SESSION');
  console.log('='.repeat(50));
  
  const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
  
  try {
    // Session-Hauptdokument laden
    const sessionDoc = await db.collection('jassGameSummaries').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      console.log('❌ Session nicht gefunden!');
      return;
    }
    
    const sessionData = sessionDoc.data();
    
    console.log('📊 SESSION GRUNDDATEN:');
    console.log(`Session ID: ${sessionId}`);
    console.log(`Status: ${sessionData.status}`);
    console.log(`Gestartet: ${sessionData.startedAt?.toDate()}`);
    console.log(`Beendet: ${sessionData.endedAt?.toDate()}`);
    console.log(`Gruppe: ${sessionData.groupId}`);
    console.log(`Spiele gespielt: ${sessionData.gamesPlayed}`);
    console.log('');
    
    // Teams anzeigen
    console.log('👥 TEAMS:');
    console.log('Top Team:', sessionData.teams?.top?.players?.map(p => p.displayName).join(', '));
    console.log('Bottom Team:', sessionData.teams?.bottom?.players?.map(p => p.displayName).join(', '));
    console.log('');
    
    // Endergebnis analysieren
    console.log('🏆 ENDERGEBNIS ANALYSE:');
    console.log(`Final Scores - Bottom: ${sessionData.finalScores?.bottom}, Top: ${sessionData.finalScores?.top}`);
    console.log(`Winner Team Key: ${sessionData.winnerTeamKey}`);
    console.log(`Game Wins - Bottom: ${sessionData.gameWinsByTeam?.bottom}, Top: ${sessionData.gameWinsByTeam?.top}`);
    console.log('');
    
    // Striche analysieren
    console.log('📋 STRICHE ANALYSE:');
    const finalStriche = sessionData.finalStriche;
    if (finalStriche) {
      console.log('Final Striche Bottom:', finalStriche.bottom);
      console.log('Final Striche Top:', finalStriche.top);
      
      // Striche-Summen berechnen
      const bottomStricheSum = Object.values(finalStriche.bottom).reduce((sum, val) => sum + val, 0);
      const topStricheSum = Object.values(finalStriche.top).reduce((sum, val) => sum + val, 0);
      
      console.log(`Striche-Summe Bottom: ${bottomStricheSum}`);
      console.log(`Striche-Summe Top: ${topStricheSum}`);
    }
    console.log('');
    
    // Eventcounts analysieren
    console.log('📈 EVENT COUNTS:');
    const eventCounts = sessionData.eventCounts;
    if (eventCounts) {
      console.log('Event Counts Bottom:', eventCounts.bottom);
      console.log('Event Counts Top:', eventCounts.top);
    }
    console.log('');
    
    // Spiel-Resultate analysieren
    console.log('🎯 SPIEL-RESULTATE:');
    if (sessionData.gameResults) {
      sessionData.gameResults.forEach((game, index) => {
        console.log(`Spiel ${game.gameNumber}: Bottom ${game.bottomScore} vs Top ${game.topScore} - Winner: ${game.winnerTeam}`);
      });
    }
    console.log('');
    
    // Completed Games aus Subcollection laden
    console.log('📂 COMPLETED GAMES ANALYSE:');
    const completedGamesRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames');
    const completedGamesSnap = await completedGamesRef.get();
    
    console.log(`Anzahl Completed Games: ${completedGamesSnap.size}`);
    
    let totalBottomScore = 0;
    let totalTopScore = 0;
    let totalBottomStriche = {berg: 0, matsch: 0, sieg: 0, schneider: 0, kontermatsch: 0};
    let totalTopStriche = {berg: 0, matsch: 0, sieg: 0, schneider: 0, kontermatsch: 0};
    
    completedGamesSnap.forEach(doc => {
      const game = doc.data();
      console.log(`\n--- Spiel ${game.gameNumber} ---`);
      console.log(`Final Scores: Bottom ${game.finalScores?.bottom}, Top ${game.finalScores?.top}`);
      console.log(`Winner: ${game.winnerTeam || 'nicht definiert'}`);
      console.log(`Final Striche Bottom:`, game.finalStriche?.bottom);
      console.log(`Final Striche Top:`, game.finalStriche?.top);
      
      // Prüfe auf teams-Property
      if (game.teams) {
        console.log('⚠️  TEAMS PROPERTY GEFUNDEN! Das sollte nicht da sein bei completed games.');
        console.log('Teams:', Object.keys(game.teams));
      }
      
      // Summiere Scores
      if (game.finalScores) {
        totalBottomScore += game.finalScores.bottom || 0;
        totalTopScore += game.finalScores.top || 0;
      }
      
      // Summiere Striche
      if (game.finalStriche) {
        Object.keys(totalBottomStriche).forEach(key => {
          totalBottomStriche[key] += game.finalStriche.bottom?.[key] || 0;
          totalTopStriche[key] += game.finalStriche.top?.[key] || 0;
        });
      }
    });
    
    console.log('\n📊 BERECHNETE SUMMEN:');
    console.log(`Total Bottom Score: ${totalBottomScore}`);
    console.log(`Total Top Score: ${totalTopScore}`);
    console.log(`Total Bottom Striche:`, totalBottomStriche);
    console.log(`Total Top Striche:`, totalTopStriche);
    
    // Vergleiche mit Session-Daten
    console.log('\n🔍 KONSISTENZ-PRÜFUNG:');
    const sessionBottomScore = sessionData.finalScores?.bottom || 0;
    const sessionTopScore = sessionData.finalScores?.top || 0;
    
    console.log(`Session Bottom Score: ${sessionBottomScore} vs Berechnet: ${totalBottomScore} - ${sessionBottomScore === totalBottomScore ? '✅' : '❌'}`);
    console.log(`Session Top Score: ${sessionTopScore} vs Berechnet: ${totalTopScore} - ${sessionTopScore === totalTopScore ? '✅' : '❌'}`);
    
    // Gewinner-Logik prüfen
    console.log('\n🏆 GEWINNER-LOGIK PRÜFUNG:');
    const gameWinsBottom = sessionData.gameWinsByTeam?.bottom || 0;
    const gameWinsTop = sessionData.gameWinsByTeam?.top || 0;
    
    console.log(`Game Wins: Bottom ${gameWinsBottom}, Top ${gameWinsTop}`);
    
    let expectedWinner;
    if (gameWinsBottom > gameWinsTop) {
      expectedWinner = 'bottom';
    } else if (gameWinsTop > gameWinsBottom) {
      expectedWinner = 'top';
    } else {
      // Bei Unentschieden entscheiden Punkte
      expectedWinner = sessionBottomScore > sessionTopScore ? 'bottom' : 'top';
    }
    
    console.log(`Erwarteter Gewinner: ${expectedWinner}`);
    console.log(`Tatsächlicher Gewinner: ${sessionData.winnerTeamKey}`);
    console.log(`Gewinner korrekt: ${expectedWinner === sessionData.winnerTeamKey ? '✅' : '❌'}`);
    
    // Prüfe Migration History
    console.log('\n📜 MIGRATION HISTORY:');
    if (sessionData.migrationHistory) {
      sessionData.migrationHistory.forEach((migration, index) => {
        console.log(`${index + 1}. ${migration.timestamp?.toDate()} - ${migration.script}: ${migration.description}`);
      });
    }
    
    console.log('\n🔧 EMPFEHLUNGEN:');
    
    if (expectedWinner !== sessionData.winnerTeamKey) {
      console.log('❌ KRITISCH: Winner Team Key ist falsch!');
      console.log(`   Sollte sein: ${expectedWinner}, ist aber: ${sessionData.winnerTeamKey}`);
    }
    
    if (sessionBottomScore !== totalBottomScore || sessionTopScore !== totalTopScore) {
      console.log('❌ KRITISCH: Final Scores stimmen nicht überein!');
    }
    
    // Prüfe auf weitere Inkonsistenzen
    const calculatedStricheBottom = Object.values(totalBottomStriche).reduce((sum, val) => sum + val, 0);
    const calculatedStricheTop = Object.values(totalTopStriche).reduce((sum, val) => sum + val, 0);
    const sessionStricheBottom = Object.values(sessionData.finalStriche?.bottom || {}).reduce((sum, val) => sum + val, 0);
    const sessionStricheTop = Object.values(sessionData.finalStriche?.top || {}).reduce((sum, val) => sum + val, 0);
    
    console.log(`\nStriche-Summen: Bottom ${sessionStricheBottom} vs ${calculatedStricheBottom}, Top ${sessionStricheTop} vs ${calculatedStricheTop}`);
    
    if (sessionStricheBottom !== calculatedStricheBottom || sessionStricheTop !== calculatedStricheTop) {
      console.log('❌ KRITISCH: Striche-Summen stimmen nicht überein!');
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

analyzeJune27Session().then(() => {
  console.log('\n✅ Analyse abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
}); 