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

async function dryRun() {
  console.log('\n🔍 DRY RUN: KORREKTE STRICHDIFFERENZ-WERTE\n');
  console.log('='.repeat(120));
  
  try {
    // Lade jassGameSummary
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    
    if (!summaryDoc.exists) {
      console.log('❌ jassGameSummary nicht gefunden!');
      return;
    }
    
    const summaryData = summaryDoc.data();
    const participantPlayerIds = summaryData.participantPlayerIds || [];
    const playerNames = new Map();
    const playerStricheDiff = new Map();
    
    // Lade Spielernamen
    for (const playerId of participantPlayerIds) {
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        playerNames.set(playerId, playerDoc.exists ? (playerDoc.data().displayName || playerId) : playerId);
      } catch {
        playerNames.set(playerId, playerId);
      }
      playerStricheDiff.set(playerId, { made: 0, received: 0 });
    }
    
    // Berechne Strichdifferenz aus gameResults
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
    
    // Lade aktuelles Chart
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
    
    console.log('\n📊 KORREKTE STRICHDIFFERENZ-WERTE:\n');
    console.log('Spieler                  | Aktuell (Chart) | Korrekt (berechnet) | Differenz');
    console.log('-'.repeat(120));
    
    for (const playerId of participantPlayerIds) {
      const name = playerNames.get(playerId);
      const stats = playerStricheDiff.get(playerId);
      
      if (!stats) continue;
      
      const correctDiff = stats.made - stats.received;
      
      const dataset = datasets.find(ds => ds.playerId === playerId);
      const currentValue = dataset?.data?.[tournamentIndex];
      
      const error = currentValue !== null && currentValue !== undefined 
        ? Math.abs(currentValue - correctDiff)
        : null;
      
      const status = error !== null && error > 0.1 ? '❌' : '✅';
      
      console.log(
        `${status} ${name.padEnd(24)} | ` +
        `${(currentValue !== null && currentValue !== undefined ? currentValue : 'null').toString().padStart(6)} | ` +
        `${correctDiff.toString().padStart(6)} (${stats.made}/${stats.received}) | ` +
        `${error !== null ? (error > 0.1 ? `FEHLER: ${error}` : 'OK') : 'NEU'}`
      );
    }
    
    console.log('\n' + '='.repeat(120));
    console.log('\n✅ Diese Werte werden beim Backfill verwendet!\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

dryRun().catch(console.error);

