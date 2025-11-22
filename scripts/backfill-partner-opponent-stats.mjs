import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';

/**
 * 🎯 BACKFILL: players/{playerId}/partnerStats & players/{playerId}/opponentStats
 */
async function backfillPartnerOpponentStats() {
  console.log('🚀 STARTE: Backfill Partner & Opponent Stats');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // 0. Lade Spielernamen
  console.log('🔍 Lade Spielernamen...');
  const playerNames = new Map();
  const playersSnap = await db.collection('players').where('groupIds', 'array-contains', groupId).get();
  playersSnap.forEach(doc => {
    playerNames.set(doc.id, doc.data().displayName || 'Unbekannt');
  });
  console.log(`   ${playerNames.size} Spieler gefunden.\n`);

  // 1. Lade alle jassGameSummaries
  const sessionsSnap = await db.collection('groups').doc(groupId).collection('jassGameSummaries')
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`📊 Gefunden: ${sessionsSnap.size} abgeschlossene Sessions\n`);
  
  // stats[playerId].partners[partnerId]
  const stats = new Map();
  
  const getPlayerStats = (pid) => {
    if (!stats.has(pid)) {
      stats.set(pid, { partners: new Map(), opponents: new Map() });
    }
    return stats.get(pid);
  };

  const getPartnerStats = (pid, partnerId) => {
    const pStats = getPlayerStats(pid);
    if (!pStats.partners.has(partnerId)) {
      pStats.partners.set(partnerId, {
        partnerId,
        partnerDisplayName: playerNames.get(partnerId) || partnerId,
        sessionsPlayedWith: 0,
        sessionsWonWith: 0,
        sessionsLostWith: 0,
        sessionsDrawWith: 0,
        gamesPlayedWith: 0,
        gamesWonWith: 0,
        gamesLostWith: 0,
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
      });
    }
    return pStats.partners.get(partnerId);
  };

  const getOpponentStats = (pid, opponentId) => {
    const pStats = getPlayerStats(pid);
    if (!pStats.opponents.has(opponentId)) {
      pStats.opponents.set(opponentId, {
        opponentId,
        opponentDisplayName: playerNames.get(opponentId) || opponentId,
        sessionsPlayedAgainst: 0,
        sessionsWonAgainst: 0,
        sessionsLostAgainst: 0,
        sessionsDrawAgainst: 0,
        gamesPlayedAgainst: 0,
        gamesWonAgainst: 0,
        gamesLostAgainst: 0,
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
      });
    }
    return pStats.opponents.get(opponentId);
  };

  let totalGamesProcessed = 0;

  for (const sessionDoc of sessionsSnap.docs) {
    const sessionData = sessionDoc.data();
    
    // Session-Tracking
    const sessionPairs = new Map(); // key: "p1_p2" -> { stricheDiff: 0 }
    const sessionOpponents = new Map(); // key: "p1_vs_p3" -> { stricheDiff: 0 }

    const games = [];
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults) && sessionData.gameResults.length > 0) {
      games.push(...sessionData.gameResults);
    } else {
      // Pseudo Game
      games.push({
        teams: sessionData.teams,
        finalStriche: sessionData.finalStriche,
        finalScores: sessionData.finalScores,
        eventCounts: sessionData.eventCounts
      });
    }

    for (const game of games) {
      totalGamesProcessed++;
      processGame(game, getPartnerStats, getOpponentStats, sessionPairs, sessionOpponents);
    }

    updateSessionMetrics(sessionPairs, getPartnerStats, 'partner');
    updateSessionMetrics(sessionOpponents, getOpponentStats, 'opponent');
  }

  // SCHREIBEN
  console.log('\n💾 Schreibe Daten in Firestore...');
  let totalWrites = 0;

  for (const [playerId, playerStats] of stats) {
    const batch = db.batch();
    let batchCount = 0;
    
    // Partner
    for (const [partnerId, pStats] of playerStats.partners) {
      const ref = db.collection('players').doc(playerId).collection('partnerStats').doc(partnerId);
      batch.set(ref, pStats);
      batchCount++;
      totalWrites++;
      if (batchCount >= 400) { await batch.commit(); batchCount = 0; }
    }

    // Opponent
    for (const [opponentId, oStats] of playerStats.opponents) {
      const ref = db.collection('players').doc(playerId).collection('opponentStats').doc(opponentId);
      batch.set(ref, oStats);
      batchCount++;
      totalWrites++;
      if (batchCount >= 400) { await batch.commit(); batchCount = 0; }
    }

    if (batchCount > 0) await batch.commit();
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ BACKFILL ABGESCHLOSSEN!');
  console.log(`   Spiele: ${totalGamesProcessed}`);
  console.log(`   Docs geschrieben: ${totalWrites}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// --- LOGIK ---

function processGame(game, getPartnerStats, getOpponentStats, sessionPairs, sessionOpponents) {
  const topPlayers = game.teams?.top?.players || [];
  const bottomPlayers = game.teams?.bottom?.players || [];
  
  if (topPlayers.length === 0 || bottomPlayers.length === 0) return;

  processTeamPartners(topPlayers, game, 'top', getPartnerStats, sessionPairs);
  processTeamPartners(bottomPlayers, game, 'bottom', getPartnerStats, sessionPairs);

  processOpponents(topPlayers, bottomPlayers, game, 'top', getOpponentStats, sessionOpponents);
  processOpponents(bottomPlayers, topPlayers, game, 'bottom', getOpponentStats, sessionOpponents);
}

function processTeamPartners(players, game, teamSide, getPartnerStats, sessionPairs) {
  if (players.length < 2) return;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i].playerId;
      const p2 = players[j].playerId;
      if (!p1 || !p2) continue;
      updatePartnerStats(p1, p2, game, teamSide, getPartnerStats, sessionPairs);
      updatePartnerStats(p2, p1, game, teamSide, getPartnerStats, sessionPairs);
    }
  }
}

function updatePartnerStats(pid, otherId, game, teamSide, getStats, sessionTracker) {
  const stats = getStats(pid, otherId);
  const m = calculateGameMetrics(game, teamSide);
  
  stats.gamesPlayedWith++;
  if (m.stricheDiff > 0) stats.gamesWonWith++;
  else if (m.stricheDiff < 0) stats.gamesLostWith++;
  
  stats.totalStricheDifferenceWith += m.stricheDiff;
  stats.totalPointsDifferenceWith += m.pointsDiff;
  stats.matschBilanzWith += m.matschBilanz;
  stats.schneiderBilanzWith += m.schneiderBilanz;
  stats.kontermatschBilanzWith += m.kontermatschBilanz;

  stats.matschEventsMadeWith += m.matschMade;
  stats.matschEventsReceivedWith += m.matschReceived;
  stats.schneiderEventsMadeWith += m.schneiderMade;
  stats.schneiderEventsReceivedWith += m.schneiderReceived;
  stats.kontermatschEventsMadeWith += m.kontermatschMade;
  stats.kontermatschEventsReceivedWith += m.kontermatschReceived;

  const key = `${pid}_${otherId}`;
  if (!sessionTracker.has(key)) sessionTracker.set(key, { stricheDiff: 0 });
  sessionTracker.get(key).stricheDiff += m.stricheDiff;
}

function processOpponents(myTeam, oppTeam, game, mySide, getOpponentStats, sessionOpponents) {
  for (const me of myTeam) {
    if (!me.playerId) continue;
    for (const opp of oppTeam) {
      if (!opp.playerId) continue;
      updateOpponentStats(me.playerId, opp.playerId, game, mySide, getOpponentStats, sessionOpponents);
    }
  }
}

function updateOpponentStats(pid, otherId, game, teamSide, getStats, sessionTracker) {
  const stats = getStats(pid, otherId);
  const m = calculateGameMetrics(game, teamSide); // Metrics from MY perspective
  
  stats.gamesPlayedAgainst++;
  if (m.stricheDiff > 0) stats.gamesWonAgainst++;
  else if (m.stricheDiff < 0) stats.gamesLostAgainst++;
  
  stats.totalStricheDifferenceAgainst += m.stricheDiff;
  stats.totalPointsDifferenceAgainst += m.pointsDiff;
  stats.matschBilanzAgainst += m.matschBilanz;
  stats.schneiderBilanzAgainst += m.schneiderBilanz;
  stats.kontermatschBilanzAgainst += m.kontermatschBilanz;

  stats.matschEventsMadeAgainst += m.matschMade;
  stats.matschEventsReceivedAgainst += m.matschReceived;
  stats.schneiderEventsMadeAgainst += m.schneiderMade;
  stats.schneiderEventsReceivedAgainst += m.schneiderReceived;
  stats.kontermatschEventsMadeAgainst += m.kontermatschMade;
  stats.kontermatschEventsReceivedAgainst += m.kontermatschReceived;

  const key = `${pid}_${otherId}`;
  if (!sessionTracker.has(key)) sessionTracker.set(key, { stricheDiff: 0 });
  sessionTracker.get(key).stricheDiff += m.stricheDiff;
}

function calculateGameMetrics(game, myTeamSide) {
  const oppTeamSide = myTeamSide === 'top' ? 'bottom' : 'top';
  
  // Striche
  const finalStriche = game.finalStriche || {};
  const myStricheSum = sumStriche(finalStriche[myTeamSide]);
  const oppStricheSum = sumStriche(finalStriche[oppTeamSide]);
  const stricheDiff = myStricheSum - oppStricheSum;

  // Punkte
  const myPoints = myTeamSide === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
  const oppPoints = myTeamSide === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
  
  const myPointsRegular = game.finalScores ? (game.finalScores[myTeamSide] || 0) : myPoints;
  const oppPointsRegular = game.finalScores ? (game.finalScores[oppTeamSide] || 0) : oppPoints;
  
  const pointsDiff = myPointsRegular - oppPointsRegular;

  // Events
  const myEvents = getEvents(game, myTeamSide);
  const oppEvents = getEvents(game, oppTeamSide);

  return {
    stricheDiff,
    pointsDiff,
    matschBilanz: (myEvents.matsch || 0) - (oppEvents.matsch || 0),
    schneiderBilanz: (myEvents.schneider || 0) - (oppEvents.schneider || 0),
    kontermatschBilanz: (myEvents.kontermatsch || 0) - (oppEvents.kontermatsch || 0),
    matschMade: myEvents.matsch || 0,
    matschReceived: oppEvents.matsch || 0,
    schneiderMade: myEvents.schneider || 0,
    schneiderReceived: oppEvents.schneider || 0,
    kontermatschMade: myEvents.kontermatsch || 0,
    kontermatschReceived: oppEvents.kontermatsch || 0
  };
}

function getEvents(game, side) {
  if (game.eventCounts && game.eventCounts[side]) return game.eventCounts[side];
  if (game.finalStriche && game.finalStriche[side]) return game.finalStriche[side];
  return {};
}

function sumStriche(s) {
  if (!s) return 0;
  return (s.berg || 0) + (s.sieg || 0) + (s.matsch || 0) + (s.schneider || 0) + (s.kontermatsch || 0);
}

function updateSessionMetrics(sessionMap, getStatsFn, type) {
  for (const [key, data] of sessionMap) {
    const [pid, otherId] = key.split('_');
    const stats = getStatsFn(pid, otherId);
    
    if (type === 'partner') {
      stats.sessionsPlayedWith++;
      if (data.stricheDiff > 0) stats.sessionsWonWith++;
      else if (data.stricheDiff < 0) stats.sessionsLostWith++;
      else stats.sessionsDrawWith++;
    } else {
      stats.sessionsPlayedAgainst++;
      if (data.stricheDiff > 0) stats.sessionsWonAgainst++;
      else if (data.stricheDiff < 0) stats.sessionsLostAgainst++;
      else stats.sessionsDrawAgainst++;
    }
  }
}

backfillPartnerOpponentStats().catch(console.error);
