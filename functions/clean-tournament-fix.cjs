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

async function cleanTournamentFix() {
  console.log('🚀 [CLEAN] Starte bereinigte Tournament-Aggregation...');
  
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
    
    // 4. Erstelle BEREINIGTE JassGameSummary (NUR Tournament-relevante Felder)
    console.log('\n📝 [CREATE] Erstelle bereinigte Tournament-Summary...');
    
    const cleanSummary = {
      // ✅ WICHTIGE TOURNAMENT-FELDER
      gameResults: [],
      participantPlayerIds: [],
      gamesPlayed: games.length,
      durationSeconds: 0,
      createdAt: tournamentData.createdAt,
      startedAt: games[0].completedAt,
      endedAt: games[games.length - 1].completedAt,
      status: 'completed',
      groupId: tournamentData.groupId,
      tournamentId: tournamentId,
      
      // ❌ KEINE SESSION-LEVEL FELDER FÜR TOURNAMENTS:
      // finalScores: ENTFERNT (sinnlos bei wechselnden Teams)
      // finalStriche: ENTFERNT (sinnlos bei wechselnden Teams)
      // eventCounts: ENTFERNT (sinnlos bei wechselnden Teams)
      // teams: ENTFERNT (nur vom ersten Spiel, irreführend)
      // winnerTeamKey: ENTFERNT (sinnlos bei wechselnden Teams)
      // playerNames: ENTFERNT (deprecated)
      // sessionTotalWeisPoints: ENTFERNT (nicht relevant für Tournaments)
      // gameWinsByPlayer: ENTFERNT (kann aus gameResults berechnet werden)
      // gameWinsByTeam: ENTFERNT (sinnlos bei wechselnden Teams)
    };
    
    let totalDurationMillis = 0;
    const allPlayerIds = new Set();
    
    // 5. Verarbeite jedes Spiel (NUR gameResults befüllen)
    console.log('\n⚡ [PROCESS] Verarbeite Spiele für gameResults...');
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      console.log(`  - Spiel ${i + 1}: ${game.teamScoresPasse?.top || 0} : ${game.teamScoresPasse?.bottom || 0}`);
      
      totalDurationMillis += game.durationMillis || 0;
      
      // Winner bestimmen
      let winnerTeam = 'tie';
      if (game.teamScoresPasse?.top > game.teamScoresPasse?.bottom) {
        winnerTeam = 'top';
      } else if (game.teamScoresPasse?.bottom > game.teamScoresPasse?.top) {
        winnerTeam = 'bottom';
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
        } else {
          bottomPlayers.push(playerInfo);
        }
      }
      
      // ✅ NUR gameResults befüllen - DAS IST DAS WICHTIGSTE!
      cleanSummary.gameResults.push({
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
    }
    
    // 6. Finalisiere nur die wichtigen Felder
    cleanSummary.participantPlayerIds = Array.from(allPlayerIds);
    cleanSummary.durationSeconds = Math.round(totalDurationMillis / 1000);
    
    // 7. Speichere das BEREINIGTE Dokument
    console.log('\n💾 [SAVE] Speichere bereinigte Tournament-Summary...');
    const newDocRef = await db.collection('jassGameSummaries').add(cleanSummary);
    
    console.log(`✅ SUCCESS: Bereinigte Tournament-Summary erstellt: ${newDocRef.id}`);
    console.log(`\n📊 [STRUCTURE] Bereinigte Struktur:`);
    console.log(`  ✅ gameResults: ${cleanSummary.gameResults.length} Spiele`);
    console.log(`  ✅ participantPlayerIds: ${cleanSummary.participantPlayerIds.length} Spieler`);
    console.log(`  ✅ gamesPlayed: ${cleanSummary.gamesPlayed}`);
    console.log(`  ✅ durationSeconds: ${cleanSummary.durationSeconds}`);
    console.log(`  ✅ tournamentId: ${cleanSummary.tournamentId}`);
    console.log(`  ❌ finalScores: ENTFERNT (irreführend)`);
    console.log(`  ❌ finalStriche: ENTFERNT (irreführend)`);
    console.log(`  ❌ eventCounts: ENTFERNT (irreführend)`);
    console.log(`  ❌ teams: ENTFERNT (irreführend)`);
    console.log(`  ❌ winnerTeamKey: ENTFERNT (irreführend)`);
    
    // 8. Triggere Player Stats Update
    console.log('\n🔄 [STATS] Triggere Player Stats Update...');
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    
    for (const playerId of cleanSummary.participantPlayerIds) {
      try {
        await updatePlayerStats(playerId);
        console.log(`  ✅ Stats updated for player: ${playerId}`);
      } catch (error) {
        console.log(`  ❌ Stats update failed for player ${playerId}:`, error.message);
      }
    }
    
    console.log('\n🎯 [RESULT] Tournament-Summary ist jetzt SAUBER:');
    console.log(`  - Keine irreführenden Session-Level bottom/top Daten`);
    console.log(`  - Nur relevante Tournament-Felder`);
    console.log(`  - gameResults mit korrekten per-Spiel Teams`);
    console.log(`  - Calculator können klar zwischen Tournament/Session unterscheiden`);
    
  } catch (error) {
    console.error('❌ Fehler bei bereinigter Tournament-Aggregation:', error);
  }
}

cleanTournamentFix().then(() => {
  console.log('\n🏁 Bereinigte Tournament-Aggregation abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 