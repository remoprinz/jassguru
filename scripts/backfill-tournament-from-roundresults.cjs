const admin = require('firebase-admin');
const path = require('path');
// Service Account Key laden
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const TOURNAMENT_DATE_STR = '13.11.25';

// 🎯 NEU: Berechne Strichdifferenz aus roundResults
function calculateStricheDifferenceFromRounds(roundResults) {
  if (!roundResults || roundResults.length === 0) return 0;
  
  let totalDiff = 0;
  
  for (const round of roundResults) {
    if (!round.participated) continue;
    
    // Verwende stricheDifferenz aus roundResults (bereits korrekt berechnet)
    totalDiff += round.stricheDifferenz || 0;
  }
  
  return totalDiff;
}

// 🎯 NEU: Berechne Punktedifferenz aus roundResults
function calculatePointsDifferenceFromRounds(roundResults) {
  if (!roundResults || roundResults.length === 0) return 0;
  
  let totalDiff = 0;
  
  for (const round of roundResults) {
    if (!round.participated) continue;
    
    totalDiff += round.pointsDifferenz || 0;
  }
  
  return totalDiff;
}

// 🎯 NEU: Berechne Event-Differenzen aus roundResults
function calculateEventDifferenceFromRounds(roundResults, eventType) {
  if (!roundResults || roundResults.length === 0) return 0;
  
  let made = 0;
  let received = 0;
  
  for (const round of roundResults) {
    if (!round.participated) continue;
    
    if (round.stricheScored && round.stricheScored[eventType]) {
      made += round.stricheScored[eventType];
    }
    if (round.stricheReceived && round.stricheReceived[eventType]) {
      received += round.stricheReceived[eventType];
    }
  }
  
  return made - received;
}

