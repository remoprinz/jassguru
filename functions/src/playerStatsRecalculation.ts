import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PlayerComputedStats, initialPlayerComputedStats, TournamentPlacement, StatHighlight, StatStreak } from "./models/player-stats.model";
import { SessionTeams as RecalcSessionTeams, StricheRecord as RecalcStricheRecord, TeamScores as RecalcTeamScores, InitialSessionData as RecalcInitialSessionData } from "./finalizeSession";
import { TournamentGameData as RecalcTournamentGameData } from "./tournamentGameProcessing";
import { TournamentDocData as RecalcTournamentDocData } from "./finalizeTournament";
import { CompletedGameData as ArchivedCompletedGameDataOriginal, PlayerNames as ArchivedPlayerNames, RoundEntry as ArchivedRoundEntry } from "./archiveGame";

const db = admin.firestore();

// Konstanten für Collections
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const TOURNAMENTS_COLLECTION = 'tournaments';
const TOURNAMENT_GAMES_SUBCOLLECTION = 'games';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';
const PLAYERS_COLLECTION = 'players';

/**
 * Hilfsfunktion zum Abrufen des Anzeigenamens eines Spielers.
 */
async function getPlayerDisplayName(playerId: string): Promise<string> {
    try {
        const playerDoc = await db.collection(PLAYERS_COLLECTION).doc(playerId).get();
        if (playerDoc.exists) {
            return playerDoc.data()?.displayName || playerId;
        }
        return playerId;
    } catch (error) {
        logger.error(`[getPlayerDisplayName] Error fetching displayName for ${playerId}:`, error);
        return playerId;
    }
}

// Datenstruktur für ein reguläres abgeschlossenes Spiel, angepasst für die Neuberechnung
interface RecalcCompletedGameData extends ArchivedCompletedGameDataOriginal {
    gameDocId: string; // ID des Spieldokuments für relatedId in Highlights
    // Explizite Wiederholung der geerbten Felder zur Vermeidung von Typinferenzproblemen
    participantUids: string[];
    teams: {
        top: { playerUids: string[]; };
        bottom: { playerUids: string[]; };
    };
    // timestampCompleted ist bereits in ArchivedCompletedGameDataOriginal
    // und andere Felder wie finalScores, finalStriche etc. werden ebenfalls geerbt.
}

// Datenstruktur für eine abgeschlossene Session, angepasst für die Neuberechnung
interface RecalcSessionData {
    sessionId: string;
    participantUids: string[];
    teams: RecalcSessionTeams | null | undefined;
    finalScores: RecalcTeamScores;
    finalStriche?: { top: RecalcStricheRecord; bottom: RecalcStricheRecord };
    completedAt: admin.firestore.Timestamp;
    winnerTeamKey?: 'teamA' | 'teamB' | 'draw';
    teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
    // Zusätzliche Infos, die aus dem JassSummary Dokument stammen könnten
    summaryData?: Record<string, any>; // Das volle Summary-Dokument für detailliertere Logik
}

// NEU: Event-Typen für die chronologische Verarbeitung
interface RecalcEventBase {
  timestamp: admin.firestore.Timestamp;
  type: string;
  sourceId: string; // ID des Quelldokuments (Spiel, Session, Turnier)
}

interface RecalcRegularGameEvent extends RecalcEventBase {
  type: 'REGULAR_GAME';
  data: RecalcCompletedGameData;
  sessionId: string; // Zugehörige Session ID
}

interface RecalcSessionEndEvent extends RecalcEventBase {
  type: 'SESSION_END';
  data: RecalcSessionData;
}

interface RecalcTournamentGameEvent extends RecalcEventBase {
  type: 'TOURNAMENT_GAME';
  data: RecalcTournamentGameData; // Aus tournamentGameProcessing importiert und als RecalcTournamentGameData alias-iert
  tournamentId: string; // Zugehörige Turnier ID
}

interface RecalcTournamentEndEvent extends RecalcEventBase {
  type: 'TOURNAMENT_END';
  data: RecalcTournamentDocData; // Aus finalizeTournament importiert und als RecalcTournamentDocData alias-iert
  // Die folgenden Felder müssen beim Sammeln der Events gefüllt werden,
  // ggf. durch erneute Auswertung der Turnierlogik für diesen spezifischen Spieler.
  playerRank?: number; 
  totalRankedParticipants?: number; // Anzahl Spieler/Teams/Gruppen im Ranking
  playerTeamName?: string; // Falls zutreffend (Doppel/Gruppe)
}

type RecalcEvent = RecalcRegularGameEvent | RecalcSessionEndEvent | RecalcTournamentGameEvent | RecalcTournamentEndEvent;

