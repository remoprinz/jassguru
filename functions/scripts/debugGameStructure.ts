#!/usr/bin/env node

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccount = JSON.parse(readFileSync(join(__dirname, '../../../serviceAccountKey.json'), 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function check() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const sessionId = 'UIamH_JPMb9Yd5-sWHr-U';
  
  // Hole Spiel 1
  const gameDoc = await db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames/1`).get();
  
  console.log('\n🔍 Spiel 1 Daten:');
  const gameData = gameDoc.data();
  if (gameData) {
    console.log('Felder:', Object.keys(gameData).join(', '));
    console.log('Game Number:', gameData.gameNumber);
    console.log('Bottom Score:', gameData.bottomScore);
    console.log('Top Score:', gameData.topScore);
    console.log('Winner:', gameData.winnerTeam);
    console.log('\nVollständige Daten:');
    console.log(JSON.stringify(gameData, null, 2));
  } else {
    console.log('Kein Spiel gefunden');
  }
  
  // Hole auch Session-Daten
  const sessionDoc = await db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`).get();
  console.log('\n\n🔍 Session Daten:');
  const sessionData = sessionDoc.data();
  if (sessionData) {
    console.log('StartedAt:', sessionData.startedAt);
    console.log('CompletedAt:', sessionData.completedAt);
    console.log('EndedAt:', sessionData.endedAt);
  }
  
  // Hole ratingHistory für Remo
  const playerId = 'b16c1120111b7d9e7d733837';
  const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
    .where('sessionId', '==', sessionId)
    .limit(5)
    .get();
  
  console.log('\n\n🔍 RatingHistory Einträge für Remo:');
  historySnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`\nEintrag ${doc.id}:`);
    console.log('  Felder:', Object.keys(data).join(', '));
    console.log('  SessionId:', data.sessionId);
    console.log('  GameNumber:', data.gameNumber);
    console.log('  Rating:', data.rating);
    console.log('  Delta:', data.delta);
  });
}

check().then(() => process.exit(0)).catch(console.error);

