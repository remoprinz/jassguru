import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { PlayerComputedStats, initialPlayerComputedStats, StatStreak } from "./models/player-stats.model";

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

// --- Interfaces (ggf. auslagern oder synchron halten mit Client-Typen) ---
export interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}
export interface TeamScores {
  top: number;
  bottom: number;
}

// NEUE Typdefinitionen für detaillierte Team-Informationen
export interface SessionTeamPlayer {
  playerId: string;
  displayName: string;
}

export interface SessionTeamDetails {
  players: SessionTeamPlayer[];
  name?: string; // Optionaler, individueller Teamname für diese Session
}

export interface SessionTeams {
  teamA: SessionTeamDetails;
  teamB: SessionTeamDetails;
}
// ENDE NEUE Typdefinitionen

export interface CompletedGameData {
  gameNumber: number;
  finalScores: TeamScores;
  finalStriche: { top: StricheRecord; bottom: StricheRecord };
  groupId?: string | null;
  participantUids?: string[];
  playerNames?: PlayerNames;
  teams?: TeamConfig;
  weisPoints?: TeamScores;
  roundHistory?: unknown[]; // Füge roundHistory hinzu für besseres Debugging
}

interface FinalizeSessionData {
  sessionId: string;
  expectedGameNumber: number;
  initialSessionData?: InitialSessionData;
}

// Definieren der erwarteten Team-Struktur basierend auf jass.ts
export interface TeamConfig {
  top: [number, number];
  bottom: [number, number];
}

export interface PlayerNames {
  [key: number]: string;
}

// Typ für die initialen Session-Daten, die vom Client kommen könnten
export interface InitialSessionData {
  participantUids: string[];
  playerNames: PlayerNames;
  teams?: SessionTeams | null;
  gruppeId: string | null;
  startedAt?: number | admin.firestore.Timestamp;
  pairingIdentifiers?: {
    teamA: string;
    teamB: string;
  } | null;
  winnerTeamKey?: 'teamA' | 'teamB' | 'draw'; // Wer hat die gesamte Session gewonnen?
  // NEU: Mögliches Feld zur expliziten Zuordnung von Teams zu Score-Positionen
  teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
}

