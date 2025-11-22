import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const playerId = 'b16c1120111b7d9e7d733837'; // Remo

async function scanMatsch() {
  console.log('🔍 SCANNE: Matsch-Bilanz für Remo (b16c1120...)');
  
  const snapshot = await db.collection('players').doc(playerId).collection('scoresHistory')
    .orderBy('completedAt', 'asc')
    .get();
    
  let cumulative = 0;
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.completedAt.toDate().toLocaleDateString('de-DE');
    const matsch = data.matschBilanz || 0;
    cumulative += matsch;
    
    if (matsch !== 0) {
      console.log(`📅 ${date}: ${matsch > 0 ? '+' : ''}${matsch} (Total: ${cumulative})`);
    }
  });
  
  console.log(`\n🏁 ENDSTAND: ${cumulative}`);
  process.exit(0);
}

scanMatsch().catch(console.error);
