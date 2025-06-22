const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function analyzePasse10Rounds() {
  console.log('🎯 DETAILLIERTE RUNDEN-ANALYSE VON PASSE 10\n');
  
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
    
    console.log(`\n🎮 PASSE 10 - TEAMS:`);
    console.log(`====================`);
    console.log(`Top Team: ${game.topTeam?.map(p => p.displayName || p.name).join(' & ') || 'Unbekannt'}`);
    console.log(`Bottom Team: ${game.bottomTeam?.map(p => p.displayName || p.name).join(' & ') || 'Unbekannt'}`);
    
    console.log(`\n📊 FINALE SCORES (KORRIGIERT):`);
    console.log(`==============================`);
    console.log(`Top Team: ${game.topScore} Punkte`);
    console.log(`Bottom Team: ${game.bottomScore} Punkte`);
    console.log(`Gewinner: ${game.winnerTeam === 'top' ? 'Top Team' : 'Bottom Team'}`);
    
    console.log(`\n🏆 FINALE STRICHE:`);
    console.log(`==================`);
    console.log(`Top Team:`, game.finalStriche?.top || {});
    console.log(`Bottom Team:`, game.finalStriche?.bottom || {});
    
    // Lade die activeGame Daten für detaillierte Runden-Info
    console.log(`\n🔄 Lade detaillierte Runden-Daten...`);
    
    // Versuche, das activeGame zu finden
    const activeGamesQuery = db.collection('activeGames')
      .where('sessionId', '==', tournamentId)
      .where('gameNumber', '==', 10);
    
    const activeGamesSnapshot = await activeGamesQuery.get();
    
    if (activeGamesSnapshot.empty) {
      console.log('⚠️  ActiveGame für Passe 10 nicht gefunden. Zeige verfügbare Daten:');
      
      // Fallback: Zeige was im gameResult verfügbar ist
      if (game.roundHistory && game.roundHistory.length > 0) {
        console.log(`\n📋 RUNDEN-HISTORIE (aus gameResult):`);
        console.log(`====================================`);
        
        let cumulativeTop = 0;
        let cumulativeBottom = 0;
        
        for (let i = 0; i < game.roundHistory.length; i++) {
          const round = game.roundHistory[i];
          const roundNumber = i + 1;
          
          const roundTopPoints = round.jassPoints?.top || 0;
          const roundBottomPoints = round.jassPoints?.bottom || 0;
          
          cumulativeTop += roundTopPoints;
          cumulativeBottom += roundBottomPoints;
          
          console.log(`\n🎴 RUNDE ${roundNumber}:`);
          console.log(`   Trumpf: ${round.trumpf || 'Unbekannt'}`);
          console.log(`   Top Team: ${roundTopPoints} Punkte (Kumuliert: ${cumulativeTop})`);
          console.log(`   Bottom Team: ${roundBottomPoints} Punkte (Kumuliert: ${cumulativeBottom})`);
          
          if (round.striche) {
            console.log(`   Top Striche:`, round.striche.top || {});
            console.log(`   Bottom Striche:`, round.striche.bottom || {});
          }
        }
      } else {
        console.log('❌ Keine detaillierten Runden-Daten verfügbar.');
      }
      
      return;
    }
    
    // ActiveGame gefunden - lade Runden-Details
    const activeGameDoc = activeGamesSnapshot.docs[0];
    const activeGame = activeGameDoc.data();
    
    console.log(`✅ ActiveGame gefunden: ${activeGameDoc.id}`);
    
    // Lade alle Runden
    const roundsQuery = db.collection('activeGames')
      .doc(activeGameDoc.id)
      .collection('rounds')
      .orderBy('roundNumber');
    
    const roundsSnapshot = await roundsQuery.get();
    
    if (roundsSnapshot.empty) {
      console.log('❌ Keine Runden-Daten in activeGame gefunden.');
      return;
    }
    
    console.log(`\n📋 DETAILLIERTE RUNDEN-ANALYSE:`);
    console.log(`===============================`);
    console.log(`Anzahl Runden: ${roundsSnapshot.size}`);
    
    let cumulativeTop = 0;
    let cumulativeBottom = 0;
    
    roundsSnapshot.forEach((roundDoc, index) => {
      const round = roundDoc.data();
      const roundNumber = round.roundNumber || (index + 1);
      
      const roundTopPoints = round.jassPoints?.top || 0;
      const roundBottomPoints = round.jassPoints?.bottom || 0;
      
      cumulativeTop += roundTopPoints;
      cumulativeBottom += roundBottomPoints;
      
      console.log(`\n🎴 RUNDE ${roundNumber}:`);
      console.log(`   Trumpf: ${round.trumpf || round.trumpfColor || 'Unbekannt'}`);
      console.log(`   Ansager: ${round.ansager || 'Unbekannt'}`);
      console.log(`   Punkte Top Team: ${roundTopPoints} (Kumuliert: ${cumulativeTop})`);
      console.log(`   Punkte Bottom Team: ${roundBottomPoints} (Kumuliert: ${cumulativeBottom})`);
      
      if (round.striche) {
        const topStriche = round.striche.top || {};
        const bottomStriche = round.striche.bottom || {};
        
        if (Object.keys(topStriche).length > 0 || Object.keys(bottomStriche).length > 0) {
          console.log(`   Top Striche:`, topStriche);
          console.log(`   Bottom Striche:`, bottomStriche);
        }
      }
      
      if (round.matchPoints) {
        console.log(`   Match Punkte: Top ${round.matchPoints.top || 0}, Bottom ${round.matchPoints.bottom || 0}`);
      }
      
      // Zusätzliche Details falls verfügbar
      if (round.duration) {
        const durationMin = Math.round(round.duration / 60000);
        console.log(`   Dauer: ${durationMin} Minuten`);
      }
    });
    
    console.log(`\n📊 FINALE KUMULIERTE WERTE:`);
    console.log(`===========================`);
    console.log(`Top Team Total: ${cumulativeTop} Punkte`);
    console.log(`Bottom Team Total: ${cumulativeBottom} Punkte`);
    console.log(`Differenz: ${Math.abs(cumulativeTop - cumulativeBottom)} Punkte`);
    
    // Vergleiche mit korrigierten finalen Scores
    console.log(`\n🔧 VERGLEICH MIT KORRIGIERTEN SCORES:`);
    console.log(`====================================`);
    console.log(`ActiveGame Kumuliert - Top: ${cumulativeTop}, Bottom: ${cumulativeBottom}`);
    console.log(`GameResult Final - Top: ${game.topScore}, Bottom: ${game.bottomScore}`);
    
    if (cumulativeTop !== game.topScore || cumulativeBottom !== game.bottomScore) {
      console.log(`⚠️  UNTERSCHIED: Die Runden-Summe stimmt nicht mit den finalen Scores überein.`);
      console.log(`   Das ist normal, da wir die finalen Scores korrigiert haben.`);
    } else {
      console.log(`✅ ÜBEREINSTIMMUNG: Runden-Summe = Finale Scores`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Runden-Analyse:', error);
  }
}

analyzePasse10Rounds()
  .then(() => {
    console.log('\n🎯 Runden-Analyse abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
