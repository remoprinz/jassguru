const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

async function verifyChartValues() {
  console.log('\n🔍 VERIFIZIERE CHART-WERTE NACH BACKFILL\n');
  console.log('='.repeat(120));
  
  try {
    // Lade Chart
    const chartRef = db.doc(`groups/${GROUP_ID}/aggregated/chartData_striche`);
    const chartDoc = await chartRef.get();
    
    if (!chartDoc.exists) {
      console.log('❌ chartData_striche nicht gefunden!');
      return;
    }
    
    const chartData = chartDoc.data();
    const labels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    const tournamentLabel = '13.11.25';
    const tournamentIndex = labels.indexOf(tournamentLabel);
    
    // Lade jassGameSummary
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    const summaryData = summaryDoc.data();
    const participantPlayerIds = summaryData.participantPlayerIds || [];
    
    // Berechne korrekte Strichdifferenz
    const playerStricheDiff = new Map();
    participantPlayerIds.forEach(pid => {
      playerStricheDiff.set(pid, { made: 0, received: 0 });
    });
    
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
        
        topPlayerIds.forEach(pid => {
          const stats = playerStricheDiff.get(pid);
          if (stats) {
            stats.made += topTotal;
            stats.received += bottomTotal;
          }
        });
        
        bottomPlayerIds.forEach(pid => {
          const stats = playerStricheDiff.get(pid);
          if (stats) {
            stats.made += bottomTotal;
            stats.received += topTotal;
          }
        });
      });
    }
    
    // Lade Spielernamen
    const playerNames = new Map();
    for (const playerId of participantPlayerIds) {
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        playerNames.set(playerId, playerDoc.exists ? (playerDoc.data().displayName || playerId) : playerId);
      } catch {
        playerNames.set(playerId, playerId);
      }
    }
    
    console.log('\n📊 AKTUELLE CHART-WERTE:\n');
    console.log('Spieler                  | Chart-Wert (kumulativ) | Delta (Turnier) | Status');
    console.log('-'.repeat(120));
    
    for (const playerId of participantPlayerIds) {
      const name = playerNames.get(playerId);
      const dataset = datasets.find(ds => ds.playerId === playerId);
      
      if (!dataset) {
        console.log(`⚠️  ${name.padEnd(24)} | NICHT GEFUNDEN`);
        continue;
      }
      
      const chartValue = dataset.data[tournamentIndex];
      const stats = playerStricheDiff.get(playerId);
      const correctDelta = stats ? (stats.made - stats.received) : 0;
      
      // Finde vorherigen Wert
      let prevValue = null;
      if (tournamentIndex > 0) {
        for (let i = tournamentIndex - 1; i >= 0; i--) {
          if (dataset.data[i] !== null) {
            prevValue = dataset.data[i];
            break;
          }
        }
      }
      
      const shouldBe = prevValue !== null ? prevValue + correctDelta : correctDelta;
      const isCorrect = chartValue !== null && chartValue !== undefined 
        ? Math.abs(chartValue - shouldBe) < 0.1
        : false;
      
      const status = isCorrect ? '✅' : '❌';
      
      console.log(
        `${status} ${name.padEnd(24)} | ` +
        `${(chartValue !== null && chartValue !== undefined ? chartValue : 'null').toString().padStart(6)} | ` +
        `${correctDelta >= 0 ? '+' : ''}${correctDelta.toString().padStart(6)} | ` +
        `${isCorrect ? 'OK' : `FEHLER: sollte ${shouldBe} sein`}`
      );
    }
    
    console.log('\n' + '='.repeat(120));
    console.log('\n💡 HINWEIS: Der Chart-Wert ist kumulativ (vorheriger Wert + Delta)');
    console.log('   Claudia: -25 (vorher) + 8 (Delta) = -17 (aktuell) ✅\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

verifyChartValues().catch(console.error);

