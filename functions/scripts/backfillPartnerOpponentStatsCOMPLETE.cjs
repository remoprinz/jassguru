/**
 * ✅ VOLLSTÄNDIGES BACKFILL: Partner & Opponent Stats
 * 
 * Dieses Script berechnet ALLE benötigten Felder für Partner/Opponent Stats
 * und schreibt sie in die Subcollections unter /players/{playerId}/
 * 
 * BERECHNET:
 * - SESSIONS: sessionsPlayed, sessionsWon, sessionsLost, sessionsDraw, sessionWinRate
 * - GAMES: gamesPlayed, gamesWon, gamesLost, gameWinRate
 * - SCORES: totalStricheDifference, totalPointsDifference
 * - EVENTS: matsch/schneider/kontermatsch (made/received/bilanz)
 * - WEIS: totalWeisPoints, totalWeisReceived, weisDifference
 * - TEMPO: totalRoundDuration, totalRounds, avgRoundDuration
 * - TRUMPF: trumpfStatistik
 * 
 * WICHTIG: Verwendet NEUE Datenstruktur mit vollständiger Berechnung!
 */

const admin = require('firebase-admin');
const path = require('path');

// Service Account Key laden
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// ===== HILFSFUNKTIONEN =====

/**
 * Lädt alle Spieler
 */
async function getAllPlayers() {
  console.log('\n📊 Lade alle Spieler...');
  const playersSnap = await db.collection('players').get();
  const players = playersSnap.docs.map(doc => {
    const data = doc.data();
    const { id: _, ...restOfData } = data;
    return {
      id: doc.id,
      ...restOfData
    };
  });
  console.log(`✅ ${players.length} Spieler gefunden`);
  return players;
}

/**
 * Lädt alle Groups
 */
async function getAllGroups() {
  console.log('\n📊 Lade alle Gruppen...');
  const groupsSnap = await db.collection('groups').get();
  const groups = groupsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  console.log(`✅ ${groups.length} Gruppen gefunden`);
  return groups;
}

/**
 * Lädt alle Sessions einer Gruppe
 */
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
 * Identifiziert Partner und Gegner für einen Spieler in einer Session
 */
function identifyPartnerAndOpponents(session, playerId) {
  const participantPlayerIds = session.participantPlayerIds || [];
  const playerNames = session.playerNames || {};
  
  if (participantPlayerIds.length !== 4) {
    return { partner: null, opponents: [] };
  }
  
  const playerIndex = participantPlayerIds.indexOf(playerId);
  if (playerIndex === -1) {
    return { partner: null, opponents: [] };
  }
  
  const getDisplayName = (targetPlayerId, indexInArray) => {
    if (playerNames[targetPlayerId]) return playerNames[targetPlayerId];
    if (playerNames[indexInArray + 1]) return playerNames[indexInArray + 1];
    if (playerNames[indexInArray]) return playerNames[indexInArray];
    
    const topPlayer = session.teams?.top?.players?.find(p => p.playerId === targetPlayerId);
    if (topPlayer?.displayName) return topPlayer.displayName;
    const bottomPlayer = session.teams?.bottom?.players?.find(p => p.playerId === targetPlayerId);
    if (bottomPlayer?.displayName) return bottomPlayer.displayName;
    
    return 'Unbekannt';
  };
  
  // Turnier-Support
  if (session.teams && session.teams.top && session.teams.bottom) {
    const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
    const bottomPlayerIds = (session.teams.bottom.players || []).map(p => p.playerId);
    
    let partnerId = null;
    let opponentIds = [];
    
    if (topPlayerIds.includes(playerId)) {
      partnerId = topPlayerIds.find(id => id !== playerId);
      opponentIds = bottomPlayerIds;
    } else if (bottomPlayerIds.includes(playerId)) {
      partnerId = bottomPlayerIds.find(id => id !== playerId);
      opponentIds = topPlayerIds;
    }
    
    if (!partnerId) {
      return { partner: null, opponents: [] };
    }
    
    const partnerIndexInAll = participantPlayerIds.indexOf(partnerId);
    
    return {
      partner: {
        id: partnerId,
        displayName: getDisplayName(partnerId, partnerIndexInAll)
      },
      opponents: opponentIds.map(id => {
        const indexInAll = participantPlayerIds.indexOf(id);
        return {
          id,
          displayName: getDisplayName(id, indexInAll)
        };
      })
    };
  }
  
  // Normale Session
  const partnerIndex = (playerIndex + 2) % 4;
  const partnerId = participantPlayerIds[partnerIndex];
  const opponents = participantPlayerIds.filter((id, idx) => idx !== playerIndex && idx !== partnerIndex);
  
  return {
    partner: {
      id: partnerId,
      displayName: getDisplayName(partnerId, partnerIndex)
    },
    opponents: opponents.map((id, idx) => ({
      id,
      displayName: getDisplayName(id, participantPlayerIds.indexOf(id))
    }))
  };
}

