/**
 * Untersucht die Chart-Daten in Firestore
 * Schaut auf die letzten Einträge für Matsch, Striche, Punkte
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Spieler zum Inspizieren
const PLAYERS = [
  { id: 'b16c1120111b7d9e7d733837', name: 'Remo' },
  { id: 'F1uwdthL6zu7F0cYf1jbe', name: 'Frank' },
];

async function inspect() {
  console.log('🔍 CHART-DATEN INSPEKTION\n');
  console.log('='.repeat(80));
  
  // 1. Schaue auf chartData_matsch
  console.log('\n📊 chartData_matsch:');
  const matschDoc = await db.collection(`groups/${GROUP_ID}/chartData`).doc('chartData_matsch').get();
  if (matschDoc.exists) {
    const data = matschDoc.data();
    console.log(`   Labels (letzte 5): ${JSON.stringify(data.labels?.slice(-5))}`);
    console.log(`   Datasets: ${data.datasets?.length} Spieler`);
    
    // Zeige letzte Werte für jeden Spieler
    data.datasets?.slice(0, 5).forEach(ds => {
      const lastValues = ds.data?.slice(-5);
      console.log(`   ${ds.label}: letzte 5 = ${JSON.stringify(lastValues)}`);
    });
  } else {
    console.log('   NICHT GEFUNDEN');
  }
  
  // 2. Schaue auf chartData_striche
  console.log('\n📊 chartData_striche:');
  const stricheDoc = await db.collection(`groups/${GROUP_ID}/chartData`).doc('chartData_striche').get();
  if (stricheDoc.exists) {
    const data = stricheDoc.data();
    console.log(`   Labels (letzte 5): ${JSON.stringify(data.labels?.slice(-5))}`);
    console.log(`   Datasets: ${data.datasets?.length} Spieler`);
    
    data.datasets?.slice(0, 5).forEach(ds => {
      const lastValues = ds.data?.slice(-5);
      console.log(`   ${ds.label}: letzte 5 = ${JSON.stringify(lastValues)}`);
    });
  } else {
    console.log('   NICHT GEFUNDEN');
  }
  
  // 3. Schaue auf chartData_points
  console.log('\n📊 chartData_points:');
  const pointsDoc = await db.collection(`groups/${GROUP_ID}/chartData`).doc('chartData_points').get();
  if (pointsDoc.exists) {
    const data = pointsDoc.data();
    console.log(`   Labels (letzte 5): ${JSON.stringify(data.labels?.slice(-5))}`);
    console.log(`   Datasets: ${data.datasets?.length} Spieler`);
    
    data.datasets?.slice(0, 5).forEach(ds => {
      const lastValues = ds.data?.slice(-5);
      console.log(`   ${ds.label}: letzte 5 = ${JSON.stringify(lastValues)}`);
    });
  } else {
    console.log('   NICHT GEFUNDEN');
  }
  
  // 4. Schaue auf jassGameSummary für das Turnier
  console.log('\n📊 jassGameSummary für Turnier:');
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  if (summaryDoc.exists) {
    const data = summaryDoc.data();
    console.log(`   SessionType: ${data.sessionType}`);
    console.log(`   CompletedAt: ${data.completedAt?.toDate?.()}`);
    console.log(`   GamesPlayed: ${data.gamesPlayed}`);
    
    // Zeige playerStats
    console.log('\n   PlayerStats:');
    const playerStats = data.playerStats || {};
    Object.entries(playerStats).slice(0, 4).forEach(([pid, stats]) => {
      console.log(`\n   ${pid.substring(0, 12)}...:`);
      console.log(`      ${JSON.stringify(stats, null, 2).split('\n').join('\n      ')}`);
    });
    
    // Zeige finalStriche
    console.log('\n   FinalStriche:', JSON.stringify(data.finalStriche));
    console.log('   FinalScores:', JSON.stringify(data.finalScores));
  } else {
    console.log('   NICHT GEFUNDEN');
  }
  
  // 5. Schaue auf scoresHistory für einen Spieler
  console.log('\n📊 scoresHistory für Remo (letzte 5):');
  const scoresHistorySnap = await db.collection(`players/${PLAYERS[0].id}/scoresHistory`)
    .orderBy('completedAt', 'desc')
    .limit(5)
    .get();
  
  scoresHistorySnap.docs.forEach((doc, i) => {
    const data = doc.data();
    console.log(`\n   Eintrag ${i + 1} (${doc.id}):`);
    console.log(`      Datum: ${data.completedAt?.toDate?.().toLocaleString('de-CH')}`);
    console.log(`      SessionId: ${data.sessionId || data.tournamentId}`);
    console.log(`      Striche: ${JSON.stringify(data.striche)}`);
    console.log(`      Points: ${data.points}`);
    console.log(`      Matsch: ${JSON.stringify(data.matsch)}`);
  });
}

inspect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
