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

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

const DRY_RUN = false; // ✅ Auf false setzen zum Ausführen

// =========================================
// REPLIZIERE updatePlayerData aus unifiedPlayerDataService.ts
// =========================================

/**
 * Summiert alle Striche (berg, sieg, matsch, schneider, kontermatsch)
 */
function sumStriche(stricheRecord) {
  if (!stricheRecord) return 0;
  return (
    (stricheRecord.berg || 0) +
    (stricheRecord.sieg || 0) +
    (stricheRecord.matsch || 0) +
    (stricheRecord.schneider || 0) +
    (stricheRecord.kontermatsch || 0)
  );
}

/**
 * Berechnet das Delta (Änderung) durch eine Session
 */
function calculateSessionDelta(playerId, sessionData) {
  const delta = {
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
    pointsMade: 0,
    pointsReceived: 0,
    pointsDifference: 0,
    stricheMade: 0,
    stricheReceived: 0,
    stricheDifference: 0,
    weisPoints: 0,
    weisReceived: 0,
    weisDifference: 0,
    matschEventsMade: 0,
    matschEventsReceived: 0,
    matschBilanz: 0,
    schneiderEventsMade: 0,
    schneiderEventsReceived: 0,
    schneiderBilanz: 0,
    kontermatschEventsMade: 0,
    kontermatschEventsReceived: 0,
    kontermatschBilanz: 0,
    trumpfStatistik: {},
    playTimeSeconds: 0,
    partnerIds: [],
    partnerNames: {},
    opponentIds: [],
    opponentNames: {},
    playerTeam: null,
  };
  
  // Bestimme Team des Spielers aus gameResults (Turnier hat kein top-level teams)
  let playerTeam = null;
  if (sessionData.gameResults && sessionData.gameResults.length > 0) {
    for (const game of sessionData.gameResults) {
      if (game.teams?.top?.players?.some(p => p.playerId === playerId)) {
        playerTeam = 'top';
        break;
      } else if (game.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
        playerTeam = 'bottom';
        break;
      }
    }
  }
  
  if (!playerTeam) {
    console.warn(`[calculateSessionDelta] Spieler ${playerId} nicht in Teams gefunden`);
    return delta;
  }
  
  delta.playerTeam = playerTeam;
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // SESSIONS (Turnier = 1 Session, aber kein winnerTeamKey, daher skip)
  delta.sessionsPlayed = 1;
  
  // GAMES
  const playerGameWins = sessionData.gameWinsByPlayer?.[playerId];
  if (playerGameWins) {
    delta.gamesPlayed = (playerGameWins.wins || 0) + (playerGameWins.losses || 0) + (playerGameWins.ties || 0);
    delta.gamesWon = playerGameWins.wins || 0;
    delta.gamesLost = playerGameWins.losses || 0;
    delta.gamesDraw = playerGameWins.ties || 0;
  }
  
  // SCORES (berechne aus gameResults)
  if (sessionData.gameResults) {
    sessionData.gameResults.forEach(game => {
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      
      if (playerInTop) {
        delta.pointsMade += game.topScore || 0;
        delta.pointsReceived += game.bottomScore || 0;
      } else if (playerInBottom) {
        delta.pointsMade += game.bottomScore || 0;
        delta.pointsReceived += game.topScore || 0;
      }
    });
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  }
  
  // STRICHE (berechne aus gameResults)
  if (sessionData.gameResults) {
    sessionData.gameResults.forEach(game => {
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      
      if (playerInTop && game.finalStriche?.top) {
        delta.stricheMade += sumStriche(game.finalStriche.top);
        delta.stricheReceived += sumStriche(game.finalStriche.bottom);
      } else if (playerInBottom && game.finalStriche?.bottom) {
        delta.stricheMade += sumStriche(game.finalStriche.bottom);
        delta.stricheReceived += sumStriche(game.finalStriche.top);
      }
    });
    delta.stricheDifference = delta.stricheMade - delta.stricheReceived;
  }
  
  // WEIS
  if (sessionData.sessionTotalWeisPoints) {
    delta.weisPoints = sessionData.sessionTotalWeisPoints[playerTeam] || 0;
    delta.weisReceived = sessionData.sessionTotalWeisPoints[opponentTeam] || 0;
    delta.weisDifference = delta.weisPoints - delta.weisReceived;
  }
  
  // EVENTS (aus totalEventCountsByPlayer)
  if (sessionData.totalEventCountsByPlayer?.[playerId]) {
    const playerEvents = sessionData.totalEventCountsByPlayer[playerId];
    delta.matschEventsMade = playerEvents.matschMade || 0;
    delta.matschEventsReceived = playerEvents.matschReceived || 0;
    delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
    
    delta.schneiderEventsMade = playerEvents.schneiderMade || 0;
    delta.schneiderEventsReceived = playerEvents.schneiderReceived || 0;
    delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
    
    delta.kontermatschEventsMade = playerEvents.kontermatschMade || 0;
    delta.kontermatschEventsReceived = playerEvents.kontermatschReceived || 0;
    delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
  }
  
  // TRUMPF
  if (sessionData.aggregatedTrumpfCountsByPlayer?.[playerId]) {
    delta.trumpfStatistik = sessionData.aggregatedTrumpfCountsByPlayer[playerId];
  }
  
  // ZEIT
  delta.playTimeSeconds = sessionData.durationSeconds || 0;
  
  // PARTNER/OPPONENT (sammle aus ALLEN Passen des Turniers)
  const partnerSet = new Set();
  const opponentSet = new Set();
  const partnerNamesMap = {};
  const opponentNamesMap = {};
  
  if (sessionData.gameResults) {
    sessionData.gameResults.forEach(game => {
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      
      if (playerInTop) {
        game.teams.top.players.forEach(p => {
          if (p.playerId !== playerId) {
            partnerSet.add(p.playerId);
            partnerNamesMap[p.playerId] = p.displayName || 'Unbekannt';
          }
        });
        game.teams.bottom.players.forEach(p => {
          opponentSet.add(p.playerId);
          opponentNamesMap[p.playerId] = p.displayName || 'Unbekannt';
        });
      } else if (playerInBottom) {
        game.teams.bottom.players.forEach(p => {
          if (p.playerId !== playerId) {
            partnerSet.add(p.playerId);
            partnerNamesMap[p.playerId] = p.displayName || 'Unbekannt';
          }
        });
        game.teams.top.players.forEach(p => {
          opponentSet.add(p.playerId);
          opponentNamesMap[p.playerId] = p.displayName || 'Unbekannt';
        });
      }
    });
  }
  
  delta.partnerIds = Array.from(partnerSet);
  delta.opponentIds = Array.from(opponentSet);
  delta.partnerNames = partnerNamesMap;
  delta.opponentNames = opponentNamesMap;
  
  return delta;
}

