const admin = require('firebase-admin');

// Firebase Admin mit serviceAccountKey initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

// Import der TypeScript-Funktion über die kompilierte JS-Version
const { updatePlayerStats } = require('./lib/playerStatsCalculator');

async function triggerAllPlayerStatsUpdate() {
  console.log('🚀 Starting batch player stats update for ALL players...');
  
  try {
    // 1. Alle Spieler aus der players Collection laden
    console.log('📋 Fetching all players...');
    const db = admin.firestore();
    const playersSnapshot = await db.collection('players').get();
    const allPlayers = playersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Found ${allPlayers.length} players to process`);
    
    // 2. Für jeden Spieler die updatePlayerStats Funktion aufrufen
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      const progress = `[${i + 1}/${allPlayers.length}]`;
      
      try {
        console.log(`${progress} Processing player: ${player.displayName || 'Unknown'} (${player.id})`);
        
        // Player Stats berechnen
        await updatePlayerStats(player.id);
        
        successCount++;
        console.log(`${progress} ✅ Successfully updated stats for ${player.displayName || player.id}`);
        
        // Kleine Pause zwischen den Berechnungen um Firestore nicht zu überlasten
        if (i < allPlayers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 Sekunde Pause
        }
        
      } catch (error) {
        errorCount++;
        console.error(`${progress} ❌ Error updating stats for ${player.displayName || player.id}:`, error.message);
      }
    }
    
    console.log('\n📊 BATCH UPDATE SUMMARY:');
    console.log(`✅ Successfully updated: ${successCount} players`);
    console.log(`❌ Failed to update: ${errorCount} players`);
    console.log(`📈 Total processed: ${allPlayers.length} players`);
    
    if (errorCount === 0) {
      console.log('🎉 All player stats successfully updated!');
    } else {
      console.log(`⚠️  ${errorCount} players had errors. Check logs above for details.`);
    }
    
    // Zeige ein paar Beispiel-Statistiken zur Verifikation
    console.log('\n🔍 Sample verification - checking first few players:');
    for (let i = 0; i < Math.min(3, allPlayers.length); i++) {
      const player = allPlayers[i];
      try {
        const statsDoc = await db.collection('playerComputedStats').doc(player.id).get();
        if (statsDoc.exists) {
          const stats = statsDoc.data();
          console.log(`\n👤 ${player.displayName || player.id}:`);
          console.log(`   Total Sessions: ${stats.totalSessions || 0}`);
          console.log(`   Total Games: ${stats.totalGames || 0}`);
          console.log(`   Partner Aggregates: ${stats.partnerAggregates?.length || 0}`);
          console.log(`   Opponent Aggregates: ${stats.opponentAggregates?.length || 0}`);
        } else {
          console.log(`❌ No stats found for ${player.displayName || player.id}`);
        }
      } catch (error) {
        console.log(`❌ Error reading stats for ${player.displayName || player.id}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Critical error during batch update:', error);
    process.exit(1);
  }
  
  console.log('\n🔚 Batch update completed.');
  process.exit(0);
}

triggerAllPlayerStatsUpdate();
