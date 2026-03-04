/**
 * Prüfe Studis Chart-Werte im Detail
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const STUDI_ID = 'PLaDRlPBo91yu5Ij8MOT2';

async function main() {
  console.log('\n🔍 Prüfe Studis Chart-Werte\n');
  
  // 1. Lade aktuelle chartData_striche
  const stricheDoc = await db.doc(`groups/${GROUP_ID}/aggregated/chartData_striche`).get();
  
  if (!stricheDoc.exists) {
    console.log('❌ chartData_striche nicht gefunden');
    return;
  }
  
  const stricheData = stricheDoc.data();
  const datasets = stricheData.datasets || [];
  const labels = stricheData.labels || [];
  
  // Finde Studis Dataset
  const studiDataset = datasets.find(ds => ds.playerId === STUDI_ID || ds.label === 'Studi');
  
  if (!studiDataset) {
    console.log('❌ Studi nicht in Chart-Daten gefunden');
    console.log('\nVerfügbare Spieler:');
    datasets.forEach(ds => console.log(`  - ${ds.label} (${ds.playerId})`));
    return;
  }
  
  console.log('✅ Studi gefunden in Chart-Daten');
  console.log(`   Label: ${studiDataset.label}`);
  console.log(`   Player ID: ${studiDataset.playerId}`);
  console.log(`   Datenpunkte: ${studiDataset.data.length}`);
  console.log(`   Labels: ${labels.length}`);
  
  // Zeige alle nicht-null Werte
  console.log('\n📊 Nicht-NULL Werte:');
  studiDataset.data.forEach((value, index) => {
    if (value !== null) {
      console.log(`   [${index}] ${labels[index]}: ${value}`);
    }
  });
  
  // Zeige letzte 5 Werte
  console.log('\n📊 Letzte 5 Werte:');
  for (let i = labels.length - 5; i < labels.length; i++) {
    console.log(`   [${i}] ${labels[i]}: ${studiDataset.data[i]}`);
  }
  
  // Prüfe Tournament-Session
  console.log('\n🎯 Tournament-Session (Index 1):');
  console.log(`   Datum: ${labels[1]}`);
  console.log(`   Studi Wert: ${studiDataset.data[1]}`);
  
  console.log('\n🎉 Analyse abgeschlossen!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });

