import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const playerId = 'b16c1120111b7d9e7d733837';
const sessionId = '6RdW4o4PRv0UzsZWysex';

async function checkHistory() {
  console.log(`🔍 PRÜFE: scoresHistory für Remo (${playerId}) am 13. Nov (${sessionId})`);
  
  const doc = await db.collection('players').doc(playerId).collection('scoresHistory').doc(sessionId).get();
  
  if (!doc.exists) {
    console.log('❌ Kein Eintrag gefunden!');
  } else {
    console.log('✅ Eintrag gefunden:', JSON.stringify(doc.data(), null, 2));
  }
  
  process.exit(0);
}

checkHistory().catch(console.error);
