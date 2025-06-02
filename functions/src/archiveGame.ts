import { onDocumentCreated, FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore"; // Geändert für v2 Syntax
import * as logger from "firebase-functions/logger"; // v2 Logger
import * as admin from "firebase-admin";
import { PlayerComputedStats, initialPlayerComputedStats } from "./models/player-stats.model"; // StatHighlight und StatStreak entfernt
// Konstanten direkt definieren, da dynamischer Import problematisch sein kann
const ACTIVE_GAMES_COLLECTION = 'activeGames';
// const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries'; // Nicht mehr direkt hier verwendet
// const JASS_SESSIONS_COLLECTION = 'jassSessions'; // Auskommentiert
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

const db = admin.firestore();

export interface PlayerNames {
  [key: number]: string;
}

export interface RoundEntry {
  id: string;
  timestamp: number;
  roundId: number;
  startingPlayer: number;
  weisPoints: { top: number; bottom: number };
  jassPoints: { top: number; bottom: number };
  scores: { top: number; bottom: number };
  currentPlayer: number;
  isActive?: boolean;
  // Weitere mögliche Felder, die in RoundEntry vorkommen können
  farbe?: string;
  cardStyle?: string;
  strichInfo?: { team: string; type: string };
  weisActions?: { position: string; points: number }[];
  visualStriche?: { 
    top: { stricheCounts: Record<string, number>; restZahl: number }; 
    bottom: { stricheCounts: Record<string, number>; restZahl: number }; 
  };
  previousRoundId?: number;
  nextRoundId?: number;
  ansager?: number;
  startTime?: number;
  endTime?: number;
  playerTurns?: {
    player: number;
    startTime: number;
    endTime: number;
  }[];
  roundState?: {
    roundNumber: number;
    nextPlayer: number;
  };
  striche?: Record<string, unknown>;
  timerSnapshot?: Record<string, unknown>;
  actionType?: string;
  isRoundFinalized?: boolean;
  isCompleted?: boolean;
}

export interface CompletedGameData {
  gameNumber: number;
  activeGameId: string;
  timestampCompleted: admin.firestore.Timestamp;
  durationMillis: number;
  finalScores: { top: number; bottom: number };
  finalStriche: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  weisPoints: { top: number; bottom: number };
  startingPlayer: number;
  initialStartingPlayer: number;
  playerNames: PlayerNames;
  trumpColorsPlayed: string[];
  roundHistory: RoundEntry[]; // Type korrigiert
  participantUids: string[];
  groupId: string | null;
  teams: {
    top: { playerUids: string[]; }; // Nur UIDs hier, Punkte etc. aus finalScores
    bottom: { playerUids: string[]; };
  };
  winnerTeam?: 'top' | 'bottom' | 'draw'; // Wer hat dieses Spiel gewonnen?
}

// Hilfsfunktion: Summiert die Striche für ein Team aus dem finalStriche Objekt
const calculateTotalTeamStricheValue = (stricheObj: CompletedGameData['finalStriche']['top'] | undefined): number => {
  if (!stricheObj) return 0;
  return (stricheObj.berg || 0) + (stricheObj.sieg || 0) + (stricheObj.matsch || 0) + (stricheObj.schneider || 0) + (stricheObj.kontermatsch || 0);
};

function getPlayerGameOutcome(userId: string, gameData: CompletedGameData): {
  result: 'win' | 'loss' | 'draw' | 'unknown';
  pointsMade: number;
  pointsReceived: number;
  stricheMade: number;
  stricheReceived: number;
  weisMade: number;
  isMatschGame: boolean;
  isSchneiderGame: boolean;
  isKontermatschMade: boolean;
  isKontermatschReceived: boolean;
  playerTeamKey: 'top' | 'bottom' | null;
  opponentTeamKey: 'top' | 'bottom' | null;
} {
  let playerTeamKey: 'top' | 'bottom' | null = null;
  let opponentTeamKey: 'top' | 'bottom' | null = null;
  let isMatschGame = false;
  let isSchneiderGame = false;
  let isKontermatschMade = false;
  let isKontermatschReceived = false;

  if (gameData.teams?.bottom?.playerUids?.includes(userId)) {
    playerTeamKey = 'bottom';
    opponentTeamKey = 'top';
  } else if (gameData.teams?.top?.playerUids?.includes(userId)) {
    playerTeamKey = 'top';
    opponentTeamKey = 'bottom';
  }

  if (!playerTeamKey || !opponentTeamKey) {
    logger.warn(`[getPlayerGameOutcome] Could not determine team for player ${userId} in game ${gameData.activeGameId}. UIDs in teams: Top[${gameData.teams?.top?.playerUids?.join(",")}], Bottom[${gameData.teams?.bottom?.playerUids?.join(",")}]`);
    return { result: 'unknown', pointsMade: 0, pointsReceived: 0, stricheMade: 0, stricheReceived: 0, weisMade: 0, isMatschGame: false, isSchneiderGame: false, isKontermatschMade: false, isKontermatschReceived: false, playerTeamKey: null, opponentTeamKey: null };
  }

  const pointsMade = gameData.finalScores[playerTeamKey] || 0;
  const pointsReceived = gameData.finalScores[opponentTeamKey] || 0;
  const weisMade = gameData.weisPoints[playerTeamKey] || 0;
  
  const stricheMade = calculateTotalTeamStricheValue(gameData.finalStriche[playerTeamKey]);
  const stricheReceived = calculateTotalTeamStricheValue(gameData.finalStriche[opponentTeamKey]);

  // NEU: Überprüfen, ob es ein Matsch- oder Schneider-Spiel für das Team des Spielers war
  if (gameData.finalStriche[playerTeamKey]?.matsch > 0) {
    isMatschGame = true;
  }
  if (gameData.finalStriche[playerTeamKey]?.schneider > 0) {
    isSchneiderGame = true;
  }
  // NEU: Überprüfen auf Kontermatsch
  if (gameData.finalStriche[playerTeamKey]?.kontermatsch > 0) {
    isKontermatschMade = true;
  }
  if (gameData.finalStriche[opponentTeamKey]?.kontermatsch > 0) { // Kontermatsch vom Gegner erlitten
    isKontermatschReceived = true;
  }

  let result: 'win' | 'loss' | 'draw' = 'loss'; 
  if (gameData.winnerTeam === playerTeamKey) {
    result = 'win';
  } else if (gameData.winnerTeam === 'draw') {
    result = 'draw';
  } else if (gameData.winnerTeam === opponentTeamKey) {
    result = 'loss';
  } else { // Fallback, wenn winnerTeam nicht gesetzt ist oder unerwarteten Wert hat
    if (pointsMade > pointsReceived) result = 'win';
    else if (pointsMade < pointsReceived) result = 'loss';
    else result = 'draw'; // Unentschieden nach Punkten, wenn kein klarer Sieger
  }

  return { result, pointsMade, pointsReceived, stricheMade, stricheReceived, weisMade, isMatschGame, isSchneiderGame, isKontermatschMade, isKontermatschReceived, playerTeamKey, opponentTeamKey };
}

async function updateUserStatsAfterGameCompletion(
  db: admin.firestore.Firestore,
  playerUids: string[],
  gameData: CompletedGameData,
  gameDocId: string, 
) {
  const now = admin.firestore.Timestamp.now();
  const gameTimestamp = gameData.timestampCompleted || now;

  for (const userId of playerUids) {
    const playerStatsRef = db.collection("playerComputedStats").doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const playerStatsDoc = await transaction.get(playerStatsRef);
        let stats: PlayerComputedStats;

        if (!playerStatsDoc.exists) {
          stats = JSON.parse(JSON.stringify(initialPlayerComputedStats)); 
          stats.firstJassTimestamp = gameTimestamp;
          stats.lastJassTimestamp = gameTimestamp;
          stats.lastUpdateTimestamp = now;
        } else {
          stats = playerStatsDoc.data() as PlayerComputedStats;
          if (!stats.firstJassTimestamp || stats.firstJassTimestamp.toMillis() > gameTimestamp.toMillis()) {
            stats.firstJassTimestamp = gameTimestamp;
          }
          if (!stats.lastJassTimestamp || stats.lastJassTimestamp.toMillis() < gameTimestamp.toMillis()) {
            stats.lastJassTimestamp = gameTimestamp;
          }
          stats.lastUpdateTimestamp = now;
        }

        stats.totalGames = (stats.totalGames || 0) + 1;
        stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + (gameData.durationMillis ? gameData.durationMillis / 1000 : 0);

        const outcome = getPlayerGameOutcome(userId, gameData);

        if (outcome.result === 'win') stats.gameWins = (stats.gameWins || 0) + 1;
        else if (outcome.result === 'loss') stats.gameLosses = (stats.gameLosses || 0) + 1;

        stats.totalPointsMade = (stats.totalPointsMade || 0) + outcome.pointsMade;
        stats.totalPointsReceived = (stats.totalPointsReceived || 0) + outcome.pointsReceived;
        stats.totalPointsDifference = stats.totalPointsMade - stats.totalPointsReceived;

        stats.totalStricheMade = (stats.totalStricheMade || 0) + outcome.stricheMade;
        stats.totalStricheReceived = (stats.totalStricheReceived || 0) + outcome.stricheReceived;
        stats.totalStricheDifference = stats.totalStricheMade - stats.totalStricheReceived;
        
        const totalWeisPlayer = (stats.playerTotalWeisMade || 0) + outcome.weisMade;
        stats.playerTotalWeisMade = totalWeisPlayer;
        stats.avgWeisPointsPerGame = stats.totalGames > 0 ? totalWeisPlayer / stats.totalGames : 0;

        // NEU: Matsch- und Schneider-Zähler aktualisieren
        if (outcome.isMatschGame) {
          stats.totalMatschGamesMade = (stats.totalMatschGamesMade || 0) + 1;
        }
        if (outcome.isSchneiderGame) {
          stats.totalSchneiderGamesMade = (stats.totalSchneiderGamesMade || 0) + 1;
        }

        // NEU: Kontermatsch-Zähler und Durchschnitt aktualisieren
        if (outcome.isKontermatschMade) {
          stats.totalKontermatschGamesMade = (stats.totalKontermatschGamesMade || 0) + 1;
        }
        if (outcome.isKontermatschReceived) {
          stats.totalKontermatschGamesReceived = (stats.totalKontermatschGamesReceived || 0) + 1;
        }
        stats.avgKontermatschPerGame = stats.totalGames > 0 ? (stats.totalKontermatschGamesMade || 0) / stats.totalGames : 0;

        if (stats.totalGames > 0) {
          stats.avgPointsPerGame = stats.totalPointsMade / stats.totalGames;
          stats.avgStrichePerGame = stats.totalStricheMade / stats.totalGames;
          // TODO: avgMatschPerGame, avgSchneiderPerGame (benötigt Zähler für Matsch/Schneider in gameData oder eine komplexere Auswertung von finalStriche)
          // NEU: Durchschnittswerte für Matsch und Schneider berechnen
          stats.avgMatschPerGame = stats.totalGames > 0 ? (stats.totalMatschGamesMade || 0) / stats.totalGames : 0;
          stats.avgSchneiderPerGame = stats.totalGames > 0 ? (stats.totalSchneiderGamesMade || 0) / stats.totalGames : 0;
        }

        if (!stats.highestPointsGame || outcome.pointsMade > (stats.highestPointsGame.value as number)) {
          stats.highestPointsGame = { type: "highest_points_game", label: "Höchste Punktzahl Spiel", value: outcome.pointsMade, date: gameTimestamp, relatedId: gameDocId };
        }
        
        if (!stats.lowestPointsGame || outcome.pointsMade < (stats.lowestPointsGame.value as number)) {
          stats.lowestPointsGame = { type: "lowest_points_game", label: "Tiefste Punktzahl Spiel", value: outcome.pointsMade, date: gameTimestamp, relatedId: gameDocId };
        }
        if (!stats.highestStricheGame || outcome.stricheMade > (stats.highestStricheGame.value as number)) {
          stats.highestStricheGame = { type: "highest_striche_game", label: "Höchste Striche Spiel", value: outcome.stricheMade, date: gameTimestamp, relatedId: gameDocId };
        }
        if (!stats.highestStricheReceivedGame || outcome.stricheReceived > (stats.highestStricheReceivedGame.value as number)) {
          stats.highestStricheReceivedGame = { type: "highest_striche_received_game", label: "Max Striche erhalten Spiel", value: outcome.stricheReceived, date: gameTimestamp, relatedId: gameDocId };
        }
        if (!stats.mostWeisPointsGame || outcome.weisMade > (stats.mostWeisPointsGame.value as number)) {
          stats.mostWeisPointsGame = { type: "most_weis_points_game", label: "Meiste Weispunkte Spiel", value: outcome.weisMade, date: gameTimestamp, relatedId: gameDocId };
        }

        // NEU: Kontermatsch Highlights/Lowlights (Spiel-Ebene)
        const kontermatschMadeValue = gameData.finalStriche[outcome.playerTeamKey!]?.kontermatsch || 0;
        if (kontermatschMadeValue > 0 && (!stats.mostKontermatschMadeGame || kontermatschMadeValue > (stats.mostKontermatschMadeGame.value as number))) {
            stats.mostKontermatschMadeGame = { type: "most_kontermatsch_made_game", label: "Meiste Kontermatsch gemacht Spiel", value: kontermatschMadeValue, date: gameTimestamp, relatedId: gameDocId };
        }
        const kontermatschReceivedValue = gameData.finalStriche[outcome.opponentTeamKey!]?.kontermatsch || 0;
        if (kontermatschReceivedValue > 0 && (!stats.mostKontermatschReceivedGame || kontermatschReceivedValue > (stats.mostKontermatschReceivedGame.value as number))) {
            stats.mostKontermatschReceivedGame = { type: "most_kontermatsch_received_game", label: "Meiste Kontermatsch erhalten Spiel", value: kontermatschReceivedValue, date: gameTimestamp, relatedId: gameDocId };
        }

        // NEU: Streak-Logik für Spiele
        if (outcome.result === 'win') {
          stats.currentGameWinStreak = (stats.currentGameWinStreak || 0) + 1;
          stats.currentGameLossStreak = 0;
          stats.currentGameWinlessStreak = 0;
          if (!stats.longestWinStreakGames || stats.currentGameWinStreak > stats.longestWinStreakGames.value) {
            stats.longestWinStreakGames = {
              value: stats.currentGameWinStreak,
              startDate: stats.currentGameWinStreak === 1 ? gameTimestamp : stats.longestWinStreakGames?.startDate || gameTimestamp, // Startdatum neu setzen, wenn Streak beginnt
              endDate: gameTimestamp
            };
          }
        } else if (outcome.result === 'loss') {
          stats.currentGameLossStreak = (stats.currentGameLossStreak || 0) + 1;
          stats.currentGameWinStreak = 0;
          stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
          if (!stats.longestLossStreakGames || stats.currentGameLossStreak > stats.longestLossStreakGames.value) {
            stats.longestLossStreakGames = {
              value: stats.currentGameLossStreak,
              startDate: stats.currentGameLossStreak === 1 ? gameTimestamp : stats.longestLossStreakGames?.startDate || gameTimestamp,
              endDate: gameTimestamp
            };
          }
          // Auch longestWinlessStreak aktualisieren
          if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = {
              value: stats.currentGameWinlessStreak,
              startDate: stats.currentGameWinlessStreak === 1 ? gameTimestamp : stats.longestWinlessStreakGames?.startDate || gameTimestamp,
              endDate: gameTimestamp
            };
          }
        } else { // Annahme: 'draw' oder 'unknown' (sollte bei Spielen selten sein, aber zur Sicherheit)
          stats.currentGameWinStreak = 0;
          stats.currentGameLossStreak = 0;
          stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
           // Nur longestWinlessStreak aktualisieren
          if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = {
              value: stats.currentGameWinlessStreak,
              startDate: stats.currentGameWinlessStreak === 1 ? gameTimestamp : stats.longestWinlessStreakGames?.startDate || gameTimestamp,
              endDate: gameTimestamp
            };
          }
        }

        transaction.set(playerStatsRef, stats, { merge: true }); // merge: true ist sicherer, wenn neue Felder hinzukommen
      });
      logger.info(`[updateUserStatsAfterGameCompletion] Player ${userId}: stats updated for game ${gameData.activeGameId}.`);
    } catch (error) {
      logger.error(`[updateUserStatsAfterGameCompletion] Player ${userId}: FAILED to update stats for game ${gameData.activeGameId}:`, error);
    }
  }
}

