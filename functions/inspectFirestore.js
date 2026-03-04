const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectDatabase() {
  console.log('🔍 ANALYSIERE FIRESTORE DATENBANK...\n');
  
  // 1. Analysiere playerRatings Struktur
  console.log('📊 1. PLAYER RATINGS STRUKTUR:');
  console.log('================================\n');
  
  const playerRatingsRef = db.collection('groups/BhEdUmwb7tb4ka8BLUfM/playerRatings');
  const playerRatingsSnap = await playerRatingsRef.limit(3).get();
  
  if (!playerRatingsSnap.empty) {
    playerRatingsSnap.forEach(doc => {
      console.log(`Player ID: ${doc.id}`);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
      console.log('\n---\n');
    });
    
    // Prüfe History
    const firstPlayerId = playerRatingsSnap.docs[0].id;
    console.log(`\n📜 History für Player ${firstPlayerId}:`);
    const historyRef = db.collection(`groups/BhEdUmwb7tb4ka8BLUfM/playerRatings/${firstPlayerId}/history`);
    const historySnap = await historyRef.limit(3).get();
    
    if (!historySnap.empty) {
      console.log(`Anzahl History-Einträge: ${historySnap.size}`);
      historySnap.forEach(doc => {
        console.log(`\nTimestamp: ${doc.id}`);
        console.log('Data:', JSON.stringify(doc.data(), null, 2));
      });
    } else {
      console.log('❌ Keine History-Einträge gefunden');
    }
  } else {
    console.log('❌ Keine playerRatings gefunden');
  }
  
  // 2. Prüfe ob globale Player-Ratings existieren
  console.log('\n\n🌍 2. GLOBALE PLAYER RATINGS:');
  console.log('================================\n');
  
  const playersRef = db.collection('players');
  const playersSnap = await playersRef.limit(3).get();
  
  if (!playersSnap.empty) {
    playersSnap.forEach(doc => {
      console.log(`Player ID: ${doc.id}`);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
      console.log('\n---\n');
    });
  } else {
    console.log('❌ Keine globalen Player-Ratings gefunden');
  }
  
  // 3. Analysiere jassGameSummaries
  console.log('\n\n🎮 3. JASS GAME SUMMARIES (Team-IDs):');
  console.log('================================\n');
  
  const summariesRef = db.collection('groups/BhEdUmwb7tb4ka8BLUfM/jassGameSummaries');
  const summariesSnap = await summariesRef.limit(2).get();
  
  if (!summariesSnap.empty) {
    summariesSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Summary ID: ${doc.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Tournament ID: ${data.tournamentId || 'N/A'}`);
      
      if (data.teams) {
        console.log('Teams:');
        if (data.teams.top) {
          console.log('  Top:', data.teams.top.players?.map(p => p.playerId).join(', '));
        }
        if (data.teams.bottom) {
          console.log('  Bottom:', data.teams.bottom.players?.map(p => p.playerId).join(', '));
        }
      }
      
      if (data.gameResults && data.gameResults.length > 0) {
        console.log(`\nErste 2 Game Results:`);
        data.gameResults.slice(0, 2).forEach((game, idx) => {
          console.log(`  Game ${idx + 1}:`);
          if (game.teams) {
            console.log(`    Top: ${game.teams.top?.players?.map(p => p.playerId).join(', ')}`);
            console.log(`    Bottom: ${game.teams.bottom?.players?.map(p => p.playerId).join(', ')}`);
          }
        });
      }
      console.log('\n---\n');
    });
  }
  
  // 4. Analysiere Tournament-Struktur
  console.log('\n\n🏆 4. TOURNAMENT STRUKTUR:');
  console.log('================================\n');
  
  const tournamentsRef = db.collection('tournaments');
  const tournamentsSnap = await tournamentsRef.where('groupId', '==', 'BhEdUmwb7tb4ka8BLUfM').limit(1).get();
  
  if (!tournamentsSnap.empty) {
    const tournamentDoc = tournamentsSnap.docs[0];
    const tournamentData = tournamentDoc.data();
    console.log(`Tournament ID: ${tournamentDoc.id}`);
    console.log(`Name: ${tournamentData.name}`);
    console.log(`Status: ${tournamentData.status}`);
    console.log(`Participants:`, tournamentData.rankedPlayerUids?.length || 0);
    
    // Prüfe ob Runden-Logik existiert
    if (tournamentData.rounds) {
      console.log('\n📋 Runden-Logik:');
      console.log('Rounds:', JSON.stringify(tournamentData.rounds, null, 2));
    }
    
    // Prüfe jassGameSummary für dieses Turnier
    const tournamentSummaryRef = db.collection(`groups/BhEdUmwb7tb4ka8BLUfM/jassGameSummaries`);
    const tournamentSummarySnap = await tournamentSummaryRef.where('tournamentId', '==', tournamentDoc.id).limit(1).get();
    
    if (!tournamentSummarySnap.empty) {
      const summaryData = tournamentSummarySnap.docs[0].data();
      console.log('\n🎮 Tournament Game Summary:');
      console.log(`Games Played: ${summaryData.gamesPlayed || summaryData.gameResults?.length || 0}`);
      
      if (summaryData.gameResults && summaryData.gameResults.length > 0) {
        console.log(`\nSpiel-Struktur (erstes Spiel):`);
        const firstGame = summaryData.gameResults[0];
        console.log(JSON.stringify(firstGame, null, 2));
      }
    }
  } else {
    console.log('❌ Keine Tournaments gefunden');
  }
  
  console.log('\n\n✅ ANALYSE ABGESCHLOSSEN');
}

inspectDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
