/**
 * ✅ FINALES BACKFILL: Partner & Opponent Stats
 * 
 * Dieses Script berechnet ALLE benötigten Felder für Partner/Opponent Stats
 * und unterstützt SOWOHL Regular Sessions als auch Tournament Sessions!
 * 
 * WICHTIG: Für Turniere müssen Partner/Gegner PRO SPIEL bestimmt werden!
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// ===== HILFSFUNKTIONEN =====

async function getAllPlayers() {
  console.log('\n📊 Lade alle Spieler...');
  const playersSnap = await db.collection('players').get();
  const players = playersSnap.docs.map(doc => {
    const data = doc.data();
    const { id: _, ...restOfData } = data;
    return { id: doc.id, ...restOfData };
  });
  console.log(`✅ ${players.length} Spieler gefunden`);
  return players;
}

/**
 * ✅ NEU: Erstellt eine Map von Player-IDs zu Display-Namen
 */
async function createPlayerNameMap() {
  console.log('\n📊 Lade Spielernamen...');
  const playersSnap = await db.collection('players').get();
  const nameMap = new Map();
  playersSnap.docs.forEach(doc => {
    const data = doc.data();
    nameMap.set(doc.id, data.displayName || 'Unbekannt');
  });
  console.log(`✅ ${nameMap.size} Spielernamen geladen`);
  return nameMap;
}

/**
 * ✅ NEU: Löscht alle bestehenden Partner/Opponent Stats
 */
async function deleteAllPartnerOpponentStats(playerId) {
  const batch = db.batch();
  let count = 0;
  
  // Lösche alle partnerStats
  const partnerStatsSnap = await db.collection(`players/${playerId}/partnerStats`).get();
  partnerStatsSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  
  // Lösche alle opponentStats
  const opponentStatsSnap = await db.collection(`players/${playerId}/opponentStats`).get();
  opponentStatsSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  
  if (count > 0) {
    await batch.commit();
  }
  
  return count;
}

async function getAllGroups() {
  console.log('\n📊 Lade alle Gruppen...');
  const groupsSnap = await db.collection('groups').get();
  const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`✅ ${groups.length} Gruppen gefunden`);
  return groups;
}

async function getGroupSessions(groupId) {
  const sessionsSnap = await db
    .collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .get();
  
  return sessionsSnap.docs.map(doc => ({
    id: doc.id,
    groupId,
    ...doc.data()
  }));
}

/**
 * ✅ NEU: Identifiziert Partner und Gegner PRO SPIEL (für Turniere kritisch!)
 */
function identifyPartnerAndOpponentsForGame(game, playerId) {
  const topPlayerIds = (game.teams?.top?.players || []).map(p => p.playerId).filter(Boolean);
  const bottomPlayerIds = (game.teams?.bottom?.players || []).map(p => p.playerId).filter(Boolean);
  
  let partner = null;
  let opponents = [];
  
  if (topPlayerIds.includes(playerId)) {
    partner = topPlayerIds.find(id => id !== playerId);
    opponents = bottomPlayerIds;
  } else if (bottomPlayerIds.includes(playerId)) {
    partner = bottomPlayerIds.find(id => id !== playerId);
    opponents = topPlayerIds;
  }
  
  return { partner, opponents };
}

/**
 * ✅ KORRIGIERT: Identifiziert Partner und Gegner für Regular Sessions
 * Verwendet jetzt session.teams statt Index-Berechnung (wie calculateSessionDelta)
 */
function identifyPartnerAndOpponents(session, playerId) {
  // ✅ KORREKTUR: Verwende session.teams direkt (wie in unifiedPlayerDataService.ts)
  if (!session.teams?.top?.players || !session.teams?.bottom?.players) {
    return { partner: null, opponents: [] };
  }
  
  // Bestimme Team des Spielers
  let playerTeam = null;
  if (session.teams.top.players.some(p => p.playerId === playerId)) {
    playerTeam = 'top';
  } else if (session.teams.bottom.players.some(p => p.playerId === playerId)) {
    playerTeam = 'bottom';
  }
  
  if (!playerTeam) {
    return { partner: null, opponents: [] };
  }
  
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // Partner: Spieler im gleichen Team
  const teamPlayers = session.teams[playerTeam].players || [];
  const partner = teamPlayers.find(p => p.playerId !== playerId);
  
  // Gegner: Spieler im gegnerischen Team
  const opponentPlayers = session.teams[opponentTeam].players || [];
  
  const getDisplayName = (player) => {
    if (player?.displayName) return player.displayName;
    if (session.playerNames?.[player.playerId]) return session.playerNames[player.playerId];
    return 'Unbekannt';
  };
  
  return {
    partner: partner ? {
      id: partner.playerId,
      displayName: getDisplayName(partner)
    } : null,
    opponents: opponentPlayers.map(p => ({
      id: p.playerId,
      displayName: getDisplayName(p)
    }))
  };
}

