const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

// Hilfsfunktion zur Umwandlung von authUid in playerDocId
async function getPlayerDocId(authUid) {
  // Zuerst im User-Dokument nachsehen
  const userRef = db.collection('users').doc(authUid);
  const userSnap = await userRef.get();
  if (userSnap.exists && userSnap.data()?.playerId) {
    return userSnap.data().playerId;
  }
  
  // Fallback: Direkte Abfrage der players-Collection
  const playerQuery = db.collection('players').where('userId', '==', authUid).limit(1);
  const playerSnap = await playerQuery.get();
  if (!playerSnap.empty) {
    return playerSnap.docs[0].id;
  }

  console.warn(`Could not find player document ID for authUid: ${authUid}. Returning authUid as fallback.`);
  return authUid;
}

async function simpleTournamentFix() {
  console.log('🚀 [SIMPLE] Starte einfache Tournament-Aggregation...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  try {
    // 1. Lösche alte Tournament-Sessions
    console.log('\n🗑️ [CLEANUP] Lösche alte Tournament-Sessions...');
    const oldSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .get();
    
    for (const doc of oldSessionsSnap.docs) {
      console.log(`  - Lösche altes Dokument: ${doc.id}`);
      await doc.ref.delete();
    }
    
    // 2. Lade Tournament-Daten
    console.log('\n🏆 [LOAD] Lade Tournament-Daten...');
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    
    if (!tournamentSnap.exists) {
      console.log('❌ Tournament nicht gefunden!');
      return;
    }
    
    const tournamentData = tournamentSnap.data();
    console.log(`  - Name: ${tournamentData.name}`);
    console.log(`  - GroupId: ${tournamentData.groupId}`);
    
    // 3. Lade Tournament-Spiele
    console.log('\n🎮 [GAMES] Lade Tournament-Spiele...');
    const gamesSnapshot = await db.collection('tournaments').doc(tournamentId).collection('games').get();
    
    if (gamesSnapshot.empty) {
      console.log('❌ Keine Spiele im Tournament gefunden!');
      return;
    }
    
    console.log(`  - Gefunden: ${gamesSnapshot.docs.length} Spiele`);
    
    const games = gamesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Nach completedAt sortieren
    games.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    // 4. Erstelle JassGameSummary
    console.log('\n📝 [CREATE] Erstelle JassGameSummary...');
    
    const summary = {
      finalScores: { top: 0, bottom: 0 },
      finalStriche: { 
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
      },
      eventCounts: { 
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
      },
      gameResults: [],
      gameWinsByPlayer: {},
      gameWinsByTeam: { top: 0, bottom: 0, ties: 0 },
      sessionTotalWeisPoints: { top: 0, bottom: 0 },
      participantPlayerIds: [],
      gamesPlayed: games.length,
      durationSeconds: 0,
      createdAt: tournamentData.createdAt,
      startedAt: games[0].completedAt,
      endedAt: games[games.length - 1].completedAt,
      status: 'completed',
      groupId: tournamentData.groupId,
      tournamentId: tournamentId,
      teams: { top: { players: [] }, bottom: { players: [] } },
      playerNames: {},
      winnerTeamKey: 'tie',
    };
    
    let totalDurationMillis = 0;
    const allPlayerIds = new Set();
    
    // 5. Verarbeite jedes Spiel
    console.log('\n⚡ [PROCESS] Verarbeite Spiele...');
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      console.log(`  - Spiel ${i + 1}: ${game.teamScoresPasse?.top || 0} : ${game.teamScoresPasse?.bottom || 0}`);
      
      totalDurationMillis += game.durationMillis || 0;
      
      // Scores
      summary.finalScores.top += game.teamScoresPasse?.top || 0;
      summary.finalScores.bottom += game.teamScoresPasse?.bottom || 0;
      
      // Winner
      let winnerTeam = 'tie';
      if (game.teamScoresPasse?.top > game.teamScoresPasse?.bottom) {
        winnerTeam = 'top';
        summary.gameWinsByTeam.top++;
      } else if (game.teamScoresPasse?.bottom > game.teamScoresPasse?.top) {
        winnerTeam = 'bottom';
        summary.gameWinsByTeam.bottom++;
      } else {
        summary.gameWinsByTeam.ties++;
      }
      
      // Teams für dieses Spiel
      const topPlayers = [];
      const bottomPlayers = [];
      
      for (const player of game.playerDetails || []) {
        const playerDocId = await getPlayerDocId(player.playerId);
        allPlayerIds.add(playerDocId);
        
        const playerInfo = {
          playerId: playerDocId,
          displayName: player.playerName
        };
        
        if (player.team === 'top') {
          topPlayers.push(playerInfo);
          summary.sessionTotalWeisPoints.top += player.weisInPasse || 0;
        } else {
          bottomPlayers.push(playerInfo);
          summary.sessionTotalWeisPoints.bottom += player.weisInPasse || 0;
        }
        
        // Player Wins/Losses
        if (!summary.gameWinsByPlayer[playerDocId]) {
          summary.gameWinsByPlayer[playerDocId] = { wins: 0, losses: 0 };
        }
        
        if (winnerTeam === player.team) {
          summary.gameWinsByPlayer[playerDocId].wins++;
        } else if (winnerTeam !== 'tie') {
          summary.gameWinsByPlayer[playerDocId].losses++;
        }
      }
      
      // Game Result mit korrekten Daten
      summary.gameResults.push({
        gameNumber: i + 1,
        topScore: game.teamScoresPasse?.top || 0,
        bottomScore: game.teamScoresPasse?.bottom || 0,
        winnerTeam: winnerTeam,
        teams: {
          top: { players: topPlayers },
          bottom: { players: bottomPlayers }
        },
        finalStriche: game.teamStrichePasse || { top: {}, bottom: {} },
        durationSeconds: Math.round((game.durationMillis || 0) / 1000),
        completedAt: game.completedAt,
      });
      
      // Striche aggregieren
      if (game.teamStrichePasse) {
        for (const team of ['top', 'bottom']) {
          const teamStriche = game.teamStrichePasse[team];
          if (teamStriche) {
            for (const [key, value] of Object.entries(teamStriche)) {
              if (summary.finalStriche[team][key] !== undefined) {
                summary.finalStriche[team][key] += value || 0;
                summary.eventCounts[team][key] += value || 0;
              }
            }
          }
        }
      }
    }
    
    // 6. Finalisiere Summary
    summary.participantPlayerIds = Array.from(allPlayerIds);
    summary.durationSeconds = Math.round(totalDurationMillis / 1000);
    
    // Teams aus erstem Spiel
    if (games[0]?.playerDetails) {
      const firstGame = games[0];
      const topPlayers = [];
      const bottomPlayers = [];
      
      for (const player of firstGame.playerDetails) {
        const playerDocId = await getPlayerDocId(player.playerId);
        const playerInfo = {
          playerId: playerDocId,
          displayName: player.playerName
        };
        
        if (player.team === 'top') {
          topPlayers.push(playerInfo);
        } else {
          bottomPlayers.push(playerInfo);
        }
      }
      
      summary.teams = {
        top: { players: topPlayers },
        bottom: { players: bottomPlayers }
      };
    }
    
    // Winner
    if (summary.finalScores.top > summary.finalScores.bottom) {
      summary.winnerTeamKey = 'top';
    } else if (summary.finalScores.bottom > summary.finalScores.top) {
      summary.winnerTeamKey = 'bottom';
    } else {
      summary.winnerTeamKey = 'tie';
    }
    
    // 7. Speichere das neue Dokument
    console.log('\n💾 [SAVE] Speichere JassGameSummary...');
    const newDocRef = await db.collection('jassGameSummaries').add(summary);
    
    console.log(`✅ SUCCESS: Neues Tournament-Summary erstellt: ${newDocRef.id}`);
    console.log(`  - GameResults: ${summary.gameResults.length} Spiele`);
    console.log(`  - Participants: ${summary.participantPlayerIds.length} Spieler`);
    console.log(`  - Game-Level finalStriche: ${!!summary.gameResults[0]?.finalStriche}`);
    console.log(`  - Game-Level durationSeconds: ${!!summary.gameResults[0]?.durationSeconds}`);
    
    // 8. Triggere Player Stats Update
    console.log('\n🔄 [STATS] Triggere Player Stats Update...');
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    
    for (const playerId of summary.participantPlayerIds) {
      try {
        await updatePlayerStats(playerId);
        console.log(`  ✅ Stats updated for player: ${playerId}`);
      } catch (error) {
        console.log(`  ❌ Stats update failed for player ${playerId}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler bei einfacher Tournament-Aggregation:', error);
  }
}

simpleTournamentFix().then(() => {
  console.log('\n🏁 Einfache Tournament-Aggregation abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 