#!/usr/bin/env node
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function dumpSession() {
  const sessionId = 'utrnuu7q5mQXHzWkPgO8Q';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('\n🔍 ROHDATEN - Session:', sessionId);
  console.log('='.repeat(70));
  
  // Session-Dokument
  const sessionDoc = await db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`).get();
  const sessionData = sessionDoc.data();
  
  console.log('\n📄 SESSION-DOKUMENT:');
  console.log('participantPlayerIds:', JSON.stringify(sessionData.participantPlayerIds, null, 2));
  console.log('finalStriche:', JSON.stringify(sessionData.finalStriche, null, 2));
  
  // Einzelne Spiele
  const gamesSnap = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
    .orderBy('gameNumber', 'asc')
    .get();
  
  console.log('\n🎮 EINZELNE SPIELE (ROHDATEN):');
  
  for (const doc of gamesSnap.docs) {
    const game = doc.data();
    console.log(`\n--- Spiel ${game.gameNumber} ---`);
    console.log('finalStriche.top:', JSON.stringify(game.finalStriche?.top));
    console.log('finalStriche.bottom:', JSON.stringify(game.finalStriche?.bottom));
    console.log('participantPlayerIds:', JSON.stringify(game.participantPlayerIds));
  }
  
  // Spielernamen
  console.log('\n👥 SPIELER-MAPPING:');
  for (let i = 0; i < sessionData.participantPlayerIds.length; i++) {
    const pid = sessionData.participantPlayerIds[i];
    const playerDoc = await db.doc(`players/${pid}`).get();
    const playerData = playerDoc.data();
    console.log(`  [${i}] ${playerData?.displayName || 'Unknown'} (${pid})`);
  }
}

dumpSession()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

