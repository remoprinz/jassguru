import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PlayerComputedStats, initialPlayerComputedStats, TournamentPlacement, StatHighlight } from "./models/player-stats.model";
import { TournamentGameData as TournamentGameDataOriginal, TournamentDocData } from "./finalizeTournament";
import { 
  CurrentSessionData, 
  CurrentCompletedGameData,
  extractPlayerUidsFromSession,
  getPlayerSessionOutcome,
  getPlayerGameOutcome,
  validateSessionData,
  validateCompletedGameData
} from "./utils/dataExtractionUtils";

const db = admin.firestore();

// Konstanten für Collections
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const TOURNAMENTS_COLLECTION = 'tournaments';
const TOURNAMENT_GAMES_SUBCOLLECTION = 'games';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

// Interface für Turnierspiele (erweitert das Original um gameDocId)
interface TournamentGameData extends TournamentGameDataOriginal {
  gameDocId?: string;
  timestampCompleted?: admin.firestore.Timestamp;
  durationMillis?: number;
}

// Event-Typen für die chronologische Verarbeitung
interface EventBase {
  timestamp: admin.firestore.Timestamp;
  type: string;
  sourceId: string;
}

interface RegularGameEvent extends EventBase {
  type: 'REGULAR_GAME';
  data: CurrentCompletedGameData;
  sessionData: CurrentSessionData;
  sessionId: string;
}

interface SessionEndEvent extends EventBase {
  type: 'SESSION_END';
  data: CurrentSessionData;
}

interface TournamentGameEvent extends EventBase {
  type: 'TOURNAMENT_GAME';
  data: TournamentGameData;
  tournamentId: string;
}

interface TournamentEndEvent extends EventBase {
  type: 'TOURNAMENT_END';
  data: TournamentDocData;
  playerRank?: number;
  totalRankedParticipants?: number;
  playerTeamName?: string;
}

type PlayerEvent = RegularGameEvent | SessionEndEvent | TournamentGameEvent | TournamentEndEvent;

