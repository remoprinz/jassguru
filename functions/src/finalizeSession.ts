import * as admin from 'firebase-admin';
import { HttpsError, onCall, CallableRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';


// --- Interfaces ---
// ✅ NEU: Event Count Record für Spiel-Events
export interface EventCountRecord {
  sieg: number;        // Nur 1 team kann das haben
  berg: number;        // Nur 1 team kann das haben
  matsch: number;      // Jedes team kann x haben
  kontermatsch: number; // Jedes team kann x haben
  schneider: number;   // Nur gewinnerteam kann das haben
}

export interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}

export interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

export interface Round {
  actionType?: string;
  strichInfo?: {
    team?: 'top' | 'bottom';
    type?: string;
  };
  farbe?: string; 
  currentPlayer?: 1 | 2 | 3 | 4;
  _savedWeisPoints?: TeamScores;
  timestamp?: number;
  durationMillis?: number;
  startTime?: number;
  endTime?: number;
}

export interface TeamScores {
  top: number;
  bottom: number;
}

export interface SessionTeamPlayer {
  playerId: string;
  displayName: string;
}

export interface SessionTeamDetails {
  players: SessionTeamPlayer[];
  name?: string;
}

export interface SessionTeams {
  top: SessionTeamDetails;    // ✅ GEÄNDERT: Konsistente Benennung
  bottom: SessionTeamDetails; // ✅ GEÄNDERT: Konsistente Benennung
}

// Neue Typdefinitionen für Datenoptimierung (Sync mit Frontend)
export interface TrumpfCountsByPlayer {
  [playerId: string]: {
    [farbe: string]: number;
  };
}

export interface RoundDurationsByPlayer {
  [playerId: string]: {
    totalDuration: number;
    roundCount: number;
  };
}

export interface CompletedGameData {
  gameNumber: number;
  finalScores: TeamScores;
  finalStriche: { top: StricheRecord; bottom: StricheRecord };
  eventCounts?: EventCounts; // ✅ Bereits vorhanden
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
  teamScoreMapping?: { top: 'top' | 'bottom'; bottom: 'top' | 'bottom' };
  completedAt?: admin.firestore.Timestamp;
  timestampCompleted?: admin.firestore.Timestamp;
  activeGameId?: string;
  durationMillis?: number;
  sessionId?: string;
  winnerTeam?: 'top' | 'bottom' | 'draw';
  gameType?: string;
  trumpf?: string;
  
  // ✅ NEU: Aggregierte Daten auf Spiel-Ebene
  totalRoundDurationMillis?: number;
  trumpfCountsByPlayer?: TrumpfCountsByPlayer;
  roundDurationsByPlayer?: RoundDurationsByPlayer;
}

interface FinalizeSessionData {
  sessionId: string;
  expectedGameNumber: number;
  initialSessionData?: InitialSessionData;
}

export interface TeamConfig {
  top: [number, number];
  bottom: [number, number];
}

export interface PlayerNames {
  [key: number]: string;
}

export interface InitialSessionData {
  participantUids?: string[];
  participantPlayerIds: string[];
  playerNames: PlayerNames;
  teams?: SessionTeams | null;
  gruppeId: string | null;
  startedAt?: number | admin.firestore.Timestamp;
  pairingIdentifiers?: {
    top: string;    // ✅ GEÄNDERT: Konsistente Benennung
    bottom: string; // ✅ GEÄNDERT: Konsistente Benennung
  } | null;
  winnerTeamKey?: 'top' | 'bottom' | 'draw'; // ✅ GEÄNDERT: Direkte Verwendung von top/bottom
  teamScoreMapping?: { top: 'top' | 'bottom'; bottom: 'top' | 'bottom' }; // ✅ GEÄNDERT: top/bottom Keys
  notes?: string[]; // ✅ HINZUGEFÜGT
}

