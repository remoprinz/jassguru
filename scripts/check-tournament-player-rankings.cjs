/**
 * 🔍 Prüfe tournaments/{tournamentId}/playerRankings Collection
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const TOURNAMENT_ID = 'kjoeh4ZPGtGr8GA8gp9p';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const JASS_GAME_SUMMARY_ID = '6eNr8fnsTO06jgCqjelt';

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 Prüfe tournaments/playerRankings Collection           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Lade playerRankings aus tournaments Collection
    console.log('📊 playerRankings aus tournaments Collection:');
    console.log('─'.repeat(80));

    const rankingsSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/playerRankings`).get();
    
    if (rankingsSnap.empty) {
      console.log('⚠️  Keine playerRankings gefunden!');
    } else {
      rankingsSnap.docs.forEach(doc => {
        const data = doc.data();
        const ec = data.eventCounts || {};
        const matschBilanz = (ec.matschMade || 0) - (ec.matschReceived || 0);
        
        console.log(`\n${data.displayName}:`);
        console.log(`  Punkte: ${data.pointsDifference}`);
        console.log(`  Striche: ${data.stricheDifference}`);
        console.log(`  Matsch: ${matschBilanz} (${ec.matschMade || 0}/${ec.matschReceived || 0})`);
        console.log(`  Schneider: ${(ec.schneiderMade || 0) - (ec.schneiderReceived || 0)} (${ec.schneiderMade || 0}/${ec.schneiderReceived || 0})`);
      });
    }

    // 2. Lade totalEventCountsByPlayer aus jassGameSummary
    console.log('\n\n📊 totalEventCountsByPlayer aus jassGameSummary:');
    console.log('─'.repeat(80));

    const summaryDoc = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .doc(JASS_GAME_SUMMARY_ID)
      .get();

    const summary = summaryDoc.data();
    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};

    Object.entries(totalEventCountsByPlayer).forEach(([playerId, events]) => {
      const matschBilanz = (events.matschMade || 0) - (events.matschReceived || 0);
      const schneiderBilanz = (events.schneiderMade || 0) - (events.schneiderReceived || 0);
      
      console.log(`\n${playerId.substring(0, 8)}...:`);
      console.log(`  Matsch: ${matschBilanz} (${events.matschMade || 0}/${events.matschReceived || 0})`);
      console.log(`  Schneider: ${schneiderBilanz} (${events.schneiderMade || 0}/${events.schneiderReceived || 0})`);
    });

    // 3. Vergleich
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 VERGLEICH                                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    if (rankingsSnap.empty) {
      console.log('❌ Keine playerRankings in tournaments Collection!');
      console.log('   Das alte Backfill-Skript würde NICHT funktionieren!');
    } else {
      console.log('✅ playerRankings existieren in tournaments Collection');
      console.log('⚠️  ABER: Das neue backfillChartData.cjs verwendet totalEventCountsByPlayer aus jassGameSummary');
    }

    console.log('\n🎉 Analyse abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

