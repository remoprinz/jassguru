import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
// ✅ SIMPLIFIED: PlayerComputedStats und TournamentPlacement nicht mehr nötig (alte Collection entfernt)
import { TournamentPlayerRankingData } from "./models/tournament-ranking.model"; // NEU: Import für das Ranking-Datenmodell
import { updateEloForTournament } from './jassEloUpdater'; // 🆕 Elo-Updates für Turniere
import { updatePlayerDataAfterSession } from './unifiedPlayerDataService'; // ✅ UNIFIED: Neue Player Data Service
import { saveRatingHistorySnapshot } from './ratingHistoryService'; // 🆕 Rating-Historie
import { updateChartsAfterSession } from './chartDataUpdater'; // 🆕 Chart-Updates

const db = admin.firestore();


// ✅ NEU: EventCounts-Interface (muss eventuell aus finalizeSession.ts importiert werden)
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


interface FinalizeTournamentData {
  tournamentId: string;
}

// Typ für die Rohdaten eines einzelnen Spiels/Passe im Turnier
// ACHTUNG: Diese Struktur wird hier als TournamentGameDetailData bezeichnet, 
// um Namenskollisionen zu vermeiden, wenn sie zusammen mit der aus tournamentGameProcessing.ts importiert wird.
// Für die interne Logik dieser Datei ist `TournamentGameData` okay, aber beim Export umbenennen oder anpassen.
// Da playerStatsRecalculation.ts bereits `TournamentGameData as TournamentProcessingGameData` importiert,
// können wir diese hier einfach als `TournamentGameData` belassen und exportieren.
export interface TournamentGameData { // EXPORTIERT
  id: string; // gameId / passeId
  finalScores: { top: number; bottom: number };
  finalStriche?: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  teams?: { 
    top?: { 
      playerUids?: string[]; // Legacy
      players?: Array<{ playerId: string; displayName: string }>; // ✅ NEU: Moderne Struktur
    }; 
    bottom?: { 
      playerUids?: string[]; // Legacy
      players?: Array<{ playerId: string; displayName: string }>; // ✅ NEU: Moderne Struktur
    }; 
  };
  participantUids?: string[]; // Legacy
  participantPlayerIds?: string[]; // ✅ NEU: Moderne Player IDs
  status?: string;
  roundHistory?: any[]; // ✅ NEU: Für eventCounts-Berechnung
  eventCounts?: EventCounts; // ✅ NEU: Berechnete eventCounts
  playerDetails?: Array<{ 
    uid?: string; // Legacy
    playerId?: string; // ✅ NEU: Moderne Player ID
    weisPoints?: number 
  }>; // ✅ NEU: Für Weis-Points
  // Weitere relevante Felder eines Spiels...
}

