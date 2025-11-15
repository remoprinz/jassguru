import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

/**
 * 🎯 CHART DATA UPDATER - Automatischer Update aller Chart-Dokumente
 * 
 * Wird nach finalizeSession/finalizeTournament aufgerufen, um die aggregated-Charts zu aktualisieren.
 */

interface ChartUpdateResult {
  success: boolean;
  chartsUpdated: string[];
  error?: string;
}

/**
 * Aktualisiert ALLE Chart-Dokumente nach einer Session
 * - chartData_striche
 * - chartData_points
 * - chartData_matsch
 * - chartData_schneider
 * - chartData_kontermatsch
 */
export async function updateChartsAfterSession(
  groupId: string,
  sessionId: string,
  isTournamentSession: boolean = false
): Promise<ChartUpdateResult> {
  logger.info(`[updateChartsAfterSession] Starting chart update for session ${sessionId} in group ${groupId}`);
  
  try {
    // 1. Lade die aktuelle Session
    const sessionRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      logger.error(`[updateChartsAfterSession] Session ${sessionId} not found`);
      return { success: false, chartsUpdated: [], error: 'Session not found' };
    }
    
    const sessionData = sessionDoc.data();
    const completedAt = sessionData?.completedAt;
    
    if (!completedAt) {
      logger.error(`[updateChartsAfterSession] Session ${sessionId} has no completedAt`);
      return { success: false, chartsUpdated: [], error: 'No completedAt timestamp' };
    }
    
    // 2. Hole alle Sessions für diese Gruppe
    const sessionsQuery = db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc');
    
    const allSessionsSnap = await sessionsQuery.get();
    
    logger.info(`[updateChartsAfterSession] Found ${allSessionsSnap.size} completed sessions`);
    
    // 3. Für Tournament-Session: Lade playerRankings
    const tournamentRankings = new Map<string, any>();
    if (isTournamentSession) {
      const tournamentId = sessionData.tournamentId;
      if (tournamentId) {
        const rankingsSnap = await db.collection(`tournaments/${tournamentId}/playerRankings`).get();
        rankingsSnap.docs.forEach(doc => {
          const data = doc.data();
          tournamentRankings.set(data.playerId, data);
        });
        logger.info(`[updateChartsAfterSession] Loaded ${tournamentRankings.size} tournament rankings`);
      }
    }
    
    // 4. Berechne Chart-Daten für alle 5 Charts
    const updateResults = await Promise.allSettled([
      updateStricheChart(groupId, allSessionsSnap, sessionData, tournamentRankings, isTournamentSession),
      updatePointsChart(groupId, allSessionsSnap, sessionData, tournamentRankings, isTournamentSession),
      updateMatschChart(groupId, allSessionsSnap, sessionData, tournamentRankings, isTournamentSession),
      updateSchneiderChart(groupId, allSessionsSnap, sessionData, tournamentRankings, isTournamentSession),
      updateKontermatschChart(groupId, allSessionsSnap, sessionData, tournamentRankings, isTournamentSession),
    ]);
    
    const chartsUpdated: string[] = [];
    updateResults.forEach((result, index) => {
      const chartNames = ['chartData_striche', 'chartData_points', 'chartData_matsch', 'chartData_schneider', 'chartData_kontermatsch'];
      if (result.status === 'fulfilled') {
        chartsUpdated.push(chartNames[index]);
      } else {
        logger.error(`[updateChartsAfterSession] Failed to update ${chartNames[index]}:`, result.reason);
      }
    });
    
    logger.info(`[updateChartsAfterSession] ✅ Updated ${chartsUpdated.length}/5 charts`);
    
    return { success: true, chartsUpdated };
  } catch (error) {
    logger.error(`[updateChartsAfterSession] Error updating charts:`, error);
    return { success: false, chartsUpdated: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Helper: Berechnet stricheDifference für einen Spieler in einer Session
 */
function calculateStricheDifference(sessionData: any, playerId: string, teamKey: 'top' | 'bottom'): number {
  const finalStriche = sessionData.finalStriche || {};
  const playerTeamStriche = finalStriche[teamKey] || {};
  const opponentTeamStriche = finalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const calculateTotalStriche = (striche: any) => {
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
 * Helper: Berechnet pointsDifference für einen Spieler in einer Session
 */
function calculatePointsDifference(sessionData: any, teamKey: 'top' | 'bottom'): number {
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
 * Helper: Berechnet eventCount-Differenz für einen Spieler in einer Session
 * ✅ KORREKTUR: Gibt NULL zurück wenn keine Events stattgefunden haben
 */
function calculateEventDifference(
  sessionData: any,
  playerId: string,
  teamKey: 'top' | 'bottom',
  eventType: 'matsch' | 'schneider' | 'kontermatsch'
): number | null {
  const eventCounts = sessionData.eventCounts || {};
  const playerTeamEvents = eventCounts[teamKey] || {};
  const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const playerValue = playerTeamEvents[eventType] || 0;
  const opponentValue = opponentTeamEvents[eventType] || 0;
  
  // ✅ WICHTIG: Für schneider und kontermatsch: NULL zurückgeben wenn keine Events
  if ((eventType === 'schneider' || eventType === 'kontermatsch') && playerValue === 0 && opponentValue === 0) {
    return null;
  }
  
  return playerValue - opponentValue;
}

/**
 * Helper: Sammelt alle Spieler-IDs aus allen Sessions
 */
function collectAllPlayerIds(sessionsSnap: any): Map<string, string> {
  const playerNames = new Map<string, string>();
  const allPlayerIds = new Set<string>();
  
  sessionsSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    const teams = data.teams || {};
    
    if (teams.top?.players) {
      teams.top.players.forEach((p: any) => {
        allPlayerIds.add(p.playerId);
        playerNames.set(p.playerId, p.displayName || p.playerId);
      });
    }
    
    if (teams.bottom?.players) {
      teams.bottom.players.forEach((p: any) => {
        allPlayerIds.add(p.playerId);
        playerNames.set(p.playerId, p.displayName || p.playerId);
      });
    }
  });
  
  return playerNames;
}

/**
 * Helper: Berechnet Chart-Daten für ein Chart-Typ
 * ✅ KORREKTUR: Unterstützt jetzt NULL-Werte für Event-Charts
 */
async function calculateChartData(
  groupId: string,
  allSessionsSnap: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean,
  calculateDelta: (sessionData: any, playerId: string, teamKey: 'top' | 'bottom') => number | null,
  getTournamentDelta: (rankings: any, playerId: string) => number | null,
  isEventChart: boolean = false // 🎯 NEU: Flag für Event-Charts (Schneider/Kontermatsch)
): Promise<{ labels: string[]; datasets: any[] }> {
  const labels: string[] = [];
  const allPlayerNames = collectAllPlayerIds(allSessionsSnap);
  const cumulativeValues = new Map<string, number>();
  
  // Initialisiere kumulative Werte
  allPlayerNames.forEach((_, playerId) => {
    cumulativeValues.set(playerId, 0);
  });
  
  // Erstelle Datasets
  const datasets: any[] = [];
  allPlayerNames.forEach((displayName, playerId) => {
    datasets.push({
      playerId,
      label: displayName,
      displayName,
      data: []
    });
  });
  
  // Iteriere durch alle Sessions
  allSessionsSnap.docs.forEach((doc: any) => {
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
      const isTopPlayer = topPlayers.some((p: any) => p.playerId === playerId);
      const isBottomPlayer = bottomPlayers.some((p: any) => p.playerId === playerId);
      
      let delta: number | null = null;
      
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
      
      // ✅ KORREKTUR: NULL-Werte korrekt behandeln
      if (delta === null) {
        // Delta ist NULL: Füge NULL als Datenpunkt ein (Spieler war nicht dabei oder kein Event)
        dataset.data.push(null);
      } else if (delta === 0 && isEventChart) {
        // 🎯 FÜR EVENT-CHARTS (Schneider/Kontermatsch): Auch bei delta=0 soll NULL gesetzt werden (kein Event!)
        dataset.data.push(null);
      } else {
        // Delta ist ein Zahl: Update kumulative Werte
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
async function updateStricheChart(
  groupId: string,
  allSessionsSnap: any,
  sessionData: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean
): Promise<void> {
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    isTournamentSession,
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
  
  logger.info(`[updateStricheChart] ✅ Updated with ${labels.length} sessions`);
}

/**
 * Update chartData_points
 */
async function updatePointsChart(
  groupId: string,
  allSessionsSnap: any,
  sessionData: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean
): Promise<void> {
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    isTournamentSession,
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
  
  logger.info(`[updatePointsChart] ✅ Updated with ${labels.length} sessions`);
}

/**
 * Update chartData_matsch
 */
async function updateMatschChart(
  groupId: string,
  allSessionsSnap: any,
  sessionData: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean
): Promise<void> {
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    isTournamentSession,
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
  
  logger.info(`[updateMatschChart] ✅ Updated with ${labels.length} sessions`);
}

/**
 * Update chartData_schneider
 */
async function updateSchneiderChart(
  groupId: string,
  allSessionsSnap: any,
  sessionData: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean
): Promise<void> {
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    isTournamentSession,
    (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'schneider'),
    (rankings, playerId) => {
      const ec = rankings.eventCounts || {};
      const schneiderMade = ec.schneiderMade || 0;
      const schneiderReceived = ec.schneiderReceived || 0;
      // ✅ NULL wenn keine Schneider-Events
      if (schneiderMade === 0 && schneiderReceived === 0) return null;
      return schneiderMade - schneiderReceived;
    },
    true // 🎯 Event-Chart: delta=0 soll als NULL behandelt werden
  );
  
  // 🎯 FILTER: Entferne Spieler OHNE echte Datenpunkte (nur null-Werte)
  const filteredDatasets = datasets.filter((dataset: any) => {
    return dataset.data.some((value: number | null) => value !== null);
  });
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_schneider');
  await chartDataRef.set({
    labels,
    datasets: filteredDatasets, // 🎯 Nur Spieler mit mindestens einem echten Event
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: filteredDatasets.length,
    totalSessions: labels.length
  });
  
  logger.info(`[updateSchneiderChart] ✅ Updated with ${labels.length} sessions`);
}

/**
 * Update chartData_kontermatsch
 */
async function updateKontermatschChart(
  groupId: string,
  allSessionsSnap: any,
  sessionData: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean
): Promise<void> {
  const { labels, datasets } = await calculateChartData(
    groupId,
    allSessionsSnap,
    tournamentRankings,
    isTournamentSession,
    (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'kontermatsch'),
    (rankings, playerId) => {
      const ec = rankings.eventCounts || {};
      const kontermatschMade = ec.kontermatschMade || 0;
      const kontermatschReceived = ec.kontermatschReceived || 0;
      // ✅ NULL wenn keine Kontermatsch-Events
      if (kontermatschMade === 0 && kontermatschReceived === 0) return null;
      return kontermatschMade - kontermatschReceived;
    },
    true // 🎯 Event-Chart: delta=0 soll als NULL behandelt werden
  );
  
  // 🎯 FILTER: Entferne Spieler OHNE echte Datenpunkte (nur null-Werte)
  const filteredDatasets = datasets.filter((dataset: any) => {
    return dataset.data.some((value: number | null) => value !== null);
  });
  
  const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_kontermatsch');
  await chartDataRef.set({
    labels,
    datasets: filteredDatasets, // 🎯 Nur Spieler mit mindestens einem echten Event
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    totalPlayers: filteredDatasets.length,
    totalSessions: labels.length
  });
  
  logger.info(`[updateKontermatschChart] ✅ Updated with ${labels.length} sessions`);
}