function didSessionDraw(session) {
  return session.winnerTeamKey === 'draw';
}

function getPlayerTeamFromSession(session, playerId) {
  // Check which team the player is on by looking at session.teams
  if (session.teams?.top?.players) {
    const isInTopTeam = session.teams.top.players.some(p => p.playerId === playerId);
    if (isInTopTeam) return 'top';
  }
  if (session.teams?.bottom?.players) {
    const isInBottomTeam = session.teams.bottom.players.some(p => p.playerId === playerId);
    if (isInBottomTeam) return 'bottom';
  }
  // Fallback: use participantPlayerIds index (may be incorrect for some sessions)
  const participantPlayerIds = session.participantPlayerIds || [];
  const playerIndex = participantPlayerIds.indexOf(playerId);
  if (playerIndex === -1) return null;
  return playerIndex < 2 ? 'top' : 'bottom';
}

function getTeamStats(session, team) {
  const finalStriche = session.finalStriche || {};
  const finalScores = session.finalScores || {};
  const eventCounts = session.eventCounts || {};
  const teamEvents = eventCounts[team] || {};
  
  const stricheRecord = finalStriche[team] || {};
  const totalStriche = (stricheRecord.matsch || 0) + (stricheRecord.berg || 0) + 
                       (stricheRecord.schneider || 0) + (stricheRecord.kontermatsch || 0) + 
                       (stricheRecord.sieg || 0);
  
  return {
    striche: totalStriche,
    points: finalScores[team] || 0,
    matschEvents: teamEvents.matsch || 0,
    schneiderEvents: teamEvents.schneider || 0,
    kontermatschEvents: teamEvents.kontermatsch || 0,
    weisPoints: (session.sessionTotalWeisPoints || {})[team] || 0
  };
}

/**
 * ✅ KRITISCH: Aggregiert Partner-Stats für einen Spieler
 * Unterstützt SOWOHL Regular Sessions als auch Tournament Sessions!
 */
