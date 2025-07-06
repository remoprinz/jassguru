const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function analyzeKrakauTournament() {
  console.log('🔍 [DEBUG] Analysiere Turnier "Krakau 2025"...');
  
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
    // 1. Lade Turnier-Grunddaten
    console.log('\n📊 [TURNIER] Lade Turnier-Grunddaten...');
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    const tournamentData = tournamentDoc.data();
    
    console.log(`Turnier: ${tournamentData.name}`);
    console.log(`Status: ${tournamentData.status}`);
    console.log(`Ranking-Modus: ${tournamentData.settings?.rankingMode}`);
    console.log(`Anzahl Passen: ${tournamentData.completedPasseCount}`);
    
    // 2. Lade alle Spiele des Turniers (aus der Sub-Collection)
    console.log('\n🎮 [SPIELE] Lade alle Turnier-Spiele...');
    const gamesSnap = await db.collection('tournaments')
      .doc(tournamentId)
      .collection('games')
      .orderBy('passeNumber', 'asc')
      .get();
    
    console.log(`Gefunden: ${gamesSnap.docs.length} Spiele`);
    
    // 3. Initialisiere Spielerstatistiken
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
    
    // 4. Analysiere jedes Spiel
    console.log('\n🔍 [ANALYSE] Analysiere einzelne Spiele...');
    let gameNumber = 0;
    
    for (const gameDoc of gamesSnap.docs) {
      gameNumber++;
      const gameData = gameDoc.data();
      
      console.log(`\n--- SPIEL ${gameNumber} (${gameDoc.id}) ---`);
      console.log(`Passe: ${gameData.passeNumber || 'N/A'}`);
      console.log(`Startzeit: ${gameData.startedAt?.toDate?.()?.toLocaleString('de-DE') || 'N/A'}`);
      
      // TournamentGame hat playerDetails Array statt teams
      const playerDetails = gameData.playerDetails || [];
      console.log(`Spieler in dieser Passe: ${playerDetails.length}`);
      
      playerDetails.forEach(player => {
        console.log(`  - ${playerNames[player.playerId] || player.playerName} (Seat ${player.seat}, Team ${player.team})`);
      });
      
      // Berechne Striche für alle Spieler in diesem Spiel aus teamStrichePasse
      const teamStriche = gameData.teamStrichePasse || { top: {}, bottom: {} };
      const topStriche = teamStriche.top || {};
      const bottomStriche = teamStriche.bottom || {};
      
      console.log(`Top Team Striche:`, topStriche);
      console.log(`Bottom Team Striche:`, bottomStriche);
      
      // Berechne totale Striche pro Team
      const topStricheTotal = (topStriche.sieg || 0) + (topStriche.berg || 0) + 
                              (topStriche.matsch || 0) + (topStriche.schneider || 0) + 
                              (topStriche.kontermatsch || 0);
      const bottomStricheTotal = (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + 
                                 (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + 
                                 (bottomStriche.kontermatsch || 0);
      
      console.log(`Top Team Striche Total: ${topStricheTotal}`);
      console.log(`Bottom Team Striche Total: ${bottomStricheTotal}`);
      
      // Addiere Striche zu den Spielerstatistiken basierend auf playerDetails
      playerDetails.forEach(player => {
        if (playerStats[player.playerId]) {
          const teamStriche = player.team === 'top' ? topStricheTotal : bottomStricheTotal;
          const teamStricheDetails = player.team === 'top' ? topStriche : bottomStriche;
          
          playerStats[player.playerId].totalStriche += teamStriche;
          playerStats[player.playerId].gamesPlayed++;
          
          // Addiere Details
          Object.keys(teamStricheDetails).forEach(key => {
            if (playerStats[player.playerId].stricheDetails[key] !== undefined) {
              playerStats[player.playerId].stricheDetails[key] += teamStricheDetails[key] || 0;
            }
          });
          
          // Auch Punkte hinzufügen (aus teamScoresPasse)
          const teamScores = gameData.teamScoresPasse || { top: 0, bottom: 0 };
          const teamPoints = player.team === 'top' ? teamScores.top : teamScores.bottom;
          playerStats[player.playerId].totalPunkte += teamPoints;
        }
      });
    }
    
    // 5. Erstelle Rangliste
    console.log('\n🏆 [RANGLISTE] Berechne finale Rangliste...');
    const ranking = Object.entries(playerStats)
      .map(([uid, stats]) => ({
        uid,
        ...stats
      }))
      .sort((a, b) => b.totalStriche - a.totalStriche); // Sortiere nach Strichen (absteigend)
    
    console.log('\n📊 FINALE RANGLISTE (nach Strichen):');
    ranking.forEach((player, index) => {
      console.log(`\n${index + 1}. ${player.name} (${player.uid})`);
      console.log(`   Striche: ${player.totalStriche}`);
      console.log(`   Punkte: ${player.totalPunkte}`);
      console.log(`   Spiele: ${player.gamesPlayed}`);
      console.log(`   Details: Sieg=${player.stricheDetails.sieg}, Berg=${player.stricheDetails.berg}, Matsch=${player.stricheDetails.matsch}, Schneider=${player.stricheDetails.schneider}, Kontermatsch=${player.stricheDetails.kontermatsch}`);
    });
    
    // 6. Prüfe, wer Remo ist und auf welchem Platz er steht
    console.log('\n🔍 [REMO-CHECK] Prüfe Remos Position...');
    const remoUID = 'AaTUBO0SbWVfStdHmD7zi3qAMww2';
    const remoPosition = ranking.findIndex(p => p.uid === remoUID) + 1;
    console.log(`Remo steht aktuell auf Platz ${remoPosition}`);
    
    if (remoPosition === 3) {
      console.log('✅ Remo ist korrekt auf Platz 3!');
    } else {
      console.log(`❌ Problem: Remo sollte auf Platz 3 stehen, ist aber auf Platz ${remoPosition}`);
    }
    
    // 7. Vergleiche mit den aktuellen Daten aus der App
    console.log('\n📱 [VERGLEICH] Vergleiche mit App-Daten...');
    console.log('Erwartete Reihenfolge laut Screenshot:');
    console.log('1. Schmuuuudii - 42 Striche');
    console.log('2. Frank - 34 Striche');
    console.log('3. Studi - 32 Striche');
    console.log('4. Remo - 30 Striche');
    
    console.log('\nBeechnete Reihenfolge:');
    ranking.forEach((player, index) => {
      console.log(`${index + 1}. ${player.name} - ${player.totalStriche} Striche`);
    });
    
    return ranking;
    
  } catch (error) {
    console.error('❌ [ERROR] Fehler bei der Analyse:', error);
  }
}

analyzeKrakauTournament().then((ranking) => {
  console.log('\n✅ Analyse abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Analyse fehlgeschlagen:', error);
  process.exit(1);
}); 