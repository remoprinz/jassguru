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

async function finalCleanTournamentFix() {
  console.log('🚀 [FINAL] Starte FINALE Tournament-Bereinigung...');
  console.log('❌ ENTFERNT: Session-Level eventCounts (sinnlos bei wechselnden Teams)');
  console.log('✅ BEHÄLT: Nur gameResults mit per-Spiel Daten');
  
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
    
    // 4. Erstelle MINIMALE Tournament-Summary (NUR relevante Felder)
    console.log('\n📝 [CREATE] Erstelle MINIMALE Tournament-Summary...');
    
    const minimalSummary = {
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
      
      // ❌ EXPLIZIT ENTFERNT für Tournaments:
      // eventCounts: SINNLOS bei wechselnden Teams
      // finalScores: SINNLOS bei wechselnden Teams  
      // finalStriche: SINNLOS bei wechselnden Teams
      // teams: SINNLOS bei wechselnden Teams
      // winnerTeamKey: SINNLOS bei wechselnden Teams
      // gameWinsByPlayer: Kann aus gameResults berechnet werden
      // gameWinsByTeam: SINNLOS bei wechselnden Teams
      // sessionTotalWeisPoints: Nicht relevant für Tournaments
      // playerNames: Deprecated
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
      
      // ✅ NUR gameResults befüllen - DAS IST DAS EINZIG WICHTIGE!
      minimalSummary.gameResults.push({
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
    minimalSummary.participantPlayerIds = Array.from(allPlayerIds);
    minimalSummary.durationSeconds = Math.round(totalDurationMillis / 1000);
    
    // 7. Speichere das MINIMALE Dokument
    console.log('\n💾 [SAVE] Speichere MINIMALE Tournament-Summary...');
    const newDocRef = await db.collection('jassGameSummaries').add(minimalSummary);
    
    console.log(`✅ SUCCESS: MINIMALE Tournament-Summary erstellt: ${newDocRef.id}`);
    console.log(`\n📊 [STRUCTURE] MINIMALE Struktur:`);
    console.log(`  ✅ gameResults: ${minimalSummary.gameResults.length} Spiele (DAS WICHTIGSTE!)`);
    console.log(`  ✅ participantPlayerIds: ${minimalSummary.participantPlayerIds.length} Spieler`);
    console.log(`  ✅ gamesPlayed: ${minimalSummary.gamesPlayed}`);
    console.log(`  ✅ durationSeconds: ${minimalSummary.durationSeconds}`);
    console.log(`  ✅ tournamentId: ${minimalSummary.tournamentId}`);
    console.log(`  ❌ eventCounts: ENTFERNT (irreführend bei wechselnden Teams)`);
    console.log(`  ❌ finalScores: ENTFERNT (irreführend bei wechselnden Teams)`);
    console.log(`  ❌ finalStriche: ENTFERNT (irreführend bei wechselnden Teams)`);
    console.log(`  ❌ teams: ENTFERNT (irreführend bei wechselnden Teams)`);
    console.log(`  ❌ winnerTeamKey: ENTFERNT (irreführend bei wechselnden Teams)`);
    
    // 8. Triggere Player Stats Update
    console.log('\n🔄 [STATS] Triggere Player Stats Update...');
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    
    for (const playerId of minimalSummary.participantPlayerIds) {
      try {
        await updatePlayerStats(playerId);
        console.log(`  ✅ Stats updated for player: ${playerId}`);
      } catch (error) {
        console.log(`  ❌ Stats update failed for player ${playerId}:`, error.message);
      }
    }
    
    console.log('\n🎯 [RESULT] Tournament-Summary ist jetzt MINIMAL und KORREKT:');
    console.log(`  - KEINE irreführenden Session-Level Daten mehr`);
    console.log(`  - NUR gameResults mit korrekten per-Spiel Teams`);
    console.log(`  - Calculator können klar zwischen Tournament/Session unterscheiden`);
    console.log(`  - Tournaments = NUR gameResults, Sessions = Session-Level + gameResults`);
    
  } catch (error) {
    console.error('❌ Fehler bei finaler Tournament-Bereinigung:', error);
  }
}

finalCleanTournamentFix().then(() => {
  console.log('\n🏁 Finale Tournament-Bereinigung abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 