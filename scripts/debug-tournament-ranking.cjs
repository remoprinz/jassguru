const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

async function debugTournamentRanking() {
  console.log('\n🔍 DEBUG: TURNIER-RANKING ANALYSE\n');
  console.log('='.repeat(120));
  
  try {
    // 1. Lade Tournament Settings
    const tournamentDoc = await db.collection('tournaments').doc(TOURNAMENT_ID).get();
    const tournamentData = tournamentDoc.data();
    const rankingMode = tournamentData?.settings?.rankingMode || 'total_points';
    
    console.log(`\n📊 TURNIER-EINSTELLUNGEN:`);
    console.log(`   Ranking-Modus: ${rankingMode}`);
    console.log(`   Name: ${tournamentData?.name}`);
    
    // 2. Lade PlayerRankings (Backend-Daten)
    console.log(`\n📋 BACKEND PLAYERRANKINGS (aus tournaments/{id}/playerRankings):`);
    const playerRankingsRef = db.collection(`tournaments/${TOURNAMENT_ID}/playerRankings`);
    const playerRankingsSnap = await playerRankingsRef.get();
    
    const backendRankings = [];
    playerRankingsSnap.forEach(doc => {
      const data = doc.data();
      backendRankings.push({
        playerId: doc.id,
        rank: data.rank,
        stricheScored: data.stricheScored || 0,
        stricheReceived: data.stricheReceived || 0,
        stricheDifference: data.stricheDifference || 0,
        pointsScored: data.pointsScored || 0,
        pointsReceived: data.pointsReceived || 0,
        pointsDifference: data.pointsDifference || 0,
      });
    });
    
    backendRankings.sort((a, b) => a.rank - b.rank);
    
    console.log(`\n   Gefunden: ${backendRankings.length} Spieler\n`);
    backendRankings.forEach(r => {
      console.log(`   Rang ${r.rank}: ${r.playerId}`);
      console.log(`      Striche: ${r.stricheScored} (Differenz: ${r.stricheDifference})`);
      console.log(`      Punkte: ${r.pointsScored} (Differenz: ${r.pointsDifference})`);
    });
    
    // 3. Lade alle Games und berechne Ränge neu
    console.log(`\n\n🔄 NEU-BERECHNUNG (wie Frontend):`);
    const gamesRef = db.collection(`tournaments/${TOURNAMENT_ID}/games`);
    const gamesSnap = await gamesRef.get();
    
    const playerStats = new Map();
    
    gamesSnap.docs.forEach(gameDoc => {
      const game = gameDoc.data();
      const gameAny = game;
      
      if (game.playerDetails && Array.isArray(game.playerDetails)) {
        game.playerDetails.forEach(player => {
          const playerId = player.playerId;
          
          if (!playerStats.has(playerId)) {
            playerStats.set(playerId, {
              playerId,
              playerName: player.playerName,
              totalStriche: 0,
              totalPoints: 0,
              stricheScored: 0,
              stricheReceived: 0,
            });
          }
          
          const stats = playerStats.get(playerId);
          
          // Striche gemacht (Team-Striche)
          let stricheSumInPasse = 0;
          if (player.team && game.teamStrichePasse && game.teamStrichePasse[player.team]) {
            const teamStriche = game.teamStrichePasse[player.team];
            stricheSumInPasse = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
          }
          stats.totalStriche += stricheSumInPasse;
          stats.stricheScored += stricheSumInPasse;
          
          // Striche erhalten (Gegner-Team)
          const opponentTeam = player.team === 'top' ? 'bottom' : 'top';
          let stricheReceivedInPasse = 0;
          if (game.teamStrichePasse && game.teamStrichePasse[opponentTeam]) {
            const opponentStriche = game.teamStrichePasse[opponentTeam];
            stricheReceivedInPasse = Object.values(opponentStriche).reduce((sum, val) => sum + (val || 0), 0);
          }
          stats.stricheReceived += stricheReceivedInPasse;
          
          // Punkte
          const teamScore = player.team && game.teamScoresPasse 
            ? (game.teamScoresPasse[player.team] || 0) 
            : (player.scoreInPasse || 0);
          stats.totalPoints += teamScore;
        });
      }
    });
    
    // Berechne Differenzen
    const recalculatedPlayers = Array.from(playerStats.values()).map(p => ({
      ...p,
      stricheDifference: p.stricheScored - p.stricheReceived,
      pointsDifference: p.totalPoints - (p.totalPoints - p.totalPoints), // Placeholder
    }));
    
    // Sortiere nach rankingMode
    if (rankingMode === 'striche') {
      recalculatedPlayers.sort((a, b) => {
        if (b.totalStriche !== a.totalStriche) return b.totalStriche - a.totalStriche;
        return b.totalPoints - a.totalPoints;
      });
    } else if (rankingMode === 'striche_difference') {
      recalculatedPlayers.sort((a, b) => {
        if (b.stricheDifference !== a.stricheDifference) return b.stricheDifference - a.stricheDifference;
        return b.totalPoints - a.totalPoints;
      });
    } else {
      // 'total_points'
      recalculatedPlayers.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return b.totalStriche - a.totalStriche;
      });
    }
    
    // Weise Ränge zu
    let rank = 1;
    const rankedRecalculated = recalculatedPlayers.map((player, index) => {
      if (index > 0) {
        const prevPlayer = recalculatedPlayers[index - 1];
        let isEqual = false;
        
        if (rankingMode === 'striche') {
          isEqual = prevPlayer.totalStriche === player.totalStriche && 
                    prevPlayer.totalPoints === player.totalPoints;
        } else if (rankingMode === 'striche_difference') {
          isEqual = prevPlayer.stricheDifference === player.stricheDifference && 
                    prevPlayer.totalPoints === player.totalPoints;
        } else {
          isEqual = prevPlayer.totalPoints === player.totalPoints && 
                    prevPlayer.totalStriche === player.totalStriche;
        }
        
        if (!isEqual) {
          rank = index + 1;
        }
      }
      
      return { ...player, rank };
    });
    
    console.log(`\n   Gefunden: ${rankedRecalculated.length} Spieler\n`);
    rankedRecalculated.forEach(r => {
      console.log(`   Rang ${r.rank}: ${r.playerName || r.playerId}`);
      console.log(`      Striche: ${r.totalStriche} (Differenz: ${r.stricheDifference})`);
      console.log(`      Punkte: ${r.totalPoints}`);
    });
    
    // 4. Vergleich
    console.log(`\n\n🔍 VERGLEICH:\n`);
    console.log(`   Backend vs. Neu-Berechnung:\n`);
    
    const backendMap = new Map(backendRankings.map(r => [r.playerId, r]));
    rankedRecalculated.forEach(recalc => {
      const backend = backendMap.get(recalc.playerId);
      if (backend) {
        const rankMatch = backend.rank === recalc.rank ? '✅' : '❌';
        console.log(`   ${recalc.playerName || recalc.playerId}:`);
        console.log(`      Backend Rang: ${backend.rank} | Neu-Berechnung Rang: ${recalc.rank} ${rankMatch}`);
        if (backend.rank !== recalc.rank) {
          console.log(`      ⚠️  UNTERSCHIED!`);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

debugTournamentRanking().catch(console.error);

