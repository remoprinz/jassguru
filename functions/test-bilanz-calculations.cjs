const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function testBilanzCalculations() {
  console.log('🔄 Teste neue Bilanz-Berechnungen...\n');
  
  try {
    // Importiere die Funktion direkt
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    console.log('📊 Starte Neuberechnung mit Bilanz-Features...');
    
    await updateGroupComputedStatsAfterSession('Tz0wgIHMTlhvTtFastiJ');
    
    console.log('✅ Gruppenstatistiken mit neuen Bilanz-Features aktualisiert!');
    
    // Lade die aktualisierten Statistiken
    const statsDoc = await db.collection('groupComputedStats').doc('Tz0wgIHMTlhvTtFastiJ').get();
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      
      console.log(`\n🎯 NEUE BILANZ-FEATURES:`);
      
      // Spieler-Bilanzen
      console.log(`\n👤 SPIELER-BILANZEN:`);
      if (stats.playerWithHighestMatschBilanz && stats.playerWithHighestMatschBilanz.length > 0) {
        const top = stats.playerWithHighestMatschBilanz[0];
        console.log(`   🎯 Matsch-Bilanz: ${top.playerName} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
      }
      
      if (stats.playerWithHighestSchneiderBilanz && stats.playerWithHighestSchneiderBilanz.length > 0) {
        const top = stats.playerWithHighestSchneiderBilanz[0];
        console.log(`   ❄️ Schneider-Bilanz: ${top.playerName} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
      }
      
      if (stats.playerWithHighestKontermatschBilanz && stats.playerWithHighestKontermatschBilanz.length > 0) {
        const top = stats.playerWithHighestKontermatschBilanz[0];
        console.log(`   ⚡ Kontermatsch-Bilanz: ${top.playerName} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
        console.log(`   📊 Kontermatsch-Spieler: ${stats.playerWithHighestKontermatschBilanz.length} (nur mit Erfahrung)`);
      } else {
        console.log(`   ⚡ Kontermatsch-Bilanz: Keine Spieler mit Kontermatsch-Erfahrung`);
      }
      
      // Team-Bilanzen
      console.log(`\n👥 TEAM-BILANZEN:`);
      if (stats.teamWithHighestMatschBilanz && stats.teamWithHighestMatschBilanz.length > 0) {
        const top = stats.teamWithHighestMatschBilanz[0];
        console.log(`   🎯 Matsch-Bilanz: ${top.names.join(' & ')} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
      }
      
      if (stats.teamWithHighestSchneiderBilanz && stats.teamWithHighestSchneiderBilanz.length > 0) {
        const top = stats.teamWithHighestSchneiderBilanz[0];
        console.log(`   ❄️ Schneider-Bilanz: ${top.names.join(' & ')} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
      }
      
      if (stats.teamWithHighestKontermatschBilanz && stats.teamWithHighestKontermatschBilanz.length > 0) {
        const top = stats.teamWithHighestKontermatschBilanz[0];
        console.log(`   ⚡ Kontermatsch-Bilanz: ${top.names.join(' & ')} = ${top.value >= 0 ? '+' : ''}${top.value} (${top.eventsMade || 0} gemacht, ${top.eventsReceived || 0} bekommen)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Test:', error);
  }
}

testBilanzCalculations()
  .then(() => {
    console.log('\n🎯 Bilanz-Test abgeschlossen - absolute Zahlen statt Quotienten! ✅');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
