import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findRemo() {
  const snap = await db.collection('players').where('displayName', '==', 'Remo').get();
  if (snap.empty) {
    console.log('Remo nicht gefunden');
  } else {
    snap.forEach(doc => console.log(`Remo ID: ${doc.id}`));
  }
  process.exit(0);
}

findRemo().catch(console.error);
