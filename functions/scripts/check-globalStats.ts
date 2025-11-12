import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});
const db = admin.firestore();

async function checkGlobalStats() {
  console.log('🔍 Prüfe globalStats.current Daten...\n');
  
  // Test mit einem bekannten Spieler
  const playerId = 'b16c1120111b7d9e7d733837';
  const playerDoc = await db.collection('players').doc(playerId).get();
  
  if (playerDoc.exists) {
    const data = playerDoc.data();
    console.log('✅ Player exists:', playerId);
    console.log('\n📊 globalStats:');
    console.log(JSON.stringify(data?.globalStats, null, 2));
    
    if (data?.globalStats?.current) {
      const current = data.globalStats.current;
      console.log('\n✅ globalStats.current exists!');
      console.log('- sessionsWon:', current.sessionsWon);
      console.log('- sessionsLost:', current.sessionsLost);
      console.log('- sessionsDraw:', current.sessionsDraw);
      console.log('- gamesWon:', current.gamesWon);
      console.log('- gamesLost:', current.gamesLost);
      console.log('- totalGames:', current.totalGames);
      console.log('- trumpfStatistik:', current.trumpfStatistik);
      console.log('- totalTrumpfCount:', current.totalTrumpfCount);
    } else {
      console.log('\n❌ globalStats.current does NOT exist!');
    }
  } else {
    console.log('❌ Player does not exist');
  }
  
  process.exit(0);
}

checkGlobalStats().catch(console.error);

