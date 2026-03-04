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

// Die 3 neuen Spieler
const NEW_PLAYERS = [
  { id: 'PH15EO1vuTXq7FXal5Q_b', name: 'Reto' },
  { id: 'mgn9a1L5tM8iAJk5S2hkE', name: 'Schällenursli' },
  { id: '4nhOwuVONajPArNERzyEj', name: 'Davester' }
];

// Ein alter Spieler zum Vergleich
const OLD_PLAYER = { id: 'b16c1120111b7d9e7d733837', name: 'Remo' };

async function analyzeWhatWasWritten() {
  console.log('\n🔍 ANALYSE: Was wurde für welche Spieler geschrieben?\n');
  console.log('='.repeat(120));
  
  // Prüfe für jeden Spieler
  const allPlayers = [...NEW_PLAYERS, OLD_PLAYER];
  
  for (const player of allPlayers) {
    console.log(`\n📊 ${player.name} (${player.id}):`);
    console.log('-'.repeat(120));
    
    // 1. Prüfe globalStats.current
    const playerDoc = await db.collection('players').doc(player.id).get();
    const playerData = playerDoc.data();
    
    if (playerData?.globalStats?.current) {
      const stats = playerData.globalStats.current;
      console.log(`  ✅ globalStats.current: EXISTIERT`);
      console.log(`     - totalGames: ${stats.totalGames || 0}`);
      console.log(`     - gamesWon: ${stats.gamesWon || 0}`);
      console.log(`     - gamesLost: ${stats.gamesLost || 0}`);
      console.log(`     - stricheDifference: ${stats.stricheDifference || 0}`);
      console.log(`     - pointsDifference: ${stats.pointsDifference || 0}`);
    } else if (playerData?.globalStats && !playerData.globalStats.current) {
      console.log(`  ⚠️  globalStats: EXISTIERT (ohne .current!)`);
      console.log(`     - totalGames: ${playerData.globalStats.totalGames || 0}`);
    } else {
      console.log(`  ❌ globalStats.current: FEHLT`);
    }
    
    // 2. Prüfe scoresHistory
    const scoresHistorySnap = await db.collection(`players/${player.id}/scoresHistory`)
      .where('tournamentId', '==', TOURNAMENT_ID)
      .get();
    
    console.log(`  ${scoresHistorySnap.empty ? '❌' : '✅'} scoresHistory (Turnier): ${scoresHistorySnap.size} Einträge`);
    
    // 3. Prüfe wann globalStats.current erstellt wurde
    if (playerData?.globalStats?.current && playerData.lastUpdated) {
      const lastUpdated = playerData.lastUpdated.toDate();
      console.log(`  📅 lastUpdated: ${lastUpdated.toISOString()}`);
    }
    
    // 4. Prüfe ob Spieler vor dem Turnier schon Daten hatte
    const allScoresHistory = await db.collection(`players/${player.id}/scoresHistory`)
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    
    if (!allScoresHistory.empty) {
      const firstEntry = allScoresHistory.docs[0].data();
      const firstDate = firstEntry.completedAt?.toDate();
      console.log(`  📅 Letzter scoresHistory Eintrag: ${firstDate ? firstDate.toISOString() : 'N/A'}`);
    }
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('\n💡 ZUSAMMENFASSUNG:\n');
  console.log('1. globalStats.current: Wird von updatePlayerDataAfterSession geschrieben');
  console.log('2. scoresHistory: Wird von jassEloUpdater geschrieben (pro Spiel)');
  console.log('3. Charts: Werden von updateChartsAfterSession geschrieben (aus scoresHistory)');
  console.log('\n');
}

analyzeWhatWasWritten().catch(console.error);

