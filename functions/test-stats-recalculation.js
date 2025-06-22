const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

async function testStatsRecalculation() {
  console.log('🔄 Testing group statistics recalculation...\n');
  
  try {
    // Importiere und führe Gruppenstatistik-Berechnung aus
    const groupStatsModule = await import('./lib/groupStatsCalculator.js');
    
    // Remos Gruppe ID (aus der Analyse)
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    
    console.log(`📊 Recalculating statistics for group: ${groupId}`);
    
    // Führe Statistik-Neuberechnung aus
    await groupStatsModule.updateGroupComputedStatsAfterSession(groupId);
    
    console.log('✅ Group statistics recalculation completed!\n');
    
    // Lade die neu berechneten Statistiken
    const db = admin.firestore();
    const statsDoc = await db.collection('groupComputedStats').doc(groupId).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      
      console.log('📈 Updated Group Statistics:');
      console.log(`   Sessions: ${stats.sessionCount}`);
      console.log(`   Games: ${stats.gameCount}`);
      console.log(`   Members: ${stats.memberCount}`);
      console.log(`   Total play time: ${Math.round(stats.totalPlayTimeSeconds / 60)} minutes`);
      
      console.log('\n👥 Top Players by Games:');
      stats.playerWithMostGames?.slice(0, 5).forEach((player, index) => {
        console.log(`   ${index + 1}. ${player.playerName}: ${player.value} games`);
      });
      
      console.log('\n🎯 Top Players by Striche Difference:');
      stats.playerWithHighestStricheDiff?.slice(0, 5).forEach((player, index) => {
        const sign = player.value >= 0 ? '+' : '';
        console.log(`   ${index + 1}. ${player.playerName}: ${sign}${player.value} striche`);
      });
      
      // Prüfe spezifisch Remos Statistiken
      const remoId = 'b16c1120111b7d9e7d733837';
      const remoGames = stats.playerWithMostGames?.find(p => p.playerId === remoId);
      const remoStriche = stats.playerWithHighestStricheDiff?.find(p => p.playerId === remoId);
      
      console.log('\n🎯 Remos spezifische Statistiken:');
      if (remoGames) {
        console.log(`   Spiele: ${remoGames.value}`);
      }
      if (remoStriche) {
        const sign = remoStriche.value >= 0 ? '+' : '';
        console.log(`   Striche-Differenz: ${sign}${remoStriche.value}`);
      }
      
      // Erwartete Werte (aus manueller Berechnung)
      console.log('\n🔍 Expected vs Actual:');
      console.log(`   Expected Remo Games: 21`);
      console.log(`   Actual Remo Games: ${remoGames?.value || 'NOT FOUND'}`);
      console.log(`   Expected Remo Striche Diff: +13`);
      console.log(`   Actual Remo Striche Diff: ${remoStriche?.value || 'NOT FOUND'}`);
      
      // Validierung
      if (remoGames?.value === 21 && remoStriche?.value === 13) {
        console.log('\n🎉 SUCCESS: Remos Statistiken sind jetzt korrekt!');
      } else {
        console.log('\n⚠️  ATTENTION: Remos Statistiken entsprechen noch nicht den erwarteten Werten.');
      }
      
    } else {
      console.log('❌ Group statistics document not found');
    }
    
  } catch (error) {
    console.error('❌ Error during statistics recalculation:', error);
  }
}

// Führe den Test aus
testStatsRecalculation()
  .then(() => {
    console.log('\n🎉 Statistics test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Statistics test failed:', error);
    process.exit(1);
  }); 