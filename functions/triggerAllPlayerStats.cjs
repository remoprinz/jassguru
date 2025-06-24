const admin = require('firebase-admin');

// Lade Service Account Key
const serviceAccount = require('./serviceAccountKey.json');

// Initialisiere Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-1d7c5-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

async function triggerAllPlayerStatsUpdate() {
  console.log('🚀 Starting batch player stats update for ALL players...');
  
  try {
    // 1. Alle Spieler aus der players Collection laden
    console.log('📋 Fetching all players...');
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
        
        // Dynamisch die updatePlayerStats Funktion importieren und aufrufen
        const { updatePlayerStats } = require('./src/playerStatsCalculator');
        await updatePlayerStats(player.id);
        
        successCount++;
        console.log(`${progress} ✅ Successfully updated stats for ${player.displayName || player.id}`);
        
        // Kleine Pause zwischen den Berechnungen um Firestore nicht zu überlasten
        if (i < allPlayers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
    
  } catch (error) {
    console.error('💥 Critical error during batch update:', error);
    process.exit(1);
  } finally {
    // Admin SDK beenden
    await admin.app().delete();
    console.log('🔚 Admin SDK connection closed.');
    process.exit(0);
  }
}

// Script ausführen
triggerAllPlayerStatsUpdate(); 