export const recalculateAllPlayerStatistics = onCall(
    {
        region: "europe-west1",
        timeoutSeconds: 540, // Standard (max für v1 war 540, v2 hat höhere Limits aber starten wir hiermit)
        memory: "1GiB", // Mehr Speicher für potenziell viele Daten
    },
    async (request: CallableRequest<void>) => {
        logger.info("--- recalculateAllPlayerStatistics START ---", { auth: request.auth?.uid });

        if (!request.auth || !request.auth.uid) { // auth und auth.uid prüfen
            logger.error("User is not authenticated to run recalculateAllPlayerStatistics.");
            throw new HttpsError("unauthenticated", "User is not authenticated.");
        }
        
        // Admin-Check aktivieren (Beispiel, anpassen an tatsächliche Admin-Logik)
        try {
            const adminUser = await admin.auth().getUser(request.auth.uid);
            if (!adminUser.customClaims?.admin) { // Annahme: Admin-Status ist im Custom Claim 'admin'
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

            // Aus JassGameSummaries (normale Spiele)
            const summariesSnapshot = await db.collection(JASS_SUMMARIES_COLLECTION).get();
            for (const summaryDoc of summariesSnapshot.docs) {
                const summaryData = summaryDoc.data();
                summaryData?.initialSessionData?.participantUids?.forEach((uid: string) => allPlayerUids.add(uid));
                
                const completedGamesSnapshot = await summaryDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).get();
                for (const gameDoc of completedGamesSnapshot.docs) {
                    const gameData = gameDoc.data() as RecalcCompletedGameData;
                    gameData?.participantUids?.forEach((uid: string) => allPlayerUids.add(uid));
                    // Auch aus teams-Struktur in completedGames, falls vorhanden und detaillierter
                    if (gameData?.teams) { // Annahme: gameData.teams ist hier die alte TeamConfig {top: [id,id], bottom:[id,id]}
                        // Diese Struktur ist nicht ideal für direkte UID-Extraktion.
                        // Besser wäre es, wenn completedGames auch eine participantUids-Liste hätte.
                        // Fürs Erste verlassen wir uns auf summaryData.initialSessionData.participantUids
                        // und gameData.participantUids. Die Logik in archiveGame.ts verwendet eine verbesserte Teamstruktur.
                        // Wir müssen hier ggf. die Teamstruktur aus dem `completedGame` Dokument neu interpretieren oder
                        // uns darauf verlassen, dass `archiveGame.ts` bereits eine saubere `participantUids` Liste in die
                        // `CompletedGameData` geschrieben hat. Die `updateUserStatsAfterGameCompletion` in `archiveGame.ts`
                        // erwartet `gameData.teams.team1PlayerUids` und `gameData.teams.team2PlayerUids`.
                        // Dies muss bei der Datenaufbereitung für die Neuberechnung berücksichtigt werden.
                    }
                }
            }

            // Aus Turnieren
            const tournamentsSnapshot = await db.collection(TOURNAMENTS_COLLECTION).get();
            for (const tournamentDoc of tournamentsSnapshot.docs) {
                const tournamentData = tournamentDoc.data() as RecalcTournamentDocData;
                tournamentData?.playerUids?.forEach((uid: string) => allPlayerUids.add(uid));
                if (tournamentData?.teams) {
                    tournamentData.teams.forEach(team => team.playerUids.forEach((uid: string) => allPlayerUids.add(uid)));
                }
                if (tournamentData?.groups) {
                    tournamentData.groups.forEach(group => group.playerUids.forEach((uid: string) => allPlayerUids.add(uid)));
                }

                const tournamentGamesSnapshot = await tournamentDoc.ref.collection(TOURNAMENT_GAMES_SUBCOLLECTION).get();
                for (const gameDoc of tournamentGamesSnapshot.docs) {
                    const gameData = gameDoc.data() as RecalcTournamentGameData;
                    gameData?.participantUids?.forEach((uid: string) => allPlayerUids.add(uid));
                    gameData?.teams?.top?.playerUids?.forEach((uid: string) => allPlayerUids.add(uid));
                    gameData?.teams?.bottom?.playerUids?.forEach((uid: string) => allPlayerUids.add(uid));
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
                let stats: PlayerComputedStats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
                stats.lastUpdateTimestamp = admin.firestore.Timestamp.now();

                const playerEvents: RecalcEvent[] = [];

                // Schritt 2.1: Reguläre Spiele und Session-Abschlüsse sammeln
                for (const summaryDoc of summariesSnapshot.docs) {
                    const summaryData = summaryDoc.data();
                    const initialSessData = summaryData.initialSessionData as RecalcInitialSessionData | undefined;

                    if (initialSessData?.participantUids?.includes(playerId)) {
                        // Session-Abschluss-Event hinzufügen
                        if (summaryData.meta?.status === 'completed' && summaryData.meta?.completedAt) {
                            const sessionEndData: RecalcSessionData = {
                                sessionId: summaryDoc.id,
                                participantUids: initialSessData.participantUids,
                                teams: initialSessData.teams,
                                finalScores: summaryData.finalScores as RecalcTeamScores, // Cast, da Struktur bekannt
                                finalStriche: summaryData.finalStriche, // Optional
                                completedAt: summaryData.meta.completedAt as admin.firestore.Timestamp,
                                winnerTeamKey: initialSessData.winnerTeamKey,
                                teamScoreMapping: initialSessData.teamScoreMapping,
                                summaryData: summaryData, // Das volle Summary für ggf. weitere Details
                            };
                            playerEvents.push({
                                type: 'SESSION_END',
                                timestamp: sessionEndData.completedAt,
                                sourceId: summaryDoc.id,
                                data: sessionEndData,
                            });
                        }

                        // Zugehörige Spiele (completedGames) sammeln
                        const completedGamesSnapshot = await summaryDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).get();
                        for (const gameDoc of completedGamesSnapshot.docs) {
                            const gameDataOriginal = gameDoc.data() as ArchivedCompletedGameDataOriginal;
                            // Prüfen, ob Spieler an diesem spezifischen Spiel teilgenommen hat
                            // (über gameData.participantUids oder gameData.teams)
                            const playerInThisGame = gameDataOriginal.participantUids?.includes(playerId) || 
                                                   gameDataOriginal.teams?.top?.playerUids?.includes(playerId) || 
                                                   gameDataOriginal.teams?.bottom?.playerUids?.includes(playerId);

                            if (playerInThisGame && gameDataOriginal.timestampCompleted) {
                                const regularGameData: RecalcCompletedGameData = {
                                    ...gameDataOriginal,
                                    gameDocId: gameDoc.id,
                                };
                                playerEvents.push({
                                    type: 'REGULAR_GAME',
                                    timestamp: regularGameData.timestampCompleted,
                                    sourceId: gameDoc.id,
                                    sessionId: summaryDoc.id,
                                    data: regularGameData,
                                });
                            }
                        }
                    }
                }

                // Schritt 2.2: Turnierspiele und Turnier-Abschlüsse sammeln
                for (const tournamentDoc of tournamentsSnapshot.docs) {
                    const tournamentData = tournamentDoc.data() as RecalcTournamentDocData;
                    const tournamentId = tournamentDoc.id;
                    let playerParticipatedInTournament = false;

                    if (tournamentData.playerUids?.includes(playerId)) playerParticipatedInTournament = true;
                    if (!playerParticipatedInTournament && tournamentData.teams?.some(team => team.playerUids.includes(playerId))) playerParticipatedInTournament = true;
                    if (!playerParticipatedInTournament && tournamentData.groups?.some(group => group.playerUids.includes(playerId))) playerParticipatedInTournament = true;

                    if (playerParticipatedInTournament) {
                        const finalizedAtTimestamp = (tournamentDoc.data() as any).finalizedAt as admin.firestore.Timestamp | undefined;
                        if (tournamentData.status === 'completed' && finalizedAtTimestamp) {
                            // Lese das spezifische Ranking für diesen Spieler aus der playerRankings Subcollection
                            const playerRankingRef = db.collection(TOURNAMENTS_COLLECTION).doc(tournamentId).collection("playerRankings").doc(playerId);
                            const playerRankingSnap = await playerRankingRef.get();

                            let determinedPlayerRank: number | undefined = undefined;
                            let determinedTotalParticipants: number | undefined = undefined;
                            let determinedPlayerTeamName: string | undefined = undefined;
                            // Weitere Daten aus dem Ranking-Dokument, falls nötig (z.B. Score, der zum Ranking führte)

                            if (playerRankingSnap.exists) {
                                const rankingData = playerRankingSnap.data();
                                determinedPlayerRank = rankingData?.rank;
                                determinedTotalParticipants = rankingData?.totalParticipantsInRanking;
                                determinedPlayerTeamName = rankingData?.teamName;
                                // TODO: Hier könnten auch rankingData.score, rankingData.wins etc. für Konsistenzprüfungen oder detailliertere Highlights verwendet werden.
                            } else {
                                logger.warn(`[recalculateStats] TOURNAMENT_END (${tournamentId}): No specific ranking document found for player ${playerId} in playerRankings. Stats might be incomplete for this tournament end event.`);
                            }

                            playerEvents.push({
                                type: 'TOURNAMENT_END',
                                timestamp: finalizedAtTimestamp, 
                                sourceId: tournamentId,
                                data: tournamentData,
                                playerRank: determinedPlayerRank,
                                totalRankedParticipants: determinedTotalParticipants,
                                playerTeamName: determinedPlayerTeamName,
                            });
                        }
                        // ... (Sammeln von TOURNAMENT_GAME Events bleibt gleich) ...
                        const tournamentGamesSnapshot = await tournamentDoc.ref.collection(TOURNAMENT_GAMES_SUBCOLLECTION).where("status", "==", "completed").get();
                        for (const gameDoc of tournamentGamesSnapshot.docs) {
                            const gameData = gameDoc.data() as RecalcTournamentGameData;
                            const playerInThisTournamentGame = gameData.participantUids?.includes(playerId) ||
                                                             gameData.teams?.top?.playerUids?.includes(playerId) ||
                                                             gameData.teams?.bottom?.playerUids?.includes(playerId);
                            if (playerInThisTournamentGame && gameData.timestampCompleted) {
                                playerEvents.push({
                                    type: 'TOURNAMENT_GAME',
                                    timestamp: gameData.timestampCompleted,
                                    sourceId: gameDoc.id,
                                    tournamentId: tournamentId,
                                    data: gameData,
                                });
                            }
                        }
                    }
                }
                
                // Schritt 3: Alle Events für den Spieler chronologisch sortieren
                playerEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

                logger.info(`Player ${playerId}: Collected ${playerEvents.length} events. Starting processing...`);

                if (playerEvents.length > 0) {
                    stats.firstJassTimestamp = playerEvents[0].timestamp;
                    stats.lastJassTimestamp = playerEvents[playerEvents.length - 1].timestamp;
                } else {
                    stats.firstJassTimestamp = null;
                    stats.lastJassTimestamp = null;
                }

                // Schritt 4: Events verarbeiten und Statistiken inkrementell aufbauen
                for (const event of playerEvents) {
                    switch (event.type) {
                        case 'REGULAR_GAME':
                            // Logik ähnlich zu updateUserStatsAfterGameCompletion aus archiveGame.ts
                            const rgData = event.data;
                            const rgOutcome = getPlayerGameOutcomeForRecalc(playerId, rgData);
                            
                            stats.totalGames = (stats.totalGames || 0) + 1;
                            stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + (rgData.durationMillis ? rgData.durationMillis / 1000 : 0);

                            if (rgOutcome.result === 'win') stats.gameWins = (stats.gameWins || 0) + 1;
                            else if (rgOutcome.result === 'loss') stats.gameLosses = (stats.gameLosses || 0) + 1;
                            // Unentschiedene Spiele (draws) bei Jass-Spielen werden nicht separat gezählt, beeinflussen aber die Win-Rate nicht negativ.

                            stats.totalPointsMade = (stats.totalPointsMade || 0) + rgOutcome.pointsMade;
                            stats.totalPointsReceived = (stats.totalPointsReceived || 0) + rgOutcome.pointsReceived;
                            // totalPointsDifference wird am Ende berechnet

                            stats.totalStricheMade = (stats.totalStricheMade || 0) + rgOutcome.stricheMade;
                            stats.totalStricheReceived = (stats.totalStricheReceived || 0) + rgOutcome.stricheReceived;
                            // totalStricheDifference wird am Ende berechnet

                            stats.playerTotalWeisMade = (stats.playerTotalWeisMade || 0) + rgOutcome.weisMade;

                            if (rgOutcome.isMatschGame) stats.totalMatschGamesMade = (stats.totalMatschGamesMade || 0) + 1;
                            if (rgOutcome.isSchneiderGame) stats.totalSchneiderGamesMade = (stats.totalSchneiderGamesMade || 0) + 1;
                            if (rgOutcome.isKontermatschMade) stats.totalKontermatschGamesMade = (stats.totalKontermatschGamesMade || 0) + 1;
                            if (rgOutcome.isKontermatschReceived) stats.totalKontermatschGamesReceived = (stats.totalKontermatschGamesReceived || 0) + 1;

                            // Spiel-Highlights (Highest/Lowest Points, Striche, Weis, etc.)
                            updateGameHighlightsForRecalc(stats, rgOutcome, rgData.timestampCompleted, rgData.gameDocId);
                            
                            // Spiel-Streaks
                            updateGameStreaksForRecalc(stats, rgOutcome.result, rgData.timestampCompleted);
                            break;

                        case 'SESSION_END':
                            // Logik ähnlich zu updatePlayerStatsAfterSession aus finalizeSession.ts
                            const seData = event.data;
                            const seOutcome = getSessionOutcomeForRecalc(playerId, seData); // Eigene Version für Neuberechnung

                            stats.totalSessions = (stats.totalSessions || 0) + 1;
                            if (seOutcome.result === 'win') stats.sessionWins = (stats.sessionWins || 0) + 1;
                            else if (seOutcome.result === 'loss') stats.sessionLosses = (stats.sessionLosses || 0) + 1;
                            else if (seOutcome.result === 'tie') stats.sessionTies = (stats.sessionTies || 0) + 1;

                            // Session-Highlights (Points, Striche)
                            updateSessionHighlightsForRecalc(stats, seOutcome, seData, seData.completedAt);

                            // Session-Streaks
                            updateSessionStreaksForRecalc(stats, seOutcome.result, seData.completedAt);
                            break;

                        case 'TOURNAMENT_GAME':
                            // Logik ähnlich zu updateUserStatsAfterTournamentGame aus tournamentGameProcessing.ts
                            const tgData = event.data;
                            const tgOutcome = getPlayerTournamentGameOutcomeForRecalc(playerId, tgData); // Eigene Version

                            stats.totalTournamentGamesPlayed = (stats.totalTournamentGamesPlayed || 0) + 1;
                            stats.totalGames = (stats.totalGames || 0) + 1; // Zählt auch als reguläres Spiel
                            stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + (tgData.durationMillis ? tgData.durationMillis / 1000 : 0);

                            if (tgOutcome.result === 'win') stats.gameWins = (stats.gameWins || 0) + 1;
                            else if (tgOutcome.result === 'loss') stats.gameLosses = (stats.gameLosses || 0) + 1;

                            stats.totalPointsMade = (stats.totalPointsMade || 0) + tgOutcome.pointsMade;
                            stats.totalPointsReceived = (stats.totalPointsReceived || 0) + tgOutcome.pointsReceived;
                            stats.totalStricheMade = (stats.totalStricheMade || 0) + tgOutcome.stricheMade;
                            stats.totalStricheReceived = (stats.totalStricheReceived || 0) + tgOutcome.stricheReceived;
                            stats.playerTotalWeisMade = (stats.playerTotalWeisMade || 0) + tgOutcome.weisMade;

                            if (tgOutcome.isMatschGame) stats.totalMatschGamesMade = (stats.totalMatschGamesMade || 0) + 1;
                            if (tgOutcome.isSchneiderGame) stats.totalSchneiderGamesMade = (stats.totalSchneiderGamesMade || 0) + 1;
                            if (tgOutcome.isKontermatschMade) stats.totalKontermatschGamesMade = (stats.totalKontermatschGamesMade || 0) + 1;
                            if (tgOutcome.isKontermatschReceived) stats.totalKontermatschGamesReceived = (stats.totalKontermatschGamesReceived || 0) + 1;
                            // Hier auch isMatschGameReceived, isSchneiderGameReceived berücksichtigen für Lowlights
                            
                            updateGameHighlightsForRecalc(stats, tgOutcome, tgData.timestampCompleted, tgData.id, true /*isTournamentGame*/);
                            updateGameStreaksForRecalc(stats, tgOutcome.result, tgData.timestampCompleted);
                            break;

                        case 'TOURNAMENT_END':
                            // Logik ähnlich zur Statistik-Aktualisierung in finalizeTournament.ts
                            const teData = event.data;
                            stats.totalTournamentsParticipated = (stats.totalTournamentsParticipated || 0) + 1;
                            
                            // PlayerRank, etc. aus event.data (RecalcTournamentEndEvent) verwenden, falls dort gesetzt
                            // Diese Felder wurden beim Sammeln der Events mit TODO markiert.
                            // Hier müssten wir die Ranking-Logik von finalizeTournament.ts anwenden oder die bereits
                            // im Turnierdokument gespeicherten Rankings verwenden, wenn verfügbar und zuverlässig.
                            const tournamentName = teData.name || "Unbenanntes Turnier";
                            const playerRank = event.playerRank; // Aus dem vorbereiteten Event
                            const totalParticipants = event.totalRankedParticipants;
                            const teamNameSuffix = event.playerTeamName ? ` (Team: ${event.playerTeamName})` : (teData.tournamentMode === 'groupVsGroup' && event.playerTeamName ? ` (Gruppe: ${event.playerTeamName})` : "");

                            if (playerRank && totalParticipants) {
                                if (playerRank === 1) {
                                    stats.tournamentWins = (stats.tournamentWins || 0) + 1;
                                }
                                const currentPlacement: TournamentPlacement = {
                                    tournamentId: event.sourceId,
                                    tournamentName: `${tournamentName}${teamNameSuffix}`,
                                    rank: playerRank,
                                    totalParticipants: totalParticipants,
                                    date: event.timestamp
                                };
                                if (!stats.bestTournamentPlacement || playerRank < stats.bestTournamentPlacement.rank) {
                                    stats.bestTournamentPlacement = currentPlacement;
                                }
                                stats.tournamentPlacements = [currentPlacement, ...(stats.tournamentPlacements || [])].slice(0, 20); // Max 20

                                // Turnier-Highlight hinzufügen
                                const highlightLabel = playerRank === 1 ? 
                                    `Turniersieg: ${tournamentName}${teamNameSuffix}` : 
                                    `Turnierteilnahme: ${tournamentName}${teamNameSuffix} (Rang ${playerRank})`;
                                const tournamentHighlight: StatHighlight = {
                                    type: playerRank === 1 ? (teData.tournamentMode === 'groupVsGroup' ? "tournament_win_group" : "tournament_win") : (teData.tournamentMode === 'groupVsGroup' ? "tournament_participation_group" : "tournament_participation"),
                                    value: playerRank,
                                    stringValue: event.playerTeamName || (teData.tournamentMode === 'groupVsGroup' ? event.playerTeamName : undefined),
                                    date: event.timestamp,
                                    relatedId: event.sourceId,
                                    label: highlightLabel,
                                };
                                stats.highlights = [tournamentHighlight, ...(stats.highlights || [])].slice(0, 50); // Max 50 Highlights
                            } else {
                                logger.warn(`[recalculateStats] Missing rank/participant info for TOURNAMENT_END event ${event.sourceId} for player ${playerId}.`);
                            }
                            break;
                    }
                }

                // Schritt 4.1: Differenzen final berechnen
                stats.totalPointsDifference = (stats.totalPointsMade || 0) - (stats.totalPointsReceived || 0);
                stats.totalStricheDifference = (stats.totalStricheMade || 0) - (stats.totalStricheReceived || 0);

                // Schritt 5: Durchschnittswerte final berechnen (nachdem alle Zähler aktualisiert wurden)
                if (stats.totalGames > 0) {
                    stats.avgPointsPerGame = (stats.totalPointsMade || 0) / stats.totalGames;
                    stats.avgStrichePerGame = (stats.totalStricheMade || 0) / stats.totalGames;
                    stats.avgMatschPerGame = (stats.totalMatschGamesMade || 0) / stats.totalGames;
                    stats.avgSchneiderPerGame = (stats.totalSchneiderGamesMade || 0) / stats.totalGames;
                    stats.avgWeisPointsPerGame = (stats.playerTotalWeisMade || 0) / stats.totalGames;
                    stats.avgKontermatschPerGame = (stats.totalKontermatschGamesMade || 0) / stats.totalGames;
                } else {
                    stats.avgPointsPerGame = 0;
                    stats.avgStrichePerGame = 0;
                    stats.avgMatschPerGame = 0;
                    stats.avgSchneiderPerGame = 0;
                    stats.avgWeisPointsPerGame = 0;
                    stats.avgKontermatschPerGame = 0;
                }
                
                stats.lastUpdateTimestamp = admin.firestore.Timestamp.now(); // Setze finalen Update-Zeitpunkt

                await db.collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(playerId).set(stats, { merge: false }); 
                logger.info(`Player ${playerId}: Stats recalculated and saved.`);
            }

            logger.info("--- recalculateAllPlayerStatistics SUCCESS (Core data gathering and structure in place) ---");
            return { success: true, message: "Neuberechnung der Spielerstatistiken (Datensammlung und Grundstruktur) erfolgreich abgeschlossen." };

        } catch (error) {
            logger.error("--- recalculateAllPlayerStatistics CRITICAL ERROR --- ", error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "Ein interner Fehler ist bei der Neuberechnung der Statistiken aufgetreten.", { errorDetails: (error as Error).message });
        }
    }
); 

