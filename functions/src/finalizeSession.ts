import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

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

// Hinzufügen einer einfachen Typ-Definition für die Runden-Einträge
export interface Round {
  actionType?: string;
  strichInfo?: {
    team?: 'top' | 'bottom';
    type?: string;
  };
  // Optional, da nicht in allen Runden-Typen vorhanden
  farbe?: string; 
  currentPlayer?: 1 | 2 | 3 | 4; // HINZUGEFÜGT: Spieler, der Trumpf gewählt hat
  _savedWeisPoints?: TeamScores;
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
  participantPlayerIds?: string[];
  playerNames?: PlayerNames;
  teams?: {
    top: { playerUids: string[]; };
    bottom: { playerUids: string[]; };
  };
  weisPoints?: TeamScores;
  roundHistory?: Round[];
  teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
  completedAt?: admin.firestore.Timestamp;
  timestampCompleted?: admin.firestore.Timestamp; // Hinzugefügt
  activeGameId?: string;
  durationMillis?: number;
  sessionId?: string;
  winnerTeam?: 'top' | 'bottom' | 'draw'; // Hinzugefügt
  gameType?: string;
  trumpf?: string;
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
  startedAt?: number | admin.firestore.Timestamp; // Wird als Timestamp erwartet oder in einen konvertiert
  pairingIdentifiers?: {
    teamA: string;
    teamB: string;
  } | null;
  // winnerTeamKey und teamScoreMapping werden von der Funktion selbst bestimmt/aktualisiert
  // und müssen nicht zwingend vom Client bei der Initialisierung kommen,
  // können aber als Hinweis dienen oder falls der Client schon eine Vor-Finalisierung macht.
  winnerTeamKey?: 'teamA' | 'teamB' | 'draw';
  teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
}

// NEU: Interface für die finalen Update-Daten des Session-Summary-Dokuments
interface FinalSessionUpdateData {
  createdAt: admin.firestore.Timestamp;
  startedAt: admin.firestore.Timestamp;
  endedAt: admin.firestore.Timestamp;
  lastActivity: admin.firestore.Timestamp;
  status: "completed";
  gamesPlayed: number;
  durationSeconds: number;
  finalScores: TeamScores;
  finalStriche: { top: StricheRecord; bottom: StricheRecord };
  sessionTotalWeisPoints: TeamScores;
  participantUids: string[];
  playerNames: PlayerNames;
  teams: SessionTeams | null;
  groupId: string | null;
  pairingIdentifiers: { teamA: string; teamB: string; } | null;
  winnerTeamKey: 'teamA' | 'teamB' | 'draw' | undefined;
  teamScoreMapping: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' } | null;
}

