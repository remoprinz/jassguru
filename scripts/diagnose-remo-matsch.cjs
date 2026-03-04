/**
 * Diagnose: Remos Matsch-Bilanz im Turnier
 * 
 * Fakt laut User:
 * - Passe 1: 1 Matsch BEKOMMEN
 * - Passe 3: 1 Matsch GEMACHT
 * - Korrekte Differenz: 0
 * 
 * Aber GroupView zeigt: -1
 * Und ProfileView zeigt: +1
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function diagnose() {
  console.log('🔍 DIAGNOSE: Remos Matsch-Bilanz im Turnier\n');
  
  // 1. Lade Tournament jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  
  console.log('='.repeat(80));
  console.log('📊 ANALYSE DER TURNIER-DATEN');
  console.log('='.repeat(80));
  
  // 2. Prüfe totalEventCountsByPlayer für Remo
  console.log('\n📌 totalEventCountsByPlayer[Remo]:');
  const remoEvents = data.totalEventCountsByPlayer?.[REMO_ID];
  console.log(JSON.stringify(remoEvents, null, 2));
  
  // 3. Analysiere jedes Game für Remo
  console.log('\n📌 ANALYSE PRO GAME (Passe):');
  const gameResults = data.gameResults || [];
  
  let totalMatschMade = 0;
  let totalMatschReceived = 0;
  
  gameResults.forEach((game, index) => {
    const gameTeams = game.teams || {};
    const gameEventCounts = game.eventCounts || {};
    
    // Finde Remos Team in diesem Game
    let remoTeam = null;
    if (gameTeams.top?.players?.some(p => p.playerId === REMO_ID)) {
      remoTeam = 'top';
    } else if (gameTeams.bottom?.players?.some(p => p.playerId === REMO_ID)) {
      remoTeam = 'bottom';
    }
    
    if (remoTeam) {
      const opponentTeam = remoTeam === 'top' ? 'bottom' : 'top';
      const madeInGame = gameEventCounts[remoTeam]?.matsch || 0;
      const receivedInGame = gameEventCounts[opponentTeam]?.matsch || 0;
      
      totalMatschMade += madeInGame;
      totalMatschReceived += receivedInGame;
      
      console.log(`\n   Game ${index + 1} (${game.passeLabel}):`);
      console.log(`     Remo's Team: ${remoTeam}`);
      console.log(`     Partner: ${gameTeams[remoTeam]?.players?.find(p => p.playerId !== REMO_ID)?.displayName}`);
      console.log(`     Matsch GEMACHT (Team): ${madeInGame}`);
      console.log(`     Matsch BEKOMMEN (Gegner): ${receivedInGame}`);
      console.log(`     Differenz: ${madeInGame - receivedInGame}`);
    } else {
      console.log(`\n   Game ${index + 1} (${game.passeLabel}): Remo hat NICHT gespielt`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG FÜR REMO:');
  console.log('='.repeat(80));
  console.log(`   Gesamt Matsch GEMACHT: ${totalMatschMade}`);
  console.log(`   Gesamt Matsch BEKOMMEN: ${totalMatschReceived}`);
  console.log(`   KORREKTE Differenz: ${totalMatschMade - totalMatschReceived}`);
  
  // 4. Was speichert mein Backfill-Script?
  console.log('\n' + '='.repeat(80));
  console.log('📊 WAS SPEICHERT MEIN BACKFILL-SCRIPT?');
  console.log('='.repeat(80));
  
  // Meine calculateTournamentDelta Logik:
  const playerEvents = data.totalEventCountsByPlayer?.[REMO_ID];
  const playerValue = playerEvents?.matsch || 0;
  console.log(`\n   playerValue (aus totalEventCountsByPlayer): ${playerValue}`);
  
  // Berechne opponentValue aus gameResults (wie im Script)
  let opponentValue = 0;
  gameResults.forEach(game => {
    const gameTeams = game.teams || {};
    const gameEventCounts = game.eventCounts || {};
    
    let playerTeam = null;
    if (gameTeams.top?.players?.some(p => p.playerId === REMO_ID)) {
      playerTeam = 'top';
    } else if (gameTeams.bottom?.players?.some(p => p.playerId === REMO_ID)) {
      playerTeam = 'bottom';
    }
    
    if (playerTeam) {
      const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
      opponentValue += gameEventCounts[opponentTeam]?.matsch || 0;
    }
  });
  
  console.log(`   opponentValue (berechnet aus gameResults): ${opponentValue}`);
  console.log(`   Backfill-Script berechnet: ${playerValue} - ${opponentValue} = ${playerValue - opponentValue}`);
  
  // 5. Prüfe chartData_matsch
  console.log('\n' + '='.repeat(80));
  console.log('📊 WAS STEHT IN chartData_matsch?');
  console.log('='.repeat(80));
  
  const chartDoc = await db.collection(`groups/${GROUP_ID}/aggregated`).doc('chartData_matsch').get();
  const chartData = chartDoc.data();
  const remoDataset = chartData.datasets?.find(d => d.playerId === REMO_ID);
  
  if (remoDataset) {
    console.log(`\n   Remo's letzte 5 Datenpunkte:`);
    const last5 = remoDataset.data.slice(-5);
    const last5Labels = chartData.labels.slice(-5);
    last5.forEach((val, i) => {
      console.log(`     ${last5Labels[i]}: ${val}`);
    });
  }
  
  // 6. Prüfe scoresHistory für ProfileView
  console.log('\n' + '='.repeat(80));
  console.log('📊 WAS STEHT IN scoresHistory (für ProfileView)?');
  console.log('='.repeat(80));
  
  const scoresHistorySnap = await db.collection(`players/${REMO_ID}/scoresHistory`)
    .orderBy('completedAt', 'desc')
    .limit(3)
    .get();
  
  scoresHistorySnap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`\n   Session ${doc.id}:`);
    console.log(`     matschBilanz: ${d.matschBilanz}`);
    console.log(`     matschMade: ${d.matschMade}`);
    console.log(`     matschReceived: ${d.matschReceived}`);
    console.log(`     isTournamentSession: ${d.isTournamentSession}`);
    console.log(`     completedAt: ${d.completedAt?.toDate?.()}`);
  });
  
  // 7. Was steht im Player-Dokument?
  console.log('\n' + '='.repeat(80));
  console.log('📊 WAS STEHT IM PLAYER-DOKUMENT?');
  console.log('='.repeat(80));
  
  const playerDoc = await db.collection('players').doc(REMO_ID).get();
  const playerData = playerDoc.data();
  const groupStats = playerData?.groupStats?.[GROUP_ID];
  
  console.log(`\n   matschMade: ${groupStats?.matschMade}`);
  console.log(`   matschReceived: ${groupStats?.matschReceived}`);
  console.log(`   matschBilanz: ${(groupStats?.matschMade || 0) - (groupStats?.matschReceived || 0)}`);
  
  console.log('\n\n✅ DIAGNOSE ABGESCHLOSSEN');
}

diagnose()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