/**
 * Cloud Function (v2), die ausgelöst wird, wenn ein Dokument in
 * 'jassGameSummaries/{sessionId}/completedGames/{gameNumberString}' erstellt wird.
 * Sie löscht das zugehörige 'activeGame'-Dokument UND AKTUALISIERT SPIELERSTATISTIKEN.
 */
export const archivecompletedgame = onDocumentCreated(
  {
    document: `jassGameSummaries/{sessionId}/${COMPLETED_GAMES_SUBCOLLECTION}/{gameNumberString}`,
    region: "europe-west1",
  },
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { sessionId: string; gameNumberString: string }>): Promise<void> => {
    const { sessionId, gameNumberString } = event.params;
    const snap = event.data;

    logger.info(`[archivecompletedgame v2] Triggered for session: ${sessionId}, game: ${gameNumberString} (Doc ID: ${snap?.id})`);

    if (!snap) {
      logger.error(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Snapshot is undefined.`);
      return;
    }

    const completedGameData = snap.data() as CompletedGameData | undefined;

    if (!completedGameData) {
      logger.error(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Missing completed game data.`);
      return;
    }

    // Validierung, ob die notwendige Teamstruktur für die Statistik vorhanden ist
    if (!completedGameData.teams?.top?.playerUids || !completedGameData.teams?.bottom?.playerUids) {
        logger.error(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Missing playerUids in teams structure for game ${completedGameData.activeGameId}. Cannot reliably update stats.`);
        // Fahre fort mit dem Löschen des activeGame, aber überspringe Statistik-Update
    } else {
        const playerUids = completedGameData.participantUids; 
        if (playerUids && Array.isArray(playerUids) && playerUids.length > 0) {
            logger.info(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Updating stats for players: ${playerUids.join(", ")} for game ${completedGameData.activeGameId}`);
            await updateUserStatsAfterGameCompletion(db, playerUids, completedGameData, snap.id ); 
        } else {
            logger.warn(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] No participantUids found or empty. Stats not updated for game ${completedGameData.activeGameId}.`);
        }
    }

    if (completedGameData.activeGameId) {
    const activeGameId = completedGameData.activeGameId;
      logger.info(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Processing activeGameId: ${activeGameId} for deletion.`);
    const activeGameRef = db.collection(ACTIVE_GAMES_COLLECTION).doc(activeGameId);
    try {
      await activeGameRef.delete();
        logger.info(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Successfully deleted active game ${activeGameId}.`);
    } catch (error) {
        logger.error(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] Error deleting active game ${activeGameId}:`, error);
      }
    } else {
      logger.warn(`[archivecompletedgame v2 - ${sessionId}/${gameNumberString}] No activeGameId found in completedGameData. Cannot delete active game.`);
    }
  }); 