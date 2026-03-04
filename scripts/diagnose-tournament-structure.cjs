/**
 * Diagnose der Tournament jassGameSummary Struktur
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function diagnose() {
  console.log('🔍 DIAGNOSE TOURNAMENT jassGameSummary STRUKTUR\n');
  
  // 1. Lade Tournament jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  
  if (!summaryDoc.exists) {
    console.log('❌ jassGameSummary nicht gefunden!');
    return;
  }
  
  const data = summaryDoc.data();
  
  console.log('='.repeat(80));
  console.log('📊 FELDER IM jassGameSummary:');
  console.log('='.repeat(80));
  
  // Prüfe kritische Felder für calculateSessionDelta
  const criticalFields = [
    'teams',              // Für Spieler-Team-Bestimmung
    'finalScores',        // Für pointsDifference
    'finalStriche',       // Für stricheDifference
    'eventCounts',        // Für matsch/schneider/kontermatsch Events
    'gameResults',        // Für Turniere
    'gameWinsByPlayer',   // Für wins/losses
    'totalPointsByPlayer',
    'totalStricheByPlayer',
    'totalEventCountsByPlayer',
    'sessionTotalWeisPoints', // Für Weis
    'isTournamentSession',
    'participantPlayerIds',
  ];
  
  console.log('\n📌 KRITISCHE FELDER:');
  criticalFields.forEach(field => {
    const value = data[field];
    if (value === undefined) {
      console.log(`   ❌ ${field}: UNDEFINED (FEHLT!)`);
    } else if (value === null) {
      console.log(`   ⚠️  ${field}: null`);
    } else if (Array.isArray(value)) {
      console.log(`   ✅ ${field}: Array mit ${value.length} Elementen`);
    } else if (typeof value === 'object') {
      console.log(`   ✅ ${field}: Object mit ${Object.keys(value).length} Keys`);
    } else {
      console.log(`   ✅ ${field}: ${typeof value} = ${value}`);
    }
  });
  
  // 2. Zeige gameResults Struktur
  if (data.gameResults && data.gameResults.length > 0) {
    console.log('\n📌 ERSTES gameResult STRUKTUR:');
    const firstGame = data.gameResults[0];
    console.log(JSON.stringify(firstGame, null, 2));
  }
  
  // 3. Zeige was fehlt für Remo
  console.log('\n📌 DATEN FÜR REMO (calculateSessionDelta Perspektive):');
  
  // teams - wo ist Remo?
  console.log(`\n   teams?.top?.players: ${JSON.stringify(data.teams?.top?.players?.map(p => p.playerId))}`);
  console.log(`   teams?.bottom?.players: ${JSON.stringify(data.teams?.bottom?.players?.map(p => p.playerId))}`);
  
  // Falls teams fehlt, prüfe gameResults
  if (!data.teams && data.gameResults) {
    console.log('\n   ⚠️  teams fehlt auf Root! Prüfe erstes gameResult:');
    const game1 = data.gameResults[0];
    console.log(`   gameResults[0].teams?.top?.players: ${JSON.stringify(game1?.teams?.top?.players?.map(p => p.playerId))}`);
    console.log(`   gameResults[0].teams?.bottom?.players: ${JSON.stringify(game1?.teams?.bottom?.players?.map(p => p.playerId))}`);
  }
  
  // finalScores
  console.log(`\n   finalScores: ${JSON.stringify(data.finalScores)}`);
  
  // Falls finalScores fehlt, zeige totalPointsByPlayer
  if (!data.finalScores && data.totalPointsByPlayer) {
    console.log(`   totalPointsByPlayer[${REMO_ID}]: ${data.totalPointsByPlayer[REMO_ID]}`);
  }
  
  // finalStriche
  console.log(`\n   finalStriche: ${JSON.stringify(data.finalStriche)}`);
  
  // Falls finalStriche fehlt, zeige totalStricheByPlayer
  if (!data.finalStriche && data.totalStricheByPlayer) {
    console.log(`   totalStricheByPlayer[${REMO_ID}]: ${JSON.stringify(data.totalStricheByPlayer[REMO_ID])}`);
  }
  
  // eventCounts
  console.log(`\n   eventCounts: ${JSON.stringify(data.eventCounts)}`);
  
  // Falls eventCounts fehlt, zeige totalEventCountsByPlayer
  if (!data.eventCounts && data.totalEventCountsByPlayer) {
    console.log(`   totalEventCountsByPlayer[${REMO_ID}]: ${JSON.stringify(data.totalEventCountsByPlayer[REMO_ID])}`);
  }
  
  // gameWinsByPlayer
  console.log(`\n   gameWinsByPlayer: ${JSON.stringify(data.gameWinsByPlayer?.[REMO_ID])}`);
  
  // 4. Vergleich mit einer normalen Session
  console.log('\n' + '='.repeat(80));
  console.log('📊 VERGLEICH MIT NORMALER SESSION:');
  console.log('='.repeat(80));
  
  const normalSessionsSnap = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
    .where('isTournamentSession', '==', false)
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get();
    
  if (normalSessionsSnap.empty) {
    // Fallback: Suche ohne Filter
    const allSessionsSnap = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .orderBy('completedAt', 'desc')
      .limit(5)
      .get();
      
    for (const doc of allSessionsSnap.docs) {
      const sData = doc.data();
      if (!sData.isTournamentSession && doc.id !== TOURNAMENT_ID) {
        console.log(`\n📄 Session ${doc.id}:`);
        console.log(`   teams: ${sData.teams ? 'EXISTS' : 'UNDEFINED'}`);
        console.log(`   finalScores: ${JSON.stringify(sData.finalScores)}`);
        console.log(`   finalStriche: ${JSON.stringify(sData.finalStriche)}`);
        console.log(`   eventCounts: ${JSON.stringify(sData.eventCounts)}`);
        break;
      }
    }
  } else {
    const normalDoc = normalSessionsSnap.docs[0];
    const sData = normalDoc.data();
    console.log(`\n📄 Session ${normalDoc.id}:`);
    console.log(`   teams: ${sData.teams ? 'EXISTS' : 'UNDEFINED'}`);
    console.log(`   finalScores: ${JSON.stringify(sData.finalScores)}`);
    console.log(`   finalStriche: ${JSON.stringify(sData.finalStriche)}`);
    console.log(`   eventCounts: ${JSON.stringify(sData.eventCounts)}`);
  }
  
  // 5. Fazit
  console.log('\n' + '='.repeat(80));
  console.log('📊 FAZIT:');
  console.log('='.repeat(80));
  
  const missingFields = [];
  if (!data.teams) missingFields.push('teams');
  if (!data.finalScores) missingFields.push('finalScores');
  if (!data.finalStriche) missingFields.push('finalStriche');
  if (!data.eventCounts) missingFields.push('eventCounts');
  
  if (missingFields.length > 0) {
    console.log('\n❌ FEHLENDE FELDER für calculateSessionDelta:');
    missingFields.forEach(f => console.log(`   - ${f}`));
    console.log('\n   Diese Felder werden von calculateSessionDelta() erwartet,');
    console.log('   sind aber im Tournament jassGameSummary NICHT vorhanden!');
    console.log('\n   Das erklärt, warum alle Werte 0 sind!');
  } else {
    console.log('\n✅ Alle kritischen Felder vorhanden');
  }
}

diagnose()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
