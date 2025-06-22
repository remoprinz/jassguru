const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function triggerGroupStatsUpdate() {
  console.log('🔄 Triggere Gruppenstatistik-Update nach Rohdaten-Korrektur...\n');
  
  try {
    // Importiere die Funktion direkt
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    console.log('📊 Starte Neuberechnung der Gruppenstatistiken...');
    
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    
    console.log('✅ Gruppenstatistiken erfolgreich aktualisiert!');
    
    // Lade die aktualisierten Statistiken
    const statsDoc = await db.collection('groupComputedStats').doc('Tz0wgIHMTlhvTtFastiJ').get();
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log(`\n🎯 AKTUELLE WERTE NACH KORREKTUR:`);
      console.log(`   sessionCount: ${stats.sessionCount}`);
      console.log(`   tournamentCount: ${stats.tournamentCount}`);
      console.log(`   gameCount: ${stats.gameCount}`);
      console.log(`   avgRoundsPerGame: ${stats.avgRoundsPerGame}`);
      console.log(`   avgGamesPerSession: ${stats.avgGamesPerSession}`);
      
      // Bilanz-Features prüfen
      if (stats.playerWithHighestMatschBilanz && stats.playerWithHighestMatschBilanz.length > 0) {
        console.log(`\n🏆 TOP MATSCH-BILANZ:`);
        stats.playerWithHighestMatschBilanz.slice(0, 3).forEach((player, index) => {
          console.log(`   ${index + 1}. ${player.playerName}: ${player.value > 0 ? '+' : ''}${player.value} (${player.eventsMade} gemacht, ${player.eventsReceived} bekommen)`);
        });
      }
      
      if (stats.playerWithHighestSchneiderBilanz && stats.playerWithHighestSchneiderBilanz.length > 0) {
        console.log(`\n❄️ TOP SCHNEIDER-BILANZ:`);
        stats.playerWithHighestSchneiderBilanz.slice(0, 3).forEach((player, index) => {
          console.log(`   ${index + 1}. ${player.playerName}: ${player.value > 0 ? '+' : ''}${player.value} (${player.eventsMade} gemacht, ${player.eventsReceived} bekommen)`);
        });
      }
      
      if (stats.playerWithHighestKontermatschBilanz && stats.playerWithHighestKontermatschBilanz.length > 0) {
        console.log(`\n💥 TOP KONTERMATSCH-BILANZ:`);
        stats.playerWithHighestKontermatschBilanz.slice(0, 3).forEach((player, index) => {
          console.log(`   ${index + 1}. ${player.playerName}: ${player.value > 0 ? '+' : ''}${player.value} (${player.eventsMade} gemacht, ${player.eventsReceived} bekommen)`);
        });
      }
      
    } else {
      console.log('❌ Keine Gruppenstatistiken gefunden!');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Update:', error);
  }
}

triggerGroupStatsUpdate()
  .then(() => {
    console.log('\n🎯 Update nach Rohdaten-Korrektur abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