// Genaue Implementierung der Hilfsfunktionen
// Diese Funktion ist eine Adaption von getPlayerGameOutcome aus archiveGame.ts
function getPlayerGameOutcomeForRecalc(userId: string, gameData: RecalcCompletedGameData): {
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
  // NEU für Lowlights, falls Gegner Matsch/Schneider gemacht hat
  isMatschGameReceived: boolean; 
  isSchneiderGameReceived: boolean;
  playerTeamKey: 'top' | 'bottom' | null;
  opponentTeamKey: 'top' | 'bottom' | null;
} {
  let playerTeamKey: 'top' | 'bottom' | null = null;
  let opponentTeamKey: 'top' | 'bottom' | null = null;
  
  if (gameData.teams?.bottom?.playerUids?.includes(userId)) {
    playerTeamKey = 'bottom';
    opponentTeamKey = 'top';
  } else if (gameData.teams?.top?.playerUids?.includes(userId)) {
    playerTeamKey = 'top';
    opponentTeamKey = 'bottom';
  }

  if (!playerTeamKey || !opponentTeamKey) {
    logger.warn(`[getPlayerGameOutcomeForRecalc] Could not determine team for player ${userId} in game ${gameData.gameDocId}.`);
    return { result: 'unknown', pointsMade: 0, pointsReceived: 0, stricheMade: 0, stricheReceived: 0, weisMade: 0, isMatschGame: false, isSchneiderGame: false, isKontermatschMade: false, isKontermatschReceived: false, isMatschGameReceived: false, isSchneiderGameReceived: false, playerTeamKey: null, opponentTeamKey: null };
  }

  const pointsMade = gameData.finalScores[playerTeamKey] || 0;
  const pointsReceived = gameData.finalScores[opponentTeamKey] || 0;
  const weisMade = gameData.weisPoints?.[playerTeamKey] || 0; // weisPoints kann undefined sein
  
  const calculateStricheValue = (stricheObj: RecalcCompletedGameData['finalStriche']['top'] | undefined): number => {
    if (!stricheObj) return 0;
    return (stricheObj.berg || 0) + (stricheObj.sieg || 0) + (stricheObj.matsch || 0) + (stricheObj.schneider || 0) + (stricheObj.kontermatsch || 0);
  };

  const stricheMade = calculateStricheValue(gameData.finalStriche?.[playerTeamKey]);
  const stricheReceived = calculateStricheValue(gameData.finalStriche?.[opponentTeamKey]);

  const isMatschGame = (gameData.finalStriche?.[playerTeamKey]?.matsch || 0) > 0;
  const isSchneiderGame = (gameData.finalStriche?.[playerTeamKey]?.schneider || 0) > 0;
  const isKontermatschMade = (gameData.finalStriche?.[playerTeamKey]?.kontermatsch || 0) > 0;
  const isKontermatschReceived = (gameData.finalStriche?.[opponentTeamKey]?.kontermatsch || 0) > 0;
  const isMatschGameReceived = (gameData.finalStriche?.[opponentTeamKey]?.matsch || 0) > 0;
  const isSchneiderGameReceived = (gameData.finalStriche?.[opponentTeamKey]?.schneider || 0) > 0;

  let result: 'win' | 'loss' | 'draw' = 'loss'; 
  if (gameData.winnerTeam === playerTeamKey) {
    result = 'win';
  } else if (gameData.winnerTeam === 'draw') {
    result = 'draw';
  } else if (gameData.winnerTeam === opponentTeamKey) {
    result = 'loss';
  } else { 
    if (pointsMade > pointsReceived) result = 'win';
    else if (pointsMade < pointsReceived) result = 'loss';
    else result = 'draw';
  }

  return { result, pointsMade, pointsReceived, stricheMade, stricheReceived, weisMade, isMatschGame, isSchneiderGame, isKontermatschMade, isKontermatschReceived, isMatschGameReceived, isSchneiderGameReceived, playerTeamKey, opponentTeamKey };
}