/**
 * Bestimmt, ob der Spieler gewonnen hat
 */
function didPlayerWin(session, playerId) {
  const participantPlayerIds = session.participantPlayerIds || [];
  const playerIndex = participantPlayerIds.indexOf(playerId);
  
  if (playerIndex === -1) return false;
  
  let team = null;
  
  if (session.teams && session.teams.top && session.teams.bottom) {
    const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
    const bottomPlayerIds = (session.teams.bottom.players || []).map(p => p.playerId);
    
    if (topPlayerIds.includes(playerId)) {
      team = 'top';
    } else if (bottomPlayerIds.includes(playerId)) {
      team = 'bottom';
    }
  } else {
    team = playerIndex < 2 ? 'top' : 'bottom';
  }
  
  if (!team) return false;
  
  const teamStats = session.teamStats || {};
  const topStriche = teamStats.top?.totalStriche || 0;
  const bottomStriche = teamStats.bottom?.totalStriche || 0;
  
  if (team === 'top') {
    return topStriche > bottomStriche;
  } else {
    return bottomStriche > topStriche;
  }
}

/**
 * Bestimmt ob Session Unentschieden
 */
function didSessionDraw(session) {
  return session.winnerTeamKey === 'draw';
}

/**
 * Berechnet Team Stats
 */
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
 * Aggregiert Partner-Stats für einen Spieler
 */
async function aggregatePartnerStats(playerId, sessions) {
  const partnerMap = new Map();
  
  for (const session of sessions) {
    const { partner } = identifyPartnerAndOpponents(session, playerId);
    if (!partner) continue;
    
    let team = null;
    if (session.teams && session.teams.top && session.teams.bottom) {
      const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
      if (topPlayerIds.includes(playerId)) {
        team = 'top';
      } else {
        team = 'bottom';
      }
    } else {
      const participantPlayerIds = session.participantPlayerIds || [];
      const playerIndex = participantPlayerIds.indexOf(playerId);
      team = playerIndex < 2 ? 'top' : 'bottom';
    }
    
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
        // SESSIONS
        sessionsPlayedWith: 0,
        sessionsWonWith: 0,
        sessionsLostWith: 0,
        sessionsDrawWith: 0,
        sessionWinRateWith: 0,
        // GAMES
        gamesPlayedWith: 0,
        gamesWonWith: 0,
        gamesLostWith: 0,
        gameWinRateWith: 0, // ✅ KEINE DRAWS bei Games!
        // SCORES
        totalStricheDifferenceWith: 0,
        totalPointsDifferenceWith: 0,
        // EVENTS
        matschBilanzWith: 0,
        matschEventsMadeWith: 0,
        matschEventsReceivedWith: 0,
        schneiderBilanzWith: 0,
        schneiderEventsMadeWith: 0,
        schneiderEventsReceivedWith: 0,
        kontermatschBilanzWith: 0,
        kontermatschEventsMadeWith: 0,
        kontermatschEventsReceivedWith: 0,
        // WEIS
        totalWeisPointsWith: 0,
        totalWeisReceivedWith: 0,
        weisDifferenceWith: 0,
        // TEMPO
        totalRoundDurationWith: 0,
        totalRoundsWith: 0,
        avgRoundDurationWith: 0,
        // TRUMPF
        trumpfStatistikWith: {},
        // ZEIT
        lastPlayedWithTimestamp: null
      });
    }
    
    const stats = partnerMap.get(partner.id);
    
    // Sessions (nur für normale Sessions, nicht Turniere)
    if (!session.isTournamentSession) {
      stats.sessionsPlayedWith += 1;
      if (isSessionWin) stats.sessionsWonWith += 1;
      if (isSessionLoss) stats.sessionsLostWith += 1;
      if (isSessionDraw) stats.sessionsDrawWith += 1;
    }
    
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
  
  // Berechne Win-Rates
  for (const [partnerId, stats] of partnerMap.entries()) {
    stats.sessionWinRateWith = stats.sessionsPlayedWith > 0 ? stats.sessionsWonWith / stats.sessionsPlayedWith : 0;
    stats.gameWinRateWith = stats.gamesPlayedWith > 0 ? stats.gamesWonWith / stats.gamesPlayedWith : 0;
    stats.avgRoundDurationWith = stats.totalRoundsWith > 0 ? stats.totalRoundDurationWith / stats.totalRoundsWith : 0;
  }
  
  return partnerMap;
}

/**
 * Aggregiert Opponent-Stats für einen Spieler
 */
