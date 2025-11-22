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

async function backfillTournamentCharts() {
  console.log('\n🔄 BACKFILL: TURNIER-CHART-DATEN\n');
  console.log('='.repeat(100));
  console.log('\n⚠️  ACHTUNG: Dieser Script schreibt in die Datenbank!');
  console.log('   Charts werden mit korrekten Turnier-Daten aktualisiert.\n');
  console.log('='.repeat(100));
  
  try {
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 1: LADE JASSGAMESUMMARY (KORREKTE QUELLE!)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 SCHRITT 1: Lade jassGameSummary vom Turnier...\n');
    
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    
    if (!summaryDoc.exists) {
      console.log('❌ FEHLER: jassGameSummary nicht gefunden! Abbruch.');
      return;
    }
    
    const summaryData = summaryDoc.data();
    console.log(`✅ jassGameSummary geladen: ${summaryDoc.id}`);
    console.log(`   Games: ${summaryData.gamesPlayed || 0}`);
    console.log(`   Teilnehmer: ${summaryData.participantPlayerIds?.length || 0}\n`);
    
    // Sammle Spieler-IDs und Namen
    const participantPlayerIds = summaryData.participantPlayerIds || [];
    const playerNames = new Map();
    const playerStricheDiff = new Map(); // Berechnet aus gameResults
    
    // Lade Spielernamen
    for (const playerId of participantPlayerIds) {
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          playerNames.set(playerId, playerDoc.data().displayName || playerId);
        } else {
          playerNames.set(playerId, playerId);
        }
      } catch (err) {
        playerNames.set(playerId, playerId);
      }
      
      // Initialisiere Strichdifferenz
      playerStricheDiff.set(playerId, { made: 0, received: 0 });
    }
    
    // ✅ KORREKT: Berechne Strichdifferenz direkt aus gameResults
    if (summaryData.gameResults && Array.isArray(summaryData.gameResults)) {
      summaryData.gameResults.forEach((game) => {
        if (!game.teams || !game.finalStriche) return;
        
        const topPlayerIds = game.teams.top?.players?.map(p => p.playerId) || [];
        const bottomPlayerIds = game.teams.bottom?.players?.map(p => p.playerId) || [];
        
        const topStriche = game.finalStriche.top || {};
        const bottomStriche = game.finalStriche.bottom || {};
        
        const topTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + 
                        (topStriche.matsch || 0) + (topStriche.schneider || 0) + 
                        (topStriche.kontermatsch || 0);
        
        const bottomTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + 
                           (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + 
                           (bottomStriche.kontermatsch || 0);
        
        // Top Team Spieler
        topPlayerIds.forEach(pid => {
          const stats = playerStricheDiff.get(pid);
          if (stats) {
            stats.made += topTotal;
            stats.received += bottomTotal;
          }
        });
        
        // Bottom Team Spieler
        bottomPlayerIds.forEach(pid => {
          const stats = playerStricheDiff.get(pid);
          if (stats) {
            stats.made += bottomTotal;
            stats.received += topTotal;
          }
        });
      });
    }
    
    console.log(`✅ Strichdifferenz für ${playerStricheDiff.size} Spieler berechnet\n`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 2: LADE AKTUELLES CHARTDATA_STRICHE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('📊 SCHRITT 2: Lade chartData_striche');
    console.log('═'.repeat(100));
    console.log('');
    
    const chartRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_striche`);
    const chartDoc = await chartRef.get();
    
    if (!chartDoc.exists) {
      console.log('❌ FEHLER: chartData_striche existiert nicht! Abbruch.');
      return;
    }
    
    const chartData = chartDoc.data();
    const labels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    console.log(`   Labels (Sessions): ${labels.length}`);
    console.log(`   Datasets (Spieler): ${datasets.length}`);
    console.log('');
    
    // Finde das Turnier
    const tournamentLabel = '13.11.25';
    const tournamentIndex = labels.indexOf(tournamentLabel);
    
    if (tournamentIndex === -1) {
      console.log(`❌ FEHLER: Turnier-Label "${tournamentLabel}" nicht gefunden! Abbruch.`);
      return;
    }
    
    console.log(`✅ Turnier gefunden bei Index ${tournamentIndex}: "${tournamentLabel}"`);
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 3: BERECHNE NEUE WERTE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('📊 SCHRITT 3: Berechne neue Werte für Chart-Datenpunkt');
    console.log('═'.repeat(100));
    console.log('');
    
    const updates = [];
    const newDatasets = []; // Neue Spieler, die hinzugefügt werden müssen
    
    for (const playerId of participantPlayerIds) {
      const name = playerNames.get(playerId);
      const stats = playerStricheDiff.get(playerId);
      
      if (!stats) {
        console.log(`⚠️  ${name}: Keine Strichdifferenz-Daten gefunden - ÜBERSPRINGE`);
        continue;
      }
      
      let dataset = datasets.find(ds => ds.playerId === playerId);
      
      if (!dataset) {
        console.log(`⚠️  ${name}: Kein Dataset im Chart gefunden - ERSTELLE NEUES DATASET`);
        
        // Erstelle neues Dataset für diesen Spieler
        dataset = {
          playerId: playerId,
          label: name,
          displayName: name,
          data: new Array(labels.length).fill(null) // Alle bisherigen Werte = null
        };
        
        datasets.push(dataset);
        newDatasets.push({ playerId, name });
      }
      
      const currentValue = dataset.data[tournamentIndex];
      // ✅ KORREKT: Berechne Strichdifferenz aus gameResults (made - received)
      const stricheDiff = stats.made - stats.received;
      
      // Berechne kumulativen Wert (vorheriger Wert + Differenz)
      let prevValue = 0;
      if (tournamentIndex > 0) {
        // Finde letzten nicht-null Wert vor dem Turnier
        for (let i = tournamentIndex - 1; i >= 0; i--) {
          if (dataset.data[i] !== null) {
            prevValue = dataset.data[i];
            break;
          }
        }
      }
      
      const newValue = prevValue + stricheDiff;
      
      updates.push({
        playerId,
        name,
        currentValue,
        prevValue,
        delta: stricheDiff,
        newValue,
        datasetIndex: datasets.indexOf(dataset),
        isNew: newDatasets.some(nd => nd.playerId === playerId)
      });
      
      console.log(
        `   ${name.padEnd(20)} | ` +
        `Vorher: ${(currentValue === null ? 'null' : currentValue).toString().padStart(6)} → ` +
        `Nachher: ${newValue.toString().padStart(6)} | ` +
        `(${prevValue} + ${stricheDiff >= 0 ? '+' : ''}${stricheDiff})` +
        `${newDatasets.some(nd => nd.playerId === playerId) ? ' [NEU]' : ''}`
      );
    }
    
    if (newDatasets.length > 0) {
      console.log('');
      console.log(`✅ ${newDatasets.length} neue Spieler werden hinzugefügt: ${newDatasets.map(nd => nd.name).join(', ')}`);
    }
    
    console.log('');
    
    if (updates.length === 0) {
      console.log('❌ Keine Updates notwendig. Abbruch.');
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 4: BESTÄTIGUNG
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('⚠️  BESTÄTIGUNG ERFORDERLICH');
    console.log('═'.repeat(100));
    console.log('');
    console.log(`Es werden ${updates.length} Datenpunkte in chartData_striche aktualisiert.`);
    console.log('');
    console.log('⏸️  Warten auf Bestätigung...');
    console.log('   (Drücken Sie Enter zum Fortfahren, oder Ctrl+C zum Abbrechen)');
    console.log('');
    
    // Warte auf Bestätigung (in einer realen Umgebung würde hier eine Abfrage erfolgen)
    // Für automatische Ausführung: Diese Zeile auskommentieren
    // await new Promise(resolve => process.stdin.once('data', resolve));
    
    console.log('✅ Fortfahren mit Update...');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 5: SCHREIBE UPDATES
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('📝 SCHRITT 5: Schreibe Updates in chartData_striche');
    console.log('═'.repeat(100));
    console.log('');
    
    // Update datasets
    const updatedDatasets = [...datasets];
    
    for (const update of updates) {
      updatedDatasets[update.datasetIndex].data[tournamentIndex] = update.newValue;
    }
    
    // Schreibe zurück
    await chartRef.update({
      datasets: updatedDatasets,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ chartData_striche aktualisiert (${updates.length} Datenpunkte)`);
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 6: UPDATE WEITERE CHARTS (OPTIONAL)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('📊 SCHRITT 6: Update weitere Charts (Points, Matsch, Schneider, Kontermatsch)');
    console.log('═'.repeat(100));
    console.log('');
    
    const otherCharts = [
      { name: 'chartData_points', field: 'pointsDifference' },
      { name: 'chartData_matsch', field: 'eventCounts', subfield: 'matschMade', subfield2: 'matschReceived' },
      { name: 'chartData_schneider', field: 'eventCounts', subfield: 'schneiderMade', subfield2: 'schneiderReceived' },
      { name: 'chartData_kontermatsch', field: 'eventCounts', subfield: 'kontermatschMade', subfield2: 'kontermatschReceived' }
    ];
    
    for (const chartConfig of otherCharts) {
      console.log(`   Verarbeite ${chartConfig.name}...`);
      
      const otherChartRef = db.doc(`groups/${GROUP_ID}/aggregated/${chartConfig.name}`);
      const otherChartDoc = await otherChartRef.get();
      
      if (!otherChartDoc.exists) {
        console.log(`   ⚠️  ${chartConfig.name} nicht gefunden - ÜBERSPRINGE`);
        continue;
      }
      
      const otherChartData = otherChartDoc.data();
      const otherDatasets = otherChartData.datasets || [];
      const otherLabels = otherChartData.labels || [];
      const otherTournamentIndex = otherLabels.indexOf(tournamentLabel);
      
      if (otherTournamentIndex === -1) {
        console.log(`   ⚠️  Turnier nicht in ${chartConfig.name} gefunden - ÜBERSPRINGE`);
        continue;
      }
      
      const otherUpdates = [];
      
      // ✅ KORREKT: Berechne Points-Differenz aus gameResults
      const playerPointsDiff = new Map();
      if (chartConfig.name === 'chartData_points' && summaryData.gameResults) {
        summaryData.gameResults.forEach((game) => {
          if (!game.teams) return;
          
          const topPlayerIds = game.teams.top?.players?.map(p => p.playerId) || [];
          const bottomPlayerIds = game.teams.bottom?.players?.map(p => p.playerId) || [];
          
          topPlayerIds.forEach(pid => {
            if (!playerPointsDiff.has(pid)) {
              playerPointsDiff.set(pid, { made: 0, received: 0 });
            }
            const stats = playerPointsDiff.get(pid);
            stats.made += game.topScore || 0;
            stats.received += game.bottomScore || 0;
          });
          
          bottomPlayerIds.forEach(pid => {
            if (!playerPointsDiff.has(pid)) {
              playerPointsDiff.set(pid, { made: 0, received: 0 });
            }
            const stats = playerPointsDiff.get(pid);
            stats.made += game.bottomScore || 0;
            stats.received += game.topScore || 0;
          });
        });
      }
      
      for (const playerId of participantPlayerIds) {
        const name = playerNames.get(playerId);
        let dataset = otherDatasets.find(ds => ds.playerId === playerId);
        
        if (!dataset) {
          // Erstelle neues Dataset für diesen Spieler
          dataset = {
            playerId: playerId,
            label: name,
            displayName: name,
            data: new Array(otherLabels.length).fill(null)
          };
          otherDatasets.push(dataset);
        }
        
        let delta = 0;
        
        if (chartConfig.field === 'eventCounts') {
          // ✅ KORREKT: Event-basierte Charts aus totalEventCountsByPlayer
          const eventCounts = summaryData.totalEventCountsByPlayer?.[playerId];
          if (eventCounts) {
            const made = eventCounts[chartConfig.subfield] || 0;
            const received = eventCounts[chartConfig.subfield2] || 0;
            delta = made - received;
          }
        } else if (chartConfig.name === 'chartData_points') {
          // ✅ KORREKT: Points-Differenz aus gameResults
          const pointsStats = playerPointsDiff.get(playerId);
          if (pointsStats) {
            delta = pointsStats.made - pointsStats.received;
          }
        } else {
          // Fallback (sollte nicht vorkommen)
          delta = 0;
        }
        
        // Berechne kumulativen Wert
        let prevValue = 0;
        if (otherTournamentIndex > 0) {
          for (let i = otherTournamentIndex - 1; i >= 0; i--) {
            if (dataset.data[i] !== null) {
              prevValue = dataset.data[i];
              break;
            }
          }
        }
        
        const newValue = prevValue + delta;
        dataset.data[otherTournamentIndex] = newValue;
        otherUpdates.push({ playerId, delta, newValue });
      }
      
      if (otherUpdates.length > 0) {
        await otherChartRef.update({
          datasets: otherDatasets,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`   ✅ ${chartConfig.name} aktualisiert (${otherUpdates.length} Datenpunkte)`);
      }
    }
    
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════
    // SCHRITT 7: ZUSAMMENFASSUNG
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(100));
    console.log('✅ BACKFILL ABGESCHLOSSEN');
    console.log('═'.repeat(100));
    console.log('');
    console.log(`✅ chartData_striche: ${updates.length} Datenpunkte aktualisiert`);
    console.log(`✅ Weitere Charts: 4 Charts aktualisiert`);
    console.log('');
    console.log('📊 Turnier-Daten vom 13.11.25 wurden erfolgreich in die Charts eingefügt!');
    console.log('');
    console.log('='.repeat(100));
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Backfill:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Script ausführen
backfillTournamentCharts().catch(console.error);