async function aggregatePartnerStats(playerId, sessions, playerNameMap) {
  const partnerMap = new Map();
  
  for (const session of sessions) {
    // ✅ KRITISCH: Nur als Tournament erkennen wenn explizit markiert!
    const isTournament = Boolean(session.isTournamentSession || session.tournamentId);
    
    if (isTournament && session.gameResults) {
      // ✅ TOURNAMENT: Pro Spiel Partner/Gegner bestimmen!
      for (const game of session.gameResults) {
        const { partner, opponents } = identifyPartnerAndOpponentsForGame(game, playerId);
        if (!partner) continue;
        
        const gameTopPlayerIds = (game.teams?.top?.players || []).map(p => p.playerId).filter(Boolean);
        const gameBottomPlayerIds = (game.teams?.bottom?.players || []).map(p => p.playerId).filter(Boolean);
        
        let playerTeam = null;
        if (gameTopPlayerIds.includes(playerId)) {
          playerTeam = 'top';
        } else if (gameBottomPlayerIds.includes(playerId)) {
          playerTeam = 'bottom';
        }
        
        if (!playerTeam) continue;
        
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        
        // Game Stats
        const gamePointsMade = playerTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
        const gamePointsReceived = playerTeam === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
        
        const gameFinalStriche = game.finalStriche || {};
        const playerStricheRecord = gameFinalStriche[playerTeam] || {};
        const playerTotalStriche = (playerStricheRecord.sieg || 0) + (playerStricheRecord.berg || 0) + 
                                   (playerStricheRecord.matsch || 0) + (playerStricheRecord.schneider || 0) + 
                                   (playerStricheRecord.kontermatsch || 0);
        
        const opponentStricheRecord = gameFinalStriche[opponentTeam] || {};
        const opponentTotalStriche = (opponentStricheRecord.sieg || 0) + (opponentStricheRecord.berg || 0) + 
                                    (opponentStricheRecord.matsch || 0) + (opponentStricheRecord.schneider || 0) + 
                                    (opponentStricheRecord.kontermatsch || 0);
        
        const gameEventCounts = game.eventCounts || {};
        const playerEvents = gameEventCounts[playerTeam] || {};
        const opponentEvents = gameEventCounts[opponentTeam] || {};
        
        const didWin = game.winnerTeam === playerTeam;
        
        // Initialize partner stats
        if (!partnerMap.has(partner)) {
          const partnerDisplayName = playerNameMap.get(partner) || partner;
          partnerMap.set(partner, {
            partnerId: partner,
            partnerDisplayName: partnerDisplayName,
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
            lastPlayedWithTimestamp: null
          });
        }
        
        const stats = partnerMap.get(partner);
        
        // Games
        stats.gamesPlayedWith += 1;
        if (didWin) stats.gamesWonWith += 1;
        else stats.gamesLostWith += 1;
        
        // Scores
        stats.totalStricheDifferenceWith += playerTotalStriche - opponentTotalStriche;
        stats.totalPointsDifferenceWith += gamePointsMade - gamePointsReceived;
        
        // Events
        stats.matschEventsMadeWith += playerEvents.matsch || 0;
        stats.matschEventsReceivedWith += opponentEvents.matsch || 0;
        stats.schneiderEventsMadeWith += playerEvents.schneider || 0;
        stats.schneiderEventsReceivedWith += opponentEvents.schneider || 0;
        stats.kontermatschEventsMadeWith += playerEvents.kontermatsch || 0;
        stats.kontermatschEventsReceivedWith += opponentEvents.kontermatsch || 0;
        
        // Weis (aus game, falls vorhanden)
        const gameWeisPoints = game.weisPoints || {};
        const playerWeis = playerTeam === 'top' ? (gameWeisPoints.top || 0) : (gameWeisPoints.bottom || 0);
        const opponentWeis = playerTeam === 'top' ? (gameWeisPoints.bottom || 0) : (gameWeisPoints.top || 0);
        stats.totalWeisPointsWith += playerWeis;
        stats.totalWeisReceivedWith += opponentWeis;
        
        // Update Bilanzen
        stats.matschBilanzWith = stats.matschEventsMadeWith - stats.matschEventsReceivedWith;
        stats.schneiderBilanzWith = stats.schneiderEventsMadeWith - stats.schneiderEventsReceivedWith;
        stats.kontermatschBilanzWith = stats.kontermatschEventsMadeWith - stats.kontermatschEventsReceivedWith;
        stats.weisDifferenceWith = stats.totalWeisPointsWith - stats.totalWeisReceivedWith;
      }
    } else {
      // ✅ REGULAR SESSION: Verwende Session-Level Team-Zuordnung
      const { partner } = identifyPartnerAndOpponents(session, playerId);
      if (!partner) continue;
      
      const team = getPlayerTeamFromSession(session, playerId);
      if (!team) continue;
      const opponentTeam = team === 'top' ? 'bottom' : 'top';
      
      const playerTeamStats = getTeamStats(session, team);
      const opponentTeamStats = getTeamStats(session, opponentTeam);
      
      const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
      const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
      const gamesWon = gameWinsByTeam[team] || 0;
      const gamesLost = gameWinsByTeam[opponentTeam] || 0;
      
      const winnerTeamKey = session.winnerTeamKey;
      const isSessionWin = winnerTeamKey && winnerTeamKey === team;
      const isSessionDraw = didSessionDraw(session);
      const isSessionLoss = winnerTeamKey && winnerTeamKey === opponentTeam;
      
      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partnerId: partner.id,
          partnerDisplayName: partner.displayName,
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
          lastPlayedWithTimestamp: null
        });
      }
      
      const stats = partnerMap.get(partner.id);
      
      // Sessions (nur für normale Sessions, nicht Turniere)
      stats.sessionsPlayedWith += 1;
      if (isSessionWin) stats.sessionsWonWith += 1;
      if (isSessionLoss) stats.sessionsLostWith += 1;
      if (isSessionDraw) stats.sessionsDrawWith += 1;
      
      // Games
      stats.gamesPlayedWith += gamesPlayed;
      stats.gamesWonWith += gamesWon;
      stats.gamesLostWith += gamesLost;
      
      // Scores
      stats.totalStricheDifferenceWith += playerTeamStats.striche - opponentTeamStats.striche;
      stats.totalPointsDifferenceWith += playerTeamStats.points - opponentTeamStats.points;
      
      // Events
      stats.matschEventsMadeWith += playerTeamStats.matschEvents;
      stats.matschEventsReceivedWith += opponentTeamStats.matschEvents;
      stats.schneiderEventsMadeWith += playerTeamStats.schneiderEvents;
      stats.schneiderEventsReceivedWith += opponentTeamStats.schneiderEvents;
      stats.kontermatschEventsMadeWith += playerTeamStats.kontermatschEvents;
      stats.kontermatschEventsReceivedWith += opponentTeamStats.kontermatschEvents;
      
      // Weis
      stats.totalWeisPointsWith += playerTeamStats.weisPoints;
      stats.totalWeisReceivedWith += opponentTeamStats.weisPoints;
      
      // Update Bilanzen
      stats.matschBilanzWith = stats.matschEventsMadeWith - stats.matschEventsReceivedWith;
      stats.schneiderBilanzWith = stats.schneiderEventsMadeWith - stats.schneiderEventsReceivedWith;
      stats.kontermatschBilanzWith = stats.kontermatschEventsMadeWith - stats.kontermatschEventsReceivedWith;
      stats.weisDifferenceWith = stats.totalWeisPointsWith - stats.totalWeisReceivedWith;
      
      // Rundentempo
      const playerRounds = session.aggregatedRoundDurationsByPlayer?.[playerId];
      const partnerRounds = session.aggregatedRoundDurationsByPlayer?.[partner.id];
      
      if ((playerRounds && playerRounds.roundCount > 0) || (partnerRounds && partnerRounds.roundCount > 0)) {
        const playerDuration = playerRounds?.totalDuration || 0;
        const partnerDuration = partnerRounds?.totalDuration || 0;
        const playerCount = playerRounds?.roundCount || 0;
        const partnerCount = partnerRounds?.roundCount || 0;
        
        stats.totalRoundDurationWith += playerDuration + partnerDuration;
        stats.totalRoundsWith += playerCount + partnerCount;
      }
      
      // Trumpfansagen
      const playerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
      const partnerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[partner.id] || {};
      
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        stats.trumpfStatistikWith[farbe] = (stats.trumpfStatistikWith[farbe] || 0) + count;
      });
      Object.entries(partnerTrumpfs).forEach(([farbe, count]) => {
        stats.trumpfStatistikWith[farbe] = (stats.trumpfStatistikWith[farbe] || 0) + count;
      });
      
      // Timestamp
      const sessionTimestamp = session.startedAt || session.createdAt;
      if (sessionTimestamp) {
        const timestampMillis = sessionTimestamp.toMillis ? sessionTimestamp.toMillis() : (sessionTimestamp.seconds * 1000);
        if (!stats.lastPlayedWithTimestamp || timestampMillis > stats.lastPlayedWithTimestamp) {
          stats.lastPlayedWithTimestamp = timestampMillis;
        }
      }
    }
  }
  
  // Berechne Win-Rates
  for (const [partnerId, stats] of partnerMap.entries()) {
    stats.sessionWinRateWith = stats.sessionsPlayedWith > 0 ? stats.sessionsWonWith / stats.sessionsPlayedWith : 0;
    stats.gameWinRateWith = stats.gamesPlayedWith > 0 ? stats.gamesWonWith / stats.gamesPlayedWith : 0;
    stats.avgRoundDurationWith = stats.totalRoundsWith > 0 ? stats.totalRoundDurationWith / stats.totalRoundsWith : 0;
  }
  
  return partnerMap;
}

