const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const STUDI_ID = 'PLaDRlPBo91yu5Ij8MOT2';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';

async function debugStudiTrumpfStats() {
  console.log('🔍 Analysiere Studis Trumpfstatistiken...\n');

  try {
    // 1. Hole Studis berechnete Statistiken
    console.log('📊 1. PlayerComputedStats für Studi:');
    const studentStatsDoc = await db.collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(STUDI_ID).get();
    
    if (!studentStatsDoc.exists) {
      console.log('❌ Keine PlayerComputedStats für Studi gefunden!');
      return;
    }

    const studentStats = studentStatsDoc.data();
    console.log('✅ PlayerComputedStats gefunden:');
    console.log(`- Gesamte Spiele: ${studentStats.totalGames}`);
    console.log(`- Gesamte Sessions: ${studentStats.totalSessions}`);
    console.log(`- Tournament-Spiele: ${studentStats.totalTournamentGamesPlayed || 0}`);
    console.log(`- Tournaments teilgenommen: ${studentStats.totalTournamentsParticipated || 0}`);
    
    if (studentStats.trumpfStatistik) {
      console.log('\n🎯 Aktuelle Trumpfstatistiken:');
      const totalTrumpf = Object.values(studentStats.trumpfStatistik).reduce((sum, count) => sum + count, 0);
      console.log(`- Gesamte Trumpf-Zählung: ${totalTrumpf}`);
      
      Object.entries(studentStats.trumpfStatistik).forEach(([trumpf, count]) => {
        const percentage = totalTrumpf > 0 ? ((count / totalTrumpf) * 100).toFixed(1) : '0.0';
        console.log(`  - ${trumpf}: ${count} (${percentage}%)`);
      });
    } else {
      console.log('❌ Keine Trumpfstatistiken in PlayerComputedStats gefunden!');
    }

    // 2. Analysiere alle Sessions von Studi
    console.log('\n📋 2. Alle Sessions mit Studi analysieren:');
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where('participantPlayerIds', 'array-contains', STUDI_ID)
      .where('status', '==', 'completed')
      .get();

    console.log(`✅ ${sessionsSnap.docs.length} abgeschlossene Sessions gefunden`);

    let totalGamesFound = 0;
    let totalTournamentGames = 0;
    let allTrumpfData = {};

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      const isTournament = Boolean(sessionData.tournamentId);
      
      console.log(`\n🎮 Session ${sessionId} (${isTournament ? 'Tournament' : 'Regular'}):`);
      console.log(`  - Spiele: ${sessionData.gamesPlayed || 0}`);
      console.log(`  - Datum: ${sessionData.startedAt?.toDate?.()?.toLocaleDateString() || 'Unbekannt'}`);
      
      if (isTournament) {
        totalTournamentGames += sessionData.gamesPlayed || 0;
      }
      
      totalGamesFound += sessionData.gamesPlayed || 0;

      // 3. Schaue in die gameResults für Trumpf-Daten
      if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
        console.log(`  - GameResults verfügbar: ${sessionData.gameResults.length} Spiele`);
        
        sessionData.gameResults.forEach((game, index) => {
          if (game.trumpf) {
            if (!allTrumpfData[game.trumpf]) {
              allTrumpfData[game.trumpf] = 0;
            }
            allTrumpfData[game.trumpf]++;
            console.log(`    Spiel ${index + 1}: ${game.trumpf}`);
          }
        });
      }

      // 4. Schaue in completedGames Subkollektion
      try {
        const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
        if (!completedGamesSnap.empty) {
          console.log(`  - CompletedGames Subkollektion: ${completedGamesSnap.docs.length} Spiele`);
          
          completedGamesSnap.docs.forEach((gameDoc, index) => {
            const gameData = gameDoc.data();
            if (gameData.trumpf) {
              if (!allTrumpfData[gameData.trumpf]) {
                allTrumpfData[gameData.trumpf] = 0;
              }
              allTrumpfData[gameData.trumpf]++;
              console.log(`    CompletedGame ${index + 1}: ${gameData.trumpf}`);
            }
          });
        }
      } catch (error) {
        console.log(`  - Fehler beim Lesen der completedGames: ${error.message}`);
      }
    }

    // 5. Zusammenfassung
    console.log('\n📈 ZUSAMMENFASSUNG:');
    console.log(`- Sessions gefunden: ${sessionsSnap.docs.length}`);
    console.log(`- Spiele aus Session-Daten: ${totalGamesFound}`);
    console.log(`- Tournament-Spiele: ${totalTournamentGames}`);
    console.log(`- PlayerComputedStats Spiele: ${studentStats.totalGames}`);
    
    console.log('\n🎯 Trumpf-Daten aus Sessions:');
    const totalTrumpfFromSessions = Object.values(allTrumpfData).reduce((sum, count) => sum + count, 0);
    console.log(`- Gesamte Trumpf-Einträge: ${totalTrumpfFromSessions}`);
    
    if (totalTrumpfFromSessions > 0) {
      Object.entries(allTrumpfData).forEach(([trumpf, count]) => {
        const percentage = ((count / totalTrumpfFromSessions) * 100).toFixed(1);
        console.log(`  - ${trumpf}: ${count} (${percentage}%)`);
      });
    }

    // 6. Vergleich
    console.log('\n⚖️ VERGLEICH:');
    const statsTotal = studentStats.trumpfStatistik ? 
      Object.values(studentStats.trumpfStatistik).reduce((sum, count) => sum + count, 0) : 0;
    
    console.log(`- PlayerComputedStats Trumpf-Zählung: ${statsTotal}`);
    console.log(`- Tatsächliche Session-Trumpf-Zählung: ${totalTrumpfFromSessions}`);
    
    if (statsTotal !== totalTrumpfFromSessions) {
      console.log('🚨 DISKREPANZ ERKANNT! Die Zahlen stimmen nicht überein.');
    } else {
      console.log('✅ Zahlen stimmen überein.');
    }

  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  }
}

debugStudiTrumpfStats().then(() => {
  console.log('\n🏁 Analyse abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Unbehandelter Fehler:', err);
  process.exit(1);
}); 