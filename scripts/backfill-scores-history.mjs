import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';

/**
 * 🎯 BACKFILL: players/{playerId}/scoresHistory
 * 
 * UPDATE: Robustere Extraktion von Matsch/Schneider aus finalStriche wenn eventCounts fehlen!
 */
async function backfillScoresHistoryAggregated() {
  console.log('🚀 STARTE: Backfill (Aggregiert & Robust) für players/{playerId}/scoresHistory');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // 1. Lösche zuerst alle bestehenden Einträge
  console.log('🧹 Lösche alte scoresHistory Einträge...');
  const playersSnap = await db.collection('players').where('groupIds', 'array-contains', groupId).get();
  for (const playerDoc of playersSnap.docs) {
    const batch = db.batch();
    const historySnap = await db.collection('players').doc(playerDoc.id).collection('scoresHistory').get();
    historySnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log('✅ Alte Einträge gelöscht.\n');

  // 2. Lade alle jassGameSummaries
  const sessionsSnap = await db.collection('groups').doc(groupId).collection('jassGameSummaries')
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`📊 Gefunden: ${sessionsSnap.size} abgeschlossene Sessions\n`);
  
  let totalSessionsProcessed = 0;
  let totalEntriesCreated = 0;
  
  for (const sessionDoc of sessionsSnap.docs) {
    const sessionId = sessionDoc.id;
    const sessionData = sessionDoc.data();
    const completedAt = sessionData.completedAt;
    const participantPlayerIds = sessionData.participantPlayerIds || [];
    
    totalSessionsProcessed++;
    
    const playerTotals = new Map();
    
    participantPlayerIds.forEach(pid => {
      playerTotals.set(pid, {
        stricheDiff: 0,
        pointsDiff: 0,
        matschBilanz: 0,
        schneiderBilanz: 0,
        kontermatschBilanz: 0,
        played: false
      });
    });

    // ---------------------------------------------------------
    // A) TURNIER / MEHRERE SPIELE (gameResults vorhanden)
    // ---------------------------------------------------------
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults) && sessionData.gameResults.length > 0) {
      
      for (const game of sessionData.gameResults) {
        const topPlayers = game.teams?.top?.players || [];
        const bottomPlayers = game.teams?.bottom?.players || [];
        const allGamePlayers = [...topPlayers, ...bottomPlayers];
        
        for (const playerObj of allGamePlayers) {
          const playerId = playerObj.playerId;
          if (!playerId || !playerTotals.has(playerId)) continue;
          
          const totals = playerTotals.get(playerId);
          totals.played = true;
          
          const playerTeam = topPlayers.some(p => p.playerId === playerId) ? 'top' : 'bottom';
          
          totals.stricheDiff += calculateStricheDiff(game, playerTeam);
          totals.pointsDiff += calculatePointsDiff(game, playerTeam);
          totals.matschBilanz += calculateMatschBilanz(game, playerTeam);
          totals.schneiderBilanz += calculateSchneiderBilanz(game, playerTeam);
          totals.kontermatschBilanz += calculateKontermatschBilanz(game, playerTeam);
        }
      }
    } 
    // ---------------------------------------------------------
    // B) REGULÄRE SESSION
    // ---------------------------------------------------------
    else {
      const finalStriche = sessionData.finalStriche || {};
      const finalScores = sessionData.finalScores || {};
      const eventCounts = sessionData.eventCounts || {};
      const teams = sessionData.teams || {};
      
      const topPlayers = teams.top?.players || [];
      const bottomPlayers = teams.bottom?.players || [];
      const allSessionPlayers = [...topPlayers, ...bottomPlayers];
      
      for (const playerObj of allSessionPlayers) {
        const playerId = playerObj.playerId;
        if (!playerId || !playerTotals.has(playerId)) continue;
        
        const totals = playerTotals.get(playerId);
        totals.played = true;
        
        const playerTeam = topPlayers.some(p => p.playerId === playerId) ? 'top' : 'bottom';
        
        totals.stricheDiff = calculateStricheDiffRegular(finalStriche, playerTeam);
        totals.pointsDiff = calculatePointsDiffRegular(finalScores, playerTeam);
        totals.matschBilanz = calculateMatschBilanzRegular(eventCounts, finalStriche, playerTeam); // Update!
        totals.schneiderBilanz = calculateSchneiderBilanzRegular(eventCounts, finalStriche, playerTeam); // Update!
        totals.kontermatschBilanz = calculateKontermatschBilanzRegular(eventCounts, finalStriche, playerTeam); // Update!
      }
    }
    
    // ---------------------------------------------------------
    // SPEICHERN
    // ---------------------------------------------------------
    for (const [playerId, totals] of playerTotals) {
      if (!totals.played) continue;
      
      await db.collection('players').doc(playerId).collection('scoresHistory').doc(sessionId).set({
        eventType: 'game',
        stricheDiff: totals.stricheDiff,
        pointsDiff: totals.pointsDiff,
        matschBilanz: totals.matschBilanz,
        schneiderBilanz: totals.schneiderBilanz,
        kontermatschBilanz: totals.kontermatschBilanz,
        completedAt,
        groupId,
        sessionId,
        gameId: sessionId,
        isTournament: !!(sessionData.isTournamentSession || sessionData.tournamentId)
      });
      
      totalEntriesCreated++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ BACKFILL (ROBUST) ABGESCHLOSSEN!');
  console.log(`   Sessions: ${totalSessionsProcessed}`);
  console.log(`   Einträge: ${totalEntriesCreated}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════
// HILFSFUNKTIONEN (ROBUST)
// ═══════════════════════════════════════════════════════════

function getValueFromEventsOrStriche(game, type, playerTeam) {
  // 1. Versuche eventCounts
  const eventCounts = game.eventCounts || {};
  const myEvents = eventCounts[playerTeam];
  const oppEvents = eventCounts[playerTeam === 'top' ? 'bottom' : 'top'];
  
  if (myEvents?.[type] !== undefined && oppEvents?.[type] !== undefined) {
    return (myEvents[type] || 0) - (oppEvents[type] || 0);
  }
  
  // 2. Fallback auf finalStriche
  const finalStriche = game.finalStriche || {};
  const myStriche = finalStriche[playerTeam] || {};
  const oppStriche = finalStriche[playerTeam === 'top' ? 'bottom' : 'top'] || {};
  
  return (myStriche[type] || 0) - (oppStriche[type] || 0);
}

function calculateMatschBilanz(game, playerTeam) {
  return getValueFromEventsOrStriche(game, 'matsch', playerTeam);
}

function calculateSchneiderBilanz(game, playerTeam) {
  return getValueFromEventsOrStriche(game, 'schneider', playerTeam);
}

function calculateKontermatschBilanz(game, playerTeam) {
  return getValueFromEventsOrStriche(game, 'kontermatsch', playerTeam);
}

// --- Regular ---

function calculateMatschBilanzRegular(eventCounts, finalStriche, playerTeam) {
  // Same logic but flattened arguments
  const myEvents = eventCounts[playerTeam];
  if (myEvents?.matsch !== undefined) {
    return (eventCounts[playerTeam]?.matsch || 0) - (eventCounts[playerTeam === 'top' ? 'bottom' : 'top']?.matsch || 0);
  }
  return (finalStriche[playerTeam]?.matsch || 0) - (finalStriche[playerTeam === 'top' ? 'bottom' : 'top']?.matsch || 0);
}

function calculateSchneiderBilanzRegular(eventCounts, finalStriche, playerTeam) {
  const myEvents = eventCounts[playerTeam];
  if (myEvents?.schneider !== undefined) {
    return (eventCounts[playerTeam]?.schneider || 0) - (eventCounts[playerTeam === 'top' ? 'bottom' : 'top']?.schneider || 0);
  }
  return (finalStriche[playerTeam]?.schneider || 0) - (finalStriche[playerTeam === 'top' ? 'bottom' : 'top']?.schneider || 0);
}

function calculateKontermatschBilanzRegular(eventCounts, finalStriche, playerTeam) {
  const myEvents = eventCounts[playerTeam];
  if (myEvents?.kontermatsch !== undefined) {
    return (eventCounts[playerTeam]?.kontermatsch || 0) - (eventCounts[playerTeam === 'top' ? 'bottom' : 'top']?.kontermatsch || 0);
  }
  return (finalStriche[playerTeam]?.kontermatsch || 0) - (finalStriche[playerTeam === 'top' ? 'bottom' : 'top']?.kontermatsch || 0);
}

// --- Standard ---
function calculateStricheDiff(game, playerTeam) {
  const finalStriche = game.finalStriche || {};
  const myStriche = finalStriche[playerTeam] || {};
  const opponentStriche = finalStriche[playerTeam === 'top' ? 'bottom' : 'top'] || {};
  const sumStriche = (s) => (s.berg || 0) + (s.sieg || 0) + (s.matsch || 0) + (s.schneider || 0) + (s.kontermatsch || 0);
  return sumStriche(myStriche) - sumStriche(opponentStriche);
}
function calculatePointsDiff(game, playerTeam) {
  const myPoints = playerTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
  const opponentPoints = playerTeam === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
  return myPoints - opponentPoints;
}
function calculateStricheDiffRegular(finalStriche, playerTeam) {
  const myStriche = finalStriche[playerTeam] || {};
  const opponentStriche = finalStriche[playerTeam === 'top' ? 'bottom' : 'top'] || {};
  const sumStriche = (s) => (s.berg || 0) + (s.sieg || 0) + (s.matsch || 0) + (s.schneider || 0) + (s.kontermatsch || 0);
  return sumStriche(myStriche) - sumStriche(opponentStriche);
}
function calculatePointsDiffRegular(finalScores, playerTeam) {
  const myPoints = finalScores[playerTeam] || 0;
  const opponentPoints = finalScores[playerTeam === 'top' ? 'bottom' : 'top'] || 0;
  return myPoints - opponentPoints;
}

backfillScoresHistoryAggregated().catch(console.error);
