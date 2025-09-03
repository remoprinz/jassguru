const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deepAnalyzeSiegesquoten() {
  console.log('🔍 DETAILIERTE SIEGESQUOTEN-ANALYSE\n');
  
  // Hole alle Gruppen mit Daten
  const groupsSnapshot = await db.collection('groups').get();
  
  for (const groupDoc of groupsSnapshot.docs) {
    const groupData = groupDoc.data();
    
    // Prüfe ob Gruppe Daten hat
    const jgsSnapshot = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`).limit(1).get();
    if (jgsSnapshot.size === 0) continue;
    
    console.log(`🎯 Analysiere Gruppe: ${groupData.name || groupDoc.id}`);
    console.log('='.repeat(70));
    
    // Hole alle JassGameSummaries für detaillierte Analyse
    const allJgsSnapshot = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`).get();
    console.log(`📝 Gefunden: ${allJgsSnapshot.size} Sessions\n`);
    
    let totalGamesAnalyzed = 0;
    const playerWinAnalysis = {};
    
    for (const sessionDoc of allJgsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      console.log(`📋 Session: ${sessionDoc.id}`);
      console.log(`   ⏰ Zeitstempel: ${sessionData.endedAt ? sessionData.endedAt.toDate().toLocaleDateString() : 'Unbekannt'}`);
      
      // Analysiere gameWinsByPlayer
      if (sessionData.gameWinsByPlayer) {
        console.log('   🎮 Spiel-Siege pro Spieler:');
        for (const [playerId, stats] of Object.entries(sessionData.gameWinsByPlayer)) {
          console.log(`     • ${playerId}: ${stats.wins} Siege, ${stats.losses} Niederlagen`);
          
          // Sammle für Gesamtanalyse
          if (!playerWinAnalysis[playerId]) {
            playerWinAnalysis[playerId] = { totalWins: 0, totalLosses: 0, totalGames: 0 };
          }
          playerWinAnalysis[playerId].totalWins += stats.wins;
          playerWinAnalysis[playerId].totalLosses += stats.losses;
          playerWinAnalysis[playerId].totalGames += (stats.wins + stats.losses);
        }
      }
      
      // Analysiere gameWinsByTeam
      if (sessionData.gameWinsByTeam) {
        console.log(`   🏆 Team-Siege: Top=${sessionData.gameWinsByTeam.top}, Bottom=${sessionData.gameWinsByTeam.bottom}`);
        totalGamesAnalyzed += (sessionData.gameWinsByTeam.top + sessionData.gameWinsByTeam.bottom);
      }
      
      // Prüfe completedGames Subcollection
      const completedGamesSnapshot = await db.collection(`groups/${groupDoc.id}/jassGameSummaries/${sessionDoc.id}/completedGames`).get();
      console.log(`   🎯 CompletedGames: ${completedGamesSnapshot.size}`);
      
      if (completedGamesSnapshot.size > 0) {
        console.log('   📊 Einzelspiel-Analyse:');
        let gameCount = 0;
        for (const gameDoc of completedGamesSnapshot.docs) {
          if (gameCount >= 3) break; // Nur erste 3 Spiele anzeigen
          const gameData = gameDoc.data();
          const scores = gameData.finalScores || {};
          console.log(`     Spiel ${gameDoc.id}: Winner=${gameData.winnerTeam || 'Unbekannt'}, Punkte=Top:${scores.top || 0}, Bottom:${scores.bottom || 0}`);
          gameCount++;
        }
        if (completedGamesSnapshot.size > 3) {
          console.log(`     ... und ${completedGamesSnapshot.size - 3} weitere Spiele`);
        }
      }
      
      console.log('');
    }
    
    console.log('='.repeat(70));
    console.log('📊 GESAMTANALYSE DER SIEGESQUOTEN');
    console.log('='.repeat(70));
    
    for (const [playerId, analysis] of Object.entries(playerWinAnalysis)) {
      const winRate = analysis.totalGames > 0 ? (analysis.totalWins / analysis.totalGames * 100) : 0;
      console.log(`👤 Spieler ${playerId}:`);
      console.log(`   🎮 Gesamt Spiele: ${analysis.totalGames}`);
      console.log(`   🏆 Gesamt Siege: ${analysis.totalWins}`);
      console.log(`   💔 Gesamt Niederlagen: ${analysis.totalLosses}`);
      console.log(`   📈 Siegesquote: ${winRate.toFixed(1)}%`);
      console.log('');
    }
    
    console.log(`🎯 Insgesamt analysierte Spiele: ${totalGamesAnalyzed}`);
    
    // Jetzt prüfe die berechneten Stats
    console.log('\n' + '='.repeat(70));
    console.log('🔍 VERGLEICH MIT BERECHNETEN STATS');
    console.log('='.repeat(70));
    
    const statsSnapshot = await db.collection(`groups/${groupDoc.id}/stats`).get();
    if (statsSnapshot.size > 0) {
      const statsDoc = statsSnapshot.docs[0];
      const statsData = statsDoc.data();
      
      if (statsData.playerStats) {
        console.log('📊 Berechnete Spieler-Statistiken:');
        let discrepancyFound = false;
        
        for (const [playerId, stats] of Object.entries(statsData.playerStats)) {
          if (playerWinAnalysis[playerId]) {
            const calculatedWinRate = stats.games > 0 ? (stats.wins / stats.games * 100) : 0;
            const actualWinRate = playerWinAnalysis[playerId].totalGames > 0 ? (playerWinAnalysis[playerId].totalWins / playerWinAnalysis[playerId].totalGames * 100) : 0;
            
            console.log(`👤 Spieler ${playerId}:`);
            console.log(`   📊 Berechnete Stats: ${stats.games} Spiele, ${stats.wins} Siege (${calculatedWinRate.toFixed(1)}%)`);
            console.log(`   🎯 Tatsächliche Daten: ${playerWinAnalysis[playerId].totalGames} Spiele, ${playerWinAnalysis[playerId].totalWins} Siege (${actualWinRate.toFixed(1)}%)`);
            
            // Vergleich
            const gamesMatch = stats.games === playerWinAnalysis[playerId].totalGames;
            const winsMatch = stats.wins === playerWinAnalysis[playerId].totalWins;
            
            console.log(`   ✅ Spiele-Anzahl korrekt: ${gamesMatch ? 'JA' : 'NEIN'}`);
            console.log(`   ✅ Siege-Anzahl korrekt: ${winsMatch ? 'JA' : 'NEIN'}`);
            
            if (!gamesMatch || !winsMatch) {
              console.log('   ⚠️  DISKREPANZ GEFUNDEN!');
              discrepancyFound = true;
            }
            console.log('');
          }
        }
        
        if (!discrepancyFound) {
          console.log('✅ ALLE SIEGESQUOTEN SIND KORREKT BERECHNET!');
        } else {
          console.log('❌ DISKREPANZEN IN DER SIEGESQUOTEN-BERECHNUNG GEFUNDEN!');
        }
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('');
  }
}

deepAnalyzeSiegesquoten().then(() => {
  console.log('🎉 Analyse abgeschlossen!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fehler bei der Analyse:', error);
  process.exit(1);
});
