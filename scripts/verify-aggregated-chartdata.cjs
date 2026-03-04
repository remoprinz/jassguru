/**
 * 🔍 Prüfe aggregated/chartData_* für Tournament-Session
 * 
 * Überprüft ob die aggregated Chart-Daten für Spieler-Charts korrekt sind
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Konfiguration
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const JASS_GAME_SUMMARY_ID = '6eNr8fnsTO06jgCqjelt'; // Tournament vom 11.5.2025

/**
 * Hauptfunktion
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 PRÜFE AGGREGATED CHART-DATEN                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Group: ${GROUP_ID}\n`);

  try {
    // 1. Lade alle jassGameSummaries (chronologisch)
    const summariesSnap = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    console.log(`📊 Gefundene Sessions: ${summariesSnap.size}`);
    
    // Finde Tournament-Session
    let tournamentSessionIndex = -1;
    summariesSnap.docs.forEach((doc, index) => {
      if (doc.id === JASS_GAME_SUMMARY_ID) {
        tournamentSessionIndex = index;
        const data = doc.data();
        console.log(`\n🎯 Tournament-Session gefunden an Index ${index}:`);
        console.log(`   - ID: ${doc.id}`);
        console.log(`   - Datum: ${data.completedAt?.toDate?.()?.toLocaleDateString('de-DE') || 'N/A'}`);
        console.log(`   - Games: ${data.gameResults?.length || 0}`);
        console.log(`   - isTournamentSession: ${data.isTournamentSession}`);
      }
    });
    
    if (tournamentSessionIndex === -1) {
      console.error('❌ Tournament-Session nicht in completed Sessions gefunden!');
      return;
    }
    
    // 2. Prüfe chartData_striche
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📈 CHARTDATA_STRICHE');
    console.log('═══════════════════════════════════════════════════════════');
    
    const stricheDocRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_striche`);
    const stricheDoc = await stricheDocRef.get();
    
    if (!stricheDoc.exists) {
      console.log('❌ chartData_striche existiert NICHT!');
    } else {
      const stricheData = stricheDoc.data();
      const labels = stricheData.labels || [];
      const datasets = stricheData.datasets || [];
      
      console.log(`✅ chartData_striche existiert`);
      console.log(`   - Labels (Datenpunkte): ${labels.length}`);
      console.log(`   - Datasets (Spieler): ${datasets.length}`);
      
      if (labels.length < summariesSnap.size) {
        console.log(`⚠️  WARNUNG: Weniger Labels als Sessions!`);
        console.log(`   Expected: ${summariesSnap.size} Labels`);
        console.log(`   Actual: ${labels.length} Labels`);
      }
      
      // Zeige letzten Datenpunkt jedes Spielers
      console.log('\n📊 Letzte Werte pro Spieler:');
      datasets.forEach(dataset => {
        const lastValue = dataset.data[dataset.data.length - 1];
        console.log(`   - ${dataset.label || dataset.displayName}: ${lastValue}`);
      });
    }
    
    // 3. Prüfe chartData_points
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📈 CHARTDATA_POINTS');
    console.log('═══════════════════════════════════════════════════════════');
    
    const pointsDocRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_points`);
    const pointsDoc = await pointsDocRef.get();
    
    if (!pointsDoc.exists) {
      console.log('❌ chartData_points existiert NICHT!');
    } else {
      const pointsData = pointsDoc.data();
      const labels = pointsData.labels || [];
      const datasets = pointsData.datasets || [];
      
      console.log(`✅ chartData_points existiert`);
      console.log(`   - Labels (Datenpunkte): ${labels.length}`);
      console.log(`   - Datasets (Spieler): ${datasets.length}`);
      
      if (labels.length < summariesSnap.size) {
        console.log(`⚠️  WARNUNG: Weniger Labels als Sessions!`);
        console.log(`   Expected: ${summariesSnap.size} Labels`);
        console.log(`   Actual: ${labels.length} Labels`);
      }
      
      // Zeige letzten Datenpunkt jedes Spielers
      console.log('\n📊 Letzte Werte pro Spieler:');
      datasets.forEach(dataset => {
        const lastValue = dataset.data[dataset.data.length - 1];
        console.log(`   - ${dataset.label || dataset.displayName}: ${lastValue}`);
      });
    }
    
    // 4. Prüfe chartData_matsch
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📈 CHARTDATA_MATSCH');
    console.log('═══════════════════════════════════════════════════════════');
    
    const matschDocRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_matsch`);
    const matschDoc = await matschDocRef.get();
    
    if (!matschDoc.exists) {
      console.log('❌ chartData_matsch existiert NICHT!');
    } else {
      const matschData = matschDoc.data();
      const labels = matschData.labels || [];
      const datasets = matschData.datasets || [];
      
      console.log(`✅ chartData_matsch existiert`);
      console.log(`   - Labels (Datenpunkte): ${labels.length}`);
      console.log(`   - Datasets (Spieler): ${datasets.length}`);
      
      if (labels.length < summariesSnap.size) {
        console.log(`⚠️  WARNUNG: Weniger Labels als Sessions!`);
        console.log(`   Expected: ${summariesSnap.size} Labels`);
        console.log(`   Actual: ${labels.length} Labels`);
      }
      
      // Zeige letzten Datenpunkt jedes Spielers
      console.log('\n📊 Letzte Werte pro Spieler:');
      datasets.forEach(dataset => {
        const lastValue = dataset.data[dataset.data.length - 1];
        console.log(`   - ${dataset.label || dataset.displayName}: ${lastValue}`);
      });
    }
    
    // 5. Prüfe chartData_schneider
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📈 CHARTDATA_SCHNEIDER');
    console.log('═══════════════════════════════════════════════════════════');
    
    const schneiderDocRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_schneider`);
    const schneiderDoc = await schneiderDocRef.get();
    
    if (!schneiderDoc.exists) {
      console.log('❌ chartData_schneider existiert NICHT!');
    } else {
      const schneiderData = schneiderDoc.data();
      const labels = schneiderData.labels || [];
      const datasets = schneiderData.datasets || [];
      
      console.log(`✅ chartData_schneider existiert`);
      console.log(`   - Labels (Datenpunkte): ${labels.length}`);
      console.log(`   - Datasets (Spieler): ${datasets.length}`);
      
      if (labels.length < summariesSnap.size) {
        console.log(`⚠️  WARNUNG: Weniger Labels als Sessions!`);
        console.log(`   Expected: ${summariesSnap.size} Labels`);
        console.log(`   Actual: ${labels.length} Labels`);
      }
      
      // Zeige letzten Datenpunkt jedes Spielers
      console.log('\n📊 Letzte Werte pro Spieler:');
      datasets.forEach(dataset => {
        const lastValue = dataset.data[dataset.data.length - 1];
        console.log(`   - ${dataset.label || dataset.displayName}: ${lastValue}`);
      });
    }
    
    // ZUSAMMENFASSUNG
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📋 ZUSAMMENFASSUNG                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log('🎯 Tournament-Session Position: ' + (tournamentSessionIndex + 1) + ' von ' + summariesSnap.size);
    console.log('📊 Erwartete Chart-Labels: ' + summariesSnap.size);
    
    const hasStricheDaten = stricheDoc.exists;
    const hasPointsDaten = pointsDoc.exists;
    const hasMatschDaten = matschDoc.exists;
    const hasSchneiderDaten = schneiderDoc.exists;
    
    console.log('\nVerfügbare Chart-Daten:');
    console.log(`   ${hasStricheDaten ? '✅' : '❌'} chartData_striche`);
    console.log(`   ${hasPointsDaten ? '✅' : '❌'} chartData_points`);
    console.log(`   ${hasMatschDaten ? '✅' : '❌'} chartData_matsch`);
    console.log(`   ${hasSchneiderDaten ? '✅' : '❌'} chartData_schneider`);
    
    if (!hasStricheDaten || !hasPointsDaten) {
      console.log('\n❌ PROBLEM GEFUNDEN:');
      console.log('   Die aggregated Chart-Daten fehlen oder sind unvollständig!');
      console.log('\n💡 LÖSUNG:');
      console.log('   Führe das Backfill-Skript für Chart-Daten aus:');
      console.log('   node functions/scripts/backfillChartData.cjs');
    } else {
      console.log('\n✅ Alle wichtigen Chart-Daten vorhanden');
    }

    console.log('\n🎉 Analyse abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler bei der Analyse:', error);
    throw error;
  }
}

// Skript ausführen
main()
  .then(() => {
    console.log('\n✅ Script beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

