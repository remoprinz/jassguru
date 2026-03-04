/**
 * Prüfe: Was steht in Davesters partnerStats?
 * Werden Turniere als Sessions gezählt?
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';

async function check() {
  console.log('🔍 PRÜFE: Davesters partnerStats\n');
  
  const partnerSnap = await db.collection(`players/${DAVESTER_ID}/partnerStats`).get();
  
  console.log(`Davester hat ${partnerSnap.size} Partner-Einträge:\n`);
  
  partnerSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`📌 Partner: ${data.partnerDisplayName || doc.id}`);
    console.log(`   sessionsPlayedWith: ${data.sessionsPlayedWith || 0} ← Sollte 0 sein für Turnier-Partner`);
    console.log(`   gamesPlayedWith: ${data.gamesPlayedWith || 0}`);
    console.log('');
  });
  
  console.log('='.repeat(80));
  console.log('ERWARTUNG:');
  console.log('   - Remo (mit Turnier): sessionsPlayedWith sollte NICHT um 1 erhöht worden sein');
  console.log('   - Mazi (nur Turnier): sessionsPlayedWith sollte 0 sein');
  console.log('   - Roger (nur Turnier): sessionsPlayedWith sollte 0 sein');
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
