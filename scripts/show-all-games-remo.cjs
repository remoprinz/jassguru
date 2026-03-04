/**
 * Zeige ALLE Spiele des Turniers mit Remos Beteiligung
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function show() {
  console.log('📊 ALLE SPIELE DES TURNIERS (15.01.2026)\n');
  
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  const gameResults = data.gameResults || [];
  
  console.log(`Anzahl Spiele: ${gameResults.length}\n`);
  console.log('='.repeat(80));
  
  let remoMatschMade = 0;
  let remoMatschReceived = 0;
  
  gameResults.forEach((game, index) => {
    const gameTeams = game.teams || {};
    const topPlayers = gameTeams.top?.players?.map(p => p.displayName).join(' & ') || '?';
    const bottomPlayers = gameTeams.bottom?.players?.map(p => p.displayName).join(' & ') || '?';
    
    // Ist Remo in diesem Spiel?
    const remoInTop = gameTeams.top?.players?.some(p => p.playerId === REMO_ID);
    const remoInBottom = gameTeams.bottom?.players?.some(p => p.playerId === REMO_ID);
    const remoPlayed = remoInTop || remoInBottom;
    
    console.log(`\n📌 SPIEL ${index + 1} (${game.passeLabel || 'Passe ?'}):`);
    console.log(`   Top:    ${topPlayers} (Score: ${game.topScore})`);
    console.log(`   Bottom: ${bottomPlayers} (Score: ${game.bottomScore})`);
    console.log(`   Sieger: ${game.winnerTeam}`);
    
    // Event Counts
    const topEvents = game.eventCounts?.top || {};
    const bottomEvents = game.eventCounts?.bottom || {};
    
    console.log(`   Events Top:    Matsch=${topEvents.matsch || 0}, Schneider=${topEvents.schneider || 0}`);
    console.log(`   Events Bottom: Matsch=${bottomEvents.matsch || 0}, Schneider=${bottomEvents.schneider || 0}`);
    
    if (remoPlayed) {
      const remoTeam = remoInTop ? 'top' : 'bottom';
      const opponentTeam = remoInTop ? 'bottom' : 'top';
      const remoMade = game.eventCounts?.[remoTeam]?.matsch || 0;
      const remoReceived = game.eventCounts?.[opponentTeam]?.matsch || 0;
      
      remoMatschMade += remoMade;
      remoMatschReceived += remoReceived;
      
      console.log(`   ⭐ REMO: Team ${remoTeam}, Matsch gemacht: ${remoMade}, Matsch bekommen: ${remoReceived}`);
    } else {
      console.log(`   ❌ REMO hat nicht gespielt`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG FÜR REMO (aus Firestore):');
  console.log('='.repeat(80));
  console.log(`   Matsch GEMACHT:   ${remoMatschMade}`);
  console.log(`   Matsch BEKOMMEN:  ${remoMatschReceived}`);
  console.log(`   DIFFERENZ:        ${remoMatschMade - remoMatschReceived}`);
  
  console.log('\n📊 totalEventCountsByPlayer[Remo]:');
  console.log(JSON.stringify(data.totalEventCountsByPlayer?.[REMO_ID], null, 2));
}

show()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
