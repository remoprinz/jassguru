import * as admin from 'firebase-admin';
import { HttpsError, onCall, CallableRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { updateGroupComputedStatsAfterSession } from './groupStatsCalculator'; // Gruppenstatistiken
import { updateEloForSession } from './jassEloUpdater'; // Elo-Update
// ❌ ENTFERNT: saveRatingHistorySnapshot nicht mehr benötigt (session_end Dokumente werden nicht mehr geschrieben)
import { updatePlayerDataAfterSession } from './unifiedPlayerDataService'; // ✅ UNIFIED Player Data Service (ersetzt 3 alte Services)
import { updateChartsAfterSession } from './chartDataUpdater'; // 🆕 Chart-Updates

const db = admin.firestore();


const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

const normalizeTrumpfKey = (farbe: string): string => {
  const normalized = String(farbe || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['eicheln', 'eichel', 'eichle', 'schaufel', 'gras'].includes(normalized)) return 'eichel';
  if (['rosen', 'rose', 'kreuz'].includes(normalized)) return 'rosen';
  if (['schellen', 'schelle', 'schalle', 'herz'].includes(normalized)) return 'schellen';
  if (['schilten', 'schilte', 'ecke'].includes(normalized)) return 'schilten';
  if (normalized === 'une' || normalized === 'unde') return 'unde';
  if (normalized === 'misere' || normalized === 'miserefr') return 'misère';
  if (normalized === 'trumpf') return 'obe';

  return normalized;
};


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
  startingPlayer?: 1 | 2 | 3 | 4; // ✅ HINZUGEFÜGT: Der trumpfansagende Spieler
  _savedWeisPoints?: TeamScores;
  timestamp?: number;
  durationMillis?: number;
  startTime?: number;
  endTime?: number;
  wasPaused?: boolean; // Flag für pausierte Runden (für Statistiken)
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
    roundDurations: number[]; // ✅ NEU: Array aller Rundenzeiten für Median-Berechnung
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
    // 🆕 NEU: Vollständige Game-Daten für Auswertungen
    teams?: SessionTeams;
    finalStriche?: { top: StricheRecord; bottom: StricheRecord };
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
  
  // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr in jassGameSummaries gespeichert
  // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)
}

