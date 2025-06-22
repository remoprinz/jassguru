/**
 * Player Statistics Calculator
 *
 * This module is responsible for calculating and updating detailed statistics for a single player.
 * It is designed to be robust and efficient, calculating all stats from scratch based on
 * the player's completed `jassGameSummaries`.
 *
 * The architecture mirrors the `groupStatsCalculator` for consistency and proven stability.
 * It avoids incremental updates in favor of full recalculations to ensure data integrity.
 */
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  PlayerComputedStats,
  initialPlayerComputedStats,
  PartnerAggregate,
  OpponentAggregate,
  WinRateInfo,
} from "./models/player-stats.model";
import { SessionSummary } from "./finalizeSession"; // Assuming SessionSummary is correctly typed
import { HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

// =================================================================================================
// === INTERNAL CALCULATION LOGIC                                                               ===
// =================================================================================================

/**
 * Erstellt ein WinRateInfo Objekt mit korrektem Bruch-Format.
 * @param wins - Anzahl Siege
 * @param total - Gesamtanzahl entschiedener Spiele/Sessions
 * @returns WinRateInfo Objekt mit formatiertem displayText
 */
function createWinRateInfo(wins: number, total: number): WinRateInfo {
  const rate = total > 0 ? wins / total : 0;
  const displayText = total > 0 
    ? `${wins}/${total} = ${(rate * 100).toFixed(1)}%`
    : "0/0 = 0.0%";
  
  return {
    wins,
    total,
    rate,
    displayText
  };
}

/**
 * Finds the team ('top' or 'bottom') for a given player ID within a session.
 * @param playerId - The player's ID.
 * @param sessionData - The session summary document.
 * @returns The team key or null if the player is not in the session.
 */
function getPlayerTeam(playerId: string, sessionData: SessionSummary): 'top' | 'bottom' | null {
  if (sessionData.teams?.top?.players.some(p => p.playerId === playerId)) {
    return 'top';
  }
  if (sessionData.teams?.bottom?.players.some(p => p.playerId === playerId)) {
    return 'bottom';
  }
  return null;
}

/**
 * Finds the team ('top' or 'bottom') for a given player ID within a specific tournament game.
 * @param playerId - The player ID to search for
 * @param gameResult - The game result object from tournament gameResults
 * @returns The team key or null if the player is not found
 */
function getPlayerTeamInGame(playerId: string, gameResult: any): 'top' | 'bottom' | null {
  if (gameResult.teams?.top?.players?.some((p: any) => p.playerId === playerId)) {
    return 'top';
  }
  if (gameResult.teams?.bottom?.players?.some((p: any) => p.playerId === playerId)) {
    return 'bottom';
  }
  return null;
}

// Ungenutzte Funktionen entfernt

/**
 * The core function for calculating a player's statistics from scratch.
 * It fetches all relevant session data and aggregates it into a single stats object.
 *
 * @param playerId - The unique document ID of the player (from the 'players' collection).
 * @param allPlayerSessions - An array of all completed SessionSummary documents for the player.
 * @returns A promise that resolves to the fully calculated PlayerComputedStats object.
 */
async function calculatePlayerStatisticsInternal(
  playerId: string,
  allPlayerSessions: SessionSummary[]
): Promise<PlayerComputedStats> {
  const stats: PlayerComputedStats = JSON.parse(JSON.stringify(initialPlayerComputedStats));

  if (allPlayerSessions.length === 0) {
    logger.info(`[PlayerStats] No sessions found for player ${playerId}. Returning initial stats.`);
    return stats;
  }

  // Step 1: Collect all unique player IDs from all sessions for efficient fetching.
  const allPlayerIdsInvolved = new Set<string>([playerId]);
  allPlayerSessions.forEach(session => {
    session.participantPlayerIds?.forEach(id => allPlayerIdsInvolved.add(id));
  });

  // Step 2: Fetch all player documents at once and create a lookup map.
  const playerDocs = await db.collection('players').where(admin.firestore.FieldPath.documentId(), 'in', Array.from(allPlayerIdsInvolved)).get();
  const playerIdToNameMap = new Map<string, string>();
  playerDocs.forEach(doc => {
    playerIdToNameMap.set(doc.id, doc.data()?.displayName || 'Unbekannt');
  });

  // --- Partner/Opponent Aggregation ---
  const partnerData = new Map<string, PartnerAggregate>();
  const opponentData = new Map<string, OpponentAggregate>();

  // For calculating game-level streaks - separate for sessions and tournaments
  const gameResults: { won: boolean; date: admin.firestore.Timestamp, sessionId: string, gameNumber: number }[] = [];
  const sessionResults: { won: boolean; tied: boolean; date: admin.firestore.Timestamp, sessionId: string }[] = [];

  // Session-Level Highlights tracking
  let highestPointsSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let lowestPointsSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let highestStricheSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let highestStricheReceivedSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostMatschSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostMatschReceivedSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostSchneiderSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostSchneiderReceivedSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostKontermatschSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostKontermatschReceivedSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostWeisPointsSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let mostWeisPointsReceivedSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;

  // Sort sessions by date for proper streak calculation
  allPlayerSessions.sort((a, b) => {
    const dateA = a.startedAt || admin.firestore.Timestamp.fromMillis(0);
    const dateB = b.startedAt || admin.firestore.Timestamp.fromMillis(0);
    
    // Robuste Behandlung verschiedener Datumsformate
    const getMillis = (date: any): number => {
      if (!date) return 0;
      if (typeof date.toMillis === 'function') return date.toMillis();
      if (typeof date.seconds === 'number') return date.seconds * 1000;
      if (date instanceof Date) return date.getTime();
      if (typeof date === 'number') return date;
      return 0;
    };
    
    return getMillis(dateA) - getMillis(dateB);
  });

  // Set first and last Jass timestamps
  if (allPlayerSessions.length > 0) {
    stats.firstJassTimestamp = allPlayerSessions[0].startedAt || null;
    stats.lastJassTimestamp = allPlayerSessions[allPlayerSessions.length - 1].endedAt || allPlayerSessions[allPlayerSessions.length - 1].startedAt || null;
  }

  // --- Process each session for partner/opponent aggregation ---
  for (const session of allPlayerSessions) {
    const sessionId = session.sessionId;
    const sessionDate = session.startedAt || admin.firestore.Timestamp.now();

    // --- Session-Level Team Assignment ---
    const playerTeam = getPlayerTeam(playerId, session);
    if (!playerTeam) {
      logger.warn(`Player ${playerId} not found in teams for session ${sessionId}. Skipping.`);
      continue;
    }
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';

    // --- Session Win/Loss/Tie ---
    stats.totalSessions++;
    const sessionWon = session.winnerTeamKey === playerTeam;
    const sessionTied = session.winnerTeamKey === 'draw';
    const sessionLost = !sessionWon && !sessionTied;

    if (sessionWon) stats.sessionWins++;
    else if (sessionLost) stats.sessionLosses++;
    else if (sessionTied) stats.sessionTies++;

    sessionResults.push({ won: sessionWon, tied: sessionTied, date: sessionDate, sessionId: sessionId });

    // --- Game Count and Tournament Tracking ---
    const sessionGamesPlayed = session.gamesPlayed || (session.gameResults?.length) || 0;
    stats.totalGames += sessionGamesPlayed;

    const isSessionTournament = Boolean(session.tournamentId);
    if (isSessionTournament) {
      stats.totalTournamentGamesPlayed += session.gamesPlayed || 0;
      stats.totalTournamentsParticipated++;
      // TODO: Tournament placement tracking könnte hier hinzugefügt werden
    }
    
    // --- Game Win/Loss from pre-calculated session data ---
    const playerGameStats = session.gameWinsByPlayer?.[playerId];
    if (playerGameStats) {
      stats.gameWins += playerGameStats.wins || 0;
      stats.gameLosses += playerGameStats.losses || 0;
    }

    // --- Points, Striche, Weis ---
    // ✅ KRITISCH: Für Turniere dürfen Session-Level-Aggregationen NICHT verwendet werden!
    // Bei Turnieren wechseln die Teams pro Spiel, daher sind nur Game-Level-Daten korrekt.
    
    let pointsMade = 0;
    let pointsReceived = 0;
    let stricheMade = 0;
    let stricheReceived = 0;
    let sessionWeisMade = 0;
    let sessionMatschMade = 0;
    let sessionMatschReceived = 0;
    let sessionSchneiderMade = 0;
    let sessionSchneiderReceived = 0;
    let sessionKontermatschMade = 0;
    let sessionKontermatschReceived = 0;
    
    if (isSessionTournament && session.gameResults) {
      // ✅ TOURNAMENT: Verwende Game-Level-Daten (Team wechselt pro Spiel)
      console.log(`[PlayerStats] Processing tournament session ${sessionId} with ${session.gameResults.length} games for player ${playerId}`);
      
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (!gamePlayerTeam) continue;
        
        const gameOpponentTeam = gamePlayerTeam === 'top' ? 'bottom' : 'top';
        
        // Punkte pro Spiel
        const gamePointsMade = game.topScore && gamePlayerTeam === 'top' ? game.topScore : 
                              game.bottomScore && gamePlayerTeam === 'bottom' ? game.bottomScore : 0;
        const gamePointsReceived = game.topScore && gamePlayerTeam === 'bottom' ? game.topScore : 
                                  game.bottomScore && gamePlayerTeam === 'top' ? game.bottomScore : 0;
        
        pointsMade += gamePointsMade;
        pointsReceived += gamePointsReceived;
        
        // Striche pro Spiel (falls verfügbar)
        const gameWithStriche = game as any; // Type assertion für erweiterte Game-Eigenschaften
        if (gameWithStriche.finalStriche) {
          const gameStricheMade = (gameWithStriche.finalStriche[gamePlayerTeam]?.sieg || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.berg || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.matsch || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.schneider || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.kontermatsch || 0);
          const gameStricheReceived = (gameWithStriche.finalStriche[gameOpponentTeam]?.sieg || 0) + 
                                     (gameWithStriche.finalStriche[gameOpponentTeam]?.berg || 0) + 
                                     (gameWithStriche.finalStriche[gameOpponentTeam]?.matsch || 0) + 
                                     (gameWithStriche.finalStriche[gameOpponentTeam]?.schneider || 0) + 
                                     (gameWithStriche.finalStriche[gameOpponentTeam]?.kontermatsch || 0);
          
          stricheMade += gameStricheMade;
          stricheReceived += gameStricheReceived;
          
          // Event Counts pro Spiel
          sessionMatschMade += gameWithStriche.finalStriche[gamePlayerTeam]?.matsch || 0;
          sessionMatschReceived += gameWithStriche.finalStriche[gameOpponentTeam]?.matsch || 0;
          sessionSchneiderMade += gameWithStriche.finalStriche[gamePlayerTeam]?.schneider || 0;
          sessionSchneiderReceived += gameWithStriche.finalStriche[gameOpponentTeam]?.schneider || 0;
          sessionKontermatschMade += gameWithStriche.finalStriche[gamePlayerTeam]?.kontermatsch || 0;
          sessionKontermatschReceived += gameWithStriche.finalStriche[gameOpponentTeam]?.kontermatsch || 0;
        }
      }
      
      // Weis für Turniere: Session-Level verwenden (da nicht pro Spiel verfügbar)
      sessionWeisMade = session.sessionTotalWeisPoints?.[playerTeam] || 0;
    } else {
      // ✅ REGULAR SESSION: Verwende Session-Level-Aggregation (Team bleibt fix)
      pointsMade = session.finalScores?.[playerTeam] || 0;
      pointsReceived = session.finalScores?.[opponentTeam] || 0;
      
      stricheMade = (session.finalStriche?.[playerTeam]?.sieg || 0) + 
                   (session.finalStriche?.[playerTeam]?.berg || 0) + 
                   (session.finalStriche?.[playerTeam]?.matsch || 0) + 
                   (session.finalStriche?.[playerTeam]?.schneider || 0) + 
                   (session.finalStriche?.[playerTeam]?.kontermatsch || 0);
      stricheReceived = (session.finalStriche?.[opponentTeam]?.sieg || 0) + 
                       (session.finalStriche?.[opponentTeam]?.berg || 0) + 
                       (session.finalStriche?.[opponentTeam]?.matsch || 0) + 
                       (session.finalStriche?.[opponentTeam]?.schneider || 0) + 
                       (session.finalStriche?.[opponentTeam]?.kontermatsch || 0);
      
      sessionWeisMade = session.sessionTotalWeisPoints?.[playerTeam] || 0;
      
      // Event Counts für Regular Sessions
      sessionMatschMade = session.eventCounts?.[playerTeam]?.matsch || 0;
      sessionMatschReceived = session.eventCounts?.[opponentTeam]?.matsch || 0;
      sessionSchneiderMade = session.eventCounts?.[playerTeam]?.schneider || 0;
      sessionSchneiderReceived = session.eventCounts?.[opponentTeam]?.schneider || 0;
      sessionKontermatschMade = session.eventCounts?.[playerTeam]?.kontermatsch || 0;
      sessionKontermatschReceived = session.eventCounts?.[opponentTeam]?.kontermatsch || 0;
    }
    
    // Akkumuliere alle Werte
    stats.totalPointsMade += pointsMade;
    stats.totalPointsReceived += pointsReceived;
    stats.totalStricheMade += stricheMade;
    stats.totalStricheReceived += stricheReceived;
    stats.playerTotalWeisMade += sessionWeisMade;

    // --- Event Counts ---
    stats.totalMatschEventsMade += sessionMatschMade;
    stats.totalMatschEventsReceived += sessionMatschReceived;
    stats.totalSchneiderEventsMade += sessionSchneiderMade;
    stats.totalSchneiderEventsReceived += sessionSchneiderReceived;
    stats.totalKontermatschEventsMade += sessionKontermatschMade;
    stats.totalKontermatschEventsReceived += sessionKontermatschReceived;
    
    // --- Trumpf Statistics ---
    const playerTrumpf = session.aggregatedTrumpfCountsByPlayer?.[playerId];
    if (playerTrumpf) {
      for (const [farbe, count] of Object.entries(playerTrumpf)) {
        stats.trumpfStatistik[farbe] = (stats.trumpfStatistik[farbe] || 0) + (count as number);
        stats.totalTrumpfCount += (count as number);
      }
    }
    
    // --- Collect Game Results for Streak Calculation ---
    if (session.gameResults) {
      session.gameResults.forEach(game => {
        gameResults.push({ 
          won: game.winnerTeam === playerTeam, 
          date: sessionDate, 
          sessionId: sessionId, 
          gameNumber: game.gameNumber 
        });
      });
    }

    // --- Aggregate Basic Stats ---
    stats.totalPlayTimeSeconds += session.durationSeconds || 0;

    // --- Session-Level Highlights tracking ---
    if (pointsMade > (highestPointsSession?.value || 0)) {
      highestPointsSession = { value: pointsMade, sessionId: sessionId, date: sessionDate };
    }
    if (pointsMade < (lowestPointsSession?.value || Infinity)) {
      lowestPointsSession = { value: pointsMade, sessionId: sessionId, date: sessionDate };
    }
    
    if (stricheMade > (highestStricheSession?.value || 0)) {
      highestStricheSession = { value: stricheMade, sessionId: sessionId, date: sessionDate };
    }
    if (stricheReceived > (highestStricheReceivedSession?.value || 0)) {
      highestStricheReceivedSession = { value: stricheReceived, sessionId: sessionId, date: sessionDate };
    }
    
    const matschMade = session.eventCounts?.[playerTeam]?.matsch || 0;
    const matschReceived = session.eventCounts?.[opponentTeam]?.matsch || 0;
    if (matschMade > (mostMatschSession?.value || 0)) {
      mostMatschSession = { value: matschMade, sessionId: sessionId, date: sessionDate };
    }
    if (matschReceived > (mostMatschReceivedSession?.value || 0)) {
      mostMatschReceivedSession = { value: matschReceived, sessionId: sessionId, date: sessionDate };
    }
    
    const schneiderMade = session.eventCounts?.[playerTeam]?.schneider || 0;
    const schneiderReceived = session.eventCounts?.[opponentTeam]?.schneider || 0;
    if (schneiderMade > (mostSchneiderSession?.value || 0)) {
      mostSchneiderSession = { value: schneiderMade, sessionId: sessionId, date: sessionDate };
    }
    if (schneiderReceived > (mostSchneiderReceivedSession?.value || 0)) {
      mostSchneiderReceivedSession = { value: schneiderReceived, sessionId: sessionId, date: sessionDate };
    }
    
    const kontermatschMade = session.eventCounts?.[playerTeam]?.kontermatsch || 0;
    const kontermatschReceived = session.eventCounts?.[opponentTeam]?.kontermatsch || 0;
    if (kontermatschMade > (mostKontermatschSession?.value || 0)) {
      mostKontermatschSession = { value: kontermatschMade, sessionId: sessionId, date: sessionDate };
    }
    if (kontermatschReceived > (mostKontermatschReceivedSession?.value || 0)) {
      mostKontermatschReceivedSession = { value: kontermatschReceived, sessionId: sessionId, date: sessionDate };
    }
    
    const weisMade = session.sessionTotalWeisPoints?.[playerTeam] || 0;
    const weisReceived = session.sessionTotalWeisPoints?.[opponentTeam] || 0;
    if (weisMade > (mostWeisPointsSession?.value || 0)) {
      mostWeisPointsSession = { value: weisMade, sessionId: sessionId, date: sessionDate };
    }
    if (weisReceived > (mostWeisPointsReceivedSession?.value || 0)) {
      mostWeisPointsReceivedSession = { value: weisReceived, sessionId: sessionId, date: sessionDate };
    }
  }

  // --- Final Calculations ---
  stats.totalPointsDifference = stats.totalPointsMade - stats.totalPointsReceived;
  stats.totalStricheDifference = stats.totalStricheMade - stats.totalStricheReceived;

  if (stats.totalGames > 0) {
    stats.avgPointsPerGame = stats.totalPointsMade / stats.totalGames;
    stats.avgStrichePerGame = stats.totalStricheMade / stats.totalGames;
    stats.avgWeisPointsPerGame = stats.playerTotalWeisMade / stats.totalGames;
    stats.avgMatschPerGame = stats.totalMatschEventsMade / stats.totalGames;
    stats.avgSchneiderPerGame = stats.totalSchneiderEventsMade / stats.totalGames;
    stats.avgKontermatschPerGame = stats.totalKontermatschEventsMade / stats.totalGames;
  }
  
  // --- Calculate Streaks ---
  calculateAllStreaks(stats, sessionResults, gameResults);

  // --- Finalize Aggregates ---
  partnerData.forEach(p => {
    p.gameWinRate = p.gamesPlayedWith > 0 ? p.gamesWonWith / p.gamesPlayedWith : 0;
    p.sessionWinRate = p.sessionsPlayedWith > 0 ? p.sessionsWonWith / p.sessionsPlayedWith : 0;
    p.gameWinRateInfo = createWinRateInfo(p.gamesWonWith, p.gamesPlayedWith);
    p.sessionWinRateInfo = createWinRateInfo(p.sessionsWonWith, p.sessionsPlayedWith);
  });
  opponentData.forEach(o => {
    o.gameWinRate = o.gamesPlayedAgainst > 0 ? o.gamesWonAgainst / o.gamesPlayedAgainst : 0;
    o.sessionWinRate = o.sessionsPlayedAgainst > 0 ? o.sessionsWonAgainst / o.sessionsPlayedAgainst : 0;
    o.gameWinRateInfo = createWinRateInfo(o.gamesWonAgainst, o.gamesPlayedAgainst);
    o.sessionWinRateInfo = createWinRateInfo(o.sessionsWonAgainst, o.sessionsPlayedAgainst);
  });

  stats.partnerAggregates = Array.from(partnerData.values());
  stats.opponentAggregates = Array.from(opponentData.values());

  // --- KRITISCH: Win-Rate Berechnungen hinzufügen ---
  // Session Win Rate: Nur Siege durch (Siege + Niederlagen), Unentschieden werden ignoriert
  const decidedSessions = stats.sessionWins + stats.sessionLosses;
  stats.sessionWinRate = decidedSessions > 0 ? stats.sessionWins / decidedSessions : 0;
  
  // Game Win Rate: Spiele haben normalerweise keine Unentschieden
  stats.gameWinRate = stats.totalGames > 0 ? stats.gameWins / stats.totalGames : 0;

  // --- NEU: Strukturierte Win-Rate Informationen erstellen ---
  stats.sessionWinRateInfo = createWinRateInfo(stats.sessionWins, decidedSessions);
  stats.gameWinRateInfo = createWinRateInfo(stats.gameWins, stats.totalGames);

  // --- Assign Session-Level Highlights ---
  stats.highestPointsSession = highestPointsSession ? {
    type: 'highest_points_session',
    value: highestPointsSession.value,
    date: highestPointsSession.date,
    relatedId: highestPointsSession.sessionId,
    label: 'Höchste Punkte in einer Partie'
  } : null;
  
  stats.lowestPointsSession = lowestPointsSession ? {
    type: 'lowest_points_session',
    value: lowestPointsSession.value,
    date: lowestPointsSession.date,
    relatedId: lowestPointsSession.sessionId,
    label: 'Niedrigste Punkte in einer Partie'
  } : null;
  
  stats.highestStricheSession = highestStricheSession ? {
    type: 'highest_striche_session',
    value: highestStricheSession.value,
    date: highestStricheSession.date,
    relatedId: highestStricheSession.sessionId,
    label: 'Meiste Striche in einer Partie'
  } : null;
  
  stats.highestStricheReceivedSession = highestStricheReceivedSession ? {
    type: 'highest_striche_received_session',
    value: highestStricheReceivedSession.value,
    date: highestStricheReceivedSession.date,
    relatedId: highestStricheReceivedSession.sessionId,
    label: 'Meiste erhaltene Striche in einer Partie'
  } : null;
  
  stats.mostMatschSession = mostMatschSession ? {
    type: 'most_matsch_session',
    value: mostMatschSession.value,
    date: mostMatschSession.date,
    relatedId: mostMatschSession.sessionId,
    label: 'Meiste Matsche in einer Partie'
  } : null;
  
  stats.mostMatschReceivedSession = mostMatschReceivedSession ? {
    type: 'most_matsch_received_session',
    value: mostMatschReceivedSession.value,
    date: mostMatschReceivedSession.date,
    relatedId: mostMatschReceivedSession.sessionId,
    label: 'Meiste erhaltene Matsche in einer Partie'
  } : null;
  
  stats.mostSchneiderSession = mostSchneiderSession ? {
    type: 'most_schneider_session',
    value: mostSchneiderSession.value,
    date: mostSchneiderSession.date,
    relatedId: mostSchneiderSession.sessionId,
    label: 'Meiste Schneider in einer Partie'
  } : null;
  
  stats.mostSchneiderReceivedSession = mostSchneiderReceivedSession ? {
    type: 'most_schneider_received_session',
    value: mostSchneiderReceivedSession.value,
    date: mostSchneiderReceivedSession.date,
    relatedId: mostSchneiderReceivedSession.sessionId,
    label: 'Meiste erhaltene Schneider in einer Partie'
  } : null;
  
  stats.mostKontermatschSession = mostKontermatschSession ? {
    type: 'most_kontermatsch_session',
    value: mostKontermatschSession.value,
    date: mostKontermatschSession.date,
    relatedId: mostKontermatschSession.sessionId,
    label: 'Meiste Kontermatsche in einer Partie'
  } : null;
  
  stats.mostKontermatschReceivedSession = mostKontermatschReceivedSession ? {
    type: 'most_kontermatsch_received_session',
    value: mostKontermatschReceivedSession.value,
    date: mostKontermatschReceivedSession.date,
    relatedId: mostKontermatschReceivedSession.sessionId,
    label: 'Meiste erhaltene Kontermatsche in einer Partie'
  } : null;
  
  stats.mostWeisPointsSession = mostWeisPointsSession ? {
    type: 'most_weis_points_session',
    value: mostWeisPointsSession.value,
    date: mostWeisPointsSession.date,
    relatedId: mostWeisPointsSession.sessionId,
    label: 'Meiste Weispunkte in einer Partie'
  } : null;
  
  stats.mostWeisPointsReceivedSession = mostWeisPointsReceivedSession ? {
    type: 'most_weis_points_received_session',
    value: mostWeisPointsReceivedSession.value,
    date: mostWeisPointsReceivedSession.date,
    relatedId: mostWeisPointsReceivedSession.sessionId,
    label: 'Meiste erhaltene Weispunkte in einer Partie'
  } : null;

  // --- Timestamp and Return ---
  stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
  return stats;
}