/**
 * Aktualisiert Partner Stats Subcollection
 */
async function updatePartnerStatsSubcollection(playerId, sessionData, delta) {
  console.log(`    Partner-Stats für ${delta.partnerIds.length} Partner aktualisieren...`);
  
  for (const partnerId of delta.partnerIds) {
    const partnerStatsRef = db.collection(`players/${playerId}/partnerStats`).doc(partnerId);
    const partnerStatsDoc = await partnerStatsRef.get();
    
    const current = partnerStatsDoc.exists ? partnerStatsDoc.data() : {
      partnerId,
      partnerDisplayName: delta.partnerNames[partnerId] || 'Unbekannt',
      sessionsPlayedWith: 0,
      sessionsWonWith: 0,
      sessionsLostWith: 0,
      sessionsDrawWith: 0,
      sessionWinRateWith: 0,
      gamesPlayedWith: 0,
      gamesWonWith: 0,
      gamesLostWith: 0,
      gameWinRateWith: 0,
      totalStricheDifferenceWith: 0,
      totalPointsDifferenceWith: 0,
      matschBilanzWith: 0,
      matschEventsMadeWith: 0,
      matschEventsReceivedWith: 0,
      schneiderBilanzWith: 0,
      schneiderEventsMadeWith: 0,
      schneiderEventsReceivedWith: 0,
      kontermatschBilanzWith: 0,
      kontermatschEventsMadeWith: 0,
      kontermatschEventsReceivedWith: 0,
      totalWeisPointsWith: 0,
      totalWeisReceivedWith: 0,
      weisDifferenceWith: 0,
      totalRoundDurationWith: 0,
      totalRoundsWith: 0,
      avgRoundDurationWith: 0,
      trumpfStatistikWith: {},
      lastPlayedWithTimestamp: admin.firestore.Timestamp.now(),
    };
    
    const updated = {
      ...current,
      partnerDisplayName: delta.partnerNames[partnerId] || current.partnerDisplayName,
      
      sessionsPlayedWith: current.sessionsPlayedWith + delta.sessionsPlayed,
      sessionsWonWith: current.sessionsWonWith + delta.sessionsWon,
      sessionsLostWith: current.sessionsLostWith + delta.sessionsLost,
      sessionsDrawWith: current.sessionsDrawWith + delta.sessionsDraw,
      
      gamesPlayedWith: current.gamesPlayedWith + delta.gamesPlayed,
      gamesWonWith: current.gamesWonWith + delta.gamesWon,
      gamesLostWith: current.gamesLostWith + delta.gamesLost,
      
      totalStricheDifferenceWith: current.totalStricheDifferenceWith + delta.stricheDifference,
      totalPointsDifferenceWith: current.totalPointsDifferenceWith + delta.pointsDifference,
      
      matschBilanzWith: current.matschBilanzWith + delta.matschBilanz,
      matschEventsMadeWith: current.matschEventsMadeWith + delta.matschEventsMade,
      matschEventsReceivedWith: current.matschEventsReceivedWith + delta.matschEventsReceived,
      
      schneiderBilanzWith: current.schneiderBilanzWith + delta.schneiderBilanz,
      schneiderEventsMadeWith: current.schneiderEventsMadeWith + delta.schneiderEventsMade,
      schneiderEventsReceivedWith: current.schneiderEventsReceivedWith + delta.schneiderEventsReceived,
      
      kontermatschBilanzWith: current.kontermatschBilanzWith + delta.kontermatschBilanz,
      kontermatschEventsMadeWith: current.kontermatschEventsMadeWith + delta.kontermatschEventsMade,
      kontermatschEventsReceivedWith: current.kontermatschEventsReceivedWith + delta.kontermatschEventsReceived,
      
      totalWeisPointsWith: current.totalWeisPointsWith + delta.weisPoints,
      totalWeisReceivedWith: current.totalWeisReceivedWith + delta.weisReceived,
      weisDifferenceWith: current.weisDifferenceWith + delta.weisDifference,
      
      lastPlayedWithTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
    };
    
    // Rundentempo & Trumpfansagen
    const playerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[playerId];
    const partnerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[partnerId];
    
    if ((playerRounds && playerRounds.roundCount > 0) || (partnerRounds && partnerRounds.roundCount > 0)) {
      const playerDuration = playerRounds?.totalDuration || 0;
      const partnerDuration = partnerRounds?.totalDuration || 0;
      const playerCount = playerRounds?.roundCount || 0;
      const partnerCount = partnerRounds?.roundCount || 0;
      
      updated.totalRoundDurationWith = (current.totalRoundDurationWith || 0) + playerDuration + partnerDuration;
      updated.totalRoundsWith = (current.totalRoundsWith || 0) + playerCount + partnerCount;
    }
    
    const playerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
    const partnerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[partnerId] || {};
    
    if (Object.keys(playerTrumpfs).length > 0 || Object.keys(partnerTrumpfs).length > 0) {
      const combinedTrumpfs = { ...(current.trumpfStatistikWith || {}) };
      
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        combinedTrumpfs[farbe] = (combinedTrumpfs[farbe] || 0) + count;
      });
      
      Object.entries(partnerTrumpfs).forEach(([farbe, count]) => {
        combinedTrumpfs[farbe] = (combinedTrumpfs[farbe] || 0) + count;
      });
      
      updated.trumpfStatistikWith = combinedTrumpfs;
    }
    
    // Win Rates
    const decidedSessions = updated.sessionsWonWith + updated.sessionsLostWith;
    updated.sessionWinRateWith = decidedSessions > 0 ? updated.sessionsWonWith / decidedSessions : 0;
    updated.gameWinRateWith = updated.gamesPlayedWith > 0 ? updated.gamesWonWith / updated.gamesPlayedWith : 0;
    if (updated.totalRoundsWith && updated.totalRoundsWith > 0 && updated.totalRoundDurationWith) {
      updated.avgRoundDurationWith = updated.totalRoundDurationWith / updated.totalRoundsWith;
    }
    
    if (DRY_RUN) {
      console.log(`      [DRY RUN] Partner ${delta.partnerNames[partnerId]}: gamesPlayedWith ${current.gamesPlayedWith} → ${updated.gamesPlayedWith}, matschBilanzWith ${current.matschBilanzWith} → ${updated.matschBilanzWith}`);
    } else {
      await partnerStatsRef.set(updated);
      console.log(`      ✅ Partner ${delta.partnerNames[partnerId]} aktualisiert`);
    }
  }
}

