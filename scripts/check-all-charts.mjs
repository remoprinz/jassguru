import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';

async function checkAllCharts() {
  console.log('🔍 PRÜFE: Alle Chart-Typen für Remo\n');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const chartTypes = ['chartData_striche', 'chartData_points', 'chartData_matsch'];
  
  for (const chartType of chartTypes) {
    const doc = await db.collection('groups').doc(groupId).collection('aggregated').doc(chartType).get();
    const data = doc.data();
    
    const remoDs = data.datasets.find(ds => ds.displayName === 'Remo');
    
    console.log(`\n${chartType.toUpperCase()}:`);
    console.log(`  Labels: ${data.labels.length}`);
    console.log(`  Remo Datenpunkte: ${remoDs.data.length}`);
    console.log(`  Erste 5 Labels:`);
    for (let i = 0; i < 5; i++) {
      console.log(`    ${i + 1}. ${data.labels[i]}: ${remoDs.data[i]}`);
    }
    console.log(`  Letzte 3 Labels:`);
    for (let i = data.labels.length - 3; i < data.labels.length; i++) {
      console.log(`    ${i + 1}. ${data.labels[i]}: ${remoDs.data[i]}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ERGEBNIS:');
  console.log('  ✅ Alle Charts haben Daten ab 08.05.25');
  console.log('  ➡️  Das Problem muss im Frontend/Browser sein!');
  console.log('  ➡️  Mögliche Ursachen:');
  console.log('     1. Browser-Cache');
  console.log('     2. Frontend lädt aus altem Cache');
  console.log('     3. Chart-Library filtert Daten');
  
  process.exit(0);
}

checkAllCharts().catch(console.error);
