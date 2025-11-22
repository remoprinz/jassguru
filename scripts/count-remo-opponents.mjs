import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const remoId = 'b16c1120111b7d9e7d733837';

async function count() {
  const snap = await db.collection('players').doc(remoId).collection('opponentStats').get();
  console.log(`Anzahl Gegner für Remo: ${snap.size}`);
  process.exit(0);
}

count().catch(console.error);
