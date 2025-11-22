#!/usr/bin/env node

/**
 * 🎯 BACKFILL TOURNAMENT CHARTS
 * 
 * Problem: Das Turnier vom 11.05.25 wurde finalisiert, BEVOR die Chart-Update-Logik
 * für Turniere korrekt implementiert war. Daher zeigen die Charts falsche Werte
 * (Session-basierte Werte statt Spieler-basierte Turnier-Werte).
 * 
 * Lösung: Rufe updateChartsAfterSession() für das Turnier nochmal auf, um die
 * Charts mit den korrekten playerRankings-Daten zu aktualisieren.
 * 
 * Turnier:
 * - Session-ID: 6eNr8fnsTO06jgCqjelt
 * - Tournament-ID: kjoeh4ZPGtGr8GA8gp9p
 * - Datum: 11.05.25
 * - Spieler: Remo, Studi, Schmuuuudii, Frank
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Turnier-Details
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_SESSION_ID = '6eNr8fnsTO06jgCqjelt';
const TOURNAMENT_ID = 'kjoeh4ZPGtGr8GA8gp9p';

/**
 * Sammelt alle Spieler-IDs aus allen Sessions
 */
function collectAllPlayerIds(sessionsSnap) {
  const playerNames = new Map();
  const allPlayerIds = new Set();
  
  sessionsSnap.docs.forEach(doc => {
    const data = doc.data();
    const teams = data.teams || {};
    
    if (teams.top?.players) {
      teams.top.players.forEach(p => {
        allPlayerIds.add(p.playerId);
        playerNames.set(p.playerId, p.displayName || p.playerId);
      });
    }
    
    if (teams.bottom?.players) {
      teams.bottom.players.forEach(p => {
        allPlayerIds.add(p.playerId);
        playerNames.set(p.playerId, p.displayName || p.playerId);
      });
    }
  });
  
  return playerNames;
}

/**
 * Berechnet stricheDifference für einen Spieler in einer Session
 */
function calculateStricheDifference(sessionData, playerId, teamKey) {
  const finalStriche = sessionData.finalStriche || {};
  const playerTeamStriche = finalStriche[teamKey] || {};
  const opponentTeamStriche = finalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const calculateTotalStriche = (striche) => {
    return (striche.sieg || 0) +
           (striche.berg || 0) +
           (striche.matsch || 0) +
           (striche.schneider || 0) +
           (striche.kontermatsch || 0);
  };
  
  const playerTotal = calculateTotalStriche(playerTeamStriche);
  const opponentTotal = calculateTotalStriche(opponentTeamStriche);
  
  return playerTotal - opponentTotal;
}

/**
 * Berechnet pointsDifference für einen Spieler in einer Session
 */
function calculatePointsDifference(sessionData, teamKey) {
  const finalScores = sessionData.finalScores || { top: 0, bottom: 0 };
  const topScore = finalScores.top || 0;
  const bottomScore = finalScores.bottom || 0;
  
  if (teamKey === 'top') {
    return topScore - bottomScore;
  } else {
    return bottomScore - topScore;
  }
}

/**
 * Berechnet eventCount-Differenz für einen Spieler in einer Session
 */
function calculateEventDifference(sessionData, playerId, teamKey, eventType) {
  const eventCounts = sessionData.eventCounts || {};
  const playerTeamEvents = eventCounts[teamKey] || {};
  const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const playerValue = playerTeamEvents[eventType] || 0;
  const opponentValue = opponentTeamEvents[eventType] || 0;
  
  // Für schneider und kontermatsch: NULL zurückgeben wenn keine Events
  if ((eventType === 'schneider' || eventType === 'kontermatsch') && playerValue === 0 && opponentValue === 0) {
    return null;
  }
  
  return playerValue - opponentValue;
}

/**
 * Berechnet Chart-Daten für ein Chart-Typ
 */
