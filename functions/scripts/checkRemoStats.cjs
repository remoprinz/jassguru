const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

async function check() {
  const remoId = 'b16c1120111b7d9e7d733837';
  const opponentStatsSnap = await db.collection(`players/${remoId}/opponentStats`).get();
  
  console.log('\n=== REMO OPPONENT SESSION STATS ===\n');
  for (const doc of opponentStatsSnap.docs) {
    const data = doc.data();
    console.log(`${data.opponentDisplayName}: ${data.sessionsWonAgainst}W/${data.sessionsLostAgainst}L/${data.sessionsDrawAgainst}D von ${data.sessionsPlayedAgainst} = ${(data.sessionsWonAgainst / data.sessionsPlayedAgainst * 100).toFixed(1)}%`);
  }
  
  await admin.app().delete();
  process.exit(0);
}

check().catch(console.error);
