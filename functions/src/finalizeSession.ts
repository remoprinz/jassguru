import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { PlayerComputedStats, initialPlayerComputedStats } from "./models/player-stats.model";

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
  teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
  completedAt?: admin.firestore.Timestamp;
  activeGameId?: string;
  durationMillis?: number;
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
    // NEU: Übergeben der Score-Zuordnung
    teamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
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
          }
      }

      // NEU: Game-Level-Processing für diesen Spieler
      let gamesWonThisSession = 0;
      let gamesLostThisSession = 0;
      // let totalPointsMadeInGames = 0; // Nicht mehr global für die Funktion benötigt, da direkt in stats geschrieben
      // let totalPointsReceivedInGames = 0;
      // let totalStricheMadeInGames = 0;
      // let totalStricheReceivedInGames = 0;

      // Stelle sicher, dass die Felder initialisiert sind, falls sie fehlen
      stats.totalGames = stats.totalGames || 0;
      stats.gameWins = stats.gameWins || 0;
      stats.gameLosses = stats.gameLosses || 0;
      stats.totalPointsMade = stats.totalPointsMade || 0;
      stats.totalPointsReceived = stats.totalPointsReceived || 0;
      stats.totalStricheMade = stats.totalStricheMade || 0;
      stats.totalStricheReceived = stats.totalStricheReceived || 0;
      stats.totalMatschGamesMade = stats.totalMatschGamesMade || 0;
      stats.totalSchneiderGamesMade = stats.totalSchneiderGamesMade || 0;
      stats.totalKontermatschGamesMade = stats.totalKontermatschGamesMade || 0;
      stats.totalKontermatschGamesReceived = stats.totalKontermatschGamesReceived || 0;
      stats.currentGameWinStreak = stats.currentGameWinStreak || 0;
      stats.currentGameLossStreak = stats.currentGameLossStreak || 0;
      stats.currentGameWinlessStreak = stats.currentGameWinlessStreak || 0;

      for (const game of completedGames) {
        if (!game.participantUids?.includes(userId)) {
          continue; // Spieler war nicht in diesem Spiel
        }

        stats.totalGames++; // Kumulatives Zählen aller Spiele

        // Bestimme Team des Spielers in diesem Spiel
        let gamePlayerTeamPosition: 'top' | 'bottom' | undefined;
        let gameOpponentTeamPosition: 'top' | 'bottom' | undefined;

        // Verwende teamScoreMapping aus dem Spiel, falls vorhanden, sonst aus Session
        const gameMapping = game.teamScoreMapping || sessionFinalData.teamScoreMapping;
        
        if (gameMapping && playerTeamKey) {
          gamePlayerTeamPosition = playerTeamKey === 'teamA' ? gameMapping.teamA : gameMapping.teamB;
          gameOpponentTeamPosition = playerTeamKey === 'teamA' ? gameMapping.teamB : gameMapping.teamA;
        } else {
          // Fallback basierend auf teams-Struktur oder Default-Annahme
          if (playerTeamKey === 'teamA') {
            gamePlayerTeamPosition = 'bottom';
            gameOpponentTeamPosition = 'top';
          } else if (playerTeamKey === 'teamB') {
            gamePlayerTeamPosition = 'top';
            gameOpponentTeamPosition = 'bottom';
          }
        }

        if (gamePlayerTeamPosition && gameOpponentTeamPosition && game.finalScores) {
          const pointsMadeThisGame = game.finalScores[gamePlayerTeamPosition] || 0;
          const pointsReceivedThisGame = game.finalScores[gameOpponentTeamPosition] || 0;

          stats.totalPointsMade += pointsMadeThisGame;
          stats.totalPointsReceived += pointsReceivedThisGame;
          // totalPointsDifference wird am Ende einmal für alles berechnet

          // Game Win/Loss bestimmen und kumulieren
          let gameOutcomeForStreak: 'win' | 'loss' | 'tie' = 'tie';
          if (pointsMadeThisGame > pointsReceivedThisGame) {
            stats.gameWins++;
            gamesWonThisSession++; // Für Session-interne Zählung (ggf. nicht mehr nötig)
            gameOutcomeForStreak = 'win';
          } else if (pointsMadeThisGame < pointsReceivedThisGame) {
            stats.gameLosses++;
            gamesLostThisSession++; // Für Session-interne Zählung
            gameOutcomeForStreak = 'loss';
          }
          
          // Game-Streaks (sessionübergreifend)
          if (gameOutcomeForStreak === 'win') {
            stats.currentGameWinStreak = (stats.currentGameWinStreak || 0) + 1;
            stats.currentGameLossStreak = 0;
            stats.currentGameWinlessStreak = 0;
            if (!stats.longestWinStreakGames || stats.currentGameWinStreak > stats.longestWinStreakGames.value) {
              stats.longestWinStreakGames = {
                value: stats.currentGameWinStreak,
                startDate: stats.currentGameWinStreak === 1 ? (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp) : stats.longestWinStreakGames?.startDate || (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp),
                endDate: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp
              };
            }
          } else if (gameOutcomeForStreak === 'loss') {
            stats.currentGameLossStreak = (stats.currentGameLossStreak || 0) + 1;
            stats.currentGameWinStreak = 0;
            stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
            if (!stats.longestLossStreakGames || stats.currentGameLossStreak > stats.longestLossStreakGames.value) {
              stats.longestLossStreakGames = {
                value: stats.currentGameLossStreak,
                startDate: stats.currentGameLossStreak === 1 ? (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp) : stats.longestLossStreakGames?.startDate || (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp),
                endDate: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp
              };
            }
            // Update longestWinlessStreakGames auch bei einer Niederlage
            if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
              stats.longestWinlessStreakGames = {
                value: stats.currentGameWinlessStreak,
                startDate: stats.currentGameWinlessStreak === 1 ? (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp) : stats.longestWinlessStreakGames?.startDate || (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp),
                endDate: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp
              };
            }
          } else { // 'tie' (Unentschieden im Spiel)
            stats.currentGameWinStreak = 0;
            stats.currentGameLossStreak = 0;
            stats.currentGameWinlessStreak = (stats.currentGameWinlessStreak || 0) + 1;
             if (!stats.longestWinlessStreakGames || stats.currentGameWinlessStreak > stats.longestWinlessStreakGames.value) {
              stats.longestWinlessStreakGames = {
                value: stats.currentGameWinlessStreak,
                startDate: stats.currentGameWinlessStreak === 1 ? (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp) : stats.longestWinlessStreakGames?.startDate || (game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp),
                endDate: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp
              };
            }
          }

          // Game-Level Highlights prüfen (kumulativ)
          const currentHighestPointsGameValue = typeof stats.highestPointsGame?.value === 'number' ? stats.highestPointsGame.value : -Infinity;
          if (pointsMadeThisGame > currentHighestPointsGameValue) {
            stats.highestPointsGame = {
              value: pointsMadeThisGame,
              date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, 
              relatedId: game.activeGameId || sessionFinalData.sessionId,
              type: "highest_points_game",
              label: `Höchste Punkte in Einzelspiel (${pointsMadeThisGame})`
            };
          }
          const currentLowestPointsGameValue = typeof stats.lowestPointsGame?.value === 'number' ? stats.lowestPointsGame.value : Infinity;
          if (pointsMadeThisGame < currentLowestPointsGameValue) {
            stats.lowestPointsGame = {
              value: pointsMadeThisGame,
              date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, 
              relatedId: game.activeGameId || sessionFinalData.sessionId, 
              type: "lowest_points_game",
              label: `Niedrigste Punkte in Einzelspiel (${pointsMadeThisGame})` 
            };
          }

          // Striche-Processing für Games
          if (game.finalStriche) {
            const calculateTotalStricheValue = (striche: StricheRecord | undefined): number => 
                striche ? (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0) : 0;

            const stricheMadeThisGame = calculateTotalStricheValue(game.finalStriche[gamePlayerTeamPosition]);
            const stricheReceivedThisGame = calculateTotalStricheValue(game.finalStriche[gameOpponentTeamPosition]);

            stats.totalStricheMade += stricheMadeThisGame;
            stats.totalStricheReceived += stricheReceivedThisGame;

            const currentHighestStricheGameValue = typeof stats.highestStricheGame?.value === 'number' ? stats.highestStricheGame.value : -Infinity;
            if (stricheMadeThisGame > currentHighestStricheGameValue) {
              stats.highestStricheGame = {
                value: stricheMadeThisGame,
                date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp,
                relatedId: game.activeGameId || sessionFinalData.sessionId,
                type: "highest_striche_game",
                label: `Höchste Striche in Einzelspiel (${stricheMadeThisGame})`
              };
            }
            // NEU: lowestStricheGame
            const currentLowestStricheGameValue = typeof stats.lowestStricheGame?.value === 'number' ? stats.lowestStricheGame.value : Infinity;
            if (stricheMadeThisGame < currentLowestStricheGameValue) {
              stats.lowestStricheGame = {
                value: stricheMadeThisGame,
                date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp,
                relatedId: game.activeGameId || sessionFinalData.sessionId,
                type: "lowest_striche_game",
                label: `Wenigste Striche in Einzelspiel (${stricheMadeThisGame})`
              };
            }

            const currentHighestStricheReceivedGameValue = typeof stats.highestStricheReceivedGame?.value === 'number' ? stats.highestStricheReceivedGame.value : -Infinity;
            if (stricheReceivedThisGame > currentHighestStricheReceivedGameValue) {
              stats.highestStricheReceivedGame = {
                value: stricheReceivedThisGame,
                date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp,
                relatedId: game.activeGameId || sessionFinalData.sessionId,
                type: "highest_striche_received_game",
                label: `Höchste erhaltene Striche in Einzelspiel (${stricheReceivedThisGame})`
              };
            }
            // NEU: lowestStricheReceivedGame
            const currentLowestStricheReceivedGameValue = typeof stats.lowestStricheReceivedGame?.value === 'number' ? stats.lowestStricheReceivedGame.value : Infinity;
            if (stricheReceivedThisGame < currentLowestStricheReceivedGameValue) {
              stats.lowestStricheReceivedGame = {
                value: stricheReceivedThisGame,
                date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp,
                relatedId: game.activeGameId || sessionFinalData.sessionId,
                type: "lowest_striche_received_game",
                label: `Wenigste erhaltene Striche in Einzelspiel (${stricheReceivedThisGame})`
              };
            }

            const playerStricheRecord = game.finalStriche[gamePlayerTeamPosition];
            if (playerStricheRecord) {
              stats.totalMatschGamesMade += (playerStricheRecord.matsch || 0);
              stats.totalSchneiderGamesMade += (playerStricheRecord.schneider || 0);
              stats.totalKontermatschGamesMade += (playerStricheRecord.kontermatsch || 0);
              
              const matschMadeThisGameValue = playerStricheRecord.matsch || 0;
              if (matschMadeThisGameValue > (typeof stats.mostMatschGame?.value === 'number' ? stats.mostMatschGame.value : 0)) {
                stats.mostMatschGame = { value: matschMadeThisGameValue, date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, relatedId: game.activeGameId || sessionFinalData.sessionId, type: "most_matsch_game", label: `Meiste Matsch in Spiel (${matschMadeThisGameValue})` };
              }
              const schneiderMadeThisGameValue = playerStricheRecord.schneider || 0;
              if (schneiderMadeThisGameValue > (typeof stats.mostSchneiderGame?.value === 'number' ? stats.mostSchneiderGame.value : 0)) {
                stats.mostSchneiderGame = { value: schneiderMadeThisGameValue, date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, relatedId: game.activeGameId || sessionFinalData.sessionId, type: "most_schneider_game", label: `Meiste Schneider in Spiel (${schneiderMadeThisGameValue})` };
              }
              const kontermatschMadeThisGameValue = playerStricheRecord.kontermatsch || 0;
              if (kontermatschMadeThisGameValue > (typeof stats.mostKontermatschMadeGame?.value === 'number' ? stats.mostKontermatschMadeGame.value : 0)) {
                stats.mostKontermatschMadeGame = { value: kontermatschMadeThisGameValue, date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, relatedId: game.activeGameId || sessionFinalData.sessionId, type: "most_kontermatsch_made_game", label: `Meiste Kontermatsch in Spiel (${kontermatschMadeThisGameValue})` };
              }
            }

            const opponentStricheRecord = game.finalStriche[gameOpponentTeamPosition];
            if (opponentStricheRecord) {
              stats.totalKontermatschGamesReceived += (opponentStricheRecord.kontermatsch || 0);
              const kontermatschReceivedThisGameValue = opponentStricheRecord.kontermatsch || 0;
              if (kontermatschReceivedThisGameValue > (typeof stats.mostKontermatschReceivedGame?.value === 'number' ? stats.mostKontermatschReceivedGame.value : 0)) {
                stats.mostKontermatschReceivedGame = { 
                  value: kontermatschReceivedThisGameValue, 
                  date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp, 
                  relatedId: game.activeGameId || sessionFinalData.sessionId, 
                  type: "most_kontermatsch_received_game", 
                  label: `Meiste Kontermatsch erhalten (${kontermatschReceivedThisGameValue})` 
                };
              }
            }
          }

          if (game.weisPoints && gamePlayerTeamPosition) {
            const weisMadeThisGame = game.weisPoints[gamePlayerTeamPosition] || 0;
            stats.playerTotalWeisMade = (stats.playerTotalWeisMade || 0) + weisMadeThisGame;

            const currentMostWeisGameValue = typeof stats.mostWeisPointsGame?.value === 'number' ? stats.mostWeisPointsGame.value : 0;
            if (weisMadeThisGame > currentMostWeisGameValue) {
              stats.mostWeisPointsGame = {
                value: weisMadeThisGame,
                date: game.completedAt instanceof admin.firestore.Timestamp ? game.completedAt : sessionTimestamp,
                relatedId: game.activeGameId || sessionFinalData.sessionId,
                type: "most_weis_points_game",
                label: `Meiste Weispunkte in Spiel (${weisMadeThisGame})`
              };
            }
          }
        }
      }

      // Addiere die Dauer der aktuellen Session zur Gesamtspielzeit des Spielers
      // Diese Information kommt aus dem finalUpdateData der Session, nicht aus den einzelnen Spielen.
      // Die Berechnung von sessionDurationSeconds erfolgt in finalizeSession vor dem Aufruf von updatePlayerStatsAfterSession.
      // Daher müssen wir es hier nicht neu berechnen, sondern könnten es übergeben bekommen, wenn es relevant wäre.
      // Fürs Erste lassen wir totalPlayTimeSeconds so, da es auf Session-Dauer basiert, die wir NICHT direkt hier haben.
      // Stattdessen wird initialPlayerComputedStats.totalPlayTimeSeconds verwendet und bleibt 0, wenn nicht extern geändert.
      // KORREKTUR: Wir haben sessionFinalData.durationSeconds NICHT direkt in sessionFinalData von updatePlayerStatsAfterSession.
      // Stattdessen verwenden wir die Differenz von sessionTimestamp und firstJassTimestamp des Spielers
      // Das ist aber nicht die reine Spielzeit. Wir müssen sessionDurationSeconds in updatePlayerStatsAfterSession verfügbar machen.
      // Fürs erste: Workaround, wenn wir die Session Dauer hier approximieren müssten (nicht ideal)
      // Für totalPlayTimeSeconds: Dieses Feld wird im Moment NICHT serverseitig akkumuliert.
      // Es müsste entweder vom Client pro Session gemeldet oder hier aus den Game-Timestamps abgeleitet werden.
      // Da die Spieldauer pro Spiel (game.durationMillis) in deinen Daten für completedGames vorhanden ist:
      if (completedGames.length > 0) {
        let sessionPlayTimeMillis = 0;
        completedGames.forEach(g => {
          if (g.participantUids?.includes(userId) && typeof g.durationMillis === 'number') {
            sessionPlayTimeMillis += g.durationMillis;
          }
        });
        stats.totalPlayTimeSeconds = (stats.totalPlayTimeSeconds || 0) + Math.round(sessionPlayTimeMillis / 1000);
      }

      // Gesamt-Differenzen am Ende berechnen
      stats.totalPointsDifference = (stats.totalPointsMade || 0) - (stats.totalPointsReceived || 0);
      stats.totalStricheDifference = (stats.totalStricheMade || 0) - (stats.totalStricheReceived || 0);

      // Durchschnittswerte berechnen (basierend auf kumulativen totalGames)
      if (stats.totalGames && stats.totalGames > 0) {
        stats.avgPointsPerGame = Math.round(((stats.totalPointsMade || 0) / stats.totalGames) * 100) / 100;
        stats.avgStrichePerGame = Math.round(((stats.totalStricheMade || 0) / stats.totalGames) * 100) / 100;
        stats.avgMatschPerGame = Math.round(((stats.totalMatschGamesMade || 0) / stats.totalGames) * 100) / 100;
        stats.avgSchneiderPerGame = Math.round(((stats.totalSchneiderGamesMade || 0) / stats.totalGames) * 100) / 100;
        stats.avgKontermatschPerGame = Math.round(((stats.totalKontermatschGamesMade || 0) / stats.totalGames) * 100) / 100;
        stats.avgWeisPointsPerGame = Math.round(((stats.playerTotalWeisMade || 0) / stats.totalGames) * 100) / 100;
      }

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

      const completedGames: CompletedGameData[] = [];
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

        if (game.finalStriche) {
          for (const key of Object.keys(totalStricheTopRecord) as Array<keyof StricheRecord>) {
            totalStricheTopRecord[key] += game.finalStriche.top?.[key] || 0;
            totalStricheBottomRecord[key] += game.finalStriche.bottom?.[key] || 0;
          }
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
            },
            now
          );
      }


      transaction.set(summaryDocRef, finalUpdateData, { merge: true });
      logger.info(`--- Transaction END for ${sessionId} (document set/merged) ---`);
    });

    logger.info(`Session ${sessionId} finalized successfully and player stats updated (trigger initiated).`);
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