const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function useFinalizeSessionLogic() {
  console.log('🚀 [FINALIZE SESSION] Verwende echte finalizeSession.ts Logik...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk';
  const activeGameIds = [
    'BddFeTmedf7hipTcMcGk',
    'viQQv1biZzrahe1iQ4Cd', 
    'KqErTLHxrfe5IMQKAGTW'
  ];
  
  try {
    // 1. Konvertiere activeGames zu completedGames-Struktur
    console.log('🔄 Konvertiere activeGames zu completedGames...');
    
    const completedGames = [];
    const participantUids = [];
    let playerNames = {};
    let groupId = null;
    
    for (let i = 0; i < activeGameIds.length; i++) {
      const gameId = activeGameIds[i];
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameDoc = await gameRef.get();
      
      if (!gameDoc.exists) {
        console.log(`❌ Spiel ${gameId} nicht gefunden!`);
        continue;
      }
      
      const activeGame = gameDoc.data();
      
      // Sammle gemeinsame Daten vom ersten Spiel
      if (i === 0) {
        participantUids.push(...activeGame.participantUids);
        playerNames = activeGame.playerNames;
        groupId = activeGame.groupId;
      }
      
             // Konvertiere zu completedGame-Struktur
       const completedGame = {
         gameNumber: i + 1,
         
         // ✅ Verwende echte Scores oder 0-0 wenn nicht vorhanden
         finalScores: activeGame.finalScores || activeGame.scores || { top: 0, bottom: 0 },
        
        // ✅ Nutze 'striche' statt 'finalStriche'  
        finalStriche: activeGame.striche || { 
          top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        },
        
        groupId: activeGame.groupId,
        participantUids: activeGame.participantUids,
        playerNames: activeGame.playerNames,
        
        // ✅ Konvertiere teams-Struktur
        teams: activeGame.teams ? {
          top: { 
            playerUids: Array.isArray(activeGame.teams.top) 
              ? activeGame.teams.top.map(playerNum => activeGame.participantUids[playerNum - 1])
              : activeGame.teams.top.players?.map(name => {
                  // Finde UID für diesen Namen
                  const playerNum = Object.keys(activeGame.playerNames).find(num => 
                    activeGame.playerNames[num] === name
                  );
                  return playerNum ? activeGame.participantUids[parseInt(playerNum) - 1] : null;
                }).filter(Boolean) || []
          },
          bottom: { 
            playerUids: Array.isArray(activeGame.teams.bottom) 
              ? activeGame.teams.bottom.map(playerNum => activeGame.participantUids[playerNum - 1])
              : activeGame.teams.bottom.players?.map(name => {
                  // Finde UID für diesen Namen
                  const playerNum = Object.keys(activeGame.playerNames).find(num => 
                    activeGame.playerNames[num] === name
                  );
                  return playerNum ? activeGame.participantUids[parseInt(playerNum) - 1] : null;
                }).filter(Boolean) || []
          }
        } : null,
        
        weisPoints: activeGame.weisPoints || { top: 0, bottom: 0 },
        roundHistory: activeGame.roundHistory || [],
        teamScoreMapping: activeGame.teamScoreMapping || null,
        
        // ✅ Schätze Completion-Zeit
        completedAt: activeGame.completedAt || admin.firestore.Timestamp.now(),
        timestampCompleted: activeGame.timestampCompleted || admin.firestore.Timestamp.now(),
        
        activeGameId: gameId,
        
        // ✅ Schätze Dauer basierend auf Runden
        durationMillis: activeGame.durationMillis || (activeGame.currentRound * 180000), // 3min pro Runde
        
        sessionId: sessionId,
        
                 // ✅ Bestimme Gewinner wie im Original finalizeSession.ts
         winnerTeam: (() => {
           const topSiege = activeGame.striche?.top?.sieg || 0;
           const bottomSiege = activeGame.striche?.bottom?.sieg || 0;
           return topSiege > bottomSiege ? 'top' : 'bottom';
         })(),
        
        gameType: activeGame.gameType || 'standard',
        trumpf: activeGame.trumpf || ''
      };
      
      completedGames.push(completedGame);
      
      console.log(`✅ Spiel ${i + 1}: ${completedGame.finalScores.top} - ${completedGame.finalScores.bottom}`);
      console.log(`   Striche: ${completedGame.finalStriche.top.sieg} - ${completedGame.finalStriche.bottom.sieg}`);
    }
    
    // 2. Konvertiere UIDs zu Player-IDs
    console.log('\n🔄 Konvertiere UIDs zu Player-IDs...');
    
    const participantPlayerIds = [];
    const uidToPlayerIdMap = {};
    
    for (const uid of participantUids) {
      const playersQuery = db.collection('players').where('uid', '==', uid);
      const playersSnapshot = await playersQuery.get();
      
      if (!playersSnapshot.empty) {
        const playerDoc = playersSnapshot.docs[0];
        const playerId = playerDoc.id;
        const playerData = playerDoc.data();
        
        participantPlayerIds.push(playerId);
        uidToPlayerIdMap[uid] = playerId;
        
        console.log(`✅ ${playerData.displayName}: ${uid} → ${playerId}`);
      } else {
        console.log(`❌ Kein Player-Doc für UID ${uid}`);
        participantPlayerIds.push(uid); // Fallback
        uidToPlayerIdMap[uid] = uid;
      }
    }
    
    // 3. Erstelle initialSessionData (wie vom Frontend)
    const initialSessionData = {
      participantPlayerIds: participantPlayerIds,
      participantUids: participantUids,
      playerNames: playerNames,
      teams: null, // Wird später korrekt gesetzt
      gruppeId: groupId,
      startedAt: admin.firestore.Timestamp.fromMillis(Date.now() - (3 * 60 * 60 * 1000)), // 3h früher
      notes: ['Manuell repariert - Juli 3 Session'],
      winnerTeamKey: null // Wird automatisch bestimmt
    };
    
    // 4. Schreibe completedGames in Subcollection
    console.log('\n💾 Schreibe completedGames in Subcollection...');
    const summaryDocRef = db.collection('jassGameSummaries').doc(sessionId);
    const completedGamesColRef = summaryDocRef.collection('completedGames');
    
    const batch = db.batch();
    
    completedGames.forEach(game => {
      // ✅ Aktualisiere participantPlayerIds in jedem Spiel
      game.participantPlayerIds = participantPlayerIds;
      
      const gameDocRef = completedGamesColRef.doc(String(game.gameNumber));
      batch.set(gameDocRef, game);
    });
    
    await batch.commit();
    console.log('✅ CompletedGames in Subcollection geschrieben');
    
    // 5. Jetzt direkt die finalizeSession-Logik ausführen
    console.log('\n🚀 Führe ECHTE finalizeSession-Logik aus...');
    
    // Hier könnten wir die finalizeSession-Funktion direkt importieren und aufrufen
    // Aber da es eine Cloud Function ist, simulieren wir die Logik:
    
    const now = admin.firestore.Timestamp.now();
    const startedAtTimestamp = initialSessionData.startedAt;
    const createdAtTimestamp = now;
    
    // Exakte Aggregation wie in finalizeSession.ts
    let totalPointsTeamTop = 0;
    let totalPointsTeamBottom = 0;
    const totalStricheTopRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalStricheBottomRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const sessionTotalWeisPoints = { top: 0, bottom: 0 };
    const totalEventCountsTop = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
    const totalEventCountsBottom = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
    let totalGameDurationMillis = 0;
    
    completedGames.forEach(game => {
      totalPointsTeamTop += game.finalScores?.top || 0;
      totalPointsTeamBottom += game.finalScores?.bottom || 0;
      totalGameDurationMillis += game.durationMillis || 0;
      
      if (game.weisPoints) {
        sessionTotalWeisPoints.top += game.weisPoints.top || 0;
        sessionTotalWeisPoints.bottom += game.weisPoints.bottom || 0;
      }
      
      if (game.finalStriche) {
        Object.keys(totalStricheTopRecord).forEach(key => {
          totalStricheTopRecord[key] += game.finalStriche.top?.[key] || 0;
          totalStricheBottomRecord[key] += game.finalStriche.bottom?.[key] || 0;
        });
      }
      
      // Event-Counts NEU berechnen
      if (game.finalStriche) {
        if (game.finalStriche.bottom.sieg > 0) totalEventCountsBottom.sieg += 1;
        if (game.finalStriche.top.sieg > 0) totalEventCountsTop.sieg += 1;
        if (game.finalStriche.bottom.berg > 0) totalEventCountsBottom.berg += 1;
        if (game.finalStriche.top.berg > 0) totalEventCountsTop.berg += 1;
        // Matsch und Kontermatsch würden aus roundHistory kommen (hier 0)
      }
    });
    
    const sessionDurationSeconds = Math.round(totalGameDurationMillis / 1000);
    
         // Gewinner bestimmen - EXAKT wie im Original finalizeSession.ts
     let determinedWinnerTeamKey;
     if (totalEventCountsTop.sieg > totalEventCountsBottom.sieg) {
       determinedWinnerTeamKey = 'top';
     } else if (totalEventCountsBottom.sieg > totalEventCountsTop.sieg) {
       determinedWinnerTeamKey = 'bottom';
     } else {
       determinedWinnerTeamKey = 'draw';
     }
    
    // Rosen10player - Studi ist Player 2 (Index 1)
    const sessionRosen10player = participantPlayerIds[1]; // Studi
    
    // 6. Schreibe finales SessionSummary
    const finalUpdateData = {
      createdAt: createdAtTimestamp,
      startedAt: startedAtTimestamp,
      endedAt: now,
      lastActivity: now,
      status: "completed",
      gamesPlayed: completedGames.length,
      durationSeconds: sessionDurationSeconds,
      finalScores: { top: totalPointsTeamTop, bottom: totalPointsTeamBottom },
      finalStriche: { top: totalStricheTopRecord, bottom: totalStricheBottomRecord },
      eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
      sessionTotalWeisPoints: sessionTotalWeisPoints,
      participantUids: participantUids,
      participantPlayerIds: participantPlayerIds,
      playerNames: playerNames,
      teams: null, // Keine Teams-Info in den activeGames
      groupId: groupId,
      winnerTeamKey: determinedWinnerTeamKey,
      notes: initialSessionData.notes,
      Rosen10player: sessionRosen10player,
      totalRounds: 0 // Keine roundHistory vorhanden
    };
    
    await summaryDocRef.set(finalUpdateData, { merge: true });
    console.log('✅ SessionSummary geschrieben');
    
    // 7. Update Session-Dokument
    const sessionRef = db.collection('sessions').doc(sessionId);
    await sessionRef.update({
      status: 'completed',
      gamesPlayed: completedGames.length,
      currentActiveGameId: null,
      lastActivity: now
    });
    console.log('✅ Session-Dokument aktualisiert');
    
    // 8. Statistiken
    console.log('\n📊 FINALE ERGEBNISSE:');
    console.log(`✅ Spiele: ${completedGames.length}`);
    console.log(`✅ Punkte: ${totalPointsTeamTop} - ${totalPointsTeamBottom}`);
    console.log(`✅ Siege: ${totalEventCountsTop.sieg} - ${totalEventCountsBottom.sieg}`);
    console.log(`✅ Gewinner: ${determinedWinnerTeamKey.toUpperCase()}`);
    console.log(`✅ Rosen10player: ${sessionRosen10player} (Studi)`);
    console.log(`✅ Dauer: ${Math.round(sessionDurationSeconds / 60)} Minuten`);
    
    console.log('\n🎉 ECHTE FINALIZE-SESSION LOGIK AUSGEFÜHRT!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
  
  process.exit(0);
}

useFinalizeSessionLogic().catch(console.error); 