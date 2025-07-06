const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function fullTournamentAnalysis() {
  console.log('🔍 [DEBUG] VOLLSTÄNDIGE Analyse des Turniers "Krakau 2025"...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  const participantUids = [
    'AaTUBO0SbWVfStdHmD7zi3qAMww2', // Remo
    'WQSNHuoqtBen2D3E1bu4OLgx4aI3', // Schmuuuudii
    'i4ij3QCqKSbjPbx2hetwWlaQhlw2', // Studi
    'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2'  // Frank
  ];
  
  // KORRIGIERTE Namen-Zuordnung basierend auf den PlayerDetails
  const playerNames = {
    'AaTUBO0SbWVfStdHmD7zi3qAMww2': 'Remo',
    'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2': 'Studi',
    'i4ij3QCqKSbjPbx2hetwWlaQhlw2': 'Schmuddi',
    'WQSNHuoqtBen2D3E1bu4OLgx4aI3': 'Frank'
  };
  
  try {
    console.log('\n📊 [TURNIER] Lade Turnier-Grunddaten...');
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    const tournamentData = tournamentDoc.data();
    
    console.log(`Turnier: ${tournamentData.name}`);
    console.log(`Status: ${tournamentData.status}`);
    console.log(`Ranking-Modus: ${tournamentData.settings?.rankingMode}`);
    console.log(`Anzahl Passen (completedPasseCount): ${tournamentData.completedPasseCount}`);
    
    // 1. Suche in tournaments/{id}/games (Sub-Collection)
    console.log('\n🎮 [SPIELE 1] Lade aus tournaments/{id}/games...');
    const subCollectionGames = await db.collection('tournaments')
      .doc(tournamentId)
      .collection('games')
      .orderBy('passeNumber', 'asc')
      .get();
    
    console.log(`Sub-Collection gefunden: ${subCollectionGames.docs.length} Spiele`);
    
    // 2. Suche in activeGames (möglicherweise completed)
    console.log('\n🎮 [SPIELE 2] Suche in activeGames mit tournamentInstanceId...');
    const activeGamesQuery = await db.collection('activeGames')
      .where('tournamentInstanceId', '==', tournamentId)
      .get();
    
    console.log(`ActiveGames gefunden: ${activeGamesQuery.docs.length} Spiele`);
    
    activeGamesQuery.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: Status=${data.status}, Passe=${data.currentGameNumber || data.passeNumber || 'N/A'}`);
    });
    
    // 3. Suche in jassGameSummaries mit tournamentId
    console.log('\n🎮 [SPIELE 3] Suche in jassGameSummaries mit tournamentId...');
    const jassGameSummariesQuery = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .get();
    
    console.log(`JassGameSummaries gefunden: ${jassGameSummariesQuery.docs.length} Sessions`);
    
    // Für jede Session, suche nach completedGames
    for (const sessionDoc of jassGameSummariesQuery.docs) {
      const completedGamesQuery = await db.collection('jassGameSummaries')
        .doc(sessionDoc.id)
        .collection('completedGames')
        .get();
      
      console.log(`  - Session ${sessionDoc.id}: ${completedGamesQuery.docs.length} completedGames`);
    }
    
    // 4. Prüfe, ob es weitere Turnier-Sessions gibt
    console.log('\n🎮 [SPIELE 4] Suche in jassGameSummaries mit tournamentInstanceId...');
    const tournamentSessionsQuery = await db.collection('jassGameSummaries')
      .where('tournamentInstanceId', '==', tournamentId)
      .get();
    
    console.log(`Tournament Sessions gefunden: ${tournamentSessionsQuery.docs.length} Sessions`);
    
    for (const sessionDoc of tournamentSessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      console.log(`  - Session ${sessionDoc.id}:`);
      console.log(`    Status: ${sessionData.status}`);
      console.log(`    Spiele: ${sessionData.completedGamesCount || 0}`);
      console.log(`    Participants: ${sessionData.participantUids?.length || 0}`);
      
      const completedGamesQuery = await db.collection('jassGameSummaries')
        .doc(sessionDoc.id)
        .collection('completedGames')
        .get();
      
      console.log(`    CompletedGames in dieser Session: ${completedGamesQuery.docs.length}`);
    }
    
    // 5. HAUPTBERECHNUNG: Verwende die gefundenen Spiele
    console.log('\n🏆 [HAUPTBERECHNUNG] Verwende Sub-Collection Spiele...');
    
    const playerStats = {};
    participantUids.forEach(uid => {
      playerStats[uid] = {
        name: playerNames[uid],
        totalStriche: 0,
        totalPunkte: 0,
        gamesPlayed: 0,
        stricheDetails: {
          sieg: 0,
          berg: 0,
          matsch: 0,
          schneider: 0,
          kontermatsch: 0
        }
      };
    });
    
    let totalGamesProcessed = 0;
    
    // Verarbeite Sub-Collection Spiele
    for (const gameDoc of subCollectionGames.docs) {
      totalGamesProcessed++;
      const gameData = gameDoc.data();
      
      const playerDetails = gameData.playerDetails || [];
      const teamStriche = gameData.teamStrichePasse || { top: {}, bottom: {} };
      const topStriche = teamStriche.top || {};
      const bottomStriche = teamStriche.bottom || {};
      
      const topStricheTotal = (topStriche.sieg || 0) + (topStriche.berg || 0) + 
                              (topStriche.matsch || 0) + (topStriche.schneider || 0) + 
                              (topStriche.kontermatsch || 0);
      const bottomStricheTotal = (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + 
                                 (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + 
                                 (bottomStriche.kontermatsch || 0);
      
      playerDetails.forEach(player => {
        if (playerStats[player.playerId]) {
          const teamStriche = player.team === 'top' ? topStricheTotal : bottomStricheTotal;
          const teamStricheDetails = player.team === 'top' ? topStriche : bottomStriche;
          
          playerStats[player.playerId].totalStriche += teamStriche;
          playerStats[player.playerId].gamesPlayed++;
          
          Object.keys(teamStricheDetails).forEach(key => {
            if (playerStats[player.playerId].stricheDetails[key] !== undefined) {
              playerStats[player.playerId].stricheDetails[key] += teamStricheDetails[key] || 0;
            }
          });
          
          const teamScores = gameData.teamScoresPasse || { top: 0, bottom: 0 };
          const teamPoints = player.team === 'top' ? teamScores.top : teamScores.bottom;
          playerStats[player.playerId].totalPunkte += teamPoints;
        }
      });
    }
    
    console.log(`\n📊 Total verarbeitete Spiele: ${totalGamesProcessed}`);
    console.log(`📊 Erwartete Spiele laut completedPasseCount: ${tournamentData.completedPasseCount}`);
    
    if (totalGamesProcessed < tournamentData.completedPasseCount) {
      console.log(`⚠️  WARNUNG: ${tournamentData.completedPasseCount - totalGamesProcessed} Spiele fehlen!`);
    }
    
    // Erstelle finale Rangliste
    const ranking = Object.entries(playerStats)
      .map(([uid, stats]) => ({
        uid,
        ...stats
      }))
      .sort((a, b) => b.totalStriche - a.totalStriche);
    
    console.log('\n🏆 FINALE KORREKTE RANGLISTE:');
    ranking.forEach((player, index) => {
      console.log(`\n${index + 1}. ${player.name} (${player.uid})`);
      console.log(`   Striche: ${player.totalStriche}`);
      console.log(`   Punkte: ${player.totalPunkte}`);
      console.log(`   Spiele: ${player.gamesPlayed}`);
      console.log(`   Details: Sieg=${player.stricheDetails.sieg}, Berg=${player.stricheDetails.berg}, Matsch=${player.stricheDetails.matsch}, Schneider=${player.stricheDetails.schneider}, Kontermatsch=${player.stricheDetails.kontermatsch}`);
    });
    
    console.log('\n📱 VERGLEICH MIT APP:');
    console.log('App zeigt: 1. Schmuddi (42), 2. Frank (34), 3. Remo (30), 4. Studi (32)');
    console.log('User sagt: 1. Schmuddi, 2. Frank, 3. Remo, 4. Studi ist korrekt');
    
    console.log('\n🧮 MANUELLE BERECHNUNG:');
    ranking.forEach((player, index) => {
      console.log(`${index + 1}. ${player.name} - ${player.totalStriche} Striche`);
    });
    
    return ranking;
    
  } catch (error) {
    console.error('❌ [ERROR] Fehler bei der vollständigen Analyse:', error);
  }
}

fullTournamentAnalysis().then((ranking) => {
  console.log('\n✅ Vollständige Analyse abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Vollständige Analyse fehlgeschlagen:', error);
  process.exit(1);
}); 