/**
 * Aktualisiert Opponent Stats Subcollection
 */
async function updateOpponentStatsSubcollection(playerId, sessionData, delta) {
  console.log(`    Opponent-Stats für ${delta.opponentIds.length} Gegner aktualisieren...`);
  
  for (const opponentId of delta.opponentIds) {
    const opponentStatsRef = db.collection(`players/${playerId}/opponentStats`).doc(opponentId);
    const opponentStatsDoc = await opponentStatsRef.get();
    
    const current = opponentStatsDoc.exists ? opponentStatsDoc.data() : {
      opponentId,
      opponentDisplayName: delta.opponentNames[opponentId] || 'Unbekannt',
      sessionsPlayedAgainst: 0,
      sessionsWonAgainst: 0,
      sessionsLostAgainst: 0,
      sessionsDrawAgainst: 0,
      sessionWinRateAgainst: 0,
      gamesPlayedAgainst: 0,
      gamesWonAgainst: 0,
      gamesLostAgainst: 0,
      gameWinRateAgainst: 0,
      totalStricheDifferenceAgainst: 0,
      totalPointsDifferenceAgainst: 0,
      matschBilanzAgainst: 0,
      matschEventsMadeAgainst: 0,
      matschEventsReceivedAgainst: 0,
      schneiderBilanzAgainst: 0,
      schneiderEventsMadeAgainst: 0,
      schneiderEventsReceivedAgainst: 0,
      kontermatschBilanzAgainst: 0,
      kontermatschEventsMadeAgainst: 0,
      kontermatschEventsReceivedAgainst: 0,
      totalWeisPointsAgainst: 0,
      totalWeisReceivedAgainst: 0,
      weisDifferenceAgainst: 0,
      totalRoundDurationAgainst: 0,
      totalRoundsAgainst: 0,
      avgRoundDurationAgainst: 0,
      trumpfStatistikAgainst: {},
      lastPlayedAgainstTimestamp: admin.firestore.Timestamp.now(),
    };
    
    const updated = {
      ...current,
      opponentDisplayName: delta.opponentNames[opponentId] || current.opponentDisplayName,
      
      sessionsPlayedAgainst: current.sessionsPlayedAgainst + delta.sessionsPlayed,
      sessionsWonAgainst: current.sessionsWonAgainst + delta.sessionsWon,
      sessionsLostAgainst: current.sessionsLostAgainst + delta.sessionsLost,
      sessionsDrawAgainst: current.sessionsDrawAgainst + delta.sessionsDraw,
      
      gamesPlayedAgainst: current.gamesPlayedAgainst + delta.gamesPlayed,
      gamesWonAgainst: current.gamesWonAgainst + delta.gamesWon,
      gamesLostAgainst: current.gamesLostAgainst + delta.gamesLost,
      
      totalStricheDifferenceAgainst: current.totalStricheDifferenceAgainst + delta.stricheDifference,
      totalPointsDifferenceAgainst: current.totalPointsDifferenceAgainst + delta.pointsDifference,
      
      matschBilanzAgainst: current.matschBilanzAgainst + delta.matschBilanz,
      matschEventsMadeAgainst: current.matschEventsMadeAgainst + delta.matschEventsMade,
      matschEventsReceivedAgainst: current.matschEventsReceivedAgainst + delta.matschEventsReceived,
      
      schneiderBilanzAgainst: current.schneiderBilanzAgainst + delta.schneiderBilanz,
      schneiderEventsMadeAgainst: current.schneiderEventsMadeAgainst + delta.schneiderEventsMade,
      schneiderEventsReceivedAgainst: current.schneiderEventsReceivedAgainst + delta.schneiderEventsReceived,
      
      kontermatschBilanzAgainst: current.kontermatschBilanzAgainst + delta.kontermatschBilanz,
      kontermatschEventsMadeAgainst: current.kontermatschEventsMadeAgainst + delta.kontermatschEventsMade,
      kontermatschEventsReceivedAgainst: current.kontermatschEventsReceivedAgainst + delta.kontermatschEventsReceived,
      
      totalWeisPointsAgainst: current.totalWeisPointsAgainst + delta.weisPoints,
      totalWeisReceivedAgainst: current.totalWeisReceivedAgainst + delta.weisReceived,
      weisDifferenceAgainst: current.weisDifferenceAgainst + delta.weisDifference,
      
      lastPlayedAgainstTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
    };
    
    // Rundentempo & Trumpfansagen
    const playerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[playerId];
    const opponentRounds = sessionData.aggregatedRoundDurationsByPlayer?.[opponentId];
    
    if ((playerRounds && playerRounds.roundCount > 0) || (opponentRounds && opponentRounds.roundCount > 0)) {
      const playerDuration = playerRounds?.totalDuration || 0;
      const opponentDuration = opponentRounds?.totalDuration || 0;
      const playerCount = playerRounds?.roundCount || 0;
      const opponentCount = opponentRounds?.roundCount || 0;
      
      updated.totalRoundDurationAgainst = (current.totalRoundDurationAgainst || 0) + playerDuration + opponentDuration;
      updated.totalRoundsAgainst = (current.totalRoundsAgainst || 0) + playerCount + opponentCount;
    }
    
    const playerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
    if (Object.keys(playerTrumpfs).length > 0) {
      const existingTrumpfs = { ...(current.trumpfStatistikAgainst || {}) };
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        existingTrumpfs[farbe] = (existingTrumpfs[farbe] || 0) + count;
      });
      updated.trumpfStatistikAgainst = existingTrumpfs;
    }
    
    // Win Rates
    const decidedSessions = updated.sessionsWonAgainst + updated.sessionsLostAgainst;
    updated.sessionWinRateAgainst = decidedSessions > 0 ? updated.sessionsWonAgainst / decidedSessions : 0;
    updated.gameWinRateAgainst = updated.gamesPlayedAgainst > 0 ? updated.gamesWonAgainst / updated.gamesPlayedAgainst : 0;
    if (updated.totalRoundsAgainst && updated.totalRoundsAgainst > 0 && updated.totalRoundDurationAgainst) {
      updated.avgRoundDurationAgainst = updated.totalRoundDurationAgainst / updated.totalRoundsAgainst;
    }
    
    if (DRY_RUN) {
      console.log(`      [DRY RUN] Gegner ${delta.opponentNames[opponentId]}: gamesPlayedAgainst ${current.gamesPlayedAgainst} → ${updated.gamesPlayedAgainst}, matschBilanzAgainst ${current.matschBilanzAgainst} → ${updated.matschBilanzAgainst}`);
    } else {
      await opponentStatsRef.set(updated);
      console.log(`      ✅ Gegner ${delta.opponentNames[opponentId]} aktualisiert`);
    }
  }
}