export const recalculateAllPlayerStatistics = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request: CallableRequest<void>) => {
    logger.info("--- recalculateAllPlayerStatistics START ---", { auth: request.auth?.uid });

    if (!request.auth || !request.auth.uid) {
      logger.error("User is not authenticated to run recalculateAllPlayerStatistics.");
      throw new HttpsError("unauthenticated", "User is not authenticated.");
    }

    // Admin-Check
    try {
      const adminUser = await admin.auth().getUser(request.auth.uid);
      if (!adminUser.customClaims?.admin) {
        logger.error(`User ${request.auth.uid} is not authorized as admin to run recalculateAllPlayerStatistics.`);
        throw new HttpsError("permission-denied", "User is not an admin.");
      }
      logger.info(`Admin user ${request.auth.uid} authorized.`);
    } catch (error) {
      logger.error("Error verifying admin status:", error);
      throw new HttpsError("internal", "Error verifying admin status.", (error as Error).message);
    }

    try {
      const allPlayerUids = new Set<string>();

      // Sammle alle Spieler-UIDs aus JassGameSummaries
      const summariesSnapshot = await db.collection(JASS_SUMMARIES_COLLECTION).get();
      for (const summaryDoc of summariesSnapshot.docs) {
        const summaryData = summaryDoc.data();
        
        if (validateSessionData(summaryData)) {
          const playerUids = extractPlayerUidsFromSession(summaryData);
          playerUids.forEach(uid => allPlayerUids.add(uid));
        }
      }

      // Sammle alle Spieler-UIDs aus Turnieren
      const tournamentsSnapshot = await db.collection(TOURNAMENTS_COLLECTION).get();
      for (const tournamentDoc of tournamentsSnapshot.docs) {
        const tournamentData = tournamentDoc.data() as TournamentDocData;
        
        tournamentData?.playerUids?.forEach((uid: string) => allPlayerUids.add(uid));
        
        if (tournamentData?.teams) {
          tournamentData.teams.forEach((team: any) => 
            team.playerUids.forEach((uid: string) => allPlayerUids.add(uid))
          );
        }
        
        if (tournamentData?.groups) {
          tournamentData.groups.forEach((group: any) => 
            group.playerUids.forEach((uid: string) => allPlayerUids.add(uid))
          );
        }
      }

      const uniquePlayerUidsArray = Array.from(allPlayerUids);
      logger.info(`Found ${uniquePlayerUidsArray.length} unique player UIDs to process.`);
      
      if (uniquePlayerUidsArray.length === 0) {
        logger.info("No players found with game or tournament activity. Exiting recalculation.");
        return { success: true, message: "Keine Spieler mit Spiel- oder Turnieraktivitäten gefunden." };
      }

      // Verarbeitung pro Spieler
      for (const playerId of uniquePlayerUidsArray) {
        logger.info(`Recalculating stats for player: ${playerId}`);
        
        const stats: PlayerComputedStats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
        stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();

        const playerEvents: PlayerEvent[] = [];

        // Sammle reguläre Spiele und Session-Abschlüsse
        for (const summaryDoc of summariesSnapshot.docs) {
          const summaryData = summaryDoc.data();
          
          if (!validateSessionData(summaryData)) {
            logger.warn(`Invalid session data structure for ${summaryDoc.id}, skipping.`);
            continue;
          }

          const sessionPlayerUids = extractPlayerUidsFromSession(summaryData);
          
          if (sessionPlayerUids.includes(playerId)) {
            // Session-End Event hinzufügen (wenn abgeschlossen)
            if (summaryData.status === 'completed' && summaryData.endedAt) {
              playerEvents.push({
                type: 'SESSION_END',
                timestamp: summaryData.endedAt,
                sourceId: summaryDoc.id,
                data: summaryData,
              });
            }

            // Einzelne Spiele sammeln
            const completedGamesSnapshot = await summaryDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).get();
            for (const gameDoc of completedGamesSnapshot.docs) {
              const gameData = gameDoc.data();
              
              if (!validateCompletedGameData(gameData)) {
                logger.warn(`Invalid game data structure for ${gameDoc.id} in session ${summaryDoc.id}, skipping.`);
                continue;
              }

              // Verwende endedAt der Session als Timestamp für das Spiel (falls kein spezifischer Timestamp vorhanden)
              const gameTimestamp = summaryData.endedAt || admin.firestore.Timestamp.now();
              
              playerEvents.push({
                type: 'REGULAR_GAME',
                timestamp: gameTimestamp,
                sourceId: gameDoc.id,
                sessionId: summaryDoc.id,
                data: gameData,
                sessionData: summaryData,
              });
            }
          }
        }

        // Sammle Turnierspiele und Turnier-Abschlüsse
        for (const tournamentDoc of tournamentsSnapshot.docs) {
          const tournamentData = tournamentDoc.data() as TournamentDocData;
          const tournamentId = tournamentDoc.id;
          let playerParticipatedInTournament = false;

          // Prüfe ob Spieler am Turnier teilgenommen hat
          if (tournamentData.playerUids?.includes(playerId)) playerParticipatedInTournament = true;
          if (!playerParticipatedInTournament && tournamentData.teams?.some((team: any) => team.playerUids.includes(playerId))) playerParticipatedInTournament = true;
          if (!playerParticipatedInTournament && tournamentData.groups?.some((group: any) => group.playerUids.includes(playerId))) playerParticipatedInTournament = true;

          if (playerParticipatedInTournament) {
            // Turnier-End Event
            if (tournamentData.status === 'completed' && tournamentData.finalizedAt) {
              // Lade Ranking-Daten für diesen Spieler
              const playerRankingRef = db.collection(TOURNAMENTS_COLLECTION).doc(tournamentId).collection("playerRankings").doc(playerId);
              const playerRankingSnap = await playerRankingRef.get();

              let playerRank: number | undefined;
              let totalParticipants: number | undefined;
              let playerTeamName: string | undefined;

              if (playerRankingSnap.exists) {
                const rankingData = playerRankingSnap.data();
                playerRank = rankingData?.rank;
                totalParticipants = rankingData?.totalRankedEntities;
                playerTeamName = rankingData?.teamName;
              }

              playerEvents.push({
                type: 'TOURNAMENT_END',
                timestamp: tournamentData.finalizedAt,
                sourceId: tournamentId,
                data: tournamentData,
                playerRank,
                totalRankedParticipants: totalParticipants,
                playerTeamName,
              });
            }

            // Turnierspiele sammeln
            const tournamentGamesSnapshot = await tournamentDoc.ref.collection(TOURNAMENT_GAMES_SUBCOLLECTION)
              .where("status", "==", "completed").get();
            
            for (const gameDoc of tournamentGamesSnapshot.docs) {
              const gameData = gameDoc.data() as TournamentGameData;
              
              const playerInThisTournamentGame = gameData.participantUids?.includes(playerId) ||
                                               gameData.teams?.top?.playerUids?.includes(playerId) ||
                                               gameData.teams?.bottom?.playerUids?.includes(playerId);
              
              if (playerInThisTournamentGame && gameData.timestampCompleted) {
                playerEvents.push({
                  type: 'TOURNAMENT_GAME',
                  timestamp: gameData.timestampCompleted,
                  sourceId: gameDoc.id,
                  tournamentId: tournamentId,
                  data: { ...gameData, gameDocId: gameDoc.id },
                });
              }
            }
          }
        }

        // Events chronologisch sortieren
        playerEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

        logger.info(`Player ${playerId}: Collected ${playerEvents.length} events. Starting processing...`);

        if (playerEvents.length > 0) {
          stats.firstJassTimestamp = playerEvents[0].timestamp;
          stats.lastJassTimestamp = playerEvents[playerEvents.length - 1].timestamp;
        } else {
          stats.firstJassTimestamp = null;
          stats.lastJassTimestamp = null;
        }

        // Events verarbeiten
        for (const event of playerEvents) {
          switch (event.type) {
            case 'REGULAR_GAME': {
              const gameOutcome = getPlayerGameOutcome(playerId, event.data, event.sessionData);
              
              stats.totalGames = (stats.totalGames || 0) + 1;
              stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + ((event.data.durationMillis || 0) / 1000);

              if (gameOutcome.result === 'win') stats.gameWins = (stats.gameWins || 0) + 1;
              else if (gameOutcome.result === 'loss') stats.gameLosses = (stats.gameLosses || 0) + 1;

              stats.totalPointsMade = (stats.totalPointsMade || 0) + gameOutcome.pointsMade;
              stats.totalPointsReceived = (stats.totalPointsReceived || 0) + gameOutcome.pointsReceived;
              stats.totalStricheMade = (stats.totalStricheMade || 0) + gameOutcome.stricheMade;
              stats.totalStricheReceived = (stats.totalStricheReceived || 0) + gameOutcome.stricheReceived;
              stats.playerTotalWeisMade = (stats.playerTotalWeisMade || 0) + gameOutcome.weisMade;

              // Game-Highlights aktualisieren
              updateGameHighlights(stats, gameOutcome, event.timestamp, event.sourceId);
              
              // Game-Streaks aktualisieren
              updateGameStreaks(stats, gameOutcome.result, event.timestamp);
              break;
            }
            
            case 'SESSION_END': {
              const sessionOutcome = getPlayerSessionOutcome(playerId, event.data);
              
              stats.totalSessions = (stats.totalSessions || 0) + 1;
              if (sessionOutcome.result === 'win') stats.sessionWins = (stats.sessionWins || 0) + 1;
              else if (sessionOutcome.result === 'loss') stats.sessionLosses = (stats.sessionLosses || 0) + 1;
              else if (sessionOutcome.result === 'tie') stats.sessionTies = (stats.sessionTies || 0) + 1;

              // Session-Highlights aktualisieren
              updateSessionHighlights(stats, sessionOutcome, event.data, event.timestamp);
              
              // Session-Streaks aktualisieren
              updateSessionStreaks(stats, sessionOutcome.result, event.timestamp);
              break;
            }
            
            case 'TOURNAMENT_GAME': {
              // Turnierspiele werden wie reguläre Spiele behandelt, aber mit Tournament-Flag
              const tgData = event.data;
              
              stats.totalTournamentGamesPlayed = (stats.totalTournamentGamesPlayed || 0) + 1;
              stats.totalGames = (stats.totalGames || 0) + 1;
              stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + ((tgData.durationMillis || 0) / 1000);

              // Vereinfachte Outcome-Berechnung für Turnierspiele
              const playerTeam = tgData.teams?.top?.playerUids?.includes(playerId) ? 'top' :
                               (tgData.teams?.bottom?.playerUids?.includes(playerId) ? 'bottom' : null);
              
              if (playerTeam) {
                const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
                const pointsMade = tgData.finalScores[playerTeam] || 0;
                const pointsReceived = tgData.finalScores[opponentTeam] || 0;
                
                if (pointsMade > pointsReceived) stats.gameWins = (stats.gameWins || 0) + 1;
                else if (pointsReceived > pointsMade) stats.gameLosses = (stats.gameLosses || 0) + 1;

                stats.totalPointsMade = (stats.totalPointsMade || 0) + pointsMade;
                stats.totalPointsReceived = (stats.totalPointsReceived || 0) + pointsReceived;
                
                // Striche-Berechnung für Turnierspiele
                if (tgData.finalStriche) {
                  const stricheMade = calculateStricheValue(tgData.finalStriche[playerTeam]);
                  const stricheReceived = calculateStricheValue(tgData.finalStriche[opponentTeam]);
                  
                  stats.totalStricheMade = (stats.totalStricheMade || 0) + stricheMade;
                  stats.totalStricheReceived = (stats.totalStricheReceived || 0) + stricheReceived;
                }

                // Tournament Game Highlights
                const tournamentGameOutcome = {
                  result: pointsMade > pointsReceived ? 'win' as const : (pointsReceived > pointsMade ? 'loss' as const : 'unknown' as const),
                  pointsMade,
                  pointsReceived,
                  stricheMade: tgData.finalStriche ? calculateStricheValue(tgData.finalStriche[playerTeam]) : 0,
                  stricheReceived: tgData.finalStriche ? calculateStricheValue(tgData.finalStriche[opponentTeam]) : 0,
                };
                
                updateGameHighlights(stats, tournamentGameOutcome, event.timestamp, event.sourceId);
                updateGameStreaks(stats, tournamentGameOutcome.result, event.timestamp);
              }
              break;
            }
            
            case 'TOURNAMENT_END': {
              const teData = event.data;
              stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;
              
              const tournamentName = teData.name || "Unbenanntes Turnier";
              const playerRank = event.playerRank;
              const totalParticipants = event.totalRankedParticipants;
              const teamNameSuffix = event.playerTeamName ? ` (Team: ${event.playerTeamName})` : "";

              if (playerRank && totalParticipants) {
                if (playerRank === 1) {
                  stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                }
                
                const currentPlacement: TournamentPlacement = {
                  tournamentId: event.sourceId,
                  tournamentName: `${tournamentName}${teamNameSuffix}`,
                  rank: playerRank,
                  totalParticipants: totalParticipants,
                  totalRankedEntities: totalParticipants,
                  date: event.timestamp,
                  highlights: [],
                };
                
                if (!stats.bestTournamentPlacement || playerRank < stats.bestTournamentPlacement.rank) {
                  stats.bestTournamentPlacement = currentPlacement;
                }
                
                stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20);

                // Tournament-Highlight hinzufügen
                const highlightLabel = playerRank === 1 ? 
                  `Turniersieg: ${tournamentName}${teamNameSuffix}` : 
                  `Turnierteilnahme: ${tournamentName}${teamNameSuffix} (Rang ${playerRank})`;
                
                const tournamentHighlight: StatHighlight = {
                  type: playerRank === 1 ? "tournament_win" : "tournament_participation",
                  value: playerRank,
                  stringValue: event.playerTeamName,
                  date: event.timestamp,
                  relatedId: event.sourceId,
                  label: highlightLabel,
                };
                
                stats.highlights = [tournamentHighlight, ...(stats.highlights || [])].slice(0, 50);
              }
              break;
            }
          }
        }

        // Berechnete Felder aktualisieren
        stats.totalPointsDifference = (stats.totalPointsMade || 0) - (stats.totalPointsReceived || 0);
        stats.totalStricheDifference = (stats.totalStricheMade || 0) - (stats.totalStricheReceived || 0);
        
        if (stats.totalGames && stats.totalGames > 0) {
          stats.avgPointsPerGame = (stats.totalPointsMade || 0) / stats.totalGames;
        }

        // Statistiken speichern
        const playerStatsRef = db.collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(playerId);
        await playerStatsRef.set(stats, { merge: true });
        
        logger.info(`✅ Player ${playerId}: Stats recalculated and saved successfully.`);
      }

      logger.info("--- recalculateAllPlayerStatistics SUCCESS ---");
      return { 
        success: true, 
        message: `Statistiken für ${uniquePlayerUidsArray.length} Spieler erfolgreich neu berechnet.` 
      };
    } catch (error: unknown) {
      logger.error("--- recalculateAllPlayerStatistics CRITICAL ERROR ---", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpsError("internal", "Failed to recalculate player statistics.", errorMessage);
    }
  }
);

