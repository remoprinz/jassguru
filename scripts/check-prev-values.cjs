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

async function checkPrevValues() {
  console.log('\n🔍 PRÜFE VORHERIGE WERTE VOR DEM TURNIER\n');
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
    
    console.log(`\n📊 Turnier bei Index ${tournamentIndex}: "${tournamentLabel}"\n`);
    console.log('Spieler                  | Vor Turnier | Turnier (aktuell) | Sollte sein');
    console.log('-'.repeat(120));
    
    // Lade jassGameSummary für korrekte Delta-Berechnung
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    const summaryData = summaryDoc.data();
    
    const playerStricheDiff = new Map();
    const participantPlayerIds = summaryData.participantPlayerIds || [];
    
    participantPlayerIds.forEach(pid => {
      playerStricheDiff.set(pid, { made: 0, received: 0 });
    });
    
    // Berechne korrekte Strichdifferenz
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
    
    // Prüfe Werte
    for (const playerId of participantPlayerIds) {
      const name = playerNames.get(playerId);
      const dataset = datasets.find(ds => ds.playerId === playerId);
      
      if (!dataset) continue;
      
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
      
      const currentValue = dataset.data[tournamentIndex];
      const stats = playerStricheDiff.get(playerId);
      const correctDelta = stats ? (stats.made - stats.received) : 0;
      const shouldBe = prevValue !== null ? prevValue + correctDelta : correctDelta;
      
      const error = currentValue !== null && currentValue !== undefined 
        ? Math.abs(currentValue - shouldBe)
        : null;
      
      const status = error !== null && error > 0.1 ? '❌' : '✅';
      
      console.log(
        `${status} ${name.padEnd(24)} | ` +
        `${(prevValue !== null ? prevValue : 'null').toString().padStart(6)} | ` +
        `${(currentValue !== null && currentValue !== undefined ? currentValue : 'null').toString().padStart(6)} | ` +
        `${shouldBe.toString().padStart(6)} ${error !== null && error > 0.1 ? `(FEHLER: ${error})` : ''}`
      );
    }
    
    console.log('\n' + '='.repeat(120));
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkPrevValues().catch(console.error);

