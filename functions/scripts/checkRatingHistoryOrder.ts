import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkOrder() {
  const sessionId = 'XRZov4VU7tuM_0GBmYoWw';
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  console.log('🔍 Checking ratingHistory order for Remo...\n');
  
  const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
    .where('sessionId', '==', sessionId)
    .where('eventType', '==', 'game')
    .get();
  
  const entries = historySnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (a.gameNumber || 0) - (b.gameNumber || 0));
  
  console.log('📊 RATINGHISTORY EINTRÄGE (sortiert nach gameNumber):');
  for (const entry of entries) {
    const e = entry as any;
    console.log(`\n  Spiel ${e.gameNumber}:`);
    console.log(`    Rating: ${e.rating?.toFixed(2)}`);
    console.log(`    Delta: ${e.delta > 0 ? '+' : ''}${e.delta?.toFixed(2)}`);
    console.log(`    CompletedAt: ${e.completedAt?.toDate?.().toISOString() || 'N/A'}`);
    console.log(`    DocID: ${e.id}`);
  }
  
  // Vergleiche mit jassGameSummaries
  console.log('\n\n📊 JASSGAMESUMMARIES GAMERESULTS:');
  const sessionDoc = await db.doc(`groups/Tz0wgIHMTlhvTtFastiJ/jassGameSummaries/${sessionId}`).get();
  const sessionData = sessionDoc.data();
  const gameResults = sessionData?.gameResults || [];
  
  for (const game of gameResults) {
    console.log(`\n  Spiel ${game.gameNumber}:`);
    console.log(`    Winner: ${game.winnerTeam}`);
    console.log(`    Bottom: ${game.bottomScore}, Top: ${game.topScore}`);
    console.log(`    Bottom Striche: ${JSON.stringify(game.finalStriche?.bottom || {})}`);
    console.log(`    Top Striche: ${JSON.stringify(game.finalStriche?.top || {})}`);
  }
}

checkOrder()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