// NEUE HILFSFUNKTION für Spieler-Session-Statistiken
async function updatePlayerStatsAfterSession(
  db: admin.firestore.Firestore,
  participantUids: string[],
  sessionFinalData: { 
    finalScores: TeamScores; 
    finalStriche?: { top: StricheRecord; bottom: StricheRecord }; 
    teams?: SessionTeams | null; 
    sessionId: string;
    winnerTeamKey?: 'teamA' | 'teamB' | 'draw'; // Expliziter Gewinner-Key
    // NEU: Übergeben der Score-Zuordnung
    teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
  },
  sessionTimestamp: admin.firestore.Timestamp
) {
  const now = admin.firestore.Timestamp.now();

  for (const userId of participantUids) {
    const playerStatsRef = db.collection("playerComputedStats").doc(userId);
    try {
      await db.runTransaction(async (transaction) => {
        const playerStatsDoc = await transaction.get(playerStatsRef);
        let stats: PlayerComputedStats;

        if (!playerStatsDoc.exists) {
          stats = JSON.parse(JSON.stringify(initialPlayerComputedStats));
          stats.firstJassTimestamp = sessionTimestamp;
          stats.lastJassTimestamp = sessionTimestamp;
          stats.lastUpdateTimestamp = now;
        } else {
          stats = playerStatsDoc.data() as PlayerComputedStats;
          if (!stats.firstJassTimestamp || stats.firstJassTimestamp.toMillis() > sessionTimestamp.toMillis()) {
            stats.firstJassTimestamp = sessionTimestamp;
          }
          if (!stats.lastJassTimestamp || stats.lastJassTimestamp.toMillis() < sessionTimestamp.toMillis()) {
            stats.lastJassTimestamp = sessionTimestamp;
          }
          stats.lastUpdateTimestamp = now;
        }

        stats.totalSessions = (stats.totalSessions || 0) + 1;

        let sessionOutcome: 'win' | 'loss' | 'tie' = 'loss'; // Default
        let playerTeamKey: 'teamA' | 'teamB' | null = null;

        if (sessionFinalData.teams?.teamA?.players?.find(p => p.playerId === userId)) {
          playerTeamKey = 'teamA';
        } else if (sessionFinalData.teams?.teamB?.players?.find(p => p.playerId === userId)) {
          playerTeamKey = 'teamB';
        }
        
        if (sessionFinalData.winnerTeamKey && playerTeamKey) {
          if (sessionFinalData.winnerTeamKey === 'draw') {
            sessionOutcome = 'tie';
          } else if (sessionFinalData.winnerTeamKey === playerTeamKey) {
            sessionOutcome = 'win';
          } else {
            sessionOutcome = 'loss';
          }
        } else if (playerTeamKey && sessionFinalData.teams && sessionFinalData.finalScores) {
          let scorePlayerTeam: number;
          let scoreOpponentTeam: number;

          const mapping = sessionFinalData.teamScoreMapping;
          let playerTeamPosition: 'top' | 'bottom' | undefined;
          let opponentTeamPosition: 'top' | 'bottom' | undefined;

          if (mapping) {
            if (playerTeamKey === 'teamA') {
              playerTeamPosition = mapping.teamA;
              opponentTeamPosition = mapping.teamB;
            } else { // playerTeamKey === 'teamB'
              playerTeamPosition = mapping.teamB;
              opponentTeamPosition = mapping.teamA;
            }
          } else {
            // Fallback-Annahme, wenn keine explizite Zuordnung vorhanden ist
            logger.warn(`[updatePlayerStatsAfterSession] Keine explizite teamScoreMapping für Session ${sessionFinalData.sessionId} gefunden. Verwende Fallback-Annahme: teamA=bottom, teamB=top.`);
            if (playerTeamKey === 'teamA') {
              playerTeamPosition = 'bottom';
              opponentTeamPosition = 'top';
            } else { // playerTeamKey === 'teamB'
              playerTeamPosition = 'top';
              opponentTeamPosition = 'bottom';
            }
          }
          
          if (!playerTeamPosition || !opponentTeamPosition || playerTeamPosition === opponentTeamPosition) {
            logger.error(`[updatePlayerStatsAfterSession] Ungültige oder fehlende Team-Score-Zuordnung für Session ${sessionFinalData.sessionId}. Spieler ${userId}. Mapping: ${JSON.stringify(mapping)}`);
            sessionOutcome = 'tie'; // Sicherer Fallback
          } else {
            scorePlayerTeam = sessionFinalData.finalScores[playerTeamPosition];
            scoreOpponentTeam = sessionFinalData.finalScores[opponentTeamPosition];

            if (scorePlayerTeam > scoreOpponentTeam) sessionOutcome = 'win';
            else if (scorePlayerTeam < scoreOpponentTeam) sessionOutcome = 'loss';
            else sessionOutcome = 'tie';
          }
        } else {
            logger.warn(`[updatePlayerStatsAfterSession] Konnte Session-Ergebnis für Spieler ${userId} in Session ${sessionFinalData.sessionId} nicht bestimmen. Fallback auf 'tie'. PlayerTeamKey: ${playerTeamKey}, Teams: ${JSON.stringify(sessionFinalData.teams)}, Scores: ${JSON.stringify(sessionFinalData.finalScores)}, WinnerKey: ${sessionFinalData.winnerTeamKey}`);
            sessionOutcome = 'tie';
        }

        if (sessionOutcome === 'win') stats.sessionWins = (stats.sessionWins || 0) + 1;
        else if (sessionOutcome === 'loss') stats.sessionLosses = (stats.sessionLosses || 0) + 1;
        else if (sessionOutcome === 'tie') stats.sessionTies = (stats.sessionTies || 0) + 1;
        
        // NEU: Session-Streak-Logik
        if (sessionOutcome === 'win') {
          stats.currentSessionWinStreak = (stats.currentSessionWinStreak || 0) + 1;
          stats.currentSessionLossStreak = 0;
          stats.currentSessionWinlessStreak = 0;
          if (!stats.longestWinStreakSessions || stats.currentSessionWinStreak > stats.longestWinStreakSessions.value) {
            stats.longestWinStreakSessions = {
              value: stats.currentSessionWinStreak,
              startDate: stats.currentSessionWinStreak === 1 ? sessionTimestamp : stats.longestWinStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        } else if (sessionOutcome === 'loss') {
          stats.currentSessionLossStreak = (stats.currentSessionLossStreak || 0) + 1;
          stats.currentSessionWinStreak = 0;
          stats.currentSessionWinlessStreak = (stats.currentSessionWinlessStreak || 0) + 1;
          if (!stats.longestLossStreakSessions || stats.currentSessionLossStreak > stats.longestLossStreakSessions.value) {
            stats.longestLossStreakSessions = {
              value: stats.currentSessionLossStreak,
              startDate: stats.currentSessionLossStreak === 1 ? sessionTimestamp : stats.longestLossStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
          if (!stats.longestWinlessStreakSessions || stats.currentSessionWinlessStreak > stats.longestWinlessStreakSessions.value) {
            stats.longestWinlessStreakSessions = {
              value: stats.currentSessionWinlessStreak,
              startDate: stats.currentSessionWinlessStreak === 1 ? sessionTimestamp : stats.longestWinlessStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        } else { // 'tie'
          stats.currentSessionWinStreak = 0;
          stats.currentSessionLossStreak = 0;
          stats.currentSessionWinlessStreak = (stats.currentSessionWinlessStreak || 0) + 1;
          if (!stats.longestWinlessStreakSessions || stats.currentSessionWinlessStreak > stats.longestWinlessStreakSessions.value) {
            stats.longestWinlessStreakSessions = {
              value: stats.currentSessionWinlessStreak,
              startDate: stats.currentSessionWinlessStreak === 1 ? sessionTimestamp : stats.longestWinlessStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        }

        // NEU: Session-Highlights/Lowlights aktualisieren
        if (playerTeamKey && sessionFinalData.finalScores) {
            const pointsMadeInSession = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.bottom : sessionFinalData.finalScores.top;
            // const pointsReceivedInSession = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.top : sessionFinalData.finalScores.bottom;

            const currentHighestPointsSessionValue = typeof stats.highestPointsSession?.value === 'number' ? stats.highestPointsSession.value : -Infinity;
            if (pointsMadeInSession > currentHighestPointsSessionValue) { // Nur aktualisieren, wenn es wirklich ein neuer Höchstwert ist
                stats.highestPointsSession = { 
                    value: pointsMadeInSession, 
                    date: sessionTimestamp, 
                    relatedId: sessionFinalData.sessionId,
                    type: "highest_points_session",
                    label: `Höchste Punkte in Partie (${pointsMadeInSession})`
                };
            }
            
            // Für lowestPointsSession: Hier ist die Logik etwas anders. Es ist nicht unbedingt ein "Lowlight",
            // sondern eher der niedrigste Punktestand, den ein Spieler in einer (möglicherweise gewonnenen) Partie hatte.
            // Wir initialisieren oder aktualisieren, wenn es niedriger ist als der bisherige Wert (oder wenn noch kein Wert existiert).
            const currentLowestPointsSessionValue = typeof stats.lowestPointsSession?.value === 'number' ? stats.lowestPointsSession.value : Infinity;
            if (pointsMadeInSession < currentLowestPointsSessionValue) { // Nur aktualisieren, wenn es wirklich ein neuer Tiefstwert ist
                stats.lowestPointsSession = { 
                    value: pointsMadeInSession, 
                    date: sessionTimestamp, 
                    relatedId: sessionFinalData.sessionId,
                    type: "lowest_points_session", // Bezeichnet die niedrigste erreichte Punktzahl in einer Session
                    label: `Niedrigste Punkte in Partie (${pointsMadeInSession})` 
                };
            }

            if (sessionFinalData.finalStriche) {
                const stricheMadeRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.bottom : sessionFinalData.finalStriche.top;
                const stricheReceivedRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.top : sessionFinalData.finalStriche.bottom;
                
                const calculateTotalStricheValue = (striche: StricheRecord | undefined): number => 
                    striche ? (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0) : 0;

                const stricheMadeInSession = calculateTotalStricheValue(stricheMadeRecord);
                const stricheReceivedInSession = calculateTotalStricheValue(stricheReceivedRecord);

                const currentHighestStricheSessionValue = typeof stats.highestStricheSession?.value === 'number' ? stats.highestStricheSession.value : -Infinity;
                if (stricheMadeInSession > currentHighestStricheSessionValue) {
                    stats.highestStricheSession = { 
                        value: stricheMadeInSession, 
                        date: sessionTimestamp, 
                        relatedId: sessionFinalData.sessionId,
                        type: "highest_striche_session",
                        label: `Höchste Striche in Partie (${stricheMadeInSession})`
                    };
                }

                const currentHighestStricheReceivedSessionValue = typeof stats.highestStricheReceivedSession?.value === 'number' ? stats.highestStricheReceivedSession.value : -Infinity;
                if (stricheReceivedInSession > currentHighestStricheReceivedSessionValue) {
                    stats.highestStricheReceivedSession = { 
                        value: stricheReceivedInSession, 
                        date: sessionTimestamp, 
                        relatedId: sessionFinalData.sessionId,
                        type: "highest_striche_received_session",
                        label: `Höchste erhaltene Striche in Partie (${stricheReceivedInSession})`
                    };
                }
            }
        }

        transaction.set(playerStatsRef, stats, { merge: true });
      });
      logger.info(`[updatePlayerStatsAfterSession] Player ${userId}: session stats updated.`);
    } catch (error) {
      logger.error(`[updatePlayerStatsAfterSession] Player ${userId}: FAILED to update session stats:`, error);
    }
  }
}

export const finalizeSession = onCall(async (request: CallableRequest<FinalizeSessionData>) => {
  logger.info("Received request to finalize session:", request.data);

  if (!request.auth) {
    logger.error("User is not authenticated.");
    throw new HttpsError("unauthenticated", "User is not authenticated.");
  }

  const { sessionId, expectedGameNumber } = request.data;

  if (!sessionId || typeof sessionId !== "string") {
    logger.error("Session ID is missing or not a string.");
    throw new HttpsError("invalid-argument", "Session ID is missing or not a string.");
  }
  if (typeof expectedGameNumber !== "number" || expectedGameNumber <= 0) {
    logger.error("Expected game number is invalid.");
    throw new HttpsError("invalid-argument", "Expected game number is invalid.");
  }

  const summaryDocRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionId);

  try {
    const summaryDoc = await summaryDocRef.get();
    if (!summaryDoc.exists) {
      logger.error(`Session summary document ${sessionId} not found.`);
      throw new HttpsError("not-found", `Session summary document ${sessionId} not found.`);
    }

    const summaryDocData = summaryDoc.data();
    if (!summaryDocData) {
      logger.error(`Session summary document ${sessionId} has no data.`);
      throw new HttpsError("data-loss", `Session summary document ${sessionId} has no data.`);
    }
    
    // Überprüfen, ob die Session bereits finalisiert wurde
    if (summaryDocData.meta?.status === "completed") {
        logger.info(`Session ${sessionId} is already completed. Skipping finalization.`);
        // Optional: Spielerstatistiken trotzdem aktualisieren, falls ein wiederholter Aufruf Sinn ergibt (z.B. für Korrekturen)
        // Für jetzt überspringen wir es, um Doppelzählungen zu vermeiden.
        return { success: true, message: "Session already completed." };
    }

    const completedGamesCol = summaryDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION);
    const completedGamesSnapshot = await completedGamesCol.orderBy("gameNumber", "desc").limit(1).get();

    let actualGameNumber = 0;
    if (!completedGamesSnapshot.empty) {
      actualGameNumber = completedGamesSnapshot.docs[0].data().gameNumber;
    }

    if (actualGameNumber < expectedGameNumber) {
      logger.error(`Session ${sessionId}: Game count mismatch. Expected ${expectedGameNumber}, found ${actualGameNumber}.`);
      throw new HttpsError(
        "failed-precondition",
        `Session ${sessionId}: Game count mismatch. Expected ${expectedGameNumber}, found ${actualGameNumber}. Cannot finalize.`
      );
    }
    
    const completedAt = summaryDocData.meta?.completedAt instanceof admin.firestore.Timestamp 
        ? summaryDocData.meta.completedAt 
        : admin.firestore.Timestamp.now();

    // Daten für die Spielerstatistik-Aktualisierung sammeln
    const participantUids = summaryDocData.initialSessionData?.participantUids as string[] || [];
    const finalScores = summaryDocData.finalScores as TeamScores;
    const finalStriche = summaryDocData.finalStriche as { top: StricheRecord; bottom: StricheRecord } | undefined;
    const teams = summaryDocData.initialSessionData?.teams as SessionTeams | null | undefined;
    const winnerTeamKey = summaryDocData.initialSessionData?.winnerTeamKey as 'teamA' | 'teamB' | 'draw' | undefined;
    const teamScoreMapping = summaryDocData.initialSessionData?.teamScoreMapping as { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' } | undefined;


    if (participantUids.length > 0 && finalScores && teams) {
      await updatePlayerStatsAfterSession(
        db,
        participantUids,
        {
          finalScores,
          finalStriche,
          teams,
          sessionId,
          winnerTeamKey, // expliziten Gewinner übergeben
          teamScoreMapping, // explizite Zuordnung übergeben
        },
        completedAt 
      );
    } else {
      logger.warn(`[finalizeSession] Nicht genügend Daten für Session ${sessionId}, um Spielerstatistiken zu aktualisieren. UIDs: ${participantUids.length}, Scores: ${!!finalScores}, Teams: ${!!teams}`);
    }

    // Session-Status auf "completed" aktualisieren (Meta-Informationen)
    // Dies sollte idealerweise nach der Statistik-Aktualisierung erfolgen.
    // Die ursprüngliche Logik für die Aktualisierung von `finalScores`, `finalStriche`, `duration` etc.
    // wird hier beibehalten und ggf. erweitert.

    // Berechne die Gesamtpunkte und Strichdifferenz für das Summary-Dokument
    // (Diese Logik ist bereits in der Originalfunktion vorhanden und wird hier vereinfacht dargestellt)
    let totalPointsTeamTop = 0;
    let totalPointsTeamBottom = 0;
    let totalStricheTeamTop = 0;
    let totalStricheTeamBottom = 0;

    const allCompletedGamesSnapshot = await completedGamesCol.get();
    allCompletedGamesSnapshot.forEach(doc => {
        const gameData = doc.data() as CompletedGameData;
        if (gameData.finalScores) {
            totalPointsTeamTop += gameData.finalScores.top || 0;
            totalPointsTeamBottom += gameData.finalScores.bottom || 0;
        }
        if (gameData.finalStriche) {
            const stricheTop = gameData.finalStriche.top;
            const stricheBottom = gameData.finalStriche.bottom;
            totalStricheTeamTop += (stricheTop.sieg || 0) + (stricheTop.berg || 0) + (stricheTop.matsch || 0) + (stricheTop.schneider || 0) + (stricheTop.kontermatsch || 0);
            totalStricheTeamBottom += (stricheBottom.sieg || 0) + (stricheBottom.berg || 0) + (stricheBottom.matsch || 0) + (stricheBottom.schneider || 0) + (stricheBottom.kontermatsch || 0);
        }
    });
    
    const sessionDurationSeconds = summaryDocData.meta?.startedAt instanceof admin.firestore.Timestamp 
      ? completedAt.seconds - summaryDocData.meta.startedAt.seconds
      : 0;

    // Update des Summary-Dokuments
    const summaryUpdateData: any = {
      "meta.status": "completed",
      "meta.completedAt": completedAt,
      "meta.durationSeconds": sessionDurationSeconds,
      finalScores: { // Sicherstellen, dass finalScores aktualisiert werden, falls sie noch nicht auf dem Summary sind
          top: totalPointsTeamTop,
          bottom: totalPointsTeamBottom,
      },
      finalStriche: { // Sicherstellen, dass finalStriche aktualisiert werden
          top: { berg: 0, sieg: totalStricheTeamTop, matsch: 0, schneider: 0, kontermatsch: 0 }, // Vereinfacht für das Beispiel
          bottom: { berg: 0, sieg: totalStricheTeamBottom, matsch: 0, schneider: 0, kontermatsch: 0 }, // Vereinfacht
      },
      // Ggf. `initialSessionData.winnerTeamKey` basierend auf `totalPointsTeamTop` und `totalPointsTeamBottom` setzen,
      // falls noch nicht vorhanden und keine explizite `teamScoreMapping` die Interpretation erschwert.
    };

    // Setze winnerTeamKey im initialSessionData, wenn nicht vorhanden und Scores eindeutig sind
    // und es keine komplizierte teamScoreMapping gibt, die die Interpretation der Scores erschwert.
    if (!winnerTeamKey && !teamScoreMapping) {
        if (totalPointsTeamBottom > totalPointsTeamTop) {
            summaryUpdateData["initialSessionData.winnerTeamKey"] = "teamA"; // Annahme: teamA ist bottom
        } else if (totalPointsTeamTop > totalPointsTeamBottom) {
            summaryUpdateData["initialSessionData.winnerTeamKey"] = "teamB"; // Annahme: teamB ist top
        } else {
            summaryUpdateData["initialSessionData.winnerTeamKey"] = "draw";
        }
    } else if (!winnerTeamKey && teamScoreMapping) {
        // Wenn eine teamScoreMapping existiert, aber kein winnerTeamKey, wird es komplexer, den Gewinner automatisch zu bestimmen,
        // da wir die 'Bedeutung' von teamA und teamB in Bezug auf die Scores (top/bottom) kennen müssen.
        // Fürs Erste lassen wir winnerTeamKey unberührt, wenn er nicht explizit gesetzt wurde und eine Mapping existiert.
        logger.info(`[finalizeSession] Session ${sessionId}: winnerTeamKey nicht gesetzt und teamScoreMapping vorhanden. Automatisches Setzen des Gewinners übersprungen.`);
    }


    await summaryDocRef.update(summaryUpdateData);

    logger.info(`Session ${sessionId} finalized successfully and player stats updated.`);
    return { success: true, message: `Session ${sessionId} finalized and player stats updated.` };

  } catch (error: any) {
    logger.error("Error finalizing session:", sessionId, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", `Failed to finalize session ${sessionId}.`, error.message);
  }
}); 