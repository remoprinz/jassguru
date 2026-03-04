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
    // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe auch sessionData.tournamentId oder gameResults
    const tournamentRankings = new Map<string, any>();
    const detectedIsTournament = isTournamentSession || 
                                 !!sessionData.tournamentId || 
                                 (Array.isArray(sessionData.gameResults) && sessionData.gameResults.length > 0);
    
    if (detectedIsTournament) {
      const tournamentId = sessionData.tournamentId;
      if (tournamentId) {
        const rankingsSnap = await db.collection(`tournaments/${tournamentId}/playerRankings`).get();
        rankingsSnap.docs.forEach(doc => {
          const data = doc.data();
          tournamentRankings.set(data.playerId, data);
        });
        logger.info(`[updateChartsAfterSession] Loaded ${tournamentRankings.size} tournament rankings for tournament ${tournamentId}`);
      } else {
        logger.warn(`[updateChartsAfterSession] Tournament session detected but no tournamentId found in session data`);
      }
    }
    
    // 4. Berechne Chart-Daten für alle 5 Charts
    const updateResults = await Promise.allSettled([
      updateStricheChart(groupId, allSessionsSnap, sessionData, tournamentRankings, detectedIsTournament),
      updatePointsChart(groupId, allSessionsSnap, sessionData, tournamentRankings, detectedIsTournament),
      updateMatschChart(groupId, allSessionsSnap, sessionData, tournamentRankings, detectedIsTournament),
      updateSchneiderChart(groupId, allSessionsSnap, sessionData, tournamentRankings, detectedIsTournament),
      updateKontermatschChart(groupId, allSessionsSnap, sessionData, tournamentRankings, detectedIsTournament),
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
 * 🔧 FIX (16.01.2026): Auch gameResults durchsuchen für Turniere!
 */
function collectAllPlayerIds(sessionsSnap: any): Map<string, string> {
  const playerNames = new Map<string, string>();
  
  sessionsSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    
    // 1. Normale Sessions: teams auf Root-Level
    const teams = data.teams || {};
    if (teams.top?.players) {
      teams.top.players.forEach((p: any) => {
        if (p.playerId) {
          playerNames.set(p.playerId, p.displayName || p.playerId);
        }
      });
    }
    if (teams.bottom?.players) {
      teams.bottom.players.forEach((p: any) => {
        if (p.playerId) {
          playerNames.set(p.playerId, p.displayName || p.playerId);
        }
      });
    }
    
    // 2. 🔧 FIX: Turniere - teams in gameResults durchsuchen
    if (data.gameResults && Array.isArray(data.gameResults)) {
      data.gameResults.forEach((game: any) => {
        const gameTeams = game.teams || {};
        if (gameTeams.top?.players) {
          gameTeams.top.players.forEach((p: any) => {
            if (p.playerId) {
              playerNames.set(p.playerId, p.displayName || p.playerId);
            }
          });
        }
        if (gameTeams.bottom?.players) {
          gameTeams.bottom.players.forEach((p: any) => {
            if (p.playerId) {
              playerNames.set(p.playerId, p.displayName || p.playerId);
            }
          });
        }
      });
    }
  });
  
  return playerNames;
}

/**
 * 🔧 FIX (16.01.2026): Bestimmt das Team eines Spielers in einer Session
 * Berücksichtigt sowohl normale Sessions (teams auf Root) als auch Turniere (teams in gameResults)
 */
function getPlayerTeamInSession(sessionData: any, playerId: string): 'top' | 'bottom' | null {
  // 1. Prüfe Root-Level teams (normale Sessions)
  const teams = sessionData.teams || {};
  if (teams.top?.players?.some((p: any) => p.playerId === playerId)) {
    return 'top';
  }
  if (teams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
    return 'bottom';
  }
  
  // 2. 🔧 FIX: Prüfe gameResults (Turniere) - Spieler kann in verschiedenen Teams sein
  // Wir nehmen das erste Vorkommen als Referenz
  if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
    for (const game of sessionData.gameResults) {
      const gameTeams = game.teams || {};
      if (gameTeams.top?.players?.some((p: any) => p.playerId === playerId)) {
        return 'top';
      }
      if (gameTeams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        return 'bottom';
      }
    }
  }
  
  return null;
}

/**
 * Helper: Lädt lastJassTimestamp für alle Spieler
 */