async function calculateChartData(
  groupId,
  allSessionsSnap,
  tournamentRankings,
  calculateDelta,
  getTournamentDelta
) {
  const allPlayerNames = collectAllPlayerIds(allSessionsSnap);
  const labels = [];
  const datasets = [];
  const cumulativeValues = new Map();
  
  // Initialisiere Datasets für jeden Spieler
  allPlayerNames.forEach((displayName, playerId) => {
    datasets.push({
      label: displayName,
      displayName: displayName,
      playerId: playerId,
      data: []
    });
  });
  
  // Iteriere durch alle Sessions
  allSessionsSnap.docs.forEach(doc => {
    const sessionData = doc.data();
    const completedAt = sessionData.completedAt;
    if (!completedAt) return;
    
    const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
    const dateStr = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    labels.push(dateStr);
    
    const teams = sessionData.teams || {};
    const topPlayers = teams.top?.players || [];
    const bottomPlayers = teams.bottom?.players || [];
    
    const sessionId = doc.id;
    const isTournament = sessionData.isTournamentSession || sessionId === '6eNr8fnsTO06jgCqjelt';
    
    // Berechne Delta für jeden Spieler
    allPlayerNames.forEach((_, playerId) => {
      const dataset = datasets.find(d => d.playerId === playerId);
      const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
      const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
      
      let delta = null;
      
      if (isTournament && tournamentRankings.has(playerId)) {
        // Tournament: Verwende playerRankings
        const rankings = tournamentRankings.get(playerId);
        delta = getTournamentDelta(rankings, playerId);
      } else if (isTopPlayer) {
        // Regular Session: Berechne aus finalStriche/finalScores/eventCounts
        delta = calculateDelta(sessionData, playerId, 'top');
      } else if (isBottomPlayer) {
        // Regular Session: Berechne aus finalStriche/finalScores/eventCounts
        delta = calculateDelta(sessionData, playerId, 'bottom');
      }
      
      // NULL-Werte korrekt behandeln
      if (delta === null) {
        dataset.data.push(null);
      } else {
        const prevValue = cumulativeValues.get(playerId) || 0;
        const newValue = prevValue + (delta || 0);
        cumulativeValues.set(playerId, newValue);
        
        if (isTopPlayer || isBottomPlayer || (isTournament && tournamentRankings.has(playerId))) {
          dataset.data.push(newValue);
        } else {
          dataset.data.push(null);
        }
      }
    });
  });
  
  return { labels, datasets };
}

/**
 * Update chartData_striche
 */
async function updateStricheChart(groupId, allSessionsSnap, tournamentRankings) {
  console.log('\n📊 Berechne chartData_striche...');
  
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    (session, playerId, teamKey) => calculateStricheDifference(session, playerId, teamKey),
    (rankings, playerId) => rankings.stricheDifference || 0
  );
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_striche');
  await chartDataRef.set({
    labels,
    datasets,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: datasets.length,
    totalSessions: labels.length
  });
  
  console.log(`✅ chartData_striche updated: ${labels.length} sessions, ${datasets.length} players`);
}

/**
 * Update chartData_points
 */
async function updatePointsChart(groupId, allSessionsSnap, tournamentRankings) {
  console.log('\n📊 Berechne chartData_points...');
  
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    (session, playerId, teamKey) => calculatePointsDifference(session, teamKey),
    (rankings, playerId) => rankings.pointsDifference || 0
  );
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_points');
  await chartDataRef.set({
    labels,
    datasets,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: datasets.length,
    totalSessions: labels.length
  });
  
  console.log(`✅ chartData_points updated: ${labels.length} sessions, ${datasets.length} players`);
}

/**
 * Update chartData_matsch
 */
async function updateMatschChart(groupId, allSessionsSnap, tournamentRankings) {
  console.log('\n📊 Berechne chartData_matsch...');
  
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'matsch'),
    (rankings, playerId) => {
      const ec = rankings.eventCounts || {};
      return (ec.matschMade || 0) - (ec.matschReceived || 0);
    }
  );
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_matsch');
  await chartDataRef.set({
    labels,
    datasets,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: datasets.length,
    totalSessions: labels.length
  });
  
  console.log(`✅ chartData_matsch updated: ${labels.length} sessions, ${datasets.length} players`);
}

/**
 * Update chartData_schneider
 */
