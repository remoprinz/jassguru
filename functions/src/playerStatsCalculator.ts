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

const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

// =================================================================================================
// === HELPER FUNCTIONS                                                                         ===
// =================================================================================================

/**
 * Berechnet den Median eines Arrays von Zahlen
 * Robuster als Durchschnitt gegen Ausreißer (z.B. unterbrochene Runden)
 * @param values - Array von Zahlen
 * @returns Median-Wert oder 0 bei leerem Array
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    // Bei gerader Anzahl: Durchschnitt der beiden mittleren Werte
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  // Bei ungerader Anzahl: Mittlerer Wert
  return sorted[mid];
}

// =================================================================================================
// === INTERNAL CALCULATION LOGIC                                                               ===
// =================================================================================================

/**
 * ✅ FALLBACK: Berechnet Trumpfansagen aus completedGames für Sessions ohne aggregatedTrumpfCountsByPlayer
 * @param sessionId - Die Session ID
 * @param playerId - Player Document ID
 * @param session - Session-Daten für Mapping
 * @returns Trumpffarben-Zählungen für den Spieler
 */
async function calculateTrumpfFromCompletedGames(
  sessionId: string, 
  playerId: string, 
  session: SessionSummary
): Promise<{ [farbe: string]: number }> {
  const trumpfCounts: { [farbe: string]: number } = {};
  
  try {
    // 1. Erstelle Player-Mapping (analog zu finalizeSession.ts)
    const playerNumberToIdMap = new Map<number, string>();
    if (session.participantPlayerIds && Array.isArray(session.participantPlayerIds)) {
      session.participantPlayerIds.forEach((pid, index) => {
        playerNumberToIdMap.set(index + 1, pid); // 1-basiert
      });
    } else {
      logger.warn(`[calculateTrumpfFromCompletedGames] No participantPlayerIds found for session ${sessionId}. Cannot map players.`);
      return trumpfCounts;
    }
    
    // 2. Lade completedGames für diese Session
    let completedGamesCollectionRef;
    if (session.groupId) {
      // Neue Architektur: groups/{groupId}/jassGameSummaries/{sessionId}/completedGames
      completedGamesCollectionRef = db.collection(`groups/${session.groupId}/jassGameSummaries/${sessionId}/completedGames`);
    } else {
      // Fallback für alte Architektur
      completedGamesCollectionRef = db.collection(`sessions/${sessionId}/completedGames`);
    }
    
    const completedGamesSnap = await completedGamesCollectionRef.orderBy("gameNumber").get();
    
    // 3. Analysiere jedes Spiel
    completedGamesSnap.forEach(gameDoc => {
      const gameData = gameDoc.data();
      if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
        gameData.roundHistory.forEach((round: any) => {
          // ✅ KRITISCHER FIX: Der trumpfansagende Spieler ist der startingPlayer, nicht der currentPlayer!
          if (round.startingPlayer && round.farbe) {
            // Mappe startingPlayer (1-4) zu Player-ID
            const trumpfPlayerId = playerNumberToIdMap.get(round.startingPlayer);
            
            // Zähle nur Trumpfansagen für den gesuchten Spieler
            if (trumpfPlayerId === playerId) {
              const farbeKey = round.farbe.toLowerCase();
              trumpfCounts[farbeKey] = (trumpfCounts[farbeKey] || 0) + 1;
            }
          }
        });
      }
    });
    
    const totalTrumpfCount = Object.values(trumpfCounts).reduce((sum, count) => sum + count, 0);
    logger.info(`[calculateTrumpfFromCompletedGames] Player ${playerId} in session ${sessionId}: Found ${totalTrumpfCount} trumpf calls via fallback calculation`);
  } catch (error) {
    logger.error(`[calculateTrumpfFromCompletedGames] Error calculating trumpf for player ${playerId} in session ${sessionId}:`, error);
  }
  
  return trumpfCounts;
}

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
 * ✅ ERWEITERT: Unterstützt sowohl Regular Sessions als auch Turniere
 * @param playerId - The player's ID.
 * @param sessionData - The session summary document.
 * @returns The team key or null if the player is not in the session.
 */