function updateGameHighlightsForRecalc(
    stats: PlayerComputedStats, 
    outcome: ReturnType<typeof getPlayerGameOutcomeForRecalc> | ReturnType<typeof getPlayerTournamentGameOutcomeForRecalc>, 
    timestamp: admin.firestore.Timestamp, 
    gameDocId: string, 
    isTournament: boolean = false
) {
    const typeSuffix = isTournament ? "_tournament" : "";
    const gameTypeLabel = isTournament ? ' (Turnier)' : '';

    // Highest Points
    if (!stats.highestPointsGame || outcome.pointsMade > (stats.highestPointsGame.value as number)) {
        stats.highestPointsGame = { type: `highest_points_game${typeSuffix}`, label: `Höchste Punktzahl Spiel${gameTypeLabel}`, value: outcome.pointsMade, date: timestamp, relatedId: gameDocId };
    }
    // Lowest Points (nur wenn Wert tatsächlich niedriger ist als existierender)
    if (!stats.lowestPointsGame || outcome.pointsMade < (stats.lowestPointsGame.value as number)) {
        stats.lowestPointsGame = { type: `lowest_points_game${typeSuffix}`, label: `Niedrigste Punktzahl Spiel${gameTypeLabel}`, value: outcome.pointsMade, date: timestamp, relatedId: gameDocId };
    }
    // Striche Made
    if (!stats.highestStricheGame || outcome.stricheMade > (stats.highestStricheGame.value as number)) {
        stats.highestStricheGame = { type: `highest_striche_game${typeSuffix}`, label: `Höchste Striche Spiel${gameTypeLabel}`, value: outcome.stricheMade, date: timestamp, relatedId: gameDocId };
    }
    // Striche Received
    if (!stats.highestStricheReceivedGame || outcome.stricheReceived > (stats.highestStricheReceivedGame.value as number)) {
        stats.highestStricheReceivedGame = { type: `highest_striche_received_game${typeSuffix}`, label: `Max Striche erhalten Spiel${gameTypeLabel}`, value: outcome.stricheReceived, date: timestamp, relatedId: gameDocId };
    }
    // Weis Made
    if (outcome.weisMade > 0 && (!stats.mostWeisPointsGame || outcome.weisMade > (stats.mostWeisPointsGame.value as number))) {
        stats.mostWeisPointsGame = { type: `most_weis_points_game${typeSuffix}`, label: `Meiste Weispunkte Spiel${gameTypeLabel}`, value: outcome.weisMade, date: timestamp, relatedId: gameDocId };
    }
    // Matsch Made (Striche als Wert)
    if (outcome.isMatschGame && outcome.stricheMade > 0 && (!stats.mostMatschGame || outcome.stricheMade > (stats.mostMatschGame.value as number))) {
        stats.mostMatschGame = { type: `most_matsch_game${typeSuffix}`, label: `Matsch gemacht Spiel${gameTypeLabel} (${outcome.stricheMade} Str.)`, value: outcome.stricheMade, date: timestamp, relatedId: gameDocId };
    }
    // Schneider Made (Striche als Wert)
    if (outcome.isSchneiderGame && outcome.stricheMade > 0 && (!stats.mostSchneiderGame || outcome.stricheMade > (stats.mostSchneiderGame.value as number))) {
        stats.mostSchneiderGame = { type: `most_schneider_game${typeSuffix}`, label: `Schneider gemacht Spiel${gameTypeLabel} (${outcome.stricheMade} Str.)`, value: outcome.stricheMade, date: timestamp, relatedId: gameDocId };
    }
    // Kontermatsch Made (Striche als Wert)
    if (outcome.isKontermatschMade && outcome.stricheMade > 0 && (!stats.mostKontermatschMadeGame || outcome.stricheMade > (stats.mostKontermatschMadeGame.value as number))) {
        stats.mostKontermatschMadeGame = { type: `most_kontermatsch_made_game${typeSuffix}`, label: `Kontermatsch gemacht Spiel${gameTypeLabel} (${outcome.stricheMade} Str.)`, value: outcome.stricheMade, date: timestamp, relatedId: gameDocId };
    }
    // Matsch Received (Erhaltene Striche als Wert)
    if (outcome.isMatschGameReceived && outcome.stricheReceived > 0 && (!stats.mostMatschReceivedGame || outcome.stricheReceived > (stats.mostMatschReceivedGame.value as number))) {
        stats.mostMatschReceivedGame = { type: `most_matsch_received_game${typeSuffix}`, label: `Matsch erhalten Spiel${gameTypeLabel} (${outcome.stricheReceived} Str.)`, value: outcome.stricheReceived, date: timestamp, relatedId: gameDocId };
    }
    // Schneider Received (Erhaltene Striche als Wert)
    if (outcome.isSchneiderGameReceived && outcome.stricheReceived > 0 && (!stats.mostSchneiderReceivedGame || outcome.stricheReceived > (stats.mostSchneiderReceivedGame.value as number))) {
        stats.mostSchneiderReceivedGame = { type: `most_schneider_received_game${typeSuffix}`, label: `Schneider erhalten Spiel${gameTypeLabel} (${outcome.stricheReceived} Str.)`, value: outcome.stricheReceived, date: timestamp, relatedId: gameDocId };
    }
    // Kontermatsch Received (Erhaltene Striche als Wert)
    if (outcome.isKontermatschReceived && outcome.stricheReceived > 0 && (!stats.mostKontermatschReceivedGame || outcome.stricheReceived > (stats.mostKontermatschReceivedGame.value as number))) {
        stats.mostKontermatschReceivedGame = { type: `most_kontermatsch_received_game${typeSuffix}`, label: `Kontermatsch erhalten Spiel${gameTypeLabel} (${outcome.stricheReceived} Str.)`, value: outcome.stricheReceived, date: timestamp, relatedId: gameDocId };
    }
}

