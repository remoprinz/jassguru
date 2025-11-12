/**
 * ✅ DRY RUN: Partner & Opponent Stats Backfill
 * 
 * Dieser Script simuliert den Backfill OHNE in die Datenbank zu schreiben.
 * Er vergleicht die berechneten Stats mit den veralteten playerComputedStats.
 * 
 * Zweck: Verifikation, dass die Logik korrekt ist!
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

// ===== HILFSFUNKTIONEN (IDENTISCH ZU BACKFILL SCRIPT) =====

async function getAllPlayers() {
  const playersSnap = await db.collection('players').get();
  return playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getAllGroups() {
  const groupsSnap = await db.collection('groups').get();
  return groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  
  // ✅ TURNIER-SUPPORT
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
    
    return {
      partner: { id: partnerId, displayName: playerNames[partnerId] || 'Unbekannt' },
      opponents: opponentIds.map(id => ({ id, displayName: playerNames[id] || 'Unbekannt' }))
    };
  }
  
  const partnerIndex = (playerIndex + 2) % 4;
  const partnerId = participantPlayerIds[partnerIndex];
  const opponents = participantPlayerIds.filter((id, idx) => idx !== playerIndex && idx !== partnerIndex);
  
  return {
    partner: { id: partnerId, displayName: playerNames[partnerId] || 'Unbekannt' },
    opponents: opponents.map(id => ({ id, displayName: playerNames[id] || 'Unbekannt' }))
  };
}

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
    const won = didPlayerWin(session, playerId);
    
    // ✅ KORRIGIERT: Games aus gameWinsByTeam lesen statt teamStats
    const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
    const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
    const gamesWon = gameWinsByTeam[team] || 0;
    
    // ✅ SESSION-WIN: Nur für normale Sessions basierend auf winnerTeamKey (Turniere haben KEIN winnerTeamKey!)
    const winnerTeamKey = session.winnerTeamKey;
    const isSessionWin = winnerTeamKey && winnerTeamKey === team;
    
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
        lastPlayedWithTimestamp: null
      });
    }
    
    const stats = partnerMap.get(partner.id);
    // ✅ Nur normale Sessions zählen für Partien-Statistiken
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
    
    stats.matschBilanzWith = stats.matschEventsMadeWith - stats.matschEventsReceivedWith;
    stats.schneiderBilanzWith = stats.schneiderEventsMadeWith - stats.schneiderEventsReceivedWith;
    stats.kontermatschBilanzWith = stats.kontermatschEventsMadeWith - stats.kontermatschEventsReceivedWith;
    stats.weisDifferenceWith = stats.totalWeisPointsWith - stats.totalWeisReceivedWith;
    
      const sessionTimestamp = session.startedAt || session.createdAt;
      if (sessionTimestamp) {
        const timestampMillis = sessionTimestamp.toMillis ? sessionTimestamp.toMillis() : (sessionTimestamp.seconds * 1000);
        if (!stats.lastPlayedWithTimestamp || timestampMillis > stats.lastPlayedWithTimestamp) {
          stats.lastPlayedWithTimestamp = timestampMillis;
        }
      }
  }
  
  for (const [partnerId, stats] of partnerMap.entries()) {
    stats.sessionWinRateWith = stats.sessionsPlayedWith > 0 ? stats.sessionsWonWith / stats.sessionsPlayedWith : 0;
    stats.gameWinRateWith = stats.gamesPlayedWith > 0 ? stats.gamesWonWith / stats.gamesPlayedWith : 0;
  }
  
  return partnerMap;
}

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
    const won = didPlayerWin(session, playerId);
    
    // ✅ KORRIGIERT: Games aus gameWinsByTeam lesen statt teamStats
    const gameWinsByTeam = session.gameWinsByTeam || { top: 0, bottom: 0 };
    const gamesPlayed = (gameWinsByTeam.top || 0) + (gameWinsByTeam.bottom || 0);
    const gamesWon = gameWinsByTeam[team] || 0;
    
    // ✅ SESSION-WIN: Nur für normale Sessions basierend auf winnerTeamKey
    const winnerTeamKey = session.winnerTeamKey;
    const isSessionWin = winnerTeamKey && winnerTeamKey === team;
    
    for (const opponent of opponents) {
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
          lastPlayedAgainstTimestamp: null
        });
      }
      
      const stats = opponentMap.get(opponent.id);
      // ✅ Nur normale Sessions zählen für Partien-Statistiken
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
      
      stats.matschBilanzAgainst = stats.matschEventsMadeAgainst - stats.matschEventsReceivedAgainst;
      stats.schneiderBilanzAgainst = stats.schneiderEventsMadeAgainst - stats.schneiderEventsReceivedAgainst;
      stats.kontermatschBilanzAgainst = stats.kontermatschEventsMadeAgainst - stats.kontermatschEventsReceivedAgainst;
      stats.weisDifferenceAgainst = stats.totalWeisPointsAgainst - stats.totalWeisReceivedAgainst;
      
      const sessionTimestamp = session.startedAt || session.createdAt;
      if (sessionTimestamp) {
        const timestampMillis = sessionTimestamp.toMillis ? sessionTimestamp.toMillis() : (sessionTimestamp.seconds * 1000);
        if (!stats.lastPlayedAgainstTimestamp || timestampMillis > stats.lastPlayedAgainstTimestamp) {
          stats.lastPlayedAgainstTimestamp = timestampMillis;
        }
      }
    }
  }
  
  for (const [opponentId, stats] of opponentMap.entries()) {
    stats.sessionWinRateAgainst = stats.sessionsPlayedAgainst > 0 ? stats.sessionsWonAgainst / stats.sessionsPlayedAgainst : 0;
    stats.gameWinRateAgainst = stats.gamesPlayedAgainst > 0 ? stats.gamesWonAgainst / stats.gamesPlayedAgainst : 0;
  }
  
  return opponentMap;
}

// ===== ALTE STATS LADEN =====

async function getOldComputedStats(playerId) {
  try {
    const doc = await db.doc(`playerComputedStats/${playerId}`).get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (error) {
    return null;
  }
}

// ===== MAIN DRY RUN FUNCTION =====

async function dryRunBackfill() {
  console.log('\n🧪 ===== DRY RUN: Partner & Opponent Stats Verification =====\n');
  
  try {
    const players = await getAllPlayers();
    const groups = await getAllGroups();
    
    console.log(`📊 ${players.length} Spieler gefunden`);
    console.log(`📊 ${groups.length} Gruppen gefunden`);
    
    // Sammle alle Sessions
    const allSessions = [];
    for (const group of groups) {
      const sessions = await getGroupSessions(group.id);
      allSessions.push(...sessions);
      console.log(`  ✅ Gruppe ${group.name || group.id}: ${sessions.length} Sessions`);
    }
    console.log(`\n✅ Insgesamt ${allSessions.length} Sessions gefunden\n`);
    
    // ❗ NUR FÜR EINEN SPIELER (um Output übersichtlich zu halten)
    const testPlayerId = 'b16c1120111b7d9e7d733837'; // Remo
    const testPlayer = players.find(p => p.id === testPlayerId);
    
    if (!testPlayer) {
      console.log(`❌ Test-Spieler ${testPlayerId} nicht gefunden`);
      return;
    }
    
    console.log(`\n🎯 FOKUS: ${testPlayer.displayName} (${testPlayer.id})\n`);
    
    // Filter Sessions für Test-Spieler
    const playerSessions = allSessions.filter(session => {
      const participantIds = session.participantPlayerIds || [];
      return participantIds.includes(testPlayerId);
    });
    
    console.log(`📊 ${playerSessions.length} Sessions gefunden für ${testPlayer.displayName}\n`);
    
    // 🚀 Berechne NEUE Stats
    console.log('🔄 Berechne Partner-Stats...');
    const newPartnerMap = await aggregatePartnerStats(testPlayerId, playerSessions);
    
    console.log('🔄 Berechne Opponent-Stats...');
    const newOpponentMap = await aggregateOpponentStats(testPlayerId, playerSessions);
    
    // 📊 Lade ALTE Stats
    console.log('🔄 Lade alte playerComputedStats...');
    const oldStats = await getOldComputedStats(testPlayerId);
    
    if (!oldStats) {
      console.log('❌ Keine alten Stats gefunden');
    } else {
      console.log('✅ Alte Stats geladen\n');
    }
    
    // 📋 VERGLEICH AUSGEBEN
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 VERGLEICH: NEUE vs ALTE STATS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Partner-Stats vergleichen
    console.log('👥 PARTNER STATS:\n');
    
    if (oldStats && oldStats.partnerAggregates && oldStats.partnerAggregates.length > 0) {
      const oldPartners = oldStats.partnerAggregates;
      const newPartners = Array.from(newPartnerMap.values());
      
      for (const oldPartner of oldPartners) {
        const newPartner = newPartners.find(p => p.partnerId === oldPartner.partnerId);
        
        if (newPartner) {
          console.log(`  📍 Partner: ${oldPartner.partnerDisplayName || oldPartner.partnerId}`);
          console.log(`    Sessions: NEW=${newPartner.sessionsPlayedWith} vs OLD=${oldPartner.sessionsPlayedWith}`);
          console.log(`    Wins: NEW=${newPartner.sessionsWonWith} vs OLD=${oldPartner.sessionsWonWith}`);
          console.log(`    Games: NEW=${newPartner.gamesPlayedWith} vs OLD=${oldPartner.gamesPlayedWith}`);
          console.log(`    Game Wins: NEW=${newPartner.gamesWonWith} vs OLD=${oldPartner.gamesWonWith}`);
          console.log(`    Strich Diff: NEW=${newPartner.totalStricheDifferenceWith} vs OLD=${oldPartner.totalStricheDifferenceWith}`);
          console.log(`    Point Diff: NEW=${newPartner.totalPointsDifferenceWith} vs OLD=${oldPartner.totalPointsDifferenceWith}`);
          console.log('');
        }
      }
    } else {
      console.log('  ℹ️ Keine alten Partner-Stats gefunden');
      console.log('\n  📍 NEUE Partner:');
      for (const partner of Array.from(newPartnerMap.values())) {
        console.log(`    - ${partner.partnerDisplayName} (${partner.partnerId}): ${partner.sessionsPlayedWith} Sessions`);
      }
    }
    
    // Opponent-Stats vergleichen
    console.log('\n⚔️ OPPONENT STATS:\n');
    
    if (oldStats && oldStats.opponentAggregates && oldStats.opponentAggregates.length > 0) {
      const oldOpponents = oldStats.opponentAggregates;
      const newOpponents = Array.from(newOpponentMap.values());
      
      for (const oldOpponent of oldOpponents) {
        const newOpponent = newOpponents.find(p => p.opponentId === oldOpponent.opponentId);
        
        if (newOpponent) {
          console.log(`  📍 Gegner: ${oldOpponent.opponentDisplayName || oldOpponent.opponentId}`);
          console.log(`    Sessions: NEW=${newOpponent.sessionsPlayedAgainst} vs OLD=${oldOpponent.sessionsPlayedAgainst}`);
          console.log(`    Wins: NEW=${newOpponent.sessionsWonAgainst} vs OLD=${oldOpponent.sessionsWonAgainst}`);
          console.log(`    Games: NEW=${newOpponent.gamesPlayedAgainst} vs OLD=${oldOpponent.gamesPlayedAgainst}`);
          console.log(`    Game Wins: NEW=${newOpponent.gamesWonAgainst} vs OLD=${oldOpponent.gamesWonAgainst}`);
          console.log(`    Strich Diff: NEW=${newOpponent.totalStricheDifferenceAgainst} vs OLD=${oldOpponent.totalStricheDifferenceAgainst}`);
          console.log(`    Point Diff: NEW=${newOpponent.totalPointsDifferenceAgainst} vs OLD=${oldOpponent.totalPointsDifferenceAgainst}`);
          console.log('');
        }
      }
    } else {
      console.log('  ℹ️ Keine alten Opponent-Stats gefunden');
      console.log('\n  📍 NEUE Gegner:');
      for (const opponent of Array.from(newOpponentMap.values())) {
        console.log(`    - ${opponent.opponentDisplayName} (${opponent.opponentId}): ${opponent.sessionsPlayedAgainst} Sessions`);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎉 DRY RUN ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Dry Run:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// ===== SCRIPT AUSFÜHRUNG =====

dryRunBackfill()
  .then(() => {
    console.log('✅ Dry Run erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Dry Run fehlgeschlagen:', error);
    process.exit(1);
  });