export interface SessionSummary {
  sessionId: string;
  groupId: string;
  participantPlayerIds: string[]; // ✅ Bereits auf Player Document IDs umgestellt
  teams: {
    top: { players: { playerId: string; displayName: string; }[]; };
    bottom: { players: { playerId: string; displayName: string; }[]; };
  };
  playerNames: { [key: string]: string };
  gamesPlayed: number;
  sessionTotalWeisPoints: TeamScores;
  eventCounts: EventCounts; // ✅ Bereits vorhanden
  finalScores: TeamScores;
  finalStriche: { top: StricheRecord; bottom: StricheRecord };
  winnerTeamKey: 'top' | 'bottom' | 'draw';
  startedAt: admin.firestore.Timestamp;
  endedAt?: admin.firestore.Timestamp;
  durationSeconds?: number;
  status: 'completed' | 'completed_empty';
  notes?: string[];
  pairingIdentifiers?: { top: string; bottom: string };
  teamScoreMapping?: { top: 'top' | 'bottom'; bottom: 'top' | 'bottom' };
  tournamentId?: string; // ✅ NEU: Optionales Feld für die Turnier-Verknüpfung
  
  // ✅ NEU: Session-Level Aggregationen (alle optional)
  Rosen10player?: string | null;
  totalRounds?: number;
  aggregatedTrumpfCountsByPlayer?: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer?: RoundDurationsByPlayer;
  
  // ✅ NEU: Spiel-Ergebnisse für perfekte Statistik-Berechnungen
  gameResults?: Array<{
    gameNumber: number;
    winnerTeam: 'top' | 'bottom';
    topScore: number;
    bottomScore: number;
  }>;
  
  // ✅ NEU: Vorberechnete Aggregate für Performance
  gameWinsByTeam?: {
    top: number;
    bottom: number;
  };
  
  gameWinsByPlayer?: {
    [playerId: string]: {
      wins: number;
      losses: number;
    };
  };
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
  // ✅ NEUE, KORREKTE VALIDIERUNG: Nur Player IDs sind überlebenswichtig.
  if (!initialDataFromClient.participantPlayerIds || initialDataFromClient.participantPlayerIds.length === 0) {
    logger.error("CRITICAL: Participant Player IDs are missing in initial session data.");
    throw new HttpsError("invalid-argument", "Client must provide participantPlayerIds.");
  }