function updateGameStreaksForRecalc(stats: PlayerComputedStats, result: 'win' | 'loss' | 'draw' | 'unknown', timestamp: admin.firestore.Timestamp) {
    if (result === 'win') {
        stats.currentGameWinStreak = (stats.currentGameWinStreak || 0) + 1;
        stats.currentGameLossStreak = 0;
        stats.currentGameWinlessStreak = 0;
        if (!stats.longestWinStreakGames || stats.currentGameWinStreak > stats.longestWinStreakGames.value) {
            stats.longestWinStreakGames = { value: stats.currentGameWinStreak, startDate: stats.currentGameWinStreak === 1 ? timestamp : stats.longestWinStreakGames?.startDate || timestamp, endDate: timestamp };
        }
    } else if (result === 'loss') {
        stats.currentGameLossStreak = (stats.currentGameLossStreak || 0) + 1;
        stats.currentGameWinStreak = 0;
        stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
        if (!stats.longestLossStreakGames || stats.currentGameLossStreak > stats.longestLossStreakGames.value) {
            stats.longestLossStreakGames = { value: stats.currentGameLossStreak, startDate: stats.currentGameLossStreak === 1 ? timestamp : stats.longestLossStreakGames?.startDate || timestamp, endDate: timestamp };
        }
        if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = { value: stats.currentGameWinlessStreak, startDate: stats.currentGameWinlessStreak === 1 ? timestamp : stats.longestWinlessStreakGames?.startDate || timestamp, endDate: timestamp };
        }
    } else { // draw or unknown
        stats.currentGameWinStreak = 0;
        stats.currentGameLossStreak = 0;
        stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
        if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
            stats.longestWinlessStreakGames = { value: stats.currentGameWinlessStreak, startDate: stats.currentGameWinlessStreak === 1 ? timestamp : stats.longestWinlessStreakGames?.startDate || timestamp, endDate: timestamp };
        }
    }
}

