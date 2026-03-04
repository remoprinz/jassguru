#!/usr/bin/env node
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifySession() {
  const sessionId = 'utrnuu7q5mQXHzWkPgO8Q';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('\n🔍 ANALYSIERE SESSION:', sessionId);
  console.log('=' .repeat(60));
  
  // Lade Session-Daten
  const sessionDoc = await db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`).get();
  const sessionData = sessionDoc.data();
  
  console.log('\n📅 SESSION INFO:');
  console.log('Datum:', new Date(sessionData.startedAt?._seconds * 1000 || sessionData.startedAt).toLocaleString('de-CH'));
  console.log('Teilnehmer:', sessionData.participantPlayerIds);
  
  // Lade einzelne Spiele
  const gamesSnap = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
    .orderBy('gameNumber', 'asc')
    .get();
  
  console.log('\n🎮 EINZELNE SPIELE:');
  
  let totalStricheTop = 0;
  let totalStricheBottom = 0;
  
  gamesSnap.forEach(doc => {
    const game = doc.data();
    const stricheTop = (game.finalStriche?.top?.berg || 0) + 
                       (game.finalStriche?.top?.sieg || 0) + 
                       (game.finalStriche?.top?.matsch || 0) + 
                       (game.finalStriche?.top?.schneider || 0) + 
                       (game.finalStriche?.top?.kontermatsch || 0);
    const stricheBottom = (game.finalStriche?.bottom?.berg || 0) + 
                          (game.finalStriche?.bottom?.sieg || 0) + 
                          (game.finalStriche?.bottom?.matsch || 0) + 
                          (game.finalStriche?.bottom?.schneider || 0) + 
                          (game.finalStriche?.bottom?.kontermatsch || 0);
    
    totalStricheTop += stricheTop;
    totalStricheBottom += stricheBottom;
    
    console.log(`\nSpiel ${game.gameNumber}:`);
    console.log(`  Top (Index 1,3):    ${stricheTop} Striche`);
    console.log(`  Bottom (Index 0,2): ${stricheBottom} Striche`);
  });
  
  console.log('\n📊 GESAMT-STRICHE:');
  console.log(`  Top (Index 1,3):    ${totalStricheTop} Striche`);
  console.log(`  Bottom (Index 0,2): ${totalStricheBottom} Striche`);
  
  // Bestimme Gewinner
  if (totalStricheTop > totalStricheBottom) {
    console.log(`\n🏆 GEWINNER: Top-Team (Index 1,3) mit +${totalStricheTop - totalStricheBottom} Strichen`);
  } else {
    console.log(`\n🏆 GEWINNER: Bottom-Team (Index 0,2) mit +${totalStricheBottom - totalStricheTop} Strichen`);
  }
  
  // Zeige Spieler-Zuordnung
  console.log('\n👥 SPIELER-ZUORDNUNG:');
  const playerIds = sessionData.participantPlayerIds;
  for (let i = 0; i < playerIds.length; i++) {
    const pid = playerIds[i];
    const playerDoc = await db.doc(`players/${pid}`).get();
    const playerData = playerDoc.data();
    const team = (i === 1 || i === 3) ? 'Top' : 'Bottom';
    console.log(`  Index ${i} (${team}): ${playerData?.displayName || pid.slice(0, 8)} (${pid})`);
  }
  
  // Lade aktuelle Ratings
  console.log('\n🎯 AKTUELLE ELO-RATINGS (nach Session):');
  for (const pid of playerIds) {
    const ratingDoc = await db.doc(`playerRatings/${pid}`).get();
    const rating = ratingDoc.data();
    console.log(`  ${rating?.displayName}: ${Math.round(rating?.rating || 100)} (Delta: ${rating?.lastDelta > 0 ? '+' : ''}${rating?.lastDelta})`);
  }
}

verifySession()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