async function loadPlayerLastActivity(playerIds: Set<string>): Promise<Map<string, admin.firestore.Timestamp | null>> {
  const lastActivityMap = new Map<string, admin.firestore.Timestamp | null>();
  
  if (playerIds.size === 0) {
    return lastActivityMap;
  }
  
  // Lade alle Player-Dokumente in Batches (Firestore 'in' Query Limit: 10)
  const playerIdsArray = Array.from(playerIds);
  const batchSize = 10;
  
  for (let i = 0; i < playerIdsArray.length; i += batchSize) {
    const batch = playerIdsArray.slice(i, i + batchSize);
    try {
      const playerDocs = await db.collection('players')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      
      playerDocs.forEach(doc => {
        const data = doc.data();
        const globalStats = data?.globalStats || {};
        const lastJassTimestamp = globalStats.lastJassTimestamp || null;
        lastActivityMap.set(doc.id, lastJassTimestamp);
      });
    } catch (error) {
      logger.warn(`[loadPlayerLastActivity] Error loading batch:`, error);
      // Setze null für Spieler, die nicht geladen werden konnten
      batch.forEach(playerId => {
        if (!lastActivityMap.has(playerId)) {
          lastActivityMap.set(playerId, null);
        }
      });
    }
  }
  
  return lastActivityMap;
}

/**
 * 🔧 FIX (16.01.2026): Berechnet Turnier-Delta aus totalXByPlayer Feldern
 * Diese Funktion berechnet das Delta direkt aus den im jassGameSummary gespeicherten Aggregaten
 */