function getSessionOutcomeForRecalc(playerId: string, sessionData: RecalcSessionData): {
    result: 'win' | 'loss' | 'tie';
    playerTeamKey: 'teamA' | 'teamB' | null;
    pointsMade: number;
    pointsReceived: number;
    stricheMadeInSession: number; // Gesamte Striche des Spieler-Teams in der Session
    stricheReceivedInSession: number; // Gesamte Striche des Gegner-Teams in der Session
} {
    let playerTeamKey: 'teamA' | 'teamB' | null = null;
    let opponentTeamKey: 'teamA' | 'teamB' | null = null;

    if (sessionData.teams?.teamA?.players?.find(p => p.playerId === playerId)) {
        playerTeamKey = 'teamA';
        opponentTeamKey = 'teamB';
    } else if (sessionData.teams?.teamB?.players?.find(p => p.playerId === playerId)) {
        playerTeamKey = 'teamB';
        opponentTeamKey = 'teamA';
    }

    let outcomeResult: 'win' | 'loss' | 'tie' = 'tie'; // Default zu tie bei Unsicherheit

    if (sessionData.winnerTeamKey && playerTeamKey) {
        if (sessionData.winnerTeamKey === 'draw') outcomeResult = 'tie';
        else if (sessionData.winnerTeamKey === playerTeamKey) outcomeResult = 'win';
        else outcomeResult = 'loss';
    } else if (playerTeamKey && opponentTeamKey && sessionData.teams && sessionData.finalScores) {
        const mapping = sessionData.teamScoreMapping;
        let playerTeamPosition: 'top' | 'bottom' | undefined;
        let opponentTeamPosition: 'top' | 'bottom' | undefined;

        if (mapping) {
            if (playerTeamKey === 'teamA') playerTeamPosition = mapping.teamA;
            else playerTeamPosition = mapping.teamB; // playerTeamKey === 'teamB'
            if (opponentTeamKey === 'teamA') playerTeamPosition = mapping.teamA; // Korrektur: opponentTeamPosition setzen
            else opponentTeamPosition = mapping.teamB; // opponentTeamKey === 'teamB'

        } else {
            // Fallback-Annahme ohne explizite Zuordnung
            playerTeamPosition = playerTeamKey === 'teamA' ? 'bottom' : 'top';
            opponentTeamPosition = opponentTeamKey === 'teamA' ? 'bottom' : 'top';
        }
        
        if (!playerTeamPosition || !opponentTeamPosition || playerTeamPosition === opponentTeamPosition) {
            logger.warn(`[getSessionOutcomeForRecalc] Invalid or missing team score mapping for session ${sessionData.sessionId}. Player: ${playerId}`);
            outcomeResult = 'tie';
        } else {
            const scorePlayerTeam = sessionData.finalScores[playerTeamPosition] || 0;
            const scoreOpponentTeam = sessionData.finalScores[opponentTeamPosition] || 0;
            if (scorePlayerTeam > scoreOpponentTeam) outcomeResult = 'win';
            else if (scorePlayerTeam < scoreOpponentTeam) outcomeResult = 'loss';
            else outcomeResult = 'tie';
        }
    } else {
        logger.warn(`[getSessionOutcomeForRecalc] Could not determine session outcome for player ${playerId} in session ${sessionData.sessionId}. Defaulting to 'tie'.`);
    }

    const calculateTotalStriche = (stricheRecord: RecalcStricheRecord | undefined): number => {
        if (!stricheRecord) return 0;
        return (stricheRecord.berg || 0) + (stricheRecord.sieg || 0) + (stricheRecord.matsch || 0) + (stricheRecord.schneider || 0) + (stricheRecord.kontermatsch || 0);
    };

    let pointsMade = 0;
    let pointsReceived = 0;
    let stricheMadeInSession = 0;
    let stricheReceivedInSession = 0;

    if (playerTeamKey && opponentTeamKey && sessionData.finalScores) {
        const playerPos = playerTeamKey === 'teamA' ? (sessionData.teamScoreMapping?.teamA || 'bottom') : (sessionData.teamScoreMapping?.teamB || 'top');
        const opponentPos = opponentTeamKey === 'teamA' ? (sessionData.teamScoreMapping?.teamA || 'bottom') : (sessionData.teamScoreMapping?.teamB || 'top');
        
        // Sicherstellen, dass playerPos und opponentPos unterschiedlich sind, wenn mapping vorhanden
        if (sessionData.teamScoreMapping && playerPos === opponentPos) {
             logger.warn(`[getSessionOutcomeForRecalc] Ambiguous score positions from mapping for session ${sessionData.sessionId}. Player: ${playerId}`);
        } else {
            pointsMade = sessionData.finalScores[playerPos] || 0;
            pointsReceived = sessionData.finalScores[opponentPos] || 0;

            if (sessionData.finalStriche) {
                stricheMadeInSession = calculateTotalStriche(sessionData.finalStriche[playerPos]);
                stricheReceivedInSession = calculateTotalStriche(sessionData.finalStriche[opponentPos]);
            }
        }
    } else if (playerTeamKey && sessionData.finalScores) { // Fallback, falls opponentTeamKey nicht klar, aber playerTeamKey schon
        const playerPos = playerTeamKey === 'teamA' ? 'bottom' : 'top'; // Standardannahme
        const opponentPos = playerTeamKey === 'teamA' ? 'top' : 'bottom';
        pointsMade = sessionData.finalScores[playerPos] || 0;
        pointsReceived = sessionData.finalScores[opponentPos] || 0;
        if (sessionData.finalStriche) {
            stricheMadeInSession = calculateTotalStriche(sessionData.finalStriche[playerPos]);
            stricheReceivedInSession = calculateTotalStriche(sessionData.finalStriche[opponentPos]);
        }
    }

    return {
        result: outcomeResult,
        playerTeamKey,
        pointsMade,
        pointsReceived,
        stricheMadeInSession,
        stricheReceivedInSession,
    };
}

