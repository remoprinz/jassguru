import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';
const sessionId = 'UIamH_JPMb9Yd5-sWHr-U'; // 15.5.

async function inspect() {
  console.log(`🔍 INSPEKTION: Session ${sessionId} (15.5.)`);
  
  const doc = await db.collection('groups').doc(groupId).collection('jassGameSummaries').doc(sessionId).get();
  const data = doc.data();
  
  console.log('Is Tournament:', data.isTournamentSession || data.tournamentId ? 'YES' : 'NO');
  console.log('Has gameResults:', data.gameResults ? `YES (${data.gameResults.length})` : 'NO');
  
  if (data.gameResults) {
    console.log('\nGame Results Sample:');
    data.gameResults.forEach((g, i) => {
      console.log(`Game ${i+1}:`);
      console.log(`  FinalStriche:`, JSON.stringify(g.finalStriche));
      console.log(`  EventCounts:`, JSON.stringify(g.eventCounts));
    });
  } else {
    console.log('\nEventCounts (Regular):', JSON.stringify(data.eventCounts));
    console.log('FinalStriche (Regular):', JSON.stringify(data.finalStriche));
  }
  
  process.exit(0);
}

inspect().catch(console.error);
