import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function analyzeSession() {
  const sessionId = '83fBU_l0Rcok3a_DRt0-Z'; // 19.06.2025
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 SESSION ANALYSE: 19.06.2025');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Session Summary
  const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
  const summarySnap = await summaryRef.get();

  if (!summarySnap.exists) {
    console.log('❌ Session nicht gefunden!');
    process.exit(1);
  }

  const sessionData = summarySnap.data();

  console.log('📋 SESSION SUMMARY:');
  console.log('   Team TOP:');
  if (sessionData?.teams?.top?.players) {
    for (const p of sessionData.teams.top.players) {
      console.log(`      - ${p.displayName} (${p.playerId})`);
    }
  }
  console.log('   Team BOTTOM:');
  if (sessionData?.teams?.bottom?.players) {
    for (const p of sessionData.teams.bottom.players) {
      console.log(`      - ${p.displayName} (${p.playerId})`);
    }
  }

  // 2. Game 1 Details
  console.log('\n🎮 GAME 1:');
  const game1Ref = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames/1`);
  const game1Snap = await game1Ref.get();

  if (!game1Snap.exists) {
    console.log('❌ Game 1 nicht gefunden!');
    process.exit(1);
  }

  const game1Data = game1Snap.data() as any;

  // Check if game has its own teams
  if (game1Data?.teams) {
    console.log('   ✅ Game 1 hat EIGENE Teams:');
    console.log('   Team TOP:');
    if (game1Data.teams?.top?.players) {
      for (const p of game1Data.teams.top.players) {
        console.log(`      - ${p.displayName} (${p.playerId})`);
      }
    }
    console.log('   Team BOTTOM:');
    if (game1Data.teams?.bottom?.players) {
      for (const p of game1Data.teams.bottom.players) {
        console.log(`      - ${p.displayName} (${p.playerId})`);
      }
    }
  } else {
    console.log('   ⚠️  Game 1 hat KEINE eigenen Teams (würde Session-Teams verwenden)');
  }

  // 3. Striche
  console.log('\n📊 STRICHE (finalStriche):');
  const topStriche = 
    (game1Data.finalStriche?.top?.sieg || 0) * 1 +
    (game1Data.finalStriche?.top?.berg || 0) * 5 +
    (game1Data.finalStriche?.top?.matsch || 0) * 5 +
    (game1Data.finalStriche?.top?.schneider || 0) * 2 +
    (game1Data.finalStriche?.top?.kontermatsch || 0) * 5;

  const bottomStriche = 
    (game1Data.finalStriche?.bottom?.sieg || 0) * 1 +
    (game1Data.finalStriche?.bottom?.berg || 0) * 5 +
    (game1Data.finalStriche?.bottom?.matsch || 0) * 5 +
    (game1Data.finalStriche?.bottom?.schneider || 0) * 2 +
    (game1Data.finalStriche?.bottom?.kontermatsch || 0) * 5;

  console.log(`   TOP: ${topStriche} Striche`);
  console.log(`   BOTTOM: ${bottomStriche} Striche`);
  console.log(`   Winner: ${game1Data.winnerTeam}`);

  // 4. Rating History Einträge
  console.log('\n📈 RATING HISTORY (Game 1):');
  const players = [
    { id: 'b16c1120111b7d9e7d733837', name: 'Remo' },
    { id: '9K2d1OQ1mCXddko7ft6y', name: 'Michael' },
    { id: 'TPBwj8bP9W59n5LoGWP5', name: 'Schmuuuudii' },
    { id: 'xr0atZ7eLJgr7egkAfrE', name: 'Claudia' },
  ];

  for (const player of players) {
    const historySnap = await db
      .collection(`players/${player.id}/ratingHistory`)
      .where('sessionId', '==', sessionId)
      .where('gameNumber', '==', 1)
      .get();

    if (!historySnap.empty) {
      const entry = historySnap.docs[0].data();
      console.log(`   ${player.name.padEnd(12)}: Delta = ${entry.delta?.toFixed(2)?.padStart(6)}, Rating = ${entry.rating?.toFixed(1)}`);
    } else {
      console.log(`   ${player.name.padEnd(12)}: ❌ Kein Eintrag`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔍 PROBLEM-ANALYSE:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Wenn Partner unterschiedliche Deltas haben, dann wurde');
  console.log('die Team-Zuordnung falsch gemacht im Backfill.');
  console.log('\nErwartung: Partner im selben Team haben IDENTISCHE Deltas (Betrag)');
  console.log('mit umgekehrtem Vorzeichen zum gegnerischen Team.');
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(0);
}

analyzeSession().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

