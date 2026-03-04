/**
 * Prüfe: Was steht in Davesters globalStats?
 * Werden Turniere als Sessions gezählt?
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';

async function check() {
  console.log('🔍 PRÜFE: globalStats für Turnierteilnehmer\n');
  
  const players = [
    { id: DAVESTER_ID, name: 'Davester' },
    { id: MAZI_ID, name: 'Mazi' }
  ];
  
  for (const player of players) {
    console.log(`📌 ${player.name}:`);
    
    const playerDoc = await db.doc(`players/${player.id}`).get();
    const data = playerDoc.data();
    
    // globalStats können an verschiedenen Stellen sein
    const globalStats = data?.globalStats?.current || data?.globalStats || {};
    
    console.log(`   totalSessions: ${globalStats.totalSessions || 0} ← Sollte NUR Partien zählen, NICHT Turniere`);
    console.log(`   sessionsWon: ${globalStats.sessionsWon || 0}`);
    console.log(`   sessionsLost: ${globalStats.sessionsLost || 0}`);
    console.log(`   sessionsDraw: ${globalStats.sessionsDraw || 0}`);
    console.log(`   totalTournaments: ${globalStats.totalTournaments || 0} ← Sollte Turniere zählen`);
    console.log(`   totalGames: ${globalStats.totalGames || 0}`);
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('ERWARTUNG FÜR DAVESTER (nur 2 Turniere, keine Partien):');
  console.log('   - totalSessions sollte 0 sein');
  console.log('   - totalTournaments sollte 2 sein');
  console.log('');
  console.log('ERWARTUNG FÜR MAZI (nur 1 Turnier, keine Partien):');
  console.log('   - totalSessions sollte 0 sein');
  console.log('   - totalTournaments sollte 1 sein');
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
