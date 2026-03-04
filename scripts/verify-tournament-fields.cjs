/**
 * Verifiziere die Feld-Namen in totalStricheByPlayer und totalPointsByPlayer
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const REMO_ID = 'b16c1120111b7d9e7d733837';

async function verify() {
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  
  console.log('📌 totalStricheByPlayer[Remo]:');
  console.log(JSON.stringify(data.totalStricheByPlayer?.[REMO_ID], null, 2));
  
  console.log('\n📌 totalPointsByPlayer[Remo]:');
  console.log(JSON.stringify(data.totalPointsByPlayer?.[REMO_ID], null, 2));
  
  console.log('\n📌 totalEventCountsByPlayer[Remo]:');
  console.log(JSON.stringify(data.totalEventCountsByPlayer?.[REMO_ID], null, 2));
  
  // Berechne korrekte Werte aus gameResults
  const gameResults = data.gameResults || [];
  let stricheMade = 0;
  let stricheReceived = 0;
  let pointsMade = 0;
  let pointsReceived = 0;
  
  gameResults.forEach(game => {
    const gameTeams = game.teams || {};
    let remoTeam = null;
    if (gameTeams.top?.players?.some(p => p.playerId === REMO_ID)) {
      remoTeam = 'top';
    } else if (gameTeams.bottom?.players?.some(p => p.playerId === REMO_ID)) {
      remoTeam = 'bottom';
    }
    
    if (remoTeam) {
      const opponentTeam = remoTeam === 'top' ? 'bottom' : 'top';
      
      // Striche
      const ownStriche = game.finalStriche?.[remoTeam] || {};
      const oppStriche = game.finalStriche?.[opponentTeam] || {};
      stricheMade += (ownStriche.sieg || 0) + (ownStriche.berg || 0) + (ownStriche.matsch || 0) + (ownStriche.schneider || 0) + (ownStriche.kontermatsch || 0);
      stricheReceived += (oppStriche.sieg || 0) + (oppStriche.berg || 0) + (oppStriche.matsch || 0) + (oppStriche.schneider || 0) + (oppStriche.kontermatsch || 0);
      
      // Punkte
      const ownScore = remoTeam === 'top' ? game.topScore : game.bottomScore;
      const oppScore = remoTeam === 'top' ? game.bottomScore : game.topScore;
      pointsMade += ownScore || 0;
      pointsReceived += oppScore || 0;
    }
  });
  
  console.log('\n📌 KORREKTE WERTE (berechnet aus gameResults):');
  console.log(`   Striche gemacht: ${stricheMade}`);
  console.log(`   Striche bekommen: ${stricheReceived}`);
  console.log(`   Striche-Differenz: ${stricheMade - stricheReceived}`);
  console.log(`   Punkte gemacht: ${pointsMade}`);
  console.log(`   Punkte bekommen: ${pointsReceived}`);
  console.log(`   Punkte-Differenz: ${pointsMade - pointsReceived}`);
  
  // Was sagt scoresHistory?
  const scoresHistorySnap = await db.collection(`players/${REMO_ID}/scoresHistory`)
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get();
  
  const latestEntry = scoresHistorySnap.docs[0]?.data();
  console.log('\n📌 scoresHistory (letzte Session):');
  console.log(`   stricheDiff: ${latestEntry?.stricheDiff}`);
  console.log(`   pointsDiff: ${latestEntry?.pointsDiff}`);
  console.log(`   matschBilanz: ${latestEntry?.matschBilanz}`);
}

verify()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