// ✅ NEU: Hilfsfunktion zur Berechnung der eventCounts für ein Game
function calculateEventCountsForTournamentGame(game: TournamentGameData): EventCounts {
  const { finalStriche, roundHistory } = game;
  
  const bottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const topEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

  // 1. Matsch/Kontermatsch aus roundHistory
  if (roundHistory && Array.isArray(roundHistory)) {
    roundHistory.forEach(round => {
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

  // 2. Sieg, Berg, Schneider aus finalStriche
  if (finalStriche) {
    if (finalStriche.bottom?.sieg > 0) bottomEvents.sieg = 1;
    if (finalStriche.top?.sieg > 0) topEvents.sieg = 1;
    if (finalStriche.bottom?.berg > 0) bottomEvents.berg = 1;
    if (finalStriche.top?.berg > 0) topEvents.berg = 1;
    if (finalStriche.bottom?.schneider > 0) bottomEvents.schneider = 1;
    if (finalStriche.top?.schneider > 0) topEvents.schneider = 1;
  }

  return { bottom: bottomEvents, top: topEvents };
}

// NEU: Interface für die Struktur eines Gruppeneintrags im Turnierdokument
export interface TournamentGroupDefinition { // EXPORTIERT (wird von TournamentDocData verwendet)
  id: string;      // Eindeutige ID der Gruppe (könnte die Firestore Document ID sein)
  name: string;    // Anzeigename der Gruppe
  playerUids: string[]; // UIDs der Spieler in dieser Gruppe
}

// 🆕 NEU: StricheRecord Type (für Type-Safety)
type StricheRecord = {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
};

// 🆕 NEU: Round-Level Detail-Tracking für Turnier-PlayerRankings
export interface RoundResult {
  passeLabel: string;           // "1A", "2B", etc.
  passeNumber: number;          // 1, 2, 3, ...
  passeId: string;              // Firestore document ID
  participated: boolean;        // false = Spieler hat pausiert
  
  // Nur wenn participated === true:
  team?: 'top' | 'bottom';
  partnerPlayerId?: string;
  opponentPlayerIds?: string[];
  
  // Absolute Werte (für "gemacht" Charts)
  pointsScored?: number;
  pointsReceived?: number;
  stricheScored?: StricheRecord;
  stricheReceived?: StricheRecord;
  
  // Differenz-Werte
  pointsDifferenz?: number;
  stricheDifferenz?: number;
  
  // Kumulative Werte (für kumulative Charts)
  cumulativePointsDifferenz?: number;
  cumulativeStricheDifferenz?: number;
  cumulativeEloRating?: number;
  
  // Spiel-Outcome
  won?: boolean;
  
  // Detail-Events
  eventCounts?: {
    matschMade: number;
    matschReceived: number;
    schneiderMade: number;
    schneiderReceived: number;
    kontermatschMade: number;
    kontermatschReceived: number;
  };
  
  // Performance
  roundsPlayed?: number;
  avgRoundDuration?: number;
  
  completedAt?: admin.firestore.Timestamp;
  durationSeconds?: number;
}

// 🆕 NEU: Erweiterte Tournament Session Summary (für groups/.../jassGameSummaries)
export interface TournamentJassGameSummary {
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  startedAt: admin.firestore.Timestamp;
  endedAt: admin.firestore.Timestamp;
  completedAt: admin.firestore.Timestamp;
  durationSeconds: number;
  
  // Turnier-Metadaten
  tournamentId: string;
  tournamentInstanceNumber: number;
  tournamentName: string;
  groupId: string;
  status: 'completed';
  
  // Teilnehmer
  participantPlayerIds: string[];
  playerNames?: { [position: string]: string };
  _playerNamesDeprecated?: boolean;
  
  // Spiel-Statistiken
  gamesPlayed: number;
  totalRounds: number;
  
  // Game-by-Game Results
  gameResults: Array<{
    gameNumber: number;
    passeLabel: string;
    passeId: string;
    winnerTeam: 'top' | 'bottom';
    topScore: number;
    bottomScore: number;
    completedAt: admin.firestore.Timestamp;
    durationSeconds: number;
    teams: {
      top: { players: Array<{ playerId: string; displayName: string; }>; };
      bottom: { players: Array<{ playerId: string; displayName: string; }>; };
    };
    finalStriche: {
      top: StricheRecord;
      bottom: StricheRecord;
    };
    eventCounts: {
      top: EventCountRecord;
      bottom: EventCountRecord;
    };
  }>;
  
  // Per-Player Aggregate
  gameWinsByPlayer: { [playerId: string]: { wins: number; losses: number; } };
  totalPointsByPlayer: { [playerId: string]: number };
  totalStricheByPlayer: { [playerId: string]: StricheRecord };
  totalEventCountsByPlayer: {
    [playerId: string]: {
      matschMade: number;
      matschReceived: number;
      schneiderMade: number;
      schneiderReceived: number;
      kontermatschMade: number;
      kontermatschReceived: number;
    };
  };
  
  // Performance-Metriken (analog finalizeSession)
  aggregatedRoundDurationsByPlayer?: {
    [playerId: string]: {
      totalDuration: number;
      roundCount: number;
      roundDurations: number[];
    };
  };
  aggregatedTrumpfCountsByPlayer?: {
    [playerId: string]: {
      [farbe: string]: number;
    };
  };
  
  // Team-Ebene (nur Summen)
  gameWinsByTeam: { top: number; bottom: number; ties?: number };
  sessionTotalWeisPoints: { top: number; bottom: number };
  
  // Elo & Ratings
  playerFinalRatings: {
    [playerId: string]: {
      rating: number;
      ratingDelta: number;
      gamesPlayed: number;
    };
  };
  
  // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr in jassGameSummaries gespeichert
  // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)
}

export interface TournamentDocData { // EXPORTIERT
  name?: string;
  status?: string;
  tournamentMode?: 'single' | 'doubles' | 'groupVsGroup' | 'spontaneous'; // ✅ 'spontaneous' hinzugefügt
  playerUids?: string[]; // DEPRECATED: Alte UIDs (für Backward-Kompatibilität)
  participantPlayerIds?: string[]; // ✅ NEU: Player Document IDs (keine Firebase UIDs mehr!)
  teams?: { id: string; playerUids: string[]; name: string }[];
  groups?: TournamentGroupDefinition[]; 
  groupId?: string; // ✅ Gruppe hinzugefügt
  settings?: {
    rankingMode?: 'total_points' | 'striche' | 'wins' | 'average_score_per_passe';
    scoreSettings?: {
        enabled?: {
            berg?: boolean;
            sieg?: boolean;
            schneider?: boolean;
        }
    }
    // Weitere Settings...
  };
  createdAt?: admin.firestore.Timestamp; 
  finalizedAt?: admin.firestore.Timestamp; // NEU: Explizit hier definiert
  totalRankedEntities?: number;          // NEU: Anzahl der gerankten Entitäten (Spieler/Teams/Gruppen)
  rankingSystemUsed?: string;            // NEU: Verwendetes Ranking-System (z.B. 'total_points')
  rankedPlayerUids?: string[];           // NEU: Liste der Spieler-UIDs, für die ein Ranking erstellt wurde
  lastError?: string | null;
}

/**
 * 🆕 NEU: Generiert roundResults[] Array für einen Spieler (für playerRankings)
 */
function generateRoundResultsForPlayer(
  playerId: string,
  tournamentGames: TournamentGameData[],
  participantPlayerIds: string[]
): RoundResult[] {
  logger.info(`[generateRoundResultsForPlayer] Starting for player ${playerId} with ${tournamentGames.length} games`);
  
  const roundResults: RoundResult[] = [];
  
  // Kumulative Tracker
  let cumulativePointsDiff = 0;
  let cumulativeStricheDiff = 0;
  
  // Helper: Berechne Summe der Striche
  const sumStriche = (s: StricheRecord): number =>
    s.berg + s.sieg + s.matsch + s.schneider + s.kontermatsch;
  
  // Sortiere Games chronologisch
  const sortedGames = [...tournamentGames].sort((a, b) => {
    const aNum = (a as any).passeNumber || 0;
    const bNum = (b as any).passeNumber || 0;
    return aNum - bNum;
  });
  
  sortedGames.forEach((game) => {
    const gameAny = game as any;
    const passeLabel = gameAny.passeLabel || `Game ${gameAny.passeNumber || game.id}`;
    const passeNumber = gameAny.passeNumber || 0;
    
    // Prüfe ob Spieler in diesem Game teilnimmt
    const topPlayerIds = game.teams?.top?.players?.map(p => p.playerId) || [];
    const bottomPlayerIds = game.teams?.bottom?.players?.map(p => p.playerId) || [];
    const isTopTeam = topPlayerIds.includes(playerId);
    const isBottomTeam = bottomPlayerIds.includes(playerId);
    const participated = isTopTeam || isBottomTeam;
    
    if (!participated) {
      // Spieler pausiert
      roundResults.push({
        passeLabel,
        passeNumber,
        passeId: game.id,
        participated: false
      });
      return;
    }
    
    // Spieler nimmt teil
    const team: 'top' | 'bottom' = isTopTeam ? 'top' : 'bottom';
    const partnerPlayerId = isTopTeam 
      ? topPlayerIds.find(id => id !== playerId)
      : bottomPlayerIds.find(id => id !== playerId);
    const opponentPlayerIds = isTopTeam ? bottomPlayerIds : topPlayerIds;
    
    const pointsScored = isTopTeam 
      ? (game.finalScores?.top || 0)
      : (game.finalScores?.bottom || 0);
    const pointsReceived = isTopTeam 
      ? (game.finalScores?.bottom || 0)
      : (game.finalScores?.top || 0);
    const pointsDifferenz = pointsScored - pointsReceived;
    
    const stricheScored = isTopTeam
      ? (game.finalStriche?.top || { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 })
      : (game.finalStriche?.bottom || { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 });
    const stricheReceived = isTopTeam
      ? (game.finalStriche?.bottom || { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 })
      : (game.finalStriche?.top || { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 });
    
    const stricheDifferenz = sumStriche(stricheScored) - sumStriche(stricheReceived);
    
    // Aktualisiere kumulative Werte
    cumulativePointsDiff += pointsDifferenz;
    cumulativeStricheDiff += stricheDifferenz;
    
    const won = pointsScored > pointsReceived;
    
    // EventCounts für diesen Spieler in diesem Game
    const gameEventCounts = game.eventCounts || calculateEventCountsForTournamentGame(game);
    const ownEvents = isTopTeam ? gameEventCounts.top : gameEventCounts.bottom;
    const oppEvents = isTopTeam ? gameEventCounts.bottom : gameEventCounts.top;
    
    const eventCounts = {
      matschMade: ownEvents.matsch || 0,
      matschReceived: oppEvents.matsch || 0,
      schneiderMade: ownEvents.schneider || 0,
      schneiderReceived: oppEvents.schneider || 0,
      kontermatschMade: ownEvents.kontermatsch || 0,
      kontermatschReceived: oppEvents.kontermatsch || 0
    };
    
    // Runden & Tempo
    const roundsPlayed = game.roundHistory?.length || 0;
    const gameDuration = gameAny.durationMillis || 0;
    const avgRoundDuration = roundsPlayed > 0 ? gameDuration / roundsPlayed : 0;
    
    roundResults.push({
      passeLabel,
      passeNumber,
      passeId: game.id,
      participated: true,
      
      team,
      partnerPlayerId,
      opponentPlayerIds,
      
      pointsScored,
      pointsReceived,
      pointsDifferenz,
      
      stricheScored,
      stricheReceived,
      stricheDifferenz,
      
      cumulativePointsDifferenz: cumulativePointsDiff,
      cumulativeStricheDifferenz: cumulativeStricheDiff,
      cumulativeEloRating: 100, // Wird später gefüllt
      
      won,
      eventCounts,
      
      roundsPlayed,
      avgRoundDuration,
      
      completedAt: gameAny.completedAt,
      durationSeconds: Math.round(gameDuration / 1000)
    });
  });
  
  logger.info(`[generateRoundResultsForPlayer] Completed for player ${playerId}: ${roundResults.length} results`);
  return roundResults;
}

/**
 * 🆕 NEU: Erstellt vollständiges jassGameSummary für Turnier (analog zu finalizeSession)
 * Wird in groups/{groupId}/jassGameSummaries/{tournamentId} gespeichert
 */
async function createTournamentJassGameSummary(
  tournamentId: string,
  tournamentDoc: TournamentDocData,
  tournamentGames: TournamentGameData[],
  participantPlayerIds: string[],
  uidToPlayerIdMap: Map<string, string>
): Promise<TournamentJassGameSummary> {
  const now = admin.firestore.Timestamp.now();
  
  // 1. Timestamps berechnen
  const sortedGames = [...tournamentGames].sort((a, b) => {
    const aCompleted = (a as any).completedAt;
    const bCompleted = (b as any).completedAt;
    const aTime = aCompleted && typeof aCompleted.toMillis === 'function' ? aCompleted.toMillis() : 0;
    const bTime = bCompleted && typeof bCompleted.toMillis === 'function' ? bCompleted.toMillis() : 0;
    return aTime - bTime;
  });
  
  const firstGame = sortedGames[0];
  const lastGame = sortedGames[sortedGames.length - 1];
  
  const startedAt = (firstGame as any)?.startedAt || tournamentDoc.createdAt || now;
  const completedAt = (lastGame as any)?.completedAt || tournamentDoc.finalizedAt || now;
  const durationSeconds = Math.round((completedAt.toMillis() - startedAt.toMillis()) / 1000);
  
  // 2. PlayerNames aus erster Passe (deprecated)
  const playerNames: { [position: string]: string } = {};
  if ((firstGame as any)?.playerDetails) {
    (firstGame as any).playerDetails.forEach((pd: any, idx: number) => {
      playerNames[String(idx + 1)] = pd.playerName || pd.playerId;
    });
  }
  
  // 3. Aggregationen initialisieren (analog zu finalizeSession.ts Zeilen 400-716)
  const gameWinsByPlayer: { [playerId: string]: { wins: number; losses: number } } = {};
  const totalPointsByPlayer: { [playerId: string]: number } = {};
  const totalStricheByPlayer: { [playerId: string]: StricheRecord } = {};
  const totalEventCountsByPlayer: { [playerId: string]: any } = {};
  const aggregatedRoundDurations: { [playerId: string]: any } = {};
  const aggregatedTrumpfCounts: { [playerId: string]: any } = {};
  
  let totalRounds = 0;
  const gameWinsByTeam = { top: 0, bottom: 0, ties: 0 };
  const sessionTotalWeisPoints = { top: 0, bottom: 0 };
  
  // Initialisiere per-player Strukturen
  participantPlayerIds.forEach(playerId => {
    gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
    totalPointsByPlayer[playerId] = 0;
    totalStricheByPlayer[playerId] = {
      berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0
    };
    totalEventCountsByPlayer[playerId] = {
      matschMade: 0, matschReceived: 0,
      schneiderMade: 0, schneiderReceived: 0,
      kontermatschMade: 0, kontermatschReceived: 0
    };
    aggregatedRoundDurations[playerId] = {
      totalDuration: 0, roundCount: 0, roundDurations: []
    };
    aggregatedTrumpfCounts[playerId] = {};
  });
  
  // PlayerNumber → PlayerId Mapping (für roundHistory)
  const playerNumberToIdMap = new Map<number, string>();
  participantPlayerIds.forEach((playerId, index) => {
    playerNumberToIdMap.set(index + 1, playerId); // 1-basiert
  });
  
  // 4. Iteriere über alle Games und aggregiere
  const gameResults: TournamentJassGameSummary['gameResults'] = [];
  
  for (const game of tournamentGames) {
    // GameResult erstellen (mit allen Details)
    const topScore = game.finalScores?.top || 0;
    const bottomScore = game.finalScores?.bottom || 0;
    const winnerTeam: 'top' | 'bottom' = topScore > bottomScore ? 'top' : 'bottom';
    
    // Extrahiere passeLabel und passeNumber
    const gameAny = game as any;
    const passeLabel = gameAny.passeLabel || `Game ${gameAny.passeNumber || game.id}`;
    const passeNumber = gameAny.passeNumber || 0;
    
    gameResults.push({
      gameNumber: passeNumber,
      passeLabel,
      passeId: game.id,
      winnerTeam,
      topScore,
      bottomScore,
      completedAt: gameAny.completedAt || now,
      durationSeconds: Math.round((gameAny.durationMillis || 0) / 1000),
      teams: {
        top: { 
          players: game.teams?.top?.players || [] 
        },
        bottom: { 
          players: game.teams?.bottom?.players || [] 
        }
      },
      finalStriche: game.finalStriche || {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      },
      eventCounts: game.eventCounts || calculateEventCountsForTournamentGame(game)
    });
    
    // Team Wins zählen
    if (topScore === bottomScore) {
      gameWinsByTeam.ties!++;
    } else {
      gameWinsByTeam[winnerTeam]++;
    }
    
    // Per-Player Aggregation
    const topPlayerIds = game.teams?.top?.players?.map(p => p.playerId) || [];
    const bottomPlayerIds = game.teams?.bottom?.players?.map(p => p.playerId) || [];
    
    // Wins/Losses
    if (topScore > bottomScore) {
      topPlayerIds.forEach(pid => {
 if (gameWinsByPlayer[pid]) gameWinsByPlayer[pid].wins++;
});
      bottomPlayerIds.forEach(pid => {
 if (gameWinsByPlayer[pid]) gameWinsByPlayer[pid].losses++;
});
    } else if (bottomScore > topScore) {
      bottomPlayerIds.forEach(pid => {
 if (gameWinsByPlayer[pid]) gameWinsByPlayer[pid].wins++;
});
      topPlayerIds.forEach(pid => {
 if (gameWinsByPlayer[pid]) gameWinsByPlayer[pid].losses++;
});
    }
    
    // Points
    topPlayerIds.forEach(pid => { 
      if (totalPointsByPlayer[pid] !== undefined) totalPointsByPlayer[pid] += topScore; 
    });
    bottomPlayerIds.forEach(pid => { 
      if (totalPointsByPlayer[pid] !== undefined) totalPointsByPlayer[pid] += bottomScore; 
    });
    
    // Striche
    if (game.finalStriche) {
      topPlayerIds.forEach(pid => {
        if (totalStricheByPlayer[pid]) {
          totalStricheByPlayer[pid].berg += game.finalStriche!.top.berg || 0;
          totalStricheByPlayer[pid].sieg += game.finalStriche!.top.sieg || 0;
          totalStricheByPlayer[pid].matsch += game.finalStriche!.top.matsch || 0;
          totalStricheByPlayer[pid].schneider += game.finalStriche!.top.schneider || 0;
          totalStricheByPlayer[pid].kontermatsch += game.finalStriche!.top.kontermatsch || 0;
        }
      });
      bottomPlayerIds.forEach(pid => {
        if (totalStricheByPlayer[pid]) {
          totalStricheByPlayer[pid].berg += game.finalStriche!.bottom.berg || 0;
          totalStricheByPlayer[pid].sieg += game.finalStriche!.bottom.sieg || 0;
          totalStricheByPlayer[pid].matsch += game.finalStriche!.bottom.matsch || 0;
          totalStricheByPlayer[pid].schneider += game.finalStriche!.bottom.schneider || 0;
          totalStricheByPlayer[pid].kontermatsch += game.finalStriche!.bottom.kontermatsch || 0;
        }
      });
    }
    
    // EventCounts per-player (aus roundHistory + finalStriche)
    const gameEventCounts = game.eventCounts || calculateEventCountsForTournamentGame(game);
    
    // Top Team Events
    topPlayerIds.forEach(pid => {
      if (totalEventCountsByPlayer[pid]) {
        totalEventCountsByPlayer[pid].matschMade += gameEventCounts.top.matsch || 0;
        totalEventCountsByPlayer[pid].matschReceived += gameEventCounts.bottom.matsch || 0;
        totalEventCountsByPlayer[pid].schneiderMade += gameEventCounts.top.schneider || 0;
        totalEventCountsByPlayer[pid].schneiderReceived += gameEventCounts.bottom.schneider || 0;
        totalEventCountsByPlayer[pid].kontermatschMade += gameEventCounts.top.kontermatsch || 0;
        totalEventCountsByPlayer[pid].kontermatschReceived += gameEventCounts.bottom.kontermatsch || 0;
      }
    });
    
    // Bottom Team Events
    bottomPlayerIds.forEach(pid => {
      if (totalEventCountsByPlayer[pid]) {
        totalEventCountsByPlayer[pid].matschMade += gameEventCounts.bottom.matsch || 0;
        totalEventCountsByPlayer[pid].matschReceived += gameEventCounts.top.matsch || 0;
        totalEventCountsByPlayer[pid].schneiderMade += gameEventCounts.bottom.schneider || 0;
        totalEventCountsByPlayer[pid].schneiderReceived += gameEventCounts.top.schneider || 0;
        totalEventCountsByPlayer[pid].kontermatschMade += gameEventCounts.bottom.kontermatsch || 0;
        totalEventCountsByPlayer[pid].kontermatschReceived += gameEventCounts.top.kontermatsch || 0;
      }
    });
    
    // RoundHistory Aggregation (Trumpf + Rundenzeiten)
    if (game.roundHistory && Array.isArray(game.roundHistory)) {
      totalRounds += game.roundHistory.length;
      
      game.roundHistory.forEach((round: any, roundIndex: number) => {
        // Trumpf-Aggregation (analog finalizeSession.ts Zeilen 531-543)
        if (round.startingPlayer && round.farbe) {
          const trumpfPlayerId = playerNumberToIdMap.get(round.startingPlayer);
          if (trumpfPlayerId && aggregatedTrumpfCounts[trumpfPlayerId]) {
            const farbeKey = round.farbe.toLowerCase();
            aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] = 
              (aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] || 0) + 1;
          }
        }
        
        // Rundendauer-Aggregation (analog finalizeSession.ts Zeilen 545-629)
        if (round.currentPlayer) {
          const roundPlayerId = playerNumberToIdMap.get(round.currentPlayer);
          if (roundPlayerId) {
            let roundDuration = 0;
            
            // Berechne Dauer aus aufeinanderfolgenden timestamps
            if (round.timestamp && typeof round.timestamp === 'number') {
              const currentTimestamp = round.timestamp;
              let previousTimestamp: number | undefined;
              
              if (roundIndex > 0) {
                const previousRound = game.roundHistory?.[roundIndex - 1];
                if (previousRound?.timestamp && typeof previousRound.timestamp === 'number') {
                  previousTimestamp = previousRound.timestamp;
                }
              }
              
              if (previousTimestamp && currentTimestamp > previousTimestamp) {
                roundDuration = currentTimestamp - previousTimestamp;
              }
            }
            
            // Alternative: durationMillis oder startTime/endTime
            if (roundDuration === 0 && round.durationMillis && typeof round.durationMillis === 'number') {
              roundDuration = round.durationMillis;
            }
            
            // Füge Rundendauer hinzu (Filter: 1min <= duration < 12min)
            if (roundDuration >= 60000 && roundDuration < 720000 && !round.wasPaused) {
              aggregatedRoundDurations[roundPlayerId].totalDuration += roundDuration;
              aggregatedRoundDurations[roundPlayerId].roundCount += 1;
              aggregatedRoundDurations[roundPlayerId].roundDurations.push(roundDuration);
            }
          }
        }
      });
    }
    
    // ✅ Weis Points aus playerDetails.weisInPasse aggregieren
    if (game.playerDetails && Array.isArray(game.playerDetails)) {
      game.playerDetails.forEach((playerDetail: any) => {
        const weisInPasse = playerDetail.weisInPasse || 0;
        const playerTeam = playerDetail.team;
        
        if (playerTeam === 'top') {
          sessionTotalWeisPoints.top += weisInPasse;
        } else if (playerTeam === 'bottom') {
          sessionTotalWeisPoints.bottom += weisInPasse;
        }
      });
    }
  }
  
  // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr in jassGameSummaries gespeichert
  // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)
  
  // 5. Zusammenstellen
  const result: TournamentJassGameSummary = {
    createdAt: tournamentDoc.createdAt || now,
    startedAt,
    endedAt: completedAt,
    completedAt,
    durationSeconds,
    
    tournamentId,
    tournamentInstanceNumber: 1,
    tournamentName: tournamentDoc.name || '',
    groupId: tournamentDoc.groupId || '',
    status: 'completed',
    
    participantPlayerIds,
    playerNames,
    _playerNamesDeprecated: true,
    
    gamesPlayed: tournamentGames.length,
    totalRounds,
    
    gameResults,
    gameWinsByPlayer,
    totalPointsByPlayer,
    totalStricheByPlayer,
    totalEventCountsByPlayer,
    
    gameWinsByTeam,
    sessionTotalWeisPoints,
    
    playerFinalRatings: {} // Wird später gefüllt
  };
  
  // Füge optionale Felder nur hinzu wenn Daten vorhanden
  const hasRoundDurations = Object.values(aggregatedRoundDurations).some(
    (d: any) => d.roundCount > 0
  );
  if (hasRoundDurations) {
    result.aggregatedRoundDurationsByPlayer = aggregatedRoundDurations;
  }
  
  const hasTrumpfCounts = Object.values(aggregatedTrumpfCounts).some(
    (t: any) => Object.keys(t).length > 0
  );
  if (hasTrumpfCounts) {
    result.aggregatedTrumpfCountsByPlayer = aggregatedTrumpfCounts;
  }
  
  // ❌ ENTFERNT: playerCumulativeStats wird nicht mehr hinzugefügt
  // Stattdessen: Verwende groups/{groupId}/aggregated/chartData_* (siehe chartDataService.ts)
  
  return result;
}

/**
 * INTERNE FUNKTION: Finalisiert ein Turnier (wird von Trigger UND Callable verwendet)
 * Diese Funktion enthält die GESAMTE Logik für Tournament-Finalisierung
 */
export async function finalizeTournamentInternal(tournamentId: string): Promise<{ success: boolean; message: string }> {
  logger.info("--- finalizeTournamentInternal START ---", { tournamentId });

    if (!tournamentId || typeof tournamentId !== 'string') {
      logger.error("Invalid tournamentId received.", { tournamentId });
      throw new HttpsError("invalid-argument", "Turnier-ID fehlt oder ist ungültig.");
    }

    try {
      const tournamentRef = db.collection("tournaments").doc(tournamentId);
      const tournamentSnap = await tournamentRef.get();

      if (!tournamentSnap.exists) {
        logger.error(`Tournament document with ID ${tournamentId} not found.`);
        throw new HttpsError("not-found", `Turnier mit ID ${tournamentId} nicht gefunden.`);
      }

      const tournamentData = tournamentSnap.data() as TournamentDocData;
      const tournamentMode = tournamentData.tournamentMode;
      const tournamentName = tournamentData.name || "Unbenanntes Turnier";
      const rankingModeToStore = tournamentData.settings?.rankingMode || 'total_points';
      const finalizedGroupId = tournamentData.groupId; // ✅ Gruppe aus Tournament-Dokument holen
      const scoreSettingsEnabled = tournamentData.settings?.scoreSettings?.enabled;
      const isPaused = !!(tournamentData as any).pausedAt;
      const currentStatus = tournamentData.status;

      // 🆕 DEBUG: Log Turnier-Status am Anfang
      logger.info(`[finalizeTournament] 📊 Tournament Status Check:`, {
        tournamentId,
        tournamentName,
        status: currentStatus,
        isPaused,
        pausedAt: (tournamentData as any).pausedAt,
        mode: tournamentMode,
        rankingMode: rankingModeToStore,
        groupId: finalizedGroupId,
        participantCount: tournamentData.participantPlayerIds?.length || 0,
        finalizedAt: tournamentData.finalizedAt
      });

      // ⚠️ WARNUNG: Wenn Turnier pausiert ist, aber trotzdem finalisiert wird
      if (isPaused) {
        logger.warn(`[finalizeTournament] ⚠️ Tournament ${tournamentId} is PAUSED but will be finalized anyway.`);
      }

      logger.info(`Processing tournament ${tournamentId} (${tournamentName}) with mode: ${tournamentMode}, ranking: ${rankingModeToStore}`);

      // ✅ FIX: Erlaube Re-Finalisierung für bereits abgeschlossene Turniere (um fehlende Felder zu ergänzen)
      if (tournamentData.status === 'archived') {
        logger.warn(`Tournament ${tournamentId} is archived. Skipping.`);
        return { success: true, message: `Turnier ${tournamentId} ist archiviert.` };
      }
      
      // ✅ FIX: Erlaube Re-Finalisierung für bereits abgeschlossene Turniere, aber nur wenn playerRankings fehlen
      const playerRankingsSnapshot = await tournamentRef.collection('playerRankings').get();
      if (tournamentData.finalizedAt && playerRankingsSnapshot.size > 0) {
        logger.warn(`Tournament ${tournamentId} is already finalized with playerRankings. Skipping.`);
        return { success: true, message: `Turnier ${tournamentId} ist bereits vollständig abgeschlossen.` };
      }

      // ✅ NEU: Hole participantPlayerIds direkt aus dem Turnierdokument (KEINE UIDs mehr!)
      const participantPlayerIds = tournamentData.participantPlayerIds || [];
      
      if (participantPlayerIds.length === 0) {
        logger.warn(`No participant player IDs found in tournament ${tournamentId}. Cannot calculate rankings.`);
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine Teilnehmer.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine Teilnehmer im Turnier, Abschluss ohne Ranking."};
      }

      logger.info(`[finalizeTournament] Tournament has ${participantPlayerIds.length} participant player IDs.`);
      
      // ✅ COMPATIBILITY: Erstelle Identity-Mapping (PlayerID → PlayerID) für alte Code-Pfade
      // Die alten Helper-Funktionen erwarten noch ein uidToPlayerIdMap, aber die Games haben bereits PlayerIDs!
      const uidToPlayerIdMap = new Map<string, string>();
      const participantUidsInTournament = participantPlayerIds; // Alias für Compatibility
      participantPlayerIds.forEach(playerId => {
        uidToPlayerIdMap.set(playerId, playerId); // Identity mapping
      });

      // 1. Alle abgeschlossenen Spiele/Passen des Turniers laden
      // ✅ WICHTIG: Tournament-Games haben kein "status" Feld, sondern nur "completedAt"!
      const gamesRef = tournamentRef.collection("games");
      const gamesSnap = await gamesRef.get(); // Hole ALLE Games
      
      // 🆕 DEBUG: Log alle Games
      logger.info(`[finalizeTournament] 📋 Found ${gamesSnap.size} total games in tournament ${tournamentId}`);
      
      const tournamentGames: TournamentGameData[] = [];
      let gamesWithCompletedAt = 0;
      let gamesWithoutCompletedAt = 0;
      
      gamesSnap.forEach(doc => {
        const gameData = doc.data();
        // Filter: Nur Games mit completedAt sind abgeschlossen
        if (gameData.completedAt) {
          tournamentGames.push({ id: doc.id, ...gameData } as TournamentGameData);
          gamesWithCompletedAt++;
        } else {
          gamesWithoutCompletedAt++;
        }
      });

      // 🆕 DEBUG: Log Game-Statistik
      logger.info(`[finalizeTournament] ✅ Completed games: ${gamesWithCompletedAt}, Incomplete games: ${gamesWithoutCompletedAt}`);

      if (tournamentGames.length === 0) {
        logger.warn(`No completed games found for tournament ${tournamentId}. Cannot calculate rankings.`);
        // Dennoch Turnier als abgeschlossen markieren, ggf. mit Hinweis
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine abgeschlossenen Spiele.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine abgeschlossenen Spiele im Turnier, Abschluss ohne Ranking." };
      }

      // ✅ FIX: Sammle ALLE Player IDs aus den Games (nicht nur aus participantPlayerIds)
      const allPlayerIds = new Set<string>();
      
      // 1. Füge participantPlayerIds hinzu (falls vorhanden)
      participantPlayerIds.forEach((playerId: string) => allPlayerIds.add(playerId));
      
      // 2. Sammle Player IDs aus allen Games
      for (const game of tournamentGames) {
        if (game.teams?.top?.players) {
          game.teams.top?.players?.forEach((player: any) => allPlayerIds.add(player.playerId));
        }
        if (game.teams?.bottom?.players) {
          game.teams.bottom?.players?.forEach((player: any) => allPlayerIds.add(player.playerId));
        }
      }
      
      const finalParticipantPlayerIds = Array.from(allPlayerIds);
      logger.info(`[finalizeTournament] 👥 Turnier ${tournamentId} hat ${finalParticipantPlayerIds.length} Teilnehmer aus Games: ${finalParticipantPlayerIds.join(', ')}`);
      
      // 🆕 DEBUG: Vergleich mit participantPlayerIds aus Tournament-Dokument
      const participantIdsFromDoc = tournamentData.participantPlayerIds || [];
      const missingInGames = participantIdsFromDoc.filter(id => !finalParticipantPlayerIds.includes(id));
      const extraInGames = finalParticipantPlayerIds.filter(id => !participantIdsFromDoc.includes(id));
      
      if (missingInGames.length > 0) {
        logger.warn(`[finalizeTournament] ⚠️ Teilnehmer im Dokument, aber nicht in Games: ${missingInGames.join(', ')}`);
      }
      if (extraInGames.length > 0) {
        logger.warn(`[finalizeTournament] ⚠️ Teilnehmer in Games, aber nicht im Dokument: ${extraInGames.join(', ')}`);
      }
      
      // ✅ FIX: Stelle sicher, dass finalParticipantPlayerIds alle Spieler aus den Games enthält
      if (finalParticipantPlayerIds.length === 0) {
        logger.warn(`No participant player IDs found in tournament ${tournamentId}. Cannot calculate rankings.`);
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine Teilnehmer.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine Teilnehmer im Turnier, Abschluss ohne Ranking."};
      }
      
      // ✅ UPDATE: Aktualisiere das Mapping mit den finalen Player IDs
      uidToPlayerIdMap.clear();
      finalParticipantPlayerIds.forEach(playerId => {
        uidToPlayerIdMap.set(playerId, playerId); // Identity mapping
      });
      
      if (finalParticipantPlayerIds.length === 0) {
        logger.warn(`No participant player IDs found in tournament ${tournamentId}. Cannot calculate rankings.`);
        await tournamentRef.update({ 
            status: 'completed', 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
            lastError: "Keine Teilnehmer.",
            totalRankedEntities: 0,
            rankedPlayerUids: [],
            rankingSystemUsed: rankingModeToStore
        });
        return { success: true, message: "Keine Teilnehmer im Turnier, Abschluss ohne Ranking."};
      }

      // ✅ NEU: Berechne eventCounts für alle Tournament-Games und schreibe Player-Doc-IDs in Games
      logger.info(`🔥 Berechne eventCounts für ${tournamentGames.length} Tournament-Games...`);
      const gameBatch = db.batch();
      
      for (const game of tournamentGames) {
        // Mappe participantUids -> participantPlayerIds für dieses Game
        const gameParticipantUids = Array.isArray(game.participantUids) ? game.participantUids : [];
        const mappedParticipantPlayerIds = Array.from(new Set(
          gameParticipantUids
            .map(uid => uidToPlayerIdMap.get(uid))
            .filter((id): id is string => typeof id === 'string')
        ));

        // Mappe playerDetails[].playerId (alte UID) -> Player-Doc-ID
        let mappedPlayerDetails = game.playerDetails;
        if (Array.isArray(game.playerDetails)) {
          mappedPlayerDetails = game.playerDetails.map(pd => {
            const maybeUid: any = (pd as any).uid || (pd as any).playerId;
            const mappedId = typeof maybeUid === 'string' ? uidToPlayerIdMap.get(maybeUid) : undefined;
            if (mappedId && mappedId !== (pd as any).playerId) {
              return { ...pd, playerId: mappedId } as typeof pd;
            }
            return pd;
          });
        }

        const gameRef = gamesRef.doc(game.id);
        const updatePayload: any = {};

        // eventCounts berechnen falls nötig
        if (game.finalStriche && !game.eventCounts) {
          // Berechne eventCounts für dieses Game
          const eventCounts = calculateEventCountsForTournamentGame(game);
          
          updatePayload.eventCounts = eventCounts;
          
          // Update das lokale Game-Objekt für weitere Berechnungen
          game.eventCounts = eventCounts;
          
          logger.info(`  ✅ Game ${game.id}: eventCounts berechnet - Bottom: ${JSON.stringify(eventCounts.bottom)}, Top: ${JSON.stringify(eventCounts.top)}`);
        }

        // Schreibe Player-Doc-IDs ins Game, falls vorhanden
        if (mappedParticipantPlayerIds.length > 0) {
          updatePayload.participantPlayerIds = mappedParticipantPlayerIds;
        }
        if (mappedPlayerDetails && Array.isArray(mappedPlayerDetails)) {
          updatePayload.playerDetails = mappedPlayerDetails;
        }

        // Entferne participantUids aus Game-Dokumenten (nur Player-IDs maßgeblich)
        updatePayload.participantUids = admin.firestore.FieldValue.delete();

        if (Object.keys(updatePayload).length > 0) {
          gameBatch.update(gameRef, updatePayload);
        }
      }
      
      // Commit alle Game-Updates
      await gameBatch.commit();
      logger.info(`🎯 EventCounts für ${tournamentGames.length} Games erfolgreich berechnet und gespeichert`);

      // 🆕 NEU: Erstelle jassGameSummary VOR Elo-Update (analog finalizeSession.ts)
      if (finalParticipantPlayerIds.length > 0 && finalizedGroupId) {
        try {
          logger.info(`[finalizeTournament] Creating jassGameSummary for tournament ${tournamentId} in group ${finalizedGroupId}`);
          
          const sessionSummary = await createTournamentJassGameSummary(
            tournamentId,
            tournamentData,
            tournamentGames,
            finalParticipantPlayerIds,
            uidToPlayerIdMap
          );
          
          // Schreibe in groups/{groupId}/jassGameSummaries/{tournamentId}
          const sessionDocRef = db
            .collection(`groups/${finalizedGroupId}/jassGameSummaries`)
            .doc(tournamentId);
          
          await sessionDocRef.set(sessionSummary, { merge: true });
          
          logger.info(`[finalizeTournament] ✅ jassGameSummary created for tournament ${tournamentId}`);
        } catch (error) {
          logger.error(`[finalizeTournament] Failed to create jassGameSummary:`, error);
          // Nicht kritisch - fahre fort
        }
      }

      // 🆕 ELO-UPDATE: Berechne Elo für alle Turnier-Passen (Fallback für alte Turniere)
      if (finalParticipantPlayerIds.length > 0) {
        try {
          // Prüfe ob Elo bereits für alle Passen berechnet wurde (durch onTournamentPasseCompleted Trigger)
          const firstPlayerId = finalParticipantPlayerIds[0];
          const ratingHistoryQuery = db.collection(`players/${firstPlayerId}/ratingHistory`)
            .where('tournamentId', '==', tournamentId)
            .where('eventType', '==', 'tournament_passe')
            .limit(1);
          
          const ratingHistorySnap = await ratingHistoryQuery.get();
          
          if (ratingHistorySnap.empty) {
            // Kein Elo-Update gefunden → Altes Turnier, Fallback ausführen
            logger.info(`[finalizeTournament] No Elo updates found, running fallback for old tournament ${tournamentId}`);
            await updateEloForTournament(tournamentId, finalParticipantPlayerIds);
            logger.info(`🎯 Elo für Turnier ${tournamentId} erfolgreich aktualisiert (Fallback)`);
          } else {
            // Elo bereits durch Trigger aktualisiert → Überspringen
            logger.info(`[finalizeTournament] ✅ Elo already updated by trigger, skipping for tournament ${tournamentId}`);
          }
          
          // 🆕 Rating-Historie NACH Elo-Update speichern (egal ob Fallback oder Trigger)
          if (finalizedGroupId) {
            try {
              logger.info(`[finalizeTournament] Saving rating history snapshot for tournament ${tournamentId}`);
              await saveRatingHistorySnapshot(
                finalizedGroupId,
                null, // Keine Session-ID bei Turnieren
                finalParticipantPlayerIds,
                'tournament_end',
                tournamentId
              );
              logger.info(`[finalizeTournament] ✅ Rating history snapshot completed for tournament ${tournamentId}`);
            } catch (historyError) {
              logger.error(`[finalizeTournament] Rating history snapshot failed for tournament ${tournamentId}:`, historyError);
              // Nicht kritisch - fahre fort
            }
          } else {
            logger.warn(`[finalizeTournament] No groupId found for tournament ${tournamentId}, skipping rating history snapshot`);
          }
        } catch (error) {
          logger.error(`❌ Fehler beim Elo-Update für Turnier ${tournamentId}:`, error);
          // Nicht kritisch - soll das Turnier-Finalisieren nicht blockieren
        }
      } else {
        logger.warn(`⚠️ Keine Player-Doc-IDs für Elo-Update in Turnier ${tournamentId} gefunden`);
      }

      // ✅ UNIFIED PLAYER DATA: Aktualisiere alle Spieler-Daten aus jassGameSummary
      if (finalParticipantPlayerIds.length > 0 && finalizedGroupId) {
        logger.info(`[finalizeTournament] Triggering unified player data update for tournament ${tournamentId}`);
        
        try {
          // ✅ SINGLE SOURCE OF TRUTH: Liest aus jassGameSummary und schreibt in neue Struktur
          await updatePlayerDataAfterSession(
            finalizedGroupId,
            tournamentId,
            finalParticipantPlayerIds,
            tournamentId    // tournamentId für Historie-Eintrag
          );
          logger.info(`[finalizeTournament] Unified player data update completed for tournament ${tournamentId}`);
        } catch (error) {
          logger.error(`[finalizeTournament] Fehler beim unified player data update für Turnier ${tournamentId}:`, error);
          // Nicht kritisch - soll das Turnier-Finalisieren nicht blockieren
        }
      } else {
        logger.warn(`⚠️ Keine Player-Doc-IDs oder Group-ID für unified player data update in Turnier ${tournamentId} gefunden`);
      }
      
      // 🆕 CHART-DATA UPDATES: Aktualisiere alle Chart-Dokumente
      if (finalParticipantPlayerIds.length > 0 && finalizedGroupId) {
        try {
          logger.info(`[finalizeTournament] Triggering chart data update for tournament ${tournamentId}`);
          await updateChartsAfterSession(
            finalizedGroupId,
            tournamentId,
            true // Tournament-Session
          );
          logger.info(`[finalizeTournament] Chart data update completed for tournament ${tournamentId}`);
        } catch (chartError) {
          logger.error(`[finalizeTournament] Error updating chart data:`, chartError);
          // Nicht kritisch - soll Turnier-Finalisierung nicht blockieren
        }
      }

      // 🆕 PLAYER FINAL RATINGS: Update jassGameSummary mit playerFinalRatings NACH Elo-Update
      if (finalParticipantPlayerIds.length > 0 && finalizedGroupId) {
        try {
          logger.info(`[finalizeTournament] Adding playerFinalRatings to jassGameSummary`);
          
          const playerFinalRatings: { [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } } = {};
          
          for (const playerId of finalParticipantPlayerIds) {
            const playerDoc = await db.collection('players').doc(playerId).get();
            const playerData = playerDoc.data();
            
            if (!playerData) continue;
            
            // 🔧 KORREKTUR: Berechne das korrekte Turnier-Delta aus ratingHistory
            let tournamentDelta = 0;
            try {
              // Hole alle ratingHistory Einträge für dieses Turnier
              const ratingHistoryQuery = db.collection(`players/${playerId}/ratingHistory`)
                .where('tournamentId', '==', tournamentId)
                .orderBy('completedAt', 'asc');
              
              const ratingHistorySnap = await ratingHistoryQuery.get();
              
              if (!ratingHistorySnap.empty) {
                const entries = ratingHistorySnap.docs.map(doc => doc.data());
                
                // ✅ KORREKT: Summiere ALLE Passe-Deltas in diesem Turnier
                tournamentDelta = entries.reduce((sum: number, entry: any) => {
                  return sum + (entry.delta || 0);
                }, 0);
                
                logger.debug(`[finalizeTournament] Player ${playerId} tournament delta: ${tournamentDelta.toFixed(2)} (sum of ${entries.length} passes)`);
              } else {
                logger.warn(`[finalizeTournament] No ratingHistory entries found for player ${playerId} in tournament ${tournamentId}`);
              }
            } catch (historyError) {
              logger.error(`[finalizeTournament] Error calculating tournament delta for player ${playerId}:`, historyError);
            }
            
            playerFinalRatings[playerId] = {
              rating: playerData.globalRating || 100,
              ratingDelta: tournamentDelta,
              gamesPlayed: playerData.gamesPlayed || 0,
            };
          }
          
          // Update jassGameSummary mit playerFinalRatings
          const sessionDocRef = db
            .collection(`groups/${finalizedGroupId}/jassGameSummaries`)
            .doc(tournamentId);
          
          await sessionDocRef.update({ playerFinalRatings });
          
          logger.info(`[finalizeTournament] ✅ playerFinalRatings added to jassGameSummary for ${finalParticipantPlayerIds.length} players`);
        } catch (error) {
          logger.error(`[finalizeTournament] Failed to add playerFinalRatings:`, error);
          // Nicht kritisch - fahre fort
        }
      }

      // 🆕 NEU: Update roundResults mit Elo-Ratings NACH Elo-Update
      if (finalParticipantPlayerIds.length > 0) {
        try {
          logger.info(`[finalizeTournament] Updating roundResults with Elo ratings`);
          
          for (const playerId of finalParticipantPlayerIds) {
            // Hole ratingHistory für dieses Turnier
            const ratingHistoryQuery = db
              .collection(`players/${playerId}/ratingHistory`)
              .where('tournamentId', '==', tournamentId)
              .orderBy('passeNumber', 'asc');
            
            const ratingHistorySnap = await ratingHistoryQuery.get();
            
            if (ratingHistorySnap.empty) {
              logger.warn(`[finalizeTournament] No rating history found for player ${playerId} in tournament ${tournamentId}`);
              continue;
            }
            
            // Mapping: passeNumber → Elo-Rating
            const eloByPasseNumber = new Map<number, number>();
            ratingHistorySnap.docs.forEach(doc => {
              const data = doc.data();
              if (data.passeNumber && data.rating) {
                eloByPasseNumber.set(data.passeNumber, data.rating);
              }
            });
            
            // Update roundResults mit Elo
            const rankingDocRef = tournamentRef.collection('playerRankings').doc(playerId);
            const rankingSnap = await rankingDocRef.get();
            const rankingData = rankingSnap.data();
            
            if (rankingData?.roundResults) {
              const updatedRoundResults = rankingData.roundResults.map((rr: RoundResult) => {
                if (rr.participated && rr.passeNumber) {
                  const elo = eloByPasseNumber.get(rr.passeNumber);
                  if (elo !== undefined) {
                    return { ...rr, cumulativeEloRating: elo };
                  }
                }
                return rr;
              });
              
              await rankingDocRef.update({ roundResults: updatedRoundResults });
              logger.debug(`[finalizeTournament] Updated roundResults with Elo for player ${playerId}`);
            }
          }
          
          logger.info(`[finalizeTournament] ✅ roundResults updated with Elo ratings for ${finalParticipantPlayerIds.length} players`);
        } catch (eloUpdateError) {
          logger.error(`[finalizeTournament] Failed to update roundResults with Elo:`, eloUpdateError);
          // Nicht kritisch - fahre fort
        }
      }

      // NEU: Batch für das Schreiben der Player-Rankings
      const playerRankingBatch = db.batch();
      const playerRankingsColRef = tournamentRef.collection("playerRankings");
      const allRankedPlayerUidsForTournamentDoc = new Set<string>();
      let totalRankedEntitiesForTournamentDoc = 0;

      switch (tournamentMode) {
        case 'single':
        case 'spontaneous': { // ✅ 'spontaneous' ist im Grunde ein 'single' Turnier
          logger.info(`Handling '${tournamentMode}' tournament mode for ${tournamentId}.`);
          
          // ✅ ERWEITERTE PLAYER-STATISTIK-STRUKTUR
          interface PlayerStats {
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }
          
          const playerScores: { [playerId: string]: PlayerStats } = {};
          
          // ✅ FIX: Initialisiere playerScores für ALLE Spieler, die in den Games gefunden werden
          const allGamePlayerIds = new Set<string>();
          for (const game of tournamentGames) {
            if (game.teams?.top?.players) {
              game.teams.top?.players?.forEach((player: any) => allGamePlayerIds.add(player.playerId));
            }
            if (game.teams?.bottom?.players) {
              game.teams.bottom?.players?.forEach((player: any) => allGamePlayerIds.add(player.playerId));
            }
          }
          
          // Initialisiere für alle gefundenen Spieler
          Array.from(allGamePlayerIds).forEach(playerId => {
            playerScores[playerId] = {
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });
          
          logger.info(`[finalizeTournament] Initialized playerScores for ${Object.keys(playerScores).length} players: ${Object.keys(playerScores).join(', ')}`);

          const calculateStricheForGame = (game: TournamentGameData, playerId: string): number => {
            let striche = 0;
            // ✅ FIX: Finde Team basierend auf Player ID statt UID
            const team = game.teams?.top?.players?.some(p => p.playerId === playerId) ? 'top' : 
                         (game.teams?.bottom?.players?.some(p => p.playerId === playerId) ? 'bottom' : null);
            if (team && game.finalStriche?.[team]) {
              const teamStriche = game.finalStriche[team];
              if (scoreSettingsEnabled?.berg) striche += (teamStriche.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStriche.sieg || 0); 
              if (scoreSettingsEnabled?.schneider) striche += (teamStriche.schneider || 0);
              striche += (teamStriche.matsch || 0);
              striche += (teamStriche.kontermatsch || 0);
            }
            return striche;
          };

          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken
          for (const game of tournamentGames) {
            // ✅ FIX: Sammle Player IDs aus diesem Game
            const gamePlayerIds = new Set<string>();
            
            if (game.teams?.top?.players) {
              game.teams.top?.players?.forEach((player: any) => gamePlayerIds.add(player.playerId));
            }
            if (game.teams?.bottom?.players) {
              game.teams.bottom?.players?.forEach((player: any) => gamePlayerIds.add(player.playerId));
            }
            
            // ✅ FIX: Nur Player verarbeiten, die tatsächlich in diesem Game gespielt haben
            for (const gameParticipantPlayerId of gamePlayerIds) {
              // ✅ FIX: Direkt Player ID verwenden, keine UID-Konvertierung nötig
              if (!playerScores[gameParticipantPlayerId]) continue;

              playerScores[gameParticipantPlayerId].gamesPlayed++;
              
              // ✅ FIX: Finde Team basierend auf Player ID statt UID
              const playerTeam = game.teams?.top?.players?.some(p => p.playerId === gameParticipantPlayerId) ? 'top' :
                                 (game.teams?.bottom?.players?.some(p => p.playerId === gameParticipantPlayerId) ? 'bottom' : null);
              
              if (!playerTeam) continue;
              
              const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
              
              // ✅ FIX: 1. PUNKTE SAMMELN - Optional Chaining für finalScores
              const playerPoints = game.finalScores?.[playerTeam] || 0;
              const opponentPoints = game.finalScores?.[opponentTeam] || 0;
              playerScores[gameParticipantPlayerId].pointsScored += playerPoints;
              playerScores[gameParticipantPlayerId].pointsReceived += opponentPoints;
              
              // ===== 2. STRICHE SAMMELN =====
              const playerStriche = calculateStricheForGame(game, gameParticipantPlayerId);
              // Berechne Gegner-Striche für "received" - summiere alle Gegner-Striche
              let opponentStriche = 0;
              const opponentPlayers = game.teams?.[opponentTeam]?.players || [];
              for (const opponentPlayer of opponentPlayers) {
                opponentStriche += calculateStricheForGame(game, opponentPlayer.playerId);
              }
              
              playerScores[gameParticipantPlayerId].stricheScored += playerStriche;
              playerScores[gameParticipantPlayerId].stricheReceived += opponentStriche;
              
              // ===== 3. WINS/LOSSES/DRAWS =====
              if (playerPoints > opponentPoints) {
                playerScores[gameParticipantPlayerId].wins++;
              } else if (playerPoints < opponentPoints) {
                playerScores[gameParticipantPlayerId].losses++;
              } else {
                playerScores[gameParticipantPlayerId].draws++;
              }
              
              // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
              if (game.eventCounts && game.eventCounts[playerTeam]) {
                const teamEvents = game.eventCounts[playerTeam];
                const opponentEvents = game.eventCounts[opponentTeam];
                
                // Events die man MACHT
                playerScores[gameParticipantPlayerId].eventCounts.matschMade += teamEvents.matsch || 0;
                playerScores[gameParticipantPlayerId].eventCounts.schneiderMade += teamEvents.schneider || 0;
                playerScores[gameParticipantPlayerId].eventCounts.kontermatschMade += teamEvents.kontermatsch || 0;
                
                // Events die man EMPFÄNGT (vom Gegner)
                playerScores[gameParticipantPlayerId].eventCounts.matschReceived += opponentEvents.matsch || 0;
                playerScores[gameParticipantPlayerId].eventCounts.schneiderReceived += opponentEvents.schneider || 0;
                playerScores[gameParticipantPlayerId].eventCounts.kontermatschReceived += opponentEvents.kontermatsch || 0;
                
                // NICHT: berg/sieg (redundant - ist bereits in striche bzw. wins)
              }
              
              // ===== 5. WEIS POINTS (falls verfügbar in playerDetails) =====
              if (game.playerDetails && Array.isArray(game.playerDetails)) {
                const playerDetail = game.playerDetails.find(pd => pd.playerId === gameParticipantPlayerId);
                if (playerDetail && playerDetail.weisPoints) {
                  playerScores[gameParticipantPlayerId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              
              // ===== 6. LEGACY SCORE für Ranking =====
              if (rankingModeToStore === 'striche') {
                playerScores[gameParticipantPlayerId].score += playerStriche;
              } else {
                playerScores[gameParticipantPlayerId].score += playerPoints;
              }
            }
          }

          const rankedPlayers = Object.entries(playerScores)
            .map(([playerId, data]) => ({ playerId, ...data }))
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.gamesPlayed - b.gamesPlayed; 
            });

          totalRankedEntitiesForTournamentDoc = rankedPlayers.length;

          // 🆕 DEBUG: Log vor Player-Loop
          logger.info(`[finalizeTournament] Starting player ranking loop with ${rankedPlayers.length} players`);

          // ✅ SIMPLIFIED: Nur PlayerRankings speichern (playerComputedStats ist deprecated)
          // ℹ️ Tournament stats werden jetzt durch updatePlayerDataAfterSession geschrieben
          const singleModePromises = rankedPlayers.map(async (player, index) => {
            const rank = index + 1;
            allRankedPlayerUidsForTournamentDoc.add(player.playerId);
            
            // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler
            const playerRankingDocRef = playerRankingsColRef.doc(player.playerId);
            
            // 🆕 DEBUG: Log vor generateRoundResultsForPlayer
            logger.info(`[finalizeTournament] About to generate roundResults for player ${player.playerId} (rank ${rank})`);
            
            // 🆕 NEU: Generiere roundResults für diesen Spieler
            const roundResults = generateRoundResultsForPlayer(
              player.playerId,
              tournamentGames,
              finalParticipantPlayerIds
            );
            
            // 🆕 DEBUG: Log roundResults
            logger.info(`[finalizeTournament] Generated ${roundResults.length} roundResults for player ${player.playerId}`);
            if (roundResults.length > 0) {
              logger.info(`[finalizeTournament] First roundResult:`, roundResults[0]);
            }
            
            const rankingData: TournamentPlayerRankingData = {
                // Identifikation
                playerId: player.playerId,
                tournamentId: tournamentId,
                tournamentName: tournamentName,
                tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                createdAt: admin.firestore.Timestamp.now(),
                
                // Ranking
                rank: rank,
                totalRankedEntities: rankedPlayers.length,
                rankingSystemUsed: rankingModeToStore,
                
                // ✅ SCORES MIT DIFFERENZEN
                // Punkte
                pointsScored: player.pointsScored,
                pointsReceived: player.pointsReceived,
                pointsDifference: player.pointsScored - player.pointsReceived,
                totalPoints: player.pointsScored, // Legacy
                
                // Striche
                stricheScored: player.stricheScored,
                stricheReceived: player.stricheReceived,
                stricheDifference: player.stricheScored - player.stricheReceived,
                totalStriche: player.stricheScored, // Legacy
                
                score: player.score, // Legacy: Haupt-Score für Ranking
                
                // ✅ SPIEL-STATISTIKEN
                gamesPlayed: player.gamesPlayed,
                gamesWon: player.wins,
                gamesLost: player.losses,
                gamesDraw: player.draws,
                rawWins: player.wins, // Legacy
                
                // ✅ EVENT COUNTS
                eventCounts: player.eventCounts,
                
                // ✅ WEIS-STATISTIKEN
                totalWeisPoints: player.totalWeisPoints,
                averageWeisPerGame: player.gamesPlayed > 0 ? player.totalWeisPoints / player.gamesPlayed : 0,
                
                // 🆕 NEU: Round-Level Details
                roundResults: roundResults
            };
            
            logger.info(`[finalizeTournament] Saving ranking for player ${player.playerId} (rank ${rank}): ` +
                       `Points ${player.pointsScored}/${player.pointsReceived} (${player.pointsScored - player.pointsReceived}), ` +
                       `Striche ${player.stricheScored}/${player.stricheReceived} (${player.stricheScored - player.stricheReceived}), ` +
                       `${roundResults.length} passen`);
            
            playerRankingBatch.set(playerRankingDocRef, rankingData);

            // ❌ REMOVED: playerComputedStats Transaction (deprecated old collection)
            // ℹ️ Diese Daten werden jetzt durch updatePlayerDataAfterSession + neue Struktur verwaltet
            // ℹ️ TODO: Sobald Frontend auf neue Struktur umgestellt ist, kann dieser Code gelöscht werden
          });
          await Promise.all(singleModePromises);
          logger.info(`Player stats updated and rankings prepared for 'single' tournament ${tournamentId}.`);
          break;
        }
        case 'doubles': {
          logger.info(`Handling 'doubles' tournament mode for ${tournamentId}.`);
          if (!tournamentData.teams || tournamentData.teams.length === 0) {
            logger.warn(`No teams defined for 'doubles' tournament ${tournamentId}. Cannot calculate rankings.`);
            await tournamentRef.update({ 
                status: 'completed', 
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
                lastError: "Keine Teams für Doppelmodus definiert.",
                totalRankedEntities: 0,
                rankedPlayerUids: [],
                rankingSystemUsed: rankingModeToStore
            });
            return { success: true, message: "Keine Teams für Doppelmodus definiert, Abschluss ohne Ranking." };
          }

          // ✅ ERWEITERTE TEAM-STATISTIK-STRUKTUR für doubles
          interface TeamStats {
            id: string;
            teamName: string;
            playerUids: string[];
            
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }

          const teamScores: { [teamDataId: string]: TeamStats } = {};
          tournamentData.teams.forEach(team => {
            teamScores[team.id] = { 
              id: team.id, 
              teamName: team.name, 
              playerUids: team.playerUids,
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });

          // ✅ FIX: calculateStricheForTeamInGame - konvertiere UIDs zu Player IDs für Matching
          const calculateStricheForTeamInGame = (game: TournamentGameData, teamPlayerUids: string[]): number => {
            let striche = 0;
            // Konvertiere UIDs aus Turnierdefinition zu Player IDs
            const teamPlayerIds = teamPlayerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
            
            // Matche gegen neue game.teams.players[].playerId Struktur
            const gameTeamKey = game.teams?.top?.players?.some(p => teamPlayerIds.includes(p.playerId)) ? 'top' :
                               (game.teams?.bottom?.players?.some(p => teamPlayerIds.includes(p.playerId)) ? 'bottom' : null);
            if (gameTeamKey && game.finalStriche?.[gameTeamKey]) {
              const teamStricheRecord = game.finalStriche[gameTeamKey];
              if (scoreSettingsEnabled?.berg) striche += (teamStricheRecord.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStricheRecord.sieg || 0);
              if (scoreSettingsEnabled?.schneider) striche += (teamStricheRecord.schneider || 0);
              striche += (teamStricheRecord.matsch || 0);
              striche += (teamStricheRecord.kontermatsch || 0);
            }
            return striche;
          };
          
          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken für Teams
          for (const game of tournamentGames) {
            // ✅ FIX: Identifiziere die teilnehmenden Turnier-Teams in diesem Spiel
            // Konvertiere UIDs aus Turnierdefinition zu Player IDs für Matching
            const playingTournamentTeams: {teamId: string, teamKeyInGame: 'top' | 'bottom', playerUids: string[]}[] = [];
            
            for (const definedTeam of tournamentData.teams) {
                // Konvertiere UIDs des definierten Teams zu Player IDs
                const definedTeamPlayerIds = definedTeam.playerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
                
                // Matche gegen neue game.teams.players[].playerId Struktur
                if (game.teams?.top?.players?.some(p => definedTeamPlayerIds.includes(p.playerId))) {
                    playingTournamentTeams.push({teamId: definedTeam.id, teamKeyInGame: 'top', playerUids: definedTeam.playerUids});
                } else if (game.teams?.bottom?.players?.some(p => definedTeamPlayerIds.includes(p.playerId))) {
                    playingTournamentTeams.push({teamId: definedTeam.id, teamKeyInGame: 'bottom', playerUids: definedTeam.playerUids});
                }
            }

            if (playingTournamentTeams.length !== 2) {
                logger.warn(`Game ${game.id} in doubles tournament ${tournamentId} does not involve exactly two defined tournament teams. Skipping game for ranking.`);
                continue;
            }

            const teamA = playingTournamentTeams[0];
            const teamB = playingTournamentTeams[1];

            if (!teamScores[teamA.teamId] || !teamScores[teamB.teamId]) {
                logger.warn(`Game ${game.id} involves teams not registered in the tournament. Skipping.`);
                continue;
            }
            
            teamScores[teamA.teamId].gamesPlayed++;
            teamScores[teamB.teamId].gamesPlayed++;

            // ✅ FIX: 1. PUNKTE SAMMELN - Optional Chaining für finalScores
            const teamAPoints = game.finalScores?.[teamA.teamKeyInGame] || 0;
            const teamBPoints = game.finalScores?.[teamB.teamKeyInGame] || 0;
            teamScores[teamA.teamId].pointsScored += teamAPoints;
            teamScores[teamA.teamId].pointsReceived += teamBPoints;
            teamScores[teamB.teamId].pointsScored += teamBPoints;
            teamScores[teamB.teamId].pointsReceived += teamAPoints;
            
            // ===== 2. STRICHE SAMMELN =====
            const teamAStriche = calculateStricheForTeamInGame(game, teamA.playerUids);
            const teamBStriche = calculateStricheForTeamInGame(game, teamB.playerUids);
            teamScores[teamA.teamId].stricheScored += teamAStriche;
            teamScores[teamA.teamId].stricheReceived += teamBStriche;
            teamScores[teamB.teamId].stricheScored += teamBStriche;
            teamScores[teamB.teamId].stricheReceived += teamAStriche;
            
            // ===== 3. WINS/LOSSES/DRAWS =====
            if (teamAPoints > teamBPoints) {
              teamScores[teamA.teamId].wins++;
              teamScores[teamB.teamId].losses++;
            } else if (teamBPoints > teamAPoints) {
              teamScores[teamB.teamId].wins++;
              teamScores[teamA.teamId].losses++;
            } else {
              teamScores[teamA.teamId].draws++;
              teamScores[teamB.teamId].draws++;
            }
            
            // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
            if (game.eventCounts) {
              const teamAEvents = game.eventCounts[teamA.teamKeyInGame];
              const teamBEvents = game.eventCounts[teamB.teamKeyInGame];
              
              if (teamAEvents && teamBEvents) {
                // Events die Team A MACHT
                teamScores[teamA.teamId].eventCounts.matschMade += teamAEvents.matsch || 0;
                teamScores[teamA.teamId].eventCounts.schneiderMade += teamAEvents.schneider || 0;
                teamScores[teamA.teamId].eventCounts.kontermatschMade += teamAEvents.kontermatsch || 0;
                
                // Events die Team A EMPFÄNGT (von Team B)
                teamScores[teamA.teamId].eventCounts.matschReceived += teamBEvents.matsch || 0;
                teamScores[teamA.teamId].eventCounts.schneiderReceived += teamBEvents.schneider || 0;
                teamScores[teamA.teamId].eventCounts.kontermatschReceived += teamBEvents.kontermatsch || 0;
                
                // Events die Team B MACHT
                teamScores[teamB.teamId].eventCounts.matschMade += teamBEvents.matsch || 0;
                teamScores[teamB.teamId].eventCounts.schneiderMade += teamBEvents.schneider || 0;
                teamScores[teamB.teamId].eventCounts.kontermatschMade += teamBEvents.kontermatsch || 0;
                
                // Events die Team B EMPFÄNGT (von Team A)
                teamScores[teamB.teamId].eventCounts.matschReceived += teamAEvents.matsch || 0;
                teamScores[teamB.teamId].eventCounts.schneiderReceived += teamAEvents.schneider || 0;
                teamScores[teamB.teamId].eventCounts.kontermatschReceived += teamAEvents.kontermatsch || 0;
              }
            }
            
            // ✅ FIX: 5. WEIS POINTS - konvertiere UIDs zu Player IDs
            if (game.playerDetails && Array.isArray(game.playerDetails)) {
              // Konvertiere UIDs aus Turnierdefinition zu Player IDs
              const teamAPlayerIds = teamA.playerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
              const teamBPlayerIds = teamB.playerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
              
              for (const playerId of teamAPlayerIds) {
                const playerDetail = game.playerDetails.find(pd => pd.playerId === playerId);
                if (playerDetail && playerDetail.weisPoints) {
                  teamScores[teamA.teamId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              for (const playerId of teamBPlayerIds) {
                const playerDetail = game.playerDetails.find(pd => pd.playerId === playerId);
                if (playerDetail && playerDetail.weisPoints) {
                  teamScores[teamB.teamId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
            }
            
            // ===== 6. LEGACY SCORE für Ranking =====
            if (rankingModeToStore === 'striche') {
              teamScores[teamA.teamId].score += teamAStriche;
              teamScores[teamB.teamId].score += teamBStriche;
            } else {
              teamScores[teamA.teamId].score += teamAPoints;
              teamScores[teamB.teamId].score += teamBPoints;
            }
          }

          const rankedTeams = Object.values(teamScores)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return a.gamesPlayed - b.gamesPlayed;
            });

          totalRankedEntitiesForTournamentDoc = rankedTeams.length;

          // ✅ SIMPLIFIED: Keine playerComputedStats Updates mehr nötig
          for (let i = 0; i < rankedTeams.length; i++) {
            const team = rankedTeams[i];
            const rank = i + 1;
            for (const playerUid of team.playerUids) {
              // ✅ KORRIGIERT: Konvertiere UID zu Player ID für Stats
              const playerId = uidToPlayerIdMap.get(playerUid);
              if (!playerId) {
                logger.warn(`[finalizeTournament] Could not find Player ID for UID ${playerUid} in doubles mode`);
                continue;
              }
              
              allRankedPlayerUidsForTournamentDoc.add(playerId);
              const playerRankingDocRef = playerRankingsColRef.doc(playerId);
              
              // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler im Team
              const rankingData: TournamentPlayerRankingData = {
                  // Identifikation
                  playerId: playerId,
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                  createdAt: admin.firestore.Timestamp.now(),
                  
                  // Ranking
                  rank: rank,
                  totalRankedEntities: rankedTeams.length,
                  rankingSystemUsed: rankingModeToStore,
                  
                  // Team-Info
                  teamId: team.id,
                  teamName: team.teamName,
                  
                  // ✅ SCORES MIT DIFFERENZEN (vom Team)
                  // Punkte
                  pointsScored: team.pointsScored,
                  pointsReceived: team.pointsReceived,
                  pointsDifference: team.pointsScored - team.pointsReceived,
                  totalPoints: team.pointsScored, // Legacy
                  
                  // Striche
                  stricheScored: team.stricheScored,
                  stricheReceived: team.stricheReceived,
                  stricheDifference: team.stricheScored - team.stricheReceived,
                  totalStriche: team.stricheScored, // Legacy
                  
                  score: team.score, // Legacy: Haupt-Score für Ranking
                  
                  // ✅ SPIEL-STATISTIKEN (vom Team)
                  gamesPlayed: team.gamesPlayed,
                  gamesWon: team.wins,
                  gamesLost: team.losses,
                  gamesDraw: team.draws,
                  rawWins: team.wins, // Legacy
                  
                  // ✅ EVENT COUNTS (vom Team)
                  eventCounts: team.eventCounts,
                  
                  // ✅ WEIS-STATISTIKEN (vom Team)
                  totalWeisPoints: team.totalWeisPoints,
                  averageWeisPerGame: team.gamesPlayed > 0 ? team.totalWeisPoints / team.gamesPlayed : 0
              };
              
              logger.info(`[finalizeTournament] Saving doubles ranking for player ${playerId} (Team: ${team.teamName}, rank ${rank}): ` +
                         `Points ${team.pointsScored}/${team.pointsReceived} (${team.pointsScored - team.pointsReceived}), ` +
                         `Striche ${team.stricheScored}/${team.stricheReceived} (${team.stricheScored - team.stricheReceived})`);
              
              playerRankingBatch.set(playerRankingDocRef, rankingData);
              
              // ❌ REMOVED: playerComputedStats Transaction (deprecated old collection)
              // ℹ️ Diese Daten werden jetzt durch updatePlayerDataAfterSession + neue Struktur verwaltet
            }
          }
          logger.info(`Player rankings prepared for 'doubles' tournament ${tournamentId}.`);
          break;
        }
        case 'groupVsGroup': {
          logger.info(`Handling 'groupVsGroup' tournament mode for ${tournamentId}.`);

          // Annahme: tournamentData.groups enthält Infos zu den teilnehmenden Gruppen
          // z.B. [{ groupId: "id1", name: "Gruppe A", playerUids: ["uid1", "uid2"] }, ...]
          // ODER tournamentData.participatingGroupIds und wir laden die Gruppen-Infos separat.
          // Für dieses Beispiel nehmen wir an, dass `tournamentData.groups` die notwendigen Infos enthält.

          if (!tournamentData.groups || tournamentData.groups.length < 2) {
            logger.warn(`Not enough groups defined for 'groupVsGroup' tournament ${tournamentId}. Needs at least 2. Cannot calculate rankings.`);
            await tournamentRef.update({ 
                status: 'completed', 
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(), 
                lastError: "Nicht genügend Gruppen für groupVsGroup-Modus definiert.",
                totalRankedEntities: 0,
                rankedPlayerUids: [],
                rankingSystemUsed: rankingModeToStore
            });
            return { success: true, message: "Nicht genügend Gruppen (min. 2) für groupVsGroup-Modus definiert, Abschluss ohne Ranking." };
          }

          // ✅ ERWEITERTE GRUPPEN-STATISTIK-STRUKTUR für groupVsGroup
          interface GroupStats {
            groupId: string;
            groupName: string;
            playerUids: string[];
            
            // Scores
            pointsScored: number;
            pointsReceived: number;
            stricheScored: number;
            stricheReceived: number;
            score: number; // Legacy für Ranking
            
            // Game Stats
            gamesPlayed: number;
            wins: number;
            losses: number;
            draws: number;
            
            // Event Counts (nur sinnvolle!)
            eventCounts: {
              matschMade: number;
              matschReceived: number;
              schneiderMade: number;
              schneiderReceived: number;
              kontermatschMade: number;
              kontermatschReceived: number;
            };
            
            // Weis
            totalWeisPoints: number;
          }

          const groupStats: { [groupId: string]: GroupStats } = {};
          // Expliziter Typ für group
          tournamentData.groups.forEach((group: TournamentGroupDefinition) => { 
            groupStats[group.id] = { 
              groupId: group.id,
              groupName: group.name,
              playerUids: group.playerUids || [], // Spieler der Gruppe
              pointsScored: 0,
              pointsReceived: 0,
              stricheScored: 0,
              stricheReceived: 0,
              score: 0,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              eventCounts: {
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0
              },
              totalWeisPoints: 0
            };
          });

          // ✅ FIX: Hilfsfunktion (ähnlich wie bei 'doubles', aber für Gruppen)
          const calculateStricheForGroupInGame = (game: TournamentGameData, groupPlayerUids: string[]): number => {
            let striche = 0;
            // Konvertiere UIDs aus Turnierdefinition zu Player IDs
            const groupPlayerIds = groupPlayerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
            
            // Matche gegen neue game.teams.players[].playerId Struktur
            const gameTeamKey = game.teams?.top?.players?.some(p => groupPlayerIds.includes(p.playerId)) ? 'top' :
                               (game.teams?.bottom?.players?.some(p => groupPlayerIds.includes(p.playerId)) ? 'bottom' : null);
            if (gameTeamKey && game.finalStriche?.[gameTeamKey]) {
              const teamStricheRecord = game.finalStriche[gameTeamKey];
              if (scoreSettingsEnabled?.berg) striche += (teamStricheRecord.berg || 0);
              if (scoreSettingsEnabled?.sieg) striche += (teamStricheRecord.sieg || 0);
              if (scoreSettingsEnabled?.schneider) striche += (teamStricheRecord.schneider || 0);
              striche += (teamStricheRecord.matsch || 0);
              striche += (teamStricheRecord.kontermatsch || 0);
            }
            return striche;
          };

          // ✅ NEU: Iteriere über alle Games und sammle ALLE Statistiken für Gruppen
          for (const game of tournamentGames) {
            // Finde die zwei Gruppen, die in diesem Spiel gegeneinander gespielt haben
            const involvedGroupsInGame: GroupStats[] = [];
            const gameParticipantUids = new Set(game.participantUids || []);

            for (const groupId in groupStats) {
              if (Object.prototype.hasOwnProperty.call(groupStats, groupId)) {
              const group = groupStats[groupId];
              // Prüfen, ob mindestens ein Spieler der Gruppe an diesem Spiel teilgenommen hat
              if (group.playerUids.some(uid => gameParticipantUids.has(uid))) {
                involvedGroupsInGame.push(group);
                }
              }
            }

            if (involvedGroupsInGame.length !== 2) {
              logger.warn(`Game ${game.id} in groupVsGroup tournament ${tournamentId} does not clearly involve two defined tournament groups. Found ${involvedGroupsInGame.length} groups. Skipping game for group ranking.`);
              continue;
            }

            const groupA = involvedGroupsInGame[0];
            const groupB = involvedGroupsInGame[1];

            groupStats[groupA.groupId].gamesPlayed++;
            groupStats[groupB.groupId].gamesPlayed++;

            // ✅ FIX: Bestimme, welches Team (top/bottom) im Spiel zu welcher Gruppe gehört
            // Konvertiere UIDs aus Gruppendefintionen zu Player IDs
            const groupAPlayerIds = groupA.playerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
            const groupBPlayerIds = groupB.playerUids.map(uid => uidToPlayerIdMap.get(uid) || uid);
            
            // Matche gegen neue game.teams.players[].playerId Struktur
            const groupATeamKey = game.teams?.top?.players?.some(p => groupAPlayerIds.includes(p.playerId)) ? 'top' :
                                 (game.teams?.bottom?.players?.some(p => groupAPlayerIds.includes(p.playerId)) ? 'bottom' : null);
            const groupBTeamKey = groupATeamKey === 'top' ? 'bottom' : (groupATeamKey === 'bottom' ? 'top' : null);

            if (!groupATeamKey || !groupBTeamKey) {
                logger.warn(`Could not determine team keys for groups in game ${game.id}. Skipping score calculation for this game.`);
                continue;
            }

            // ✅ FIX: 1. PUNKTE SAMMELN - Optional Chaining für finalScores
            const groupAPoints = game.finalScores?.[groupATeamKey] || 0;
            const groupBPoints = game.finalScores?.[groupBTeamKey] || 0;
            groupStats[groupA.groupId].pointsScored += groupAPoints;
            groupStats[groupA.groupId].pointsReceived += groupBPoints;
            groupStats[groupB.groupId].pointsScored += groupBPoints;
            groupStats[groupB.groupId].pointsReceived += groupAPoints;
            
            // ===== 2. STRICHE SAMMELN =====
            const groupAStriche = calculateStricheForGroupInGame(game, groupA.playerUids);
            const groupBStriche = calculateStricheForGroupInGame(game, groupB.playerUids);
            groupStats[groupA.groupId].stricheScored += groupAStriche;
            groupStats[groupA.groupId].stricheReceived += groupBStriche;
            groupStats[groupB.groupId].stricheScored += groupBStriche;
            groupStats[groupB.groupId].stricheReceived += groupAStriche;
            
            // ===== 3. WINS/LOSSES/DRAWS =====
            if (groupAPoints > groupBPoints) {
              groupStats[groupA.groupId].wins++;
              groupStats[groupB.groupId].losses++;
            } else if (groupBPoints > groupAPoints) {
              groupStats[groupB.groupId].wins++;
              groupStats[groupA.groupId].losses++;
            } else {
              groupStats[groupA.groupId].draws++;
              groupStats[groupB.groupId].draws++;
            }
            
            // ===== 4. EVENT COUNTS (nur sinnvolle!) =====
            if (game.eventCounts) {
              const groupAEvents = game.eventCounts[groupATeamKey];
              const groupBEvents = game.eventCounts[groupBTeamKey];
              
              if (groupAEvents && groupBEvents) {
                // Events die Gruppe A MACHT
                groupStats[groupA.groupId].eventCounts.matschMade += groupAEvents.matsch || 0;
                groupStats[groupA.groupId].eventCounts.schneiderMade += groupAEvents.schneider || 0;
                groupStats[groupA.groupId].eventCounts.kontermatschMade += groupAEvents.kontermatsch || 0;
                
                // Events die Gruppe A EMPFÄNGT (von Gruppe B)
                groupStats[groupA.groupId].eventCounts.matschReceived += groupBEvents.matsch || 0;
                groupStats[groupA.groupId].eventCounts.schneiderReceived += groupBEvents.schneider || 0;
                groupStats[groupA.groupId].eventCounts.kontermatschReceived += groupBEvents.kontermatsch || 0;
                
                // Events die Gruppe B MACHT
                groupStats[groupB.groupId].eventCounts.matschMade += groupBEvents.matsch || 0;
                groupStats[groupB.groupId].eventCounts.schneiderMade += groupBEvents.schneider || 0;
                groupStats[groupB.groupId].eventCounts.kontermatschMade += groupBEvents.kontermatsch || 0;
                
                // Events die Gruppe B EMPFÄNGT (von Gruppe A)
                groupStats[groupB.groupId].eventCounts.matschReceived += groupAEvents.matsch || 0;
                groupStats[groupB.groupId].eventCounts.schneiderReceived += groupAEvents.schneider || 0;
                groupStats[groupB.groupId].eventCounts.kontermatschReceived += groupAEvents.kontermatsch || 0;
              }
            }
            
            // ✅ FIX: 5. WEIS POINTS - konvertiere UIDs zu Player IDs (wiederverwendete Variablen von oben)
            if (game.playerDetails && Array.isArray(game.playerDetails)) {
              for (const playerId of groupAPlayerIds) {
                const playerDetail = game.playerDetails.find(pd => pd.playerId === playerId);
                if (playerDetail && playerDetail.weisPoints) {
                  groupStats[groupA.groupId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
              for (const playerId of groupBPlayerIds) {
                const playerDetail = game.playerDetails.find(pd => pd.playerId === playerId);
                if (playerDetail && playerDetail.weisPoints) {
                  groupStats[groupB.groupId].totalWeisPoints += playerDetail.weisPoints;
                }
              }
            }
            
            // ===== 6. LEGACY SCORE für Ranking =====
            if (rankingModeToStore === 'striche') {
              groupStats[groupA.groupId].score += groupAStriche;
              groupStats[groupB.groupId].score += groupBStriche;
            } else {
              groupStats[groupA.groupId].score += groupAPoints;
              groupStats[groupB.groupId].score += groupBPoints;
            }
          }

          const rankedGroups = Object.values(groupStats)
            .sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score; // Höchster Score zuerst
              if (b.wins !== a.wins) return b.wins - a.wins; // Bei gleichem Score: Mehr Siege zuerst
              return a.gamesPlayed - b.gamesPlayed; // Weniger Spiele gespielt ist besser
            });

          // ✅ SIMPLIFIED: Keine playerComputedStats Updates mehr nötig
          for (let i = 0; i < rankedGroups.length; i++) {
            const group = rankedGroups[i];
            const rank = i + 1;
            for (const playerUid of group.playerUids) {
              // ✅ KORRIGIERT: Konvertiere UID zu Player ID für Stats
              const playerId = uidToPlayerIdMap.get(playerUid);
              if (!playerId) {
                logger.warn(`[finalizeTournament] Could not find Player ID for UID ${playerUid} in groupVsGroup mode`);
                continue;
              }
              
              allRankedPlayerUidsForTournamentDoc.add(playerId);
              const playerRankingDocRef = playerRankingsColRef.doc(playerId);
              
              // ✅ Speichere ERWEITERTE Ranking-Daten für diesen Spieler in der Gruppe
              const rankingData: TournamentPlayerRankingData = {
                  // Identifikation
                  playerId: playerId,
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  tournamentFinalizedAt: admin.firestore.Timestamp.now(),
                  createdAt: admin.firestore.Timestamp.now(),
                  
                  // Ranking
                  rank: rank,
                  totalRankedEntities: rankedGroups.length,
                  rankingSystemUsed: rankingModeToStore,
                  
                  // Team-Info (hier: Gruppe)
                  teamId: group.groupId,
                  teamName: group.groupName,
                  
                  // ✅ SCORES MIT DIFFERENZEN (von der Gruppe)
                  // Punkte
                  pointsScored: group.pointsScored,
                  pointsReceived: group.pointsReceived,
                  pointsDifference: group.pointsScored - group.pointsReceived,
                  totalPoints: group.pointsScored, // Legacy
                  
                  // Striche
                  stricheScored: group.stricheScored,
                  stricheReceived: group.stricheReceived,
                  stricheDifference: group.stricheScored - group.stricheReceived,
                  totalStriche: group.stricheScored, // Legacy
                  
                  score: group.score, // Legacy: Haupt-Score für Ranking
                  
                  // ✅ SPIEL-STATISTIKEN (von der Gruppe)
                  gamesPlayed: group.gamesPlayed,
                  gamesWon: group.wins,
                  gamesLost: group.losses,
                  gamesDraw: group.draws,
                  rawWins: group.wins, // Legacy
                  
                  // ✅ EVENT COUNTS (von der Gruppe)
                  eventCounts: group.eventCounts,
                  
                  // ✅ WEIS-STATISTIKEN (von der Gruppe)
                  totalWeisPoints: group.totalWeisPoints,
                  averageWeisPerGame: group.gamesPlayed > 0 ? group.totalWeisPoints / group.gamesPlayed : 0
              };
              
              logger.info(`[finalizeTournament] Saving groupVsGroup ranking for player ${playerId} (Group: ${group.groupName}, rank ${rank}): ` +
                         `Points ${group.pointsScored}/${group.pointsReceived} (${group.pointsScored - group.pointsReceived}), ` +
                         `Striche ${group.stricheScored}/${group.stricheReceived} (${group.stricheScored - group.stricheReceived})`);
              
              playerRankingBatch.set(playerRankingDocRef, rankingData);

              // ❌ REMOVED: playerComputedStats Transaction (deprecated old collection)
              // ℹ️ Diese Daten werden jetzt durch updatePlayerDataAfterSession + neue Struktur verwaltet
            }
          }
          logger.info(`Player rankings prepared for 'groupVsGroup' tournament ${tournamentId}.`);
          break;
        }
        default: {
          logger.warn(`Unknown or unsupported tournament mode: ${tournamentMode} for tournament ${tournamentId}.`);
          // Hier keinen Batch Commit, da nichts zu speichern ist oder Fehler auftrat
          throw new HttpsError("unimplemented", `Turniermodus '${tournamentMode || 'nicht definiert'}' wird nicht unterstützt.`);
        }
      }

      // Batch für PlayerRankings committen, NACHDEM alle PlayerStats-Transaktionen (potenziell) durchgelaufen sind
      await playerRankingBatch.commit();
      logger.info(`[finalizeTournament] ✅ Player rankings committed for tournament ${tournamentId} (${totalRankedEntitiesForTournamentDoc} entities).`);

      // 🆕 DEBUG: Log vor finalem Update
      logger.info(`[finalizeTournament] 📝 Updating tournament document with final status:`, {
        tournamentId,
        status: 'completed',
        totalRankedEntities: totalRankedEntitiesForTournamentDoc,
        rankingSystemUsed: rankingModeToStore,
        rankedPlayerCount: allRankedPlayerUidsForTournamentDoc.size
      });

      await tournamentRef.update({ 
        status: 'completed', 
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: null,
        totalRankedEntities: totalRankedEntitiesForTournamentDoc,
        rankingSystemUsed: rankingModeToStore,
        rankedPlayerUids: Array.from(allRankedPlayerUidsForTournamentDoc)
      });
      
      logger.info(`[finalizeTournament] ✅ Tournament document updated successfully.`);

      // 🚀 INTELLIGENTE GRUPPENSTATISTIK-AKTUALISIERUNG FÜR ALLE TEILNEHMER-GRUPPEN
      const participantGroups = new Set<string>();
      
      // Sammle alle Gruppen der Turnier-Teilnehmer
      for (const playerUid of participantUidsInTournament) {
        try {
          const playerGroupsSnap = await db.collection('groups')
            .where(`players.${playerUid}`, '!=', null)
            .limit(10) // Begrenze auf 10 Gruppen pro Spieler
            .get();
          
          playerGroupsSnap.docs.forEach(groupDoc => {
            participantGroups.add(groupDoc.id);
          });
        } catch (groupQueryError) {
          logger.warn(`Error querying groups for player ${playerUid}:`, groupQueryError);
        }
      }

      // Aktualisiere Statistiken für alle betroffenen Gruppen
      const groupStatsUpdatePromises = Array.from(participantGroups).map(async (groupId) => {
        try {
          logger.info(`[finalizeTournament] Updating group stats for ${groupId} after tournament completion`);
          
          const groupRef = db.collection('groups').doc(groupId);
          const groupSnapshot = await groupRef.get();
          
          if (groupSnapshot.exists) {
            const groupData = groupSnapshot.data();
            const totalGames = groupData?.totalGames || 0;
            
            if (totalGames < 1000) {
              // Unter 1000 Spiele: Vollständige Neuberechnung
              logger.info(`[finalizeTournament] Group ${groupId} has ${totalGames} games (<1000), triggering full recalculation`);
              
              const groupStatsModule = await import('./groupStatsCalculator');
              await groupStatsModule.updateGroupComputedStatsAfterSession(groupId);
              
              logger.info(`[finalizeTournament] Group stats updated for ${groupId}`);
            } else {
              // Über 1000 Spiele: Markiere für Batch-Verarbeitung
              logger.info(`[finalizeTournament] Group ${groupId} has ${totalGames} games (≥1000), marking for batch update`);
              
              await groupRef.update({
                needsStatsRecalculation: true,
                lastTournamentFinalized: admin.firestore.Timestamp.now()
              });
            }
          }
        } catch (groupStatsError) {
          logger.error(`[finalizeTournament] Error updating group stats for ${groupId}:`, groupStatsError);
          // Fehler bei einzelner Gruppe soll Turnier-Finalisierung nicht blockieren
        }
      });

      // Warte auf alle Gruppen-Updates (parallel)
      await Promise.allSettled(groupStatsUpdatePromises);
      logger.info(`[finalizeTournament] Group stats update completed for ${participantGroups.size} groups`);

      // 🆕 Rating-Historie für Turnier-Ende speichern
      try {
        logger.info(`[finalizeTournament] Saving rating history snapshots for tournament ${tournamentId}`);
        
        // Sammle alle Gruppen der Turnier-Teilnehmer für Rating-Historie
        const groupsToUpdateHistory = new Set<string>();
        
        for (const playerUid of participantUidsInTournament) {
          try {
            const playerGroupsSnap = await db.collection('groups')
              .where(`players.${playerUid}`, '!=', null)
              .limit(5) // Begrenze auf 5 Gruppen pro Spieler für Rating-Historie
              .get();
            
            playerGroupsSnap.docs.forEach(groupDoc => {
              groupsToUpdateHistory.add(groupDoc.id);
            });
          } catch (groupQueryError) {
            logger.warn(`[finalizeTournament] Error querying groups for rating history for player ${playerUid}:`, groupQueryError);
          }
        }

        // Speichere Rating-Historie für jede betroffene Gruppe
        const historyPromises = Array.from(groupsToUpdateHistory).map(async (groupId) => {
          try {
            // Finde Spieler dieser Gruppe, die am Turnier teilgenommen haben
            const groupRef = db.collection('groups').doc(groupId);
            const groupDoc = await groupRef.get();
            
            if (groupDoc.exists) {
              const groupData = groupDoc.data();
              const groupPlayerUids = Object.keys(groupData?.players || {});
              const tournamentParticipantsInGroupUids = groupPlayerUids.filter(uid => 
                participantUidsInTournament.includes(uid)
              );
              // Mappe UIDs -> Player-Doc-IDs für Rating-Historie
              const tournamentParticipantsInGroupPlayerIds = tournamentParticipantsInGroupUids
                .map(uid => uidToPlayerIdMap.get(uid))
                .filter((pid): pid is string => typeof pid === 'string');
              
              // Rating-Historie wird jetzt pro Passe in updateEloForTournament geschrieben
              logger.info(`[finalizeTournament] Rating history wird pro Passe in updateEloForTournament geschrieben für ${tournamentParticipantsInGroupPlayerIds.length} players in group ${groupId}`);
            }
          } catch (historyError) {
            logger.warn(`[finalizeTournament] Error saving rating history for group ${groupId}:`, historyError);
            // Fehler bei Rating-Historie soll Turnier-Finalisierung nicht blockieren
          }
        });

        await Promise.allSettled(historyPromises);
        logger.info(`[finalizeTournament] Rating history snapshots completed for tournament ${tournamentId}`);
      } catch (historyError) {
        logger.warn(`[finalizeTournament] Error during rating history snapshot process for tournament ${tournamentId}:`, historyError);
        // Rating-Historie-Fehler soll Turnier-Finalisierung nicht blockieren
      }

      logger.info(`--- finalizeTournamentInternal SUCCESS for ${tournamentId} ---`);
      return { success: true, message: `Turnier ${tournamentId} erfolgreich abgeschlossen und Rankings gespeichert.` };
    } catch (error) {
      logger.error(`--- finalizeTournamentInternal CRITICAL ERROR for ${tournamentId} --- `, error);
      // Versuche, den Fehler im Turnierdokument zu speichern
      try {
        await db.collection("tournaments").doc(tournamentId).update({ 
            lastError: error instanceof Error ? error.message : String(error),
            status: 'error_finalizing' // Ein spezieller Status für Fehler beim Abschluss
        });
      } catch (dbError) {
        logger.error(`Failed to update tournament doc with error state for ${tournamentId}:`, dbError);
      }

      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", `Ein interner Fehler ist beim Abschluss des Turniers ${tournamentId} aufgetreten.`, { errorDetails: (error as Error).message });
    }
}

/**
 * CALLABLE FUNCTION: Wrapper für finalizeTournamentInternal
 * Kann vom Frontend aufgerufen werden
 */
export const finalizeTournament = onCall<FinalizeTournamentData>(
  {
    region: "europe-west1",
    timeoutSeconds: 540, 
    memory: "1GiB",      
  },
  async (request: CallableRequest<FinalizeTournamentData>) => {
    logger.info("--- finalizeTournament CALLABLE START ---", { data: request.data });

    const { tournamentId } = request.data;

    if (!tournamentId || typeof tournamentId !== 'string') {
      logger.error("Invalid tournamentId received.", { tournamentId });
      throw new HttpsError("invalid-argument", "Turnier-ID fehlt oder ist ungültig.");
    }

    // Rufe interne Funktion auf
    return await finalizeTournamentInternal(tournamentId);
  }
); 