/**
 * Calculates all session and game streaks for a player.
 * @param stats - The stats object to be mutated.
 * @param sessionResults - All session results of the player, sorted by date.
 * @param gameResults - All game results of the player, sorted by date.
 */
function calculateAllStreaks(
  stats: PlayerComputedStats, 
  sessionResults: { won: boolean; tied: boolean; date: admin.firestore.Timestamp, sessionId: string }[], 
  gameResults: { won: boolean; date: admin.firestore.Timestamp, sessionId: string, gameNumber: number }[]
) {
  // Session Streaks with Session ID tracking
  let currentSessionWin = 0; let currentSessionLoss = 0; let currentSessionWinless = 0; let currentSessionUndefeated = 0;
  let maxSessionWin = 0; let maxSessionLoss = 0; let maxSessionWinless = 0; let maxSessionUndefeated = 0;
  
  // Track start/end session IDs for streaks
  let currentWinStreakStart: string | null = null;
  let currentLossStreakStart: string | null = null;
  let currentWinlessStreakStart: string | null = null;
  let currentUndefeatedStreakStart: string | null = null;
  
  let maxWinStreakStart: string | null = null;
  let maxWinStreakEnd: string | null = null;
  let maxLossStreakStart: string | null = null;
  let maxLossStreakEnd: string | null = null;
  let maxWinlessStreakStart: string | null = null;
  let maxWinlessStreakEnd: string | null = null;
  let maxUndefeatedStreakStart: string | null = null;
  let maxUndefeatedStreakEnd: string | null = null;

  let maxWinStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxWinStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxLossStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxLossStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxWinlessStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxWinlessStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxUndefeatedStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxUndefeatedStreakEndDate: admin.firestore.Timestamp | null = null;

  for (const session of sessionResults) {
    if (session.won) {
      // Win
      if (currentSessionWin === 0) currentWinStreakStart = session.sessionId;
      currentSessionWin++;
      if (currentSessionUndefeated === 0) currentUndefeatedStreakStart = session.sessionId;
      currentSessionUndefeated++;
      
      // Check if this is a new max win streak
      if (currentSessionWin > maxSessionWin) {
        maxSessionWin = currentSessionWin;
        maxWinStreakStart = currentWinStreakStart;
        maxWinStreakEnd = session.sessionId;
        maxWinStreakStartDate = sessionResults.find(s => s.sessionId === currentWinStreakStart)?.date || session.date;
        maxWinStreakEndDate = session.date;
      }
      
      // Check if this is a new max undefeated streak
      if (currentSessionUndefeated > maxSessionUndefeated) {
        maxSessionUndefeated = currentSessionUndefeated;
        maxUndefeatedStreakStart = currentUndefeatedStreakStart;
        maxUndefeatedStreakEnd = session.sessionId;
        maxUndefeatedStreakStartDate = sessionResults.find(s => s.sessionId === currentUndefeatedStreakStart)?.date || session.date;
        maxUndefeatedStreakEndDate = session.date;
      }
      
      currentSessionLoss = 0;
      currentSessionWinless = 0;
      currentLossStreakStart = null;
      currentWinlessStreakStart = null;
    } else if (session.tied) {
      // Draw
      if (currentSessionWinless === 0) currentWinlessStreakStart = session.sessionId;
      currentSessionWinless++;
      if (currentSessionUndefeated === 0) currentUndefeatedStreakStart = session.sessionId;
      currentSessionUndefeated++;
      
      // Check max streaks
      if (currentSessionWinless > maxSessionWinless) {
        maxSessionWinless = currentSessionWinless;
        maxWinlessStreakStart = currentWinlessStreakStart;
        maxWinlessStreakEnd = session.sessionId;
        maxWinlessStreakStartDate = sessionResults.find(s => s.sessionId === currentWinlessStreakStart)?.date || session.date;
        maxWinlessStreakEndDate = session.date;
      }
      
      if (currentSessionUndefeated > maxSessionUndefeated) {
        maxSessionUndefeated = currentSessionUndefeated;
        maxUndefeatedStreakStart = currentUndefeatedStreakStart;
        maxUndefeatedStreakEnd = session.sessionId;
        maxUndefeatedStreakStartDate = sessionResults.find(s => s.sessionId === currentUndefeatedStreakStart)?.date || session.date;
        maxUndefeatedStreakEndDate = session.date;
      }
      
      currentSessionWin = 0;
      currentSessionLoss = 0;
      currentWinStreakStart = null;
      currentLossStreakStart = null;
    } else {
      // Loss
      if (currentSessionLoss === 0) currentLossStreakStart = session.sessionId;
      currentSessionLoss++;
      if (currentSessionWinless === 0) currentWinlessStreakStart = session.sessionId;
      currentSessionWinless++;
      
      // Check max streaks
      if (currentSessionLoss > maxSessionLoss) {
        maxSessionLoss = currentSessionLoss;
        maxLossStreakStart = currentLossStreakStart;
        maxLossStreakEnd = session.sessionId;
        maxLossStreakStartDate = sessionResults.find(s => s.sessionId === currentLossStreakStart)?.date || session.date;
        maxLossStreakEndDate = session.date;
      }
      
      if (currentSessionWinless > maxSessionWinless) {
        maxSessionWinless = currentSessionWinless;
        maxWinlessStreakStart = currentWinlessStreakStart;
        maxWinlessStreakEnd = session.sessionId;
        maxWinlessStreakStartDate = sessionResults.find(s => s.sessionId === currentWinlessStreakStart)?.date || session.date;
        maxWinlessStreakEndDate = session.date;
      }
      
      currentSessionWin = 0;
      currentSessionUndefeated = 0;
      currentWinStreakStart = null;
      currentUndefeatedStreakStart = null;
    }
  }
  
  // Assign session streak results
  stats.currentSessionWinStreak = currentSessionWin;
  stats.currentSessionLossStreak = currentSessionLoss;
  stats.currentSessionWinlessStreak = currentSessionWinless;
  stats.currentUndefeatedStreakSessions = currentSessionUndefeated;
  
  stats.longestWinStreakSessions = maxSessionWin > 0 ? { 
    value: maxSessionWin,
    startDate: maxWinStreakStartDate,
    endDate: maxWinStreakEndDate,
    startSessionId: maxWinStreakStart || undefined,
    endSessionId: maxWinStreakEnd || undefined
  } : null;
  
  stats.longestLossStreakSessions = maxSessionLoss > 0 ? { 
    value: maxSessionLoss,
    startDate: maxLossStreakStartDate,
    endDate: maxLossStreakEndDate,
    startSessionId: maxLossStreakStart || undefined,
    endSessionId: maxLossStreakEnd || undefined
  } : null;
  
  stats.longestWinlessStreakSessions = maxSessionWinless > 0 ? { 
    value: maxSessionWinless,
    startDate: maxWinlessStreakStartDate,
    endDate: maxWinlessStreakEndDate,
    startSessionId: maxWinlessStreakStart || undefined,
    endSessionId: maxWinlessStreakEnd || undefined
  } : null;
  
  stats.longestUndefeatedStreakSessions = maxSessionUndefeated > 0 ? { 
    value: maxSessionUndefeated,
    startDate: maxUndefeatedStreakStartDate,
    endDate: maxUndefeatedStreakEndDate,
    startSessionId: maxUndefeatedStreakStart || undefined,
    endSessionId: maxUndefeatedStreakEnd || undefined
  } : null;

  // Game Streaks (simplified - no Session ID tracking needed for individual games)
  let currentGameWin = 0; let currentGameLoss = 0; let currentGameWinless = 0; let currentGameUndefeated = 0;
  let maxGameWin = 0; let maxGameLoss = 0; let maxGameWinless = 0; let maxGameUndefeated = 0;

  for (const game of gameResults) {
    if (game.won) {
      currentGameWin++;
      currentGameUndefeated++;
      currentGameLoss = 0;
      currentGameWinless = 0;
    } else {
      currentGameLoss++;
      currentGameWinless++;
      currentGameWin = 0;
      currentGameUndefeated = 0;
    }
    maxGameWin = Math.max(maxGameWin, currentGameWin);
    maxGameLoss = Math.max(maxGameLoss, currentGameLoss);
    maxGameWinless = Math.max(maxGameWinless, currentGameWinless);
    maxGameUndefeated = Math.max(maxGameUndefeated, currentGameUndefeated);
  }
  
  stats.currentGameWinStreak = currentGameWin;
  stats.currentGameLossStreak = currentGameLoss;
  stats.currentGameWinlessStreak = currentGameWinless;
  stats.currentUndefeatedStreakGames = currentGameUndefeated;
  stats.longestWinStreakGames = maxGameWin > 0 ? { value: maxGameWin } : null;
  stats.longestLossStreakGames = maxGameLoss > 0 ? { value: maxGameLoss } : null;
  stats.longestWinlessStreakGames = maxGameWinless > 0 ? { value: maxGameWinless } : null;
  stats.longestUndefeatedStreakGames = maxGameUndefeated > 0 ? { value: maxGameUndefeated } : null;
}

