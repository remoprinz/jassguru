import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';
const sessionId = '6RdW4o4PRv0UzsZWysex'; // 13. Nov

async function diagnose() {
  console.log(`🔍 DIAGNOSE: Session ${sessionId} (13. Nov)`);
  
  const doc = await db.collection('groups').doc(groupId).collection('jassGameSummaries').doc(sessionId).get();
  if (!doc.exists) {
    console.error('❌ Session nicht gefunden!');
    process.exit(1);
  }
  
  const data = doc.data();
  console.log(`📅 Datum: ${data.completedAt.toDate().toLocaleString()}`);
  console.log(`🎮 Spiele: ${data.gameResults?.length}`);
  
  if (data.gameResults) {
    console.log('\n🕵️ PRÜFE SPIELDETAILS:');
    data.gameResults.forEach((game, index) => {
      const hasEventCounts = !!game.eventCounts;
      const finalStriche = game.finalStriche || {};
      const topStriche = finalStriche.top || {};
      const bottomStriche = finalStriche.bottom || {};
      
      const matschInStricheTop = topStriche.matsch || 0;
      const matschInStricheBottom = bottomStriche.matsch || 0;
      
      const matschInEventsTop = game.eventCounts?.top?.matsch || 0;
      const matschInEventsBottom = game.eventCounts?.bottom?.matsch || 0;
      
      console.log(`  Spiel ${index + 1}:`);
      console.log(`    eventCounts vorhanden: ${hasEventCounts ? '✅' : '❌'}`);
      console.log(`    Matsch (via eventCounts): Top=${matschInEventsTop}, Bottom=${matschInEventsBottom}`);
      console.log(`    Matsch (via finalStriche): Top=${matschInStricheTop}, Bottom=${matschInStricheBottom}`);
      
      if (matschInStricheTop > 0 || matschInStricheBottom > 0) {
        console.log('    🎯 MATSCH GEFUNDEN IN STRICHEN!');
        if (!hasEventCounts || (matschInEventsTop === 0 && matschInEventsBottom === 0)) {
          console.log('    ⚠️  ABER NICHT IN EVENTCOUNTS!');
        }
      }
    });
  }
  
  process.exit(0);
}

diagnose().catch(console.error);
