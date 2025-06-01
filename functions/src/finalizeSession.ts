import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

// --- Interfaces (ggf. auslagern oder synchron halten mit Client-Typen) ---
interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}
interface TeamScores {
  top: number;
  bottom: number;
}

// NEUE Typdefinitionen für detaillierte Team-Informationen
interface SessionTeamPlayer {
  playerId: string;
  displayName: string;
}

interface SessionTeamDetails {
  players: SessionTeamPlayer[];
  name?: string; // Optionaler, individueller Teamname für diese Session
}

interface SessionTeams {
  teamA: SessionTeamDetails;
  teamB: SessionTeamDetails;
}
// ENDE NEUE Typdefinitionen

interface CompletedGameData {
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
interface TeamConfig {
  top: [number, number];
  bottom: [number, number];
}

interface PlayerNames {
  [key: number]: string;
}

// Typ für die initialen Session-Daten, die vom Client kommen könnten
interface InitialSessionData {
  participantUids: string[];
  playerNames: PlayerNames;
  teams?: SessionTeams | null;
  gruppeId: string | null;
  startedAt?: number | admin.firestore.Timestamp;
  pairingIdentifiers?: {
    teamA: string;
    teamB: string;
  } | null;
}

export const finalizeSessionSummary = onCall<FinalizeSessionData>(
  {
    region: "europe-west1",
  },
  async (request: CallableRequest<FinalizeSessionData>) => {
  logger.info("--- finalizeSessionSummary VERY VERBOSE LOGGING START ---");

  let sessionId: string | undefined;
  let expectedGameNumber: number | undefined;
  let initialDataFromRequest: InitialSessionData | undefined = undefined;

  try {
    sessionId = request.data.sessionId;
    expectedGameNumber = request.data.expectedGameNumber;
    initialDataFromRequest = request.data.initialSessionData;
    const clientStartedAt = initialDataFromRequest?.startedAt;

    logger.info(`Received data: sessionId=${sessionId}, expectedGameNumber=${expectedGameNumber}, initialSessionData exists: ${!!initialDataFromRequest}`);
    if (initialDataFromRequest) {
      logger.info(`InitialSessionData content: gruppeId=${initialDataFromRequest.gruppeId}, participantUids=${JSON.stringify(initialDataFromRequest.participantUids)}, clientStartedAt=${clientStartedAt}`);
    }

    if (!sessionId || typeof sessionId !== 'string') {
       logger.error("Invalid sessionId received.");
       throw new HttpsError("invalid-argument", "Session-ID fehlt oder ist ungültig.");
    }
    if (typeof expectedGameNumber !== 'number' || expectedGameNumber <= 0) {
       logger.error("Invalid expectedGameNumber received.");
       throw new HttpsError("invalid-argument", "Erwartete Spielnummer fehlt oder ist ungültig.");
    }

    const sessionDocRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionId);
    logger.info(`Created sessionDocRef for ${sessionId}`);
    const gamesCollectionRef = sessionDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION);
    const gamesQuery = gamesCollectionRef.orderBy('gameNumber');

    await db.runTransaction(async (transaction) => {
      logger.info(`--- Transaction START for ${sessionId} ---`);

      // --- ALLE LESEOPERATIONEN ZUERST ---
      logger.info(`Attempting to get sessionDocRef: ${sessionDocRef.path}`);
      const sessionSnap = await transaction.get(sessionDocRef);
      logger.info(`SessionSnap exists: ${sessionSnap.exists}`);

      logger.info(`Attempting to get games from: ${gamesCollectionRef.path} ordered by gameNumber`);
      const gamesSnap = await transaction.get(gamesQuery);
      logger.info(`Got gamesSnap. Number of docs: ${gamesSnap.size}`);
      // --- ENDE LESEOPERATIONEN ---
      
      const sessionData = sessionSnap.exists ? sessionSnap.data() : null;

      if (sessionData && (sessionData.status === 'completed' || sessionData.status === 'completed_empty')) {
         logger.warn(`Session ${sessionId} already finalized (Status: ${sessionData.status}). Skipping.`);
         return; // Frühzeitiger Ausstieg, wenn bereits finalisiert
      }

      const completedGames: CompletedGameData[] = gamesSnap.docs.map(doc => {
          const data = doc.data();
          logger.debug(`Mapping game doc: ${doc.id}, has gameNumber: ${data?.gameNumber !== undefined}`);
          return data as CompletedGameData;
      });
      logger.info(`Mapped ${completedGames.length} completed games.`);

      let determinedGroupId: string | null = initialDataFromRequest?.gruppeId ?? null;
      if (determinedGroupId === null && completedGames.length > 0 && completedGames[0].groupId !== undefined) {
        determinedGroupId = completedGames[0].groupId;
      }
      logger.info(`Determined groupId for session ${sessionId}: ${determinedGroupId}`);

      let determinedParticipantUids: string[] = initialDataFromRequest?.participantUids ?? [];
      if (determinedParticipantUids.length === 0 && completedGames.length > 0 && completedGames[0].participantUids) {
        determinedParticipantUids = completedGames[0].participantUids;
      }
      logger.info(`Determined participantUids for session ${sessionId}: ${JSON.stringify(determinedParticipantUids)}`);
      
      let determinedPlayerNames: PlayerNames = initialDataFromRequest?.playerNames ?? {};
      if (Object.keys(determinedPlayerNames).length === 0 && completedGames.length > 0 && completedGames[0].playerNames) {
        determinedPlayerNames = completedGames[0].playerNames;
      }
      logger.info(`Determined playerNames for session ${sessionId}: ${JSON.stringify(determinedPlayerNames)}`);

      const determinedTeamsInfoForSession: SessionTeams | null | undefined = initialDataFromRequest?.teams;
      logger.info(`Teams info for session from initialData: ${JSON.stringify(determinedTeamsInfoForSession)}`);

      const latestExpectedGameExists = completedGames.some((game: CompletedGameData) => {
         logger.debug(`Checking gameNumber: ${game?.gameNumber} === ${expectedGameNumber}`);
         return game?.gameNumber === expectedGameNumber;
      });
      logger.info(`Check if expected game ${expectedGameNumber} exists: ${latestExpectedGameExists}`);

      if (!latestExpectedGameExists) {
        logger.warn(`Expected game ${expectedGameNumber} not found. Throwing custom error.`);
        throw new HttpsError('failed-precondition', `Erwartetes Spiel ${expectedGameNumber} noch nicht in Firestore sichtbar.`, { customCode: 'GAME_NOT_YET_VISIBLE' });
      }

      // Bestimme startedAt: Priorität Client, dann sessionData (falls schon vorhanden), dann serverTimestamp
      const determinedStartedAt = clientStartedAt ?? sessionData?.startedAt ?? FieldValue.serverTimestamp();

      // --- SCHREIBOPERATIONEN BEGINNEN HIER ---
      if (completedGames.length === 0) {
           logger.warn(`No completed games found despite passing check for game ${expectedGameNumber}. Marking as completed_empty.`);
           const emptySessionData = {
            sessionId: sessionId, 
            createdAt: sessionData?.createdAt ?? FieldValue.serverTimestamp(),
            startedAt: determinedStartedAt,
            gamesPlayed: 0, 
            finalScores: { top: 0, bottom: 0 }, 
            finalStriche: { 
              top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
              bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
            },
            weisPoints: { top: 0, bottom: 0 },
            status: 'completed_empty', 
            endedAt: FieldValue.serverTimestamp(), 
            lastActivity: FieldValue.serverTimestamp(),
            groupId: determinedGroupId,
            participantUids: determinedParticipantUids,
            playerNames: determinedPlayerNames,
            teams: initialDataFromRequest?.teams ?? null,
            pairingIdentifiers: initialDataFromRequest?.pairingIdentifiers ?? null,
           };
           transaction.set(sessionDocRef, emptySessionData, { merge: true });
           logger.info(`--- Transaction END for ${sessionId} (marked as completed_empty) ---`);
           return;
      }

      logger.info(`Calculating totals for ${completedGames.length} games...`);
      const totalScores: TeamScores = { top: 0, bottom: 0 };
      const totalStriche: { top: StricheRecord; bottom: StricheRecord } = { 
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
      };
      // Erstelle ein Objekt für die Summe der Weispunkte
      const totalWeisPoints: TeamScores = { top: 0, bottom: 0 };
      
      // NEU: Debug-Log für CompletedGames
      logger.info(`DEBUG: Spiele mit Weispunkten untersuchen...`);
      completedGames.forEach((game, idx) => {
        logger.info(`DEBUG: Spiel ${idx + 1} hat weisPoints: ${!!game.weisPoints}`);
        if (game.weisPoints) {
          logger.info(`DEBUG: Spiel ${idx + 1} weisPoints Werte: top=${game.weisPoints.top}, bottom=${game.weisPoints.bottom}`);
        }
      });
      
      completedGames.forEach((game: CompletedGameData) => { 
          totalScores.top += game.finalScores?.top ?? 0;
          totalScores.bottom += game.finalScores?.bottom ?? 0;
          
          // Weispunkte summieren - VERBESSERTE LOGIK
          let gameWeisTop = 0;
          let gameWeisBottom = 0;
          
          // 1. Versuche game.weisPoints zu verwenden, wenn vorhanden und nicht null
          if (game.weisPoints && (game.weisPoints.top > 0 || game.weisPoints.bottom > 0)) {
            gameWeisTop = game.weisPoints.top ?? 0;
            gameWeisBottom = game.weisPoints.bottom ?? 0;
            logger.info(`DEBUG: Verwende vorhandene weisPoints aus Spiel: top=${gameWeisTop}, bottom=${gameWeisBottom}`);
          // 2. Wenn keine Weispunkte gefunden, versuche _savedWeisPoints in erster Runde
          } else if (game.roundHistory && game.roundHistory.length > 0) {
            // Versuche _savedWeisPoints aus der ersten Runde zu extrahieren
            const firstRound = game.roundHistory[0] as Record<string, unknown>;
            if (firstRound._savedWeisPoints && typeof firstRound._savedWeisPoints === 'object' && firstRound._savedWeisPoints !== null) {
              const savedWeis = firstRound._savedWeisPoints as { top?: number; bottom?: number };
              if (savedWeis.top !== undefined || savedWeis.bottom !== undefined) {
                gameWeisTop = savedWeis.top ?? 0;
                gameWeisBottom = savedWeis.bottom ?? 0;
                logger.info(`DEBUG: Verwende _savedWeisPoints aus erster Runde: top=${gameWeisTop}, bottom=${gameWeisBottom}`);
              }
            // 3. Wenn immer noch keine Weispunkte gefunden, durchlaufe alle Runden und summiere weisActions
            } else {
              logger.info(`DEBUG: Summiere weisActions aus allen Runden...`);
              let foundWeisActions = false;
              
              for (const round of game.roundHistory) {
                const roundCast = round as Record<string, unknown>;
                if (roundCast.weisActions && Array.isArray(roundCast.weisActions)) {
                  for (const weisAction of roundCast.weisActions) {
                    if (typeof weisAction === 'object' && weisAction !== null) {
                      const typedAction = weisAction as Record<string, unknown>;
                      if ('position' in typedAction && 'points' in typedAction) {
                        foundWeisActions = true;
                        if (typedAction.position === 'top') {
                          gameWeisTop += Number(typedAction.points) || 0;
                        } else if (typedAction.position === 'bottom') {
                          gameWeisBottom += Number(typedAction.points) || 0;
                        }
                      }
                    }
                  }
                }
              }
              
              if (foundWeisActions) {
                logger.info(`DEBUG: Summierte weisActions: top=${gameWeisTop}, bottom=${gameWeisBottom}`);
              } else {
                logger.info(`DEBUG: Keine weisActions gefunden in allen Runden`);
              }
            }
          }
          
          // Endgültige Weispunkte zum Total hinzufügen
          totalWeisPoints.top += gameWeisTop;
          totalWeisPoints.bottom += gameWeisBottom;
          logger.info(`DEBUG: Neue totalWeisPoints nach Addition: top=${totalWeisPoints.top}, bottom=${totalWeisPoints.bottom}`);
          
          // KORRIGIERTER CODE: Striche-Summierung
          // Statt einfach die Anzahl der Ereignisse zu zählen, nehmen wir die exakten Strichpunktwerte
          // aus den Spielen, die bereits die korrekten Multiplikatoren enthalten.
          
          // Implementiere ein detailliertes Logging für bessere Nachvollziehbarkeit
          logger.info(`DEBUG: Striche aus Spiel ${game.gameNumber}:`);
          
          for (const team of ['top', 'bottom'] as const) {
            // Prüfe, ob das Spiel Striche für dieses Team hat
            if (game.finalStriche?.[team]) {
              logger.info(`DEBUG: Striche für Team ${team} vorhanden`);
              
              // Iteriere über alle StrichTypen
              for (const strichType of Object.keys(totalStriche[team]) as Array<keyof StricheRecord>) {
                const currentTotal = totalStriche[team][strichType] || 0;
                const gameValue = game.finalStriche[team][strichType] || 0;
                
                // Füge exakten Wert hinzu (ohne erneute Berechnung oder Zählung)
                totalStriche[team][strichType] = currentTotal + gameValue;
                
                // Debug-Log, besonders wichtig für kontermatsch und schneider
                if (strichType === 'kontermatsch' || strichType === 'schneider') {
                  logger.info(`DEBUG: ${strichType} für Team ${team}: ${gameValue} hinzugefügt zu ${currentTotal}, neues Total: ${totalStriche[team][strichType]}`);
                }
              }
            } else {
              logger.warn(`DEBUG: Keine Striche für Team ${team} in Spiel ${game.gameNumber} gefunden`);
            }
          }
      });
      logger.info(`Totals calculated. Preparing final update.`);

      const finalUpdateData = { 
        sessionId: sessionId, 
        createdAt: sessionData?.createdAt ?? FieldValue.serverTimestamp(), 
        startedAt: determinedStartedAt,
        status: 'completed', 
        endedAt: FieldValue.serverTimestamp(), 
        gamesPlayed: completedGames.length, 
        finalScores: totalScores, 
        finalStriche: totalStriche,
        // Füge die Weispunkte zur Zusammenfassung hinzu
        weisPoints: totalWeisPoints,
        lastActivity: FieldValue.serverTimestamp(),
        groupId: determinedGroupId,
        participantUids: determinedParticipantUids,
        playerNames: determinedPlayerNames,
        teams: initialDataFromRequest?.teams ?? null,
        pairingIdentifiers: initialDataFromRequest?.pairingIdentifiers ?? null,
      };
      
      logger.info(`Attempting final set/merge on ${sessionDocRef.path} with data: ${JSON.stringify(finalUpdateData)}`);
      transaction.set(sessionDocRef, finalUpdateData, { merge: true });
      logger.info(`--- Transaction END for ${sessionId} (set prepared) ---`);
    }); // Ende der Transaktion

    logger.info(`Transaction committed successfully for ${sessionId}.`);
    return { success: true, message: "Session erfolgreich finalisiert." };
  } catch (error: unknown) {
    logger.error(`--- finalizeSessionSummary VERY VERBOSE LOGGING CRITICAL ERROR --- SessionId: ${sessionId}`, error);
    if (error instanceof HttpsError && (error.details as { customCode?: string })?.customCode === 'GAME_NOT_YET_VISIBLE') {
        logger.info(`Custom Precondition failed detail log: ${error.message}`);
    } else {
        logger.error("Detailed error info:", {
          errorDetails: (error as HttpsError)?.details ?? undefined,
          errorCode: (error as HttpsError)?.code ?? undefined,
          errorMessage: (error as Error)?.message ?? String(error),
        });
    }
    throw error;
  }
}); 