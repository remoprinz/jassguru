const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

/**
 * Manuelles Script um eine fehlgeschlagene Session zu reparieren und abzuschließen
 * Für die Session vom 19. Juni 2025 mit 3 Spielen
 */
async function debugAllSessions() {
  console.log('🔍 Analyzing all sessions to find the target...');
  
  try {
    const sessionsSnapshot = await db.collection('sessions').get();
    console.log(`📊 Found ${sessionsSnapshot.size} total sessions`);
    
    let sessionsWithGames = [];
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Get completed games count
      const completedGamesSnapshot = await db
        .collection('sessions')
        .doc(sessionId)
        .collection('completedGames')
        .get();
      
      const completedGamesCount = completedGamesSnapshot.size;
      
      if (completedGamesCount > 0) {
        sessionsWithGames.push({
          id: sessionId,
          status: sessionData.status,
          completedGamesCount,
          participantPlayerIds: sessionData.participantPlayerIds || [],
          participants: sessionData.participants || [],
          createdAt: sessionData.createdAt?.toDate?.() || 'Unknown',
          teams: sessionData.teams || null
        });
      }
    }
    
    // Sort by creation date (newest first)
    sessionsWithGames.sort((a, b) => {
      if (a.createdAt === 'Unknown' || b.createdAt === 'Unknown') return 0;
      return b.createdAt - a.createdAt;
    });
    
    console.log('\n📋 Sessions with completed games:');
    sessionsWithGames.forEach((session, index) => {
      console.log(`\n${index + 1}. Session ID: ${session.id}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Completed Games: ${session.completedGamesCount}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Participant Player IDs: ${JSON.stringify(session.participantPlayerIds)}`);
      console.log(`   Participants: ${JSON.stringify(session.participants)}`);
      console.log(`   Teams: ${session.teams ? 'Present' : 'Missing'}`);
    });
    
    // Show all sessions, even without completed games
    console.log('\n📋 ALL Sessions (including those without completed games):');
    const allSessionsSnapshot = await db.collection('sessions').get();
    for (const sessionDoc of allSessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      console.log(`\nSession ID: ${sessionDoc.id}`);
      console.log(`   Status: ${sessionData.status}`);
      console.log(`   Created: ${sessionData.createdAt?.toDate?.() || 'Unknown'}`);
      if (sessionData.participantPlayerIds) {
        console.log(`   Participant Player IDs: ${JSON.stringify(sessionData.participantPlayerIds)}`);
      }
      if (sessionData.participantUids) {
        console.log(`   Participant UIDs: ${JSON.stringify(sessionData.participantUids)}`);
      }
      if (sessionData.participants) {
        console.log(`   Participants: ${JSON.stringify(sessionData.participants)}`);
      }
    }
    
    // Look for sessions with Remo's UID that might have completed games
    const remoUID = 'AaTUBO0SbWVfStdHmD7zi3qAMww2';
    
    console.log('\n🎯 Checking for completed games in sessions with Remo...');
    const sessionsWithRemo = allSessionsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.participantUids && data.participantUids.includes(remoUID);
    });
    
    const sessionsWithRemoAndGames = [];
    for (const sessionDoc of sessionsWithRemo) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Check completed games
      const completedGamesSnapshot = await db
        .collection('sessions')
        .doc(sessionId)
        .collection('completedGames')
        .get();
      
      if (completedGamesSnapshot.size > 0) {
        sessionsWithRemoAndGames.push({
          id: sessionId,
          status: sessionData.status,
          completedGamesCount: completedGamesSnapshot.size,
          participantUIDs: sessionData.participantUids,
          participantPlayerIds: sessionData.participantPlayerIds,
          createdAt: sessionData.createdAt?.toDate?.() || 'Unknown'
        });
      }
    }
    
    console.log(`\n📊 Found ${sessionsWithRemoAndGames.length} sessions with Remo and completed games:`);
    sessionsWithRemoAndGames.forEach((session, index) => {
      console.log(`\n${index + 1}. Session ID: ${session.id}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Completed Games: ${session.completedGamesCount}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Participant UIDs: ${JSON.stringify(session.participantUIDs)}`);
    });
    
    const potentialSessions = sessionsWithRemoAndGames;
    
    if (potentialSessions.length > 0) {
      console.log(`\n✅ Found ${potentialSessions.length} potential target session(s):`);
      potentialSessions.forEach((session, index) => {
        console.log(`\n${index + 1}. Session ID: ${session.id}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Completed Games: ${session.completedGamesCount}`);
        console.log(`   Created: ${session.createdAt}`);
        console.log(`   Teams: ${session.teams ? 'Present' : 'Missing'}`);
      });
      
      // Show the most recent one with 3 games
      const threeGameSessions = potentialSessions.filter(s => s.completedGamesCount === 3);
      if (threeGameSessions.length > 0) {
        console.log(`\n🎯 Sessions with exactly 3 games: ${threeGameSessions.length}`);
        const mostRecent = threeGameSessions[0];
        console.log(`\nMost recent 3-game session: ${mostRecent.id}`);
        console.log(`Status: ${mostRecent.status}`);
        console.log(`Created: ${mostRecent.createdAt}`);
      }
    } else {
      console.log('\n❌ No sessions found with the target UIDs');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing sessions:', error);
  }
}