async function updateSchneiderChart(groupId, allSessionsSnap, tournamentRankings) {
  console.log('\n📊 Berechne chartData_schneider...');
  
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'schneider'),
    (rankings, playerId) => {
      const ec = rankings.eventCounts || {};
      const schneiderMade = ec.schneiderMade || 0;
      const schneiderReceived = ec.schneiderReceived || 0;
      // ✅ NULL wenn keine Schneider-Events
      if (schneiderMade === 0 && schneiderReceived === 0) return null;
      return schneiderMade - schneiderReceived;
    }
  );
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_schneider');
  await chartDataRef.set({
    labels,
    datasets,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: datasets.length,
    totalSessions: labels.length
  });
  
  console.log(`✅ chartData_schneider updated: ${labels.length} sessions, ${datasets.length} players`);
}

/**
 * Update chartData_kontermatsch
 */
async function updateKontermatschChart(groupId, allSessionsSnap, tournamentRankings) {
  console.log('\n📊 Berechne chartData_kontermatsch...');
  
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'kontermatsch'),
    (rankings, playerId) => {
      const ec = rankings.eventCounts || {};
      const kontermatschMade = ec.kontermatschMade || 0;
      const kontermatschReceived = ec.kontermatschReceived || 0;
      // ✅ NULL wenn keine Kontermatsch-Events
      if (kontermatschMade === 0 && kontermatschReceived === 0) return null;
      return kontermatschMade - kontermatschReceived;
    }
  );
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_kontermatsch');
  await chartDataRef.set({
    labels,
    datasets,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: datasets.length,
    totalSessions: labels.length
  });
  
  console.log(`✅ chartData_kontermatsch updated: ${labels.length} sessions, ${datasets.length} players`);
}

/**
 * HAUPTFUNKTION
 */
async function backfillTournamentCharts() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎯 BACKFILL TOURNAMENT CHARTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\nGruppe: ${GROUP_ID}`);
  console.log(`Turnier-Session: ${TOURNAMENT_SESSION_ID}`);
  console.log(`Turnier-ID: ${TOURNAMENT_ID}`);
  
  try {
    // 1. Lade ALLE Sessions
    console.log('\n📦 Lade alle Sessions...');
    const sessionsQuery = db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc');
    
    const allSessionsSnap = await sessionsQuery.get();
    console.log(`✅ ${allSessionsSnap.size} Sessions gefunden`);
    
    // 2. Lade Tournament Rankings
    console.log(`\n📊 Lade Tournament Rankings für ${TOURNAMENT_ID}...`);
    const tournamentRankings = new Map();
    const rankingsSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/playerRankings`).get();
    
    rankingsSnap.docs.forEach(doc => {
      const data = doc.data();
      tournamentRankings.set(data.playerId, data);
      console.log(`  - ${data.displayName}: points=${data.pointsDifference}, striche=${data.stricheDifference}`);
    });
    console.log(`✅ ${tournamentRankings.size} Tournament Rankings geladen`);
    
    // 3. Update ALLE Chart-Dokumente
    console.log('\n🚀 Starte Chart-Updates...');
    
    await updateStricheChart(GROUP_ID, allSessionsSnap, tournamentRankings);
    await updatePointsChart(GROUP_ID, allSessionsSnap, tournamentRankings);
    await updateMatschChart(GROUP_ID, allSessionsSnap, tournamentRankings);
    await updateSchneiderChart(GROUP_ID, allSessionsSnap, tournamentRankings);
    await updateKontermatschChart(GROUP_ID, allSessionsSnap, tournamentRankings);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🎉 BACKFILL ERFOLGREICH ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n✅ Alle 5 Chart-Dokumente wurden neu berechnet');
    console.log('✅ Turnier-Werte aus playerRankings wurden korrekt verwendet');
    console.log('\n📝 Bitte im Frontend überprüfen:');
    console.log('   - chartData_points zeigt jetzt -333 für Remo (vorher +5176)');
    console.log('   - chartData_points zeigt jetzt -1011 für Frank (vorher -5176)');
    console.log('   - Alle anderen Charts sollten ebenfalls korrekt sein');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Backfill:', error);
    throw error;
  }
}

// Skript ausführen
backfillTournamentCharts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

