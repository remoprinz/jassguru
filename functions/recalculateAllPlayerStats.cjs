const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Import NACH der Initialisierung, um "app/no-app"-Fehler zu vermeiden
const { updatePlayerStats } = require('./lib/playerStatsCalculator');

const db = admin.firestore();
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

async function recalculateAllPlayerStats() {
  console.log('🚀 Starting recalculation of all player statistics...');

  try {
    // 1. Finde alle einzigartigen Spieler-IDs aus allen abgeschlossenen Sessions
    console.log('🔎 Step 1: Finding all unique players from completed sessions...');
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where('status', '==', 'completed')
      .get();

    const uniquePlayerIds = new Set();
    sessionsSnap.forEach(doc => {
      const data = doc.data();
      if (data.participantPlayerIds && Array.isArray(data.participantPlayerIds)) {
        data.participantPlayerIds.forEach(id => uniquePlayerIds.add(id));
      }
    });

    const playerIds = Array.from(uniquePlayerIds);
    console.log(`✅ Found ${playerIds.length} unique players to process.`);

    if (playerIds.length === 0) {
      console.log('No players found. Exiting.');
      return;
    }

    // 2. Iteriere über jeden Spieler und berechne die Statistiken neu
    console.log('\n🔥 Step 2: Recalculating stats for each player...');
    let processedCount = 0;
    
    for (const playerId of playerIds) {
      if (typeof playerId !== 'string' || !playerId) {
        console.warn(`Skipping invalid player ID: ${playerId}`);
        continue;
      }
      
      console.log(`  -> Processing player ${playerId}...`);
      
      try {
        await updatePlayerStats(playerId);
        processedCount++;
        console.log(`  ✅ Successfully updated stats for player ${playerId}`);
      } catch (playerError) {
        console.error(`    ❌ Error processing player ${playerId}:`, playerError);
        continue; // Continue with the next player even if one fails
      }
    }

    console.log(`\n🎉 Success! Recalculated statistics for ${processedCount} players.`);

  } catch (error) {
    console.error('❌ An error occurred during the recalculation process:', error);
  }
}

recalculateAllPlayerStats().then(() => {
  console.log('Script finished.');
  process.exit(0);
}).catch(err => {
  console.error('Script failed with unhandled error:', err);
  process.exit(1);
}); 