const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeCurrentLogic() {
  console.log('🔍 Analysiere aktuelle Trumpf-Berechnungs-Logik...\n');

  // Schaue in den Code der playerStatsCalculator
  console.log('📋 Aktuelle Logik-Probleme:');
  console.log('❌ playerStatsCalculator.js liest aus roundHistory (session.gameResults[].roundHistory[].trumpf)');
  console.log('❌ Aber die Daten stehen bereits aggregiert in session.aggregatedTrumpfCountsByPlayer');
  console.log('❌ Tournament Sessions haben keine aggregatedTrumpfCountsByPlayer');
  
  console.log('\n💡 Optimale Lösung:');
  console.log('1️⃣ PlayerStatsCalculator soll ZUERST aggregatedTrumpfCountsByPlayer verwenden');
  console.log('2️⃣ Nur als Fallback aus roundHistory lesen');
  console.log('3️⃣ Tournament Sessions nachträglich reparieren');
  
  console.log('\n🔧 Vorgeschlagene Code-Änderung für playerStatsCalculator.js:');
  console.log(`
  // ✅ NEUE LOGIK: Verwende aggregierte Daten aus Session
  if (sessionData.aggregatedTrumpfCountsByPlayer) {
    // Füge bereits berechnete Trumpf-Daten direkt hinzu
    Object.entries(sessionData.aggregatedTrumpfCountsByPlayer).forEach(([playerId, trumpfCounts]) => {
      if (playerId === targetPlayerId) {
        Object.entries(trumpfCounts).forEach(([trumpf, count]) => {
          if (!playerTrumpfStats.has(trumpf)) {
            playerTrumpfStats.set(trumpf, 0);
          }
          playerTrumpfStats.set(trumpf, playerTrumpfStats.get(trumpf) + count);
        });
      }
    });
  } else {
    // ❌ FALLBACK: Nur wenn keine aggregierten Daten vorhanden (alte Logik)
    if (sessionData.gameResults) {
      sessionData.gameResults.forEach(game => {
        if (game.roundHistory) {
          game.roundHistory.forEach(round => {
            // Alte roundHistory Logik...
          });
        }
      });
    }
  }
  `);
  
  console.log('\n🎯 Das würde sofort alle Probleme lösen:');
  console.log('✅ Sessions mit aggregatedTrumpfCountsByPlayer: Direkte Verwendung');
  console.log('✅ Tournament ohne Daten: Kann separat repariert werden');
  console.log('✅ Performance: Keine complex roundHistory-Iterationen mehr');
  console.log('✅ Konsistenz: Eine einzige Datenquelle');
}

async function checkSessionsWithoutAggregatedData() {
  console.log('\n🔍 Suche Sessions ohne aggregatedTrumpfCountsByPlayer...\n');
  
  const sessionsSnap = await db.collection('jassGameSummaries')
    .where('status', '==', 'completed')
    .get();
  
  let withData = 0;
  let withoutData = 0;
  const problemSessions = [];
  
  sessionsSnap.docs.forEach(doc => {
    const sessionData = doc.data();
    if (sessionData.aggregatedTrumpfCountsByPlayer) {
      withData++;
    } else {
      withoutData++;
      problemSessions.push({
        id: doc.id,
        isTournament: Boolean(sessionData.tournamentId),
        gamesPlayed: sessionData.gamesPlayed || 0,
        participantPlayerIds: sessionData.participantPlayerIds || []
      });
    }
  });
  
  console.log(`📊 Ergebnisse:`);
  console.log(`✅ Sessions MIT aggregatedTrumpfCountsByPlayer: ${withData}`);
  console.log(`❌ Sessions OHNE aggregatedTrumpfCountsByPlayer: ${withoutData}`);
  
  if (problemSessions.length > 0) {
    console.log(`\n🚨 Sessions die repariert werden müssen:`);
    problemSessions.forEach(session => {
      console.log(`- ${session.id}: ${session.isTournament ? 'Tournament' : 'Regular'}, ${session.gamesPlayed} Spiele`);
    });
  }
  
  return problemSessions;
}

async function main() {
  await analyzeCurrentLogic();
  const problemSessions = await checkSessionsWithoutAggregatedData();
  
  console.log('\n🎯 EMPFEHLUNG:');
  console.log('1. Zuerst playerStatsCalculator.js Logik ändern (verwende aggregatedTrumpfCountsByPlayer)');
  console.log('2. Dann die ' + problemSessions.length + ' Sessions ohne Daten reparieren');
  console.log('3. Dann playerComputedStats neu berechnen');
  console.log('\nDas ist die sauberste und effizienteste Lösung! 🚀');
}

main().then(() => {
  console.log('\n🏁 Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 