/**
 * Prüfe die Struktur des Turniers und finde die Rohdaten
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function check() {
  console.log('📊 TURNIER-STRUKTUR\n');
  
  // 1. Tournament Dokument
  const tournamentDoc = await db.doc(`tournaments/${TOURNAMENT_ID}`).get();
  console.log('Tournament fields:', Object.keys(tournamentDoc.data() || {}));
  
  // 2. Subcollections
  const collections = await db.doc(`tournaments/${TOURNAMENT_ID}`).listCollections();
  console.log('\nSubcollections:', collections.map(c => c.id));
  
  // 3. Erste Dokumente jeder Subcollection
  for (const coll of collections) {
    const snap = await coll.limit(2).get();
    console.log(`\n📌 ${coll.id} (${snap.size} docs shown):`);
    snap.docs.forEach(doc => {
      console.log(`   Doc ${doc.id}: ${Object.keys(doc.data()).slice(0, 10).join(', ')}`);
    });
  }
  
  // 4. Prüfe sessions subcollection
  const sessionsSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/sessions`).get();
  if (sessionsSnap.size > 0) {
    console.log('\n📌 Sessions im Detail:');
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`\n   Session ${doc.id}:`);
      console.log(`      status: ${data.status}`);
      console.log(`      Teams Top: ${data.teams?.top?.players?.map(p => p.displayName).join(' & ')}`);
      console.log(`      Teams Bottom: ${data.teams?.bottom?.players?.map(p => p.displayName).join(' & ')}`);
      console.log(`      eventCounts.top.matsch: ${data.eventCounts?.top?.matsch}`);
      console.log(`      eventCounts.bottom.matsch: ${data.eventCounts?.bottom?.matsch}`);
      console.log(`      finalStriche.top.matsch: ${data.finalStriche?.top?.matsch}`);
      console.log(`      finalStriche.bottom.matsch: ${data.finalStriche?.bottom?.matsch}`);
    });
  }
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
