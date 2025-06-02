import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { PlayerComputedStats, initialPlayerComputedStats, StatStreak } from "./models/player-stats.model"; // PFAD ANPASSEN, falls models im selben Verzeichnis ist

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
  winnerTeamKey?: 'teamA' | 'teamB' | 'draw'; // Wer hat die gesamte Session gewonnen?
}

// NEUE HILFSFUNKTION für Spieler-Session-Statistiken
async function updatePlayerStatsAfterSession(
  db: admin.firestore.Firestore,
  participantUids: string[],
  // Wir benötigen eine klare Information, wer die Session gewonnen/verloren/unentschieden hat.
  // Annahme: sessionFinalData enthält Infos, um dies pro Spieler zu bestimmen.
  sessionFinalData: { 
    finalScores: TeamScores; 
    finalStriche?: { top: StricheRecord; bottom: StricheRecord }; 
    teams?: SessionTeams | null; 
    sessionId: string; // NEU: Session ID für relatedId in Highlights
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
          stats.firstJassTimestamp = sessionTimestamp; // Kann von Spiel überschrieben werden, wenn das früher war
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

        // Ergebnis der Session für den aktuellen Spieler bestimmen
        let sessionOutcome: 'win' | 'loss' | 'tie' = 'loss'; // Default
        let playerTeamKey: 'teamA' | 'teamB' | null = null;
        let opponentTeamKey: 'teamA' | 'teamB' | null = null; // NEU

        // Bestimme Team des Spielers
        if (sessionFinalData.teams?.teamA?.players?.find(p => p.playerId === userId)) {
          playerTeamKey = 'teamA';
          opponentTeamKey = 'teamB'; // NEU
        } else if (sessionFinalData.teams?.teamB?.players?.find(p => p.playerId === userId)) {
          playerTeamKey = 'teamB';
          opponentTeamKey = 'teamA'; // NEU
        }
        
        // Session-Ergebnis bestimmen (VERBESSERTE LOGIK)
        // Annahme: finalScores sind { top: score, bottom: score } und teams mappt teamA/B zu top/bottom
        // ODER initialSessionData.winnerTeamKey wird verwendet, FALLS VORHANDEN
        // Für diese Implementierung verwenden wir eine vereinfachte Punktlogik, wenn Teams klar sind.
        // Eine präzisere Logik würde das Erreichen des scoreLimits oder einen expliziten winnerTeamKey benötigen.
        if (playerTeamKey && sessionFinalData.teams && sessionFinalData.finalScores) {
            // ANNAHME: teamA ist bottom, teamB ist top (Diese Zuordnung muss aus den tatsächlichen Session-Daten stammen!)
            // Hier ist es wichtig, dass die Zuordnung von teamA/teamB zu top/bottom konsistent ist.
            // In InitialSessionData.teams haben wir teamA/teamB. In finalScores haben wir top/bottom.
            // WIR BRAUCHEN EINE KLARE ZUORDNUNG ODER EINEN EXPLIZITEN GEWINNER.
            // Provisorische Annahme (muss ggf. angepasst werden!):
            // Wir nehmen an, dass teamA (aus SessionTeams) dem Score von 'bottom' in finalScores entspricht
            // und teamB dem Score von 'top'.
            const scorePlayerTeam = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.bottom : sessionFinalData.finalScores.top;
            const scoreOpponentTeam = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.top : sessionFinalData.finalScores.bottom;

            if (scorePlayerTeam > scoreOpponentTeam) sessionOutcome = 'win';
            else if (scorePlayerTeam < scoreOpponentTeam) sessionOutcome = 'loss';
            else sessionOutcome = 'tie';
        } else {
            logger.warn(`[updatePlayerStatsAfterSession] Konnte Session-Ergebnis für Spieler ${userId} nicht eindeutig bestimmen. Teams: ${JSON.stringify(sessionFinalData.teams)}, Scores: ${JSON.stringify(sessionFinalData.finalScores)}`);
            // Bei Unklarheit wird der Outcome nicht geändert und bleibt 'loss' (default) oder wird ggf. als 'tie' gewertet.
            sessionOutcome = 'tie'; // Sicherer Fallback bei unklaren Daten
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
            const pointsReceivedInSession = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.top : sessionFinalData.finalScores.bottom; // Punkte des Gegners

            if (!stats.highestPointsSession || pointsMadeInSession > stats.highestPointsSession.value) {
                stats.highestPointsSession = { value: pointsMadeInSession, date: sessionTimestamp, relatedId: sessionFinalData.sessionId };
            }
            if (!stats.lowestPointsSession || pointsMadeInSession < stats.lowestPointsSession.value) { 
                stats.lowestPointsSession = { value: pointsMadeInSession, date: sessionTimestamp, relatedId: sessionFinalData.sessionId };
            }

            if (sessionFinalData.finalStriche) {
                const stricheMadeRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.bottom : sessionFinalData.finalStriche.top;
                const stricheReceivedRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.top : sessionFinalData.finalStriche.bottom;
                
                const calculateTotalStricheValue = (striche: StricheRecord | undefined): number => 
                    striche ? (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0) : 0;

                const stricheMadeInSession = calculateTotalStricheValue(stricheMadeRecord);
                const stricheReceivedInSession = calculateTotalStricheValue(stricheReceivedRecord);

                if (!stats.highestStricheSession || stricheMadeInSession > stats.highestStricheSession.value) {
                    stats.highestStricheSession = { value: stricheMadeInSession, date: sessionTimestamp, relatedId: sessionFinalData.sessionId };
                }
                if (!stats.highestStricheReceivedSession || stricheReceivedInSession > stats.highestStricheReceivedSession.value) {
                    stats.highestStricheReceivedSession = { value: stricheReceivedInSession, date: sessionTimestamp, relatedId: sessionFinalData.sessionId };
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

export const finalizeSessionSummary = onCall<FinalizeSessionData>(
  {
    region: "europe-west1",
  },
  async (request: CallableRequest<FinalizeSessionData>) => {
  logger.info("--- finalizeSessionSummary V2 (mit Spielerstat-Update) START ---");

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

    // NACHDEM die Haupttransaktion erfolgreich war:
    // Extrahieren der notwendigen Daten für die Spielerstatistik-Aktualisierung.
    // Diese Daten sollten idealerweise aus dem `finalUpdateData`-Objekt stammen,
    // das in der Transaktion für die Session-Zusammenfassung erstellt wurde.
    // Oder aus `initialDataFromRequest` und den berechneten Gesamtscores.

    // Erneutes Laden der Session ist nicht ideal, aber sicherer, falls finalUpdateData nicht alle Infos hat.
    // Besser wäre, die Infos direkt aus dem `finalUpdateData` zu nehmen oder als Rückgabewert der Transaktion.
    const sessionFinalSnap = await db.collection(JASS_SUMMARIES_COLLECTION).doc(request.data.sessionId).get();
    if (sessionFinalSnap.exists) {
        const finalizedSessionData = sessionFinalSnap.data();
        const participantUidsToUpdate = finalizedSessionData?.participantUids as string[] | undefined;
        const sessionTimestampForStats = finalizedSessionData?.endedAt as admin.firestore.Timestamp | undefined || admin.firestore.Timestamp.now();
        const sessionIdForStats = sessionFinalSnap.id; // NEU: Session ID extrahieren

        if (participantUidsToUpdate && participantUidsToUpdate.length > 0) {
            logger.info(`[finalizeSessionSummary] Nach Session-Commit: Update von Spieler-Session-Statistiken für ${participantUidsToUpdate.join(", ")}`);
            
            // Die Daten für die Ergebnisermittlung pro Spieler müssen hier korrekt zusammengestellt werden.
            // Annahme: initialDataFromRequest.teams und finalizedSessionData.finalScores sind die Quellen.
            const statsUpdatePayload = {
                finalScores: finalizedSessionData?.finalScores, 
                finalStriche: finalizedSessionData?.finalStriche, // NEU: finalStriche übergeben
                teams: request.data.initialSessionData?.teams ?? null, 
                sessionId: sessionIdForStats // NEU: sessionId übergeben
            };

            if (statsUpdatePayload.finalScores && statsUpdatePayload.teams) {
                 await updatePlayerStatsAfterSession(db, participantUidsToUpdate, statsUpdatePayload, sessionTimestampForStats);
            } else {
                logger.warn(`[finalizeSessionSummary] Nicht genügend Daten für Spieler-Session-Statistik-Update. Scores: ${statsUpdatePayload.finalScores}, Teams: ${statsUpdatePayload.teams}`);
            }
        } else {
            logger.warn(`[finalizeSessionSummary] Keine participantUids im finalisierten Session-Dokument gefunden für Spielerstat-Update.`);
        }
    } else {
        logger.warn(`[finalizeSessionSummary] Konnte finalisiertes Session-Dokument nicht erneut laden für Spielerstat-Update.`);
    }

    return { success: true, message: "Session erfolgreich finalisiert und Spielerstatistiken angestoßen." };
  } catch (error: unknown) {
    logger.error(`--- finalizeSessionSummary V2 CRITICAL ERROR --- SessionId: ${request.data.sessionId}`, error);
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