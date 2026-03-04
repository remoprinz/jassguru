/**
 * Zeigt die komplette Struktur eines scoresHistory-Eintrags
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const REMO_ID = 'b16c1120111b7d9e7d733837';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function inspect() {
  console.log('🔍 VOLLSTÄNDIGE scoresHistory STRUKTUR\n');
  
  // Hole den Turnier-Eintrag
  const scoresHistorySnap = await db.collection(`players/${REMO_ID}/scoresHistory`)
    .orderBy('completedAt', 'desc')
    .limit(5)
    .get();
  
  scoresHistorySnap.docs.forEach((doc, i) => {
    const data = doc.data();
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📄 Eintrag ${i + 1}: ${doc.id}`);
    console.log('='.repeat(70));
    console.log(JSON.stringify(data, null, 2));
  });
  
  // Hole auch das neueste jassGameSummary
  console.log(`\n${'='.repeat(70)}`);
  console.log('📄 jassGameSummary für Turnier:');
  console.log('='.repeat(70));
  
  const summaryDoc = await db.collection(`groups/Tz0wgIHMTlhvTtFastiJ/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  if (summaryDoc.exists) {
    const data = summaryDoc.data();
    // Zeige nur relevante Felder (nicht zu groß)
    const relevantFields = {
      sessionType: data.sessionType,
      completedAt: data.completedAt?.toDate?.(),
      gamesPlayed: data.gamesPlayed,
      totalStriche: data.totalStriche,
      totalPoints: data.totalPoints,
      finalStriche: data.finalStriche,
      finalScores: data.finalScores,
      // Zeige erste 2 playerStats
    };
    console.log(JSON.stringify(relevantFields, null, 2));
    
    // Zeige Struktur von playerStats für Remo
    if (data.playerStats && data.playerStats[REMO_ID]) {
      console.log('\nplayerStats für Remo:');
      console.log(JSON.stringify(data.playerStats[REMO_ID], null, 2));
    }
    
    // Zeige aggregatedPlayerStats wenn vorhanden
    if (data.aggregatedPlayerStats) {
      console.log('\naggregatedPlayerStats (erste 2):');
      const entries = Object.entries(data.aggregatedPlayerStats).slice(0, 2);
      entries.forEach(([pid, stats]) => {
        console.log(`\n${pid.substring(0, 12)}...:`);
        console.log(JSON.stringify(stats, null, 2));
      });
    }
  }
  
  // Schaue auf chartData in der Gruppe
  console.log(`\n${'='.repeat(70)}`);
  console.log('📄 chartData Dokumente in der Gruppe:');
  console.log('='.repeat(70));
  
  const chartDataSnap = await db.collection(`groups/Tz0wgIHMTlhvTtFastiJ/chartData`).get();
  if (chartDataSnap.empty) {
    console.log('KEINE chartData Dokumente gefunden!');
  } else {
    chartDataSnap.docs.forEach(doc => {
      console.log(`\n📊 ${doc.id}:`);
      const data = doc.data();
      console.log(`   Labels: ${data.labels?.length} Einträge`);
      console.log(`   Letzte 3 Labels: ${JSON.stringify(data.labels?.slice(-3))}`);
      console.log(`   Datasets: ${data.datasets?.length} Spieler`);
    });
  }
  
  // Schaue auf aggregated chartData
  console.log(`\n${'='.repeat(70)}`);
  console.log('📄 Aggregated Chart Collections:');
  console.log('='.repeat(70));
  
  // chartData_striche
  const stricheSnap = await db.doc(`groups/Tz0wgIHMTlhvTtFastiJ/aggregatedChartData/striche`).get();
  if (stricheSnap.exists) {
    console.log('\nstriche: EXISTS');
    const data = stricheSnap.data();
    console.log(`   Labels: ${data.labels?.length}`);
  } else {
    console.log('\nstriche: NOT FOUND');
  }
  
  // chartData_matsch
  const matschSnap = await db.doc(`groups/Tz0wgIHMTlhvTtFastiJ/aggregatedChartData/matsch`).get();
  if (matschSnap.exists) {
    console.log('matsch: EXISTS');
  } else {
    console.log('matsch: NOT FOUND');
  }
  
  // chartData_elo - das funktioniert ja
  const eloSnap = await db.doc(`groups/Tz0wgIHMTlhvTtFastiJ/aggregatedChartData/elo`).get();
  if (eloSnap.exists) {
    console.log('elo: EXISTS');
    const data = eloSnap.data();
    console.log(`   Labels: ${data.labels?.length}`);
  } else {
    console.log('elo: NOT FOUND');
  }
}

inspect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
