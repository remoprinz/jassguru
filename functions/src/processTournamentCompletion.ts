import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

// --- TYPE DEFINITIONS ---

// Event counts structure
interface EventCountRecord {
  sieg: number;
  berg: number;
  matsch: number;
  kontermatsch: number;
  schneider: number;
}

interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}

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
  // Felder für Kompatibilität mit GameDataForEventCalc und Rundenzeiten-Berechnung
  roundHistory?: Array<{ 
    strichInfo?: { type?: string; team?: 'top' | 'bottom' }; 
    timestamp?: admin.firestore.Timestamp | number; 
    startingPlayer?: number; 
    wasPaused?: boolean; // Flag für pausierte Runden (für Statistiken)
  }>;
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
    eventCounts?: EventCounts;
    durationSeconds?: number;
    completedAt?: admin.firestore.Timestamp;
    // ✅ NEU: pro-Game Rundenzeiten direkt im Summary (Player Doc IDs)
    roundDurationsByPlayer?: { [playerId: string]: number[] };
  }[];
  gamesPlayed: number;
  groupId: string;
  participantPlayerIds: string[];
  startedAt: admin.firestore.Timestamp;
  status: 'completed';
  tournamentId: string;
  tournamentInstanceNumber?: number; // 🆕 Austragungsnummer (1, 2, 3...) für römische Ziffern im Archiv
  // 🚨 NEU: Turniername für Archiv-Anzeige
  tournamentName?: string;
  // 🎯 NEU: Finale Elo-Werte der Spieler nach Turnier-Ende (für Gruppen-Charts)
  finalEloRatings?: { [playerId: string]: number };
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

// --- HELPER FUNCTIONS ---

/**
 * Calculates eventCounts from game data for statistics.
 * Extracts matsch/kontermatsch from roundHistory and sieg/berg/schneider from finalStriche.
 */