export const finalizeSession = onCall(async (request: CallableRequest<FinalizeSessionData>) => {
  logger.info("--- finalizeSession START ---", { data: request.data });

  if (!request.auth) {
    logger.error("User is not authenticated.");
    throw new HttpsError("unauthenticated", "User is not authenticated.");
  }

  const { sessionId, expectedGameNumber, initialSessionData: initialDataFromClient } = request.data;

  if (!sessionId || typeof sessionId !== "string") {
    logger.error("Session ID is missing or not a string.");
    throw new HttpsError("invalid-argument", "Session ID is missing or not a string.");
  }
  if (typeof expectedGameNumber !== "number" || expectedGameNumber <= 0) {
    logger.error("Expected game number is invalid.");
    throw new HttpsError("invalid-argument", "Expected game number is invalid.");
  }
  if (!initialDataFromClient) {
    logger.error("Initial session data from client is missing.");
    throw new HttpsError("invalid-argument", "Initial session data is required.");
  }
  if (!initialDataFromClient.participantUids || initialDataFromClient.participantUids.length === 0) {
    logger.error("Participant UIDs are missing in initial session data.");
    throw new HttpsError("invalid-argument", "Participant UIDs are required.");
  }


  const summaryDocRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionId);
  const completedGamesColRef = summaryDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION);

  // Deklariere completedGames hier, damit es außerhalb der Transaktion verfügbar ist
  const completedGames: CompletedGameData[] = [];

  try {
    await db.runTransaction(async (transaction) => {
      logger.info(`--- Transaction START for ${sessionId} ---`);

      const summarySnap = await transaction.get(summaryDocRef);
      const gamesSnap = await transaction.get(completedGamesColRef.orderBy("gameNumber"));
      
      const existingSummaryData = summarySnap.exists ? summarySnap.data() : null;

      if (existingSummaryData && existingSummaryData.status === "completed") {
        logger.warn(`Session ${sessionId} is already completed. Skipping finalization.`);
        return;
      }
      
      // Befülle die außerhalb deklarierte Variable
      gamesSnap.forEach(doc => {
        completedGames.push(doc.data() as CompletedGameData);
      });

      if (completedGames.length < expectedGameNumber) {
        logger.error(`Session ${sessionId}: Game count mismatch. Expected ${expectedGameNumber}, found ${completedGames.length}.`);
      throw new HttpsError(
        "failed-precondition",
          `Session ${sessionId}: Game count mismatch. Expected ${expectedGameNumber}, found ${completedGames.length}. Cannot finalize.`
        );
      }
      
      const now = admin.firestore.Timestamp.now();
      let startedAtTimestamp: admin.firestore.Timestamp;
      if (initialDataFromClient.startedAt instanceof admin.firestore.Timestamp) {
        startedAtTimestamp = initialDataFromClient.startedAt;
      } else if (typeof initialDataFromClient.startedAt === 'number') {
        startedAtTimestamp = admin.firestore.Timestamp.fromMillis(initialDataFromClient.startedAt);
      } else {
        // Fallback falls startedAt nicht korrekt geliefert wird
        startedAtTimestamp = existingSummaryData?.startedAt || now; 
        logger.warn(`[finalizeSession] startedAt not provided correctly by client for session ${sessionId}, using fallback or existing.`);
      }
      
      const createdAtTimestamp = existingSummaryData?.createdAt || now; // Nur setzen, wenn Dokument neu ist oder noch kein createdAt hat

    let totalPointsTeamTop = 0;
    let totalPointsTeamBottom = 0;
      const totalStricheTopRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      const totalStricheBottomRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      const sessionTotalWeisPoints: TeamScores = { top: 0, bottom: 0 };

      completedGames.forEach(game => {
        totalPointsTeamTop += game.finalScores?.top || 0;
        totalPointsTeamBottom += game.finalScores?.bottom || 0;

        if (game.weisPoints) {
          sessionTotalWeisPoints.top += game.weisPoints.top || 0;
          sessionTotalWeisPoints.bottom += game.weisPoints.bottom || 0;
        }

        // KORRIGIERT: Striche aus finalStriche der completedGames summieren, nicht aus roundHistory neu berechnen
        if (game.finalStriche) {
          // Addiere die bereits korrekten und finalisierten Striche
          totalStricheTopRecord.berg += game.finalStriche.top?.berg || 0;
          totalStricheTopRecord.sieg += game.finalStriche.top?.sieg || 0;
          totalStricheTopRecord.matsch += game.finalStriche.top?.matsch || 0;
          totalStricheTopRecord.schneider += game.finalStriche.top?.schneider || 0;
          totalStricheTopRecord.kontermatsch += game.finalStriche.top?.kontermatsch || 0;
          
          totalStricheBottomRecord.berg += game.finalStriche.bottom?.berg || 0;
          totalStricheBottomRecord.sieg += game.finalStriche.bottom?.sieg || 0;
          totalStricheBottomRecord.matsch += game.finalStriche.bottom?.matsch || 0;
          totalStricheBottomRecord.schneider += game.finalStriche.bottom?.schneider || 0;
          totalStricheBottomRecord.kontermatsch += game.finalStriche.bottom?.kontermatsch || 0;
        }
      });
      
      // KORRIGIERT: Duration aus Summe der Spielzeiten berechnen, nicht aus Session-Timestamps
      let totalGameDurationMillis = 0;
      completedGames.forEach(game => {
        totalGameDurationMillis += game.durationMillis || 0;
      });
      const sessionDurationSeconds = Math.round(totalGameDurationMillis / 1000);

      // Gewinner bestimmen (basierend auf Punkten, anpassen falls Striche-Modus komplexer wird)
      let determinedWinnerTeamKey: 'teamA' | 'teamB' | 'draw' | undefined = initialDataFromClient.winnerTeamKey;
      
      // KORRIGIERT: teamScoreMapping ableiten, falls nicht vom Client bereitgestellt
      let effectiveTeamScoreMapping = initialDataFromClient.teamScoreMapping;
      
      if (!determinedWinnerTeamKey || !effectiveTeamScoreMapping) {
        let pointsTeamA = 0;
        let pointsTeamB = 0;

        if (effectiveTeamScoreMapping) {
          pointsTeamA = effectiveTeamScoreMapping.teamA === 'bottom' ? totalPointsTeamBottom : totalPointsTeamTop;
          pointsTeamB = effectiveTeamScoreMapping.teamB === 'bottom' ? totalPointsTeamBottom : totalPointsTeamTop;
        } else {
          // Fallback-Annahme: teamA ist bottom, teamB ist top
          pointsTeamA = totalPointsTeamBottom;
          pointsTeamB = totalPointsTeamTop;
          logger.info(`[finalizeSession] No teamScoreMapping for session ${sessionId}. Deriving from scores and winnerTeamKey.`);
        }
        
        // Gewinner bestimmen falls nicht gegeben
        if (!determinedWinnerTeamKey) {
          if (pointsTeamA > pointsTeamB) determinedWinnerTeamKey = 'teamA';
          else if (pointsTeamB > pointsTeamA) determinedWinnerTeamKey = 'teamB';
          else determinedWinnerTeamKey = 'draw';
          logger.info(`[finalizeSession] Session ${sessionId}: winnerTeamKey self-determined as '${determinedWinnerTeamKey}' based on scores.`);
        }
        
        // teamScoreMapping ableiten falls nicht gegeben
        if (!effectiveTeamScoreMapping && determinedWinnerTeamKey !== 'draw') {
          if (determinedWinnerTeamKey === 'teamA') {
            // TeamA hat gewonnen, also ist teamA dort wo mehr Punkte sind
            effectiveTeamScoreMapping = {
              teamA: totalPointsTeamBottom > totalPointsTeamTop ? 'bottom' : 'top',
              teamB: totalPointsTeamBottom > totalPointsTeamTop ? 'top' : 'bottom'
            };
          } else if (determinedWinnerTeamKey === 'teamB') {
            // TeamB hat gewonnen
            effectiveTeamScoreMapping = {
              teamA: totalPointsTeamBottom > totalPointsTeamTop ? 'top' : 'bottom',
              teamB: totalPointsTeamBottom > totalPointsTeamTop ? 'bottom' : 'top'
            };
          }
          logger.info(`[finalizeSession] Session ${sessionId}: teamScoreMapping derived as ${JSON.stringify(effectiveTeamScoreMapping)}`);
        }
      }
      
      const finalUpdateData: FinalSessionUpdateData = {
        // sessionId: sessionId, // Ist die Dokumenten-ID
        createdAt: createdAtTimestamp,
        startedAt: startedAtTimestamp,
        endedAt: now,
        lastActivity: now,
        status: "completed",
        gamesPlayed: completedGames.length,
        durationSeconds: sessionDurationSeconds > 0 ? sessionDurationSeconds : 0,

      finalScores: { 
          top: totalPointsTeamTop,
          bottom: totalPointsTeamBottom,
      },
      finalStriche: { 
            top: totalStricheTopRecord, 
            bottom: totalStricheBottomRecord,
        },
        sessionTotalWeisPoints: sessionTotalWeisPoints, // Aggregierte Weispunkte

        // Daten aus initialDataFromClient übernehmen/sicherstellen
        participantUids: initialDataFromClient.participantUids,
        playerNames: initialDataFromClient.playerNames,
        teams: initialDataFromClient.teams || null,
        groupId: initialDataFromClient.gruppeId || null,
        pairingIdentifiers: initialDataFromClient.pairingIdentifiers || null,
        
        // Von der Funktion bestimmter oder vom Client übergebener Gewinner
        winnerTeamKey: determinedWinnerTeamKey, 
        // KORRIGIERT: Verwende effectiveTeamScoreMapping (kann abgeleitet worden sein)
        teamScoreMapping: effectiveTeamScoreMapping || null, 
      };
      
      transaction.set(summaryDocRef, finalUpdateData, { merge: true });
      logger.info(`--- Transaction END for ${sessionId} (document set/merged) ---`);
    });

    // NEU: Gebündeltes Aufräumen von Session und ActiveGames
    const cleanupBatch = db.batch();

    // 1. Session-Dokument aktualisieren, um den Pointer zu entfernen
    const sessionDocRef = db.collection('sessions').doc(sessionId);
    cleanupBatch.update(sessionDocRef, {
      currentActiveGameId: null,
      lastUpdated: admin.firestore.Timestamp.now()
    });
    logger.info(`[finalizeSession] Queued update for session ${sessionId} to clear activeGameId.`);

    // 2. ActiveGame-Dokumente zum Löschen vormerken
    const activeGameIdsToDelete = completedGames
      .map(game => game.activeGameId)
      .filter((id): id is string => !!id);

    if (activeGameIdsToDelete.length > 0) {
      activeGameIdsToDelete.forEach(id => {
        const activeGameRef = db.collection('activeGames').doc(id);
        cleanupBatch.delete(activeGameRef);
        logger.info(`[finalizeSession] Queued deletion for active game ${id}.`);
      });
    }

    // 3. Den gesamten Aufräum-Batch ausführen
    await cleanupBatch.commit();
    logger.info(`[finalizeSession] Cleanup of session and active games completed for ${sessionId}.`);

    logger.info(`Session ${sessionId} finalized successfully and player stats updated.`);
    return { success: true, message: `Session ${sessionId} finalized.` };
  } catch (error: unknown) {
    logger.error(`--- finalizeSession CRITICAL ERROR --- SessionId: ${sessionId}`, error);
    if (error instanceof HttpsError) {
    throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HttpsError("internal", `Failed to finalize session ${sessionId}.`, errorMessage);
  }
}); 