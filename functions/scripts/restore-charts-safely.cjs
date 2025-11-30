const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// --- HELPER FUNCTIONS FROM chartDataUpdater.ts ---

function calculateStricheDifference(session, playerId, teamKey) {
  if (!session.finalStriche) return 0;
  const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
  
  const calculateTotal = (striche) => (striche?.sieg || 0) + (striche?.berg || 0) + (striche?.matsch || 0) + (striche?.schneider || 0) + (striche?.kontermatsch || 0);
  
  const playerStriche = calculateTotal(session.finalStriche[teamKey]);
  const opponentStriche = calculateTotal(session.finalStriche[opponentKey]);
  
  return playerStriche - opponentStriche;
}

function calculatePointsDifference(session, teamKey) {
  if (!session.finalScores) return 0;
  const topScore = session.finalScores.top || 0;
  const bottomScore = session.finalScores.bottom || 0;
  return teamKey === 'top' ? topScore - bottomScore : bottomScore - topScore;
}

function calculateEventDifference(session, teamKey, eventType) {
  if (!session.eventCounts) return 0;
  const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
  
  const made = session.eventCounts[teamKey]?.[eventType] || 0;
  const received = session.eventCounts[opponentKey]?.[eventType] || 0;
  
  if (made === 0 && received === 0) return null; // No event
  return made - received;
}

