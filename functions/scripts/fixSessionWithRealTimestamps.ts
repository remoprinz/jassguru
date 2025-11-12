import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Korrigiert die Session mit ECHTEN Timestamps aus completedGames
 */
async function fixWithRealTimestamps() {
  const sessionId = 'XRZov4VU7tuM_0GBmYoWw';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('🔧 Fixing with REAL timestamps from completedGames...\n');
  
  // 1. Hole completedGames mit echten Timestamps
  const completedGamesSnap = await db.collection(`groups/${groupId}/sessions/${sessionId}/completedGames`)
    .orderBy('gameNumber')
    .get();
  
  console.log('📊 COMPLETEDGAMES:');
  const gameTimestamps: { [key: number]: Date } = {};
  
  for (const doc of completedGamesSnap.docs) {
    const game = doc.data();
    const gameNumber = game.gameNumber;
    const timestamp = game.timestampCompleted?.toDate?.() || game.completedAt?.toDate?.() || new Date();
    
    gameTimestamps[gameNumber] = timestamp;
    console.log(`  Spiel ${gameNumber}: ${timestamp.toISOString()}`);
  }
  
  // 3. Korrekte Elo-Werte (aus unserem manuellen Script)
  const correctFinalRatings = {
    'b16c1120111b7d9e7d733837': { // Remo
      gameByGameRatings: [
        { gameNumber: 1, rating: 144.32, delta: 6.17 },
        { gameNumber: 2, rating: 137.60, delta: -6.72 },
        { gameNumber: 3, rating: 131.85, delta: -5.75 },
        { gameNumber: 4, rating: 139.46, delta: 7.61 }
      ]
    },
    'F1uwdthL6zu7F0cYf1jbe': { // Frank
      gameByGameRatings: [
        { gameNumber: 1, rating: 79.62, delta: 6.17 },
        { gameNumber: 2, rating: 72.90, delta: -6.72 },
        { gameNumber: 3, rating: 67.15, delta: -5.75 },
        { gameNumber: 4, rating: 74.76, delta: 7.61 }
      ]
    },
    '9K2d1OQ1mCXddko7ft6y': { // Michael
      gameByGameRatings: [
        { gameNumber: 1, rating: 109.28, delta: -6.17 },
        { gameNumber: 2, rating: 116.00, delta: 6.72 },
        { gameNumber: 3, rating: 121.75, delta: 5.75 },
        { gameNumber: 4, rating: 114.14, delta: -7.61 }
      ]
    },
    'TPBwj8bP9W59n5LoGWP5': { // Schmuudii
      gameByGameRatings: [
        { gameNumber: 1, rating: 93.83, delta: -6.17 },
        { gameNumber: 2, rating: 100.55, delta: 6.72 },
        { gameNumber: 3, rating: 106.30, delta: 5.75 },
        { gameNumber: 4, rating: 98.69, delta: -7.61 }
      ]
    }
  };
  
  // 4. Update ratingHistory mit echten Timestamps
  console.log('\n📝 Updating ratingHistory with REAL timestamps...');
  
  for (const [playerId, data] of Object.entries(correctFinalRatings)) {
    for (const gameData of data.gameByGameRatings) {
      const gameNumber = gameData.gameNumber;
      const realTimestamp = gameTimestamps[gameNumber];
      
      if (!realTimestamp) {
        console.log(`⚠️ No timestamp for game ${gameNumber}`);
        continue;
      }
      
      // Finde den Entry für dieses Spiel
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('sessionId', '==', sessionId)
        .where('gameNumber', '==', gameNumber)
        .where('eventType', '==', 'game')
        .get();
      
      if (historySnap.empty) {
        console.log(`⚠️ No entry found for player ${playerId.slice(0,8)}... game ${gameNumber}`);
        continue;
      }
      
      const doc = historySnap.docs[0];
      await doc.ref.update({
        completedAt: admin.firestore.Timestamp.fromDate(realTimestamp),
        rating: gameData.rating,
        delta: gameData.delta
      });
      
      console.log(`   ✅ ${playerId.slice(0,8)}... Spiel ${gameNumber}: ${realTimestamp.toISOString()} → Rating ${gameData.rating.toFixed(2)}`);
    }
  }
  
  console.log('\n🎉 DONE! All timestamps updated with REAL times from completedGames!');
}

fixWithRealTimestamps()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

