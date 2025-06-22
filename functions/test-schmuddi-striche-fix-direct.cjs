const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

// Importiere die Calculator-Funktion
const { updatePlayerStats } = require('./lib/playerStatsCalculator');

async function testSchmuddiStricheFixDirect() {
  console.log('🧪 [DIRECT TEST] Teste Schmuuuudii Striche-Korrektur direkt...');
  
  const schmuddiPlayerId = 'TPBwj8bP9W59n5LoGWP5'; // Schmuuuudii's Player ID
  const db = admin.firestore();
  
  try {
    // 1. Zeige aktuelle Striche-Differenz BEVOR Update
    console.log('\n📊 [BEFORE] Aktuelle Striche-Differenz:');
    const beforeStatsDoc = await db.collection('playerComputedStats').doc(schmuddiPlayerId).get();
    if (beforeStatsDoc.exists) {
      const beforeData = beforeStatsDoc.data();
      console.log(`  Striche-Differenz: ${beforeData.totalStricheDifference}`);
      console.log(`  Partner Schmuuuudii+Remo Striche-Diff: ${beforeData.partnerAggregates?.find(p => p.partnerId === 'b16c1120111b7d9e7d733837')?.totalStricheDifferenceWith || 'N/A'}`);
    } else {
      console.log('  Keine aktuellen Statistiken gefunden.');
    }
    
    // 2. Direkte Neuberechnung
    console.log('\n🔄 [UPDATE] Führe direkte Neuberechnung aus...');
    await updatePlayerStats(schmuddiPlayerId);
    console.log('  Neuberechnung abgeschlossen.');
    
    // 3. Zeige neue Werte
    console.log('\n📊 [AFTER] Neue Striche-Differenz:');
    const afterStatsDoc = await db.collection('playerComputedStats').doc(schmuddiPlayerId).get();
    if (afterStatsDoc.exists) {
      const afterData = afterStatsDoc.data();
      console.log(`  Striche-Differenz: ${afterData.totalStricheDifference}`);
      console.log(`  Partner Schmuuuudii+Remo Striche-Diff: ${afterData.partnerAggregates?.find(p => p.partnerId === 'b16c1120111b7d9e7d733837')?.totalStricheDifferenceWith || 'N/A'}`);
      
      // Erwartete Werte berechnen
      console.log('\n🎯 [ANALYSE] Erwartete vs. Tatsächliche Werte:');
      console.log('  Schmuuuudii hat das Turnier gewonnen + eine Session mit +10 Strichen');
      console.log('  Turnier-Gewinn sollte deutlich positive Striche bringen');
      console.log('  Neue Striche-Differenz sollte deutlich höher als +4 sein');
      
      const improvement = afterData.totalStricheDifference - 4; // 4 war der alte Wert
      console.log(`  Verbesserung: +${improvement} Striche`);
      
      if (afterData.totalStricheDifference > 10) {
        console.log('  ✅ ERFOLG: Striche-Differenz ist jetzt realistisch hoch!');
      } else {
        console.log('  ❌ PROBLEM: Striche-Differenz ist immer noch zu niedrig.');
      }
    } else {
      console.log('  ❌ Keine neuen Statistiken gefunden.');
    }
    
  } catch (error) {
    console.error('❌ [ERROR] Fehler beim Test:', error);
  }
}

testSchmuddiStricheFixDirect().then(() => {
  console.log('\n✅ Test abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test fehlgeschlagen:', error);
  process.exit(1);
}); 