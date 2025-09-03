import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

// --- TYPE DEFINITIONS ---

// Based on the user-provided data structure for a single tournament game (passe)
interface TournamentGame {
  id: string;
  completedAt: admin.firestore.Timestamp;
  durationMillis: number;
  participantPlayerIds: string[];
  playerDetails: {
    playerId: string; // This is the authUid
    playerName: string;
    scoreInPasse: number;
    stricheInPasse: { [key: string]: number };
    team: 'top' | 'bottom';
    weisInPasse: number;
  }[];
  teamScoresPasse: { top: number; bottom: number };
  teamStrichePasse: {
    top: { [key: string]: number };
    bottom: { [key: string]: number };
  };
  // Felder für Kompatibilität mit GameDataForEventCalc
  roundHistory?: Array<{ strichInfo?: { type?: string; team?: 'top' | 'bottom' } }>;
  finalStriche?: { 
    top: { sieg: number; berg: number; schneider: number };
    bottom: { sieg: number; berg: number; schneider: number };
  };
}

// Based on the user-provided data structure for jassGameSummaries
interface JassGameSummary {
  createdAt: admin.firestore.Timestamp;
  durationSeconds: number;
  endedAt: admin.firestore.Timestamp;
  gameResults: { 
    gameNumber: number; 
    bottomScore: number; 
    topScore: number; 
    winnerTeam: 'top' | 'bottom' | 'tie';
    teams: { 
      top: { players: { playerId: string; displayName: string; }[] };
      bottom: { players: { playerId: string; displayName: string; }[] };
    };
    finalStriche?: { [team: string]: { [event: string]: number } };
    durationSeconds?: number;
    completedAt?: admin.firestore.Timestamp;
  }[];
  gamesPlayed: number;
  groupId: string;
  participantPlayerIds: string[];
  startedAt: admin.firestore.Timestamp;
  status: 'completed';
  tournamentId: string;
  // ❌ Optional Session-Level Felder (nicht für Tournaments):
  eventCounts?: { [team: string]: { [event: string]: number } };
  finalScores?: { top: number; bottom: number };
  finalStriche?: { [team: string]: { [event: string]: number } };
  gameWinsByPlayer?: { [playerId: string]: { wins: number; losses: number } };
  gameWinsByTeam?: { top: number; bottom: number, ties: number };
  playerNames?: { [seat: string]: string };
  sessionTotalWeisPoints?: { top: number; bottom: number };
  teams?: { top: { players: any[] }; bottom: { players: any[] } };
  winnerTeamKey?: 'top' | 'bottom' | 'tie';
}

// --- HILFSFUNKTION zur Umwandlung von authUid in playerDocId mit Caching ---
const getPlayerDocIdWithCache = (cache: Map<string, string>) => async (authUid: string): Promise<string> => {
    if (cache.has(authUid)) {
        return cache.get(authUid)!;
    }

    // Zuerst im User-Dokument nachsehen (schnellster Weg)
    const userRef = db.collection('users').doc(authUid);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data()?.playerId) {
        const playerDocId = userSnap.data()?.playerId;
        cache.set(authUid, playerDocId);
        return playerDocId;
    }
    
    // Fallback: Direkte Abfrage der players-Collection
    const playerQuery = db.collection('players').where('userId', '==', authUid).limit(1);
    const playerSnap = await playerQuery.get();
    if (!playerSnap.empty) {
        const playerDocId = playerSnap.docs[0].id;
        cache.set(authUid, playerDocId);
        return playerDocId;
    }

    logger.warn(`Could not find player document ID for authUid: ${authUid}. Returning authUid as fallback.`);
    cache.set(authUid, authUid); // Cache the fallback to avoid re-querying
    return authUid; 
};

/**
 * ✅ KORRIGIERT: Triggered when a tournament document is written.
 * Creates a MINIMAL tournament summary WITHOUT misleading session-level fields.
 * Tournament teams change every game, so session-level aggregations are meaningless.
 */
