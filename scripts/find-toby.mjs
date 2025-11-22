import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findToby() {
  const snap = await db.collection('players').where('displayName', '==', 'Toby').get();
  if (snap.empty) {
    console.log('Toby nicht gefunden');
  } else {
    snap.forEach(doc => console.log(`Toby ID: ${doc.id}`));
  }
  process.exit(0);
}

findToby().catch(console.error);