// =========================================
// MAIN BACKFILL FUNCTION (KORREKTE VERSION: SPIEL FÜR SPIEL!)
// =========================================

async function backfillTournamentPartnerOpponentStats() {
  console.log('\n🔄 BACKFILL: Partner/Opponent-Stats für Turnier-Teilnehmer (SPIEL FÜR SPIEL)\n');
  console.log('='.repeat(120));
  console.log(`DRY_RUN: ${DRY_RUN ? 'JA (keine Änderungen)' : 'NEIN (Änderungen werden geschrieben!)'}`);
  console.log('='.repeat(120));

  try {
    // 1. Lade jassGameSummary
    const jassGameSummaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const jassGameSummarySnap = await jassGameSummaryRef.get();

    if (!jassGameSummarySnap.exists) {
      console.log(`❌ JassGameSummary für Turnier ${TOURNAMENT_ID} nicht gefunden.`);
      return;
    }

    const sessionData = jassGameSummarySnap.data();
    const participantPlayerIds = sessionData.participantPlayerIds || [];
    const gameResults = sessionData.gameResults || [];
    
    console.log(`\n✅ JassGameSummary geladen: ${participantPlayerIds.length} Teilnehmer, ${gameResults.length} Spiele\n`);

    // 2. Für jeden Spieler: Gehe JEDES SPIEL EINZELN durch!
    for (let i = 0; i < participantPlayerIds.length; i++) {
      const playerId = participantPlayerIds[i];
      
      // Lade Spieler-Name
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerName = playerDoc.exists ? playerDoc.data()?.displayName : playerId;
      
      console.log(`\n[${i + 1}/${participantPlayerIds.length}] Spieler: ${playerName} (${playerId})`);
      
      // Map für aggregierte Stats pro Partner/Gegner
      const partnerStatsMap = new Map();
      const opponentStatsMap = new Map();
      
      // 3. Gehe durch JEDES SPIEL
      for (const game of gameResults) {
        // Prüfe, ob Spieler in diesem Spiel dabei war
        const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
        const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
        
        if (!playerInTop && !playerInBottom) {
          continue; // Spieler war in diesem Spiel nicht dabei
        }
        
        const playerTeam = playerInTop ? 'top' : 'bottom';
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        
        // Identifiziere Partner in DIESEM SPIEL
        const teamPlayers = game.teams[playerTeam]?.players || [];
        const partners = teamPlayers.filter(p => p.playerId !== playerId);
        
        // Identifiziere Gegner in DIESEM SPIEL
        const opponentPlayers = game.teams[opponentTeam]?.players || [];
        
        // Berechne Deltas für DIESES SPIEL
        const gameWon = game.winnerTeam === playerTeam;
        const gameLost = game.winnerTeam === opponentTeam;
        const gameDraw = !gameWon && !gameLost;
        
        const playerStriche = sumStriche(game.finalStriche?.[playerTeam]);
        const opponentStriche = sumStriche(game.finalStriche?.[opponentTeam]);
        const stricheDiff = playerStriche - opponentStriche;
        
        const playerPoints = game[`${playerTeam}Score`] || 0;
        const opponentPoints = game[`${opponentTeam}Score`] || 0;
        const pointsDiff = playerPoints - opponentPoints;
        
        const playerEvents = game.eventCounts?.[playerTeam] || {};
        const opponentEvents = game.eventCounts?.[opponentTeam] || {};
        
        const matschMade = playerEvents.matsch || 0;
        const matschReceived = opponentEvents.matsch || 0;
        const schneiderMade = playerEvents.schneider || 0;
        const schneiderReceived = opponentEvents.schneider || 0;
        const kontermatschMade = playerEvents.kontermatsch || 0;
        const kontermatschReceived = opponentEvents.kontermatsch || 0;
        
        // Aggregiere für JEDEN Partner in diesem Spiel
        partners.forEach(partner => {
          if (!partnerStatsMap.has(partner.playerId)) {
            partnerStatsMap.set(partner.playerId, {
              partnerDisplayName: partner.displayName,
              gamesPlayed: 0,
              gamesWon: 0,
              gamesLost: 0,
              stricheDiff: 0,
              pointsDiff: 0,
              matschMade: 0,
              matschReceived: 0,
              schneiderMade: 0,
              schneiderReceived: 0,
              kontermatschMade: 0,
              kontermatschReceived: 0,
            });
          }
          
          const stats = partnerStatsMap.get(partner.playerId);
          stats.gamesPlayed += 1;
          stats.gamesWon += gameWon ? 1 : 0;
          stats.gamesLost += gameLost ? 1 : 0;
          stats.stricheDiff += stricheDiff;
          stats.pointsDiff += pointsDiff;
          stats.matschMade += matschMade;
          stats.matschReceived += matschReceived;
          stats.schneiderMade += schneiderMade;
          stats.schneiderReceived += schneiderReceived;
          stats.kontermatschMade += kontermatschMade;
          stats.kontermatschReceived += kontermatschReceived;
        });
        
        // Aggregiere für JEDEN Gegner in diesem Spiel
        opponentPlayers.forEach(opponent => {
          if (!opponentStatsMap.has(opponent.playerId)) {
            opponentStatsMap.set(opponent.playerId, {
              opponentDisplayName: opponent.displayName,
              gamesPlayed: 0,
              gamesWon: 0,
              gamesLost: 0,
              stricheDiff: 0,
              pointsDiff: 0,
              matschMade: 0,
              matschReceived: 0,
              schneiderMade: 0,
              schneiderReceived: 0,
              kontermatschMade: 0,
              kontermatschReceived: 0,
            });
          }
          
          const stats = opponentStatsMap.get(opponent.playerId);
          stats.gamesPlayed += 1;
          stats.gamesWon += gameWon ? 1 : 0;
          stats.gamesLost += gameLost ? 1 : 0;
          stats.stricheDiff += stricheDiff;
          stats.pointsDiff += pointsDiff;
          stats.matschMade += matschMade;
          stats.matschReceived += matschReceived;
          stats.schneiderMade += schneiderMade;
          stats.schneiderReceived += schneiderReceived;
          stats.kontermatschMade += kontermatschMade;
          stats.kontermatschReceived += kontermatschReceived;
        });
      }
      
      console.log(`  ${partnerStatsMap.size} Partner, ${opponentStatsMap.size} Gegner`);
      
      // 4. Update Partner Stats in Firestore
      for (const [partnerId, aggregated] of partnerStatsMap) {
        const partnerStatsRef = db.collection(`players/${playerId}/partnerStats`).doc(partnerId);
        const partnerStatsDoc = await partnerStatsRef.get();
        
        const current = partnerStatsDoc.exists ? partnerStatsDoc.data() : {
          partnerId,
          partnerDisplayName: aggregated.partnerDisplayName,
          sessionsPlayedWith: 0,
          sessionsWonWith: 0,
          sessionsLostWith: 0,
          sessionsDrawWith: 0,
          sessionWinRateWith: 0,
          gamesPlayedWith: 0,
          gamesWonWith: 0,
          gamesLostWith: 0,
          gameWinRateWith: 0,
          totalStricheDifferenceWith: 0,
          totalPointsDifferenceWith: 0,
          matschBilanzWith: 0,
          matschEventsMadeWith: 0,
          matschEventsReceivedWith: 0,
          schneiderBilanzWith: 0,
          schneiderEventsMadeWith: 0,
          schneiderEventsReceivedWith: 0,
          kontermatschBilanzWith: 0,
          kontermatschEventsMadeWith: 0,
          kontermatschEventsReceivedWith: 0,
          totalWeisPointsWith: 0,
          totalWeisReceivedWith: 0,
          weisDifferenceWith: 0,
          lastPlayedWithTimestamp: admin.firestore.Timestamp.now(),
        };
        
        const updated = {
          ...current,
          partnerDisplayName: aggregated.partnerDisplayName,
          gamesPlayedWith: current.gamesPlayedWith + aggregated.gamesPlayed,
          gamesWonWith: current.gamesWonWith + aggregated.gamesWon,
          gamesLostWith: current.gamesLostWith + aggregated.gamesLost,
          totalStricheDifferenceWith: current.totalStricheDifferenceWith + aggregated.stricheDiff,
          totalPointsDifferenceWith: current.totalPointsDifferenceWith + aggregated.pointsDiff,
          matschEventsMadeWith: current.matschEventsMadeWith + aggregated.matschMade,
          matschEventsReceivedWith: current.matschEventsReceivedWith + aggregated.matschReceived,
          matschBilanzWith: current.matschBilanzWith + (aggregated.matschMade - aggregated.matschReceived),
          schneiderEventsMadeWith: current.schneiderEventsMadeWith + aggregated.schneiderMade,
          schneiderEventsReceivedWith: current.schneiderEventsReceivedWith + aggregated.schneiderReceived,
          schneiderBilanzWith: current.schneiderBilanzWith + (aggregated.schneiderMade - aggregated.schneiderReceived),
          kontermatschEventsMadeWith: current.kontermatschEventsMadeWith + aggregated.kontermatschMade,
          kontermatschEventsReceivedWith: current.kontermatschEventsReceivedWith + aggregated.kontermatschReceived,
          kontermatschBilanzWith: current.kontermatschBilanzWith + (aggregated.kontermatschMade - aggregated.kontermatschReceived),
          lastPlayedWithTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
        };
        
        updated.gameWinRateWith = updated.gamesPlayedWith > 0 ? updated.gamesWonWith / updated.gamesPlayedWith : 0;
        
        if (DRY_RUN) {
          console.log(`    [DRY RUN] Partner ${aggregated.partnerDisplayName}: ${aggregated.gamesPlayed} Spiele, matschBilanzWith ${current.matschBilanzWith} → ${updated.matschBilanzWith}`);
        } else {
          await partnerStatsRef.set(updated);
          console.log(`    ✅ Partner ${aggregated.partnerDisplayName}: ${aggregated.gamesPlayed} Spiele aktualisiert`);
        }
      }
      
      // 5. Update Opponent Stats in Firestore
      for (const [opponentId, aggregated] of opponentStatsMap) {
        const opponentStatsRef = db.collection(`players/${playerId}/opponentStats`).doc(opponentId);
        const opponentStatsDoc = await opponentStatsRef.get();
        
        const current = opponentStatsDoc.exists ? opponentStatsDoc.data() : {
          opponentId,
          opponentDisplayName: aggregated.opponentDisplayName,
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          sessionsLostAgainst: 0,
          sessionsDrawAgainst: 0,
          sessionWinRateAgainst: 0,
          gamesPlayedAgainst: 0,
          gamesWonAgainst: 0,
          gamesLostAgainst: 0,
          gameWinRateAgainst: 0,
          totalStricheDifferenceAgainst: 0,
          totalPointsDifferenceAgainst: 0,
          matschBilanzAgainst: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          schneiderBilanzAgainst: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
          kontermatschBilanzAgainst: 0,
          kontermatschEventsMadeAgainst: 0,
          kontermatschEventsReceivedAgainst: 0,
          totalWeisPointsAgainst: 0,
          totalWeisReceivedAgainst: 0,
          weisDifferenceAgainst: 0,
          lastPlayedAgainstTimestamp: admin.firestore.Timestamp.now(),
        };
        
        const updated = {
          ...current,
          opponentDisplayName: aggregated.opponentDisplayName,
          gamesPlayedAgainst: current.gamesPlayedAgainst + aggregated.gamesPlayed,
          gamesWonAgainst: current.gamesWonAgainst + aggregated.gamesWon,
          gamesLostAgainst: current.gamesLostAgainst + aggregated.gamesLost,
          totalStricheDifferenceAgainst: current.totalStricheDifferenceAgainst + aggregated.stricheDiff,
          totalPointsDifferenceAgainst: current.totalPointsDifferenceAgainst + aggregated.pointsDiff,
          matschEventsMadeAgainst: current.matschEventsMadeAgainst + aggregated.matschMade,
          matschEventsReceivedAgainst: current.matschEventsReceivedAgainst + aggregated.matschReceived,
          matschBilanzAgainst: current.matschBilanzAgainst + (aggregated.matschMade - aggregated.matschReceived),
          schneiderEventsMadeAgainst: current.schneiderEventsMadeAgainst + aggregated.schneiderMade,
          schneiderEventsReceivedAgainst: current.schneiderEventsReceivedAgainst + aggregated.schneiderReceived,
          schneiderBilanzAgainst: current.schneiderBilanzAgainst + (aggregated.schneiderMade - aggregated.schneiderReceived),
          kontermatschEventsMadeAgainst: current.kontermatschEventsMadeAgainst + aggregated.kontermatschMade,
          kontermatschEventsReceivedAgainst: current.kontermatschEventsReceivedAgainst + aggregated.kontermatschReceived,
          kontermatschBilanzAgainst: current.kontermatschBilanzAgainst + (aggregated.kontermatschMade - aggregated.kontermatschReceived),
          lastPlayedAgainstTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
        };
        
        updated.gameWinRateAgainst = updated.gamesPlayedAgainst > 0 ? updated.gamesWonAgainst / updated.gamesPlayedAgainst : 0;
        
        if (DRY_RUN) {
          console.log(`    [DRY RUN] Gegner ${aggregated.opponentDisplayName}: ${aggregated.gamesPlayed} Spiele, matschBilanzAgainst ${current.matschBilanzAgainst} → ${updated.matschBilanzAgainst}`);
        } else {
          await opponentStatsRef.set(updated);
          console.log(`    ✅ Gegner ${aggregated.opponentDisplayName}: ${aggregated.gamesPlayed} Spiele aktualisiert`);
        }
      }
      
      console.log(`  ✅ Spieler ${playerName} verarbeitet`);
    }

    console.log('\n' + '='.repeat(120));
    if (DRY_RUN) {
      console.log('\n✅ DRY RUN abgeschlossen. Setze DRY_RUN = false zum Ausführen.\n');
    } else {
      console.log('\n✅ BACKFILL abgeschlossen. Alle Partner/Opponent-Stats wurden aktualisiert.\n');
    }
  } catch (error) {
    console.error('❌ Fehler beim Backfill:', error);
  }
}

backfillTournamentPartnerOpponentStats().catch(console.error);

