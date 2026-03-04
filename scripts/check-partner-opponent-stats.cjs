/**
 * Prüfe: partnerStats und opponentStats für Turnierteilnehmer
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';
const FABINSKI_ID = 'NEROr2WAYG41YEiV9v4ba';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function check() {
  console.log('🔍 PRÜFE: partnerStats und opponentStats\n');
  
  const players = [
    { id: MAZI_ID, name: 'Mazi' },
    { id: FABINSKI_ID, name: 'Fabinski' },
    { id: DAVESTER_ID, name: 'Davester' },
    { id: REMO_ID, name: 'Remo' }
  ];
  
  for (const player of players) {
    console.log('='.repeat(80));
    console.log(`📌 ${player.name}:`);
    console.log('='.repeat(80));
    
    // Lade partnerStats
    const partnerSnap = await db.collection(`players/${player.id}/partnerStats`).limit(10).get();
    console.log(`   partnerStats: ${partnerSnap.size} Einträge`);
    
    if (partnerSnap.size > 0) {
      partnerSnap.docs.forEach(doc => {
        const data = doc.data();
        console.log(`      - ${data.partnerName || doc.id}: ${data.gamesPlayedWith || 0} Spiele, ${data.sessionsPlayedWith || 0} Sessions`);
      });
    }
    
    // Lade opponentStats
    const opponentSnap = await db.collection(`players/${player.id}/opponentStats`).limit(10).get();
    console.log(`   opponentStats: ${opponentSnap.size} Einträge`);
    
    if (opponentSnap.size > 0) {
      opponentSnap.docs.forEach(doc => {
        const data = doc.data();
        console.log(`      - ${data.opponentName || doc.id}: ${data.gamesPlayedAgainst || 0} Spiele`);
      });
    }
  }
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