function calculateTournamentDeltaFromSummary(
  sessionData: any,
  playerId: string,
  deltaType: 'striche' | 'points' | 'matsch' | 'schneider' | 'kontermatsch'
): number | null {
  if (deltaType === 'striche') {
    // Strichdifferenz aus totalStricheByPlayer
    const playerStriche = sessionData.totalStricheByPlayer?.[playerId];
    if (!playerStriche) return null;
    
    const playerTotal = (playerStriche.sieg || 0) + (playerStriche.berg || 0) + 
                       (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + 
                       (playerStriche.kontermatsch || 0);
    
    // Berechne Gegner-Striche aus allen anderen Spielern (vereinfacht: verwende gameResults)
    let opponentTotal = 0;
    const gameResults = sessionData.gameResults || [];
    
    gameResults.forEach((game: any) => {
      const gameTeams = game.teams || {};
      const gameFinalStriche = game.finalStriche || {};
      
      // Finde Spieler's Team in diesem Game
      let playerTeam: 'top' | 'bottom' | null = null;
      if (gameTeams.top?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'top';
      } else if (gameTeams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'bottom';
      }
      
      if (playerTeam) {
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        const opponentStriche = gameFinalStriche[opponentTeam] || {};
        opponentTotal += (opponentStriche.sieg || 0) + (opponentStriche.berg || 0) + 
                        (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                        (opponentStriche.kontermatsch || 0);
      }
    });
    
    return playerTotal - opponentTotal;
  }
  
  if (deltaType === 'points') {
    // Punktedifferenz aus totalPointsByPlayer
    const playerPoints = sessionData.totalPointsByPlayer?.[playerId];
    if (playerPoints === undefined) return null;
    
    // Berechne Gegner-Punkte aus gameResults
    let opponentPoints = 0;
    const gameResults = sessionData.gameResults || [];
    
    gameResults.forEach((game: any) => {
      const gameTeams = game.teams || {};
      
      // Finde Spieler's Team in diesem Game
      let playerTeam: 'top' | 'bottom' | null = null;
      if (gameTeams.top?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'top';
      } else if (gameTeams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'bottom';
      }
      
      if (playerTeam) {
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        opponentPoints += opponentTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
      }
    });
    
    return playerPoints - opponentPoints;
  }
  
  if (deltaType === 'matsch' || deltaType === 'schneider' || deltaType === 'kontermatsch') {
    // 🔧 FIX (16.01.2026): Verwende finalStriche aus gameResults statt eventCounts!
    // eventCounts ist in manchen Turnieren FALSCH, finalStriche ist immer KORREKT
    let eventMade = 0;
    let eventReceived = 0;
    
    const gameResults = sessionData.gameResults || [];
    
    gameResults.forEach((game: any) => {
      const gameTeams = game.teams || {};
      
      let playerTeam: 'top' | 'bottom' | null = null;
      if (gameTeams.top?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'top';
      } else if (gameTeams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'bottom';
      }
      
      if (playerTeam) {
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        // 🔧 KRITISCH: Verwende finalStriche ODER teamStrichePasse, NICHT eventCounts!
        const gameFinalStriche = game.finalStriche || game.teamStrichePasse || {};
        eventMade += gameFinalStriche[playerTeam]?.[deltaType] || 0;
        eventReceived += gameFinalStriche[opponentTeam]?.[deltaType] || 0;
      }
    });
    
    // Falls Spieler nicht gespielt hat
    if (eventMade === 0 && eventReceived === 0) {
      const playerEvents = sessionData.totalEventCountsByPlayer?.[playerId];
      if (!playerEvents) return null;
    }
    
    return eventMade - eventReceived;
  }
  
  return null;
}

/**
 * Helper: Berechnet Chart-Daten für ein Chart-Typ
 * ✅ KORREKTUR: Unterstützt jetzt NULL-Werte für Event-Charts
 * ✅ NEU: Filtert Spieler heraus, die >1 Jahr inaktiv sind
 * 🔧 FIX (16.01.2026): Korrekte Turnier-Verarbeitung ohne tournamentRankings-Abhängigkeit
 */
async function calculateChartData(
  groupId: string,
  allSessionsSnap: any,
  tournamentRankings: Map<string, any>,
  isTournamentSession: boolean,
  calculateDelta: (sessionData: any, playerId: string, teamKey: 'top' | 'bottom') => number | null,
  getTournamentDelta: (rankings: any, playerId: string) => number | null,
  isEventChart: boolean = false, // 🎯 NEU: Flag für Event-Charts (Schneider/Kontermatsch)
  deltaType: 'striche' | 'points' | 'matsch' | 'schneider' | 'kontermatsch' = 'striche' // 🔧 FIX: Für Turnier-Berechnung
): Promise<{ labels: string[]; datasets: any[] }> {
  const labels: string[] = [];
  const allPlayerNames = collectAllPlayerIds(allSessionsSnap);
  const cumulativeValues = new Map<string, number>();
  
  // 🎯 NEU: Lade lastJassTimestamp für alle Spieler
  const playerIdsSet = new Set<string>(allPlayerNames.keys());
  const playerLastActivity = await loadPlayerLastActivity(playerIdsSet);
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  
  // 🎯 NEU: Filtere Spieler, die >1 Jahr inaktiv sind
  const activePlayerNames = new Map<string, string>();
  allPlayerNames.forEach((displayName, playerId) => {
    const lastActivity = playerLastActivity.get(playerId);
    if (lastActivity && lastActivity.toMillis() >= oneYearAgo) {
      activePlayerNames.set(playerId, displayName);
    } else if (!lastActivity) {
      // Wenn kein lastJassTimestamp vorhanden ist, behalte den Spieler (für Rückwärtskompatibilität)
      activePlayerNames.set(playerId, displayName);
    }
  });
  
  // Initialisiere kumulative Werte nur für aktive Spieler
  activePlayerNames.forEach((_, playerId) => {
    cumulativeValues.set(playerId, 0);
  });
  
  // Erstelle Datasets nur für aktive Spieler
  const datasets: any[] = [];
  activePlayerNames.forEach((displayName, playerId) => {
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
    
    const sessionId = doc.id;
    // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults mit unterschiedlichen Teams, oder isTournamentSession
    const isTournament = sessionData.isTournamentSession || 
                         !!sessionData.tournamentId || 
                         sessionId === '6eNr8fnsTO06jgCqjelt';
    
    // Berechne Delta für jeden aktiven Spieler
    activePlayerNames.forEach((_, playerId) => {
      const dataset = datasets.find(d => d.playerId === playerId);
      
      // 🔧 FIX: Verwende getPlayerTeamInSession für korrekte Team-Bestimmung (auch für Turniere)
      const playerTeam = getPlayerTeamInSession(sessionData, playerId);
      const isInSession = playerTeam !== null;
      
      let delta: number | null = null;
      
      if (isTournament) {
        // 🔧 FIX: Für Turniere IMMER aus jassGameSummary berechnen (nicht von tournamentRankings abhängig!)
        if (isInSession || sessionData.participantPlayerIds?.includes(playerId)) {
          delta = calculateTournamentDeltaFromSummary(sessionData, playerId, deltaType);
        }
      } else if (playerTeam) {
        // Regular Session: Berechne aus finalStriche/finalScores/eventCounts
        delta = calculateDelta(sessionData, playerId, playerTeam);
      }
      
      // ✅ KORREKTUR: NULL-Werte korrekt behandeln
      if (delta === null) {
        // Delta ist NULL: Füge NULL als Datenpunkt ein (Spieler war nicht dabei oder kein Event)
        dataset.data.push(null);
      } else if (delta === 0 && isEventChart && !isInSession) {
        // 🎯 FÜR EVENT-CHARTS (Schneider/Kontermatsch): NULL wenn nicht in Session
        dataset.data.push(null);
      } else {
        // Delta ist eine Zahl: Update kumulative Werte
        const prevValue = cumulativeValues.get(playerId) || 0;
        const newValue = prevValue + delta;
        cumulativeValues.set(playerId, newValue);
        dataset.data.push(newValue);
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
    (rankings, playerId) => rankings.stricheDifference || 0,
    false, // isEventChart
    'striche' // 🔧 FIX: deltaType für Turnier-Berechnung
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
    (rankings, playerId) => rankings.pointsDifference || 0,
    false, // isEventChart
    'points' // 🔧 FIX: deltaType für Turnier-Berechnung
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
    },
    false, // isEventChart (Matsch ist kein seltenes Event wie Schneider)
    'matsch' // 🔧 FIX: deltaType für Turnier-Berechnung
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
    true, // 🎯 Event-Chart: delta=0 soll als NULL behandelt werden
    'schneider' // 🔧 FIX: deltaType für Turnier-Berechnung
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
    true, // 🎯 Event-Chart: delta=0 soll als NULL behandelt werden
    'kontermatsch' // 🔧 FIX: deltaType für Turnier-Berechnung
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