// =================================================================================================
// === PUBLIC EXPORTED FUNCTION                                                                 ===
// =================================================================================================

/**
 * Fetches all necessary data for a player, recalculates their stats from scratch,
 * and saves the new stats document to Firestore.
 * This is the main entry point for updating a single player's statistics.
 *
 * @param playerId - The unique document ID of the player (from the 'players' collection).
 * @returns A promise that resolves when the operation is complete.
 */
export async function updatePlayerStats(playerId: string): Promise<void> {
  logger.info(`[PlayerStats] Starting stats update for playerId: ${playerId}`);

  if (!playerId || typeof playerId !== 'string') {
    logger.error("[PlayerStats] Invalid or missing playerId provided.");
    return;
  }

  try {
    // Fetch all completed sessions where the player participated.
    const sessionsSnapshot = await db
      .collection(JASS_SUMMARIES_COLLECTION)
      .where("participantPlayerIds", "array-contains", playerId)
      .where("status", "==", "completed")
      .get();

    const allPlayerSessions = sessionsSnapshot.docs.map(
      (doc) => ({ ...doc.data(), sessionId: doc.id } as SessionSummary)
    );

    logger.info(`[PlayerStats] Found ${allPlayerSessions.length} sessions for player ${playerId}.`);

    // Calculate the new stats using the internal logic.
    const newStats = await calculatePlayerStatisticsInternal(playerId, allPlayerSessions);

    // Save the stats document using the playerId as the document ID
    const statsDocRef = db.collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(playerId);
    await statsDocRef.set(newStats, { merge: true });

    logger.info(`[PlayerStats] Successfully calculated and saved stats for player ${playerId}.`);
  } catch (error) {
    logger.error(`[PlayerStats] Critical error while updating stats for player ${playerId}:`, error);
    // Re-throw the error to allow the caller (e.g., a Cloud Function) to handle it.
    throw new HttpsError("internal", `Failed to update stats for player ${playerId}.`);
  }
} 