import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function analyzeFullSession() {
  const sessionId = '83fBU_l0Rcok3a_DRt0-Z'; // 19.06.2025
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 VOLLSTÄNDIGE SESSION ANALYSE: 19.06.2025');
  console.log('═══════════════════════════════════════════════════════════\n');

  const players = [
    { id: 'b16c1120111b7d9e7d733837', name: 'Remo' },
    { id: '9K2d1OQ1mCXddko7ft6y', name: 'Michael' },
    { id: 'TPBwj8bP9W59n5LoGWP5', name: 'Schmuuuudii' },
    { id: 'xr0atZ7eLJgr7egkAfrE', name: 'Claudia' },
  ];

  // Sammle alle Deltas pro Spieler für diese Session
  const playerDeltas: { [playerId: string]: number[] } = {};
  const playerTotals: { [playerId: string]: number } = {};

  for (const player of players) {
    const historySnap = await db
      .collection(`players/${player.id}/ratingHistory`)
      .where('sessionId', '==', sessionId)
      .get();

    const deltas: number[] = [];
    let total = 0;

    console.log(`\n${player.name}:`);
    
    // Sortiere manuell nach gameNumber
    const sortedDocs = historySnap.docs
      .filter(doc => doc.data().gameNumber)
      .sort((a, b) => (a.data().gameNumber || 0) - (b.data().gameNumber || 0));
    
    sortedDocs.forEach((doc) => {
      const entry = doc.data();
      const delta = entry.delta || 0;
      deltas.push(delta);
      total += delta;
      console.log(`  Game ${entry.gameNumber}: ${delta.toFixed(2)}`);
    });

    console.log(`  SUMME: ${total.toFixed(2)}`);
    playerDeltas[player.id] = deltas;
    playerTotals[player.id] = total;
  }

  // Vergleiche mit playerFinalRatings
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 VERGLEICH: ratingHistory SUM vs playerFinalRatings');
  console.log('═══════════════════════════════════════════════════════════\n');

  const summaryDoc = await db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`).get();
  const sessionData = summaryDoc.data() as any;

  for (const player of players) {
    const historyTotal = playerTotals[player.id];
    const finalRating = sessionData.playerFinalRatings?.[player.id]?.ratingDelta || 0;
    const match = Math.abs(historyTotal - finalRating) < 0.01 ? '✅' : '❌';

    console.log(
      `${player.name.padEnd(12)}: History=${historyTotal.toFixed(2).padStart(6)}  PlayerFinalRatings=${finalRating.toFixed(2).padStart(6)}  ${match}`
    );
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  process.exit(0);
}

analyzeFullSession().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

