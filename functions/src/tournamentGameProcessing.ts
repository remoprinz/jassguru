import { FirestoreEvent, QueryDocumentSnapshot, onDocumentCreated, DocumentOptions } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { PlayerComputedStats, initialPlayerComputedStats } from "./models/player-stats.model"; // Relativer Pfad zu den Models

const db = admin.firestore();

// Annahme für die Datenstruktur eines Turnierspiels (tournament game / passe)
// Diese Struktur sollte die Infos enthalten, die auch completedGames in Sessions haben,
// plus turnierspezifische Daten falls nötig.
interface TournamentGameData {
  id: string; // Eigene ID des Turnierspiels
  tournamentId: string;
  passeNumber: number; // oder gameNumber
  timestampCompleted: admin.firestore.Timestamp;
  durationMillis?: number;
  teams: { // Spieler-UIDs pro Team für dieses Spiel
    top: { playerUids: string[]; };
    bottom: { playerUids: string[]; };
  };
  participantUids: string[]; // Alle UIDs in diesem Spiel
  finalScores: { top: number; bottom: number };
  finalStriche: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  weisPoints: { top: number; bottom: number };
  winnerTeam?: 'top' | 'bottom' | 'draw';
  // Weitere turnierspezifische Felder...
}

// Hilfsfunktion: Summiert die Striche für ein Team (identisch zu archiveGame.ts)
const calculateTotalTeamStricheValue = (stricheObj: TournamentGameData['finalStriche']['top'] | undefined): number => {
  if (!stricheObj) return 0;
  return (stricheObj.berg || 0) + (stricheObj.sieg || 0) + (stricheObj.matsch || 0) + (stricheObj.schneider || 0) + (stricheObj.kontermatsch || 0);
};

// Hilfsfunktion: Bestimmt das Spielergebnis (identisch zu archiveGame.ts, aber mit TournamentGameData)
function getPlayerTournamentGameOutcome(userId: string, gameData: TournamentGameData): {
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
    logger.warn(`[getPlayerTournamentGameOutcome] Could not determine team for player ${userId} in tournament game ${gameData.id}.`);
    return { result: 'unknown', pointsMade: 0, pointsReceived: 0, stricheMade: 0, stricheReceived: 0, weisMade: 0, isMatschGame: false, isSchneiderGame: false, isKontermatschMade: false, isKontermatschReceived: false, playerTeamKey: null, opponentTeamKey: null };
  }

  const pointsMade = gameData.finalScores[playerTeamKey] || 0;
  const pointsReceived = gameData.finalScores[opponentTeamKey] || 0;
  const weisMade = gameData.weisPoints[playerTeamKey] || 0;
  const stricheMade = calculateTotalTeamStricheValue(gameData.finalStriche[playerTeamKey]);
  const stricheReceived = calculateTotalTeamStricheValue(gameData.finalStriche[opponentTeamKey]);

  if (gameData.finalStriche[playerTeamKey]?.matsch > 0) {
    isMatschGame = true;
  }
  if (gameData.finalStriche[playerTeamKey]?.schneider > 0) {
    isSchneiderGame = true;
  }
  if (gameData.finalStriche[playerTeamKey]?.kontermatsch > 0) {
    isKontermatschMade = true;
  }
  if (gameData.finalStriche[opponentTeamKey]?.kontermatsch > 0) {
    isKontermatschReceived = true;
  }

  let result: 'win' | 'loss' | 'draw' = 'loss'; 
  if (gameData.winnerTeam === playerTeamKey) result = 'win';
  else if (gameData.winnerTeam === 'draw') result = 'draw';
  else if (gameData.winnerTeam === opponentTeamKey) result = 'loss';
  else {
    if (pointsMade > pointsReceived) result = 'win';
    else if (pointsMade < pointsReceived) result = 'loss';
    else result = 'draw';
  }
  return { result, pointsMade, pointsReceived, stricheMade, stricheReceived, weisMade, isMatschGame, isSchneiderGame, isKontermatschMade, isKontermatschReceived, playerTeamKey, opponentTeamKey };
}

