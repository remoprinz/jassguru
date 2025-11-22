import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';

async function checkChartData() {
  console.log('🔍 PRÜFE: Was ist in den aggregierten Chart-Daten?\n');
  
  const stricheDoc = await db.collection('groups').doc(groupId).collection('aggregated').doc('chartData_striche').get();
  const stricheData = stricheDoc.data();
  
  const remoDs = stricheData.datasets.find(ds => ds.displayName === 'Remo');
  
  console.log('REMO DATASET:');
  console.log(`  Labels insgesamt: ${stricheData.labels.length}`);
  console.log(`  Remo Datenpunkte: ${remoDs.data.length}`);
  console.log(`  Nicht-null Werte: ${remoDs.data.filter(d => d !== null).length}`);
  
  console.log('\nERSTE 15 LABELS UND REMO-WERTE:');
  for (let i = 0; i < Math.min(15, stricheData.labels.length); i++) {
    const label = stricheData.labels[i];
    const value = remoDs.data[i];
    console.log(`  ${i + 1}. ${label}: ${value === null ? 'NULL' : value}`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('PROBLEM IDENTIFIKATION:');
  
  const firstNonNull = remoDs.data.findIndex(d => d !== null);
  if (firstNonNull > 0) {
    console.log(`  ❌ Die ersten ${firstNonNull} Werte sind NULL!`);
    console.log(`  ❌ Erster nicht-NULL Wert bei Index ${firstNonNull}: ${stricheData.labels[firstNonNull]}`);
    console.log(`  ➡️  Das Frontend überspringt NULL-Werte!`);
  }
  
  process.exit(0);
}

checkChartData().catch(console.error);