export const finalizeSession = onCall({ region: "europe-west1" }, async (request: CallableRequest<FinalizeSessionData>) => {
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

  // 🚀 NEUE ARCHITEKTUR: Direkt neue Struktur verwenden
  if (!initialDataFromClient.gruppeId) {
    throw new HttpsError("invalid-argument", "Group ID is required for session finalization.");
  }
  
  const groupId = initialDataFromClient.gruppeId;
  logger.info(`[finalizeSession] Using NEW structure for group ${groupId}`);
  
  // 🚀 NEUE ARCHITEKTUR: Alle Daten unter der Gruppe
  const summaryDocRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId);
  // 🚀 NEUE ARCHITEKTUR: CompletedGames auch unter der Gruppe
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
      
      // 🔧 FIREBASE ADMIN SDK FIX: Safe type conversion
      const summaryDocSnap = summarySnap as unknown as admin.firestore.DocumentSnapshot;
      const existingSummaryData = summaryDocSnap.exists ? summaryDocSnap.data() : null;

      if (existingSummaryData && existingSummaryData.status === "completed") {
        logger.warn(`Session ${sessionId} is already completed. Skipping finalization.`);
        return []; // Return empty array to signal no deletions needed
      }
      
      const completedGames: CompletedGameData[] = gamesSnap.docs.map(doc => doc.data() as CompletedGameData);
      const finalizationNotes: string[] = [];

      // KONSISTENZPRÜFUNG MIT PROAKTIVEM FALLBACK
      if (completedGames.length < expectedGameNumber) {
        const warningMessage = `Game count mismatch. Expected ${expectedGameNumber}, found ${completedGames.length}. Searching activeGames for missing completed games...`;
        logger.warn(`[finalizeSession] Session ${sessionId}: ${warningMessage}`);
        finalizationNotes.push(warningMessage);
        
        // 🛡️ FALLBACK: Suche fehlende Spiele in activeGames Collection
        try {
          const activeGamesQuery = db.collection('activeGames')
            .where('sessionId', '==', sessionId)
            .where('status', '==', 'completed');
          
          const activeGamesSnap = await activeGamesQuery.get();
          
          if (!activeGamesSnap.empty) {
            logger.info(`[finalizeSession] Found ${activeGamesSnap.size} completed games in activeGames for session ${sessionId}`);
            
            // Erstelle Set mit bereits vorhandenen activeGameIds
            const existingGameIds = new Set(completedGames.map(g => g.activeGameId).filter(Boolean));
            
            for (const activeGameDoc of activeGamesSnap.docs) {
              const activeGameData = activeGameDoc.data();
              const activeGameId = activeGameDoc.id;
              
              // Wenn dieses Spiel noch nicht in completedGames ist
              if (!existingGameIds.has(activeGameId)) {
                logger.info(`[finalizeSession] 🔄 Recovering missing completed game: ${activeGameId}`);
                
                // Berechne Spiel-Dauer aus roundHistory
                let gameDuration = 0;
                if (activeGameData.roundHistory && Array.isArray(activeGameData.roundHistory)) {
                  const timestamps = activeGameData.roundHistory
                    .map((r: any) => r.timestamp)
                    .filter((t: any): t is number => typeof t === 'number')
                    .sort((a: number, b: number) => a - b);
                  
                  if (timestamps.length >= 2) {
                    gameDuration = timestamps[timestamps.length - 1] - timestamps[0];
                  }
                }
                
                // Rekonstruiere CompletedGameData aus activeGame
                const recoveredGame: CompletedGameData = {
                  gameNumber: activeGameData.currentGameNumber || (completedGames.length + 1),
                  activeGameId: activeGameId,
                  finalScores: activeGameData.scores || { top: 0, bottom: 0 },
                  finalStriche: activeGameData.striche || {
                    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                  },
                  roundHistory: activeGameData.roundHistory || [],
                  weisPoints: activeGameData.weisPoints || { top: 0, bottom: 0 },
                  durationMillis: gameDuration,
                  completedAt: activeGameData.lastUpdated || admin.firestore.Timestamp.now(),
                  // ✅ ENTFERNT: participantUids werden nicht mehr geschrieben (nur participantPlayerIds)
                  playerNames: activeGameData.playerNames || {},
                  sessionId: sessionId,
                };
                
                // Füge zu completedGames hinzu
                completedGames.push(recoveredGame);
                
                // Schreibe in completedGames Subcollection
                // ✅ KORREKTUR: Verwende gameNumber als Document-ID, nicht activeGameId!
                const gameDocRef = completedGamesColRef.doc(String(recoveredGame.gameNumber));
                transaction.set(gameDocRef, recoveredGame);
                
                logger.info(`[finalizeSession] ✅ Successfully recovered and wrote missing game ${activeGameId} (gameNumber: ${recoveredGame.gameNumber}) to completedGames/${recoveredGame.gameNumber}`);
                
                // Aktualisiere Notiz
                const recoveryNote = `Recovered missing game ${recoveredGame.gameNumber} from activeGames (ID: ${activeGameId})`;
                finalizationNotes.push(recoveryNote);
              }
            }
            
            // Sortiere completedGames nach gameNumber für korrekte Aggregation
            completedGames.sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0));
            
            if (completedGames.length === expectedGameNumber) {
              logger.info(`[finalizeSession] ✅ All ${expectedGameNumber} games recovered successfully!`);
              finalizationNotes.push(`Successfully recovered all ${expectedGameNumber} games`);
            } else {
              logger.warn(`[finalizeSession] ⚠️ Still missing games: Expected ${expectedGameNumber}, recovered ${completedGames.length}`);
            }
          } else {
            logger.warn(`[finalizeSession] No completed games found in activeGames for session ${sessionId}`);
          }
        } catch (fallbackError) {
          logger.error(`[finalizeSession] Error during activeGames fallback recovery:`, fallbackError);
          finalizationNotes.push(`Fallback recovery failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
      
      // AB HIER HABEN WIR ALLE VERFÜGBAREN SPIELE (MIT FALLBACK-RECOVERY)
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
      
      // ✅ KORREKTUR: createdAt NICHT überschreiben - es repräsentiert den Session-Start
      // Wenn bereits vorhanden, behalten wir es. Nur bei neuen Sessions setzen wir es.
      const createdAtTimestamp = existingSummaryData?.createdAt || startedAtTimestamp;

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
        aggregatedRoundDurations[playerId] = { 
          totalDuration: 0, 
          roundCount: 0,
          roundDurations: [] // ✅ NEU: Array für Median-Berechnung
        };
      });

      // ✅ NEU: Arrays für Spiel-Ergebnisse und Aggregate initialisieren
      const gameResults: Array<{
        gameNumber: number;
        winnerTeam: 'top' | 'bottom';
        topScore: number;
        bottomScore: number;
        teams?: SessionTeams;
        finalStriche?: { top: StricheRecord; bottom: StricheRecord };
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
        
        // ✅ NEU: Runden für die Session-Statistik direkt hier aufsummieren
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          sessionTotalRounds += game.roundHistory.length;
        }

        // ✅ PHASE 3: roundDurationsByPlayer pro Game berechnen
        const gameRoundDurationsByPlayer: { [playerId: string]: number[] } = {};
        participantPlayerIds.forEach(playerId => {
          gameRoundDurationsByPlayer[playerId] = [];
        });

        // ✅ Trumpf-Aggregation aus roundHistory + roundDurations pro Game
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          game.roundHistory.forEach((round, roundIndex) => {
            // ✅ KRITISCHER FIX: Trumpf-Aggregation - der trumpfansagende Spieler ist der startingPlayer!
            if (round.startingPlayer) {
              const trumpfPlayerId = playerNumberToIdMap.get(round.startingPlayer);
              if (trumpfPlayerId && round.farbe) {
                if (!aggregatedTrumpfCounts[trumpfPlayerId]) {
                  aggregatedTrumpfCounts[trumpfPlayerId] = {};
                }
                const farbeKey = normalizeTrumpfKey(round.farbe);
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
                    let completionTimestampMs: number | undefined;
                    
                    // Sichere Timestamp-Extraktion - behandle verschiedene Datentypen
                    if (game.completedAt) {
                      if (typeof game.completedAt === 'object' && 'toMillis' in game.completedAt) {
                        completionTimestampMs = (game.completedAt as admin.firestore.Timestamp).toMillis();
                      } else if (typeof game.completedAt === 'object' && 'seconds' in game.completedAt) {
                        // Firestore Timestamp-ähnliches Objekt mit seconds/nanoseconds
                        completionTimestampMs = (game.completedAt as any).seconds * 1000 + Math.floor((game.completedAt as any).nanoseconds / 1000000);
                      } else if (typeof game.completedAt === 'number') {
                        completionTimestampMs = game.completedAt;
                      }
                    }
                    
                    if (!completionTimestampMs && game.timestampCompleted) {
                      if (typeof game.timestampCompleted === 'object' && 'toMillis' in game.timestampCompleted) {
                        completionTimestampMs = (game.timestampCompleted as admin.firestore.Timestamp).toMillis();
                      } else if (typeof game.timestampCompleted === 'object' && 'seconds' in game.timestampCompleted) {
                        completionTimestampMs = (game.timestampCompleted as any).seconds * 1000 + Math.floor((game.timestampCompleted as any).nanoseconds / 1000000);
                      } else if (typeof game.timestampCompleted === 'number') {
                        completionTimestampMs = game.timestampCompleted;
                      }
                    }
                    
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
                if (roundDuration >= 60000 && roundDuration < 720000 && !round.wasPaused) { // Filter: 1min <= duration < 12min UND nicht pausiert
                  // ✅ Session-weit (wie bisher)
                  aggregatedRoundDurations[roundPlayerId].totalDuration += roundDuration;
                  aggregatedRoundDurations[roundPlayerId].roundCount += 1;
                  aggregatedRoundDurations[roundPlayerId].roundDurations.push(roundDuration);
                  
                  // ✅ PHASE 3: Pro Game
                  gameRoundDurationsByPlayer[roundPlayerId].push(roundDuration);
                }
              }
            }
          });
        }
        
        // ✅ PHASE 3: Speichere roundDurationsByPlayer im completedGame
        if (Object.keys(gameRoundDurationsByPlayer).length > 0) {
          const hasValidRoundTimes = Object.values(gameRoundDurationsByPlayer).some(
            durations => durations.length > 0
          );
          if (hasValidRoundTimes) {
            updateData.roundDurationsByPlayer = gameRoundDurationsByPlayer;
          }
        }
        
        // ✅ completedAt für jedes Spiel sicherstellen
        if (!game.completedAt) {
          // 1) timestampCompleted
          let candidateTs: admin.firestore.Timestamp | null = game.timestampCompleted || null;
          // 2) max(roundHistory[].timestamp | savedAt)
          if (!candidateTs && game.roundHistory && Array.isArray(game.roundHistory) && game.roundHistory.length > 0) {
            const millis: number[] = [];
            game.roundHistory.forEach((r: any) => {
              if (typeof r?.timestamp === 'number') millis.push(r.timestamp);
              else if (r?.savedAt && typeof r.savedAt.toMillis === 'function') millis.push(r.savedAt.toMillis());
              else if (typeof r?.savedAt === 'number') millis.push(r.savedAt);
            });
            if (millis.length > 0) {
              const maxMs = Math.max(...millis);
              candidateTs = admin.firestore.Timestamp.fromMillis(maxMs);
            }
          }
          // 3) Fallback: now (letzter Sicherheitsschritt in Finalisierung)
          const safeCompletedAt = candidateTs || now;
          updateData.completedAt = safeCompletedAt;
        }
        
        // Update completedGame Dokument
        transaction.update(gameDocRef, updateData);

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
            // 🆕 NEU: Schreibe vollständige Game-Daten
            teams: initialDataFromClient.teams || undefined,
            finalStriche: game.finalStriche || {
              top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
              bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
            }
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

      // Gewinner bestimmen - KORREKT basierend auf GESAMTSTRICHEN
      let determinedWinnerTeamKey: 'top' | 'bottom' | 'draw' | undefined = initialDataFromClient.winnerTeamKey;
      
      if (!determinedWinnerTeamKey) {
        // ✅ KORREKT: Vergleiche GESAMTSTRICHE (berg + sieg + matsch + schneider + kontermatsch)
        const totalStricheTop = totalStricheTopRecord.berg + totalStricheTopRecord.sieg + 
                               totalStricheTopRecord.matsch + totalStricheTopRecord.schneider + 
                               totalStricheTopRecord.kontermatsch;
        const totalStricheBottom = totalStricheBottomRecord.berg + totalStricheBottomRecord.sieg + 
                                  totalStricheBottomRecord.matsch + totalStricheBottomRecord.schneider + 
                                  totalStricheBottomRecord.kontermatsch;
        
        if (totalStricheTop > totalStricheBottom) {
          determinedWinnerTeamKey = 'top';
        } else if (totalStricheBottom > totalStricheTop) {
          determinedWinnerTeamKey = 'bottom';
        } else {
          determinedWinnerTeamKey = 'draw'; // Echter Gleichstand bei Gesamtstrichen
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
        
        // ✅ KORREKTUR: Rosen10player kann jetzt direkt eine Player-ID sein (vom Frontend gesetzt)
        // Oder noch eine Player-Nummer (für Legacy-Kompatibilität)
        if (typeof rosen10PlayerValue === 'string') {
          // Prüfe ob es eine Player-ID ist (nicht numerisch) oder eine Player-Nummer (numerisch)
          const parsedNumber = parseInt(rosen10PlayerValue, 10);
          if (!isNaN(parsedNumber) && rosen10PlayerValue === String(parsedNumber)) {
            // Es ist eine Player-Nummer (z.B. "1", "2", "3", "4")
            const playerNumber = parsedNumber;
            if (playerNumberToIdMap.has(playerNumber)) {
              const playerId = playerNumberToIdMap.get(playerNumber);
              if (playerId) {
                sessionRosen10player = playerId;
                logger.info(`[finalizeSession] Rosen10player for session ${sessionId} determined from Game 1: Player Number ${playerNumber} -> ID ${sessionRosen10player}`);
              }
            } else {
              logger.warn(`[finalizeSession] Could not map Player Number ${playerNumber} to Player ID for session ${sessionId}.`);
            }
          } else {
            // Es ist direkt eine Player-ID (z.B. "abc123xyz")
            // Validiere dass die Player-ID in der Teilnehmerliste ist
            if (participantPlayerIds.includes(rosen10PlayerValue)) {
              sessionRosen10player = rosen10PlayerValue;
              logger.info(`[finalizeSession] Rosen10player for session ${sessionId} determined from Game 1: Direct Player ID ${sessionRosen10player}`);
            } else {
              logger.warn(`[finalizeSession] Rosen10player ID '${rosen10PlayerValue}' from Game 1 is not in participantPlayerIds for session ${sessionId}.`);
            }
          }
        } else if (typeof rosen10PlayerValue === 'number') {
          // Legacy: Player-Nummer als Number
          const playerNumber = rosen10PlayerValue;
          if (playerNumberToIdMap.has(playerNumber)) {
            const playerId = playerNumberToIdMap.get(playerNumber);
            if (playerId) {
              sessionRosen10player = playerId;
              logger.info(`[finalizeSession] Rosen10player for session ${sessionId} determined from Game 1: Player Number ${playerNumber} -> ID ${sessionRosen10player}`);
            }
          } else {
            logger.warn(`[finalizeSession] Could not map Player Number ${playerNumber} to Player ID for session ${sessionId}.`);
          }
        } else if (rosen10PlayerValue === null || rosen10PlayerValue === undefined) {
          logger.warn(`[finalizeSession] Rosen10player is null/undefined in Game 1 for session ${sessionId}.`);
        } else {
          logger.warn(`[finalizeSession] Unexpected Rosen10player type in Game 1 for session ${sessionId}. Value: '${rosen10PlayerValue}' (type: ${typeof rosen10PlayerValue}).`);
        }
      }

      // Sortiere gameResults nach gameNumber für chronologische Reihenfolge
      gameResults.sort((a, b) => a.gameNumber - b.gameNumber);
      
      // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr in jassGameSummaries gespeichert
      // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)

      // Base update data (ohne undefined Werte)
      const baseUpdateData = {
        createdAt: createdAtTimestamp,
        startedAt: startedAtTimestamp,
        endedAt: now,
        completedAt: now, // ✅ Summary completedAt = endedAt
        lastActivity: now,
        status: "completed" as const,
        gamesPlayed: completedGames.length,
        durationSeconds: sessionDurationSeconds > 0 ? sessionDurationSeconds : 0,
        finalScores: { top: totalPointsTeamTop, bottom: totalPointsTeamBottom },
        finalStriche: { top: totalStricheTopRecord, bottom: totalStricheBottomRecord },
        eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
        sessionTotalWeisPoints: sessionTotalWeisPoints,
        // Entfernt: participantUids werden nicht mehr persistiert (nur Player-IDs sind maßgeblich)
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
      
      // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr hinzugefügt
      // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)
      
      // 🚀 NEUE ARCHITEKTUR: Direkte Speicherung in neuer Struktur
      logger.info(`[finalizeSession] 📊 Writing session ${sessionId} to NEW structure: groups/${groupId}/jassGameSummaries`);
      
      // Entferne groupId aus den Daten (nicht nötig in neuer Struktur)
      const newFinalUpdateData = { ...finalUpdateData };
      if ('groupId' in newFinalUpdateData) {
        delete (newFinalUpdateData as any).groupId;
      }
      
      transaction.set(summaryDocRef, newFinalUpdateData, { merge: true });
      
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

    // ✅ Elo-Update (post ex)
    try {
      await updateEloForSession(groupId, sessionId);
      logger.info(`[finalizeSession] Elo update completed successfully for session ${sessionId}`);
    } catch (e) {
      logger.error(`[finalizeSession] Elo update failed for session ${sessionId}:`, e);
    }

    // ❌ ENTFERNT: session_end Dokumente in ratingHistory sind nicht mehr benötigt!
    // Charts nutzen nur 'game' Events (pro Spiel), die bereits in jassEloUpdater.ts geschrieben werden.
    // Das letzte 'game' Event einer Session hat bereits das finale Rating.
    // session_end Dokumente würden nur redundante Datenpunkte erzeugen.

    // 🆕 playerFinalRatings nach Elo-Update in jassGameSummary schreiben
    try {
      logger.info(`[finalizeSession] Saving player final ratings for session ${sessionId}`);
      
      const playerFinalRatings: { [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; displayName?: string; } } = {};
      
      for (const playerId of participantPlayerIds) {
        const playerDoc = await db.collection('players').doc(playerId).get();
        const playerData = playerDoc.data();
        
        if (playerData) {
          // 🔧 KORREKTUR: Berechne das korrekte Session-Delta aus ratingHistory
          let sessionDelta = 0;
          try {
            // Hole alle ratingHistory Einträge für diese Session
            const ratingHistoryQuery = db.collection(`players/${playerId}/ratingHistory`)
              .where('sessionId', '==', sessionId)
              .orderBy('completedAt', 'asc'); // ✅ KORRIGIERT: completedAt (Index existiert bereits)
            
            const ratingHistorySnap = await ratingHistoryQuery.get();
            
            if (!ratingHistorySnap.empty) {
              const entries = ratingHistorySnap.docs.map(doc => doc.data());
              
              // ✅ KORREKT: Summiere nur GAME-Deltas (nicht session_end, da die alt sein könnten)
              sessionDelta = entries.reduce((sum: number, entry: any) => {
                // Nur game Events zählen, session_end ignorieren
                if (entry.eventType === 'game') {
                  // ✅ ROBUST: Unterstütze sowohl Zahl als auch Object (delta.rating)
                  const deltaValue = typeof entry.delta === 'number' 
                    ? entry.delta 
                    : (entry.delta?.rating || 0);
                  return sum + deltaValue;
                }
                return sum;
              }, 0);
              
              logger.debug(`[finalizeSession] Player ${playerId} session delta: ${sessionDelta.toFixed(2)} (sum of ${entries.length} games)`);
            } else {
              logger.warn(`[finalizeSession] No ratingHistory entries found for player ${playerId} in session ${sessionId}`);
              sessionDelta = playerData.lastSessionDelta || 0; // Fallback
            }
          } catch (historyError) {
            logger.error(`[finalizeSession] Error calculating session delta for player ${playerId}:`, historyError);
            sessionDelta = playerData.lastSessionDelta || 0; // Fallback
          }
          
          // ✅ WICHTIG: Hole displayName für playerFinalRatings (für Frontend-Charts)
          let displayName = playerId;
          try {
            const playerDoc2 = await db.collection('players').doc(playerId).get();
            if (playerDoc2.exists) {
              displayName = playerDoc2.data()?.displayName || playerId;
            }
          } catch (nameError) {
            logger.warn(`[finalizeSession] Could not load displayName for player ${playerId}:`, nameError);
          }
          
          playerFinalRatings[playerId] = {
            rating: playerData.globalRating || 100,
            ratingDelta: sessionDelta,
            gamesPlayed: playerData.gamesPlayed || 0,
            displayName: displayName, // ✅ WICHTIG: Für Frontend-Charts benötigt!
          };
        }
      }
      
      // 🔧 KORREKTUR: Nur schreiben wenn playerFinalRatings noch nicht existieren
      const summaryDoc = await summaryDocRef.get();
      const existingData = summaryDoc.data();
      
      if (!existingData?.playerFinalRatings) {
        await summaryDocRef.update({ playerFinalRatings });
        logger.info(`[finalizeSession] Player final ratings saved for session ${sessionId} (${participantPlayerIds.length} players)`);
      } else {
        logger.info(`[finalizeSession] Player final ratings already exist for session ${sessionId}, skipping write`);
      }
    } catch (e) {
      logger.error(`[finalizeSession] Failed to save player final ratings for session ${sessionId}:`, e);
    }

    // ✅ KRITISCHE KORREKTUR: Gruppenstatistiken nach erfolgreicher Session-Finalisierung aktualisieren
    if (initialDataFromClient.gruppeId) {
      logger.info(`[finalizeSession] Triggering group statistics update for group ${initialDataFromClient.gruppeId}`);
      
      try {
        await updateGroupComputedStatsAfterSession(initialDataFromClient.gruppeId);
        logger.info(`[finalizeSession] ✅ Group statistics update completed for group ${initialDataFromClient.gruppeId}`);
      } catch (error) {
        logger.error(`[finalizeSession] Fehler bei der Gruppenstatistik-Berechnung für Gruppe ${initialDataFromClient.gruppeId}:`, error);
        // Nicht kritisch - soll Session-Finalisierung nicht blockieren
      }
    } else {
      logger.info(`[finalizeSession] No group ID provided, skipping group statistics update`);
    }

    // ✅ UNIFIED PLAYER DATA: Aktualisiere alle Spieler-Daten (Scores, Stats, Partner, Opponents)
    logger.info(`[finalizeSession] Triggering unified player data update for ${participantPlayerIds.length} players`);
    
    try {
    // ✅ SINGLE SOURCE OF TRUTH: Nur noch EIN Service-Aufruf statt 3!
      await updatePlayerDataAfterSession(
      initialDataFromClient.gruppeId,
      sessionId,
      participantPlayerIds,
      null // Sessions haben kein tournamentId - nur Turniere haben das
      );
      logger.info(`[finalizeSession] ✅ Unified player data update completed for ${participantPlayerIds.length} players`);
    } catch (error) {
      logger.error(`[finalizeSession] Fehler beim unified player data update:`, error);
      // Nicht kritisch - soll Session-Finalisierung nicht blockieren
    }

    // 🆕 CHART-DATA UPDATES: Aktualisiere alle Chart-Dokumente
    if (initialDataFromClient.gruppeId) {
      try {
        logger.info(`[finalizeSession] Triggering chart data update for session ${sessionId}`);
        await updateChartsAfterSession(
          initialDataFromClient.gruppeId,
          sessionId,
          false // Nicht-regular Sessions sind keine Turniere
        );
        logger.info(`[finalizeSession] Chart data update completed for session ${sessionId}`);
      } catch (chartError) {
        logger.error(`[finalizeSession] Error updating chart data:`, chartError);
        // Nicht kritisch - soll Session-Finalisierung nicht blockieren
      }
    }

    // ✅ MIGRATION ABGESCHLOSSEN: Alte Services erfolgreich durch unified Service ersetzt!
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
