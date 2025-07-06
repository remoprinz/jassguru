const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function repairJuly3Session() {
  console.log('🔧 [REPAIR] Repariere Juli-3-Session...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk';
  const activeGameIds = [
    'BddFeTmedf7hipTcMcGk',
    'viQQv1biZzrahe1iQ4Cd', 
    'KqErTLHxrfe5IMQKAGTW'
  ];
  
  try {
    // 1. Hole die Session-Daten
    console.log('📋 Lade Session-Daten...');
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      console.log('❌ Session nicht gefunden!');
      return;
    }
    
    const sessionData = sessionDoc.data();
    console.log('✅ Session gefunden');
    console.log(`📊 Aktuelle gamesPlayed: ${sessionData.gamesPlayed || 0}`);
    
    // 2. Hole alle drei aktiven Spiele
    console.log('\n🎮 Lade aktive Spiele...');
    const activeGames = [];
    
    for (const gameId of activeGameIds) {
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameDoc = await gameRef.get();
      
      if (gameDoc.exists) {
        const gameData = gameDoc.data();
        console.log(`✅ Spiel ${gameId}: Status=${gameData.status}, Runden=${gameData.currentRound}`);
        activeGames.push({ id: gameId, data: gameData });
      } else {
        console.log(`❌ Spiel ${gameId} nicht gefunden!`);
      }
    }
    
    if (activeGames.length === 0) {
      console.log('❌ Keine aktiven Spiele gefunden!');
      return;
    }
    
    console.log(`📊 ${activeGames.length} Spiele geladen`);
    
    // 3. Konvertiere activeGames zu completedGames
    console.log('\n📝 Konvertiere zu completedGames...');
    const completedGames = [];
    
    activeGames.forEach((game, index) => {
      const gameNumber = index + 1;
      const gameData = game.data;
      
      // Extrahiere relevante Daten
      const completedGame = {
        gameNumber: gameNumber,
        activeGameId: game.id,
        finalScores: gameData.finalScores || { top: 0, bottom: 0 },
        finalStriche: gameData.finalStriche || { 
          top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        },
        sessionId: sessionId,
        completedAt: gameData.completedAt || gameData.timestampCompleted || admin.firestore.Timestamp.now(),
        durationMillis: gameData.durationMillis || 0,
        roundHistory: gameData.roundHistory || [],
        weisPoints: gameData.weisPoints || { top: 0, bottom: 0 },
        trumpf: gameData.trumpf || '',
        winnerTeam: gameData.winnerTeam || (
          (gameData.finalScores?.top || 0) > (gameData.finalScores?.bottom || 0) ? 'top' : 'bottom'
        ),
        playerNames: gameData.playerNames || {},
        participantUids: gameData.participantUids || [],
        groupId: gameData.groupId || sessionData.gruppeId || null
      };
      
      completedGames.push(completedGame);
      
      console.log(`✅ Spiel ${gameNumber}: ${completedGame.finalScores.top} - ${completedGame.finalScores.bottom} (${completedGame.winnerTeam} gewinnt)`);
    });
    
    // 4. Schreibe completedGames in die Subcollection
    console.log('\n💾 Schreibe completedGames...');
    const summaryDocRef = db.collection('jassGameSummaries').doc(sessionId);
    const completedGamesColRef = summaryDocRef.collection('completedGames');
    
    const batch = db.batch();
    
    completedGames.forEach(game => {
      const gameDocRef = completedGamesColRef.doc(String(game.gameNumber));
      batch.set(gameDocRef, game);
    });
    
    await batch.commit();
    console.log('✅ CompletedGames geschrieben');
    
    // 5. Erstelle initialSessionData für finalizeSession
    console.log('\n🔄 Bereite finalizeSession vor...');
    
    // Ermittle participantPlayerIds aus den Spiel-Daten
    const playerNames = activeGames[0].data.playerNames || {};
    const participantUids = activeGames[0].data.participantUids || [];
    
    // Versuche Player-IDs zu ermitteln (falls vorhanden)
    let participantPlayerIds = [];
    
    // Prüfe ob Player-IDs bereits in den Spieldaten sind
    if (activeGames[0].data.participantPlayerIds) {
      participantPlayerIds = activeGames[0].data.participantPlayerIds;
    } else {
      // Fallback: Verwende UIDs (muss später konvertiert werden)
      participantPlayerIds = participantUids;
      console.log('⚠️  Verwende UIDs als Player-IDs (sollte später konvertiert werden)');
    }
    
    const initialSessionData = {
      participantUids: participantUids,
      participantPlayerIds: participantPlayerIds,
      playerNames: playerNames,
      teams: sessionData.teams || null,
      gruppeId: sessionData.gruppeId || null,
      startedAt: sessionData.startedAt || admin.firestore.Timestamp.now(),
      notes: sessionData.notes || []
    };
    
    console.log('📋 InitialSessionData erstellt:');
    console.log(`  Spieler: ${JSON.stringify(playerNames)}`);
    console.log(`  UIDs: ${participantUids.length}`);
    console.log(`  Player-IDs: ${participantPlayerIds.length}`);
    
    // 6. Simuliere finalizeSession-Logik
    console.log('\n🚀 Führe finalizeSession-Logik aus...');
    
    // Aggregiere Daten
    let totalPointsTop = 0;
    let totalPointsBottom = 0;
    const totalStricheTop = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalStricheBottom = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalWeisPoints = { top: 0, bottom: 0 };
    let totalDurationMillis = 0;
    
    const gameResults = [];
    const gameWinsByTeam = { top: 0, bottom: 0 };
    
    completedGames.forEach(game => {
      totalPointsTop += game.finalScores.top;
      totalPointsBottom += game.finalScores.bottom;
      totalDurationMillis += game.durationMillis;
      
      totalWeisPoints.top += game.weisPoints.top;
      totalWeisPoints.bottom += game.weisPoints.bottom;
      
      // Striche aggregieren
      Object.keys(totalStricheTop).forEach(key => {
        totalStricheTop[key] += game.finalStriche.top[key] || 0;
        totalStricheBottom[key] += game.finalStriche.bottom[key] || 0;
      });
      
      // Game Results
      gameResults.push({
        gameNumber: game.gameNumber,
        winnerTeam: game.winnerTeam,
        topScore: game.finalScores.top,
        bottomScore: game.finalScores.bottom
      });
      
      gameWinsByTeam[game.winnerTeam]++;
    });
    
    // Gewinner bestimmen
    const winnerTeamKey = gameWinsByTeam.top > gameWinsByTeam.bottom ? 'top' : 
                         gameWinsByTeam.bottom > gameWinsByTeam.top ? 'bottom' : 'draw';
    
    // 7. Schreibe finalisierte Session
    const now = admin.firestore.Timestamp.now();
    const sessionSummary = {
      sessionId: sessionId,
      status: 'completed',
      createdAt: initialSessionData.startedAt,
      startedAt: initialSessionData.startedAt,
      endedAt: now,
      durationSeconds: Math.round(totalDurationMillis / 1000),
      gamesPlayed: completedGames.length,
      finalScores: { top: totalPointsTop, bottom: totalPointsBottom },
      finalStriche: { top: totalStricheTop, bottom: totalStricheBottom },
      sessionTotalWeisPoints: totalWeisPoints,
      participantUids: participantUids,
      participantPlayerIds: participantPlayerIds,
      playerNames: playerNames,
      teams: initialSessionData.teams,
      groupId: initialSessionData.gruppeId,
      winnerTeamKey: winnerTeamKey,
      gameResults: gameResults,
      gameWinsByTeam: gameWinsByTeam,
      notes: initialSessionData.notes || ['Manuell repariert am ' + new Date().toLocaleString('de-CH')]
    };
    
    await summaryDocRef.set(sessionSummary, { merge: true });
    console.log('✅ Session finalisiert');
    
    // 8. Update Session-Dokument
    await sessionRef.update({
      status: 'completed',
      gamesPlayed: completedGames.length,
      currentActiveGameId: null,
      lastActivity: now
    });
    console.log('✅ Session-Dokument aktualisiert');
    
    // 9. Lösche activeGames (nur als Option)
    console.log('\n🗑️  Möchten Sie die activeGames löschen? (werden normalerweise automatisch gelöscht)');
    console.log('   Spiel-IDs:');
    activeGameIds.forEach(id => console.log(`   - ${id}`));
    
    console.log('\n🎉 REPARATUR ABGESCHLOSSEN!');
    console.log(`✅ ${completedGames.length} Spiele finalisiert`);
    console.log(`✅ Session ${sessionId} abgeschlossen`);
    console.log(`✅ JassGameSummary erstellt`);
    console.log(`🏆 Gewinner: ${winnerTeamKey.toUpperCase()} Team`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Reparatur:', error);
  }
  
  process.exit(0);
}

repairJuly3Session().catch(console.error); 