async function manualFixSession() {
  console.log('🔧 Starting manual session fix and finalization...');
  
  // First run debug analysis
  await debugAllSessions();
  
  console.log('\n✅ Debug analysis completed');
}

async function fixSpecificSession() {
  console.log('🔧 Starting manual fix for session 83fBU_l0Rcok3a_DRt0-Z...');
  
  const targetSessionId = '83fBU_l0Rcok3a_DRt0-Z';
  
  try {
    // 1. Lade die Session-Daten aus der sessions Collection
    console.log('📥 Loading session data from sessions collection...');
    const sessionRef = db.collection('sessions').doc(targetSessionId);
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists) {
      console.error('❌ Session not found in sessions collection!');
      return;
    }
    
    const sessionData = sessionSnap.data();
    console.log(`✅ Session loaded. Current status: ${sessionData.status || 'undefined'}`);
    
    // 2. Lade alle completed games aus der ACTIVEGAMES collection!
    console.log('🎮 Loading completed games from activeGames collection...');
    const completedGamesSnap = await db.collection('activeGames')
      .where('sessionId', '==', targetSessionId)
      .where('status', '==', 'completed')
      .get();
    
    console.log(`📊 Found ${completedGamesSnap.size} completed games in activeGames collection`);
    
    if (completedGamesSnap.size === 0) {
      console.log('❌ No completed games found. Nothing to finalize.');
      return;
    }
    
    // Debug: Zeige alle gefundenen Spiele
    completedGamesSnap.docs.forEach(doc => {
      const gameData = doc.data();
      console.log(`   Game ${doc.id}: gameNumber=${gameData.currentGameNumber}, scores=${JSON.stringify(gameData.scores)}`);
    });
    
    // Konvertiere activeGames zu completedGames Format
    const completedGames = completedGamesSnap.docs.map(doc => {
      const gameData = doc.data();
      
      // Extrahiere roundHistory aus dem activeGame (falls vorhanden)
      let roundHistory = [];
      // ActiveGames haben möglicherweise eine andere Struktur für Runden
      
      return {
        gameNumber: gameData.currentGameNumber,
        finalScores: gameData.scores, // scores statt finalScores in activeGames
        finalStriche: gameData.striche, // striche statt finalStriche
        eventCounts: {
          top: { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        }, // Wird unten neu berechnet
        weisPoints: gameData.weisPoints || { top: 0, bottom: 0 },
        initialStartingPlayer: gameData.initialStartingPlayer,
        activeGameId: doc.id,
        participantUids: gameData.participantUids,
        playerNames: gameData.playerNames,
        groupId: gameData.groupId,
        timestampCompleted: gameData.lastUpdated, // lastUpdated als Completion Time
        durationMillis: 0, // Wird unten berechnet falls möglich
        roundHistory: roundHistory
      };
    });
    
    // Sortiere nach gameNumber
    completedGames.sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0));
    console.log(`✅ Found and converted ${completedGames.length} completed games`);
    
    // 3. Verwende die vorhandenen Daten aus der Session
    const participantPlayerIds = sessionData.participantPlayerIds;
    const participantUids = sessionData.participantUids;
    const playerNames = sessionData.playerNames;
    
    console.log('👥 Participants:');
    console.log(`   Player IDs: ${JSON.stringify(participantPlayerIds)}`);
    console.log(`   UIDs: ${JSON.stringify(participantUids)}`);
    console.log(`   Names: ${JSON.stringify(playerNames)}`);
    
    // 4. Erstelle Teams-Struktur exakt wie in finalizeSession.ts
    console.log('🏗️ Building teams structure...');
    const teams = {
      top: {
        players: [
          { playerId: participantPlayerIds[0], displayName: playerNames[1] }, // Remo
          { playerId: participantPlayerIds[2], displayName: playerNames[3] }  // Schmuuuudii
        ]
      },
      bottom: {
        players: [
          { playerId: participantPlayerIds[1], displayName: playerNames[2] }, // Claudia
          { playerId: participantPlayerIds[3], displayName: playerNames[4] }  // Michael
        ]
      }
    };
    
    console.log(`✅ Teams: Top (${teams.top.players.map(p => p.displayName).join(' + ')}) vs Bottom (${teams.bottom.players.map(p => p.displayName).join(' + ')})`);
    
    // 5. Player Number to ID Mapping (für Rosen10player)
    const playerNumberToIdMap = new Map();
    participantPlayerIds.forEach((playerId, index) => {
      playerNumberToIdMap.set(index + 1, playerId); // PlayerNumber ist 1-basiert
    });
    
    // 6. Aggregiere alle Spiel-Daten EXAKT wie finalizeSession.ts
    console.log('📊 Aggregating game data...');
    let totalPointsTop = 0;
    let totalPointsBottom = 0;
    const totalStricheTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalStricheBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalEventCountsTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalEventCountsBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const sessionTotalWeisPoints = { top: 0, bottom: 0 };
    let totalDurationMillis = 0;
    let sessionTotalRounds = 0;
    
    // Neue Statistik-Felder
    const gameResults = [];
    const gameWinsByTeam = { top: 0, bottom: 0 };
    const gameWinsByPlayer = {};
    participantPlayerIds.forEach(playerId => {
      gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
    });
    
    completedGames.forEach(game => {
      console.log(`🎯 Processing game ${game.gameNumber}...`);
      
      // Punkte aggregieren
      totalPointsTop += game.finalScores?.top || 0;
      totalPointsBottom += game.finalScores?.bottom || 0;
      totalDurationMillis += game.durationMillis || 0;
      
      // Weis-Punkte aggregieren
      if (game.weisPoints) {
        sessionTotalWeisPoints.top += game.weisPoints.top || 0;
        sessionTotalWeisPoints.bottom += game.weisPoints.bottom || 0;
      }
      
      // Striche aggregieren (aus finalStriche)
      if (game.finalStriche) {
        Object.keys(totalStricheTop).forEach(key => {
          totalStricheTop[key] += game.finalStriche.top?.[key] || 0;
          totalStricheBottom[key] += game.finalStriche.bottom?.[key] || 0;
        });
      }
      
      // Event Counts aus finalStriche berechnen (vereinfacht, da wir keine roundHistory haben)
      const gameBottomEvents = { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      const gameTopEvents = { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };

      if (game.finalStriche) {
        // Übertrage die Striche direkt zu Events (vereinfacht)
        gameBottomEvents.sieg = game.finalStriche.bottom.sieg > 0 ? 1 : 0;
        gameTopEvents.sieg = game.finalStriche.top.sieg > 0 ? 1 : 0;
        gameBottomEvents.berg = game.finalStriche.bottom.berg > 0 ? 1 : 0;
        gameTopEvents.berg = game.finalStriche.top.berg > 0 ? 1 : 0;
        gameBottomEvents.matsch = game.finalStriche.bottom.matsch;
        gameTopEvents.matsch = game.finalStriche.top.matsch;
        gameBottomEvents.schneider = game.finalStriche.bottom.schneider > 0 ? 1 : 0;
        gameTopEvents.schneider = game.finalStriche.top.schneider > 0 ? 1 : 0;
        gameBottomEvents.kontermatsch = game.finalStriche.bottom.kontermatsch;
        gameTopEvents.kontermatsch = game.finalStriche.top.kontermatsch;
      }
      
      // Events zur Session-Summe addieren
      totalEventCountsTop.sieg += gameTopEvents.sieg;
      totalEventCountsTop.berg += gameTopEvents.berg;
      totalEventCountsTop.matsch += gameTopEvents.matsch;
      totalEventCountsTop.kontermatsch += gameTopEvents.kontermatsch;
      totalEventCountsTop.schneider += gameTopEvents.schneider;

      totalEventCountsBottom.sieg += gameBottomEvents.sieg;
      totalEventCountsBottom.berg += gameBottomEvents.berg;
      totalEventCountsBottom.matsch += gameBottomEvents.matsch;
      totalEventCountsBottom.kontermatsch += gameBottomEvents.kontermatsch;
      totalEventCountsBottom.schneider += gameBottomEvents.schneider;
      
      // Update eventCounts in game object
      game.eventCounts = { top: gameTopEvents, bottom: gameBottomEvents };
      
      // Spiel-Ergebnisse für Statistiken
      if (game.finalScores && typeof game.gameNumber === 'number') {
        const topScore = game.finalScores.top || 0;
        const bottomScore = game.finalScores.bottom || 0;
        let winnerTeam = topScore > bottomScore ? 'top' : 'bottom';
        
        gameResults.push({
          gameNumber: game.gameNumber,
          winnerTeam,
          topScore,
          bottomScore
        });
        
        gameWinsByTeam[winnerTeam]++;
        
        // Spieler-Wins/Losses
        if (winnerTeam === 'top') {
          teams.top.players.forEach(p => gameWinsByPlayer[p.playerId].wins++);
          teams.bottom.players.forEach(p => gameWinsByPlayer[p.playerId].losses++);
        } else {
          teams.bottom.players.forEach(p => gameWinsByPlayer[p.playerId].wins++);
          teams.top.players.forEach(p => gameWinsByPlayer[p.playerId].losses++);
        }
      }
    });
    
    // 7. Bestimme Gewinner basierend auf Siegen
    let winnerTeamKey = 'draw';
    if (totalEventCountsTop.sieg > totalEventCountsBottom.sieg) {
      winnerTeamKey = 'top';
    } else if (totalEventCountsBottom.sieg > totalEventCountsTop.sieg) {
      winnerTeamKey = 'bottom';
    }
    
    // 8. Bestimme Rosen10player aus dem ersten Spiel
    let sessionRosen10player = null;
    if (completedGames.length > 0) {
      const firstGame = completedGames[0];
      const rosen10PlayerNumber = firstGame.initialStartingPlayer;
      if (rosen10PlayerNumber && playerNumberToIdMap.has(rosen10PlayerNumber)) {
        sessionRosen10player = playerNumberToIdMap.get(rosen10PlayerNumber);
      }
    }
    
    console.log(`📈 Game Summary:`);
    console.log(`   Games played: ${completedGames.length}`);
    console.log(`   Final scores: Top ${totalPointsTop} - Bottom ${totalPointsBottom}`);
    console.log(`   Siege: Top ${totalEventCountsTop.sieg} - Bottom ${totalEventCountsBottom.sieg}`);
    console.log(`   Winner: ${winnerTeamKey}`);
    console.log(`   Game wins: Top ${gameWinsByTeam.top} - Bottom ${gameWinsByTeam.bottom}`);
    console.log(`   Rosen10player: ${sessionRosen10player}`);
    
    // 9. Erstelle das finale Dokument in jassGameSummaries
    console.log('💾 Creating final document in jassGameSummaries collection...');
    const now = admin.firestore.Timestamp.now();
    const sessionDurationSeconds = Math.round(totalDurationMillis / 1000);
    
    const finalDocumentData = {
      // Basis-Felder
      createdAt: sessionData.createdAt || now,
      startedAt: sessionData.startedAt || now,
      endedAt: now,
      lastActivity: now,
      status: "completed",
      
      // Spiel-Daten
      gamesPlayed: completedGames.length,
      durationSeconds: sessionDurationSeconds > 0 ? sessionDurationSeconds : 0,
      
      // Ergebnisse
      finalScores: { top: totalPointsTop, bottom: totalPointsBottom },
      finalStriche: { top: totalStricheTop, bottom: totalStricheBottom },
      eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
      sessionTotalWeisPoints: sessionTotalWeisPoints,
      
      // Teilnehmer
      participantUids: participantUids || [],
      participantPlayerIds: participantPlayerIds,
      playerNames: playerNames,
      teams: teams,
      
      // Gruppe
      groupId: sessionData.groupId,
      
      // Winner
      winnerTeamKey: winnerTeamKey,
      
      // Neue Statistik-Felder
      gameResults: gameResults.sort((a, b) => a.gameNumber - b.gameNumber),
      gameWinsByTeam: gameWinsByTeam,
      gameWinsByPlayer: gameWinsByPlayer,
      
      // Notizen
      notes: ['Manually finalized after failed automatic finalization from activeGames']
    };
    
    // Conditional properties hinzufügen
    if (sessionRosen10player) {
      finalDocumentData.Rosen10player = sessionRosen10player;
    }
    
    // 10. Schreibe das Dokument in jassGameSummaries
    console.log('✍️ Writing final document to jassGameSummaries collection...');
    const summaryDocRef = db.collection('jassGameSummaries').doc(targetSessionId);
    await summaryDocRef.set(finalDocumentData, { merge: true });
    console.log(`✅ Session ${targetSessionId} successfully written to jassGameSummaries!`);
    
    // 11. KOPIERE completedGames von activeGames zu jassGameSummaries/completedGames
    console.log('📁 Copying completed games to jassGameSummaries subcollection...');
    const targetCompletedGamesRef = db.collection('jassGameSummaries').doc(targetSessionId).collection('completedGames');
    
    for (const game of completedGames) {
      const gameData = {
        ...game,
        // Stelle sicher, dass alle nötigen Felder da sind
        gameNumber: game.gameNumber,
        finalScores: game.finalScores,
        finalStriche: game.finalStriche,
        eventCounts: game.eventCounts,
        weisPoints: game.weisPoints,
        activeGameId: game.activeGameId,
        timestampCompleted: game.timestampCompleted,
        participantUids: game.participantUids,
        playerNames: game.playerNames,
        groupId: game.groupId,
        initialStartingPlayer: game.initialStartingPlayer
      };
      
      await targetCompletedGamesRef.doc(String(game.gameNumber)).set(gameData);
      console.log(`   ✅ Copied game ${game.gameNumber} to /jassGameSummaries/${targetSessionId}/completedGames/${game.gameNumber}`);
    }
    
    // 12. Cleanup: Sessions-Dokument auf completed setzen
    console.log('🧹 Updating sessions document status...');
    await sessionRef.update({
      status: 'completed',
      currentActiveGameId: null,
      lastUpdated: now
    });
    
    // 13. Cleanup: ActiveGames löschen
    console.log('🧹 Cleaning up activeGames...');
    for (const gameDoc of completedGamesSnap.docs) {
      await db.collection('activeGames').doc(gameDoc.id).delete();
      console.log(`   ✅ Deleted activeGame ${gameDoc.id}`);
    }
    
    console.log('\n🎉 Session repair and finalization completed successfully!');
    console.log(`📋 Final results:`);
    console.log(`   Session ID: ${targetSessionId}`);
    console.log(`   Collection: jassGameSummaries (with completedGames subcollection)`);
    console.log(`   Games played: ${completedGames.length}`);
    console.log(`   Winner: ${winnerTeamKey}`);
    console.log(`   Final scores: Top ${totalPointsTop} - Bottom ${totalPointsBottom}`);
    console.log(`   Final siege: Top ${totalEventCountsTop.sieg} - Bottom ${totalEventCountsBottom.sieg}`);
    console.log(`   Paths created:`);
    console.log(`     - /jassGameSummaries/${targetSessionId}`);
    console.log(`     - /jassGameSummaries/${targetSessionId}/completedGames/1`);
    console.log(`     - /jassGameSummaries/${targetSessionId}/completedGames/2`);
    console.log(`     - /jassGameSummaries/${targetSessionId}/completedGames/3`);
    
  } catch (error) {
    console.error('❌ Error during session repair:', error);
    throw error;
  }
}

// Run the script
fixSpecificSession()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }); 