function updateSessionHighlightsForRecalc(
    stats: PlayerComputedStats, 
    outcome: ReturnType<typeof getSessionOutcomeForRecalc>, 
    sessionData: RecalcSessionData, 
    timestamp: admin.firestore.Timestamp
) {
    // Highest Points Session
    if (outcome.pointsMade > 0 && (!stats.highestPointsSession || outcome.pointsMade > (stats.highestPointsSession.value as number))) {
        stats.highestPointsSession = { type: "highest_points_session", label: "Höchste Punkte Partie", value: outcome.pointsMade, date: timestamp, relatedId: sessionData.sessionId };
    }
    // Lowest Points Session (niedrigste erreichte Punktzahl in einer Session, kann auch bei Sieg niedrig sein)
    if (!stats.lowestPointsSession || outcome.pointsMade < (stats.lowestPointsSession.value as number)) {
         stats.lowestPointsSession = { type: "lowest_points_session", label: "Niedrigste Punkte Partie", value: outcome.pointsMade, date: timestamp, relatedId: sessionData.sessionId };
    }
    // Highest Striche Session (basierend auf den Strichen des eigenen Teams in der Session)
    if (outcome.stricheMadeInSession > 0 && (!stats.highestStricheSession || outcome.stricheMadeInSession > (stats.highestStricheSession.value as number))) {
        stats.highestStricheSession = { type: "highest_striche_session", label: "Höchste Striche Partie", value: outcome.stricheMadeInSession, date: timestamp, relatedId: sessionData.sessionId };
    }
    // Highest Striche Received Session (basierend auf den Strichen des Gegnerteams in der Session)
     if (outcome.stricheReceivedInSession > 0 && (!stats.highestStricheReceivedSession || outcome.stricheReceivedInSession > (stats.highestStricheReceivedSession.value as number))) {
        stats.highestStricheReceivedSession = { type: "highest_striche_received_session", label: "Max Striche erhalten Partie", value: outcome.stricheReceivedInSession, date: timestamp, relatedId: sessionData.sessionId };
    }
}

