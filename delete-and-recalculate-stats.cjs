const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren
const serviceAccount = require('./functions/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function deleteAndRecalculateStats() {
  console.log('🗑️ Deleting old player stats and triggering recalculation...\n');
  
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    // 1. Lösche die alten Statistiken
    console.log(`🗑️ Deleting old stats for player: ${playerId}`);
    const statsRef = db.collection('playerComputedStats').doc(playerId);
    await statsRef.delete();
    console.log('✅ Old stats deleted successfully!');
    
    // 2. Triggere eine Neuberechnung über die Cloud Function
    console.log(`\n🔄 Triggering recalculation...`);
    
    // Da wir die Cloud Function nicht direkt aufrufen können, 
    // simulieren wir einen Trigger durch Aktualisierung einer jassGameSummary
    const summariesSnapshot = await db.collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', playerId)
      .limit(1)
      .get();
    
    if (!summariesSnapshot.empty) {
      const firstSummary = summariesSnapshot.docs[0];
      const currentData = firstSummary.data();
      
      // Kleine Aktualisierung, um den Trigger auszulösen
      await firstSummary.ref.update({
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        // Behalte alle anderen Daten bei
        ...currentData
      });
      
      console.log(`✅ Triggered recalculation via summary: ${firstSummary.id}`);
    } else {
      console.log('⚠️ No game summaries found to trigger recalculation');
    }
    
    // 3. Warte kurz und prüfe die neuen Statistiken
    console.log('\n⏳ Waiting 5 seconds for recalculation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. Lese die neuen Statistiken
    console.log(`\n📖 Reading new stats...`);
    const newStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (newStatsDoc.exists) {
      const newStats = newStatsDoc.data();
      
      console.log('\n🎉 === NEUE STATISTIKEN MIT WIN-RATE INFO ===');
      
      // Zeige die neuen Win-Rate Informationen
      console.log('\n📊 Session Win-Rate:');
      if (newStats.sessionWinRateInfo) {
        console.log(`   ✅ Strukturiert: ${newStats.sessionWinRateInfo.displayText}`);
        console.log(`   📈 Details: ${newStats.sessionWinRateInfo.wins} Siege von ${newStats.sessionWinRateInfo.total} entschiedenen Partien`);
      } else {
        console.log('   ❌ sessionWinRateInfo noch nicht vorhanden');
      }
      
      console.log('\n🎮 Game Win-Rate:');
      if (newStats.gameWinRateInfo) {
        console.log(`   ✅ Strukturiert: ${newStats.gameWinRateInfo.displayText}`);
        console.log(`   📈 Details: ${newStats.gameWinRateInfo.wins} Siege von ${newStats.gameWinRateInfo.total} Spielen`);
      } else {
        console.log('   ❌ gameWinRateInfo noch nicht vorhanden');
      }
      
      // Zeige Partner-Statistiken
      console.log('\n👥 === PARTNER WIN-RATES ===');
      if (newStats.partnerAggregates && newStats.partnerAggregates.length > 0) {
        newStats.partnerAggregates.slice(0, 2).forEach((partner, index) => {
          console.log(`\n${index + 1}. ${partner.partnerDisplayName}:`);
          if (partner.sessionWinRateInfo) {
            console.log(`   📊 Partien: ${partner.sessionWinRateInfo.displayText}`);
          } else {
            console.log(`   📊 Partien: ${partner.sessionsWonWith}/${partner.sessionsPlayedWith} (Fallback)`);
          }
          if (partner.gameWinRateInfo) {
            console.log(`   🎮 Spiele: ${partner.gameWinRateInfo.displayText}`);
          } else {
            console.log(`   🎮 Spiele: ${partner.gamesWonWith}/${partner.gamesPlayedWith} (Fallback)`);
          }
        });
      }
      
    } else {
      console.log('❌ Neue Statistiken noch nicht erstellt. Möglicherweise dauert die Berechnung länger.');
    }
    
    console.log('\n✅ Delete and recalculate process completed!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

deleteAndRecalculateStats().then(() => {
  console.log('\n🎉 Script finished!');
  process.exit(0);
}).catch(err => {
  console.error('💥 Unerwarteter Fehler:', err);
  process.exit(1);
}); 