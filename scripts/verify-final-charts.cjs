/**
 * Finale Verifikation der korrigierten Charts
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function verify() {
  console.log('📊 FINALE VERIFIKATION DER KORRIGIERTEN CHARTS\n');
  
  // 1. chartData_matsch
  const matschDoc = await db.collection(`groups/${GROUP_ID}/aggregated`).doc('chartData_matsch').get();
  const matschData = matschDoc.data();
  const remoMatsch = matschData.datasets.find(d => d.playerId === REMO_ID);
  
  console.log('📈 Matsch-Bilanz für Remo:');
  const lastMatsch = remoMatsch.data.slice(-5);
  const matschLabels = matschData.labels.slice(-5);
  lastMatsch.forEach((val, i) => {
    console.log(`   ${matschLabels[i]}: ${val}`);
  });
  const matschDelta = lastMatsch[4] - lastMatsch[3];
  console.log(`   Delta am 15.01: ${matschDelta}`);
  
  // 2. chartData_striche
  const stricheDoc = await db.collection(`groups/${GROUP_ID}/aggregated`).doc('chartData_striche').get();
  const stricheData = stricheDoc.data();
  const remoStriche = stricheData.datasets.find(d => d.playerId === REMO_ID);
  
  console.log('\n📈 Striche-Differenz für Remo:');
  const lastStriche = remoStriche.data.slice(-5);
  const stricheLabels = stricheData.labels.slice(-5);
  lastStriche.forEach((val, i) => {
    console.log(`   ${stricheLabels[i]}: ${val}`);
  });
  const stricheDelta = lastStriche[4] - lastStriche[3];
  console.log(`   Delta am 15.01: ${stricheDelta}`);
  
  // 3. chartData_points
  const pointsDoc = await db.collection(`groups/${GROUP_ID}/aggregated`).doc('chartData_points').get();
  const pointsData = pointsDoc.data();
  const remoPoints = pointsData.datasets.find(d => d.playerId === REMO_ID);
  
  console.log('\n📈 Punkte-Differenz für Remo:');
  const lastPoints = remoPoints.data.slice(-5);
  const pointsLabels = pointsData.labels.slice(-5);
  lastPoints.forEach((val, i) => {
    console.log(`   ${pointsLabels[i]}: ${val}`);
  });
  const pointsDelta = lastPoints[4] - lastPoints[3];
  console.log(`   Delta am 15.01: ${pointsDelta}`);
  
  // 4. scoresHistory (zum Vergleich)
  console.log('\n📈 scoresHistory (zum Vergleich):');
  const scoresSnap = await db.collection(`players/${REMO_ID}/scoresHistory`)
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get();
  const latestScores = scoresSnap.docs[0]?.data();
  console.log(`   stricheDiff: ${latestScores?.stricheDiff}`);
  console.log(`   pointsDiff: ${latestScores?.pointsDiff}`);
  console.log(`   matschBilanz: ${latestScores?.matschBilanz}`);
  
  // 5. Vergleich
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERGLEICH:');
  console.log('='.repeat(60));
  console.log(`   Matsch:   Chart=${matschDelta}, scoresHistory=${latestScores?.matschBilanz} → ${matschDelta === latestScores?.matschBilanz ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   Striche:  Chart=${stricheDelta}, scoresHistory=${latestScores?.stricheDiff} → ${stricheDelta === latestScores?.stricheDiff ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   Punkte:   Chart=${pointsDelta}, scoresHistory=${latestScores?.pointsDiff} → ${pointsDelta === latestScores?.pointsDiff ? '✅ MATCH' : '❌ MISMATCH'}`);
}

verify()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