export const aggregateTournamentIntoSummary = onDocumentWritten(
  { document: "tournaments/{tournamentId}", region: "europe-west1" },
  async (event) => {
    const { tournamentId } = event.params;

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // Proceed only if the status just became 'completed'
    if (afterData?.status !== "completed" || beforeData?.status === "completed") {
      return;
    }

    logger.info(`Tournament ${tournamentId} completed. Creating MINIMAL tournament summary.`);

    try {
        const idCache = new Map<string, string>();
        const getPlayerDocId = getPlayerDocIdWithCache(idCache);

        const tournamentData = afterData;
        const groupId = tournamentData.groupId;

        if (!groupId) {
            logger.error(`Tournament ${tournamentId} has no groupId. Cannot create summary.`);
      return;
    }

        // 1. Fetch all game documents from the subcollection.
        const gamesSnapshot = await db.collection("tournaments").doc(tournamentId).collection("games").get();
        if (gamesSnapshot.empty) {
            logger.warn(`No games found in completed tournament ${tournamentId}. Skipping summary creation.`);
      return;
    }

        const games: TournamentGame[] = gamesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                finalStriche: data.teamStrichePasse, 
            } as TournamentGame;
        });
        games.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());

        // 2. ✅ MINIMALE Tournament-Summary (NUR relevante Felder)
        const summary: JassGameSummary = {
            // ✅ WICHTIGE TOURNAMENT-FELDER
            gameResults: [],
            participantPlayerIds: [],
            gamesPlayed: games.length,
            durationSeconds: 0,
            createdAt: tournamentData.createdAt,
            startedAt: games[0].completedAt,
            endedAt: games[games.length - 1].completedAt,
            status: 'completed',
            groupId: groupId,
            tournamentId: tournamentId,
            
            // ❌ BEWUSST ENTFERNT: Session-Level Felder sind bei wechselnden Teams irreführend
            // eventCounts: Teams wechseln pro Spiel → Session-Level Events sind sinnlos
            // finalScores: Teams wechseln pro Spiel → Session-Level Scores sind sinnlos
            // finalStriche: Teams wechseln pro Spiel → Session-Level Striche sind sinnlos
            // teams: Teams wechseln pro Spiel → Session-Level Teams sind sinnlos
            // winnerTeamKey: Teams wechseln pro Spiel → Session-Level Winner ist sinnlos
        };

        let totalDurationMillis = 0;
        const allPlayerIds = new Set<string>();

        // 3. Verarbeite jedes Spiel für gameResults
        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            totalDurationMillis += game.durationMillis || 0;

            // Game Result
            let winnerTeam: 'top' | 'bottom' | 'tie' = 'tie';
            if (game.teamScoresPasse.top > game.teamScoresPasse.bottom) {
                winnerTeam = 'top';
            } else if (game.teamScoresPasse.bottom > game.teamScoresPasse.top) {
                winnerTeam = 'bottom';
            }

            // ✅ Teams für DIESES spezifische Spiel
            const gameTeams = {
                top: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'top').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
                bottom: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'bottom').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
            };

            summary.gameResults.push({
                gameNumber: i + 1,
                topScore: game.teamScoresPasse.top,
                bottomScore: game.teamScoresPasse.bottom,
                winnerTeam: winnerTeam,
                teams: gameTeams,
                finalStriche: game.teamStrichePasse,
                durationSeconds: Math.round((game.durationMillis || 0) / 1000),
                completedAt: game.completedAt,
            });

            // Player IDs sammeln
            for (const p of game.playerDetails) {
                const playerDocId = await getPlayerDocId(p.playerId);
                allPlayerIds.add(playerDocId);
            }
        }
        
        // Finalize Summary
        // ✅ KORRIGIERT: allPlayerIds enthält bereits aufgelöste Player-Doc-IDs
        summary.participantPlayerIds = [...new Set(allPlayerIds)];
        summary.durationSeconds = Math.round(totalDurationMillis / 1000);
        
        // 4. Write the MINIMAL summary document
        await db.collection("jassGameSummaries").add(summary);

        logger.info(`Successfully created MINIMAL JassGameSummary for tournament ${tournamentId}. Only gameResults matter for tournaments.`);
    } catch (error) {
        logger.error(
            `Failed to aggregate tournament ${tournamentId} into a JassGameSummary.`,
            { error }
        );
        await db.collection("tournaments").doc(tournamentId).update({
            summaryGenerationError: error instanceof Error ? error.message : "An unknown error occurred",
        }).catch(err => logger.error(`Could not update tournament with error state:`, err));
    }
  }
);

export const processTournamentCompletion = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const { tournamentId } = event.params;

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // Proceed only if the status just became 'completed'
    if (afterData?.status !== "completed" || beforeData?.status === "completed") {
      logger.info(
        `Tournament ${tournamentId} status not changed to 'completed', skipping aggregation. Status before: ${beforeData?.status}, after: ${afterData?.status}`
      );
      return;
    }
    
    logger.info(`Tournament ${tournamentId} completed. Starting aggregation into JassGameSummary.`);

    try {
        // Here we will implement the aggregation logic.
        // 1. Fetch all game documents from the subcollection.
        // 2. Transform and aggregate them into a JassGameSummary structure.
        // 3. Write the new summary document to the jassGameSummaries collection.

        logger.info(`Placeholder for aggregation logic for tournament ${tournamentId}.`);

        // TODO: Implement the full logic here.

        logger.info(`Successfully created JassGameSummary for tournament ${tournamentId}.`);
        return;
    } catch (error) {
        logger.error(
            `Failed to aggregate tournament ${tournamentId} into a JassGameSummary.`,
            { error }
        );
        // Optionally, update the tournament document to reflect the error
        await db.collection("tournaments").doc(tournamentId).update({
            summaryGenerationError: error instanceof Error ? error.message : "An unknown error occurred",
        }).catch(err => logger.error(`Could not update tournament with error state:`, err));

        return;
    }
  }
);

export const processTournamentCompletionOld = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const { tournamentId } = event.params;

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // Proceed only if the status just became 'completed'
    if (afterData?.status !== "completed" || beforeData?.status === "completed") {
      logger.info(
        `Tournament ${tournamentId} status not changed to 'completed', skipping aggregation. Status before: ${beforeData?.status}, after: ${afterData?.status}`
      );
      return;
    }
    
    logger.info(`Tournament ${tournamentId} completed. Starting aggregation into JassGameSummary.`);

    try {
        // Here we will implement the aggregation logic.
        // 1. Fetch all game documents from the subcollection.
        // 2. Transform and aggregate them into a JassGameSummary structure.
        // 3. Write the new summary document to the jassGameSummaries collection.

        logger.info(`Placeholder for aggregation logic for tournament ${tournamentId}.`);

        // TODO: Implement the full logic here.

        logger.info(`Successfully created JassGameSummary for tournament ${tournamentId}.`);
        return;
    } catch (error) {
        logger.error(
            `Failed to aggregate tournament ${tournamentId} into a JassGameSummary.`,
            { error }
        );
        // Optionally, update the tournament document to reflect the error
        await db.collection("tournaments").doc(tournamentId).update({
            summaryGenerationError: error instanceof Error ? error.message : "An unknown error occurred",
        }).catch(err => logger.error(`Could not update tournament with error state:`, err));

        return;
    }
  }
); 