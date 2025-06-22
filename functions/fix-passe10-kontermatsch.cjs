const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function fixPasse10Kontermatsch() {
  console.log('🔧 Korrigiere Passe 10, Spiel 1 - entferne falschen Kontermatsch...\n');
  
  try {
    const tournamentId = '6eNr8fnsTO06jgCqjelt';
    
    // Lade das Turnier
    const tournamentDoc = await db.collection('jassGameSummaries').doc(tournamentId).get();
    const tournament = tournamentDoc.data();
    
    console.log(`🏆 Turnier: ${tournamentId}`);
    console.log(`📊 Anzahl Spiele: ${tournament.gameResults?.length || 0}`);
    
    if (!tournament.gameResults || tournament.gameResults.length === 0) {
      console.log('❌ Keine gameResults gefunden!');
      return;
    }
    
    // Spiel 10 ist Index 9 (0-basiert)
    const gameIndex = 9; // Spiel 10
    const game = tournament.gameResults[gameIndex];
    
    console.log(`\n🎮 Spiel ${gameIndex + 1} VORHER:`);
    console.log(`   Top Team finalStriche:`, game.finalStriche?.top);
    console.log(`   Bottom Team finalStriche:`, game.finalStriche?.bottom);
    
    // Frank ist in Top Team in Spiel 10
    console.log(`\n🔧 KORREKTUR: Entferne Kontermatsch von Frank (Top Team):`);
    
    // Erstelle eine Kopie der gameResults
    const updatedGameResults = [...tournament.gameResults];
    
    // Korrigiere Spiel 10 (Index 9)
    if (updatedGameResults[gameIndex].finalStriche?.top?.kontermatsch) {
      console.log(`   Ändere Top Team kontermatsch von ${updatedGameResults[gameIndex].finalStriche.top.kontermatsch} auf 0`);
      updatedGameResults[gameIndex] = {
        ...updatedGameResults[gameIndex],
        finalStriche: {
          ...updatedGameResults[gameIndex].finalStriche,
          top: {
            ...updatedGameResults[gameIndex].finalStriche.top,
            kontermatsch: 0 // ✅ KORREKTUR: Entferne falschen Kontermatsch
          }
        }
      };
    }
    
    console.log(`\n🎮 Spiel ${gameIndex + 1} NACHHER:`);
    console.log(`   Top Team finalStriche:`, updatedGameResults[gameIndex].finalStriche?.top);
    console.log(`   Bottom Team finalStriche:`, updatedGameResults[gameIndex].finalStriche?.bottom);
    
    // Speichere die Änderungen
    console.log(`\n💾 Speichere Änderungen...`);
    await db.collection('jassGameSummaries').doc(tournamentId).update({
      gameResults: updatedGameResults,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Turnier-Daten erfolgreich korrigiert!`);
    
    // Triggere Neuberechnung der Statistiken
    console.log(`\n🔄 Triggere Neuberechnung der Statistiken...`);
    
    // Triggere Player Stats Update für alle Teilnehmer
    const participants = tournament.participantPlayerIds || [];
    console.log(`📊 Aktualisiere Statistiken für ${participants.length} Spieler...`);
    
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    // Update Player Stats
    for (const playerId of participants) {
      await updatePlayerStats(playerId);
      console.log(`   ✅ ${playerId} aktualisiert`);
    }
    
    // Update Group Stats
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    console.log(`   ✅ Gruppenstatistiken aktualisiert`);
    
    console.log(`\n🎯 KORREKTUR ABGESCHLOSSEN!`);
    
    // Prüfe Frank's neue Kontermatsch-Bilanz
    const statsDoc = await db.collection('groupComputedStats').doc('Tz0wgIHMTlhvTtFastiJ').get();
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      const frankStats = stats.playerWithHighestKontermatschBilanz?.find(p => p.playerName === 'Frank');
      if (frankStats) {
        console.log(`\n👤 FRANK'S NEUE KONTERMATSCH-BILANZ:`);
        console.log(`   Bilanz: ${frankStats.value >= 0 ? '+' : ''}${frankStats.value}`);
        console.log(`   Gemacht: ${frankStats.eventsMade || 0}`);
        console.log(`   Bekommen: ${frankStats.eventsReceived || 0}`);
        
        if (frankStats.value === 0 && frankStats.eventsMade === 1 && frankStats.eventsReceived === 1) {
          console.log(`   ✅ PERFEKT! Frank hat jetzt 1 gemacht, 1 bekommen = 0 Bilanz`);
        } else {
          console.log(`   ❌ Noch nicht korrekt...`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Korrektur:', error);
  }
}

fixPasse10Kontermatsch()
  .then(() => {
    console.log('\n🎯 Passe 10 Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
