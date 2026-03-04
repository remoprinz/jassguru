/**
 * Prüfe: Haben die scoresHistory-Einträge das Feld eventType?
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';
const DAVESTER_ID = '4nhOwuVONajPArNERzyEj';
const MAZI_ID = 'ZLvyUYt_E5jhaUc0oF7O0';
const FABINSKI_ID = 'NEROr2WAYG41YEiV9v4ba';

async function check() {
  console.log('🔍 PRÜFE: eventType in scoresHistory-Einträgen\n');
  
  const players = [
    { id: REMO_ID, name: 'Remo' },
    { id: DAVESTER_ID, name: 'Davester' },
    { id: MAZI_ID, name: 'Mazi' },
    { id: FABINSKI_ID, name: 'Fabinski' }
  ];
  
  for (const player of players) {
    console.log(`\n📌 ${player.name}:`);
    
    // Lade alle scoresHistory-Einträge
    const scoresHistorySnap = await db.collection(`players/${player.id}/scoresHistory`)
      .orderBy('completedAt', 'desc')
      .limit(5)
      .get();
    
    if (scoresHistorySnap.empty) {
      console.log('   ❌ Keine scoresHistory-Einträge');
      continue;
    }
    
    scoresHistorySnap.docs.forEach(doc => {
      const data = doc.data();
      const date = data.completedAt?.toDate?.()?.toLocaleDateString('de-DE') || '?';
      const isTournament = doc.data().sessionId === TOURNAMENT_ID;
      
      console.log(`   ${date}${isTournament ? ' (TURNIER)' : ''}:`);
      console.log(`      eventType: ${data.eventType || '❌ UNDEFINED'}`);
      console.log(`      pointsDiff: ${data.pointsDiff}`);
      console.log(`      stricheDiff: ${data.stricheDiff}`);
      console.log(`      sessionId: ${data.sessionId?.substring(0, 10)}...`);
    });
  }
  
  // Prüfe globalPointsHistoryService Logik
  console.log('\n' + '='.repeat(80));
  console.log('📊 WAS WÜRDE globalPointsHistoryService MACHEN?');
  console.log('='.repeat(80));
  
  // Für Remo
  const remoHistory = await db.collection(`players/${REMO_ID}/scoresHistory`).get();
  const hasGameEntries = remoHistory.docs.some(doc => {
    const data = doc.data();
    return data.eventType === 'game' && typeof data.pointsDiff === 'number';
  });
  
  console.log(`\n   Remo: hasGameEntries = ${hasGameEntries}`);
  console.log(`   → Wenn false, wird Fallback über jassGameSummaries verwendet`);
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