/**
 * ✅ KRITISCH: Aggregiert Opponent-Stats für einen Spieler
 * Unterstützt SOWOHL Regular Sessions als auch Tournament Sessions!
 */
async function aggregateOpponentStats(playerId, sessions, playerNameMap) {
  const opponentMap = new Map();
  
  for (const session of sessions) {
    // ✅ KRITISCH: Nur als Tournament erkennen wenn explizit markiert!
    const isTournament = Boolean(session.isTournamentSession || session.tournamentId);
    
    if (isTournament && session.gameResults) {
      // ✅ TOURNAMENT: Pro Spiel Partner/Gegner bestimmen!
      for (const game of session.gameResults) {
        const { partner, opponents } = identifyPartnerAndOpponentsForGame(game, playerId);
        if (opponents.length === 0) continue;
        
        const gameTopPlayerIds = (game.teams?.top?.players || []).map(p => p.playerId).filter(Boolean);
        const gameBottomPlayerIds = (game.teams?.bottom?.players || []).map(p => p.playerId).filter(Boolean);
        
        let playerTeam = null;
        if (gameTopPlayerIds.includes(playerId)) {
          playerTeam = 'top';
        } else if (gameBottomPlayerIds.includes(playerId)) {
          playerTeam = 'bottom';
        }
        
        if (!playerTeam) continue;
        
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        
        // Game Stats
        const gamePointsMade = playerTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
        const gamePointsReceived = playerTeam === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
        
        const gameFinalStriche = game.finalStriche || {};
        const playerStricheRecord = gameFinalStriche[playerTeam] || {};
        const playerTotalStriche = (playerStricheRecord.sieg || 0) + (playerStricheRecord.berg || 0) + 
                                   (playerStricheRecord.matsch || 0) + (playerStricheRecord.schneider || 0) + 
                                   (playerStricheRecord.kontermatsch || 0);
        
        const opponentStricheRecord = gameFinalStriche[opponentTeam] || {};
        const opponentTotalStriche = (opponentStricheRecord.sieg || 0) + (opponentStricheRecord.berg || 0) + 
                                    (opponentStricheRecord.matsch || 0) + (opponentStricheRecord.schneider || 0) + 
                                    (opponentStricheRecord.kontermatsch || 0);
        
        const gameEventCounts = game.eventCounts || {};
        const playerEvents = gameEventCounts[playerTeam] || {};
        const opponentEvents = gameEventCounts[opponentTeam] || {};
        
        const didWin = game.winnerTeam === playerTeam;
        
        for (const opponentId of opponents) {
          // Initialize opponent stats
          if (!opponentMap.has(opponentId)) {
            const opponentDisplayName = playerNameMap.get(opponentId) || opponentId;
            opponentMap.set(opponentId, {
              opponentId: opponentId,
              opponentDisplayName: opponentDisplayName,
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
              lastPlayedAgainstTimestamp: null
            });
          }
          
          const stats = opponentMap.get(opponentId);
          
          // Games
          stats.gamesPlayedAgainst += 1;
          if (didWin) stats.gamesWonAgainst += 1;
          else stats.gamesLostAgainst += 1;
          
          // Scores
          stats.totalStricheDifferenceAgainst += playerTotalStriche - opponentTotalStriche;
          stats.totalPointsDifferenceAgainst += gamePointsMade - gamePointsReceived;
          
          // Events
          stats.matschEventsMadeAgainst += playerEvents.matsch || 0;
          stats.matschEventsReceivedAgainst += opponentEvents.matsch || 0;
          stats.schneiderEventsMadeAgainst += playerEvents.schneider || 0;
          stats.schneiderEventsReceivedAgainst += opponentEvents.schneider || 0;
          stats.kontermatschEventsMadeAgainst += playerEvents.kontermatsch || 0;
          stats.kontermatschEventsReceivedAgainst += opponentEvents.kontermatsch || 0;
          
          // Weis
          const gameWeisPoints = game.weisPoints || {};
          const playerWeis = playerTeam === 'top' ? (gameWeisPoints.top || 0) : (gameWeisPoints.bottom || 0);
          const opponentWeis = playerTeam === 'top' ? (gameWeisPoints.bottom || 0) : (gameWeisPoints.top || 0);
          stats.totalWeisPointsAgainst += playerWeis;
          stats.totalWeisReceivedAgainst += opponentWeis;
          
          // Update Bilanzen
          stats.matschBilanzAgainst = stats.matschEventsMadeAgainst - stats.matschEventsReceivedAgainst;
          stats.schneiderBilanzAgainst = stats.schneiderEventsMadeAgainst - stats.schneiderEventsReceivedAgainst;
          stats.kontermatschBilanzAgainst = stats.kontermatschEventsMadeAgainst - stats.kontermatschEventsReceivedAgainst;
          stats.weisDifferenceAgainst = stats.totalWeisPointsAgainst - stats.totalWeisReceivedAgainst;
          
          // Timestamp
          const gameTimestamp = game.completedAt || session.startedAt || session.createdAt;
          if (gameTimestamp) {
            const timestampMillis = gameTimestamp.toMillis ? gameTimestamp.toMillis() : (gameTimestamp.seconds * 1000);
            if (!stats.lastPlayedAgainstTimestamp || timestampMillis > stats.lastPlayedAgainstTimestamp) {
              stats.lastPlayedAgainstTimestamp = timestampMillis;
            }
          }
        }
      }
    } else {
      // ✅ REGULAR SESSION: Verwende Session-Level Team-Zuordnung
      const { opponents } = identifyPartnerAndOpponents(session, playerId);
      if (opponents.length === 0) continue;
      
      const team = getPlayerTeamFromSession(session, playerId);
      if (!team) continue;
      const opponentTeam = team === 'top' ? 'bottom' : 'top';
      
      const playerTeamStats = getTeamStats(session, team);
      const opponentTeamStats = getTeamStats(session, opponentTeam);
      
      const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
      const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
      const gamesWon = gameWinsByTeam[team] || 0;
      const gamesLost = gameWinsByTeam[opponentTeam] || 0;
      
      const winnerTeamKey = session.winnerTeamKey;
      const isSessionWin = winnerTeamKey && winnerTeamKey === team;
      const isSessionDraw = didSessionDraw(session);
      const isSessionLoss = winnerTeamKey && winnerTeamKey === opponentTeam;
      
      for (const opponent of opponents) {
        if (!opponentMap.has(opponent.id)) {
          opponentMap.set(opponent.id, {
            opponentId: opponent.id,
            opponentDisplayName: opponent.displayName,
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
            lastPlayedAgainstTimestamp: null
          });
        }
        
        const stats = opponentMap.get(opponent.id);
        
        // Sessions
        stats.sessionsPlayedAgainst += 1;
        if (isSessionWin) stats.sessionsWonAgainst += 1;
        if (isSessionLoss) stats.sessionsLostAgainst += 1;
        if (isSessionDraw) stats.sessionsDrawAgainst += 1;
        
        // Games
        stats.gamesPlayedAgainst += gamesPlayed;
        stats.gamesWonAgainst += gamesWon;
        stats.gamesLostAgainst += gamesLost;
        
        // Scores
        stats.totalStricheDifferenceAgainst += playerTeamStats.striche - opponentTeamStats.striche;
        stats.totalPointsDifferenceAgainst += playerTeamStats.points - opponentTeamStats.points;
        
        // Events
        stats.matschEventsMadeAgainst += playerTeamStats.matschEvents;
        stats.matschEventsReceivedAgainst += opponentTeamStats.matschEvents;
        stats.schneiderEventsMadeAgainst += playerTeamStats.schneiderEvents;
        stats.schneiderEventsReceivedAgainst += opponentTeamStats.schneiderEvents;
        stats.kontermatschEventsMadeAgainst += playerTeamStats.kontermatschEvents;
        stats.kontermatschEventsReceivedAgainst += opponentTeamStats.kontermatschEvents;
        
        // Weis
        stats.totalWeisPointsAgainst += playerTeamStats.weisPoints;
        stats.totalWeisReceivedAgainst += opponentTeamStats.weisPoints;
        
        // Update Bilanzen
        stats.matschBilanzAgainst = stats.matschEventsMadeAgainst - stats.matschEventsReceivedAgainst;
        stats.schneiderBilanzAgainst = stats.schneiderEventsMadeAgainst - stats.schneiderEventsReceivedAgainst;
        stats.kontermatschBilanzAgainst = stats.kontermatschEventsMadeAgainst - stats.kontermatschEventsReceivedAgainst;
        stats.weisDifferenceAgainst = stats.totalWeisPointsAgainst - stats.totalWeisReceivedAgainst;
        
        // Rundentempo
        const playerRounds = session.aggregatedRoundDurationsByPlayer?.[playerId];
        const opponentRounds = session.aggregatedRoundDurationsByPlayer?.[opponent.id];
        
        if ((playerRounds && playerRounds.roundCount > 0) || (opponentRounds && opponentRounds.roundCount > 0)) {
          const playerDuration = playerRounds?.totalDuration || 0;
          const opponentDuration = opponentRounds?.totalDuration || 0;
          const playerCount = playerRounds?.roundCount || 0;
          const opponentCount = opponentRounds?.roundCount || 0;
          
          stats.totalRoundDurationAgainst += playerDuration + opponentDuration;
          stats.totalRoundsAgainst += playerCount + opponentCount;
        }
        
        // Trumpfansagen
        const playerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
        Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
          stats.trumpfStatistikAgainst[farbe] = (stats.trumpfStatistikAgainst[farbe] || 0) + count;
        });
        
        // Timestamp
        const sessionTimestamp = session.startedAt || session.createdAt;
        if (sessionTimestamp) {
          const timestampMillis = sessionTimestamp.toMillis ? sessionTimestamp.toMillis() : (sessionTimestamp.seconds * 1000);
          if (!stats.lastPlayedAgainstTimestamp || timestampMillis > stats.lastPlayedAgainstTimestamp) {
            stats.lastPlayedAgainstTimestamp = timestampMillis;
          }
        }
      }
    }
  }
  
  // Berechne Win-Rates
  for (const [opponentId, stats] of opponentMap.entries()) {
    stats.sessionWinRateAgainst = stats.sessionsPlayedAgainst > 0 ? stats.sessionsWonAgainst / stats.sessionsPlayedAgainst : 0;
    stats.gameWinRateAgainst = stats.gamesPlayedAgainst > 0 ? stats.gamesWonAgainst / stats.gamesPlayedAgainst : 0;
    stats.avgRoundDurationAgainst = stats.totalRoundsAgainst > 0 ? stats.totalRoundDurationAgainst / stats.totalRoundsAgainst : 0;
  }
  
  return opponentMap;
}

