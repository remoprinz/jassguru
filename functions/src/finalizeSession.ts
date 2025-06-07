import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PlayerComputedStats, initialPlayerComputedStats } from "./models/player-stats.model";
import { updateGroupComputedStatsAfterSession } from "./groupStatsCalculator";

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

// NEUE HILFSFUNKTION für Spieler-Session-Statistiken
async function updatePlayerStatsAfterSession(
  db: admin.firestore.Firestore,
  transaction: admin.firestore.Transaction,
  participantUids: string[],
  sessionFinalData: { 
    finalScores: TeamScores; 
    finalStriche?: { top: StricheRecord; bottom: StricheRecord }; 
    teams?: SessionTeams | null; 
    sessionId: string;
    winnerTeamKey?: 'teamA' | 'teamB' | 'draw'; // Expliziter Gewinner-Key
    teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
    playerNames: PlayerNames; // NEU: playerNames hier explizit machen
  },
  sessionTimestamp: admin.firestore.Timestamp
) {
  const now = admin.firestore.Timestamp.now();

  // NEU: Lade completedGames Subcollection für Game-Level-Processing
  const completedGamesColRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionFinalData.sessionId).collection(COMPLETED_GAMES_SUBCOLLECTION);
  const completedGamesSnap = await transaction.get(completedGamesColRef.orderBy("gameNumber"));
  
  const completedGames: CompletedGameData[] = [];
  completedGamesSnap.forEach(doc => {
    completedGames.push(doc.data() as CompletedGameData);
  });
  
  logger.info(`[updatePlayerStatsAfterSession] Loaded ${completedGames.length} completed games for session ${sessionFinalData.sessionId}`);
  
  // Array, um die zu aktualisierenden Statistiken und deren Referenzen zu speichern
  const statsToUpdate: { ref: admin.firestore.DocumentReference, data: PlayerComputedStats }[] = [];

  // Phase 1: Alle Leseoperationen
  for (const userId of participantUids) {
    const playerStatsRef = db.collection("playerComputedStats").doc(userId);
    // try/catch hier ist für einzelne Spieler-Updates gut, aber die Transaktion selbst wird nicht hier gestartet/committet
    try {
      // await db.runTransaction(async (transaction) => { // ENTFERNT: Keine neue Transaktion starten
      const playerStatsDoc = await transaction.get(playerStatsRef); // <--- BENUTZE ÜBERGEBENE TRANSAKTION
        let stats: PlayerComputedStats;

        if (!playerStatsDoc.exists) {
        logger.info(`[updatePlayerStatsAfterSession] Player ${userId}: No existing stats doc. Initializing with initialPlayerComputedStats.`); // NEUES LOG
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

        stats.currentUndefeatedStreakSessions = stats.currentUndefeatedStreakSessions || 0;

      // --- Start: Partner- und Gegner-Aggregation Initialisierung ---
      if (!stats.partnerAggregates) {
        stats.partnerAggregates = [];
      }
      if (!stats.opponentAggregates) {
        stats.opponentAggregates = [];
      }
      // --- Ende: Partner- und Gegner-Aggregation Initialisierung ---

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
          stats.currentUndefeatedStreakSessions = (stats.currentUndefeatedStreakSessions || 0) + 1;
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
          stats.currentUndefeatedStreakSessions = 0;
          if (!stats.longestLossStreakSessions || stats.currentSessionLossStreak > stats.longestLossStreakSessions.value) {
            stats.longestLossStreakSessions = {
              value: stats.currentSessionLossStreak,
              startDate: stats.currentSessionLossStreak === 1 ? sessionTimestamp : stats.longestLossStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        } else { // 'tie'
          stats.currentSessionWinStreak = 0;
          stats.currentSessionLossStreak = 0;
          stats.currentSessionWinlessStreak = (stats.currentSessionWinlessStreak || 0) + 1;
          stats.currentUndefeatedStreakSessions = (stats.currentUndefeatedStreakSessions || 0) + 1;
          if (!stats.longestWinlessStreakSessions || stats.currentSessionWinlessStreak > stats.longestWinlessStreakSessions.value) {
            stats.longestWinlessStreakSessions = {
              value: stats.currentSessionWinlessStreak,
              startDate: stats.currentSessionWinlessStreak === 1 ? sessionTimestamp : stats.longestWinlessStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        }

        // NEU: Logik für longestUndefeatedStreakSessions (nachdem currentUndefeatedStreakSessions aktualisiert wurde)
        if (sessionOutcome === 'win' || sessionOutcome === 'tie') {
          // Nur erhöhen, wenn nicht schon durch 'tie' oben geschehen
          if (sessionOutcome === 'win') {
            stats.currentUndefeatedStreakSessions = (stats.currentUndefeatedStreakSessions || 0) + 1;
          }
          if (!stats.longestUndefeatedStreakSessions || stats.currentUndefeatedStreakSessions > stats.longestUndefeatedStreakSessions.value) {
            stats.longestUndefeatedStreakSessions = {
              value: stats.currentUndefeatedStreakSessions,
              startDate: stats.currentUndefeatedStreakSessions === 1 ? sessionTimestamp : stats.longestUndefeatedStreakSessions?.startDate || sessionTimestamp,
              endDate: sessionTimestamp
            };
          }
        }

        // NEU: Session-Highlights/Lowlights aktualisieren
        if (playerTeamKey && sessionFinalData.finalScores) {
            let pointsMadeInSession: number;

            if (sessionFinalData.teamScoreMapping) {
                const playerTeamPos = playerTeamKey === 'teamA' ? sessionFinalData.teamScoreMapping.teamA : sessionFinalData.teamScoreMapping.teamB;
                pointsMadeInSession = sessionFinalData.finalScores[playerTeamPos];
            } else {
                pointsMadeInSession = playerTeamKey === 'teamA' ? sessionFinalData.finalScores.bottom : sessionFinalData.finalScores.top;
            }

            const currentHighestPointsSessionValue = typeof stats.highestPointsSession?.value === 'number' ? stats.highestPointsSession.value : -Infinity;
            if (pointsMadeInSession > currentHighestPointsSessionValue) { 
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
            if (pointsMadeInSession < currentLowestPointsSessionValue) { 
                stats.lowestPointsSession = { 
                    value: pointsMadeInSession, 
                    date: sessionTimestamp, 
                    relatedId: sessionFinalData.sessionId,
                    type: "lowest_points_session", // Bezeichnet die niedrigste erreichte Punktzahl in einer Session
                    label: `Niedrigste Punkte in Partie (${pointsMadeInSession})` 
                };
            }

            if (sessionFinalData.finalStriche) {
                let stricheMadeRecord: StricheRecord | undefined;
                let stricheReceivedRecord: StricheRecord | undefined;

                if (sessionFinalData.teamScoreMapping) {
                    const playerTeamPos = playerTeamKey === 'teamA' ? sessionFinalData.teamScoreMapping.teamA : sessionFinalData.teamScoreMapping.teamB;
                    const opponentTeamPos = playerTeamKey === 'teamA' ? sessionFinalData.teamScoreMapping.teamB : sessionFinalData.teamScoreMapping.teamA;
                    stricheMadeRecord = sessionFinalData.finalStriche[playerTeamPos];
                    stricheReceivedRecord = sessionFinalData.finalStriche[opponentTeamPos];
                } else {
                    stricheMadeRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.bottom : sessionFinalData.finalStriche.top;
                    stricheReceivedRecord = playerTeamKey === 'teamA' ? sessionFinalData.finalStriche.top : sessionFinalData.finalStriche.bottom;
                }
                
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

                // NEU: mostMatschSession - Höchste Anzahl Matsche in einer Partie
                const matschMadeInSession = stricheMadeRecord?.matsch || 0;
                const currentMostMatschSessionValue = typeof stats.mostMatschSession?.value === 'number' ? stats.mostMatschSession.value : 0;
                if (matschMadeInSession > currentMostMatschSessionValue) {
                    stats.mostMatschSession = {
                        value: matschMadeInSession,
                        date: sessionTimestamp,
                        relatedId: sessionFinalData.sessionId,
                        type: "most_matsch_session",
                        label: `Höchste Anzahl Matsche in Partie (${matschMadeInSession})`
                    };
                }
            }
        }

        // NEU: mostWeisPointsSession - Meiste Weispunkte in einer Partie
        // Berechne die Gesamtweispunkte des Spielers in dieser Session aus den completedGames
        let totalWeisPointsInSession = 0;
        completedGames.forEach(game => {
            if (!game.participantUids?.includes(userId)) return;
            
            // Bestimme das Team des Spielers in diesem Spiel (analog zur Game-Level-Logik)
            let gamePlayerTeamPosition: 'top' | 'bottom' | undefined;
            const gameMapping = game.teamScoreMapping || sessionFinalData.teamScoreMapping;
            
            if (gameMapping && playerTeamKey) {
                gamePlayerTeamPosition = playerTeamKey === 'teamA' ? gameMapping.teamA : gameMapping.teamB;
            } else {
                // Fallback
                if (playerTeamKey === 'teamA') {
                    gamePlayerTeamPosition = 'bottom';
                } else if (playerTeamKey === 'teamB') {
                    gamePlayerTeamPosition = 'top';
                }
            }
            
            if (game.weisPoints && gamePlayerTeamPosition) {
                totalWeisPointsInSession += game.weisPoints[gamePlayerTeamPosition] || 0;
            }
        });

        const currentMostWeisSessionValue = typeof stats.mostWeisPointsSession?.value === 'number' ? stats.mostWeisPointsSession.value : 0;
        if (totalWeisPointsInSession > currentMostWeisSessionValue) {
            stats.mostWeisPointsSession = {
                value: totalWeisPointsInSession,
                date: sessionTimestamp,
                relatedId: sessionFinalData.sessionId,
                type: "most_weis_points_session",
                label: `Meiste Weispunkte in Partie (${totalWeisPointsInSession})`
            };
        }

        // NEU: Session-Level Lowlights - mostMatschReceivedSession und mostWeisPointsReceivedSession
        let maxMatschReceivedInSession = 0;
        let maxWeisPointsReceivedInSession = 0;
        
        completedGames.forEach(game => {
            if (!game.participantUids?.includes(userId)) return;
            
            // Bestimme das Team des Gegners in diesem Spiel
            let gameOpponentTeamPosition: 'top' | 'bottom' | undefined;
            const gameMapping = game.teamScoreMapping || sessionFinalData.teamScoreMapping;
            
            if (gameMapping && playerTeamKey) {
                gameOpponentTeamPosition = playerTeamKey === 'teamA' ? gameMapping.teamB : gameMapping.teamA;
            } else {
                // Fallback
                if (playerTeamKey === 'teamA') {
                    gameOpponentTeamPosition = 'top';
                } else if (playerTeamKey === 'teamB') {
                    gameOpponentTeamPosition = 'bottom';
                }
            }
            
            // Matsch erhalten in diesem Spiel
            if (game.finalStriche && gameOpponentTeamPosition) {
                const matschReceivedThisGame = game.finalStriche[gameOpponentTeamPosition]?.matsch || 0;
                maxMatschReceivedInSession = Math.max(maxMatschReceivedInSession, matschReceivedThisGame);
            }
            
            // Weispunkte erhalten in diesem Spiel
            if (game.weisPoints && gameOpponentTeamPosition) {
                const weisPointsReceivedThisGame = game.weisPoints[gameOpponentTeamPosition] || 0;
                maxWeisPointsReceivedInSession = Math.max(maxWeisPointsReceivedInSession, weisPointsReceivedThisGame);
            }
        });

        // Update mostMatschReceivedSession falls neuer Höchstwert
        const currentMostMatschReceivedSessionValue = typeof stats.mostMatschReceivedSession?.value === 'number' ? stats.mostMatschReceivedSession.value : 0;
        if (maxMatschReceivedInSession > currentMostMatschReceivedSessionValue) {
            stats.mostMatschReceivedSession = {
                value: maxMatschReceivedInSession,
                date: sessionTimestamp,
                relatedId: sessionFinalData.sessionId,
                type: "most_matsch_received_session",
                label: `Meiste Matsch erhalten in Partie (${maxMatschReceivedInSession})`
            };
        }

        // Update mostWeisPointsReceivedSession falls neuer Höchstwert
        const currentMostWeisReceivedSessionValue = typeof stats.mostWeisPointsReceivedSession?.value === 'number' ? stats.mostWeisPointsReceivedSession.value : 0;
        if (maxWeisPointsReceivedInSession > currentMostWeisReceivedSessionValue) {
            stats.mostWeisPointsReceivedSession = {
                value: maxWeisPointsReceivedInSession,
                date: sessionTimestamp,
                relatedId: sessionFinalData.sessionId,
                type: "most_weis_points_received_session",
                label: `Meiste Weispunkte erhalten in Partie (${maxWeisPointsReceivedInSession})`
            };
        }

      // --- GAME-LEVEL STATS PROCESSING (NEU & KOMPLETT) ---
      // Initialisiere alle Game-Level Felder
      stats.totalGames = stats.totalGames || 0;
      stats.gameWins = stats.gameWins || 0;
      stats.gameLosses = stats.gameLosses || 0;
      stats.totalPointsMade = stats.totalPointsMade || 0;
      stats.totalPointsReceived = stats.totalPointsReceived || 0;
      stats.totalStricheMade = stats.totalStricheMade || 0;
      stats.totalStricheReceived = stats.totalStricheReceived || 0;
      stats.playerTotalWeisMade = stats.playerTotalWeisMade || 0;
      stats.totalMatschGamesMade = stats.totalMatschGamesMade || 0;
      stats.totalSchneiderGamesMade = stats.totalSchneiderGamesMade || 0;
      stats.totalKontermatschGamesMade = stats.totalKontermatschGamesMade || 0;
      stats.totalKontermatschGamesReceived = stats.totalKontermatschGamesReceived || 0;
      stats.currentGameWinStreak = stats.currentGameWinStreak || 0;
      stats.currentGameLossStreak = stats.currentGameLossStreak || 0;
      stats.currentGameWinlessStreak = stats.currentGameWinlessStreak || 0;
      stats.currentUndefeatedStreakGames = stats.currentUndefeatedStreakGames || 0;

      if (completedGames.length > 0) {
        let sessionPlayTimeMillis = 0;
        
        for (const game of completedGames) {
          if (!game.participantUids?.includes(userId)) continue;

          // 1. Grundlegende Spiel-Zählung
          stats.totalGames += 1;
          if (typeof game.durationMillis === 'number') {
            sessionPlayTimeMillis += game.durationMillis;
          }

          // 2. Team-Positionen bestimmen
          let gamePlayerTeamPos: 'top' | 'bottom' | null = null;
          let gameOpponentTeamPos: 'top' | 'bottom' | null = null;

          const gameMapping = game.teamScoreMapping || sessionFinalData.teamScoreMapping;
          if (gameMapping && playerTeamKey) {
            gamePlayerTeamPos = playerTeamKey === 'teamA' ? gameMapping.teamA : gameMapping.teamB;
            gameOpponentTeamPos = playerTeamKey === 'teamA' ? gameMapping.teamB : gameMapping.teamA;
          } else {
            // Fallback
            if (playerTeamKey === 'teamA') {
              gamePlayerTeamPos = 'bottom';
              gameOpponentTeamPos = 'top';
            } else if (playerTeamKey === 'teamB') {
              gamePlayerTeamPos = 'top';
              gameOpponentTeamPos = 'bottom';
            }
          }
          
          if (!gamePlayerTeamPos || !gameOpponentTeamPos || !game.finalScores || !game.finalStriche) {
             logger.warn(`[updatePlayerStatsAfterSession] Skipping game ${game.gameNumber} for player ${userId} due to missing data (teamPos, scores, striche).`);
             continue;
          }

          // 3. Punkte und Spielergebnis
          const pointsMade = game.finalScores[gamePlayerTeamPos] || 0;
          const pointsReceived = game.finalScores[gameOpponentTeamPos] || 0;
          
          let gameResult: 'win' | 'loss' | 'draw' = 'draw';
          if (pointsMade > pointsReceived) gameResult = 'win';
          else if (pointsMade < pointsReceived) gameResult = 'loss';

          stats.totalPointsMade += pointsMade;
          stats.totalPointsReceived += pointsReceived;

                     // 4. Weispunkte
           stats.playerTotalWeisMade += game.weisPoints?.[gamePlayerTeamPos] || 0;

           // 4.5. Trumpf-Statistiken aus Runden-History (FINALE KORREKTUR V2)
           if (game.roundHistory && Array.isArray(game.roundHistory)) {
             if (!stats.trumpfStatistik) stats.trumpfStatistik = {};
             
             game.roundHistory.forEach(round => {
               if (round.farbe && typeof round.farbe === 'string' && round.currentPlayer) {
                 const trumpfWaehlerUid = game.participantUids?.[round.currentPlayer - 1];
                 if (!trumpfWaehlerUid) return;

                 // Bestimme das Team des RUNDEN-spezifischen Trumpf-Wählers
                 const trumpfWaehlerTeamPosition = (round.currentPlayer === 1 || round.currentPlayer === 3) ? 'bottom' : 'top';
                 
                 // Zähle nur, wenn der aktuelle Spieler (für den die Stats berechnet werden)
                 // im selben Team ist wie der RUNDEN-spezifische Trumpf-Wähler.
                 if (gamePlayerTeamPos === trumpfWaehlerTeamPosition) {
                   const farbeKey = round.farbe.toLowerCase();
                   stats.totalTrumpfCount = (stats.totalTrumpfCount || 0) + 1;
                   stats.trumpfStatistik[farbeKey] = (stats.trumpfStatistik[farbeKey] || 0) + 1;
                 }
               }
             });
           }

          // 5. Striche-Verarbeitung
          const stricheMadeRecord = game.finalStriche[gamePlayerTeamPos];
          const stricheReceivedRecord = game.finalStriche[gameOpponentTeamPos];
          const calcStriche = (r: StricheRecord) => (r.berg||0) + (r.sieg||0) + (r.matsch||0) + (r.schneider||0) + (r.kontermatsch||0);
          const stricheMade = calcStriche(stricheMadeRecord);
          const stricheReceived = calcStriche(stricheReceivedRecord);
          
          stats.totalStricheMade += stricheMade;
          stats.totalStricheReceived += stricheReceived;
          
          if (stricheMadeRecord.matsch > 0) stats.totalMatschGamesMade += stricheMadeRecord.matsch;
          if (stricheMadeRecord.schneider > 0) stats.totalSchneiderGamesMade += stricheMadeRecord.schneider;
          if (stricheMadeRecord.kontermatsch > 0) stats.totalKontermatschGamesMade += stricheMadeRecord.kontermatsch;
          if (stricheReceivedRecord.kontermatsch > 0) stats.totalKontermatschGamesReceived += stricheReceivedRecord.kontermatsch;

          // 6. Spiel-Siege/-Niederlagen und Serien
          if (gameResult === 'win') {
            stats.gameWins += 1;
            stats.currentGameWinStreak += 1;
            stats.currentGameLossStreak = 0;
            stats.currentGameWinlessStreak = 0;
            stats.currentUndefeatedStreakGames += 1;
          } else if (gameResult === 'loss') {
            stats.gameLosses += 1;
            stats.currentGameLossStreak += 1;
            stats.currentGameWinStreak = 0;
            stats.currentGameWinlessStreak += 1;
            stats.currentUndefeatedStreakGames = 0;
          } else { // draw
            stats.currentGameWinStreak = 0;
            stats.currentGameLossStreak = 0;
            stats.currentGameWinlessStreak += 1;
            stats.currentUndefeatedStreakGames += 1;
          }

                     // 7. Längste Serien prüfen
           const gameTimestamp = game.timestampCompleted || sessionTimestamp;
           if (!stats.longestWinStreakGames || stats.currentGameWinStreak > stats.longestWinStreakGames.value) {
               stats.longestWinStreakGames = { 
                 value: stats.currentGameWinStreak, 
                 startDate: gameTimestamp, 
                 endDate: gameTimestamp
               };
           }
           if (!stats.longestLossStreakGames || stats.currentGameLossStreak > stats.longestLossStreakGames.value) {
               stats.longestLossStreakGames = { 
                 value: stats.currentGameLossStreak, 
                 startDate: gameTimestamp, 
                 endDate: gameTimestamp
               };
           }
           if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
               stats.longestWinlessStreakGames = { 
                 value: stats.currentGameWinlessStreak, 
                 startDate: gameTimestamp, 
                 endDate: gameTimestamp
               };
           }
           if (!stats.longestUndefeatedStreakGames || stats.currentUndefeatedStreakGames > stats.longestUndefeatedStreakGames.value) {
               stats.longestUndefeatedStreakGames = { 
                 value: stats.currentUndefeatedStreakGames, 
                 startDate: gameTimestamp, 
                 endDate: gameTimestamp
               };
           }

          // 8. Game-Level Highlights
          const gameIdForHighlight = game.activeGameId || `game_${game.gameNumber}`;
          const weisMade = game.weisPoints?.[gamePlayerTeamPos] || 0;

                     if (!stats.highestPointsGame || pointsMade > (typeof stats.highestPointsGame.value === 'number' ? stats.highestPointsGame.value : 0)) {
               stats.highestPointsGame = { 
                 value: pointsMade, 
                 date: gameTimestamp, 
                 relatedId: gameIdForHighlight, 
                 type: "highest_points_game", 
                 label: `Höchste Punkte in Einzelspiel (${pointsMade})` 
               };
           }
           if (!stats.lowestPointsGame || pointsMade < (typeof stats.lowestPointsGame.value === 'number' ? stats.lowestPointsGame.value : Infinity)) {
               stats.lowestPointsGame = { 
                 value: pointsMade, 
                 date: gameTimestamp, 
                 relatedId: gameIdForHighlight, 
                 type: "lowest_points_game", 
                 label: `Niedrigste Punkte in Einzelspiel (${pointsMade})` 
               };
           }
           if (!stats.highestStricheGame || stricheMade > (typeof stats.highestStricheGame.value === 'number' ? stats.highestStricheGame.value : 0)) {
               stats.highestStricheGame = { 
                 value: stricheMade, 
                 date: gameTimestamp, 
                 relatedId: gameIdForHighlight, 
                 type: "highest_striche_game", 
                 label: `Höchste Striche in Einzelspiel (${stricheMade})` 
               };
           }
           if (!stats.mostWeisPointsGame || weisMade > (typeof stats.mostWeisPointsGame.value === 'number' ? stats.mostWeisPointsGame.value : 0)) {
               stats.mostWeisPointsGame = { 
                 value: weisMade, 
                 date: gameTimestamp, 
                 relatedId: gameIdForHighlight, 
                 type: "most_weis_points_game", 
                 label: `Meiste Weispunkte in Einzelspiel (${weisMade})` 
               };
           }
           
           // Weitere Game-Level Highlights für Matsch etc.
           if (stricheMadeRecord.matsch > 0 && (!stats.mostMatschGame || stricheMadeRecord.matsch > (typeof stats.mostMatschGame.value === 'number' ? stats.mostMatschGame.value : 0))) {
               stats.mostMatschGame = {
                 value: stricheMadeRecord.matsch,
                 date: gameTimestamp,
                 relatedId: gameIdForHighlight,
                 type: "most_matsch_game",
                 label: `Meiste Matsch in Einzelspiel (${stricheMadeRecord.matsch})`
               };
           }
           if (stricheReceivedRecord.matsch > 0 && (!stats.mostMatschReceivedGame || stricheReceivedRecord.matsch > (typeof stats.mostMatschReceivedGame.value === 'number' ? stats.mostMatschReceivedGame.value : 0))) {
               stats.mostMatschReceivedGame = {
                 value: stricheReceivedRecord.matsch,
                 date: gameTimestamp,
                 relatedId: gameIdForHighlight,
                 type: "most_matsch_received_game",
                 label: `Meiste Matsch erhalten in Einzelspiel (${stricheReceivedRecord.matsch})`
               };
           }
        }
        
        // 9. Spielzeit und berechnete Felder nach allen Spielen
        stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + Math.round(sessionPlayTimeMillis / 1000);

        // Berechnete Differenzen und Durchschnitte
        stats.totalPointsDifference = (stats.totalPointsMade || 0) - (stats.totalPointsReceived || 0);
        stats.totalStricheDifference = (stats.totalStricheMade || 0) - (stats.totalStricheReceived || 0);
        
        if (stats.totalGames > 0) {
          stats.avgPointsPerGame = (stats.totalPointsMade || 0) / stats.totalGames;
          stats.avgStrichePerGame = (stats.totalStricheMade || 0) / stats.totalGames;
          stats.avgWeisPointsPerGame = (stats.playerTotalWeisMade || 0) / stats.totalGames;
          stats.avgMatschPerGame = (stats.totalMatschGamesMade || 0) / stats.totalGames;
          stats.avgSchneiderPerGame = (stats.totalSchneiderGamesMade || 0) / stats.totalGames;
          stats.avgKontermatschPerGame = (stats.totalKontermatschGamesMade || 0) / stats.totalGames;
        }
      }

      // --- Start: Partner- und Gegner-Statistiken aktualisieren ---
      if (sessionFinalData.teams && playerTeamKey) {
        const currentPlayerId = userId;
        const playerTeamDetails = sessionFinalData.teams[playerTeamKey];
        const opponentTeamKey = playerTeamKey === 'teamA' ? 'teamB' : 'teamA';
        const opponentTeamDetails = sessionFinalData.teams[opponentTeamKey];

        // NEU: Fallback für teamScoreMapping, falls nicht vom Client bereitgestellt
        // oder falls es aus irgendeinem Grund nicht die erwartete Struktur hat.
        let effectiveTeamScoreMapping = sessionFinalData.teamScoreMapping;
        if (!effectiveTeamScoreMapping || typeof effectiveTeamScoreMapping.teamA === 'undefined' || typeof effectiveTeamScoreMapping.teamB === 'undefined') {
          logger.warn(`[updatePlayerStatsAfterSession] sessionFinalData.teamScoreMapping for session ${sessionFinalData.sessionId} is missing or incomplete. Player ${userId}. Original: ${JSON.stringify(sessionFinalData.teamScoreMapping)}. Applying default: teamA=bottom, teamB=top for partner/opponent game stats reconstruction.`);
          effectiveTeamScoreMapping = { teamA: 'bottom', teamB: 'top' };
        }

        // Partner-Aggregation
        playerTeamDetails.players.forEach(p => {
          if (p.playerId !== currentPlayerId) { // p is the partner
            let partnerAggregate = stats.partnerAggregates?.find(pa => pa.partnerId === p.playerId);
            if (!partnerAggregate) {
              partnerAggregate = { partnerId: p.playerId, partnerDisplayName: p.displayName, sessionsPlayedWith: 0, sessionsWonWith: 0, gamesPlayedWith: 0, gamesWonWith: 0, totalStricheDifferenceWith: 0, totalPointsWith: 0, totalPointsDifferenceWith: 0, matschGamesWonWith: 0, schneiderGamesWonWith: 0, lastPlayedWithTimestamp: sessionTimestamp };
              stats.partnerAggregates?.push(partnerAggregate);
            }
            partnerAggregate.sessionsPlayedWith += 1;
            if (sessionOutcome === 'win') partnerAggregate.sessionsWonWith += 1;
            partnerAggregate.lastPlayedWithTimestamp = sessionTimestamp;
    
            completedGames.forEach(game => {
              if (!game.participantUids?.includes(currentPlayerId) || !game.participantUids?.includes(p.playerId)) return;
    
              // Erneute Rekonstruktion pro Partner-Iteration (redundant, aber zur Verdeutlichung des Konzepts hier belassen und später optimieren)
              const gameSpecificUidsInTop: string[] = [];
              const gameSpecificUidsInBottom: string[] = [];
              // Verwende effectiveTeamScoreMapping
              sessionFinalData.teams?.teamA?.players.forEach(player => {
                if (game.participantUids?.includes(player.playerId)) {
                  if (effectiveTeamScoreMapping.teamA === 'top') { // HIER effectiveTeamScoreMapping verwenden
                    gameSpecificUidsInTop.push(player.playerId);
                  } else {
                    gameSpecificUidsInBottom.push(player.playerId);
                  }
                }
              });
              sessionFinalData.teams?.teamB?.players.forEach(player => {
                if (game.participantUids?.includes(player.playerId)) {
                  if (effectiveTeamScoreMapping.teamB === 'top') { // HIER effectiveTeamScoreMapping verwenden
                    gameSpecificUidsInTop.push(player.playerId);
                  } else {
                    gameSpecificUidsInBottom.push(player.playerId);
                  }
                }
              });

              let inSameTeamInGame = false;
              let partnerGameTeamPos: 'top' | 'bottom' | undefined;

              if (gameSpecificUidsInTop.includes(currentPlayerId) && gameSpecificUidsInTop.includes(p.playerId)) {
                inSameTeamInGame = true;
                partnerGameTeamPos = 'top';
                logger.info(`[Player ${userId}, Partner ${p.playerId}, Game ${game.gameNumber}] Method R (Rekonstruiert): Both in reconstructed TOP team.`);
              } else if (gameSpecificUidsInBottom.includes(currentPlayerId) && gameSpecificUidsInBottom.includes(p.playerId)) {
                inSameTeamInGame = true;
                partnerGameTeamPos = 'bottom';
                logger.info(`[Player ${userId}, Partner ${p.playerId}, Game ${game.gameNumber}] Method R (Rekonstruiert): Both in reconstructed BOTTOM team.`);
              }
    
              if (inSameTeamInGame && partnerGameTeamPos && game.finalScores) {
                logger.info(`[Player ${userId}, Partner ${p.playerId}, Game ${game.gameNumber}] SUCCESS: In same team '${partnerGameTeamPos}'. Aggregating game stats for partner.`);
                partnerAggregate.gamesPlayedWith += 1;
                const opponentGameTeamPosForPartner = partnerGameTeamPos === 'top' ? 'bottom' : 'top';
                const pointsMadeWithPartner = game.finalScores[partnerGameTeamPos] || 0;
                const pointsReceivedWithPartner = game.finalScores[opponentGameTeamPosForPartner] || 0;
                if (pointsMadeWithPartner > pointsReceivedWithPartner) partnerAggregate.gamesWonWith += 1;
                
                const stricheTeam = game.finalStriche?.[partnerGameTeamPos];
                const stricheOpponent = game.finalStriche?.[opponentGameTeamPosForPartner];
                const calcStriche = (s: StricheRecord | undefined) => (s?.berg || 0) + (s?.sieg || 0) + (s?.matsch || 0) + (s?.schneider || 0) + (s?.kontermatsch || 0);
                partnerAggregate.totalStricheDifferenceWith += (calcStriche(stricheTeam) - calcStriche(stricheOpponent));
                partnerAggregate.totalPointsWith += pointsMadeWithPartner;
                partnerAggregate.totalPointsDifferenceWith += (pointsMadeWithPartner - pointsReceivedWithPartner);
                if (stricheTeam?.matsch && stricheTeam.matsch > 0) partnerAggregate.matschGamesWonWith += (stricheTeam.matsch);
                if (stricheTeam?.schneider && stricheTeam.schneider > 0) partnerAggregate.schneiderGamesWonWith += (stricheTeam.schneider);
              } else if (game.finalScores) { 
                 logger.warn(`[Player ${userId}, Partner ${p.playerId}, Game ${game.gameNumber}] SKIPPED or FAILED to find in same reconstructed game team. TopUIDs: ${JSON.stringify(gameSpecificUidsInTop)}, BottomUIDs: ${JSON.stringify(gameSpecificUidsInBottom)}`);
              }
            });
          }
        });
    
        // Gegner-Aggregation
        opponentTeamDetails.players.forEach(opponent => {
          let opponentAggregate = stats.opponentAggregates?.find(oa => oa.opponentId === opponent.playerId);
          if (!opponentAggregate) {
            opponentAggregate = { opponentId: opponent.playerId, opponentDisplayName: opponent.displayName, sessionsPlayedAgainst: 0, sessionsWonAgainst: 0, gamesPlayedAgainst: 0, gamesWonAgainst: 0, totalStricheDifferenceAgainst: 0, totalPointsScoredWhenOpponent: 0, totalPointsDifferenceAgainst: 0, matschGamesWonAgainstOpponentTeam: 0, schneiderGamesWonAgainstOpponentTeam: 0, lastPlayedAgainstTimestamp: sessionTimestamp };
            stats.opponentAggregates?.push(opponentAggregate);
          }
          opponentAggregate.sessionsPlayedAgainst += 1;
          if (sessionOutcome === 'win') opponentAggregate.sessionsWonAgainst += 1; 
          opponentAggregate.lastPlayedAgainstTimestamp = sessionTimestamp;
    
          completedGames.forEach(game => {
            if (!game.participantUids?.includes(currentPlayerId) || !game.participantUids?.includes(opponent.playerId)) return;
            
            const gameSpecificUidsInTop: string[] = [];
            const gameSpecificUidsInBottom: string[] = [];
            // Verwende effectiveTeamScoreMapping
            sessionFinalData.teams?.teamA?.players.forEach(player => {
              if (game.participantUids?.includes(player.playerId)) {
                if (effectiveTeamScoreMapping.teamA === 'top') { // HIER effectiveTeamScoreMapping verwenden
                  gameSpecificUidsInTop.push(player.playerId);
                } else {
                  gameSpecificUidsInBottom.push(player.playerId);
                }
              }
            });
            sessionFinalData.teams?.teamB?.players.forEach(player => {
              if (game.participantUids?.includes(player.playerId)) {
                if (effectiveTeamScoreMapping.teamB === 'top') { // HIER effectiveTeamScoreMapping verwenden
                  gameSpecificUidsInTop.push(player.playerId);
                } else {
                  gameSpecificUidsInBottom.push(player.playerId);
                }
              }
            });
    
            let playerPosInThisGame: 'top' | 'bottom' | undefined;
            let opponentPosInThisGame: 'top' | 'bottom' | undefined;
    
            if (gameSpecificUidsInTop.includes(currentPlayerId)) playerPosInThisGame = 'top';
            else if (gameSpecificUidsInBottom.includes(currentPlayerId)) playerPosInThisGame = 'bottom';
    
            if (gameSpecificUidsInTop.includes(opponent.playerId)) opponentPosInThisGame = 'top';
            else if (gameSpecificUidsInBottom.includes(opponent.playerId)) opponentPosInThisGame = 'bottom';
    
            if (playerPosInThisGame && opponentPosInThisGame && playerPosInThisGame !== opponentPosInThisGame && game.finalScores) {
              logger.info(`[Player ${userId}, Opponent ${opponent.playerId}, Game ${game.gameNumber}] SUCCESS (Rekonstruiert): Player in '${playerPosInThisGame}', Opponent in '${opponentPosInThisGame}'. Aggregating game stats for opponent.`);
              opponentAggregate.gamesPlayedAgainst += 1;
              const pointsPlayerTeam = game.finalScores[playerPosInThisGame] || 0;
              const pointsOpponentTeamAgainst = game.finalScores[opponentPosInThisGame] || 0;
              if (pointsPlayerTeam > pointsOpponentTeamAgainst) opponentAggregate.gamesWonAgainst += 1;
              
              const strichePlayerTeam = game.finalStriche?.[playerPosInThisGame];
              const stricheOpponentActualTeam = game.finalStriche?.[opponentPosInThisGame];
              const calcStriche = (s: StricheRecord | undefined) => (s?.berg || 0) + (s?.sieg || 0) + (s?.matsch || 0) + (s?.schneider || 0) + (s?.kontermatsch || 0);
              opponentAggregate.totalStricheDifferenceAgainst += (calcStriche(strichePlayerTeam) - calcStriche(stricheOpponentActualTeam));
              opponentAggregate.totalPointsScoredWhenOpponent += pointsPlayerTeam;
              opponentAggregate.totalPointsDifferenceAgainst += (pointsPlayerTeam - pointsOpponentTeamAgainst);
              if (strichePlayerTeam?.matsch && strichePlayerTeam.matsch > 0) opponentAggregate.matschGamesWonAgainstOpponentTeam += (strichePlayerTeam.matsch);
              if (strichePlayerTeam?.schneider && strichePlayerTeam.schneider > 0) opponentAggregate.schneiderGamesWonAgainstOpponentTeam += (strichePlayerTeam.schneider);
            } else if (game.finalScores) {
              logger.warn(`[Player ${userId}, Opponent ${opponent.playerId}, Game ${game.gameNumber}] SKIPPED or FAILED (Rekonstruiert) to find as opponents. PlayerPos: ${playerPosInThisGame}, OpponentPos: ${opponentPosInThisGame}. TopUIDs: ${JSON.stringify(gameSpecificUidsInTop)}, BottomUIDs: ${JSON.stringify(gameSpecificUidsInBottom)}`);
            }
          });
        });
      }
      // --- Ende: Partner- und Gegner-Statistiken aktualisieren ---

      logger.info(`[updatePlayerStatsAfterSession] Player ${userId}: Stats object prepared before push:`, JSON.stringify(stats)); 
      statsToUpdate.push({ ref: playerStatsRef, data: stats });
    } catch (error) {
      logger.error(`[updatePlayerStatsAfterSession] Player ${userId}: FAILED to read or prepare stats update for transaction:`, error);
      throw error;
    }
  }

  // Phase 2: Alle Schreiboperationen
  for (const update of statsToUpdate) {
    try {
      transaction.set(update.ref, update.data, { merge: true });
      // Das spezifische Logging pro Spieler kann hierhin verschoben werden oder man loggt am Ende aggregiert.
      // logger.info(`[updatePlayerStatsAfterSession] Player ${update.ref.id}: session stats set in transaction.`);
    } catch (error) {
      logger.error(`[updatePlayerStatsAfterSession] Player ${update.ref.id}: FAILED to set stats in transaction:`, error);
      throw error; // Fehler weiterwerfen
    }
  }
  logger.info(`[updatePlayerStatsAfterSession] All player stats prepared for transaction (${statsToUpdate.length} players).`);
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

        // KORRIGIERTE STRICHE-BERECHNUNG: Aus roundHistory statt finalStriche
        if (game.roundHistory && Array.isArray(game.roundHistory)) {
          game.roundHistory.forEach(round => { // Typ-Annotation entfernt, wird jetzt inferiert
            // Nur Jass-Runden mit strichInfo berücksichtigen
            if (round.actionType === 'jass' && round.strichInfo && round.strichInfo.team && round.strichInfo.type) {
              const { team, type } = round.strichInfo;
              
              // Sicherstellen, dass team 'top' oder 'bottom' ist
              if (team === 'top' || team === 'bottom') {
                switch (type) {
                  case 'matsch':
                    totalStricheTopRecord.matsch += team === 'top' ? 1 : 0;
                    totalStricheBottomRecord.matsch += team === 'bottom' ? 1 : 0;
                    break;
                  case 'kontermatsch':
                    // Kontermatsch hat einen konfigurierbaren Wert (normalerweise 3)
                    totalStricheTopRecord.kontermatsch += team === 'top' ? 3 : 0;
                    totalStricheBottomRecord.kontermatsch += team === 'bottom' ? 3 : 0;
                    break;
                  case 'sieg':
                    totalStricheTopRecord.sieg += team === 'top' ? 1 : 0;
                    totalStricheBottomRecord.sieg += team === 'bottom' ? 1 : 0;
                    break;
                  case 'schneider':
                    totalStricheTopRecord.schneider += team === 'top' ? 1 : 0;
                    totalStricheBottomRecord.schneider += team === 'bottom' ? 1 : 0;
                    break;
                  case 'berg':
                    totalStricheTopRecord.berg += team === 'top' ? 1 : 0;
                    totalStricheBottomRecord.berg += team === 'bottom' ? 1 : 0;
                    break;
                }
              }
            }
          });
        }
      });
      
      const sessionDurationSeconds = now.seconds - startedAtTimestamp.seconds;

      // Gewinner bestimmen (basierend auf Punkten, anpassen falls Striche-Modus komplexer wird)
      let determinedWinnerTeamKey: 'teamA' | 'teamB' | 'draw' | undefined = initialDataFromClient.winnerTeamKey;
      if (!determinedWinnerTeamKey) {
        const teamScoreMapping = initialDataFromClient.teamScoreMapping;
        let pointsTeamA = 0;
        let pointsTeamB = 0;

      if (teamScoreMapping) {
          pointsTeamA = teamScoreMapping.teamA === 'bottom' ? totalPointsTeamBottom : totalPointsTeamTop;
          pointsTeamB = teamScoreMapping.teamB === 'bottom' ? totalPointsTeamBottom : totalPointsTeamTop;
      } else {
          // Fallback-Annahme: teamA ist bottom, teamB ist top
          pointsTeamA = totalPointsTeamBottom;
          pointsTeamB = totalPointsTeamTop;
          logger.info(`[finalizeSession] No teamScoreMapping for session ${sessionId}. Assuming teamA=bottom, teamB=top for winner determination.`);
        }
        if (pointsTeamA > pointsTeamB) determinedWinnerTeamKey = 'teamA';
        else if (pointsTeamB > pointsTeamA) determinedWinnerTeamKey = 'teamB';
        else determinedWinnerTeamKey = 'draw';
        logger.info(`[finalizeSession] Session ${sessionId}: winnerTeamKey self-determined as '${determinedWinnerTeamKey}' based on scores.`);
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
        // teamScoreMapping auch speichern, falls vorhanden und für spätere Analyse wichtig
        teamScoreMapping: initialDataFromClient.teamScoreMapping || null, 
      };
      
      // Die playerComputedStats Aktualisierung muss hier oder getriggert erfolgen.
      // Für jetzt fokussieren wir uns auf das korrekte Schreiben des Session-Summary-Dokuments.
      if (initialDataFromClient.participantUids.length > 0 && initialDataFromClient.teams) {
          await updatePlayerStatsAfterSession(
            db,
            transaction,
            initialDataFromClient.participantUids,
            {
              finalScores: finalUpdateData.finalScores,
              finalStriche: finalUpdateData.finalStriche,
              teams: initialDataFromClient.teams,
              sessionId: sessionId,
              winnerTeamKey: determinedWinnerTeamKey,
              teamScoreMapping: initialDataFromClient.teamScoreMapping,
              playerNames: initialDataFromClient.playerNames,
            },
            now
          );
      }


      transaction.set(summaryDocRef, finalUpdateData, { merge: true });
      logger.info(`--- Transaction END for ${sessionId} (document set/merged) ---`);
    });

    // NEU: Aktualisiere die Gruppenstatistiken nach der erfolgreichen Finalisierung der Session
    const groupId = initialDataFromClient.gruppeId;
    if (groupId) {
      // TODO: Die Neuberechnung der Gruppenstatistiken nach jeder Session ist ineffizient.
      // Die neue Funktion `updateTrumpfStatsOnGameEnd` übernimmt bereits die atomare Aktualisierung der Trumpf-Statistiken.
      // Der Aufruf wird vorübergehend deaktiviert, um Datenüberschreibungen zu verhindern.
      // logger.info(`[finalizeSession] Starting group stats update for groupId: ${groupId}`);
      await updateGroupComputedStatsAfterSession(groupId);
      // logger.info(`[finalizeSession] Group stats successfully updated for groupId: ${groupId}`);
    } else {
      logger.info(`[finalizeSession] No groupId provided, skipping group stats update for session ${sessionId}.`);
    }

    // NEU: Aufräumen der activeGame-Dokumente (Funktionalität von archiveGame.ts)
    logger.info(`[finalizeSession] Starting cleanup of activeGame documents for session ${sessionId}.`);
    const activeGameIdsToDelete = completedGames
      .map(game => game.activeGameId)
      .filter((id): id is string => !!id); // Type guard, um sicherzustellen, dass nur strings im Array sind

    if (activeGameIdsToDelete.length > 0) {
      const batch = db.batch();
      activeGameIdsToDelete.forEach(id => {
        const activeGameRef = db.collection('activeGames').doc(id);
        batch.delete(activeGameRef);
        logger.info(`[finalizeSession] Queued deletion for active game ${id}.`);
      });
      await batch.commit();
      logger.info(`[finalizeSession] Cleanup of ${activeGameIdsToDelete.length} activeGame documents completed for session ${sessionId}.`);
    } else {
      logger.info(`[finalizeSession] No activeGame documents to clean up for session ${sessionId}.`);
    }

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