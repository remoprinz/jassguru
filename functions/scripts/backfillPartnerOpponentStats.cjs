/**
 * ✅ BACKFILL SCRIPT: Partner & Opponent Stats
 * 
 * Dieser Script liest ALLE historischen Sessions aus jassGameSummaries
 * und berechnet Partner/Opponent Stats für jeden Spieler NEU.
 * 
 * Zweck:
 * - Füllt players/{playerId}/partnerStats/{partnerId} mit ALLEN benötigten Feldern
 * - Füllt players/{playerId}/opponentStats/{opponentId} mit ALLEN benötigten Feldern
 * - Stellt sicher, dass ProfileView.tsx vollständige Daten hat
 * 
 * WICHTIG: Dieses Script muss VOR der Frontend-Migration laufen!
 */

const admin = require('firebase-admin');
const path = require('path');

// ✅ Service Account Key laden
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
    // ✅ CRITICAL FIX: Use Firestore document ID as player.id, not document.id from data!
    // Remove 'id' from data to avoid override
    const { id: _, ...restOfData } = data;
    return {
      id: doc.id,  // Firestore document ID
      ...restOfData
    };
  });
  console.log(`✅ ${players.length} Spieler gefunden`);
  return players;
}

/**
 * Lädt alle Groups (um Sessions zu finden)
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
 * ✅ KORRIGIERT: Unterstützt sowohl normale Sessions als auch Turniere!
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
  
  // ✅ HELPER: Hole Display Name für einen Player ID (mit verschiedenen Key-Formaten)
  const getDisplayName = (targetPlayerId, indexInArray) => {
    // 1. Versuche modernes Format: { [playerId]: string }
    if (playerNames[targetPlayerId]) return playerNames[targetPlayerId];
    
    // 2. Versuche positionales Format: { [position]: string } (1-basiert)
    if (playerNames[indexInArray + 1]) return playerNames[indexInArray + 1];
    if (playerNames[indexInArray]) return playerNames[indexInArray];
    
    // 3. Versuche aus teams-Struktur
    const topPlayer = session.teams?.top?.players?.find(p => p.playerId === targetPlayerId);
    if (topPlayer?.displayName) return topPlayer.displayName;
    const bottomPlayer = session.teams?.bottom?.players?.find(p => p.playerId === targetPlayerId);
    if (bottomPlayer?.displayName) return bottomPlayer.displayName;
    
    return 'Unbekannt';
  };
  
  // ✅ TURNIER-SUPPORT: Prüfe ob Session `teams` hat (für Turniere)
  if (session.teams && session.teams.top && session.teams.bottom) {
    // Finde Team des Spielers via teams-Objekt
    const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
    const bottomPlayerIds = (session.teams.bottom.players || []).map(p => p.playerId);
    
    let partnerId = null;
    let opponentIds = [];
    
    if (topPlayerIds.includes(playerId)) {
      // Spieler ist im Top-Team
      partnerId = topPlayerIds.find(id => id !== playerId);
      opponentIds = bottomPlayerIds;
    } else if (bottomPlayerIds.includes(playerId)) {
      // Spieler ist im Bottom-Team
      partnerId = bottomPlayerIds.find(id => id !== playerId);
      opponentIds = topPlayerIds;
    }
    
    if (!partnerId) {
      return { partner: null, opponents: [] };
    }
    
    // Finde Indices für Display Names
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
  
  // ✅ NORMALE SESSION: Verwende Index-Logik (0<->2, 1<->3)
  const partnerIndex = (playerIndex + 2) % 4;
  const partnerId = participantPlayerIds[partnerIndex];
  
  // Gegner sind die anderen beiden
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
 * ✅ KORRIGIERT: Unterstützt sowohl normale Sessions als auch Turniere!
 */