// Hilfsfunktionen
function calculateStricheValue(stricheRecord: any): number {
  if (!stricheRecord) return 0;
  return (stricheRecord.berg || 0) +
         (stricheRecord.sieg || 0) +
         (stricheRecord.matsch || 0) +
         (stricheRecord.schneider || 0) +
         (stricheRecord.kontermatsch || 0);
}

function updateGameHighlights(
  stats: PlayerComputedStats, 
  outcome: any, 
  timestamp: admin.firestore.Timestamp, 
  gameId: string
) {
  // Vereinfachte Highlight-Logik
  if (outcome.pointsMade > (stats.highestPointsGame?.value || 0)) {
    stats.highestPointsGame = {
      type: "highest_points_single_game",
      value: outcome.pointsMade,
      date: timestamp,
      relatedId: gameId,
      label: `Höchste Punkte in einem Spiel: ${outcome.pointsMade}`,
    };
  }
}

function updateGameStreaks(
  stats: PlayerComputedStats, 
  result: 'win' | 'loss' | 'unknown', 
  timestamp: admin.firestore.Timestamp
) {
  // Vereinfachte Streak-Logik - verwende nur die verfügbaren Felder
  if (result === 'win') {
    stats.currentGameWinStreak = (stats.currentGameWinStreak || 0) + 1;
    stats.currentGameLossStreak = 0;
  } else if (result === 'loss') {
    stats.currentGameLossStreak = (stats.currentGameLossStreak || 0) + 1;
    stats.currentGameWinStreak = 0;
  }
}

function updateSessionHighlights(
  stats: PlayerComputedStats, 
  outcome: any, 
  sessionData: CurrentSessionData, 
  timestamp: admin.firestore.Timestamp
) {
  // Vereinfachte Session-Highlight-Logik
  if (outcome.pointsMade > (stats.highestPointsSession?.value || 0)) {
    stats.highestPointsSession = {
      type: "highest_points_session",
      value: outcome.pointsMade,
      date: timestamp,
      relatedId: sessionData.groupId || 'unknown',
      label: `Höchste Punkte in einer Session: ${outcome.pointsMade}`,
    };
  }
}

function updateSessionStreaks(
  stats: PlayerComputedStats, 
  result: 'win' | 'loss' | 'tie', 
  timestamp: admin.firestore.Timestamp
) {
  // Vereinfachte Session-Streak-Logik - verwende nur die verfügbaren Felder
  if (result === 'win') {
    stats.currentSessionWinStreak = (stats.currentSessionWinStreak || 0) + 1;
    stats.currentSessionLossStreak = 0;
  } else if (result === 'loss') {
    stats.currentSessionLossStreak = (stats.currentSessionLossStreak || 0) + 1;
    stats.currentSessionWinStreak = 0;
  }
} 