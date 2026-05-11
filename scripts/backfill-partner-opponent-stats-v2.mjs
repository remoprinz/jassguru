/**
 * 🎯 Backfill v2 — Partner & Opponent Stats korrekt per-Spiel-per-Partner aggregieren
 *
 * SPIEGELT die Logik der Cloud Function unifiedPlayerDataService.ts.calculateSessionDelta()
 * nach dem Fix in Commit 77558720.
 *
 * Was passiert:
 *   - Iteriert ALLE jassGameSummaries (collectionGroup) aus allen Gruppen wo der
 *     Spieler im participantPlayerIds-Array steckt + status='completed' oder
 *     'completed_empty'.
 *   - Pro Session: berechnet per-Partner / per-Gegner-Werte
 *     - Normal Session: festes Team → alle Partner bekommen identische Session-Total-Werte
 *     - Tournament: iteriert gameResults und attribuiert game-level Werte nur den Partner/
 *       Gegnern, die in diesem Spiel tatsächlich mit/gegen den Spieler waren.
 *   - Aggregiert über ALLE Sessions zu Map<partnerId, AggregatedValues>.
 *   - Schreibt (oder loggt bei Dry-Run) das Aggregat nach
 *     players/{playerId}/partnerStats/{partnerId} bzw. opponentStats/{opponentId}.
 *
 * WICHTIG:
 *   - merge: true → andere Felder (Rundentempo, Trumpf-Statistik) bleiben erhalten.
 *   - dryRun: true → KEIN Write, nur Logs.
 *
 * Aufruf:
 *   node scripts/backfill-partner-opponent-stats-v2.mjs --player=<playerId>          (Dry-Run, einzelner Spieler)
 *   node scripts/backfill-partner-opponent-stats-v2.mjs --player=<playerId> --write  (Real Write)
 *   node scripts/backfill-partner-opponent-stats-v2.mjs --all-players                (Dry-Run, alle)
 *   node scripts/backfill-partner-opponent-stats-v2.mjs --all-players --write        (Real Write, alle)
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ============================================================================
// CLI ARGS
// ============================================================================
const args = process.argv.slice(2);
const playerIdArg = args.find(a => a.startsWith('--player='))?.split('=')[1];
const allPlayers = args.includes('--all-players');
const dryRun = !args.includes('--write');

if (!playerIdArg && !allPlayers) {
  console.error('❌ Usage:');
  console.error('  node scripts/backfill-partner-opponent-stats-v2.mjs --player=<playerId>          (Dry-Run)');
  console.error('  node scripts/backfill-partner-opponent-stats-v2.mjs --player=<playerId> --write');
  console.error('  node scripts/backfill-partner-opponent-stats-v2.mjs --all-players                 (Dry-Run)');
  console.error('  node scripts/backfill-partner-opponent-stats-v2.mjs --all-players --write');
  process.exit(1);
}

// ============================================================================
// FIREBASE INIT
// ============================================================================
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`🎯 Backfill Partner/Opponent Stats v2`);
console.log(`   Mode: ${dryRun ? '🔍 DRY-RUN (kein Write)' : '💾 WRITE'}`);
console.log(`   Scope: ${playerIdArg ? `Player ${playerIdArg}` : 'ALLE Player'}`);
console.log(`══════════════════════════════════════════════════════════════\n`);

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  let playerIds = [];

  if (playerIdArg) {
    playerIds = [playerIdArg];
  } else {
    const snap = await db.collection('players').get();
    playerIds = snap.docs.map(d => d.id);
    console.log(`📋 Gefunden: ${playerIds.length} Player im players-Index\n`);
  }

  let totalSessions = 0;
  let totalPartnerWrites = 0;
  let totalOpponentWrites = 0;

  for (const playerId of playerIds) {
    const result = await recomputeForPlayer(playerId);
    totalSessions += result.sessionsProcessed;
    totalPartnerWrites += result.partnerCount;
    totalOpponentWrites += result.opponentCount;
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`✅ Fertig.`);
  console.log(`   Players processed:   ${playerIds.length}`);
  console.log(`   Sessions processed:  ${totalSessions}`);
  console.log(`   Partner-Docs:        ${totalPartnerWrites} ${dryRun ? '(würden geschrieben)' : '(geschrieben)'}`);
  console.log(`   Opponent-Docs:       ${totalOpponentWrites} ${dryRun ? '(würden geschrieben)' : '(geschrieben)'}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  process.exit(0);
}

// ============================================================================
// RECOMPUTE FÜR EINEN SPIELER
// ============================================================================
async function recomputeForPlayer(playerId) {
  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`👤 Player ${playerId}`);

  // 1. Player-Dokument: aktuellen displayName für sich selbst
  const playerDocSnap = await db.collection('players').doc(playerId).get();
  if (!playerDocSnap.exists) {
    console.log(`   ⚠️  Player-Dokument nicht gefunden. Skip.`);
    return { sessionsProcessed: 0, partnerCount: 0, opponentCount: 0 };
  }
  const playerName = playerDocSnap.data().displayName || playerId;
  console.log(`   Name: ${playerName}`);

  // 2. Lade alle jassGameSummaries wo dieser Spieler dabei war
  const sessionsSnap = await db.collectionGroup('jassGameSummaries')
    .where('participantPlayerIds', 'array-contains', playerId)
    .get();

  let validSessions = 0;
  // Aggregations-Maps
  const partnerAgg = new Map(); // partnerId → AggregatedPartner
  const opponentAgg = new Map();

  for (const doc of sessionsSnap.docs) {
    const sessionData = doc.data();
    const status = sessionData.status;
    if (status !== 'completed' && status !== 'completed_empty') continue;

    const delta = calculateSessionDelta(playerId, sessionData);
    if (!delta.playerTeam && delta.partnerDeltas.size === 0) {
      // Player war nicht in dieser Session (defensive)
      continue;
    }
    validSessions++;

    // Aggregiere partner
    for (const [pid, pd] of delta.partnerDeltas) {
      const agg = partnerAgg.get(pid) || newPartnerAgg(pid, pd.partnerDisplayName);
      agg.partnerDisplayName = pd.partnerDisplayName || agg.partnerDisplayName;
      agg.sessionsPlayedWith += pd.sessionsPlayedWith;
      agg.sessionsWonWith += pd.sessionsWonWith;
      agg.sessionsLostWith += pd.sessionsLostWith;
      agg.sessionsDrawWith += pd.sessionsDrawWith;
      agg.gamesPlayedWith += pd.gamesPlayedWith;
      agg.gamesWonWith += pd.gamesWonWith;
      agg.gamesLostWith += pd.gamesLostWith;
      agg.totalStricheDifferenceWith += pd.stricheDifferenceWith;
      agg.totalPointsDifferenceWith += pd.pointsDifferenceWith;
      agg.matschEventsMadeWith += pd.matschEventsMadeWith;
      agg.matschEventsReceivedWith += pd.matschEventsReceivedWith;
      agg.schneiderEventsMadeWith += pd.schneiderEventsMadeWith;
      agg.schneiderEventsReceivedWith += pd.schneiderEventsReceivedWith;
      agg.kontermatschEventsMadeWith += pd.kontermatschEventsMadeWith;
      agg.kontermatschEventsReceivedWith += pd.kontermatschEventsReceivedWith;
      agg.totalWeisPointsWith += pd.weisPointsWith;
      agg.totalWeisReceivedWith += pd.weisReceivedWith;

      // lastPlayedWithTimestamp: max
      const sessionTs = sessionData.endedAt || sessionData.completedAt || sessionData.startedAt;
      if (sessionTs && (!agg._lastTs || compareTs(sessionTs, agg._lastTs) > 0)) {
        agg._lastTs = sessionTs;
      }
      partnerAgg.set(pid, agg);
    }

    // Aggregiere opponent
    for (const [oid, od] of delta.opponentDeltas) {
      const agg = opponentAgg.get(oid) || newOpponentAgg(oid, od.opponentDisplayName);
      agg.opponentDisplayName = od.opponentDisplayName || agg.opponentDisplayName;
      agg.sessionsPlayedAgainst += od.sessionsPlayedAgainst;
      agg.sessionsWonAgainst += od.sessionsWonAgainst;
      agg.sessionsLostAgainst += od.sessionsLostAgainst;
      agg.sessionsDrawAgainst += od.sessionsDrawAgainst;
      agg.gamesPlayedAgainst += od.gamesPlayedAgainst;
      agg.gamesWonAgainst += od.gamesWonAgainst;
      agg.gamesLostAgainst += od.gamesLostAgainst;
      agg.totalStricheDifferenceAgainst += od.stricheDifferenceAgainst;
      agg.totalPointsDifferenceAgainst += od.pointsDifferenceAgainst;
      agg.matschEventsMadeAgainst += od.matschEventsMadeAgainst;
      agg.matschEventsReceivedAgainst += od.matschEventsReceivedAgainst;
      agg.schneiderEventsMadeAgainst += od.schneiderEventsMadeAgainst;
      agg.schneiderEventsReceivedAgainst += od.schneiderEventsReceivedAgainst;
      agg.kontermatschEventsMadeAgainst += od.kontermatschEventsMadeAgainst;
      agg.kontermatschEventsReceivedAgainst += od.kontermatschEventsReceivedAgainst;
      agg.totalWeisPointsAgainst += od.weisPointsAgainst;
      agg.totalWeisReceivedAgainst += od.weisReceivedAgainst;

      const sessionTs = sessionData.endedAt || sessionData.completedAt || sessionData.startedAt;
      if (sessionTs && (!agg._lastTs || compareTs(sessionTs, agg._lastTs) > 0)) {
        agg._lastTs = sessionTs;
      }
      opponentAgg.set(oid, agg);
    }
  }

  console.log(`   Sessions verarbeitet: ${validSessions} / ${sessionsSnap.size}`);
  console.log(`   Partner gefunden:     ${partnerAgg.size}`);
  console.log(`   Gegner gefunden:      ${opponentAgg.size}`);

  // 3. Finalisieren: Bilanzen, WinRates, displayNames aktualisieren
  const allOtherIds = new Set([...partnerAgg.keys(), ...opponentAgg.keys()]);
  const displayNames = new Map();
  if (allOtherIds.size > 0) {
    const idsArr = Array.from(allOtherIds);
    // Firestore 'in' query limited to 10 → chunked
    for (let i = 0; i < idsArr.length; i += 10) {
      const chunk = idsArr.slice(i, i + 10);
      const snap = await db.collection('players')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(d => displayNames.set(d.id, d.data().displayName || d.id));
    }
  }

  // 4. Logs & Writes
  if (partnerAgg.size > 0) {
    console.log(`\n   📊 PARTNER-AGGREGATE:`);
    for (const [pid, agg] of partnerAgg) {
      finalizePartner(agg, displayNames.get(pid));
      const stricheSign = agg.totalStricheDifferenceWith > 0 ? '+' : '';
      console.log(`      ${(displayNames.get(pid) || agg.partnerDisplayName || pid).padEnd(20)} ${stricheSign}${agg.totalStricheDifferenceWith.toString().padStart(5)} Striche  |  ${agg.gamesPlayedWith} Spiele  |  ${agg.sessionsPlayedWith} Sessions`);
    }
  }

  if (opponentAgg.size > 0) {
    console.log(`\n   📊 OPPONENT-AGGREGATE:`);
    for (const [oid, agg] of opponentAgg) {
      finalizeOpponent(agg, displayNames.get(oid));
      const stricheSign = agg.totalStricheDifferenceAgainst > 0 ? '+' : '';
      console.log(`      ${(displayNames.get(oid) || agg.opponentDisplayName || oid).padEnd(20)} ${stricheSign}${agg.totalStricheDifferenceAgainst.toString().padStart(5)} Striche  |  ${agg.gamesPlayedAgainst} Spiele  |  ${agg.sessionsPlayedAgainst} Sessions`);
    }
  }

  // 5. Write (oder dry-run skip)
  if (!dryRun && (partnerAgg.size > 0 || opponentAgg.size > 0)) {
    console.log(`\n   💾 Schreibe nach Firestore (merge: true) …`);
    const batch = db.batch();
    let batchOps = 0;

    for (const [pid, agg] of partnerAgg) {
      const writeData = { ...agg };
      delete writeData._lastTs;
      if (agg._lastTs) writeData.lastPlayedWithTimestamp = agg._lastTs;
      const ref = db.collection('players').doc(playerId).collection('partnerStats').doc(pid);
      batch.set(ref, writeData, { merge: true });
      batchOps++;
      if (batchOps >= 400) {
        await batch.commit();
        batchOps = 0;
      }
    }

    for (const [oid, agg] of opponentAgg) {
      const writeData = { ...agg };
      delete writeData._lastTs;
      if (agg._lastTs) writeData.lastPlayedAgainstTimestamp = agg._lastTs;
      const ref = db.collection('players').doc(playerId).collection('opponentStats').doc(oid);
      batch.set(ref, writeData, { merge: true });
      batchOps++;
      if (batchOps >= 400) {
        await batch.commit();
        batchOps = 0;
      }
    }

    if (batchOps > 0) await batch.commit();
    console.log(`      ✅ ${partnerAgg.size + opponentAgg.size} Docs gemerged.`);
  } else if (dryRun && (partnerAgg.size > 0 || opponentAgg.size > 0)) {
    console.log(`\n   🔍 DRY-RUN: Keine Writes.`);
  }

  return { sessionsProcessed: validSessions, partnerCount: partnerAgg.size, opponentCount: opponentAgg.size };
}

// ============================================================================
// FINALIZE-Helpers: Bilanzen + WinRates aus den raw-counters berechnen
// ============================================================================
function finalizePartner(agg, currentDisplayName) {
  if (currentDisplayName) agg.partnerDisplayName = currentDisplayName;
  agg.matschBilanzWith = agg.matschEventsMadeWith - agg.matschEventsReceivedWith;
  agg.schneiderBilanzWith = agg.schneiderEventsMadeWith - agg.schneiderEventsReceivedWith;
  agg.kontermatschBilanzWith = agg.kontermatschEventsMadeWith - agg.kontermatschEventsReceivedWith;
  agg.weisDifferenceWith = agg.totalWeisPointsWith - agg.totalWeisReceivedWith;
  const decidedSessions = agg.sessionsWonWith + agg.sessionsLostWith;
  agg.sessionWinRateWith = decidedSessions > 0 ? agg.sessionsWonWith / decidedSessions : 0;
  const decidedGames = agg.gamesWonWith + agg.gamesLostWith;
  agg.gameWinRateWith = decidedGames > 0 ? agg.gamesWonWith / decidedGames : 0;
}

function finalizeOpponent(agg, currentDisplayName) {
  if (currentDisplayName) agg.opponentDisplayName = currentDisplayName;
  agg.matschBilanzAgainst = agg.matschEventsMadeAgainst - agg.matschEventsReceivedAgainst;
  agg.schneiderBilanzAgainst = agg.schneiderEventsMadeAgainst - agg.schneiderEventsReceivedAgainst;
  agg.kontermatschBilanzAgainst = agg.kontermatschEventsMadeAgainst - agg.kontermatschEventsReceivedAgainst;
  agg.weisDifferenceAgainst = agg.totalWeisPointsAgainst - agg.totalWeisReceivedAgainst;
  const decidedSessions = agg.sessionsWonAgainst + agg.sessionsLostAgainst;
  agg.sessionWinRateAgainst = decidedSessions > 0 ? agg.sessionsWonAgainst / decidedSessions : 0;
  const decidedGames = agg.gamesWonAgainst + agg.gamesLostAgainst;
  agg.gameWinRateAgainst = decidedGames > 0 ? agg.gamesWonAgainst / decidedGames : 0;
}

function newPartnerAgg(partnerId, displayName) {
  return {
    partnerId,
    partnerDisplayName: displayName || 'Unbekannt',
    sessionsPlayedWith: 0, sessionsWonWith: 0, sessionsLostWith: 0, sessionsDrawWith: 0,
    gamesPlayedWith: 0, gamesWonWith: 0, gamesLostWith: 0,
    totalStricheDifferenceWith: 0, totalPointsDifferenceWith: 0,
    matschEventsMadeWith: 0, matschEventsReceivedWith: 0,
    schneiderEventsMadeWith: 0, schneiderEventsReceivedWith: 0,
    kontermatschEventsMadeWith: 0, kontermatschEventsReceivedWith: 0,
    totalWeisPointsWith: 0, totalWeisReceivedWith: 0,
    _lastTs: null,
  };
}

function newOpponentAgg(opponentId, displayName) {
  return {
    opponentId,
    opponentDisplayName: displayName || 'Unbekannt',
    sessionsPlayedAgainst: 0, sessionsWonAgainst: 0, sessionsLostAgainst: 0, sessionsDrawAgainst: 0,
    gamesPlayedAgainst: 0, gamesWonAgainst: 0, gamesLostAgainst: 0,
    totalStricheDifferenceAgainst: 0, totalPointsDifferenceAgainst: 0,
    matschEventsMadeAgainst: 0, matschEventsReceivedAgainst: 0,
    schneiderEventsMadeAgainst: 0, schneiderEventsReceivedAgainst: 0,
    kontermatschEventsMadeAgainst: 0, kontermatschEventsReceivedAgainst: 0,
    totalWeisPointsAgainst: 0, totalWeisReceivedAgainst: 0,
    _lastTs: null,
  };
}

function compareTs(a, b) {
  const av = a?.toMillis ? a.toMillis() : (a?._seconds ? a._seconds * 1000 : (typeof a === 'number' ? a : 0));
  const bv = b?.toMillis ? b.toMillis() : (b?._seconds ? b._seconds * 1000 : (typeof b === 'number' ? b : 0));
  return av - bv;
}

// ============================================================================
// CALCULATE-SESSION-DELTA — SPIEGEL der Cloud Function nach Fix 77558720
// ============================================================================
function calculateSessionDelta(playerId, sessionData) {
  const delta = {
    sessionsPlayed: 0, sessionsWon: 0, sessionsLost: 0, sessionsDraw: 0,
    gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
    pointsMade: 0, pointsReceived: 0, pointsDifference: 0,
    stricheMade: 0, stricheReceived: 0, stricheDifference: 0,
    weisPoints: 0, weisReceived: 0,
    matschEventsMade: 0, matschEventsReceived: 0,
    schneiderEventsMade: 0, schneiderEventsReceived: 0,
    kontermatschEventsMade: 0, kontermatschEventsReceived: 0,
    partnerIds: [], partnerNames: {},
    opponentIds: [], opponentNames: {},
    partnerDeltas: new Map(),
    opponentDeltas: new Map(),
    playerTeam: null,
  };

  // Player team bestimmen
  let playerTeam = null;
  if (sessionData.teams?.top?.players?.some(p => p.playerId === playerId)) playerTeam = 'top';
  else if (sessionData.teams?.bottom?.players?.some(p => p.playerId === playerId)) playerTeam = 'bottom';

  if (!playerTeam && Array.isArray(sessionData.gameResults)) {
    for (const game of sessionData.gameResults) {
      if (game.teams?.top?.players?.some(p => p.playerId === playerId)) { playerTeam = 'top'; break; }
      else if (game.teams?.bottom?.players?.some(p => p.playerId === playerId)) { playerTeam = 'bottom'; break; }
    }
  }
  if (!playerTeam) return delta; // Spieler nicht in Session
  delta.playerTeam = playerTeam;

  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  const isTournament = Boolean(sessionData.isTournamentSession) || Boolean(sessionData.tournamentId);

  // SESSIONS (nur normale Sessions zählen)
  if (!isTournament) {
    delta.sessionsPlayed = 1;
    if (sessionData.winnerTeamKey === playerTeam) delta.sessionsWon = 1;
    else if (sessionData.winnerTeamKey === 'draw' || sessionData.winnerTeamKey === 'tie') delta.sessionsDraw = 1;
    else delta.sessionsLost = 1;
  }

  // GAMES
  if (isTournament && Array.isArray(sessionData.gameResults)) {
    let played = 0, won = 0, lost = 0;
    for (const game of sessionData.gameResults) {
      const inTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const inBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      if (!inTop && !inBottom) continue;
      played++;
      const myTeam = inTop ? 'top' : 'bottom';
      const winner = game.winnerTeam || game.winnerTeamKey;
      if (winner === myTeam) won++;
      else if (winner && winner !== 'draw' && winner !== myTeam) lost++;
    }
    delta.gamesPlayed = played;
    delta.gamesWon = won;
    delta.gamesLost = lost;
  } else {
    delta.gamesPlayed = sessionData.gamesPlayed || 0;
    const wbp = sessionData.gameWinsByPlayer?.[playerId];
    if (wbp) {
      delta.gamesWon = wbp.wins || 0;
      delta.gamesLost = wbp.losses || 0;
    }
  }

  // SCORES, STRICHE (Session-Total — wird nur für non-Tournament-Branch zur Partner-Verteilung gebraucht)
  if (isTournament && sessionData.totalPointsByPlayer) {
    delta.pointsMade = sessionData.totalPointsByPlayer[playerId] || 0;
    let oppPts = 0;
    if (Array.isArray(sessionData.gameResults)) {
      for (const game of sessionData.gameResults) {
        const inTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
        const inBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
        if (inTop) oppPts += game.bottomScore || 0;
        else if (inBottom) oppPts += game.topScore || 0;
      }
    }
    delta.pointsReceived = oppPts;
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  } else if (sessionData.finalScores) {
    delta.pointsMade = sessionData.finalScores[playerTeam] || 0;
    delta.pointsReceived = sessionData.finalScores[opponentTeam] || 0;
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  }

  if (isTournament && sessionData.totalStricheByPlayer?.[playerId]) {
    delta.stricheMade = sumStriche(sessionData.totalStricheByPlayer[playerId]);
    let oppStr = 0;
    if (Array.isArray(sessionData.gameResults)) {
      for (const game of sessionData.gameResults) {
        const inTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
        const inBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
        if (inTop && game.finalStriche?.bottom) oppStr += sumStriche(game.finalStriche.bottom);
        else if (inBottom && game.finalStriche?.top) oppStr += sumStriche(game.finalStriche.top);
      }
    }
    delta.stricheReceived = oppStr;
    delta.stricheDifference = delta.stricheMade - delta.stricheReceived;
  } else if (sessionData.finalStriche) {
    delta.stricheMade = sumStriche(sessionData.finalStriche[playerTeam]);
    delta.stricheReceived = sumStriche(sessionData.finalStriche[opponentTeam]);
    delta.stricheDifference = delta.stricheMade - delta.stricheReceived;
  }

  // WEIS (Session-Total)
  if (sessionData.sessionTotalWeisPoints) {
    delta.weisPoints = sessionData.sessionTotalWeisPoints[playerTeam] || 0;
    delta.weisReceived = sessionData.sessionTotalWeisPoints[opponentTeam] || 0;
  }

  // EVENTS (Session-Total)
  if (isTournament && sessionData.totalEventCountsByPlayer?.[playerId]) {
    const pe = sessionData.totalEventCountsByPlayer[playerId];
    delta.matschEventsMade = pe.matschMade || 0;
    delta.matschEventsReceived = pe.matschReceived || 0;
    delta.schneiderEventsMade = pe.schneiderMade || 0;
    delta.schneiderEventsReceived = pe.schneiderReceived || 0;
    delta.kontermatschEventsMade = pe.kontermatschMade || 0;
    delta.kontermatschEventsReceived = pe.kontermatschReceived || 0;
  } else if (sessionData.eventCounts) {
    const te = sessionData.eventCounts[playerTeam] || {};
    const oe = sessionData.eventCounts[opponentTeam] || {};
    delta.matschEventsMade = te.matsch || 0;
    delta.matschEventsReceived = oe.matsch || 0;
    delta.schneiderEventsMade = te.schneider || 0;
    delta.schneiderEventsReceived = oe.schneider || 0;
    delta.kontermatschEventsMade = te.kontermatsch || 0;
    delta.kontermatschEventsReceived = oe.kontermatsch || 0;
  }

  // PARTNER/OPPONENT IDs (für die non-Tournament-Branch)
  let teamPlayers = [];
  let opponentPlayers = [];
  if (isTournament && (!sessionData.teams || !sessionData.teams[playerTeam]) && Array.isArray(sessionData.gameResults)) {
    const ps = new Map(), os = new Map();
    for (const game of sessionData.gameResults) {
      const tp = game.teams?.top?.players || [];
      const bp = game.teams?.bottom?.players || [];
      const inTop = tp.some(p => p.playerId === playerId);
      const inBottom = bp.some(p => p.playerId === playerId);
      if (inTop) {
        tp.forEach(p => { if (p.playerId !== playerId) ps.set(p.playerId, p.displayName || 'Unbekannt'); });
        bp.forEach(p => os.set(p.playerId, p.displayName || 'Unbekannt'));
      } else if (inBottom) {
        bp.forEach(p => { if (p.playerId !== playerId) ps.set(p.playerId, p.displayName || 'Unbekannt'); });
        tp.forEach(p => os.set(p.playerId, p.displayName || 'Unbekannt'));
      }
    }
    teamPlayers = Array.from(ps.entries()).map(([id, n]) => ({ playerId: id, displayName: n }));
    opponentPlayers = Array.from(os.entries()).map(([id, n]) => ({ playerId: id, displayName: n }));
  } else {
    teamPlayers = sessionData.teams?.[playerTeam]?.players || [];
    opponentPlayers = sessionData.teams?.[opponentTeam]?.players || [];
  }
  teamPlayers.forEach(p => {
    if (p.playerId && p.playerId !== playerId) {
      delta.partnerIds.push(p.playerId);
      delta.partnerNames[p.playerId] = p.displayName || 'Unbekannt';
    }
  });
  opponentPlayers.forEach(p => {
    if (p.playerId) {
      delta.opponentIds.push(p.playerId);
      delta.opponentNames[p.playerId] = p.displayName || 'Unbekannt';
    }
  });

  // ============================================================================
  // 🆕 PER-PARTNER / PER-GEGNER DELTAS aufbauen (genau wie in der Cloud Function)
  // ============================================================================
  if (isTournament && Array.isArray(sessionData.gameResults)) {
    for (const game of sessionData.gameResults) {
      const tp = game.teams?.top?.players || [];
      const bp = game.teams?.bottom?.players || [];
      const inTop = tp.some(p => p.playerId === playerId);
      const inBottom = bp.some(p => p.playerId === playerId);
      if (!inTop && !inBottom) continue;

      const myTeam = inTop ? 'top' : 'bottom';
      const oppTeam = inTop ? 'bottom' : 'top';
      const myPlayers = inTop ? tp : bp;
      const oppPlayers = inTop ? bp : tp;

      const gMade = sumStriche(game.finalStriche?.[myTeam]);
      const gRecv = sumStriche(game.finalStriche?.[oppTeam]);
      const gStricheDiff = gMade - gRecv;
      const gPMade = myTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
      const gPRecv = myTeam === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
      const gPointsDiff = gPMade - gPRecv;
      const winner = game.winnerTeam || game.winnerTeamKey;
      const won = winner === myTeam;
      const lost = winner && winner !== 'draw' && winner !== myTeam;

      const ec = game.eventCounts || {};
      const me = ec[myTeam] || {};
      const oe = ec[oppTeam] || {};
      const gMatschMade = me.matsch || 0;
      const gMatschRecv = oe.matsch || 0;
      const gSchneiderMade = me.schneider || 0;
      const gSchneiderRecv = oe.schneider || 0;
      const gKontermatschMade = me.kontermatsch || 0;
      const gKontermatschRecv = oe.kontermatsch || 0;
      const gWeisMade = game.weisPoints?.[myTeam] || game.sessionTotalWeisPoints?.[myTeam] || 0;
      const gWeisRecv = game.weisPoints?.[oppTeam] || game.sessionTotalWeisPoints?.[oppTeam] || 0;

      for (const p of myPlayers) {
        if (!p.playerId || p.playerId === playerId) continue;
        let pd = delta.partnerDeltas.get(p.playerId);
        if (!pd) {
          pd = newPartnerDelta(p.playerId, p.displayName || 'Unbekannt');
          delta.partnerDeltas.set(p.playerId, pd);
        }
        pd.gamesPlayedWith += 1;
        if (won) pd.gamesWonWith += 1; else if (lost) pd.gamesLostWith += 1;
        pd.stricheDifferenceWith += gStricheDiff;
        pd.pointsDifferenceWith += gPointsDiff;
        pd.matschEventsMadeWith += gMatschMade;
        pd.matschEventsReceivedWith += gMatschRecv;
        pd.schneiderEventsMadeWith += gSchneiderMade;
        pd.schneiderEventsReceivedWith += gSchneiderRecv;
        pd.kontermatschEventsMadeWith += gKontermatschMade;
        pd.kontermatschEventsReceivedWith += gKontermatschRecv;
        pd.weisPointsWith += gWeisMade;
        pd.weisReceivedWith += gWeisRecv;
      }

      for (const o of oppPlayers) {
        if (!o.playerId) continue;
        let od = delta.opponentDeltas.get(o.playerId);
        if (!od) {
          od = newOpponentDelta(o.playerId, o.displayName || 'Unbekannt');
          delta.opponentDeltas.set(o.playerId, od);
        }
        od.gamesPlayedAgainst += 1;
        if (won) od.gamesWonAgainst += 1; else if (lost) od.gamesLostAgainst += 1;
        od.stricheDifferenceAgainst += gStricheDiff;
        od.pointsDifferenceAgainst += gPointsDiff;
        od.matschEventsMadeAgainst += gMatschMade;
        od.matschEventsReceivedAgainst += gMatschRecv;
        od.schneiderEventsMadeAgainst += gSchneiderMade;
        od.schneiderEventsReceivedAgainst += gSchneiderRecv;
        od.kontermatschEventsMadeAgainst += gKontermatschMade;
        od.kontermatschEventsReceivedAgainst += gKontermatschRecv;
        od.weisPointsAgainst += gWeisMade;
        od.weisReceivedAgainst += gWeisRecv;
      }
    }

    // 🆕 Turnier = 1 Session-Datenpunkt pro Partner-/Gegner-Paar
    for (const pd of delta.partnerDeltas.values()) {
      if (pd.gamesPlayedWith > 0) {
        pd.sessionsPlayedWith = 1;
        if (pd.stricheDifferenceWith > 0) pd.sessionsWonWith = 1;
        else if (pd.stricheDifferenceWith < 0) pd.sessionsLostWith = 1;
        else pd.sessionsDrawWith = 1;
      }
    }
    for (const od of delta.opponentDeltas.values()) {
      if (od.gamesPlayedAgainst > 0) {
        od.sessionsPlayedAgainst = 1;
        if (od.stricheDifferenceAgainst > 0) od.sessionsWonAgainst = 1;
        else if (od.stricheDifferenceAgainst < 0) od.sessionsLostAgainst = 1;
        else od.sessionsDrawAgainst = 1;
      }
    }
  } else {
    // Normale Session
    delta.partnerIds.forEach(pid => {
      const pd = newPartnerDelta(pid, delta.partnerNames[pid] || 'Unbekannt');
      pd.sessionsPlayedWith = delta.sessionsPlayed;
      pd.sessionsWonWith = delta.sessionsWon;
      pd.sessionsLostWith = delta.sessionsLost;
      pd.sessionsDrawWith = delta.sessionsDraw;
      pd.gamesPlayedWith = delta.gamesPlayed;
      pd.gamesWonWith = delta.gamesWon;
      pd.gamesLostWith = delta.gamesLost;
      pd.stricheDifferenceWith = delta.stricheDifference;
      pd.pointsDifferenceWith = delta.pointsDifference;
      pd.matschEventsMadeWith = delta.matschEventsMade;
      pd.matschEventsReceivedWith = delta.matschEventsReceived;
      pd.schneiderEventsMadeWith = delta.schneiderEventsMade;
      pd.schneiderEventsReceivedWith = delta.schneiderEventsReceived;
      pd.kontermatschEventsMadeWith = delta.kontermatschEventsMade;
      pd.kontermatschEventsReceivedWith = delta.kontermatschEventsReceived;
      pd.weisPointsWith = delta.weisPoints;
      pd.weisReceivedWith = delta.weisReceived;
      delta.partnerDeltas.set(pid, pd);
    });
    delta.opponentIds.forEach(oid => {
      const od = newOpponentDelta(oid, delta.opponentNames[oid] || 'Unbekannt');
      od.sessionsPlayedAgainst = delta.sessionsPlayed;
      od.sessionsWonAgainst = delta.sessionsWon;
      od.sessionsLostAgainst = delta.sessionsLost;
      od.sessionsDrawAgainst = delta.sessionsDraw;
      od.gamesPlayedAgainst = delta.gamesPlayed;
      od.gamesWonAgainst = delta.gamesWon;
      od.gamesLostAgainst = delta.gamesLost;
      od.stricheDifferenceAgainst = delta.stricheDifference;
      od.pointsDifferenceAgainst = delta.pointsDifference;
      od.matschEventsMadeAgainst = delta.matschEventsMade;
      od.matschEventsReceivedAgainst = delta.matschEventsReceived;
      od.schneiderEventsMadeAgainst = delta.schneiderEventsMade;
      od.schneiderEventsReceivedAgainst = delta.schneiderEventsReceived;
      od.kontermatschEventsMadeAgainst = delta.kontermatschEventsMade;
      od.kontermatschEventsReceivedAgainst = delta.kontermatschEventsReceived;
      od.weisPointsAgainst = delta.weisPoints;
      od.weisReceivedAgainst = delta.weisReceived;
      delta.opponentDeltas.set(oid, od);
    });
  }

  return delta;
}

function newPartnerDelta(partnerId, displayName) {
  return {
    partnerId, partnerDisplayName: displayName,
    sessionsPlayedWith: 0, sessionsWonWith: 0, sessionsLostWith: 0, sessionsDrawWith: 0,
    gamesPlayedWith: 0, gamesWonWith: 0, gamesLostWith: 0,
    stricheDifferenceWith: 0, pointsDifferenceWith: 0,
    matschEventsMadeWith: 0, matschEventsReceivedWith: 0,
    schneiderEventsMadeWith: 0, schneiderEventsReceivedWith: 0,
    kontermatschEventsMadeWith: 0, kontermatschEventsReceivedWith: 0,
    weisPointsWith: 0, weisReceivedWith: 0,
  };
}

function newOpponentDelta(opponentId, displayName) {
  return {
    opponentId, opponentDisplayName: displayName,
    sessionsPlayedAgainst: 0, sessionsWonAgainst: 0, sessionsLostAgainst: 0, sessionsDrawAgainst: 0,
    gamesPlayedAgainst: 0, gamesWonAgainst: 0, gamesLostAgainst: 0,
    stricheDifferenceAgainst: 0, pointsDifferenceAgainst: 0,
    matschEventsMadeAgainst: 0, matschEventsReceivedAgainst: 0,
    schneiderEventsMadeAgainst: 0, schneiderEventsReceivedAgainst: 0,
    kontermatschEventsMadeAgainst: 0, kontermatschEventsReceivedAgainst: 0,
    weisPointsAgainst: 0, weisReceivedAgainst: 0,
  };
}

function sumStriche(s) {
  if (!s) return 0;
  return (s.berg || 0) + (s.sieg || 0) + (s.matsch || 0) + (s.schneider || 0) + (s.kontermatsch || 0);
}

main().catch(err => {
  console.error('❌ FEHLER:', err);
  process.exit(1);
});