function didPlayerWin(session, playerId) {
  const participantPlayerIds = session.participantPlayerIds || [];
  const playerIndex = participantPlayerIds.indexOf(playerId);
  
  if (playerIndex === -1) return false;
  
  let team = null;
  
  // ✅ TURNIER-SUPPORT: Prüfe ob Session `teams` hat (für Turniere)
  if (session.teams && session.teams.top && session.teams.bottom) {
    const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
    const bottomPlayerIds = (session.teams.bottom.players || []).map(p => p.playerId);
    
    if (topPlayerIds.includes(playerId)) {
      team = 'top';
    } else if (bottomPlayerIds.includes(playerId)) {
      team = 'bottom';
    }
  } else {
    // ✅ NORMALE SESSION: Verwende Index-Logik
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
 * Berechnet Striche/Punkte/Events für ein Team
 * ✅ KORRIGIERT: Verwendet finalStriche und finalScores statt teamStats
 */
function getTeamStats(session, team) {
  const finalStriche = session.finalStriche || {};
  const finalScores = session.finalScores || {};
  const eventCounts = session.eventCounts || {};
  const teamEvents = eventCounts[team] || {};
  
  // Berechne totalStriche aus finalStriche Record
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
 * ✅ KORRIGIERT: Unterstützt sowohl normale Sessions als auch Turniere!
 */
async function aggregatePartnerStats(playerId, sessions) {
  const partnerMap = new Map();
  
  for (const session of sessions) {
    const { partner } = identifyPartnerAndOpponents(session, playerId);
    if (!partner) continue;
    
    // ✅ TEAM-BESTIMMUNG: Prüfe ob Session `teams` hat (für Turniere)
    let team = null;
    if (session.teams && session.teams.top && session.teams.bottom) {
      const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
      if (topPlayerIds.includes(playerId)) {
        team = 'top';
      } else {
        team = 'bottom';
      }
    } else {
      // Normale Session: Index-Logik
      const participantPlayerIds = session.participantPlayerIds || [];
      const playerIndex = participantPlayerIds.indexOf(playerId);
      team = playerIndex < 2 ? 'top' : 'bottom';
    }
    
    if (!team) continue;
    
    const opponentTeam = team === 'top' ? 'bottom' : 'top';
    const playerTeamStats = getTeamStats(session, team);
    const opponentTeamStats = getTeamStats(session, opponentTeam);
    const won = didPlayerWin(session, playerId);
    
    // ✅ KORRIGIERT: Games aus gameWinsByTeam lesen statt teamStats
    const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
    const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
    const gamesWon = gameWinsByTeam[team] || 0;
    
    // ✅ SESSION-WIN: Nur für normale Sessions basierend auf winnerTeamKey (Turniere haben KEIN winnerTeamKey!)
    const winnerTeamKey = session.winnerTeamKey;
    const isSessionWin = winnerTeamKey && winnerTeamKey === team;
    
    // Initialisiere Partner-Eintrag
    if (!partnerMap.has(partner.id)) {
      partnerMap.set(partner.id, {
      partnerId: partner.id,
      partnerDisplayName: partner.displayName,
      sessionsPlayedWith: 0,
      sessionsWonWith: 0,
      gamesPlayedWith: 0,
      gamesWonWith: 0,
      totalStricheDifferenceWith: 0,
      totalPointsDifferenceWith: 0,
      matschBilanzWith: 0,
      schneiderBilanzWith: 0,
      kontermatschBilanzWith: 0,
      matschEventsMadeWith: 0,
      matschEventsReceivedWith: 0,
      schneiderEventsMadeWith: 0,
      schneiderEventsReceivedWith: 0,
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
    
    // ✅ Nur normale Sessions zählen für Partien-Statistiken (Turniere haben KEIN winnerTeamKey!)
    if (!session.isTournamentSession) {
      stats.sessionsPlayedWith += 1;
      stats.sessionsWonWith += isSessionWin ? 1 : 0;
    }
    stats.gamesPlayedWith += gamesPlayed;
    stats.gamesWonWith += gamesWon;
    stats.totalStricheDifferenceWith += playerTeamStats.striche - opponentTeamStats.striche;
    stats.totalPointsDifferenceWith += playerTeamStats.points - opponentTeamStats.points;
    stats.matschEventsMadeWith += playerTeamStats.matschEvents;
    stats.matschEventsReceivedWith += opponentTeamStats.matschEvents;
    stats.schneiderEventsMadeWith += playerTeamStats.schneiderEvents;
    stats.schneiderEventsReceivedWith += opponentTeamStats.schneiderEvents;
    stats.kontermatschEventsMadeWith += playerTeamStats.kontermatschEvents;
    stats.kontermatschEventsReceivedWith += opponentTeamStats.kontermatschEvents;
    stats.totalWeisPointsWith += playerTeamStats.weisPoints;
    stats.totalWeisReceivedWith += opponentTeamStats.weisPoints;
    
    // Update Bilanz
    stats.matschBilanzWith = stats.matschEventsMadeWith - stats.matschEventsReceivedWith;
    stats.schneiderBilanzWith = stats.schneiderEventsMadeWith - stats.schneiderEventsReceivedWith;
    stats.kontermatschBilanzWith = stats.kontermatschEventsMadeWith - stats.kontermatschEventsReceivedWith;
    stats.weisDifferenceWith = stats.totalWeisPointsWith - stats.totalWeisReceivedWith;
    
    // ✅ NEU: Rundentempo - summiere Runden von BEIDEN Partnern (gemeinsames Team)
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
    
    // ✅ NEU: Trumpfansagen - summiere beide Partner
    const playerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
    const partnerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[partner.id] || {};
    
    Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
      stats.trumpfStatistikWith[farbe] = (stats.trumpfStatistikWith[farbe] || 0) + count;
    });
    Object.entries(partnerTrumpfs).forEach(([farbe, count]) => {
      stats.trumpfStatistikWith[farbe] = (stats.trumpfStatistikWith[farbe] || 0) + count;
    });
    
    // Update Timestamp
    const sessionTimestamp = session.startedAt || session.createdAt;
    if (sessionTimestamp) {
      const timestampMillis = sessionTimestamp.toMillis ? sessionTimestamp.toMillis() : (sessionTimestamp.seconds * 1000);
      if (!stats.lastPlayedWithTimestamp || timestampMillis > stats.lastPlayedWithTimestamp) {
        stats.lastPlayedWithTimestamp = timestampMillis;
      }
    }
  }
  
  // Berechne Win-Rates & avgRoundDuration
  for (const [partnerId, stats] of partnerMap.entries()) {
    stats.sessionWinRateWith = stats.sessionsPlayedWith > 0 ? stats.sessionsWonWith / stats.sessionsPlayedWith : 0;
    stats.gameWinRateWith = stats.gamesPlayedWith > 0 ? stats.gamesWonWith / stats.gamesPlayedWith : 0;
    stats.avgRoundDurationWith = stats.totalRoundsWith > 0 ? stats.totalRoundDurationWith / stats.totalRoundsWith : 0;
  }
  
  return partnerMap;
}

/**
 * Aggregiert Opponent-Stats für einen Spieler
 * ✅ KORRIGIERT: Unterstützt sowohl normale Sessions als auch Turniere!
 */
async function aggregateOpponentStats(playerId, sessions) {
  const opponentMap = new Map();
  
  for (const session of sessions) {
    const { opponents } = identifyPartnerAndOpponents(session, playerId);
    if (opponents.length === 0) continue;
    
    // ✅ TEAM-BESTIMMUNG: Prüfe ob Session `teams` hat (für Turniere)
    let team = null;
    if (session.teams && session.teams.top && session.teams.bottom) {
      const topPlayerIds = (session.teams.top.players || []).map(p => p.playerId);
      if (topPlayerIds.includes(playerId)) {
        team = 'top';
      } else {
        team = 'bottom';
      }
    } else {
      // Normale Session: Index-Logik
      const participantPlayerIds = session.participantPlayerIds || [];
      const playerIndex = participantPlayerIds.indexOf(playerId);
      team = playerIndex < 2 ? 'top' : 'bottom';
    }
    
    if (!team) continue;
    
    const opponentTeam = team === 'top' ? 'bottom' : 'top';
    
    const playerTeamStats = getTeamStats(session, team);
    const opponentTeamStats = getTeamStats(session, opponentTeam);
    const won = didPlayerWin(session, playerId);
    
    // ✅ KORRIGIERT: Games aus gameWinsByTeam lesen statt teamStats
    const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
    const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
    const gamesWon = gameWinsByTeam[team] || 0;
    
    // ✅ SESSION-WIN: Nur für normale Sessions basierend auf winnerTeamKey
    const winnerTeamKey = session.winnerTeamKey;
    const isSessionWin = winnerTeamKey && winnerTeamKey === team;
    
    for (const opponent of opponents) {
      // Initialisiere Opponent-Eintrag
      if (!opponentMap.has(opponent.id)) {
        opponentMap.set(opponent.id, {
          opponentId: opponent.id,
          opponentDisplayName: opponent.displayName,
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          gamesPlayedAgainst: 0,
          gamesWonAgainst: 0,
          totalStricheDifferenceAgainst: 0,
          totalPointsDifferenceAgainst: 0,
          matschBilanzAgainst: 0,
          schneiderBilanzAgainst: 0,
          kontermatschBilanzAgainst: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
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
      
      // ✅ Nur normale Sessions zählen für Partien-Statistiken (Turniere haben KEIN winnerTeamKey!)
      if (!session.isTournamentSession) {
        stats.sessionsPlayedAgainst += 1;
        stats.sessionsWonAgainst += isSessionWin ? 1 : 0;
      }
      stats.gamesPlayedAgainst += gamesPlayed;
      stats.gamesWonAgainst += gamesWon;
      stats.totalStricheDifferenceAgainst += playerTeamStats.striche - opponentTeamStats.striche;
      stats.totalPointsDifferenceAgainst += playerTeamStats.points - opponentTeamStats.points;
      stats.matschEventsMadeAgainst += playerTeamStats.matschEvents;
      stats.matschEventsReceivedAgainst += opponentTeamStats.matschEvents;
      stats.schneiderEventsMadeAgainst += playerTeamStats.schneiderEvents;
      stats.schneiderEventsReceivedAgainst += opponentTeamStats.schneiderEvents;
      stats.kontermatschEventsMadeAgainst += playerTeamStats.kontermatschEvents;
      stats.kontermatschEventsReceivedAgainst += opponentTeamStats.kontermatschEvents;
      stats.totalWeisPointsAgainst += playerTeamStats.weisPoints;
      stats.totalWeisReceivedAgainst += opponentTeamStats.weisPoints;
      
      // Update Bilanz
      stats.matschBilanzAgainst = stats.matschEventsMadeAgainst - stats.matschEventsReceivedAgainst;
      stats.schneiderBilanzAgainst = stats.schneiderEventsMadeAgainst - stats.schneiderEventsReceivedAgainst;
      stats.kontermatschBilanzAgainst = stats.kontermatschEventsMadeAgainst - stats.kontermatschEventsReceivedAgainst;
      stats.weisDifferenceAgainst = stats.totalWeisPointsAgainst - stats.totalWeisReceivedAgainst;
      
      // ✅ NEU: Rundentempo - summiere Runden von BEIDEN Gegnern (gemeinsames Spiel)
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
      
      // ✅ NEU: Trumpfansagen gegen Gegner - nutze eigene Trumpfe
      const playerTrumpfs = session.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        stats.trumpfStatistikAgainst[farbe] = (stats.trumpfStatistikAgainst[farbe] || 0) + count;
      });
      
      // Update Timestamp
      const timestamp2 = session.startedAt || session.createdAt;
      if (timestamp2) {
        const timestampMillis = timestamp2.toMillis ? timestamp2.toMillis() : (timestamp2.seconds * 1000);
        if (!stats.lastPlayedAgainstTimestamp || timestampMillis > stats.lastPlayedAgainstTimestamp) {
          stats.lastPlayedAgainstTimestamp = timestampMillis;
        }
      }
    }
  }
  
  // Berechne Win-Rates & avgRoundDuration
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
    
    // Firestore Batch-Limit: 500 writes
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
    
    // Firestore Batch-Limit: 500 writes
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
  console.log('\n🚀 ===== BACKFILL: Partner & Opponent Stats =====\n');
  
  try {
    // 1. Lade alle Spieler und Gruppen
    const players = await getAllPlayers();
    const groups = await getAllGroups();
    
    // 2. Sammle alle Sessions pro Gruppe
    console.log('\n📊 Lade alle Sessions...');
    const allSessions = [];
    for (const group of groups) {
      const sessions = await getGroupSessions(group.id);
      allSessions.push(...sessions);
      console.log(`  ✅ Gruppe ${group.name || group.id}: ${sessions.length} Sessions`);
    }
    console.log(`✅ Insgesamt ${allSessions.length} Sessions gefunden\n`);
    
    // 3. Für jeden Spieler: Partner & Opponent Stats berechnen
    let totalPartnersWritten = 0;
    let totalOpponentsWritten = 0;
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      console.log(`\n[${i + 1}/${players.length}] 🔄 Verarbeite ${player.displayName || player.id}...`);
      
      // Filter Sessions: Nur Sessions, wo der Spieler teilgenommen hat
      const playerSessions = allSessions.filter(session => {
        const participantIds = session.participantPlayerIds || [];
        return participantIds.includes(player.id);
      });
      
      if (playerSessions.length === 0) {
        console.log(`  ℹ️ Keine Sessions gefunden für ${player.displayName || player.id}`);
        continue;
      }
      
      console.log(`  📊 ${playerSessions.length} Sessions gefunden`);
      
      // Berechne Partner-Stats
      const partnerMap = await aggregatePartnerStats(player.id, playerSessions);
      console.log(`  📊 ${partnerMap.size} Partner identifiziert`);
      
      // Berechne Opponent-Stats
      const opponentMap = await aggregateOpponentStats(player.id, playerSessions);
      console.log(`  📊 ${opponentMap.size} Gegner identifiziert`);
      
      // Schreibe in Firestore
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
    // Cleanup
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

