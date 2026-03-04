/**
 * Diagnose: Prüfe scoresHistory-Einträge für ALLE Turnierteilnehmer
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function diagnose() {
  console.log('🔍 DIAGNOSE: scoresHistory für ALLE Turnierteilnehmer\n');
  
  // 1. Lade Tournament jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  const participantPlayerIds = data.participantPlayerIds || [];
  
  console.log(`Turnier: ${TOURNAMENT_ID}`);
  console.log(`Teilnehmer: ${participantPlayerIds.length}\n`);
  console.log('='.repeat(100));
  
  // 2. Prüfe scoresHistory für jeden Teilnehmer
  let missingCount = 0;
  let incompleteCount = 0;
  
  for (const playerId of participantPlayerIds) {
    // Lade Spielername
    const playerDoc = await db.doc(`players/${playerId}`).get();
    const playerName = playerDoc.data()?.displayName || playerId;
    
    // Suche scoresHistory-Eintrag für dieses Turnier
    const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`)
      .where('sessionId', '==', TOURNAMENT_ID)
      .limit(1)
      .get();
    
    console.log(`\n📌 ${playerName} (${playerId.substring(0, 10)}...):`);
    
    if (scoresHistorySnap.empty) {
      console.log('   ❌ KEIN scoresHistory-Eintrag für Turnier gefunden!');
      missingCount++;
      
      // Prüfe ob es überhaupt scoresHistory-Einträge gibt
      const anyScoresHistory = await db.collection(`players/${playerId}/scoresHistory`)
        .orderBy('completedAt', 'desc')
        .limit(3)
        .get();
      
      if (anyScoresHistory.empty) {
        console.log('   ⚠️  Hat GAR KEINE scoresHistory-Einträge!');
      } else {
        console.log('   📊 Letzte 3 scoresHistory-Einträge:');
        anyScoresHistory.docs.forEach(doc => {
          const d = doc.data();
          const date = d.completedAt?.toDate?.()?.toLocaleDateString('de-DE') || '?';
          console.log(`      - ${date}: sessionId=${doc.data().sessionId?.substring(0, 10)}...`);
        });
      }
    } else {
      const entry = scoresHistorySnap.docs[0].data();
      const docId = scoresHistorySnap.docs[0].id;
      
      console.log(`   ✅ scoresHistory-Eintrag gefunden (${docId.substring(0, 10)}...)`);
      console.log(`      stricheDiff:    ${entry.stricheDiff !== undefined ? entry.stricheDiff : '❌ UNDEFINED'}`);
      console.log(`      pointsDiff:     ${entry.pointsDiff !== undefined ? entry.pointsDiff : '❌ UNDEFINED'}`);
      console.log(`      matschBilanz:   ${entry.matschBilanz !== undefined ? entry.matschBilanz : '❌ UNDEFINED'}`);
      console.log(`      wins:           ${entry.wins !== undefined ? entry.wins : '❌ UNDEFINED'}`);
      console.log(`      losses:         ${entry.losses !== undefined ? entry.losses : '❌ UNDEFINED'}`);
      console.log(`      gameNumber:     ${entry.gameNumber !== undefined ? entry.gameNumber : '❌ UNDEFINED'}`);
      console.log(`      isTournament:   ${entry.isTournamentSession}`);
      
      // Prüfe auf fehlende Felder
      const missingFields = [];
      if (entry.stricheDiff === undefined) missingFields.push('stricheDiff');
      if (entry.pointsDiff === undefined) missingFields.push('pointsDiff');
      if (entry.matschBilanz === undefined) missingFields.push('matschBilanz');
      
      if (missingFields.length > 0) {
        console.log(`   ⚠️  FEHLENDE FELDER: ${missingFields.join(', ')}`);
        incompleteCount++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('📊 ZUSAMMENFASSUNG:');
  console.log('='.repeat(100));
  console.log(`   Teilnehmer total:     ${participantPlayerIds.length}`);
  console.log(`   Fehlende Einträge:    ${missingCount}`);
  console.log(`   Unvollständige:       ${incompleteCount}`);
  console.log(`   Korrekte:             ${participantPlayerIds.length - missingCount - incompleteCount}`);
  
  // 3. Prüfe was finalizeTournament hätte schreiben sollen
  console.log('\n' + '='.repeat(100));
  console.log('📊 WAS HÄTTE finalizeTournament SCHREIBEN SOLLEN?');
  console.log('='.repeat(100));
  
  // Zeige totalPointsByPlayer, totalStricheByPlayer aus jassGameSummary
  console.log('\n📌 totalPointsByPlayer:');
  const totalPoints = data.totalPointsByPlayer || {};
  Object.entries(totalPoints).forEach(([pid, points]) => {
    const playerDoc = participantPlayerIds.includes(pid);
    console.log(`   ${pid.substring(0, 10)}...: ${points} ${playerDoc ? '' : '(nicht in participantPlayerIds!)'}`);
  });
  
  console.log('\n📌 totalStricheByPlayer (summiert):');
  const totalStriche = data.totalStricheByPlayer || {};
  Object.entries(totalStriche).forEach(([pid, striche]) => {
    const total = (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + 
                  (striche.schneider || 0) + (striche.kontermatsch || 0);
    console.log(`   ${pid.substring(0, 10)}...: ${total} Striche`);
  });
}

diagnose()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