function calculateEventCountsForTournamentGame(game: TournamentGame): EventCounts {
  const bottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const topEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

  // 1. Matsch/Kontermatsch aus roundHistory
  if (game.roundHistory && Array.isArray(game.roundHistory)) {
    game.roundHistory.forEach(round => {
      if (round.strichInfo && round.strichInfo.type && round.strichInfo.team) {
        const teamKey = round.strichInfo.team;
        if (round.strichInfo.type === 'matsch') {
          if (teamKey === 'bottom') bottomEvents.matsch++;
          else if (teamKey === 'top') topEvents.matsch++;
        } else if (round.strichInfo.type === 'kontermatsch') {
          if (teamKey === 'bottom') bottomEvents.kontermatsch++;
          else if (teamKey === 'top') topEvents.kontermatsch++;
        }
      }
    });
  }

  // 2. Sieg, Berg, Schneider aus teamStrichePasse
  const finalStriche = game.teamStrichePasse;
  if (finalStriche) {
    if (finalStriche.bottom?.sieg > 0) bottomEvents.sieg = finalStriche.bottom.sieg;
    if (finalStriche.top?.sieg > 0) topEvents.sieg = finalStriche.top.sieg;
    if (finalStriche.bottom?.berg > 0) bottomEvents.berg = finalStriche.bottom.berg;
    if (finalStriche.top?.berg > 0) topEvents.berg = finalStriche.top.berg;
    if (finalStriche.bottom?.schneider > 0) bottomEvents.schneider = finalStriche.bottom.schneider;
    if (finalStriche.top?.schneider > 0) topEvents.schneider = finalStriche.top.schneider;
  }

  return { bottom: bottomEvents, top: topEvents };
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
            tournamentInstanceNumber: tournamentData.currentInstanceNumber || 1, // 🆕 AUSTRAGUNGSNUMMER
            gameWinsByTeam: { top: 0, bottom: 0, ties: 0 },
            // 🚨 NEU: Turniername für Archiv-Anzeige
            tournamentName: tournamentData.name || `Turnier ${tournamentId}`,
            

        };

        let totalDurationMillis = 0;
        const allPlayerIds = new Set<string>();

        // ✅ NEU: Sammle Rundenzeiten pro Spieler für Median-Berechnung
        const roundDurationsByPlayerId = new Map<string, number[]>();

        // 3. Verarbeite jedes Spiel für gameResults
        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            totalDurationMillis += game.durationMillis || 0;

            // Game Result
            let winnerTeam: 'top' | 'bottom' | 'tie' = 'tie';
            if (game.teamScoresPasse.top > game.teamScoresPasse.bottom) {
                winnerTeam = 'top';
                summary.gameWinsByTeam!.top++;
            } else if (game.teamScoresPasse.bottom > game.teamScoresPasse.top) {
                winnerTeam = 'bottom';
                summary.gameWinsByTeam!.bottom++;
            } else {
                summary.gameWinsByTeam!.ties++;
            }

            // ✅ Teams für DIESES spezifische Spiel
            const gameTeams = {
                top: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'top').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
                bottom: { players: await Promise.all(game.playerDetails.filter(p => p.team === 'bottom').map(async p => ({ playerId: await getPlayerDocId(p.playerId), displayName: p.playerName }))) },
            };

            // Calculate eventCounts for this game
            const eventCounts = calculateEventCountsForTournamentGame(game);
            
            // Vorläufiges GameResult-Objekt
            const gameResultEntry: JassGameSummary['gameResults'][number] = {
                gameNumber: i + 1,
                topScore: game.teamScoresPasse.top,
                bottomScore: game.teamScoresPasse.bottom,
                winnerTeam: winnerTeam,
                teams: gameTeams,
                finalStriche: game.teamStrichePasse,
                eventCounts: eventCounts,
                durationSeconds: Math.round((game.durationMillis || 0) / 1000),
                completedAt: game.completedAt,
            };

            // Player IDs sammeln
            for (const p of game.playerDetails) {
                const playerDocId = await getPlayerDocId(p.playerId);
                allPlayerIds.add(playerDocId);
            }

            // ✅ PHASE 3: Berechne roundDurationsByPlayer PRO GAME
            const gameRoundDurationsByPlayer: { [playerId: string]: number[] } = {};
            
            // ✅ NEU: Berechne Rundenzeiten aus roundHistory
            if (game.roundHistory && Array.isArray(game.roundHistory)) {
                let previousTimestamp: number | null = null;

                for (let roundIdx = 0; roundIdx < game.roundHistory.length; roundIdx++) {
                    const round = game.roundHistory[roundIdx];
                    const currentTimestamp = typeof round.timestamp === 'number' 
                        ? round.timestamp 
                        : round.timestamp?.toMillis?.();
                    const startingPlayer = round.startingPlayer; // Player Number (1-4)

                    if (
                        previousTimestamp &&
                        currentTimestamp &&
                        currentTimestamp > previousTimestamp &&
                        typeof startingPlayer === 'number'
                    ) {
                        const roundDuration = currentTimestamp - previousTimestamp;

                        // Filter: 1min <= duration < 12min UND nicht pausiert
                        if (roundDuration >= 60000 && roundDuration < 720000 && !round.wasPaused) {
                            // Map Player Number → Player ID
                            const playerDetail = game.playerDetails[startingPlayer - 1]; // 0-basiert
                            if (playerDetail) {
                                const playerDocId = await getPlayerDocId(playerDetail.playerId);
                                
                                // ✅ Session-weit (wie bisher)
                                if (!roundDurationsByPlayerId.has(playerDocId)) {
                                    roundDurationsByPlayerId.set(playerDocId, []);
                                }
                                roundDurationsByPlayerId.get(playerDocId)!.push(roundDuration);
                                
                                // ✅ PHASE 3: Pro Game
                                if (!gameRoundDurationsByPlayer[playerDocId]) {
                                    gameRoundDurationsByPlayer[playerDocId] = [];
                                }
                                gameRoundDurationsByPlayer[playerDocId].push(roundDuration);
                            }
                        }
                    }

                    if (currentTimestamp) {
                        previousTimestamp = currentTimestamp;
                    }
                }
            }
            
            // ✅ PHASE 3: Speichere roundDurationsByPlayer im Tournament Game
            if (Object.keys(gameRoundDurationsByPlayer).length > 0) {
                try {
                    await db.collection(`tournaments/${tournamentId}/games`).doc(game.id!).update({
                        roundDurationsByPlayer: gameRoundDurationsByPlayer,
                        _roundDurationsCalculatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } catch (error) {
                    logger.warn(`Could not update game ${game.id} with roundDurationsByPlayer:`, error);
                }

                // ✅ PHASE 3: Und zusätzlich direkt im Summary unter gameResults mitschreiben
                gameResultEntry.roundDurationsByPlayer = gameRoundDurationsByPlayer;
            }

            // Füge GameResult dem Summary hinzu (nachdem roundDurationsByPlayer ggf. gesetzt wurde)
            summary.gameResults.push(gameResultEntry);
        }
        
        // Finalize Summary
        // ✅ KORRIGIERT: allPlayerIds enthält bereits aufgelöste Player-Doc-IDs
        summary.participantPlayerIds = [...new Set(allPlayerIds)];
        summary.durationSeconds = Math.round(totalDurationMillis / 1000);
        
        // ✅ NEU: Füge aggregatedRoundDurationsByPlayer hinzu
        if (roundDurationsByPlayerId.size > 0) {
            const aggregatedRoundDurations: { [playerId: string]: { totalDuration: number; roundCount: number; roundDurations: number[] } } = {};
            
            roundDurationsByPlayerId.forEach((durations, playerId) => {
                if (durations.length > 0) {
                    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
                    aggregatedRoundDurations[playerId] = {
                        totalDuration,
                        roundCount: durations.length,
                        roundDurations: durations,
                    };
                }
            });
            
            (summary as any).aggregatedRoundDurationsByPlayer = aggregatedRoundDurations;
        }
        
        // 🎯 NEU: Lade finale Elo-Werte für alle Teilnehmer nach Turnier-Ende
        const finalEloRatings: { [playerId: string]: number } = {};
        try {
            for (const playerId of Array.from(allPlayerIds)) {
                const playerDoc = await db.collection("players").doc(playerId).get();
                if (playerDoc.exists) {
                    const playerData = playerDoc.data();
                    finalEloRatings[playerId] = playerData?.globalRating || 100;
                }
            }
            if (Object.keys(finalEloRatings).length > 0) {
                summary.finalEloRatings = finalEloRatings;
                logger.info(`✅ Final Elo ratings added to tournament summary for ${Object.keys(finalEloRatings).length} players`);
            }
        } catch (eloError) {
            logger.warn(`⚠️ Could not load final Elo ratings for tournament ${tournamentId}:`, eloError);
            // Nicht kritisch - Summary wird trotzdem geschrieben
        }
        
        // 4. ✅ KRITISCHER FIX: Write to group's jassGameSummaries subcollection!
        await db.collection("groups").doc(groupId).collection("jassGameSummaries").add(summary);

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
