const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function showPasse10TeamsDetails() {
  console.log('🎯 PASSE 10 - TEAMS UND VERFÜGBARE DETAILS\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📅 Datum: ${tournament.startedAt ? new Date(tournament.startedAt.seconds * 1000).toLocaleDateString('de-CH') : 'Unbekannt'}`);
    
    // Zeige alle Teilnehmer
    console.log(`\n👥 TURNIER-TEILNEHMER:`);
    console.log(`======================`);
    if (tournament.playerNames) {
      Object.entries(tournament.playerNames).forEach(([index, name]) => {
        console.log(`   Spieler ${index}: ${name}`);
      });
    }
    
    if (tournament.participantPlayerIds) {
      console.log(`\nTeilnehmer Player IDs:`, tournament.participantPlayerIds);
    }
    
    // Zeige Teams-Struktur
    console.log(`\n🏆 TURNIER-TEAMS STRUKTUR:`);
    console.log(`==========================`);
    if (tournament.teams) {
      console.log(`Top Team:`, tournament.teams.top);
      console.log(`Bottom Team:`, tournament.teams.bottom);
    }
    
    if (!tournament.gameResults || tournament.gameResults.length < 10) {
      console.log('❌ Passe 10 nicht gefunden!');
      return;
    }
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9;
    const game = tournament.gameResults[gameIndex];
    
    console.log(`\n🎮 PASSE 10 - DETAILLIERTE SPIEL-DATEN:`);
    console.log(`=======================================`);
    
    // Zeige alle verfügbaren Felder des Spiels
    console.log(`\n📋 VERFÜGBARE SPIEL-FELDER:`);
    Object.keys(game).forEach(key => {
      if (key === 'topTeam' || key === 'bottomTeam') {
        console.log(`   ${key}:`, game[key]);
      } else if (key === 'finalStriche') {
        console.log(`   ${key}:`, JSON.stringify(game[key], null, 2));
      } else if (typeof game[key] === 'object' && game[key] !== null) {
        console.log(`   ${key}:`, JSON.stringify(game[key], null, 2));
      } else {
        console.log(`   ${key}: ${game[key]}`);
      }
    });
    
    console.log(`\n🎯 PASSE 10 - TEAMS:`);
    console.log(`====================`);
    
    // Versuche Teams aus verschiedenen Quellen zu ermitteln
    let topTeamNames = 'Unbekannt';
    let bottomTeamNames = 'Unbekannt';
    
    if (game.topTeam && Array.isArray(game.topTeam)) {
      topTeamNames = game.topTeam.map(p => p.displayName || p.name || 'Unbekannt').join(' & ');
    }
    
    if (game.bottomTeam && Array.isArray(game.bottomTeam)) {
      bottomTeamNames = game.bottomTeam.map(p => p.displayName || p.name || 'Unbekannt').join(' & ');
    }
    
    // Falls Teams nicht in gameResult, versuche aus Turnier-Teams mit gameNumber
    if (topTeamNames === 'Unbekannt' && tournament.teams) {
      // Für Spiel 10 könnten die Teams rotiert sein
      console.log(`\n🔄 Versuche Team-Rotation für Spiel 10 zu berechnen...`);
      
      if (tournament.teams.top && tournament.teams.bottom) {
        // Einfache Annahme: Teams könnten gewechselt haben
        topTeamNames = tournament.teams.top.players?.map(p => p.displayName).join(' & ') || 'Unbekannt';
        bottomTeamNames = tournament.teams.bottom.players?.map(p => p.displayName).join(' & ') || 'Unbekannt';
        
        console.log(`   (Basierend auf Turnier-Teams, möglicherweise rotiert)`);
      }
    }
    
    console.log(`Top Team: ${topTeamNames}`);
    console.log(`Bottom Team: ${bottomTeamNames}`);
    
    console.log(`\n📊 FINALE SCORES (KORRIGIERT):`);
    console.log(`==============================`);
    console.log(`${topTeamNames}: ${game.topScore} Punkte`);
    console.log(`${bottomTeamNames}: ${game.bottomScore} Punkte`);
    console.log(`Differenz: ${Math.abs(game.topScore - game.bottomScore)} Punkte`);
    console.log(`Gewinner: ${game.winnerTeam === 'top' ? topTeamNames : bottomTeamNames}`);
    
    console.log(`\n🏆 FINALE STRICHE:`);
    console.log(`==================`);
    const topStriche = game.finalStriche?.top || {};
    const bottomStriche = game.finalStriche?.bottom || {};
    
    console.log(`${topTeamNames}:`);
    Object.entries(topStriche).forEach(([type, count]) => {
      if (count > 0) console.log(`   ${type}: ${count}`);
    });
    
    console.log(`${bottomTeamNames}:`);
    Object.entries(bottomStriche).forEach(([type, count]) => {
      if (count > 0) console.log(`   ${type}: ${count}`);
    });
    
    // Prüfe, ob Runden-Historie verfügbar ist
    if (game.roundHistory && game.roundHistory.length > 0) {
      console.log(`\n📋 RUNDEN-HISTORIE VERFÜGBAR:`);
      console.log(`=============================`);
      console.log(`Anzahl Runden: ${game.roundHistory.length}`);
      
      let cumulativeTop = 0;
      let cumulativeBottom = 0;
      
      game.roundHistory.forEach((round, index) => {
        const roundNumber = index + 1;
        const roundTopPoints = round.jassPoints?.top || 0;
        const roundBottomPoints = round.jassPoints?.bottom || 0;
        
        cumulativeTop += roundTopPoints;
        cumulativeBottom += roundBottomPoints;
        
        console.log(`\n🎴 RUNDE ${roundNumber}:`);
        console.log(`   Trumpf: ${round.trumpf || 'Unbekannt'}`);
        console.log(`   ${topTeamNames}: ${roundTopPoints} Punkte (Kumuliert: ${cumulativeTop})`);
        console.log(`   ${bottomTeamNames}: ${roundBottomPoints} Punkte (Kumuliert: ${cumulativeBottom})`);
        
        if (round.striche) {
          const roundTopStriche = round.striche.top || {};
          const roundBottomStriche = round.striche.bottom || {};
          
          if (Object.values(roundTopStriche).some(v => v > 0)) {
            console.log(`   ${topTeamNames} Striche:`, roundTopStriche);
          }
          if (Object.values(roundBottomStriche).some(v => v > 0)) {
            console.log(`   ${bottomTeamNames} Striche:`, roundBottomStriche);
          }
        }
      });
      
      console.log(`\n📊 RUNDEN-SUMME:`);
      console.log(`================`);
      console.log(`${topTeamNames}: ${cumulativeTop} Punkte`);
      console.log(`${bottomTeamNames}: ${cumulativeBottom} Punkte`);
      
      if (cumulativeTop !== game.topScore || cumulativeBottom !== game.bottomScore) {
        console.log(`\n⚠️  HINWEIS: Runden-Summe ≠ Finale Scores`);
        console.log(`   Grund: Finale Scores wurden korrigiert (4200/3550)`);
        console.log(`   Original Runden-Summe: ${cumulativeTop}/${cumulativeBottom}`);
      }
    } else {
      console.log(`\n❌ KEINE RUNDEN-HISTORIE VERFÜGBAR`);
      console.log(`===================================`);
      console.log(`Die detaillierten Runden-Daten sind nicht mehr verfügbar.`);
      console.log(`Grund: ActiveGame-Daten wurden nach Turnier-Abschluss gelöscht.`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Team-Analyse:', error);
  }
}

showPasse10TeamsDetails()
  .then(() => {
    console.log('\n🎯 Team-Analyse abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