async function writePartnerStats(playerId, partnerMap) {
  const batch = db.batch();
  let count = 0;
  
  for (const [partnerId, stats] of partnerMap.entries()) {
    const docRef = db.doc(`players/${playerId}/partnerStats/${partnerId}`);
    batch.set(docRef, stats, { merge: true });
    count++;
    
    if (count % 400 === 0) {
      await batch.commit();
      console.log(`  ✅ ${count} Partner-Stats geschrieben (Batch committed)`);
    }
  }
  
  if (count % 400 !== 0) {
    await batch.commit();
  }
  
  return count;
}

async function writeOpponentStats(playerId, opponentMap) {
  const batch = db.batch();
  let count = 0;
  
  for (const [opponentId, stats] of opponentMap.entries()) {
    const docRef = db.doc(`players/${playerId}/opponentStats/${opponentId}`);
    batch.set(docRef, stats, { merge: true });
    count++;
    
    if (count % 400 === 0) {
      await batch.commit();
      console.log(`  ✅ ${count} Opponent-Stats geschrieben (Batch committed)`);
    }
  }
  
  if (count % 400 !== 0) {
    await batch.commit();
  }
  
  return count;
}

// ===== MAIN BACKFILL FUNCTION =====

async function backfillPartnerOpponentStats() {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
  
  console.log('\n🚀 ===== FINALES BACKFILL: Partner & Opponent Stats =====\n');
  console.log(`Mode: ${isDryRun ? '🧪 DRY-RUN (nur Berechnung, keine Schreibvorgänge)' : '✅ EXECUTE (schreibt in Datenbank)'}\n`);
  console.log('✅ Unterstützt SOWOHL Regular Sessions als auch Tournament Sessions!\n');
  
  try {
    const players = await getAllPlayers();
    const groups = await getAllGroups();
    const playerNameMap = await createPlayerNameMap();
    
    console.log('\n📊 Lade alle Sessions...');
    const allSessions = [];
    for (const group of groups) {
      const sessions = await getGroupSessions(group.id);
      allSessions.push(...sessions);
      console.log(`  ✅ Gruppe ${group.name || group.id}: ${sessions.length} Sessions`);
    }
    console.log(`✅ Insgesamt ${allSessions.length} Sessions gefunden\n`);
    
    let totalPartnersWritten = 0;
    let totalOpponentsWritten = 0;
    let totalDeleted = 0;
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      console.log(`\n[${i + 1}/${players.length}] 🔄 Verarbeite ${player.displayName || player.id}...`);
      
      // ✅ ZUERST: Lösche alle bestehenden Stats (nur wenn nicht Dry-Run)
      let deletedCount = 0;
      if (!isDryRun) {
        deletedCount = await deleteAllPartnerOpponentStats(player.id);
      if (deletedCount > 0) {
        console.log(`  🗑️ ${deletedCount} alte Stats gelöscht`);
        totalDeleted += deletedCount;
        }
      } else {
        // Dry-Run: Zähle nur
        const partnerStatsSnap = await db.collection(`players/${player.id}/partnerStats`).get();
        const opponentStatsSnap = await db.collection(`players/${player.id}/opponentStats`).get();
        deletedCount = partnerStatsSnap.size + opponentStatsSnap.size;
        if (deletedCount > 0) {
          console.log(`  📊 ${deletedCount} alte Stats würden gelöscht werden`);
        }
      }
      
      const playerSessions = allSessions.filter(session => {
        const participantIds = session.participantPlayerIds || [];
        return participantIds.includes(player.id);
      });
      
      if (playerSessions.length === 0) {
        console.log(`  ℹ️ Keine Sessions gefunden für ${player.displayName || player.id}`);
        continue;
      }
      
      console.log(`  📊 ${playerSessions.length} Sessions gefunden`);
      
      const partnerMap = await aggregatePartnerStats(player.id, playerSessions, playerNameMap);
      console.log(`  📊 ${partnerMap.size} Partner identifiziert`);
      
      const opponentMap = await aggregateOpponentStats(player.id, playerSessions, playerNameMap);
      console.log(`  📊 ${opponentMap.size} Gegner identifiziert`);
      
      let partnersWritten = 0;
      let opponentsWritten = 0;
      
      if (!isDryRun) {
        partnersWritten = await writePartnerStats(player.id, partnerMap);
        opponentsWritten = await writeOpponentStats(player.id, opponentMap);
      
      totalPartnersWritten += partnersWritten;
      totalOpponentsWritten += opponentsWritten;
      
      console.log(`  ✅ ${partnersWritten} Partner-Stats geschrieben`);
      console.log(`  ✅ ${opponentsWritten} Opponent-Stats geschrieben`);
      } else {
        partnersWritten = partnerMap.size;
        opponentsWritten = opponentMap.size;
        
        totalPartnersWritten += partnersWritten;
        totalOpponentsWritten += opponentsWritten;
        
        console.log(`  📊 ${partnersWritten} Partner-Stats würden geschrieben werden`);
        console.log(`  📊 ${opponentsWritten} Opponent-Stats würden geschrieben werden`);
      }
    }
    
    console.log('\n\n🎉 ===== BACKFILL ABGESCHLOSSEN =====');
    if (isDryRun) {
      console.log(`📊 ${totalDeleted} alte Stats würden gelöscht werden`);
      console.log(`📊 ${players.length} Spieler würden verarbeitet werden`);
      console.log(`📊 ${totalPartnersWritten} Partner-Stats würden geschrieben werden`);
      console.log(`📊 ${totalOpponentsWritten} Opponent-Stats würden geschrieben werden`);
      console.log('\n💡 Führe ohne --dry-run aus, um wirklich zu schreiben!\n');
    } else {
    console.log(`🗑️ ${totalDeleted} alte Stats gelöscht`);
    console.log(`✅ ${players.length} Spieler verarbeitet`);
    console.log(`✅ ${totalPartnersWritten} Partner-Stats geschrieben`);
    console.log(`✅ ${totalOpponentsWritten} Opponent-Stats geschrieben`);
    console.log('\n🔥 Alle historischen Partner/Opponent-Daten sind jetzt vollständig!\n');
    }
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Backfill:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

backfillPartnerOpponentStats()
  .then(() => {
    console.log('✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