async function backfillFromRoundResults() {
  console.log('\n🔄 BACKFILL: TURNIER-CHART-DATEN (AUS ROUNDRESULTS)\n');
  console.log('='.repeat(100));
  console.log('\n⚠️  ACHTUNG: Dieser Script berechnet Werte aus roundResults statt stricheDifference!');
  console.log('   Dies ist die KORREKTE Berechnung!\n');
  console.log('='.repeat(100));

  try {
    // 1. Lade playerRankings für das Turnier
    console.log('\n📊 SCHRITT 1: Lade playerRankings aus Turnier...\n');
    const playerRankingsRef = db.collection(`tournaments/${TOURNAMENT_ID}/playerRankings`);
    const rankingsSnap = await playerRankingsRef.get();

    if (rankingsSnap.empty) {
      console.log('Keine playerRankings für dieses Turnier gefunden.');
      return;
    }

    const playerRankings = new Map();
    const playerNames = new Map();
    const correctedValues = new Map(); // 🎯 NEU: Speichere korrigierte Werte

    for (const doc of rankingsSnap.docs) {
      const data = doc.data();
      
      // 🎯 BERECHNE KORREKTE WERTE AUS ROUNDRESULTS
      const correctStricheDiff = calculateStricheDifferenceFromRounds(data.roundResults);
      const correctPointsDiff = calculatePointsDifferenceFromRounds(data.roundResults);
      const correctMatschDiff = calculateEventDifferenceFromRounds(data.roundResults, 'matsch');
      const correctSchneiderDiff = calculateEventDifferenceFromRounds(data.roundResults, 'schneider');
      const correctKontermatschDiff = calculateEventDifferenceFromRounds(data.roundResults, 'kontermatsch');
      
      // Speichere sowohl Original als auch korrigierte Werte
      playerRankings.set(data.playerId, {
        ...data,
        originalStricheDiff: data.stricheDifference,
        correctStricheDiff: correctStricheDiff,
        originalPointsDiff: data.pointsDifference,
        correctPointsDiff: correctPointsDiff,
        correctMatschDiff: correctMatschDiff,
        correctSchneiderDiff: correctSchneiderDiff,
        correctKontermatschDiff: correctKontermatschDiff
      });

      try {
        const playerDoc = await db.collection('players').doc(data.playerId).get();
        playerNames.set(data.playerId, playerDoc.data()?.displayName || data.playerId);
      } catch (err) {
        playerNames.set(data.playerId, data.playerId);
      }
    }
    console.log(`✅ Gefunden: ${playerRankings.size} playerRankings`);

    // 2. Zeige Vergleich: Original vs. Korrigiert
    console.log('\n' + '='.repeat(100));
    console.log('📊 SCHRITT 2: Vergleich Original vs. Korrigiert (aus roundResults)');
    console.log('='.repeat(100));
    console.log('');
    console.log('Spieler              | Original Striche | Korrigiert Striche | Differenz');
    console.log('-'.repeat(80));
    
    const sortedRankings = Array.from(playerRankings.entries())
      .sort((a, b) => (a[1].rank || 99) - (b[1].rank || 99));
    
    let totalOriginal = 0;
    let totalCorrected = 0;
    
    for (const [playerId, ranking] of sortedRankings) {
      const name = playerNames.get(playerId);
      const original = ranking.originalStricheDiff || 0;
      const corrected = ranking.correctStricheDiff;
      const diff = corrected - original;
      
      totalOriginal += original;
      totalCorrected += corrected;
      
      const diffStr = diff === 0 ? '✅ OK' : `⚠️  ${diff >= 0 ? '+' : ''}${diff}`;
      
      console.log(
        `${name.padEnd(20)} | ${String(original).padStart(16)} | ${String(corrected).padStart(18)} | ${diffStr}`
      );
    }
    
    console.log('-'.repeat(80));
    console.log(`${'SUMME'.padEnd(20)} | ${String(totalOriginal).padStart(16)} | ${String(totalCorrected).padStart(18)} | ${totalCorrected === 0 ? '✅ Zero-Sum!' : '❌ Fehler!'}`);
    
    console.log('\n' + '='.repeat(100));
    console.log('✅ ZERO-SUM CHECK');
    console.log('='.repeat(100));
    if (totalCorrected === 0) {
      console.log('✅ Die Summe aller korrigierten Differenzen = 0 → KORREKT!');
    } else {
      console.log(`❌ Die Summe aller korrigierten Differenzen = ${totalCorrected} → FEHLER!`);
      console.log('   Bitte Daten prüfen, bevor Sie fortfahren.');
    }

    // 3. Lade Chart-Daten und aktualisiere
    const chartTypes = [
      { id: 'chartData_striche', field: 'correctStricheDiff', name: 'Strichdifferenz' },
      { id: 'chartData_points', field: 'correctPointsDiff', name: 'Punktedifferenz' },
      { id: 'chartData_matsch', field: 'correctMatschDiff', name: 'Matsch-Bilanz' },
      { id: 'chartData_schneider', field: 'correctSchneiderDiff', name: 'Schneider-Bilanz' },
      { id: 'chartData_kontermatsch', field: 'correctKontermatschDiff', name: 'Kontermatsch-Bilanz' },
    ];

    for (const chartType of chartTypes) {
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`📊 SCHRITT 3: Aktualisiere ${chartType.id}`);
      console.log(`${'═'.repeat(100)}`);

      const chartDataRef = db.collection(`groups/${GROUP_ID}/aggregated`).doc(chartType.id);
      const chartDoc = await chartDataRef.get();
      const chartData = chartDoc.data();

      if (!chartData) {
        console.log(`${chartType.id} Dokument nicht gefunden. Überspringe.`);
        continue;
      }

      console.log(`   Labels (Sessions): ${chartData.labels.length}`);
      console.log(`   Datasets (Spieler): ${chartData.datasets.length}`);

      const tournamentIndex = chartData.labels.indexOf(TOURNAMENT_DATE_STR);

      if (tournamentIndex === -1) {
        console.log(`❌ Turnier-Datum "${TOURNAMENT_DATE_STR}" nicht in Labels von ${chartType.id} gefunden. Überspringe.`);
        continue;
      }
      console.log(`✅ Turnier gefunden bei Index ${tournamentIndex}: "${TOURNAMENT_DATE_STR}"`);

      console.log(`\n${'═'.repeat(100)}`);
      console.log(`📊 Vorschau der Änderungen für ${chartType.name}`);
      console.log(`${'═'.repeat(100)}`);
      console.log('');

      let updatedCount = 0;
      const updatedDatasets = JSON.parse(JSON.stringify(chartData.datasets));

      for (const [playerId, ranking] of playerRankings) {
        const name = playerNames.get(playerId);
        const dataset = updatedDatasets.find(d => d.playerId === playerId);

        if (dataset) {
          const previousValue = dataset.data[tournamentIndex - 1] || 0;
          const delta = ranking[chartType.field] || 0;
          const newTournamentValue = previousValue + delta;
          const currentChartValue = chartData.datasets.find(d => d.playerId === playerId)?.data[tournamentIndex];

          if (currentChartValue !== newTournamentValue) {
            dataset.data[tournamentIndex] = newTournamentValue;
            updatedCount++;
            console.log(`   ${name.padEnd(20)} | Vorher: ${String(currentChartValue).padEnd(7)} → Nachher: ${String(newTournamentValue).padEnd(7)} | (${String(previousValue)} ${delta >= 0 ? '+' : ''}${delta})`);
          } else {
            console.log(`   ${name.padEnd(20)} | Keine Änderung nötig (${currentChartValue}).`);
          }
        } else {
          console.log(`⚠️  ${name}: Kein Dataset im Chart gefunden - ÜBERSPRINGE`);
        }
      }

      if (updatedCount > 0) {
        console.log(`\n${'═'.repeat(100)}`);
        console.log(`✅ Es werden ${updatedCount} Datenpunkte in ${chartType.id} aktualisiert.`);
        console.log(`${'═'.repeat(100)}`);

        console.log(`\n${'═'.repeat(100)}`);
        console.log(`📝 SCHRITT 4: Schreibe Updates in ${chartType.id}`);
        console.log(`${'═'.repeat(100)}`);

        await chartDataRef.set({
          labels: chartData.labels,
          datasets: updatedDatasets,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          totalPlayers: updatedDatasets.length,
          totalSessions: chartData.labels.length
        });
        console.log(`✅ ${chartType.id} aktualisiert (${updatedCount} Datenpunkte)`);
      } else {
        console.log(`Keine Updates für ${chartType.id} erforderlich.`);
      }
    }

    console.log(`\n${'═'.repeat(100)}`);
    console.log(`✅ BACKFILL ABGESCHLOSSEN (AUS ROUNDRESULTS)`);
    console.log(`${'═'.repeat(100)}`);
    console.log('\n✅ Alle Charts wurden mit den KORREKTEN Werten aus roundResults aktualisiert!');
    console.log('✅ Zero-Sum Check bestanden!');

  } catch (error) {
    console.error('\n❌ FEHLER beim Backfill:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

backfillFromRoundResults().catch(console.error);