// Hauptfunktion zur Aktualisierung der Spielerstatistiken nach einem Turnierspiel
async function updateUserStatsAfterTournamentGame(
  db: admin.firestore.Firestore,
  playerUids: string[],
  gameData: TournamentGameData,
  tournamentGameDocId: string
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

        // Turnier-spezifische und allgemeine Spielstatistiken aktualisieren
        stats.totalTournamentGamesPlayed = (stats.totalTournamentGamesPlayed || 0) + 1;
        // totalGames wird auch hier erhöht, da ein Turnierspiel auch ein Spiel ist
        stats.totalGames = (stats.totalGames || 0) + 1;
        stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + (gameData.durationMillis ? gameData.durationMillis / 1000 : 0);

        const outcome = getPlayerTournamentGameOutcome(userId, gameData);

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

        if (outcome.isMatschGame) {
          stats.totalMatschGamesMade = (stats.totalMatschGamesMade || 0) + 1;
        }
        if (outcome.isSchneiderGame) {
          stats.totalSchneiderGamesMade = (stats.totalSchneiderGamesMade || 0) + 1;
        }

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
          stats.avgMatschPerGame = stats.totalGames > 0 ? (stats.totalMatschGamesMade || 0) / stats.totalGames : 0;
          stats.avgSchneiderPerGame = stats.totalGames > 0 ? (stats.totalSchneiderGamesMade || 0) / stats.totalGames : 0;
        }

        // Highlights (Spiel-Ebene, aber im Kontext eines Turnierspiels)
        if (!stats.highestPointsGame || outcome.pointsMade > stats.highestPointsGame.value) {
          stats.highestPointsGame = { value: outcome.pointsMade, date: gameTimestamp, relatedId: tournamentGameDocId };
        }
        if (!stats.lowestPointsGame || outcome.pointsMade < stats.lowestPointsGame.value) {
          stats.lowestPointsGame = { value: outcome.pointsMade, date: gameTimestamp, relatedId: tournamentGameDocId };
        }
        // Weitere Highlights analog...
        // NEU: Kontermatsch Highlights/Lowlights (Spiel-Ebene)
        const kontermatschMadeValue = gameData.finalStriche[outcome.playerTeamKey!]?.kontermatsch || 0;
        if (kontermatschMadeValue > 0 && (!stats.mostKontermatschMadeGame || kontermatschMadeValue > stats.mostKontermatschMadeGame.value)) {
            stats.mostKontermatschMadeGame = { value: kontermatschMadeValue, date: gameTimestamp, relatedId: tournamentGameDocId };
        }
        const kontermatschReceivedValue = gameData.finalStriche[outcome.opponentTeamKey!]?.kontermatsch || 0;
        if (kontermatschReceivedValue > 0 && (!stats.mostKontermatschReceivedGame || kontermatschReceivedValue > stats.mostKontermatschReceivedGame.value)) {
            stats.mostKontermatschReceivedGame = { value: kontermatschReceivedValue, date: gameTimestamp, relatedId: tournamentGameDocId };
        }

        // NEU: Streak-Logik für Spiele (identisch zu archiveGame.ts)
        if (outcome.result === 'win') {
          stats.currentGameWinStreak = (stats.currentGameWinStreak || 0) + 1;
          stats.currentGameLossStreak = 0;
          stats.currentGameWinlessStreak = 0;
          if (!stats.longestWinStreakGames || stats.currentGameWinStreak > stats.longestWinStreakGames.value) {
            stats.longestWinStreakGames = {
              value: stats.currentGameWinStreak,
              startDate: stats.currentGameWinStreak === 1 ? gameTimestamp : stats.longestWinStreakGames?.startDate || gameTimestamp,
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
          if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = {
              value: stats.currentGameWinlessStreak,
              startDate: stats.currentGameWinlessStreak === 1 ? gameTimestamp : stats.longestWinlessStreakGames?.startDate || gameTimestamp,
              endDate: gameTimestamp
            };
          }
        } else { // 'draw' or 'unknown'
          stats.currentGameWinStreak = 0;
          stats.currentGameLossStreak = 0;
          stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
          if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = {
              value: stats.currentGameWinlessStreak,
              startDate: stats.currentGameWinlessStreak === 1 ? gameTimestamp : stats.longestWinlessStreakGames?.startDate || gameTimestamp,
              endDate: gameTimestamp
            };
          }
        }

        transaction.set(playerStatsRef, stats, { merge: true });
      });
      logger.info(`[updateUserStatsAfterTournamentGame] Player ${userId}: stats updated for tournament game ${tournamentGameDocId}.`);
    } catch (error) {
      logger.error(`[updateUserStatsAfterTournamentGame] Player ${userId}: FAILED to update stats for tournament game ${tournamentGameDocId}:`, error);
    }
  }
}

export const processTournamentGameCompletion = onDocumentCreated(
  { document: "tournaments/{tournamentId}/games/{gameId}", region: "europe-west1" } as DocumentOptions<"tournaments/{tournamentId}/games/{gameId}">,
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { tournamentId: string; gameId: string }>) => {
    const snap = event.data;
    const { tournamentId, gameId } = event.params;

    logger.info(`[processTournamentGameCompletion] Triggered for tournament: ${tournamentId}, game: ${gameId}`);

    if (!snap) {
      logger.error(`[processTournamentGameCompletion - ${tournamentId}/${gameId}] Snapshot is undefined.`);
      return;
    }
    const gameData = snap.data() as TournamentGameData | undefined;

    if (!gameData) {
      logger.error(`[processTournamentGameCompletion - ${tournamentId}/${gameId}] Missing tournament game data.`);
      return;
    }
    // Sicherstellen, dass alle UIDs vorhanden sind für die Statistik
    if (!gameData.participantUids || gameData.participantUids.length === 0) {
        logger.warn(`[processTournamentGameCompletion - ${tournamentId}/${gameId}] No participantUids found. Stats not updated.`);
        return;
    }
    if (!gameData.teams?.top?.playerUids || !gameData.teams?.bottom?.playerUids) {
        logger.warn(`[processTournamentGameCompletion - ${tournamentId}/${gameId}] Missing playerUids in teams structure. Stats not updated.`);
        return;
    }

    await updateUserStatsAfterTournamentGame(db, gameData.participantUids, gameData, snap.id);
  }
); 