async function aggregateOpponentStats(playerId, sessions) {
  const opponentMap = new Map();
  
  for (const session of sessions) {
    const { opponents } = identifyPartnerAndOpponents(session, playerId);
    if (opponents.length === 0) continue;
    
    let team = null;
    if (session.teams && session.teams.top && session.teams.bottom) {
      const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
      if (topPlayerIds.includes(playerId)) {
        team = 'top';
      } else {
        team = 'bottom';
      }
    } else {
      const participantPlayerIds = session.participantPlayerIds || [];
      const playerIndex = participantPlayerIds.indexOf(playerId);
      team = playerIndex < 2 ? 'top' : 'bottom';
    }
    
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
          // SESSIONS
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          sessionsLostAgainst: 0,
          sessionsDrawAgainst: 0,
          sessionWinRateAgainst: 0,
          // GAMES
          gamesPlayedAgainst: 0,
          gamesWonAgainst: 0,
          gamesLostAgainst: 0,
          gameWinRateAgainst: 0, // ✅ KEINE DRAWS bei Games!
          // SCORES
          totalStricheDifferenceAgainst: 0,
          totalPointsDifferenceAgainst: 0,
          // EVENTS
          matschBilanzAgainst: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          schneiderBilanzAgainst: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
          kontermatschBilanzAgainst: 0,
          kontermatschEventsMadeAgainst: 0,
          kontermatschEventsReceivedAgainst: 0,
          // WEIS
          totalWeisPointsAgainst: 0,
          totalWeisReceivedAgainst: 0,
          weisDifferenceAgainst: 0,
          // TEMPO
          totalRoundDurationAgainst: 0,
          totalRoundsAgainst: 0,
          avgRoundDurationAgainst: 0,
          // TRUMPF
          trumpfStatistikAgainst: {},
          // ZEIT
          lastPlayedAgainstTimestamp: null
        });
      }
      
      const stats = opponentMap.get(opponent.id);
      
      // Sessions (nur für normale Sessions, nicht Turniere)
      if (!session.isTournamentSession) {
        stats.sessionsPlayedAgainst += 1;
        if (isSessionWin) stats.sessionsWonAgainst += 1;
        if (isSessionLoss) stats.sessionsLostAgainst += 1;
        if (isSessionDraw) stats.sessionsDrawAgainst += 1;
      }
      
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
      const timestamp2 = session.startedAt || session.createdAt;
      if (timestamp2) {
        const timestampMillis = timestamp2.toMillis ? timestamp2.toMillis() : (timestamp2.seconds * 1000);
        if (!stats.lastPlayedAgainstTimestamp || timestampMillis > stats.lastPlayedAgainstTimestamp) {
          stats.lastPlayedAgainstTimestamp = timestampMillis;
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

/**
 * Schreibt Partner-Stats in Firestore
 */
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

/**
 * Schreibt Opponent-Stats in Firestore
 */
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
  console.log('\n🚀 ===== VOLLSTÄNDIGES BACKFILL: Partner & Opponent Stats =====\n');
  
  try {
    const players = await getAllPlayers();
    const groups = await getAllGroups();
    
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
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      console.log(`\n[${i + 1}/${players.length}] 🔄 Verarbeite ${player.displayName || player.id}...`);
      
      const playerSessions = allSessions.filter(session => {
        const participantIds = session.participantPlayerIds || [];
        return participantIds.includes(player.id);
      });
      
      if (playerSessions.length === 0) {
        console.log(`  ℹ️ Keine Sessions gefunden für ${player.displayName || player.id}`);
        continue;
      }
      
      console.log(`  📊 ${playerSessions.length} Sessions gefunden`);
      
      const partnerMap = await aggregatePartnerStats(player.id, playerSessions);
      console.log(`  📊 ${partnerMap.size} Partner identifiziert`);
      
      const opponentMap = await aggregateOpponentStats(player.id, playerSessions);
      console.log(`  📊 ${opponentMap.size} Gegner identifiziert`);
      
      const partnersWritten = await writePartnerStats(player.id, partnerMap);
      const opponentsWritten = await writeOpponentStats(player.id, opponentMap);
      
      totalPartnersWritten += partnersWritten;
      totalOpponentsWritten += opponentsWritten;
      
      console.log(`  ✅ ${partnersWritten} Partner-Stats geschrieben`);
      console.log(`  ✅ ${opponentsWritten} Opponent-Stats geschrieben`);
    }
    
    console.log('\n\n🎉 ===== BACKFILL ABGESCHLOSSEN =====');
    console.log(`✅ ${players.length} Spieler verarbeitet`);
    console.log(`✅ ${totalPartnersWritten} Partner-Stats geschrieben`);
    console.log(`✅ ${totalOpponentsWritten} Opponent-Stats geschrieben`);
    console.log('\n🔥 Alle historischen Partner/Opponent-Daten sind jetzt vollständig!\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Backfill:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// ===== SCRIPT AUSFÜHRUNG =====

backfillPartnerOpponentStats()
  .then(() => {
    console.log('✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