async function restoreCharts() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const isDryRun = !process.argv.includes('--live');

  console.log(`RESTORING CHARTS for Group ${groupId}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (No writes)' : 'LIVE (Will write to DB)'}`);

  // 1. Load all completed sessions
  console.log('Loading sessions...');
  const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();

  if (sessionsSnap.empty) {
    console.error('No completed sessions found!');
    return;
  }
  console.log(`Found ${sessionsSnap.size} sessions.`);

  // 2. Collect all unique Player IDs and Names first
  const playerMap = new Map(); // id -> name
  
  // Helper to add player
  const addPlayer = (p) => {
    if (p && p.playerId) {
      if (!playerMap.has(p.playerId)) {
        playerMap.set(p.playerId, p.displayName || 'Unknown');
      }
    }
  };

  // Iterate all sessions to find all players ever involved
  for (const doc of sessionsSnap.docs) {
    const s = doc.data();
    s.teams?.top?.players?.forEach(addPlayer);
    s.teams?.bottom?.players?.forEach(addPlayer);
    
    // Also check rankings if we have them later, but usually players are in teams or participant lists
    if (s.participantPlayerIds) {
        // We might need to fetch names if not in teams, but let's rely on teams/rankings for now
    }
  }
  console.log(`Identified ${playerMap.size} unique players.`);

  // 3. Load Tournament Rankings Cache
  const tournamentRankingsCache = new Map();
  const tournamentIds = new Set();
  sessionsSnap.docs.forEach(doc => {
    const s = doc.data();
    if (s.tournamentId) tournamentIds.add(s.tournamentId);
  });

  for (const tId of tournamentIds) {
    console.log(`Loading rankings for tournament ${tId}...`);
    const snap = await db.collection(`tournaments/${tId}/playerRankings`).get();
    const rankings = new Map();
    snap.forEach(doc => {
        const data = doc.data();
        rankings.set(data.playerId, data);
        if (!playerMap.has(data.playerId)) {
             playerMap.set(data.playerId, data.displayName || data.playerName || 'Unknown');
        }
    });
    tournamentRankingsCache.set(tId, rankings);
  }

  // 3b. FETCH MISSING NAMES FROM PLAYERS COLLECTION
  const missingNames = [];
  playerMap.forEach((name, id) => {
    if (name === 'Unknown') missingNames.push(id);
  });
  
  if (missingNames.length > 0) {
    console.log(`Fetching names for ${missingNames.length} unknown players...`);
    // Batch fetch (chunks of 10)
    for (let i = 0; i < missingNames.length; i += 10) {
        const chunk = missingNames.slice(i, i+10);
        const pSnap = await db.collection('players').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        pSnap.forEach(doc => {
            const d = doc.data();
            if (d.displayName) {
                playerMap.set(doc.id, d.displayName);
                console.log(`  > Resolved ${doc.id} to "${d.displayName}"`);
            }
        });
    }
  }

  // 4. Initialize Data Structures
  const labels = [];
  // structure: Map<playerId, { striche: [], points: [], matsch: [], schneider: [], konter: [] }>
  const timeSeries = new Map();
  const cumulative = new Map(); // Stores current running total

  playerMap.forEach((name, id) => {
    timeSeries.set(id, {
      striche: [], points: [], matsch: [], schneider: [], konter: []
    });
    cumulative.set(id, {
      striche: 0, points: 0, matsch: 0, schneider: 0, konter: 0
    });
  });

  // 5. Process Sessions Chronologically
  for (const doc of sessionsSnap.docs) {
    const session = doc.data();
    const sessionId = doc.id;
    
    // Label
    let dateObj;
    if (session.completedAt?.toDate) dateObj = session.completedAt.toDate();
    else if (session.completedAt) dateObj = new Date(session.completedAt);
    else dateObj = new Date();
    
    labels.push(dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }));

    // Detect Tournament
    // CRITICAL FIX: Do NOT use gameResults array presence as tournament indicator! All sessions have gameResults!
    const isTournament = session.isTournamentSession || 
                         !!session.tournamentId || 
                         sessionId === '6eNr8fnsTO06jgCqjelt'; // Hardcoded known tournament session if needed

    let rankings = null;
    if (isTournament && session.tournamentId) {
      rankings = tournamentRankingsCache.get(session.tournamentId);
    }

    // Calculate Deltas for this session for ALL players
    playerMap.forEach((name, pid) => {
      let deltaStriche = null;
      let deltaPoints = null;
      let deltaMatsch = null;
      let deltaSchneider = null;
      let deltaKonter = null;

      // A. Tournament Logic
      if (isTournament && rankings && rankings.has(pid)) {
        const r = rankings.get(pid);
        
        // RECALCULATE FROM ROUND RESULTS IF AVAILABLE (Fix for corrupt aggregate data like Karim's -22)
        if (r.roundResults && Array.isArray(r.roundResults) && r.roundResults.length > 0) {
            // Recalculate Striche
            deltaStriche = r.roundResults.reduce((sum, round) => sum + (round.stricheDifferenz || 0), 0);
            
            // Recalculate Points
            deltaPoints = r.roundResults.reduce((sum, round) => sum + (round.pointsDifferenz || 0), 0);

            // Recalculate Events (Accumulate from rounds if available, or fallback to eventCounts if not detailed in rounds)
            // Usually roundResults might have eventCounts per round too
            let mMade = 0, mRec = 0, sMade = 0, sRec = 0, kMade = 0, kRec = 0;
            let foundDetailedEvents = false;

            r.roundResults.forEach(round => {
                if (round.eventCounts) {
                    foundDetailedEvents = true;
                    mMade += round.eventCounts.matschMade || 0;
                    mRec += round.eventCounts.matschReceived || 0;
                    sMade += round.eventCounts.schneiderMade || 0;
                    sRec += round.eventCounts.schneiderReceived || 0;
                    kMade += round.eventCounts.kontermatschMade || 0;
                    kRec += round.eventCounts.kontermatschReceived || 0;
                }
            });

            if (foundDetailedEvents) {
                deltaMatsch = mMade - mRec;
                if (sMade !== 0 || sRec !== 0) deltaSchneider = sMade - sRec;
                if (kMade !== 0 || kRec !== 0) deltaKonter = kMade - kRec;
            } else {
                // Fallback if rounds don't have event details
                const ec = r.eventCounts || {};
                deltaMatsch = (ec.matschMade || 0) - (ec.matschReceived || 0);
                
                const sm = ec.schneiderMade || 0;
                const sr = ec.schneiderReceived || 0;
                if (sm !== 0 || sr !== 0) deltaSchneider = sm - sr;
                
                const km = ec.kontermatschMade || 0;
                const kr = ec.kontermatschReceived || 0;
                if (km !== 0 || kr !== 0) deltaKonter = km - kr;
            }

            // DEBUG LOG for Karim check
            if (pid === '8f45eac1b70c8ad7a9a9d9cb' && Math.abs(deltaStriche - (r.stricheDifference || 0)) > 2) {
                console.log(`[Auto-Fix] Karim Tournament Data corrected: Stored ${r.stricheDifference}, Calculated ${deltaStriche}`);
            }

        } else {
            // Fallback to stored aggregates
            deltaStriche = r.stricheDifference || 0;
            deltaPoints = r.pointsDifference || 0;
            
            const ec = r.eventCounts || {};
            deltaMatsch = (ec.matschMade || 0) - (ec.matschReceived || 0);
            
            const sMade = ec.schneiderMade || 0;
            const sRec = ec.schneiderReceived || 0;
            if (sMade !== 0 || sRec !== 0) deltaSchneider = sMade - sRec;
            
            const kMade = ec.kontermatschMade || 0;
            const kRec = ec.kontermatschReceived || 0;
            if (kMade !== 0 || kRec !== 0) deltaKonter = kMade - kRec;
        }

      } 
      // B. Regular Session Logic
      else if (!isTournament) {
        const isTop = session.teams?.top?.players?.some(p => p.playerId === pid);
        const isBottom = session.teams?.bottom?.players?.some(p => p.playerId === pid);

        if (isTop || isBottom) {
          const teamKey = isTop ? 'top' : 'bottom';
          deltaStriche = calculateStricheDifference(session, pid, teamKey);
          deltaPoints = calculatePointsDifference(session, teamKey);
          deltaMatsch = calculateEventDifference(session, teamKey, 'matsch');
          deltaSchneider = calculateEventDifference(session, teamKey, 'schneider');
          deltaKonter = calculateEventDifference(session, teamKey, 'kontermatsch');
          
          // Fix: calculateEventDifference returns null if 0 for schneider/konter, but we need to be careful
          // Actually my helper above returns null if 0 for all events.
          // For Matsch, 0 is a valid delta (0 - 0 = 0), but usually we track cumulative. 
          // If we want to plot "balance", 0 is fine. If we want to plot "occurence", null is better.
          // Let's follow chartDataUpdater logic: 
          // Matsch: always number. Schneider/Konter: null if 0.
          
          // Re-check helper:
          // calculateEventDifference above returns null if 0.
          // For Matsch, we usually want 0 if they played but didn't make matsch.
          if (deltaMatsch === null) deltaMatsch = 0; 
        }
      }

      // Update Cumulative & Push to History
      const currentCum = cumulative.get(pid);
      const history = timeSeries.get(pid);

      // Striche
      if (deltaStriche !== null) {
        currentCum.striche += deltaStriche;
        history.striche.push(currentCum.striche);
      } else {
        history.striche.push(null);
      }

      // Points
      if (deltaPoints !== null) {
        currentCum.points += deltaPoints;
        history.points.push(currentCum.points);
      } else {
        history.points.push(null);
      }

      // Matsch
      if (deltaMatsch !== null) {
        currentCum.matsch += deltaMatsch;
        history.matsch.push(currentCum.matsch);
      } else {
        history.matsch.push(null);
      }

      // Schneider (Special: Null if no event)
      if (deltaSchneider !== null) {
        currentCum.schneider += deltaSchneider;
        history.schneider.push(currentCum.schneider);
      } else {
        history.schneider.push(null);
      }

      // Konter (Special: Null if no event)
      if (deltaKonter !== null) {
        currentCum.konter += deltaKonter;
        history.konter.push(currentCum.konter);
      } else {
        history.konter.push(null);
      }

    });
  }

  // 6. Construct Firestore Payloads
  const createPayload = (metricKey, filterNulls = false) => {
    const datasets = [];
    playerMap.forEach((name, pid) => {
      const data = timeSeries.get(pid)[metricKey];
      // Check if player has ANY data
      const hasData = data.some(v => v !== null);
      if (hasData) {
        datasets.push({
          playerId: pid,
          label: name,
          displayName: name,
          data: data,
          spanGaps: true // Important for charts with nulls
        });
      }
    });
    return {
      labels: labels,
      datasets: datasets,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      totalSessions: labels.length,
      totalPlayers: datasets.length
    };
  };

  const payloads = {
    'chartData_striche': createPayload('striche'),
    'chartData_points': createPayload('points'),
    'chartData_matsch': createPayload('matsch'),
    'chartData_schneider': createPayload('schneider', true),
    'chartData_kontermatsch': createPayload('konter', true)
  };

  // 7. Validation Output
  console.log('\n--- VALIDATION ---');
  const checkPlayer = (name) => {
    console.log(`Checking ${name}...`);
    let found = false;
    payloads.chartData_striche.datasets.forEach(ds => {
      if (ds.displayName.includes(name)) {
        found = true;
        const nonNullCount = ds.data.filter(v => v !== null).length;
        const lastValue = ds.data[ds.data.length - 1];
        console.log(`  > Found in Striche! Data points: ${nonNullCount}/${labels.length}. Last Value: ${lastValue}`);
        console.log(`  > Last 5 values: ${JSON.stringify(ds.data.slice(-5))}`);
      }
    });
    if (!found) console.log(`  > ⚠️ NOT FOUND in Striche dataset!`);
  };

  checkPlayer('Davester');
  checkPlayer('Karim');
  checkPlayer('Remo');

  // 8. Write or Dry Run
  if (isDryRun) {
    console.log('\n[DRY RUN] No changes written to Firestore.');
    console.log('Inspect the validation output above. If correct, run with --live');
  } else {
    console.log('\n[LIVE] Writing to Firestore...');
    const batch = db.batch();
    for (const [key, data] of Object.entries(payloads)) {
      const ref = db.collection(`groups/${groupId}/aggregated`).doc(key);
      batch.set(ref, data);
    }
    await batch.commit();
    console.log('✅ SUCCESSFULLY RESTORED CHARTS!');
  }
}

restoreCharts().catch(console.error);