function getPlayerTeam(playerId: string, sessionData: SessionSummary): 'top' | 'bottom' | null {
  // ✅ REGULAR SESSION: Normale Team-Struktur
  if (sessionData.teams?.top?.players.some(p => p.playerId === playerId)) {
    return 'top';
  }
  if (sessionData.teams?.bottom?.players.some(p => p.playerId === playerId)) {
    return 'bottom';
  }
  
  // ✅ TOURNAMENT: Prüfe participantPlayerIds (Teams wechseln pro Spiel)
  if (sessionData.tournamentId && sessionData.participantPlayerIds?.includes(playerId)) {
    // Für Turniere geben wir 'top' zurück als Platzhalter, da Teams pro Spiel wechseln
    // Die echte Team-Zuordnung erfolgt in getPlayerTeamInGame() pro Spiel
    return 'top';
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

  // ✅ MEDIAN: Sammlung aller Session-Durchschnittszeiten für Median-Berechnung
  const allSessionRoundDurations: number[] = [];

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

  // === NEU: Tracking für Differenz-basierte Highlights ===
  let highestPointsDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let lowestPointsDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let highestMatschDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let lowestMatschDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let highestStricheDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;
  let lowestStricheDifferenceSession: { value: number; sessionId: string; date: admin.firestore.Timestamp } | null = null;

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

    // ✅ KRITISCH: Unterscheide Tournament vs Regular Session (analog zu groupStatsCalculator)
    const isSessionTournament = Boolean(session.tournamentId);

    // --- Session-Level Team Assignment ---
    const playerTeam = getPlayerTeam(playerId, session);
  if (!playerTeam) {
      logger.warn(`Player ${playerId} not found in teams for session ${sessionId}. Skipping.`);
      continue;
  }
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';

    // === NEU: Partner/Opponent Aggregation Logic ===
    
    // Sammle alle Partner-IDs (gleiche Team-Mitglieder)
    const partnerIds: string[] = [];
    const opponentIds: string[] = [];
    
    if (isSessionTournament && session.participantPlayerIds) {
      // ✅ TOURNAMENT: Alle anderen Teilnehmer als potentielle Partner/Gegner sammeln
      // Da Teams pro Spiel wechseln, müssen wir das pro Spiel analysieren
      if (session.gameResults) {
        for (const game of session.gameResults) {
          const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
          if (gamePlayerTeam) {
            // Partner: Andere Spieler im gleichen Team
            const gameWithTeams = game as any; // Type assertion für erweiterte Game-Eigenschaften
            const gamePartners = gameWithTeams.teams?.[gamePlayerTeam]?.players
              ?.map((p: any) => p.playerId)
              .filter((id: string) => id && id !== playerId) || [];
            
            // Gegner: Spieler im anderen Team
            const gameOpponentTeam = gamePlayerTeam === 'top' ? 'bottom' : 'top';
            const gameOpponents = gameWithTeams.teams?.[gameOpponentTeam]?.players
              ?.map((p: any) => p.playerId)
              .filter((id: string) => id) || [];
            
            partnerIds.push(...gamePartners);
            opponentIds.push(...gameOpponents);
          }
        }
      }
    } else if (!isSessionTournament) {
      // ✅ REGULAR SESSION: Partner sind Teammitglieder, Gegner sind andere Team
      partnerIds.push(...(session.teams?.[playerTeam]?.players
        ?.map(p => p.playerId)
        .filter(id => id && id !== playerId) || []));
      
      opponentIds.push(...(session.teams?.[opponentTeam]?.players
        ?.map(p => p.playerId)
        .filter(id => id) || []));
    }
    
    // Session-Win-Informationen
    const sessionWon = session.winnerTeamKey === playerTeam;
    
    // Points/Striche für diese Session (bereits berechnet weiter unten)
    let sessionPointsMade = 0;
    let sessionPointsReceived = 0;
    let sessionStricheMade = 0;
    let sessionStricheReceived = 0;
    
    // ✅ KORREKTUR: IMMER Game-by-Game (nicht Session-Level!)
    // Grund: Session-Level-Team-Zuordnung ist fehleranfällig
    if (session.gameResults && session.gameResults.length > 0) {
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (!gamePlayerTeam) continue;
        
        const gamePointsMade = game.topScore && gamePlayerTeam === 'top' ? game.topScore : 
                              game.bottomScore && gamePlayerTeam === 'bottom' ? game.bottomScore : 0;
        const gamePointsReceived = game.topScore && gamePlayerTeam === 'bottom' ? game.topScore : 
                                  game.bottomScore && gamePlayerTeam === 'top' ? game.bottomScore : 0;
        
        sessionPointsMade += gamePointsMade;
        sessionPointsReceived += gamePointsReceived;
        
        // Striche (falls verfügbar)
        const gameWithStriche = game as any;
        if (gameWithStriche.finalStriche) {
          const gameStricheMade = (gameWithStriche.finalStriche[gamePlayerTeam]?.sieg || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.berg || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.matsch || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.schneider || 0) + 
                                 (gameWithStriche.finalStriche[gamePlayerTeam]?.kontermatsch || 0);
          const gameStricheReceived = (gameWithStriche.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top']?.sieg || 0) + 
                                     (gameWithStriche.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top']?.berg || 0) + 
                                     (gameWithStriche.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top']?.matsch || 0) + 
                                     (gameWithStriche.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top']?.schneider || 0) + 
                                     (gameWithStriche.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top']?.kontermatsch || 0);
          
          sessionStricheMade += gameStricheMade;
          sessionStricheReceived += gameStricheReceived;
        }
      }
    }
    
    const aggregationStricheDifference = sessionStricheMade - sessionStricheReceived;
    const aggregationPointsDifference = sessionPointsMade - sessionPointsReceived;
    const sessionGamesPlayed = session.gamesPlayed || (session.gameResults?.length) || 0;
    
    // Game-Wins für diese Session
    let sessionGameWins = 0;
    if (isSessionTournament && session.gameResults) {
      // Tournament: Berechne Wins manuell
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (gamePlayerTeam && game.winnerTeam === gamePlayerTeam) {
          sessionGameWins++;
        }
      }
    } else if (!isSessionTournament) {
      // Regular Session: Von Session-Daten
      sessionGameWins = session.gameWinsByPlayer?.[playerId]?.wins || 0;
    }
    
    // --- Partner Aggregation ---
    for (const partnerId of [...new Set(partnerIds)]) { // Dedupliziere
      if (!partnerData.has(partnerId)) {
        const partnerDisplayName = playerIdToNameMap.get(partnerId) || 'Unbekannt';
        partnerData.set(partnerId, {
          partnerId,
          partnerDisplayName,
          sessionsPlayedWith: 0,
          sessionsWonWith: 0,
          gamesPlayedWith: 0,
          gamesWonWith: 0,
          totalStricheDifferenceWith: 0,
          totalPointsWith: 0,
          totalPointsDifferenceWith: 0,
          matschGamesWonWith: 0,
          schneiderGamesWonWith: 0,
          kontermatschGamesWonWith: 0,
          matschBilanz: 0,
          schneiderBilanz: 0,
          kontermatschBilanz: 0,
          matschEventsMadeWith: 0,
          matschEventsReceivedWith: 0,
          schneiderEventsMadeWith: 0,
          schneiderEventsReceivedWith: 0,
          kontermatschEventsMadeWith: 0,
          kontermatschEventsReceivedWith: 0,
          lastPlayedWithTimestamp: sessionDate,
          sessionWinRate: 0,
          gameWinRate: 0
        });
      }
      
      const partnerStats = partnerData.get(partnerId)!;
      
      // ✅ KORREKTUR: Analog zu Individual-Tab - Session-Counts nur für Regular Sessions und nur entschiedene Sessions
      if (!isSessionTournament && session.winnerTeamKey !== 'draw') { 
        partnerStats.sessionsPlayedWith++;
        if (sessionWon) partnerStats.sessionsWonWith++;
      }
      
      // ✅ KORREKTUR: Game-Counts und Differenzen für ALLE Sessions (inkl. Turniere)
      partnerStats.gamesPlayedWith += sessionGamesPlayed;
      partnerStats.gamesWonWith += sessionGameWins;
      partnerStats.totalStricheDifferenceWith += aggregationStricheDifference;
      partnerStats.totalPointsDifferenceWith += aggregationPointsDifference;
      partnerStats.lastPlayedWithTimestamp = sessionDate;
    }
    
    // --- Opponent Aggregation ---
    for (const opponentId of [...new Set(opponentIds)]) { // Dedupliziere
      if (!opponentData.has(opponentId)) {
        const opponentDisplayName = playerIdToNameMap.get(opponentId) || 'Unbekannt';
        opponentData.set(opponentId, {
          opponentId,
          opponentDisplayName,
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          gamesPlayedAgainst: 0,
          gamesWonAgainst: 0,
          totalStricheDifferenceAgainst: 0,
          totalPointsScoredWhenOpponent: 0,
          totalPointsDifferenceAgainst: 0,
          matschGamesWonAgainstOpponentTeam: 0,
          schneiderGamesWonAgainstOpponentTeam: 0,
          kontermatschGamesWonAgainstOpponentTeam: 0,
          matschBilanz: 0,
          schneiderBilanz: 0,
          kontermatschBilanz: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
          kontermatschEventsMadeAgainst: 0,
          kontermatschEventsReceivedAgainst: 0,
          lastPlayedAgainstTimestamp: sessionDate,
          sessionWinRate: 0,
          gameWinRate: 0
        });
      }
      
      const opponentStats = opponentData.get(opponentId)!;
      
      // ✅ KORREKTUR: Analog zu Individual-Tab - Session-Counts nur für Regular Sessions und nur entschiedene Sessions
      if (!isSessionTournament && session.winnerTeamKey !== 'draw') { 
        opponentStats.sessionsPlayedAgainst++;
        if (sessionWon) opponentStats.sessionsWonAgainst++;
      }
      
      // ✅ KORREKTUR: Game-Counts und Differenzen für ALLE Sessions (inkl. Turniere)
      opponentStats.gamesPlayedAgainst += sessionGamesPlayed;
      opponentStats.gamesWonAgainst += sessionGameWins;
      opponentStats.totalStricheDifferenceAgainst += aggregationStricheDifference;
      opponentStats.totalPointsDifferenceAgainst += aggregationPointsDifference;
      opponentStats.lastPlayedAgainstTimestamp = sessionDate;
    }

    // === Ende Partner/Opponent Aggregation ===

    // ✅ KORRIGIERT: Session Win/Loss/Tie NUR für Regular Sessions zählen
    if (!isSessionTournament) {
      stats.totalSessions++;
      const sessionWon = session.winnerTeamKey === playerTeam;
      

      if (sessionWon) {
        stats.sessionWins++;
      } else if (session.winnerTeamKey === 'draw') {
        stats.sessionTies++;
      } else {
        stats.sessionLosses++;
      }

      sessionResults.push({ won: sessionWon, tied: session.winnerTeamKey === 'draw', date: sessionDate, sessionId: sessionId });
    }

    // ✅ WICHTIG: Game Count und Tournament Tracking für ALLE Sessions
    stats.totalGames += sessionGamesPlayed;

    if (isSessionTournament) {
      stats.totalTournamentGamesPlayed += session.gamesPlayed || 0;
      stats.totalTournamentsParticipated++;
      stats.totalTournaments++; // ✅ NEU: Inkrementiere auch totalTournaments für korrekte Anzeige
      // TODO: Tournament placement tracking könnte hier hinzugefügt werden
    }
    
    // --- Game Win/Loss from pre-calculated session data ---
    // ✅ KRITISCH: Für normale Sessions verwenden wir die Session-Daten, da gameResults keine Teams haben
    // ✅ Für Turniere berechnen wir die Wins manuell aus gameResults, da Teams pro Spiel wechseln
    
    if (isSessionTournament && session.gameResults) {
      // ✅ TOURNAMENT: Berechne Wins manuell aus gameResults (Teams wechseln pro Spiel)
      let tournamentWins = 0;
      let tournamentLosses = 0;
      
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (gamePlayerTeam) {
          if (game.winnerTeam === gamePlayerTeam) {
            tournamentWins++;
          } else {
            tournamentLosses++;
          }
        }
      }
      
      stats.gameWins += tournamentWins;
      stats.gameLosses += tournamentLosses;
      
      console.log(`[PlayerStats] Tournament ${sessionId}: Manual calculation - ${tournamentWins} wins, ${tournamentLosses} losses`);
    } else if (!isSessionTournament) {
      // ✅ REGULAR SESSION: Verwende Session-Level gameWinsByPlayer (Teams bleiben konstant)
      const playerGameStats = session.gameWinsByPlayer?.[playerId];
      if (playerGameStats) {
        stats.gameWins += playerGameStats.wins || 0;
        stats.gameLosses += playerGameStats.losses || 0;
        
        console.log(`[PlayerStats] Regular session ${sessionId}: From session data - ${playerGameStats.wins || 0} wins, ${playerGameStats.losses || 0} losses`);
      }
    }
    // ✅ Turniere ohne gameResults werden ignoriert

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
          
          // ✅ KORRIGIERT: Event Counts pro Spiel - verwende eventCounts (wer hat gemacht), nicht finalStriche (wer hat erhalten)
          sessionMatschMade += gameWithStriche.eventCounts?.[gamePlayerTeam]?.matsch || 0;
          sessionMatschReceived += gameWithStriche.eventCounts?.[gameOpponentTeam]?.matsch || 0;
          sessionSchneiderMade += gameWithStriche.eventCounts?.[gamePlayerTeam]?.schneider || 0;
          sessionSchneiderReceived += gameWithStriche.eventCounts?.[gameOpponentTeam]?.schneider || 0;
          sessionKontermatschMade += gameWithStriche.eventCounts?.[gamePlayerTeam]?.kontermatsch || 0;
          sessionKontermatschReceived += gameWithStriche.eventCounts?.[gameOpponentTeam]?.kontermatsch || 0;
        }
      }
      
      // Weis für Turniere: Session-Level verwenden (da nicht pro Spiel verfügbar)
      sessionWeisMade = session.sessionTotalWeisPoints?.[playerTeam] || 0;
    } else if (!isSessionTournament) {
      // ✅ REGULAR SESSION ONLY: Verwende Session-Level-Aggregation (Team bleibt fix)
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
    // ✅ KRITISCH: Turniere ohne gameResults werden IGNORIERT (keine Session-Level-Daten verwenden)
    
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
    
    // ✅ NEU: Event-Bilanz für Partner und Gegner aktualisieren
    // Jetzt wo die Event-Counts berechnet sind, können wir die Partner/Opponent-Bilanzen aktualisieren
    
    // ✅ ERWEITERT: Event-Statistiken für Partner/Opponent-Aggregation
    // ✅ KRITISCH: Für Tournament-Sessions müssen Events pro Spiel berechnet werden!
    
    if (isSessionTournament && session.gameResults) {
      // ✅ TOURNAMENT: Game-Level Event-Aggregation für Partner/Opponent
      for (const game of session.gameResults) {
        const gamePlayerTeam = getPlayerTeamInGame(playerId, game);
        if (!gamePlayerTeam) continue;
        
        const gameOpponentTeam = gamePlayerTeam === 'top' ? 'bottom' : 'top';
        const gameWithStriche = game as any;
        
        if (gameWithStriche.eventCounts) {
          const gameMatschMade = gameWithStriche.eventCounts[gamePlayerTeam]?.matsch || 0;
          const gameMatschReceived = gameWithStriche.eventCounts[gameOpponentTeam]?.matsch || 0;
          const gameSchneiderMade = gameWithStriche.eventCounts[gamePlayerTeam]?.schneider || 0;
          const gameSchneiderReceived = gameWithStriche.eventCounts[gameOpponentTeam]?.schneider || 0;
          const gameKontermatschMade = gameWithStriche.eventCounts[gamePlayerTeam]?.kontermatsch || 0;
          const gameKontermatschReceived = gameWithStriche.eventCounts[gameOpponentTeam]?.kontermatsch || 0;
          
          const gameWon = game.winnerTeam === gamePlayerTeam;
          
          // Partner für dieses spezifische Spiel
          const gamePartners = gameWithStriche.teams?.[gamePlayerTeam]?.players
            ?.map((p: any) => p.playerId)
            .filter((id: string) => id && id !== playerId) || [];
          
          // Opponent für dieses spezifische Spiel
          const gameOpponents = gameWithStriche.teams?.[gameOpponentTeam]?.players
            ?.map((p: any) => p.playerId)
            .filter((id: string) => id) || [];
          
          // Partner-Event-Bilanz für dieses Spiel
          for (const partnerId of gamePartners) {
            const partnerStats = partnerData.get(partnerId);
            if (partnerStats) {
              partnerStats.matschEventsMadeWith += gameMatschMade;
              partnerStats.matschEventsReceivedWith += gameMatschReceived;
              partnerStats.schneiderEventsMadeWith += gameSchneiderMade;
              partnerStats.schneiderEventsReceivedWith += gameSchneiderReceived;
              partnerStats.kontermatschEventsMadeWith += gameKontermatschMade;
              partnerStats.kontermatschEventsReceivedWith += gameKontermatschReceived;
              
              // Gewonnene Spiele mit Events
              if (gameWon) {
                partnerStats.matschGamesWonWith += gameMatschMade;
                partnerStats.schneiderGamesWonWith += gameSchneiderMade;
                partnerStats.kontermatschGamesWonWith += gameKontermatschMade;
              }
            }
          }
          
          // Opponent-Event-Bilanz für dieses Spiel
          for (const opponentId of gameOpponents) {
            const opponentStats = opponentData.get(opponentId);
            if (opponentStats) {
              opponentStats.matschEventsMadeAgainst += gameMatschMade;
              opponentStats.matschEventsReceivedAgainst += gameMatschReceived;
              opponentStats.schneiderEventsMadeAgainst += gameSchneiderMade;
              opponentStats.schneiderEventsReceivedAgainst += gameSchneiderReceived;
              opponentStats.kontermatschEventsMadeAgainst += gameKontermatschMade;
              opponentStats.kontermatschEventsReceivedAgainst += gameKontermatschReceived;
              
              // Gewonnene Spiele mit Events
              if (gameWon) {
                opponentStats.matschGamesWonAgainstOpponentTeam += gameMatschMade;
                opponentStats.schneiderGamesWonAgainstOpponentTeam += gameSchneiderMade;
                opponentStats.kontermatschGamesWonAgainstOpponentTeam += gameKontermatschMade;
              }
            }
          }
        }
      }
    } else if (!isSessionTournament) {
      // ✅ REGULAR SESSION: Session-Level Event-Aggregation für Partner/Opponent
      // Partner-Event-Bilanz aktualisieren (alle Events, nicht nur bei Sieg)
      for (const partnerId of [...new Set(partnerIds)]) {
        const partnerStats = partnerData.get(partnerId);
        if (partnerStats) {
          // Event-Counts für alle Sessions (nicht nur Siege)
          partnerStats.matschEventsMadeWith += sessionMatschMade;
          partnerStats.matschEventsReceivedWith += sessionMatschReceived;
          partnerStats.schneiderEventsMadeWith += sessionSchneiderMade;
          partnerStats.schneiderEventsReceivedWith += sessionSchneiderReceived;
          partnerStats.kontermatschEventsMadeWith += sessionKontermatschMade;
          partnerStats.kontermatschEventsReceivedWith += sessionKontermatschReceived;
          
          // Gewonnene Spiele mit Events (nur bei Sieg)
          if (sessionWon) {
            partnerStats.matschGamesWonWith += sessionMatschMade;
            partnerStats.schneiderGamesWonWith += sessionSchneiderMade;
            partnerStats.kontermatschGamesWonWith += sessionKontermatschMade;
          }
        }
      }
      
      // Opponent-Event-Bilanz aktualisieren (alle Events, nicht nur bei Sieg)
      for (const opponentId of [...new Set(opponentIds)]) {
        const opponentStats = opponentData.get(opponentId);
        if (opponentStats) {
          // Event-Counts für alle Sessions (nicht nur Siege)
          opponentStats.matschEventsMadeAgainst += sessionMatschMade;
          opponentStats.matschEventsReceivedAgainst += sessionMatschReceived;
          opponentStats.schneiderEventsMadeAgainst += sessionSchneiderMade;
          opponentStats.schneiderEventsReceivedAgainst += sessionSchneiderReceived;
          opponentStats.kontermatschEventsMadeAgainst += sessionKontermatschMade;
          opponentStats.kontermatschEventsReceivedAgainst += sessionKontermatschReceived;
          
          // Gewonnene Spiele mit Events (nur bei Sieg)
          if (sessionWon) {
            opponentStats.matschGamesWonAgainstOpponentTeam += sessionMatschMade;
            opponentStats.schneiderGamesWonAgainstOpponentTeam += sessionSchneiderMade;
            opponentStats.kontermatschGamesWonAgainstOpponentTeam += sessionKontermatschMade;
          }
        }
      }
    }
    
    // --- Trumpf Statistics ---
    const playerTrumpf = session.aggregatedTrumpfCountsByPlayer?.[playerId];
    if (playerTrumpf) {
      // ✅ STANDARD: Verwende vorberechnete Session-Aggregation
      for (const [farbe, count] of Object.entries(playerTrumpf)) {
        stats.trumpfStatistik[farbe] = (stats.trumpfStatistik[farbe] || 0) + (count as number);
        stats.totalTrumpfCount += (count as number);
      }
    } else {
      // 🔄 FALLBACK: Berechne Trumpfansagen aus completedGames für legacy Sessions
      logger.info(`[PlayerStats] ${playerId}: No aggregatedTrumpfCountsByPlayer found for session ${sessionId}. Using fallback calculation.`);
      
      const fallbackTrumpfCounts = await calculateTrumpfFromCompletedGames(sessionId, playerId, session);
      for (const [farbe, count] of Object.entries(fallbackTrumpfCounts)) {
        stats.trumpfStatistik[farbe] = (stats.trumpfStatistik[farbe] || 0) + count;
        stats.totalTrumpfCount += count;
      }
    }
    
    // --- Collect Game Results for Streak Calculation ---
    if (session.gameResults) {
      session.gameResults.forEach(game => {
        // ✅ KORRIGIERT: Bei Turnieren Team pro Spiel ermitteln, bei Sessions Session-Team verwenden
        const gamePlayerTeam = isSessionTournament ? getPlayerTeamInGame(playerId, game) : playerTeam;
        if (gamePlayerTeam) {
          gameResults.push({ 
            won: game.winnerTeam === gamePlayerTeam, 
            date: sessionDate, 
            sessionId: sessionId, 
            gameNumber: game.gameNumber 
          });
        }
      });
    }

    // --- Aggregate Basic Stats ---
    stats.totalPlayTimeSeconds += session.durationSeconds || 0;

      // ✅ OPTIMIERT: Rundentempo - Verwende roundDurations Array direkt (Median-optimiert)
      if (session.aggregatedRoundDurationsByPlayer && session.aggregatedRoundDurationsByPlayer[playerId]) {
        const playerRoundData = session.aggregatedRoundDurationsByPlayer[playerId];
        
        // ✅ MEDIAN: Verwende roundDurations Array (falls vorhanden)
        if (playerRoundData.roundDurations && Array.isArray(playerRoundData.roundDurations)) {
          // NEU: Direkt das gespeicherte Array verwenden
          allSessionRoundDurations.push(...playerRoundData.roundDurations);
        } else if (playerRoundData.roundCount > 0) {
          // FALLBACK: Alte Daten ohne roundDurations Array (für Migration-Übergangszeit)
          const avgRoundDuration = playerRoundData.totalDuration / playerRoundData.roundCount;
          for (let i = 0; i < playerRoundData.roundCount; i++) {
            allSessionRoundDurations.push(avgRoundDuration);
          }
        }
      }

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

    // === NEU: Tracking für Differenz-basierte Highlights ===
    const sessionPointsDifference = pointsMade - pointsReceived;
    const sessionMatschDifference = matschMade - matschReceived;
    const sessionStricheDifference = stricheMade - stricheReceived;
    
    if (sessionPointsDifference > (highestPointsDifferenceSession?.value || -Infinity)) {
      highestPointsDifferenceSession = { value: sessionPointsDifference, sessionId: sessionId, date: sessionDate };
    }
    if (sessionPointsDifference < (lowestPointsDifferenceSession?.value || Infinity)) {
      lowestPointsDifferenceSession = { value: sessionPointsDifference, sessionId: sessionId, date: sessionDate };
    }
    
    if (sessionMatschDifference > (highestMatschDifferenceSession?.value || -Infinity)) {
      highestMatschDifferenceSession = { value: sessionMatschDifference, sessionId: sessionId, date: sessionDate };
    }
    if (sessionMatschDifference < (lowestMatschDifferenceSession?.value || Infinity)) {
      lowestMatschDifferenceSession = { value: sessionMatschDifference, sessionId: sessionId, date: sessionDate };
    }

    if (sessionStricheDifference > (highestStricheDifferenceSession?.value || -Infinity)) {
      highestStricheDifferenceSession = { value: sessionStricheDifference, sessionId: sessionId, date: sessionDate };
    }
    if (sessionStricheDifference < (lowestStricheDifferenceSession?.value || Infinity)) {
      lowestStricheDifferenceSession = { value: sessionStricheDifference, sessionId: sessionId, date: sessionDate };
    }
  }

  // --- Final Calculations ---
  stats.totalPointsDifference = stats.totalPointsMade - stats.totalPointsReceived;
  stats.totalStricheDifference = stats.totalStricheMade - stats.totalStricheReceived;

  if (stats.totalGames > 0) {
    // ✅ KORREKTUR: Durchschnittswerte als DIFFERENZ (gemacht - erhalten) / Spiele berechnen
    stats.avgPointsPerGame = (stats.totalPointsMade - stats.totalPointsReceived) / stats.totalGames;
    stats.avgStrichePerGame = (stats.totalStricheMade - stats.totalStricheReceived) / stats.totalGames;
    stats.avgWeisPointsPerGame = stats.playerTotalWeisMade / stats.totalGames; // Weis ist nur "gemacht"
    stats.avgMatschPerGame = (stats.totalMatschEventsMade - stats.totalMatschEventsReceived) / stats.totalGames;
    stats.avgSchneiderPerGame = (stats.totalSchneiderEventsMade - stats.totalSchneiderEventsReceived) / stats.totalGames;
    stats.avgKontermatschPerGame = (stats.totalKontermatschEventsMade - stats.totalKontermatschEventsReceived) / stats.totalGames;
  }
  
  // ✅ MEDIAN: Rundentempo-Berechnung (Median statt Durchschnitt - robuster gegen Ausreißer)
  if (allSessionRoundDurations.length > 0) {
    stats.avgRoundDurationMilliseconds = calculateMedian(allSessionRoundDurations);
  }
  
  // --- Calculate Streaks ---
  calculateAllStreaks(stats, sessionResults, gameResults);

  // --- Finalize Aggregates ---
  partnerData.forEach(p => {
    p.gameWinRate = p.gamesPlayedWith > 0 ? p.gamesWonWith / p.gamesPlayedWith : 0;
    
    // ✅ KORRIGIERT: Session Win Rate für Partner - alle Sessions sind jetzt entschieden (Unentschieden ausgeschlossen)
    p.sessionWinRate = p.sessionsPlayedWith > 0 ? p.sessionsWonWith / p.sessionsPlayedWith : 0;
    
    p.gameWinRateInfo = createWinRateInfo(p.gamesWonWith, p.gamesPlayedWith);
    p.sessionWinRateInfo = createWinRateInfo(p.sessionsWonWith, p.sessionsPlayedWith);
    
    // ✅ NEU: Bilanz-Werte als Differenz berechnen
    p.matschBilanz = (p.matschEventsMadeWith || 0) - (p.matschEventsReceivedWith || 0);
    p.schneiderBilanz = (p.schneiderEventsMadeWith || 0) - (p.schneiderEventsReceivedWith || 0);
    p.kontermatschBilanz = (p.kontermatschEventsMadeWith || 0) - (p.kontermatschEventsReceivedWith || 0);
  });
  opponentData.forEach(o => {
    o.gameWinRate = o.gamesPlayedAgainst > 0 ? o.gamesWonAgainst / o.gamesPlayedAgainst : 0;
    
    // ✅ KORRIGIERT: Session Win Rate für Gegner - alle Sessions sind jetzt entschieden (Unentschieden ausgeschlossen)
    o.sessionWinRate = o.sessionsPlayedAgainst > 0 ? o.sessionsWonAgainst / o.sessionsPlayedAgainst : 0;
    
    o.gameWinRateInfo = createWinRateInfo(o.gamesWonAgainst, o.gamesPlayedAgainst);
    o.sessionWinRateInfo = createWinRateInfo(o.sessionsWonAgainst, o.sessionsPlayedAgainst);
    
    // ✅ NEU: Bilanz-Werte als Differenz berechnen
    o.matschBilanz = (o.matschEventsMadeAgainst || 0) - (o.matschEventsReceivedAgainst || 0);
    o.schneiderBilanz = (o.schneiderEventsMadeAgainst || 0) - (o.schneiderEventsReceivedAgainst || 0);
    o.kontermatschBilanz = (o.kontermatschEventsMadeAgainst || 0) - (o.kontermatschEventsReceivedAgainst || 0);
  });

  // ❌ ENTFERNT: partnerAggregates & opponentAggregates (redundant, Frontend liest aus Subcollections)
  // stats.partnerAggregates = Array.from(partnerData.values());
  // stats.opponentAggregates = Array.from(opponentData.values());

  // --- KRITISCH: Win-Rate Berechnungen hinzufügen ---
  // Session Win Rate: Nur Siege durch (Siege + Niederlagen), Unentschieden werden ignoriert
  const decidedSessions = stats.sessionWins + stats.sessionLosses;
  stats.sessionWinRate = decidedSessions > 0 ? stats.sessionWins / decidedSessions : 0;
  
  // Game Win Rate: Spiele haben normalerweise keine Unentschieden
  stats.gameWinRate = stats.totalGames > 0 ? stats.gameWins / stats.totalGames : 0;

  // --- NEU: Strukturierte Win-Rate Informationen erstellen ---
  stats.sessionWinRateInfo = createWinRateInfo(stats.sessionWins, decidedSessions);
  stats.gameWinRateInfo = createWinRateInfo(stats.gameWins, stats.totalGames);

  // ✅ NEU: Bilanz-Berechnungen (absolute Zahlen analog zu Group-Statistiken)
  stats.matschBilanz = stats.totalMatschEventsMade - stats.totalMatschEventsReceived;
  stats.schneiderBilanz = stats.totalSchneiderEventsMade - stats.totalSchneiderEventsReceived;
  stats.kontermatschBilanz = stats.totalKontermatschEventsMade - stats.totalKontermatschEventsReceived;

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

  // === NEU: Tracking für Differenz-basierte Highlights ===
  stats.highestPointsDifferenceSession = highestPointsDifferenceSession ? {
    type: 'highest_points_difference_session',
    value: highestPointsDifferenceSession.value,
    date: highestPointsDifferenceSession.date,
    relatedId: highestPointsDifferenceSession.sessionId,
    label: 'Höchste Punktdifferenz in einer Partie'
  } : null;
  
  stats.lowestPointsDifferenceSession = lowestPointsDifferenceSession ? {
    type: 'lowest_points_difference_session',
    value: lowestPointsDifferenceSession.value,
    date: lowestPointsDifferenceSession.date,
    relatedId: lowestPointsDifferenceSession.sessionId,
    label: 'Niedrigste Punktdifferenz in einer Partie'
  } : null;
  
  stats.highestMatschDifferenceSession = highestMatschDifferenceSession ? {
    type: 'highest_matsch_difference_session',
    value: highestMatschDifferenceSession.value,
    date: highestMatschDifferenceSession.date,
    relatedId: highestMatschDifferenceSession.sessionId,
    label: 'Höchste Matschdifferenz in einer Partie'
  } : null;
  
  stats.lowestMatschDifferenceSession = lowestMatschDifferenceSession ? {
    type: 'lowest_matsch_difference_session',
    value: lowestMatschDifferenceSession.value,
    date: lowestMatschDifferenceSession.date,
    relatedId: lowestMatschDifferenceSession.sessionId,
    label: 'Niedrigste Matschdifferenz in einer Partie'
  } : null;

  stats.highestStricheDifferenceSession = highestStricheDifferenceSession ? {
    type: 'highest_striche_difference_session',
    value: highestStricheDifferenceSession.value,
    date: highestStricheDifferenceSession.date,
    relatedId: highestStricheDifferenceSession.sessionId,
    label: 'Höchste Strichdifferenz in einer Partie'
  } : null;
  
  stats.lowestStricheDifferenceSession = lowestStricheDifferenceSession ? {
    type: 'lowest_striche_difference_session',
    value: lowestStricheDifferenceSession.value,
    date: lowestStricheDifferenceSession.date,
    relatedId: lowestStricheDifferenceSession.sessionId,
    label: 'Niedrigste Strichdifferenz in einer Partie'
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

  // Game Streaks (extended with Session ID tracking)
  let currentGameWin = 0; let currentGameLoss = 0; let currentGameWinless = 0; let currentGameUndefeated = 0;
  let maxGameWin = 0; let maxGameLoss = 0; let maxGameWinless = 0; let maxGameUndefeated = 0;

  // Track start/end session IDs for game streaks
  let currentGameWinStreakStart: string | null = null;
  let currentGameLossStreakStart: string | null = null;
  let currentGameWinlessStreakStart: string | null = null;
  let currentGameUndefeatedStreakStart: string | null = null;
  
  let maxGameWinStreakStart: string | null = null;
  let maxGameWinStreakEnd: string | null = null;
  let maxGameLossStreakStart: string | null = null;
  let maxGameLossStreakEnd: string | null = null;
  let maxGameWinlessStreakStart: string | null = null;
  let maxGameWinlessStreakEnd: string | null = null;
  let maxGameUndefeatedStreakStart: string | null = null;
  let maxGameUndefeatedStreakEnd: string | null = null;

  let maxGameWinStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxGameWinStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxGameLossStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxGameLossStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxGameWinlessStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxGameWinlessStreakEndDate: admin.firestore.Timestamp | null = null;
  let maxGameUndefeatedStreakStartDate: admin.firestore.Timestamp | null = null;
  let maxGameUndefeatedStreakEndDate: admin.firestore.Timestamp | null = null;

  for (const game of gameResults) {
    if (game.won) {
      // Game Win
      if (currentGameWin === 0) currentGameWinStreakStart = game.sessionId;
      currentGameWin++;
      if (currentGameUndefeated === 0) currentGameUndefeatedStreakStart = game.sessionId;
      currentGameUndefeated++;
      
      // Check if this is a new max game win streak
      if (currentGameWin > maxGameWin) {
        maxGameWin = currentGameWin;
        maxGameWinStreakStart = currentGameWinStreakStart;
        maxGameWinStreakEnd = game.sessionId;
        maxGameWinStreakStartDate = gameResults.find(g => g.sessionId === currentGameWinStreakStart)?.date || game.date;
        maxGameWinStreakEndDate = game.date;
      }
      
      // Check if this is a new max game undefeated streak
      if (currentGameUndefeated > maxGameUndefeated) {
        maxGameUndefeated = currentGameUndefeated;
        maxGameUndefeatedStreakStart = currentGameUndefeatedStreakStart;
        maxGameUndefeatedStreakEnd = game.sessionId;
        maxGameUndefeatedStreakStartDate = gameResults.find(g => g.sessionId === currentGameUndefeatedStreakStart)?.date || game.date;
        maxGameUndefeatedStreakEndDate = game.date;
      }
      
      currentGameLoss = 0;
      currentGameWinless = 0;
      currentGameLossStreakStart = null;
      currentGameWinlessStreakStart = null;
    } else {
      // Game Loss
      if (currentGameLoss === 0) currentGameLossStreakStart = game.sessionId;
      currentGameLoss++;
      if (currentGameWinless === 0) currentGameWinlessStreakStart = game.sessionId;
      currentGameWinless++;
      
      // Check max game loss streak
      if (currentGameLoss > maxGameLoss) {
        maxGameLoss = currentGameLoss;
        maxGameLossStreakStart = currentGameLossStreakStart;
        maxGameLossStreakEnd = game.sessionId;
        maxGameLossStreakStartDate = gameResults.find(g => g.sessionId === currentGameLossStreakStart)?.date || game.date;
        maxGameLossStreakEndDate = game.date;
      }
      
      // Check max game winless streak
      if (currentGameWinless > maxGameWinless) {
        maxGameWinless = currentGameWinless;
        maxGameWinlessStreakStart = currentGameWinlessStreakStart;
        maxGameWinlessStreakEnd = game.sessionId;
        maxGameWinlessStreakStartDate = gameResults.find(g => g.sessionId === currentGameWinlessStreakStart)?.date || game.date;
        maxGameWinlessStreakEndDate = game.date;
      }
      
      currentGameWin = 0;
      currentGameUndefeated = 0;
      currentGameWinStreakStart = null;
      currentGameUndefeatedStreakStart = null;
    }
  }
  
  stats.currentGameWinStreak = currentGameWin;
  stats.currentGameLossStreak = currentGameLoss;
  stats.currentGameWinlessStreak = currentGameWinless;
  stats.currentUndefeatedStreakGames = currentGameUndefeated;
  
  stats.longestWinStreakGames = maxGameWin > 0 ? { 
    value: maxGameWin,
    startDate: maxGameWinStreakStartDate,
    endDate: maxGameWinStreakEndDate,
    startSessionId: maxGameWinStreakStart || undefined,
    endSessionId: maxGameWinStreakEnd || undefined
  } : null;
  
  stats.longestLossStreakGames = maxGameLoss > 0 ? { 
    value: maxGameLoss,
    startDate: maxGameLossStreakStartDate,
    endDate: maxGameLossStreakEndDate,
    startSessionId: maxGameLossStreakStart || undefined,
    endSessionId: maxGameLossStreakEnd || undefined
  } : null;
  
  stats.longestWinlessStreakGames = maxGameWinless > 0 ? { 
    value: maxGameWinless,
    startDate: maxGameWinlessStreakStartDate,
    endDate: maxGameWinlessStreakEndDate,
    startSessionId: maxGameWinlessStreakStart || undefined,
    endSessionId: maxGameWinlessStreakEnd || undefined
  } : null;
  
  stats.longestUndefeatedStreakGames = maxGameUndefeated > 0 ? { 
    value: maxGameUndefeated,
    startDate: maxGameUndefeatedStreakStartDate,
    endDate: maxGameUndefeatedStreakEndDate,
    startSessionId: maxGameUndefeatedStreakStart || undefined,
    endSessionId: maxGameUndefeatedStreakEnd || undefined
  } : null;
}

// =================================================================================================
// === PUBLIC EXPORTED FUNCTION                                                                 ===
// =================================================================================================

/**
 * Fetches all necessary data for a player, recalculates their stats from scratch,
 * and saves the new stats document to Firestore.
 * This is the main entry point for updating a single player's statistics.
 * 
 * ✅ UPDATED: Jetzt mit korrigierten Durchschnittsberechnungen und Rundentempo
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
    // 🚀 NEUE ARCHITEKTUR: Sessions aus allen Gruppen des Spielers sammeln
    logger.info(`[PlayerStats] 📊 Fetching sessions from NEW structure for player ${playerId}`);
    
    // Hole Player-Dokument um Gruppen zu finden
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (!playerDoc.exists) {
      logger.warn(`[PlayerStats] Player document ${playerId} not found`);
      return;
    }
    
    const playerData = playerDoc.data();
    const groupIds = playerData?.groupIds || [];
    
    logger.info(`[PlayerStats] Player ${playerId} is member of ${groupIds.length} groups`);
    
    // Sammle Sessions aus allen Gruppen
    const allPlayerSessions: SessionSummary[] = [];
    
    for (const groupId of groupIds) {
      try {
        const groupSessionsSnapshot = await db
          .collection(`groups/${groupId}/jassGameSummaries`)
          .where("participantPlayerIds", "array-contains", playerId)
          .where("status", "==", "completed")
          .get();
        
        logger.info(`[PlayerStats] Found ${groupSessionsSnapshot.size} sessions in group ${groupId}`);
        
        groupSessionsSnapshot.docs.forEach(doc => {
          allPlayerSessions.push({ ...doc.data(), sessionId: doc.id } as SessionSummary);
        });
      } catch (error) {
        logger.error(`[PlayerStats] Error fetching sessions from group ${groupId}:`, error);
      }
    }

    logger.info(`[PlayerStats] Total sessions found: ${allPlayerSessions.length} for player ${playerId}.`);

    // Calculate the new stats using the internal logic.
    const newStats = await calculatePlayerStatisticsInternal(playerId, allPlayerSessions);

    // NEU: Lade den Spielernamen aus der players Collection
    try {
      const playerDoc = await db.collection('players').doc(playerId).get();
      if (playerDoc.exists) {
        const playerData = playerDoc.data();
        newStats.playerName = playerData?.displayName || null;
        logger.info(`[PlayerStats] Loaded player name for ${playerId}: ${newStats.playerName}`);
      } else {
        logger.warn(`[PlayerStats] Player document ${playerId} not found, playerName will be null`);
        newStats.playerName = null;
      }
    } catch (nameError) {
      logger.error(`[PlayerStats] Error loading player name for ${playerId}:`, nameError);
      newStats.playerName = null; // Fallback to null if name loading fails
    }

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