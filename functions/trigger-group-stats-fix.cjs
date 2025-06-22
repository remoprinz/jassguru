const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function triggerGroupStatsUpdate() {
  console.log('🔄 Triggere Gruppenstatistik-Update durch direkten Aufruf...\n');
  
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
      console.log(`\n🎯 NEUE WERTE:`);
      console.log(`   avgRoundsPerGame: ${stats.avgRoundsPerGame}`);
      console.log(`   gameCount: ${stats.gameCount}`);
      console.log(`   sessionCount: ${stats.sessionCount}`);
      console.log(`   tournamentCount: ${stats.tournamentCount || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Update:', error);
  }
}

triggerGroupStatsUpdate()
  .then(() => {
    console.log('\n🎯 Update abgeschlossen - prüfen Sie die avgRoundsPerGame in der App!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
