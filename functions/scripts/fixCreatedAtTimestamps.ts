import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Setzt createdAt = completedAt für chronologische Sortierung
 */
async function fixCreatedAtTimestamps() {
  const sessionId = 'XRZov4VU7tuM_0GBmYoWw';
  
  console.log('🔧 Fixing createdAt timestamps to match completedAt...\n');
  
  const participantPlayerIds = [
    'b16c1120111b7d9e7d733837', // Remo
    'F1uwdthL6zu7F0cYf1jbe',     // Frank
    '9K2d1OQ1mCXddko7ft6y',     // Michael
    'TPBwj8bP9W59n5LoGWP5'      // Schmuudii
  ];
  
  for (const playerId of participantPlayerIds) {
    console.log(`\n📝 Player ${playerId.slice(0,8)}...:`);
    
    const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
      .where('sessionId', '==', sessionId)
      .where('eventType', '==', 'game')
      .get();
    
    for (const doc of historySnap.docs) {
      const data = doc.data();
      const completedAt = data.completedAt;
      
      if (completedAt) {
        await doc.ref.update({
          createdAt: completedAt  // ← Setze createdAt = completedAt
        });
        
        console.log(`  ✅ Spiel ${data.gameNumber}: createdAt → ${completedAt.toDate().toISOString()}`);
      }
    }
  }
  
  console.log('\n🎉 DONE! All createdAt timestamps now match completedAt!');
  console.log('\n📊 Now entries will be sorted chronologically by createdAt AND completedAt!');
}

fixCreatedAtTimestamps()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

