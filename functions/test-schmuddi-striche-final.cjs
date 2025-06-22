const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function testSchmuddiStricheFinal() {
  console.log('🧪 [FINAL TEST] Teste Schmuuudiis Statistiken nach vollständiger Korrektur...');
  
  const schmuddiPlayerId = 'TPBwj8bP9W59n5LoGWP5';
  
  try {
    // 1. Warte kurz, damit die Cloud Function Zeit hat
    console.log('⏳ Warte 10 Sekunden auf Cloud Function...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 2. Prüfe neue Tournament-Session
    console.log('\n📊 [TOURNAMENT] Überprüfe neue Tournament-Session...');
    const tournamentSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', 'kjoeh4ZPGtGr8GA8gp9p')
      .get();
    
    if (tournamentSessionsSnap.empty) {
      console.log('❌ Keine neue Tournament-Session gefunden. Cloud Function läuft möglicherweise noch...');
      return;
    }
    
    const tournamentSession = tournamentSessionsSnap.docs[0].data();
    console.log('✅ Neue Tournament-Session gefunden:');
    console.log(`  - gameResults.length: ${tournamentSession.gameResults?.length || 0}`);
    console.log(`  - Erstes Spiel hat finalStriche: ${!!tournamentSession.gameResults?.[0]?.finalStriche}`);
    console.log(`  - Erstes Spiel topScore: ${tournamentSession.gameResults?.[0]?.topScore || 'N/A'}`);
    console.log(`  - Erstes Spiel bottomScore: ${tournamentSession.gameResults?.[0]?.bottomScore || 'N/A'}`);
    
    // 3. Triggere Player Stats Update
    console.log('\n🔄 [UPDATE] Triggere Player Stats Update...');
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    await updatePlayerStats(schmuddiPlayerId);
    
    // 4. Überprüfe finale Statistiken
    console.log('\n📈 [RESULTS] Finale Schmuuudii Statistiken:');
    const statsDoc = await db.collection('playerComputedStats').doc(schmuddiPlayerId).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log(`  ✅ Striche-Differenz: ${stats.totalStrichesDifference || 0}`);
      console.log(`  ✅ Punkte-Differenz: ${stats.totalPointsDifference || 0}`);
      console.log(`  ✅ Sessions gewonnen: ${stats.sessionsWon || 0}`);
      console.log(`  ✅ Games gewonnen: ${stats.gamesWon || 0}`);
      console.log(`  ✅ Total Games: ${stats.totalGames || 0}`);
      
      // Überprüfe Partner-Aggregate
      if (stats.partnerAggregates && stats.partnerAggregates.length > 0) {
        console.log(`  ✅ Partner-Aggregate: ${stats.partnerAggregates.length} Partner gefunden`);
        const remoPartner = stats.partnerAggregates.find(p => p.partnerDisplayName === 'Remo');
        if (remoPartner) {
          console.log(`  ✅ Remo Partner-Stats: ${remoPartner.totalStricheDifferenceWith} Striche, ${remoPartner.totalPointsDifferenceWith} Punkte`);
        }
      }
      
      console.log('\n🎯 [ERWARTUNG vs REALITÄT]');
      console.log('Erwartet: Schmuuudii sollte jetzt deutlich positive Striche/Punkte haben');
      console.log('(Turnier gewonnen + Session mit +10 Strichen)');
      
      if ((stats.totalStrichesDifference || 0) > 10) {
        console.log('✅ SUCCESS: Striche-Differenz ist plausibel hoch!');
      } else {
        console.log('❌ PROBLEM: Striche-Differenz ist immer noch zu niedrig.');
      }
      
    } else {
      console.log('❌ Keine Player Stats gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim finalen Test:', error);
  }
}

testSchmuddiStricheFinal().then(() => {
  console.log('\n🏁 Finaler Test abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 