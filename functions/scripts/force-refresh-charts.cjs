const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Helper to calculate Striche Difference
function calculateStricheDifference(session, playerId, teamKey) {
  if (!session.finalStriche) return 0;
  const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
  
  const playerStriche = sumStriche(session.finalStriche[teamKey]);
  const opponentStriche = sumStriche(session.finalStriche[opponentKey]);
  
  return playerStriche - opponentStriche;
}

function sumStriche(striche) {
  if (!striche) return 0;
  return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
}

// Helper for Points Difference
function calculatePointsDifference(session, teamKey) {
  if (!session.finalScores) return 0;
  const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
  return (session.finalScores[teamKey] || 0) - (session.finalScores[opponentKey] || 0);
}

// Helper for Events (Matsch, Schneider, Kontermatsch)
function calculateEventDifference(session, playerId, teamKey, eventType) {
  if (!session.eventCounts) return 0;
  const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
  
  const made = session.eventCounts[teamKey]?.[eventType] || 0;
  const received = session.eventCounts[opponentKey]?.[eventType] || 0;
  
  if (made === 0 && received === 0) return 0; // No event
  return made - received;
}

async function forceRefreshCharts() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const isDryRun = !process.argv.includes('--live'); // Default to dry run
  
  console.log(`Force Refresh Charts for Group ${groupId} (Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'})`);

  // 0. Pre-fetch all player names for the group to ensure labels are correct
  const playerNamesMap = new Map();
  const playersSnap = await db.collection('players').where('groupIds', 'array-contains', groupId).get();
  playersSnap.forEach(doc => {
      playerNamesMap.set(doc.id, doc.data().displayName);
  });
  console.log(`Loaded ${playerNamesMap.size} player names from group.`);
  const sessionsSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();

  console.log(`Found ${sessionsSnapshot.size} completed sessions.`);

  // 2. Prepare data structures
  const labels = [];
  const playersData = new Map(); // playerId -> { displayName, striche: [], points: [], matsch: [], schneider: [], konter: [] }
  const tournamentRankingsCache = new Map(); // tournamentId -> Map<playerId, rankings>

  // 3. Process sessions
  for (const doc of sessionsSnapshot.docs) {
    const session = doc.data();
    const sessionId = doc.id;
    
    // Format Date
    let completedAt;
    if (session.completedAt && session.completedAt.toDate) {
      completedAt = session.completedAt.toDate();
    } else if (session.completedAt) {
      completedAt = new Date(session.completedAt);
    } else {
      completedAt = new Date();
    }
    
    const dateLabel = completedAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    labels.push(dateLabel);

    // Check for Tournament
    const isTournament = session.isTournamentSession || !!session.tournamentId || (Array.isArray(session.gameResults) && session.gameResults.length > 0);
    let tournamentRankings = null;

    if (isTournament && session.tournamentId) {
      if (!tournamentRankingsCache.has(session.tournamentId)) {
        console.log(`Loading rankings for tournament ${session.tournamentId}...`);
        const rankingsSnap = await db.collection(`tournaments/${session.tournamentId}/playerRankings`).get();
        const rankings = new Map();
        rankingsSnap.forEach(rDoc => rankings.set(rDoc.data().playerId, rDoc.data()));
        tournamentRankingsCache.set(session.tournamentId, rankings);
        
        if (rankings.has('4nhOwuVONajPArNERzyEj')) {
             console.log(`Davester found in tournament ${session.tournamentId}!`);
        } else {
             console.log(`Davester NOT found in tournament ${session.tournamentId} rankings.`);
        }
      }
      tournamentRankings = tournamentRankingsCache.get(session.tournamentId);
    }

    // Identify Participants
    const participantIds = new Set();
    if (isTournament && tournamentRankings) {
      for (const pid of tournamentRankings.keys()) participantIds.add(pid);
    } else {
      // Regular session participants
      if (session.teams?.top?.players) session.teams.top.players.forEach(p => participantIds.add(p.playerId));
      if (session.teams?.bottom?.players) session.teams.bottom.players.forEach(p => participantIds.add(p.playerId));
    }

    // Initialize new players
    for (const pid of participantIds) {
      if (!playersData.has(pid)) {
        // Need display name. Try to find it in session or use fallback
        let displayName = 'Unknown';
        if (isTournament && tournamentRankings?.has(pid)) {
          displayName = tournamentRankings.get(pid).displayName || tournamentRankings.get(pid).playerName;
        } else {
          // Try to find in teams
          const p = session.teams?.top?.players?.find(x => x.playerId === pid) || session.teams?.bottom?.players?.find(x => x.playerId === pid);
          if (p) displayName = p.displayName;
        }
        
        // Fetch from Firestore if still Unknown
        if ((!displayName || displayName === 'Unknown') && playerNamesMap.has(pid)) {
             displayName = playerNamesMap.get(pid);
        }
        if (!displayName || displayName === 'Unknown') {
             displayName = 'Player ' + pid.substr(0, 5);
        }

        // Initialize with nulls for previous sessions
        const nulls = Array(labels.length - 1).fill(null);
        playersData.set(pid, {
          displayName,
          striche: { current: 0, history: [...nulls] },
          points: { current: 0, history: [...nulls] },
          matsch: { current: 0, history: [...nulls] },
          schneider: { current: 0, history: [...nulls] },
          konter: { current: 0, history: [...nulls] }
        });
      }
    }

    // Update stats for this session
    for (const [pid, stats] of playersData.entries()) {
      let stricheDelta = null;
      let pointsDelta = null;
      let matschDelta = null;
      let schneiderDelta = null;
      let konterDelta = null;

      if (isTournament && tournamentRankings && tournamentRankings.has(pid)) {
        const r = tournamentRankings.get(pid);
        stricheDelta = r.stricheDifference || 0;
        pointsDelta = r.pointsDifference || 0;
        
        const ec = r.eventCounts || {};
        matschDelta = (ec.matschMade || 0) - (ec.matschReceived || 0);
        schneiderDelta = (ec.schneiderMade || 0) - (ec.schneiderReceived || 0);
        konterDelta = (ec.kontermatschMade || 0) - (ec.kontermatschReceived || 0);
      } else if (!isTournament) {
        // Regular session logic
        const isTop = session.teams?.top?.players?.some(p => p.playerId === pid);
        const isBottom = session.teams?.bottom?.players?.some(p => p.playerId === pid);
        
        if (isTop || isBottom) {
          const teamKey = isTop ? 'top' : 'bottom';
          stricheDelta = calculateStricheDifference(session, pid, teamKey);
          pointsDelta = calculatePointsDifference(session, teamKey);
          matschDelta = calculateEventDifference(session, pid, teamKey, 'matsch');
          schneiderDelta = calculateEventDifference(session, pid, teamKey, 'schneider');
          konterDelta = calculateEventDifference(session, pid, teamKey, 'kontermatsch');
        }
      }

      // Apply deltas
      const updateStat = (statObj, delta) => {
        if (delta !== null) {
          statObj.current += delta;
          statObj.history.push(statObj.current);
        } else {
          statObj.history.push(null);
        }
      };

      updateStat(stats.striche, stricheDelta);
      updateStat(stats.points, pointsDelta);
      updateStat(stats.matsch, matschDelta);
      updateStat(stats.schneider, schneiderDelta);
      updateStat(stats.konter, konterDelta);
    }
  }

  // 4. Prepare Datasets for Firestore
  const createDatasets = (metricKey) => {
    const datasets = [];
    for (const [pid, stats] of playersData.entries()) {
      // Filter out players with NO data (all nulls)
      if (stats[metricKey].history.some(v => v !== null)) {
        datasets.push({
          playerId: pid,
          label: stats.displayName,
          displayName: stats.displayName,
          data: stats[metricKey].history,
          spanGaps: true
        });
      }
    }
    return datasets;
  };

  const charts = {
    'chartData_striche': createDatasets('striche'),
    'chartData_points': createDatasets('points'),
    'chartData_matsch': createDatasets('matsch'),
    'chartData_schneider': createDatasets('schneider'),
    'chartData_kontermatsch': createDatasets('konter'),
  };

  // 5. Write to Firestore
  if (!isDryRun) {
    const batch = db.batch();
    for (const [docName, datasets] of Object.entries(charts)) {
      const ref = db.collection(`groups/${groupId}/aggregated`).doc(docName);
      batch.set(ref, {
        labels: labels,
        datasets: datasets,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        totalSessions: labels.length,
        totalPlayers: datasets.length
      });
    }
    await batch.commit();
    console.log('✅ Charts updated successfully!');
  } else {
    console.log('ℹ️ Dry Run: Charts would be updated with ' + labels.length + ' data points.');
    console.log('Players in Striche Chart:', charts['chartData_striche'].map(d => d.displayName).join(', '));
    
    console.log('Sample Striche Dataset (Davester check):');
    // Check by ID too
    const davester = charts['chartData_striche'].find(d => d.playerId === '4nhOwuVONajPArNERzyEj');
    if (davester) {
      console.log(`Found Davester with ID. Name: ${davester.displayName}`);
      console.log(JSON.stringify(davester.data.slice(-5))); // Show last 5
    } else {
      console.log('Davester not found in chart dataset.');
    }
  }
}

forceRefreshCharts().catch(console.error);
