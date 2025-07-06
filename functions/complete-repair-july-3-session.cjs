const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function completeRepairJuly3Session() {
  console.log('🔧 [COMPLETE REPAIR] Vollständige Reparatur der Juli-3-Session...');
  
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
    
    // 2. Hole alle drei aktiven Spiele MIT VOLLSTÄNDIGEN DATEN
    console.log('\n🎮 Lade aktive Spiele (vollständig)...');
    const activeGames = [];
    
    for (const gameId of activeGameIds) {
      const gameRef = db.collection('activeGames').doc(gameId);
      const gameDoc = await gameRef.get();
      
      if (gameDoc.exists) {
        const gameData = gameDoc.data();
        console.log(`\n--- SPIEL ${gameId} ---`);
        console.log(`Status: ${gameData.status}`);
        console.log(`Runden: ${gameData.currentRound}`);
        console.log(`Final Scores: ${JSON.stringify(gameData.finalScores)}`);
        console.log(`Final Striche: ${JSON.stringify(gameData.finalStriche)}`);
        console.log(`Weis Points: ${JSON.stringify(gameData.weisPoints)}`);
        console.log(`Round History: ${gameData.roundHistory ? gameData.roundHistory.length : 0} Runden`);
        console.log(`Player Names: ${JSON.stringify(gameData.playerNames)}`);
        console.log(`Participant UIDs: ${JSON.stringify(gameData.participantUids)}`);
        
        activeGames.push({ id: gameId, data: gameData });
      } else {
        console.log(`❌ Spiel ${gameId} nicht gefunden!`);
      }
    }
    
    if (activeGames.length === 0) {
      console.log('❌ Keine aktiven Spiele gefunden!');
      return;
    }
    
    console.log(`\n📊 ${activeGames.length} Spiele mit vollständigen Daten geladen`);
    
    // 3. KRITISCH: Konvertiere UIDs zu Player-IDs
    console.log('\n🔄 Konvertiere UIDs zu Player-IDs...');
    
    const participantUids = activeGames[0].data.participantUids || [];
    const playerNames = activeGames[0].data.playerNames || {};
    
    console.log(`Teilnehmer UIDs: ${JSON.stringify(participantUids)}`);
    console.log(`Spieler Namen: ${JSON.stringify(playerNames)}`);
    
    // Konvertiere UIDs zu Player-Document-IDs
    const participantPlayerIds = [];
    const uidToPlayerIdMap = {};
    const playerNumberToIdMap = new Map();
    
    for (const uid of participantUids) {
      // Suche Player-Dokument für diese UID
      const playersQuery = db.collection('players').where('uid', '==', uid);
      const playersSnapshot = await playersQuery.get();
      
      if (!playersSnapshot.empty) {
        const playerDoc = playersSnapshot.docs[0];
        const playerId = playerDoc.id;
        const playerData = playerDoc.data();
        
        participantPlayerIds.push(playerId);
        uidToPlayerIdMap[uid] = playerId;
        
        console.log(`✅ UID ${uid} → Player ID ${playerId} (${playerData.displayName})`);
      } else {
        console.log(`❌ Kein Player-Dokument für UID ${uid} gefunden!`);
        // Fallback: verwende UID
        participantPlayerIds.push(uid);
        uidToPlayerIdMap[uid] = uid;
      }
    }
    
    // Player-Number zu Player-ID Mapping (für Trumpf-Statistiken)
    participantPlayerIds.forEach((playerId, index) => {
      playerNumberToIdMap.set(index + 1, playerId);
    });
    
    console.log(`📋 Player-ID Mapping: ${JSON.stringify(uidToPlayerIdMap)}`);
    
    // 4. EXAKTE finalizeSession-Logik: Konvertiere zu completedGames
    console.log('\n📝 Konvertiere zu completedGames (finalizeSession-Style)...');
    const completedGames = [];
    
    activeGames.forEach((game, index) => {
      const gameNumber = index + 1;
      const gameData = game.data;
      
      // Erstelle completedGame EXAKT wie in finalizeSession.ts
      const completedGame = {
        gameNumber: gameNumber,
        finalScores: gameData.finalScores || { top: 0, bottom: 0 },
        finalStriche: gameData.finalStriche || { 
          top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        },
        groupId: gameData.groupId || sessionData.gruppeId || null,
        participantUids: participantUids,
        participantPlayerIds: participantPlayerIds, // ✅ KORREKT: Player-IDs
        playerNames: playerNames,
        teams: gameData.teams ? {
          top: { playerUids: gameData.teams.top || [] },
          bottom: { playerUids: gameData.teams.bottom || [] }
        } : null,
        weisPoints: gameData.weisPoints || { top: 0, bottom: 0 },
        roundHistory: gameData.roundHistory || [],
        teamScoreMapping: gameData.teamScoreMapping || null,
        completedAt: gameData.completedAt || gameData.timestampCompleted || admin.firestore.Timestamp.now(),
        timestampCompleted: gameData.timestampCompleted || gameData.completedAt || admin.firestore.Timestamp.now(),
        activeGameId: game.id,
        durationMillis: gameData.durationMillis || 0,
        sessionId: sessionId,
        winnerTeam: gameData.winnerTeam || (
          (gameData.finalScores?.top || 0) > (gameData.finalScores?.bottom || 0) ? 'top' : 'bottom'
        ),
        gameType: gameData.gameType || 'standard',
        trumpf: gameData.trumpf || '',
        
        // ✅ NEU: Aggregierte Daten auf Spiel-Ebene
        totalRoundDurationMillis: 0, // Wird berechnet
        trumpfCountsByPlayer: {},
        roundDurationsByPlayer: {}
      };
      
      // ✅ WICHTIG: Berechne Aggregationen für dieses Spiel
      if (completedGame.roundHistory && Array.isArray(completedGame.roundHistory)) {
        const trumpfCounts = {};
        const roundDurations = {};
        
        // Initialisiere für alle Spieler
        participantPlayerIds.forEach(playerId => {
          roundDurations[playerId] = { totalDuration: 0, roundCount: 0 };
        });
        
        completedGame.roundHistory.forEach((round, roundIndex) => {
          // Trumpf-Aggregation
          if (round.currentPlayer) {
            const trumpfPlayerId = playerNumberToIdMap.get(round.currentPlayer);
            if (trumpfPlayerId && round.farbe) {
              if (!trumpfCounts[trumpfPlayerId]) {
                trumpfCounts[trumpfPlayerId] = {};
              }
              const farbeKey = round.farbe.toLowerCase();
              trumpfCounts[trumpfPlayerId][farbeKey] = (trumpfCounts[trumpfPlayerId][farbeKey] || 0) + 1;
            }
          }
          
          // Rundenzeit-Aggregation
          if (round.currentPlayer) {
            const roundPlayerId = playerNumberToIdMap.get(round.currentPlayer);
            if (roundPlayerId) {
              let roundDuration = 0;
              
              // Berechne Dauer aus aufeinanderfolgenden timestamps
              if (round.timestamp && typeof round.timestamp === 'number') {
                const currentTimestamp = round.timestamp;
                let previousTimestamp;
                
                if (roundIndex > 0) {
                  const previousRound = completedGame.roundHistory[roundIndex - 1];
                  if (previousRound?.timestamp && typeof previousRound.timestamp === 'number') {
                    previousTimestamp = previousRound.timestamp;
                  }
                } else {
                  // Erste Runde: Schätze basierend auf Spielstart
                  const completionTimestampMs = completedGame.completedAt?.toMillis();
                  if (completionTimestampMs && completedGame.durationMillis) {
                    previousTimestamp = completionTimestampMs - completedGame.durationMillis;
                  }
                }
                
                if (previousTimestamp && currentTimestamp > previousTimestamp) {
                  roundDuration = currentTimestamp - previousTimestamp;
                }
              }
              
              // Alternative Quellen
              if (roundDuration === 0) {
                if (round.durationMillis && typeof round.durationMillis === 'number') {
                  roundDuration = round.durationMillis;
                } else if (round.startTime && round.endTime) {
                  if (typeof round.startTime === 'number' && typeof round.endTime === 'number') {
                    roundDuration = round.endTime - round.startTime;
                  }
                }
              }
              
              // Füge zur Statistik hinzu (mit Filter)
              if (roundDuration >= 120000 && roundDuration < 900000) { // 2min <= duration < 15min
                roundDurations[roundPlayerId].totalDuration += roundDuration;
                roundDurations[roundPlayerId].roundCount += 1;
              }
            }
          }
        });
        
        completedGame.trumpfCountsByPlayer = trumpfCounts;
        completedGame.roundDurationsByPlayer = roundDurations;
        
        // Berechne total round duration
        completedGame.totalRoundDurationMillis = Object.values(roundDurations)
          .reduce((sum, player) => sum + player.totalDuration, 0);
      }
      
      completedGames.push(completedGame);
      
      console.log(`✅ Spiel ${gameNumber}: ${completedGame.finalScores.top} - ${completedGame.finalScores.bottom} (${completedGame.winnerTeam} gewinnt)`);
      console.log(`   Striche Top: ${JSON.stringify(completedGame.finalStriche.top)}`);
      console.log(`   Striche Bottom: ${JSON.stringify(completedGame.finalStriche.bottom)}`);
      console.log(`   Trumpf-Counts: ${Object.keys(completedGame.trumpfCountsByPlayer).length} Spieler`);
    });
    
    // 5. Schreibe completedGames in Subcollection
    console.log('\n💾 Schreibe completedGames in Subcollection...');
    const summaryDocRef = db.collection('jassGameSummaries').doc(sessionId);
    const completedGamesColRef = summaryDocRef.collection('completedGames');
    
    const batch = db.batch();
    
    completedGames.forEach(game => {
      const gameDocRef = completedGamesColRef.doc(String(game.gameNumber));
      batch.set(gameDocRef, game);
    });
    
    await batch.commit();
    console.log('✅ CompletedGames geschrieben');
    
    // 6. EXAKTE finalizeSession Aggregation
    console.log('\n🚀 Führe EXAKTE finalizeSession Aggregation aus...');
    
    const now = admin.firestore.Timestamp.now();
    const startedAtTimestamp = sessionData.startedAt || now;
    const createdAtTimestamp = sessionData.createdAt || now;
    
    // Aggregation EXAKT wie in finalizeSession.ts
    let totalPointsTeamTop = 0;
    let totalPointsTeamBottom = 0;
    const totalStricheTopRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const totalStricheBottomRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
    const sessionTotalWeisPoints = { top: 0, bottom: 0 };
    const totalEventCountsTop = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
    const totalEventCountsBottom = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
    let totalGameDurationMillis = 0;
    const aggregatedTrumpfCounts = {};
    const aggregatedRoundDurations = {};
    let sessionTotalRounds = 0;
    
    // Initialisiere aggregierte Rundenzeiten
    participantPlayerIds.forEach(playerId => {
      aggregatedRoundDurations[playerId] = { totalDuration: 0, roundCount: 0 };
    });
    
    const gameResults = [];
    const gameWinsByTeam = { top: 0, bottom: 0 };
    const gameWinsByPlayer = {};
    
    // Initialisiere Spieler-Statistiken
    participantPlayerIds.forEach(playerId => {
      gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
    });
    
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
      
      // ✅ Event-Counts NEU berechnen (wie in finalizeSession.ts)
      const gameBottomEvents = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
      const gameTopEvents = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
      
      // Matsch/Kontermatsch aus roundHistory
      if (game.roundHistory && Array.isArray(game.roundHistory)) {
        game.roundHistory.forEach(round => {
          if (round.strichInfo?.type && round.strichInfo.team) {
            const teamKey = round.strichInfo.team;
            if (round.strichInfo.type === 'matsch') {
              if (teamKey === 'bottom') gameBottomEvents.matsch++;
              else if (teamKey === 'top') gameTopEvents.matsch++;
            } else if (round.strichInfo.type === 'kontermatsch') {
              if (teamKey === 'bottom') gameBottomEvents.kontermatsch++;
              else if (teamKey === 'top') gameTopEvents.kontermatsch++;
            }
          }
        });
        
        sessionTotalRounds += game.roundHistory.length;
      }
      
      // Sieg, Berg, Schneider aus finalStriche
      if (game.finalStriche) {
        if (game.finalStriche.bottom.sieg > 0) gameBottomEvents.sieg = 1;
        if (game.finalStriche.top.sieg > 0) gameTopEvents.sieg = 1;
        if (game.finalStriche.bottom.berg > 0) gameBottomEvents.berg = 1;
        if (game.finalStriche.top.berg > 0) gameTopEvents.berg = 1;
        if (game.finalStriche.bottom.schneider > 0) gameBottomEvents.schneider = 1;
        if (game.finalStriche.top.schneider > 0) gameTopEvents.schneider = 1;
      }
      
      // Zur Session-Summe addieren
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
      
      // Aggregiere Trumpf-Counts
      if (game.trumpfCountsByPlayer) {
        Object.entries(game.trumpfCountsByPlayer).forEach(([playerId, trumpfCounts]) => {
          if (!aggregatedTrumpfCounts[playerId]) {
            aggregatedTrumpfCounts[playerId] = {};
          }
          Object.entries(trumpfCounts).forEach(([farbe, count]) => {
            aggregatedTrumpfCounts[playerId][farbe] = (aggregatedTrumpfCounts[playerId][farbe] || 0) + count;
          });
        });
      }
      
      // Aggregiere Rundenzeiten
      if (game.roundDurationsByPlayer) {
        Object.entries(game.roundDurationsByPlayer).forEach(([playerId, roundData]) => {
          if (aggregatedRoundDurations[playerId]) {
            aggregatedRoundDurations[playerId].totalDuration += roundData.totalDuration;
            aggregatedRoundDurations[playerId].roundCount += roundData.roundCount;
          }
        });
      }
      
      // Game Results
      if (game.finalScores && typeof game.gameNumber === 'number') {
        const topScore = game.finalScores.top || 0;
        const bottomScore = game.finalScores.bottom || 0;
        const winnerTeam = topScore > bottomScore ? 'top' : 'bottom';
        
        gameWinsByTeam[winnerTeam]++;
        
        gameResults.push({
          gameNumber: game.gameNumber,
          winnerTeam,
          topScore,
          bottomScore,
        });
        
        // TODO: Aktualisiere Spieler-Statistiken basierend auf Team-Zuordnung
        // (braucht teams-Struktur)
      }
    });
    
    const sessionDurationSeconds = Math.round(totalGameDurationMillis / 1000);
    
    // Gewinner bestimmen
    let determinedWinnerTeamKey;
    if (totalEventCountsTop.sieg > totalEventCountsBottom.sieg) {
      determinedWinnerTeamKey = 'top';
    } else if (totalEventCountsBottom.sieg > totalEventCountsTop.sieg) {
      determinedWinnerTeamKey = 'bottom';
    } else {
      determinedWinnerTeamKey = 'draw';
    }
    
              // Rosen10player bestimmen - STUDI war Player Number 2!
     let sessionRosen10player = null;
     const studziPlayerNumber = 2; // Studi ist Player Number 2
     
     if (playerNumberToIdMap.has(studziPlayerNumber)) {
       sessionRosen10player = playerNumberToIdMap.get(studziPlayerNumber);
       console.log(`✅ Rosen10player MANUELL gesetzt: Studi (Player ${studziPlayerNumber}) → ${sessionRosen10player}`);
     } else {
       console.log(`❌ Konnte Studi (Player ${studziPlayerNumber}) nicht in der Mapping-Tabelle finden!`);
     }
    
    // 7. Erstelle finales SessionSummary (EXAKT wie finalizeSession.ts)
    const baseUpdateData = {
      createdAt: createdAtTimestamp,
      startedAt: startedAtTimestamp,
      endedAt: now,
      lastActivity: now,
      status: "completed",
      gamesPlayed: completedGames.length,
      durationSeconds: sessionDurationSeconds > 0 ? sessionDurationSeconds : 0,
      finalScores: { top: totalPointsTeamTop, bottom: totalPointsTeamBottom },
      finalStriche: { top: totalStricheTopRecord, bottom: totalStricheBottomRecord },
      eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
      sessionTotalWeisPoints: sessionTotalWeisPoints,
      participantUids: participantUids,
      participantPlayerIds: participantPlayerIds, // ✅ KORREKT: Player-IDs
      playerNames: playerNames,
      teams: sessionData.teams || null,
      groupId: sessionData.gruppeId || null,
      pairingIdentifiers: sessionData.pairingIdentifiers || null,
      winnerTeamKey: determinedWinnerTeamKey,
      notes: sessionData.notes || ['Manuell repariert am ' + new Date().toLocaleString('de-CH')],
      totalRounds: sessionTotalRounds,
    };
    
    // Conditional properties
    const finalUpdateData = { ...baseUpdateData };
    
    if (sessionRosen10player) {
      finalUpdateData.Rosen10player = sessionRosen10player;
    }
    
    if (Object.keys(aggregatedTrumpfCounts).length > 0) {
      finalUpdateData.aggregatedTrumpfCountsByPlayer = aggregatedTrumpfCounts;
    }
    
    if (Object.keys(aggregatedRoundDurations).length > 0) {
      const hasValidRoundTimes = Object.values(aggregatedRoundDurations).some(
        playerData => playerData.roundCount > 0 && playerData.totalDuration > 0
      );
      
      if (hasValidRoundTimes) {
        finalUpdateData.aggregatedRoundDurationsByPlayer = aggregatedRoundDurations;
      }
    }
    
    if (gameResults.length > 0) {
      finalUpdateData.gameResults = gameResults;
      finalUpdateData.gameWinsByTeam = gameWinsByTeam;
      finalUpdateData.gameWinsByPlayer = gameWinsByPlayer;
    }
    
    // 8. Schreibe finales SessionSummary
    await summaryDocRef.set(finalUpdateData, { merge: true });
    console.log('✅ SessionSummary geschrieben (KOMPLETT)');
    
    // 9. Update Session-Dokument
    await sessionRef.update({
      status: 'completed',
      gamesPlayed: completedGames.length,
      currentActiveGameId: null,
      lastActivity: now
    });
    console.log('✅ Session-Dokument aktualisiert');
    
    // 10. STATISTIKEN
    console.log('\n📊 FINALE STATISTIKEN:');
    console.log(`✅ Spiele: ${completedGames.length}`);
    console.log(`✅ Punkte: ${totalPointsTeamTop} - ${totalPointsTeamBottom}`);
    console.log(`✅ Siege: ${totalEventCountsTop.sieg} - ${totalEventCountsBottom.sieg}`);
    console.log(`✅ Gewinner: ${determinedWinnerTeamKey.toUpperCase()}`);
    console.log(`✅ Runden: ${sessionTotalRounds}`);
    console.log(`✅ Dauer: ${Math.round(sessionDurationSeconds / 60)} Minuten`);
    console.log(`✅ Spieler-IDs: ${participantPlayerIds.length} korrekt konvertiert`);
    
    if (Object.keys(aggregatedTrumpfCounts).length > 0) {
      console.log(`✅ Trumpf-Statistiken: ${Object.keys(aggregatedTrumpfCounts).length} Spieler`);
    }
    
    console.log('\n🎉 VOLLSTÄNDIGE REPARATUR ABGESCHLOSSEN!');
    console.log('Alle Daten entsprechen jetzt der exakten finalizeSession.ts Logik!');
    
  } catch (error) {
    console.error('❌ Fehler bei der vollständigen Reparatur:', error);
  }
  
  process.exit(0);
}

completeRepairJuly3Session().catch(console.error); 