  const summaryDocRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionId);
  const completedGamesColRef = summaryDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION);

  try {
    // Die Prüfung auf ein aktives Spiel wurde entfernt, um eine Race Condition zu verhindern.
    // Die `currentActiveGameId` wird zuverlässig am Ende des Prozesses aufgeräumt.

    // ✅ SAUBERE ZUWEISUNG: Keine Hacks, direkte Verwendung der vom Client gesendeten Daten.
    const participantPlayerIds = initialDataFromClient.participantPlayerIds;
    
    // Validiere dass alle Player IDs existieren
    if (!participantPlayerIds || participantPlayerIds.length === 0) {
      throw new HttpsError('invalid-argument', 'participantPlayerIds cannot be empty');
    }
    
    // Prüfe dass alle Player Documents existieren
    for (const playerId of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      if (!playerDoc.exists) {
        logger.error(`[finalizeSession] Player document ${playerId} does not exist`);
        throw new HttpsError('not-found', `Player ${playerId} not found`);
      }
    }
    
    logger.info(`[finalizeSession] All ${participantPlayerIds.length} player IDs validated for session ${sessionId}`);

    const activeGameIdsToDelete = await db.runTransaction(async (transaction) => {
      logger.info(`--- Transaction START for ${sessionId} ---`);

      const summarySnap = await transaction.get(summaryDocRef);
      const gamesSnap = await transaction.get(completedGamesColRef.orderBy("gameNumber"));
      
      const existingSummaryData = summarySnap.exists ? summarySnap.data() : null;

      if (existingSummaryData && existingSummaryData.status === "completed") {
        logger.warn(`Session ${sessionId} is already completed. Skipping finalization.`);
        return []; // Return empty array to signal no deletions needed
      }
      
      const completedGames: CompletedGameData[] = gamesSnap.docs.map(doc => doc.data() as CompletedGameData);
      const finalizationNotes: string[] = [];

      // KONSISTENZPRÜFUNG - JETZT ROBUST
      if (completedGames.length < expectedGameNumber) {
        const warningMessage = `Game count mismatch. Expected ${expectedGameNumber}, found ${completedGames.length}. Finalizing with available data.`;
        logger.warn(`[finalizeSession] Session ${sessionId}: ${warningMessage}`);
        finalizationNotes.push(warningMessage);
        // NICHT MEHR ABBRECHEN
      }
      
      // AB HIER IST SICHERGESTELLT, DASS WIR ALLE ERWARTETEN SPIELE HABEN
      const now = admin.firestore.Timestamp.now();
      let startedAtTimestamp: admin.firestore.Timestamp;
      if (initialDataFromClient.startedAt instanceof admin.firestore.Timestamp) {
        startedAtTimestamp = initialDataFromClient.startedAt;
      } else if (typeof initialDataFromClient.startedAt === 'number') {
        startedAtTimestamp = admin.firestore.Timestamp.fromMillis(initialDataFromClient.startedAt);
      } else {
        startedAtTimestamp = existingSummaryData?.startedAt || now; 
        logger.warn(`[finalizeSession] startedAt not provided correctly by client for session ${sessionId}, using fallback or existing.`);
      }
      
      const createdAtTimestamp = existingSummaryData?.createdAt || now;

      // Aggregation der Daten
      let totalPointsTeamTop = 0;
      let totalPointsTeamBottom = 0;
      const totalStricheTopRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      const totalStricheBottomRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      const sessionTotalWeisPoints: TeamScores = { top: 0, bottom: 0 };
      // ✅ NEU: Event-Zähler aggregieren
      const totalEventCountsTop: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
      const totalEventCountsBottom: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
      let totalGameDurationMillis = 0;
      // ✅ NEU: Aggregierte Trumpf-Statistiken
      const aggregatedTrumpfCounts: TrumpfCountsByPlayer = {};
      // ✅ NEU: Aggregierte Rundenzeiten pro Spieler
      const aggregatedRoundDurations: RoundDurationsByPlayer = {};
      let sessionTotalRounds = 0; // ✅ NEU: Hier initialisieren für die Aggregation

      // ✅ WICHTIG: Player-Mapping VOR der Schleife erstellen
      const playerNumberToIdMap = new Map<number, string>();
      participantPlayerIds.forEach((playerId, index) => {
        playerNumberToIdMap.set(index + 1, playerId); // PlayerNumber ist 1-basiert
        // Initialisiere Rundenzeiten für jeden Spieler
        aggregatedRoundDurations[playerId] = { totalDuration: 0, roundCount: 0 };
      });

      // ✅ NEU: Arrays für Spiel-Ergebnisse und Aggregate initialisieren
      const gameResults: Array<{
        gameNumber: number;
        winnerTeam: 'top' | 'bottom';
        topScore: number;
        bottomScore: number;
      }> = [];
      
      const gameWinsByTeam = { top: 0, bottom: 0 };
      const gameWinsByPlayer: { [playerId: string]: { wins: number; losses: number } } = {};
      
      // Initialisiere Spieler-Statistiken
      participantPlayerIds.forEach(playerId => {
        gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
      });

      completedGames.forEach(game => {
        totalPointsTeamTop += game.finalScores?.top || 0;
        totalPointsTeamBottom += game.finalScores?.bottom || 0;
        totalGameDurationMillis += game.durationMillis || 0;

        if (game.weisPoints) {
          sessionTotalWeisPoints.top += game.weisPoints.top || 0;
          sessionTotalWeisPoints.bottom += game.weisPoints.bottom || 0;
        }

        if (game.finalStriche) {
          Object.keys(totalStricheTopRecord).forEach(key => {
            const K = key as keyof StricheRecord;
            totalStricheTopRecord[K] += game.finalStriche.top?.[K] || 0;
            totalStricheBottomRecord[K] += game.finalStriche.bottom?.[K] || 0;
          });
        }

        // ✅ NEU & ROBUST: eventCounts für JEDES Spiel serverseitig neu berechnen
        const gameBottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
        const gameTopEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

        // 1. Matsch/Kontermatsch aus der roundHistory des Spiels
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          game.roundHistory.forEach(round => {
            if (round.strichInfo?.type && round.strichInfo.team) {
              const teamKey = round.strichInfo.team;
              if (round.strichInfo.type === 'matsch') {
                if (teamKey === 'bottom') gameBottomEvents.matsch++;
                else if (teamKey === 'top') gameTopEvents.matsch++;
              } else if (round.strichInfo.type === 'kontermatsch') {
                if (teamKey === 'bottom') gameBottomEvents.kontermatsch++;
                else if (teamKey === 'top') gameTopEvents.kontermatsch++;
              }
            }
          });
        }

        // 2. Sieg, Berg, Schneider aus finalStriche des Spiels
        if (game.finalStriche) {
          if (game.finalStriche.bottom.sieg > 0) gameBottomEvents.sieg = 1;
          if (game.finalStriche.top.sieg > 0) gameTopEvents.sieg = 1;
          if (game.finalStriche.bottom.berg > 0) gameBottomEvents.berg = 1;
          if (game.finalStriche.top.berg > 0) gameTopEvents.berg = 1;
          if (game.finalStriche.bottom.schneider > 0) gameBottomEvents.schneider = 1;
          if (game.finalStriche.top.schneider > 0) gameTopEvents.schneider = 1;
        }
        
        // Die neu berechneten Events zur Session-Summe addieren
        totalEventCountsTop.sieg += gameTopEvents.sieg;
        totalEventCountsTop.berg += gameTopEvents.berg;
        totalEventCountsTop.matsch += gameTopEvents.matsch;
        totalEventCountsTop.kontermatsch += gameTopEvents.kontermatsch;
        totalEventCountsTop.schneider += gameTopEvents.schneider;

        totalEventCountsBottom.sieg += gameBottomEvents.sieg;
        totalEventCountsBottom.berg += gameBottomEvents.berg;
        totalEventCountsBottom.matsch += gameBottomEvents.matsch;
        totalEventCountsBottom.kontermatsch += gameBottomEvents.kontermatsch;
        totalEventCountsBottom.schneider += gameBottomEvents.schneider;
        
        // ✅ WICHTIG: Die korrekten eventCounts in das completedGame-Dokument zurückschreiben
        const gameDocRef = completedGamesColRef.doc(String(game.gameNumber));
        const updateData: { [key: string]: any } = {
          eventCounts: { top: gameTopEvents, bottom: gameBottomEvents }
        };

        // Das Feld 'Rosen10player' wird aus allen Spieldokumenten entfernt,
        // da die Information nur noch auf Session-Ebene relevant ist.
        if ('Rosen10player' in game) {
          updateData.Rosen10player = admin.firestore.FieldValue.delete();
        }
        transaction.update(gameDocRef, updateData);
        
        // ✅ NEU: Runden für die Session-Statistik direkt hier aufsummieren
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          sessionTotalRounds += game.roundHistory.length;
        }

        // ✅ Trumpf-Aggregation aus roundHistory (bleibt unverändert)
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          game.roundHistory.forEach((round, roundIndex) => {
            // ✅ Trumpf-Aggregation
            if (round.currentPlayer) {
              const trumpfPlayerId = playerNumberToIdMap.get(round.currentPlayer);
              if (trumpfPlayerId && round.farbe) {
                if (!aggregatedTrumpfCounts[trumpfPlayerId]) {
                  aggregatedTrumpfCounts[trumpfPlayerId] = {};
                }
                const farbeKey = round.farbe.toLowerCase();
                aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] = (aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] || 0) + 1;
              }
            }

            // ✅ NEU: Verbesserte Rundenzeit-Aggregation pro Spieler
            if (round.currentPlayer) {
              const roundPlayerId = playerNumberToIdMap.get(round.currentPlayer);
              if (roundPlayerId) {
                let roundDuration = 0;
                
                // ✅ KORREKT: Berechne Dauer aus aufeinanderfolgenden timestamps
                if (round.timestamp && typeof round.timestamp === 'number') {
                  const currentTimestamp = round.timestamp;
                  
                  // Versuche den vorherigen Timestamp zu finden
                  let previousTimestamp: number | undefined;
                  
                  if (roundIndex > 0) {
                    // Nutze den Timestamp der vorherigen Runde
                    const previousRound = game.roundHistory?.[roundIndex - 1];
                    if (previousRound?.timestamp && typeof previousRound.timestamp === 'number') {
                      previousTimestamp = previousRound.timestamp;
                    }
                  } else {
                    // ✅ NEU & PRÄZISE: Für die erste Runde die exakte Startzeit des Spiels berechnen
                    const completionTimestampMs = game.completedAt?.toMillis() || game.timestampCompleted?.toMillis();
                    if (completionTimestampMs && game.durationMillis && typeof game.durationMillis === 'number' && game.durationMillis > 0) {
                        previousTimestamp = completionTimestampMs - game.durationMillis;
                    } else if (game.durationMillis && typeof game.durationMillis === 'number' && game.roundHistory && game.roundHistory.length > 0) {
                         previousTimestamp = currentTimestamp - (game.durationMillis / game.roundHistory.length);
                    }
                  }
                  
                  // Berechne die Rundendauer
                  if (previousTimestamp && currentTimestamp > previousTimestamp) {
                    roundDuration = currentTimestamp - previousTimestamp;
                  }
                }
                
                // Alternative Quellen (falls die neue Logik nichts findet)
                if (roundDuration === 0) {
                  if (round.durationMillis && typeof round.durationMillis === 'number') {
                    roundDuration = round.durationMillis;
                  } else if (round.startTime && round.endTime) {
                    const startTime = round.startTime;
                    const endTime = round.endTime;
                    if (typeof startTime === 'number' && typeof endTime === 'number') {
                      roundDuration = endTime - startTime;
                    }
                  }
                }
                
                // Füge die Rundendauer zum Spieler hinzu (falls > 0 und realistisch)
                if (roundDuration >= 120000 && roundDuration < 900000) { // Filter: 2min <= duration < 15min
                  aggregatedRoundDurations[roundPlayerId].totalDuration += roundDuration;
                  aggregatedRoundDurations[roundPlayerId].roundCount += 1;
                }
              }
            }
          });
        }

        // ✅ NEU: Extrahiere Spiel-Ergebnisse aus completedGames
        if (game.finalScores && typeof game.gameNumber === 'number') {
          const topScore = game.finalScores.top || 0;
          const bottomScore = game.finalScores.bottom || 0;
          let winnerTeam: 'top' | 'bottom';
          
          if (topScore > bottomScore) {
            winnerTeam = 'top';
            gameWinsByTeam.top++;
          } else {
            winnerTeam = 'bottom';
            gameWinsByTeam.bottom++;
          }
          
          // Füge Spiel-Ergebnis hinzu
          gameResults.push({
            gameNumber: game.gameNumber,
            winnerTeam,
            topScore,
            bottomScore,
          });
          
          // Aktualisiere Spieler-Statistiken basierend auf Team-Zuordnung
          if (initialDataFromClient.teams) {
            const topPlayerIds = initialDataFromClient.teams.top.players.map(p => p.playerId);
            const bottomPlayerIds = initialDataFromClient.teams.bottom.players.map(p => p.playerId);
            
            if (winnerTeam === 'top') {
              topPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].wins++;
              });
              bottomPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].losses++;
              });
            } else {
              bottomPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].wins++;
              });
              topPlayerIds.forEach(playerId => {
                if (gameWinsByPlayer[playerId]) gameWinsByPlayer[playerId].losses++;
              });
            }
          }
        }
      });
      
      const sessionDurationSeconds = Math.round(totalGameDurationMillis / 1000);

      // Gewinner bestimmen - VEREINFACHT mit direkter top/bottom Logik
      let determinedWinnerTeamKey: 'top' | 'bottom' | 'draw' | undefined = initialDataFromClient.winnerTeamKey;
      
      if (!determinedWinnerTeamKey) {
        // ✅ KORREKT: Direkter Vergleich der SIEGE für top vs bottom (nicht Punkte!)
        if (totalEventCountsTop.sieg > totalEventCountsBottom.sieg) {
          determinedWinnerTeamKey = 'top';
        } else if (totalEventCountsBottom.sieg > totalEventCountsTop.sieg) {
          determinedWinnerTeamKey = 'bottom';
         } else {
          determinedWinnerTeamKey = 'draw';
         }
      }
      
      // ✅ STRIKT: Die 'teams'-Struktur vom Client MUSS Player Doc IDs enthalten.
      // Es findet keine Konvertierung mehr statt. Der Client ist verantwortlich.
      const correctedTeams: SessionTeams | null = initialDataFromClient.teams || null;

      if (correctedTeams) {
        // Validierungs-Schritt: Prüfen, ob die IDs im teams-Objekt gültige Player Doc IDs sind.
        const teamAPlayers = correctedTeams.top.players.map(p => p.playerId);
        const teamBPlayers = correctedTeams.bottom.players.map(p => p.playerId);
        const allTeamPlayerIds = [...teamAPlayers, ...teamBPlayers];

        for (const teamPlayerId of allTeamPlayerIds) {
          if (!participantPlayerIds.includes(teamPlayerId)) {
            const errorMsg = `CRITICAL DATA INCONSISTENCY for session ${sessionId}. Client sent a team structure with an ID '${teamPlayerId}' that is not in the official participantPlayerIds list.`;
            logger.error(errorMsg, {
              participantPlayerIds: participantPlayerIds,
              teamsFromClient: correctedTeams
            });
            // Strikte Regel: Bei Daten-Inkonsistenz sofort abbrechen.
            throw new HttpsError('invalid-argument', 'Team data contains invalid player IDs.');
          }
        }
        logger.info(`[finalizeSession] Validated that client-sent teams structure contains correct Player Doc IDs for session ${sessionId}.`);
      }
      
      // ✅ KORREKT: Rosen10player aus dem ERSTEN Spiel der Session bestimmen.
      let sessionRosen10player: string | null = null;
      if (completedGames.length > 0) {
        // Die Information wird aus dem In-Memory-Spieldokument gelesen, *bevor* die Transaktion sie oben löscht.
        const firstGame = completedGames[0];
        const rosen10PlayerValue = (firstGame as any).Rosen10player;
        let playerNumber: number | undefined;

        if (typeof rosen10PlayerValue === 'string') {
          const parsedNumber = parseInt(rosen10PlayerValue, 10);
          if (!isNaN(parsedNumber)) {
            playerNumber = parsedNumber;
          }
        } else if (typeof rosen10PlayerValue === 'number') {
          playerNumber = rosen10PlayerValue;
        }

        if (playerNumber && playerNumberToIdMap.has(playerNumber)) {
          const playerId = playerNumberToIdMap.get(playerNumber);
          if (playerId) {
            sessionRosen10player = playerId;
            logger.info(`[finalizeSession] Rosen10player for session ${sessionId} determined from Game 1: Player ${playerNumber} -> ID ${sessionRosen10player}`);
          }
        } else {
          logger.warn(`[finalizeSession] Could not determine valid Rosen10player from Game 1 for session ${sessionId}. Value was: '${rosen10PlayerValue}'.`);
        }
      }

      // Sortiere gameResults nach gameNumber für chronologische Reihenfolge
      gameResults.sort((a, b) => a.gameNumber - b.gameNumber);

      // Base update data (ohne undefined Werte)
      const baseUpdateData = {
        createdAt: createdAtTimestamp,
        startedAt: startedAtTimestamp,
        endedAt: now,
        lastActivity: now,
        status: "completed" as const,
        gamesPlayed: completedGames.length,
        durationSeconds: sessionDurationSeconds > 0 ? sessionDurationSeconds : 0,
        finalScores: { top: totalPointsTeamTop, bottom: totalPointsTeamBottom },
        finalStriche: { top: totalStricheTopRecord, bottom: totalStricheBottomRecord },
        eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
        sessionTotalWeisPoints: sessionTotalWeisPoints,
        participantUids: initialDataFromClient.participantUids || [], // Speichern, falls vorhanden, sonst leeres Array
        participantPlayerIds: participantPlayerIds,
        playerNames: initialDataFromClient.playerNames,
        teams: correctedTeams,
        groupId: initialDataFromClient.gruppeId || null,
        pairingIdentifiers: initialDataFromClient.pairingIdentifiers || null,
        winnerTeamKey: determinedWinnerTeamKey, 
        notes: initialDataFromClient.notes || [],
        totalRounds: sessionTotalRounds,
      };

      // Conditional properties (nur hinzufügen wenn nicht null/undefined)
      const finalUpdateData: typeof baseUpdateData & {
        Rosen10player?: string;
        aggregatedTrumpfCountsByPlayer?: TrumpfCountsByPlayer;
        aggregatedRoundDurationsByPlayer?: RoundDurationsByPlayer;
        gameResults?: Array<{ gameNumber: number; winnerTeam: 'top' | 'bottom'; topScore: number; bottomScore: number; }>;
        gameWinsByTeam?: { top: number; bottom: number; };
        gameWinsByPlayer?: { [playerId: string]: { wins: number; losses: number; } };
      } = { ...baseUpdateData };

      if (sessionRosen10player) {
        finalUpdateData.Rosen10player = sessionRosen10player;
      }
      
      // NEU: Füge die aggregierten Trumpf-Counts hinzu, wenn sie existieren
      if (Object.keys(aggregatedTrumpfCounts).length > 0) {
        finalUpdateData.aggregatedTrumpfCountsByPlayer = aggregatedTrumpfCounts;
      }

      // ✅ NEU: Füge die aggregierten Rundenzeiten hinzu, wenn sie existieren
      if (Object.keys(aggregatedRoundDurations).length > 0) {
        // Überprüfe, ob mindestens ein Spieler tatsächlich Rundenzeiten hat
        const hasValidRoundTimes = Object.values(aggregatedRoundDurations).some(
          playerData => playerData.roundCount > 0 && playerData.totalDuration > 0
        );
        
        if (hasValidRoundTimes) {
          finalUpdateData.aggregatedRoundDurationsByPlayer = aggregatedRoundDurations;
        }
      }
      
      // ✅ NEU: Füge Spiel-Ergebnisse und Aggregate hinzu
      if (gameResults.length > 0) {
        finalUpdateData.gameResults = gameResults;
        finalUpdateData.gameWinsByTeam = gameWinsByTeam;
        finalUpdateData.gameWinsByPlayer = gameWinsByPlayer;
      }
      
      // SCHREIBVORGANG
      transaction.set(summaryDocRef, finalUpdateData, { merge: true });
      logger.info(`--- Transaction END for ${sessionId} (document set/merged) ---`);
      
      // IDs für die spätere Löschung sammeln
      return completedGames
        .map(game => game.activeGameId)
        .filter((id): id is string => !!id);
    });

    // Nach erfolgreicher Transaktion, die Aufräumarbeiten durchführen
    if (activeGameIdsToDelete && activeGameIdsToDelete.length > 0) {
      const cleanupBatch = db.batch();

      const sessionDocRef = db.collection('sessions').doc(sessionId);
      cleanupBatch.update(sessionDocRef, {
        currentActiveGameId: null,
        lastUpdated: admin.firestore.Timestamp.now()
      });
      logger.info(`[finalizeSession] Queued update for session ${sessionId} to clear activeGameId.`);

      // KRITISCHE KORREKTUR: Prüfe JEDEN activeGame BEVOR er gelöscht wird
      for (const activeGameId of activeGameIdsToDelete) {
        try {
          const activeGameRef = db.collection('activeGames').doc(activeGameId);
          const activeGameSnap = await activeGameRef.get();
          
          if (activeGameSnap.exists) {
            const activeGameData = activeGameSnap.data();
            
            // NUR löschen wenn das Spiel wirklich als "completed" markiert ist
            if (activeGameData?.status === 'completed') {
              cleanupBatch.delete(activeGameRef);
              logger.info(`[finalizeSession] Queued deletion for completed active game ${activeGameId}.`);
            } else {
              logger.warn(`[finalizeSession] WARNUNG: ActiveGame ${activeGameId} hat Status '${activeGameData?.status}' statt 'completed'. NICHT gelöscht um Datenverlust zu vermeiden!`);
            }
          } else {
            logger.warn(`[finalizeSession] ActiveGame ${activeGameId} existiert nicht mehr. Überspringe Löschung.`);
          }
        } catch (error) {
          logger.error(`[finalizeSession] Fehler beim Prüfen von activeGame ${activeGameId}:`, error);
          // Bei Fehler NICHT löschen, um Datenverlust zu vermeiden
        }
      }

      await cleanupBatch.commit();
      logger.info(`[finalizeSession] Cleanup of session and verified active games completed for ${sessionId}.`);
    } else {
      logger.info(`[finalizeSession] No active games to clean up for session ${sessionId}.`);
    }

    // 🚀 ENTFERNT: Die Statistik-Aktualisierung wird jetzt durch einen zentralen Trigger gehandhabt.
    // if (participantPlayerIds && participantPlayerIds.length > 0) {
    //   // ...
    // }

    logger.info(`[finalizeSession] END for session ${sessionId}`);
    return { success: true };
  } catch (error) {
    logger.error(`[finalizeSession] Fehler beim Finalisieren der session ${sessionId}:`, error);
    throw new HttpsError("internal", "Fehler beim Finalisieren der Session.");
  }
});
