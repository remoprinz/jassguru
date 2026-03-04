/**
 * VERIFIZIERUNG DER CHART-FIX (16.01.2026)
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function verify() {
  console.log('✅ VERIFIZIERUNG DER CHART-FIX\n');
  
  // 1. Prüfe jassGameSummary
  console.log('='.repeat(70));
  console.log('📊 jassGameSummary Root-Level Felder:');
  console.log('='.repeat(70));
  
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  
  const hasScores = !!data.finalScores;
  const hasStriche = !!data.finalStriche;
  const hasEvents = !!data.eventCounts;
  
  console.log(`   finalScores: ${hasScores ? '✅ VORHANDEN' : '❌ FEHLT'}`);
  console.log(`   finalStriche: ${hasStriche ? '✅ VORHANDEN' : '❌ FEHLT'}`);
  console.log(`   eventCounts: ${hasEvents ? '✅ VORHANDEN' : '❌ FEHLT'}`);
  
  if (hasScores) {
    console.log(`   → top: ${data.finalScores.top}, bottom: ${data.finalScores.bottom}`);
  }
  
  // 2. Prüfe scoresHistory für alle Spieler
  console.log('\n' + '='.repeat(70));
  console.log('📊 scoresHistory für alle Spieler:');
  console.log('='.repeat(70));
  
  const participantPlayerIds = data.participantPlayerIds || [];
  let allCorrect = true;
  
  for (const playerId of participantPlayerIds) {
    const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`)
      .where('sessionId', '==', TOURNAMENT_ID)
      .limit(1)
      .get();
    
    if (scoresHistorySnap.empty) {
      console.log(`   ⚠️ ${playerId.substring(0, 12)}...: Kein Eintrag gefunden`);
      continue;
    }
    
    const entryData = scoresHistorySnap.docs[0].data();
    const isZero = entryData.stricheDiff === 0 && entryData.pointsDiff === 0 && entryData.matschBilanz === 0;
    
    if (isZero) {
      console.log(`   ❌ ${playerId.substring(0, 12)}...: Alle Werte sind 0 - NOCH NICHT KORRIGIERT`);
      allCorrect = false;
    } else {
      console.log(`   ✅ ${playerId.substring(0, 12)}...: stricheDiff=${entryData.stricheDiff}, pointsDiff=${entryData.pointsDiff}, matschBilanz=${entryData.matschBilanz}`);
    }
  }
  
  // 3. Zusammenfassung
  console.log('\n' + '='.repeat(70));
  console.log('📊 FAZIT:');
  console.log('='.repeat(70));
  
  if (hasScores && hasStriche && hasEvents && allCorrect) {
    console.log('\n   ✅ ALLE DATEN KORREKT!');
    console.log('\n   Die Charts sollten jetzt korrekt angezeigt werden.');
    console.log('   Bitte die App neu laden und prüfen.');
  } else {
    console.log('\n   ⚠️ EINIGE DATEN FEHLEN NOCH:');
    if (!hasScores) console.log('   - finalScores fehlt');
    if (!hasStriche) console.log('   - finalStriche fehlt');
    if (!hasEvents) console.log('   - eventCounts fehlt');
    if (!allCorrect) console.log('   - Einige scoresHistory-Einträge sind noch nicht korrigiert');
  }
}

verify()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
