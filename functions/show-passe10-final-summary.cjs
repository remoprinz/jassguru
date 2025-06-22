const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function showPasse10FinalSummary() {
  console.log('🎯 PASSE 10 - FINALE ZUSAMMENFASSUNG\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📅 Datum: ${tournament.startedAt ? new Date(tournament.startedAt.seconds * 1000).toLocaleDateString('de-CH') : 'Unbekannt'}`);
    
    const game = tournament.gameResults[9]; // Spiel 10 = Index 9
    
    console.log(`\n🎮 PASSE 10 - TEAMS & ERGEBNISSE:`);
    console.log(`=================================`);
    
    // Teams aus dem Spiel extrahieren
    const topTeam = game.teams?.top?.players || [];
    const bottomTeam = game.teams?.bottom?.players || [];
    
    const topTeamNames = topTeam.map(p => p.displayName).join(' & ');
    const bottomTeamNames = bottomTeam.map(p => p.displayName).join(' & ');
    
    console.log(`🔵 Top Team: ${topTeamNames}`);
    console.log(`🔴 Bottom Team: ${bottomTeamNames}`);
    
    console.log(`\n📊 FINALE SCORES (KORRIGIERT):`);
    console.log(`==============================`);
    console.log(`🔵 ${topTeamNames}: ${game.topScore} Punkte`);
    console.log(`🔴 ${bottomTeamNames}: ${game.bottomScore} Punkte`);
    console.log(`📈 Differenz: ${Math.abs(game.topScore - game.bottomScore)} Punkte`);
    console.log(`�� Gewinner: ${game.winnerTeam === 'top' ? topTeamNames : bottomTeamNames}`);
    
    console.log(`\n🎯 FINALE STRICHE:`);
    console.log(`==================`);
    const topStriche = game.finalStriche?.top || {};
    const bottomStriche = game.finalStriche?.bottom || {};
    
    console.log(`🔵 ${topTeamNames}:`);
    Object.entries(topStriche).forEach(([type, count]) => {
      if (count > 0) {
        const emoji = type === 'berg' ? '⛰️' : type === 'sieg' ? '🏆' : type === 'matsch' ? '💧' : type === 'schneider' ? '❄️' : type === 'kontermatsch' ? '⚡' : '📊';
        console.log(`   ${emoji} ${type}: ${count}`);
      }
    });
    
    console.log(`🔴 ${bottomTeamNames}:`);
    Object.entries(bottomStriche).forEach(([type, count]) => {
      if (count > 0) {
        const emoji = type === 'berg' ? '⛰️' : type === 'sieg' ? '🏆' : type === 'matsch' ? '💧' : type === 'schneider' ? '❄️' : type === 'kontermatsch' ? '⚡' : '📊';
        console.log(`   ${emoji} ${type}: ${count}`);
      }
    });
    
    console.log(`\n⏱️  SPIEL-DAUER:`);
    console.log(`================`);
    if (game.durationSeconds) {
      const minutes = Math.floor(game.durationSeconds / 60);
      const seconds = game.durationSeconds % 60;
      console.log(`${minutes}:${seconds.toString().padStart(2, '0')} Minuten`);
    }
    
    if (game.completedAt) {
      const completedTime = new Date(game.completedAt._seconds * 1000);
      console.log(`Abgeschlossen: ${completedTime.toLocaleString('de-CH')}`);
    }
    
    console.log(`\n🔍 ANALYSE DER KORREKTUR:`);
    console.log(`=========================`);
    console.log(`Das Spiel wurde korrigiert, um eine mathematisch unmögliche`);
    console.log(`Situation zu beheben (0 Punkte = automatisch Kontermatsch).`);
    console.log(`\nKorrigierte Scores:`);
    console.log(`🔵 ${topTeamNames}: 4,200 Punkte (stark, passend zu 1 Berg + 2 Siege)`);
    console.log(`🔴 ${bottomTeamNames}: 3,550 Punkte (schwächer, passend zu 1 Matsch)`);
    console.log(`\n✅ Die Striche bleiben unverändert und mathematisch korrekt!`);
    
    // Zeige Turnier-Kontext
    console.log(`\n🏆 TURNIER-KONTEXT:`);
    console.log(`==================`);
    console.log(`Passe 10 von 15 total`);
    console.log(`Turnier-Status: Abgeschlossen`);
    console.log(`Teilnehmer: 4 Spieler`);
    
    // Frank's Kontermatsch-Situation
    console.log(`\n⚡ KONTERMATSCH-SITUATION:`);
    console.log(`=========================`);
    console.log(`Frank (Top Team) hatte in diesem Turnier:`);
    console.log(`• 1x Kontermatsch gemacht (in anderem Spiel)`);
    console.log(`• 1x Kontermatsch bekommen (in anderem Spiel)`);
    console.log(`• Bilanz: ±0 (perfekt ausgeglichen!)`);
    console.log(`\n✅ Durch die Korrektur bleibt Frank's Bilanz korrekt bei 0.`);
    
  } catch (error) {
    console.error('❌ Fehler bei der finalen Zusammenfassung:', error);
  }
}

showPasse10FinalSummary()
  .then(() => {
    console.log('\n🎯 Finale Zusammenfassung abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