function updateSessionStreaksForRecalc(stats: PlayerComputedStats, result: 'win' | 'loss' | 'tie', timestamp: admin.firestore.Timestamp) {
    if (result === 'win') {
        stats.currentSessionWinStreak = (stats.currentSessionWinStreak || 0) + 1;
        stats.currentSessionLossStreak = 0;
        stats.currentSessionWinlessStreak = 0;
        if (!stats.longestWinStreakSessions || stats.currentSessionWinStreak > stats.longestWinStreakSessions.value) {
            stats.longestWinStreakSessions = { value: stats.currentSessionWinStreak, startDate: stats.currentSessionWinStreak === 1 ? timestamp : stats.longestWinStreakSessions?.startDate || timestamp, endDate: timestamp };
        }
    } else if (result === 'loss') {
        stats.currentSessionLossStreak = (stats.currentSessionLossStreak || 0) + 1;
        stats.currentSessionWinStreak = 0;
        stats.currentSessionWinlessStreak = (stats.currentSessionWinlessStreak || 0) + 1;
        if (!stats.longestLossStreakSessions || stats.currentSessionLossStreak > stats.longestLossStreakSessions.value) {
            stats.longestLossStreakSessions = { value: stats.currentSessionLossStreak, startDate: stats.currentSessionLossStreak === 1 ? timestamp : stats.longestLossStreakSessions?.startDate || timestamp, endDate: timestamp };
        }
        if (!stats.longestWinlessStreakSessions || stats.currentSessionWinlessStreak > stats.longestWinlessStreakSessions.value) {
            stats.longestWinlessStreakSessions = { value: stats.currentSessionWinlessStreak, startDate: stats.currentSessionWinlessStreak === 1 ? timestamp : stats.longestWinlessStreakSessions?.startDate || timestamp, endDate: timestamp };
        }
    } else { // tie
        stats.currentSessionWinStreak = 0;
        stats.currentSessionLossStreak = 0;
        stats.currentSessionWinlessStreak = (stats.currentSessionWinlessStreak || 0) + 1;
        if (!stats.longestWinlessStreakSessions || stats.currentSessionWinlessStreak > stats.longestWinlessStreakSessions.value) {
            stats.longestWinlessStreakSessions = { value: stats.currentSessionWinlessStreak, startDate: stats.currentSessionWinlessStreak === 1 ? timestamp : stats.longestWinlessStreakSessions?.startDate || timestamp, endDate: timestamp };
        }
    }
}

function getPlayerTournamentGameOutcomeForRecalc(userId: string, gameData: RecalcTournamentGameData): ReturnType<typeof getPlayerGameOutcomeForRecalc> { // Gleicher Rückgabetyp wie für normale Spiele
    // Diese Funktion ist eine Adaption von getPlayerTournamentGameOutcome aus tournamentGameProcessing.ts
    let playerTeamKey: 'top' | 'bottom' | null = null;
    let opponentTeamKey: 'top' | 'bottom' | null = null;

    if (gameData.teams?.bottom?.playerUids?.includes(userId)) {
        playerTeamKey = 'bottom';
        opponentTeamKey = 'top';
    } else if (gameData.teams?.top?.playerUids?.includes(userId)) {
        playerTeamKey = 'top';
        opponentTeamKey = 'bottom';
    }

    if (!playerTeamKey || !opponentTeamKey) {
        logger.warn(`[getPlayerTournamentGameOutcomeForRecalc] Could not determine team for player ${userId} in tournament game ${gameData.id}.`);
        return { result: 'unknown', pointsMade: 0, pointsReceived: 0, stricheMade: 0, stricheReceived: 0, weisMade: 0, isMatschGame: false, isSchneiderGame: false, isKontermatschMade: false, isKontermatschReceived: false, isMatschGameReceived: false, isSchneiderGameReceived: false, playerTeamKey: null, opponentTeamKey: null };
    }

    const pointsMade = gameData.finalScores[playerTeamKey] || 0;
    const pointsReceived = gameData.finalScores[opponentTeamKey] || 0;
    const weisMade = gameData.weisPoints?.[playerTeamKey] || 0;

    const calculateStricheValue = (stricheObj: RecalcTournamentGameData['finalStriche']['top'] | undefined): number => {
        if (!stricheObj) return 0;
        return (stricheObj.berg || 0) + (stricheObj.sieg || 0) + (stricheObj.matsch || 0) + (stricheObj.schneider || 0) + (stricheObj.kontermatsch || 0);
    };

    const stricheMade = calculateStricheValue(gameData.finalStriche?.[playerTeamKey]);
    const stricheReceived = calculateStricheValue(gameData.finalStriche?.[opponentTeamKey]);

    const isMatschGame = (gameData.finalStriche?.[playerTeamKey]?.matsch || 0) > 0;
    const isSchneiderGame = (gameData.finalStriche?.[playerTeamKey]?.schneider || 0) > 0;
    const isKontermatschMade = (gameData.finalStriche?.[playerTeamKey]?.kontermatsch || 0) > 0;
    const isKontermatschReceived = (gameData.finalStriche?.[opponentTeamKey]?.kontermatsch || 0) > 0;
    const isMatschGameReceived = (gameData.finalStriche?.[opponentTeamKey]?.matsch || 0) > 0;
    const isSchneiderGameReceived = (gameData.finalStriche?.[opponentTeamKey]?.schneider || 0) > 0;

    let result: 'win' | 'loss' | 'draw' = 'loss';
    if (gameData.winnerTeam === playerTeamKey) result = 'win';
    else if (gameData.winnerTeam === 'draw') result = 'draw';
    else if (gameData.winnerTeam === opponentTeamKey) result = 'loss';
    else {
        if (pointsMade > pointsReceived) result = 'win';
        else if (pointsMade < pointsReceived) result = 'loss';
        else result = 'draw';
    }
    return { result, pointsMade, pointsReceived, stricheMade, stricheReceived, weisMade, isMatschGame, isSchneiderGame, isKontermatschMade, isKontermatschReceived, isMatschGameReceived, isSchneiderGameReceived, playerTeamKey, opponentTeamKey };
} 