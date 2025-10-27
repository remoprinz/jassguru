#!/usr/bin/env node

/**
 * TOURNAMENT SESSION BACKFILL SCRIPT
 * 
 * Iteriert durch alle Tournament Games und berechnet ALLE fehlenden Metriken
 * für jassGameSummaries Dokumente, analog zu finalizeSession.ts
 * 
 * Fehlende Metriken:
 * - eventCounts (aggregiert aus allen Games)
 * - sessionTotalWeisPoints (aggregiert)
 * - gameResults (alle Spiel-Ergebnisse)
 * - gameWinsByTeam (Siege pro Team)
 * - gameWinsByPlayer (Siege/Niederlagen pro Spieler)
 * - aggregatedTrumpfCountsByPlayer (Trumpf-Statistiken)
 * - aggregatedRoundDurationsByPlayer (Rundenzeiten)
 * - Rosen10player (aus Game 1)
 * - totalRounds (Anzahl aller Runden)
 * - durationSeconds (Turnier-Dauer)
 */

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore(app);

// ===== INTERFACES =====
interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

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

interface TeamScores {
  top: number;
  bottom: number;
}

interface TrumpfCountsByPlayer {
  [playerId: string]: {
    [farbe: string]: number;
  };
}

interface RoundDurationsByPlayer {
  [playerId: string]: {
    totalDuration: number;
    roundCount: number;
    roundDurations: number[];
  };
}

interface TournamentGameData {
  gameId: string;
  passeNumber: number;
  playerDetails: Array<{
    playerId: string;
    playerName: string;
    scoreInPasse: number;
    stricheInPasse: StricheRecord;
    team: 'top' | 'bottom';
    weisInPasse: number;
    seat: number;
  }>;
  teamScoresPasse: TeamScores;
  teamStrichePasse: {
    top: StricheRecord;
    bottom: StricheRecord;
  };
  roundHistory: Array<{
    roundNumber?: number;
    currentPlayer?: number;
    startingPlayer?: number;
    farbe?: string;
    timestamp?: admin.firestore.Timestamp | number;
    strichInfo?: {
      team?: 'top' | 'bottom';
      type?: string;
    };
    wasPaused?: boolean;
  }>;
  roundDurationsByPlayer?: {
    [playerId: string]: number[];
  };
  completedAt?: admin.firestore.Timestamp;
  durationMillis?: number;
  startedAt?: admin.firestore.Timestamp;
}

interface TournamentSummaryData {
  tournamentId: string;
  tournamentName: string;
  groupId: string;
  participantPlayerIds: string[];
  games: TournamentGameData[];
}

// ===== HILFSFUNKTIONEN =====

/**
 * Berechne eventCounts aus roundHistory und finalStriche eines Games
 */
function calculateEventCountsForGame(game: TournamentGameData): EventCounts {
  const bottomEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const topEvents: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };

  // 1. Matsch/Kontermatsch aus roundHistory
  if (game.roundHistory && Array.isArray(game.roundHistory)) {
    game.roundHistory.forEach(round => {
      if (round.strichInfo?.type && round.strichInfo.team) {
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

  // 2. Sieg, Berg, Schneider aus teamStrichePasse
  if (game.teamStrichePasse) {
    if (game.teamStrichePasse.bottom?.sieg > 0) bottomEvents.sieg = 1;
    if (game.teamStrichePasse.top?.sieg > 0) topEvents.sieg = 1;
    if (game.teamStrichePasse.bottom?.berg > 0) bottomEvents.berg = 1;
    if (game.teamStrichePasse.top?.berg > 0) topEvents.berg = 1;
    if (game.teamStrichePasse.bottom?.schneider > 0) bottomEvents.schneider = 1;
    if (game.teamStrichePasse.top?.schneider > 0) topEvents.schneider = 1;
  }

  return { bottom: bottomEvents, top: topEvents };
}

/**
 * Konvertiere Firestore Timestamp zu Millisekunden
 */
function timestampToMillis(timestamp: admin.firestore.Timestamp | number | any): number | undefined {
  if (!timestamp) return undefined;
  
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  
  if (typeof timestamp === 'object' && 'toMillis' in timestamp) {
    return (timestamp as admin.firestore.Timestamp).toMillis();
  }
  
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return (timestamp as any).seconds * 1000 + Math.floor(((timestamp as any).nanoseconds || 0) / 1000000);
  }
  
  return undefined;
}

// ===== HAUPTFUNKTIONEN =====

/**
 * Lade alle Games eines Turniers
 */
async function loadTournamentGames(tournamentId: string): Promise<TournamentGameData[]> {
  console.log(`[tournamentBackfill] Loading games for tournament: ${tournamentId}`);
  
  const gamesRef = db.collection(`tournaments/${tournamentId}/games`);
  const gamesSnapshot = await gamesRef.where('status', '==', 'completed').get();
  
  const games: TournamentGameData[] = [];
  
  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    
    games.push({
      gameId: gameDoc.id,
      passeNumber: gameData.passeNumber || 0,
      playerDetails: gameData.playerDetails || [],
      teamScoresPasse: gameData.teamScoresPasse || { top: 0, bottom: 0 },
      teamStrichePasse: gameData.teamStrichePasse || {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      },
      roundHistory: gameData.roundHistory || [],
      roundDurationsByPlayer: gameData.roundDurationsByPlayer,
      completedAt: gameData.completedAt,
      durationMillis: gameData.durationMillis,
      startedAt: gameData.startedAt
    });
  }
  
  // Sortiere nach passeNumber
  games.sort((a, b) => (a.passeNumber || 0) - (b.passeNumber || 0));
  
  console.log(`[tournamentBackfill] Loaded ${games.length} games`);
  return games;
}

/**
 * Berechne ALLE fehlenden Metriken für ein Turnier
 */
async function calculateTournamentMetrics(tournamentData: TournamentSummaryData): Promise<any> {
  const { games, participantPlayerIds } = tournamentData;
  
  console.log(`[tournamentBackfill] Calculating metrics for ${games.length} games with ${participantPlayerIds.length} players`);
  
  // Initialisiere Aggregate
  const totalEventCountsTop: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const totalEventCountsBottom: EventCountRecord = { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 };
  const sessionTotalWeisPoints: TeamScores = { top: 0, bottom: 0 };
  const gameResults: Array<{
    gameNumber: number;
    winnerTeam: 'top' | 'bottom';
    topScore: number;
    bottomScore: number;
  }> = [];
  const gameWinsByTeam = { top: 0, bottom: 0 };
  const gameWinsByPlayer: { [playerId: string]: { wins: number; losses: number } } = {};
  const aggregatedTrumpfCounts: TrumpfCountsByPlayer = {};
  const aggregatedRoundDurations: RoundDurationsByPlayer = {};
  
  let totalRounds = 0;
  let totalDurationMillis = 0;
  let Rosen10player: string | null = null;
  let tournamentStartedAt: admin.firestore.Timestamp | undefined;
  let tournamentCompletedAt: admin.firestore.Timestamp | undefined;
  
  // Initialisiere Spieler-Statistiken
  participantPlayerIds.forEach(playerId => {
    gameWinsByPlayer[playerId] = { wins: 0, losses: 0 };
    aggregatedRoundDurations[playerId] = {
      totalDuration: 0,
      roundCount: 0,
      roundDurations: []
    };
  });
  
  // Erstelle Player-Mapping (seat -> playerId)
  const seatToPlayerIdMap = new Map<number, string>();
  if (games.length > 0 && games[0].playerDetails) {
    games[0].playerDetails.forEach(player => {
      seatToPlayerIdMap.set(player.seat, player.playerId);
    });
  }
  
  // Iteriere durch alle Games
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex];
    
    // ===== 1. EVENT COUNTS =====
    const gameEventCounts = calculateEventCountsForGame(game);
    totalEventCountsTop.sieg += gameEventCounts.top.sieg;
    totalEventCountsTop.berg += gameEventCounts.top.berg;
    totalEventCountsTop.matsch += gameEventCounts.top.matsch;
    totalEventCountsTop.kontermatsch += gameEventCounts.top.kontermatsch;
    totalEventCountsTop.schneider += gameEventCounts.top.schneider;
    
    totalEventCountsBottom.sieg += gameEventCounts.bottom.sieg;
    totalEventCountsBottom.berg += gameEventCounts.bottom.berg;
    totalEventCountsBottom.matsch += gameEventCounts.bottom.matsch;
    totalEventCountsBottom.kontermatsch += gameEventCounts.bottom.kontermatsch;
    totalEventCountsBottom.schneider += gameEventCounts.bottom.schneider;
    
    // ===== 2. WEIS POINTS =====
    if (game.playerDetails) {
      game.playerDetails.forEach(player => {
        if (player.team === 'top') {
          sessionTotalWeisPoints.top += player.weisInPasse || 0;
        } else if (player.team === 'bottom') {
          sessionTotalWeisPoints.bottom += player.weisInPasse || 0;
        }
      });
    }
    
    // ===== 3. GAME RESULTS & WINS =====
    const topScore = game.teamScoresPasse.top || 0;
    const bottomScore = game.teamScoresPasse.bottom || 0;
    let winnerTeam: 'top' | 'bottom';
    
    if (topScore > bottomScore) {
      winnerTeam = 'top';
      gameWinsByTeam.top++;
    } else {
      winnerTeam = 'bottom';
      gameWinsByTeam.bottom++;
    }
    
    gameResults.push({
      gameNumber: game.passeNumber || (gameIndex + 1),
      winnerTeam,
      topScore,
      bottomScore
    });
    
    // Aktualisiere Spieler-Wins/Losses
    if (game.playerDetails) {
      game.playerDetails.forEach(player => {
        if (!gameWinsByPlayer[player.playerId]) {
          gameWinsByPlayer[player.playerId] = { wins: 0, losses: 0 };
        }
        
        if (player.team === winnerTeam) {
          gameWinsByPlayer[player.playerId].wins++;
        } else {
          gameWinsByPlayer[player.playerId].losses++;
        }
      });
    }
    
    // ===== 4. TRUMPF & RUNDENZEITEN =====
    if (game.roundHistory && Array.isArray(game.roundHistory)) {
      totalRounds += game.roundHistory.length;
      
      game.roundHistory.forEach((round, roundIndex) => {
        // Trumpf-Aggregation (startingPlayer sagt Trumpf an)
        if (round.startingPlayer && round.farbe) {
          const trumpfPlayerId = seatToPlayerIdMap.get(round.startingPlayer);
          if (trumpfPlayerId) {
            if (!aggregatedTrumpfCounts[trumpfPlayerId]) {
              aggregatedTrumpfCounts[trumpfPlayerId] = {};
            }
            const farbeKey = round.farbe.toLowerCase();
            aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] = (aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] || 0) + 1;
          }
        }
        
        // Rundenzeiten-Aggregation
        if (round.currentPlayer) {
          const roundPlayerId = seatToPlayerIdMap.get(round.currentPlayer);
          if (roundPlayerId) {
            let roundDuration = 0;
            
            // Berechne Dauer aus aufeinanderfolgenden timestamps
            const currentTimestamp = timestampToMillis(round.timestamp);
            
            if (currentTimestamp) {
              let previousTimestamp: number | undefined;
              
              if (roundIndex > 0) {
                const previousRound = game.roundHistory[roundIndex - 1];
                previousTimestamp = timestampToMillis(previousRound.timestamp);
              } else {
                // Erste Runde: Verwende Game-Start
                const gameStartMs = timestampToMillis(game.startedAt);
                const gameCompletionMs = timestampToMillis(game.completedAt);
                
                if (gameStartMs) {
                  previousTimestamp = gameStartMs;
                } else if (gameCompletionMs && game.durationMillis) {
                  previousTimestamp = gameCompletionMs - game.durationMillis;
                }
              }
              
              if (previousTimestamp && currentTimestamp > previousTimestamp) {
                roundDuration = currentTimestamp - previousTimestamp;
              }
            }
            
            // Füge Rundendauer hinzu (mit Filter)
            if (roundDuration >= 60000 && roundDuration < 720000 && !round.wasPaused) {
              aggregatedRoundDurations[roundPlayerId].totalDuration += roundDuration;
              aggregatedRoundDurations[roundPlayerId].roundCount += 1;
              aggregatedRoundDurations[roundPlayerId].roundDurations.push(roundDuration);
            }
          }
        }
      });
    }
    
    // ===== 5. DAUER =====
    if (game.durationMillis) {
      totalDurationMillis += game.durationMillis;
    }
    
    // ===== 6. TIMESTAMPS =====
    if (gameIndex === 0 && game.startedAt) {
      tournamentStartedAt = game.startedAt;
    }
    if (gameIndex === games.length - 1 && game.completedAt) {
      tournamentCompletedAt = game.completedAt;
    }
    
    // ===== 7. ROSEN10PLAYER (aus Game 1) =====
    if (gameIndex === 0 && game.roundHistory && game.roundHistory.length > 0) {
      const firstRound = game.roundHistory[0];
      if (firstRound.startingPlayer) {
        Rosen10player = seatToPlayerIdMap.get(firstRound.startingPlayer) || null;
        console.log(`[tournamentBackfill] Rosen10player: ${Rosen10player} (seat ${firstRound.startingPlayer})`);
      }
    }
  }
  
  // Berechne Dauer in Sekunden
  const durationSeconds = Math.round(totalDurationMillis / 1000);
  
  console.log(`[tournamentBackfill] Calculated metrics:`);
  console.log(`  - Total rounds: ${totalRounds}`);
  console.log(`  - Total duration: ${durationSeconds}s`);
  console.log(`  - Game wins: Top ${gameWinsByTeam.top}, Bottom ${gameWinsByTeam.bottom}`);
  console.log(`  - Weis points: Top ${sessionTotalWeisPoints.top}, Bottom ${sessionTotalWeisPoints.bottom}`);
  console.log(`  - Rosen10player: ${Rosen10player}`);
  
  return {
    eventCounts: { top: totalEventCountsTop, bottom: totalEventCountsBottom },
    sessionTotalWeisPoints,
    gameResults,
    gameWinsByTeam,
    gameWinsByPlayer,
    aggregatedTrumpfCountsByPlayer: Object.keys(aggregatedTrumpfCounts).length > 0 ? aggregatedTrumpfCounts : undefined,
    aggregatedRoundDurationsByPlayer: Object.keys(aggregatedRoundDurations).length > 0 ? aggregatedRoundDurations : undefined,
    Rosen10player,
    totalRounds,
    durationSeconds,
    startedAt: tournamentStartedAt,
    endedAt: tournamentCompletedAt
  };
}

/**
 * Backfill ein einzelnes Turnier
 */
async function backfillTournament(tournamentId: string): Promise<void> {
  console.log(`\n[tournamentBackfill] ===== Starting backfill for tournament: ${tournamentId} =====`);
  
  // Lade Tournament-Dokument
  const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
  if (!tournamentDoc.exists) {
    console.log(`[tournamentBackfill] ❌ Tournament ${tournamentId} not found`);
    return;
  }
  
  const tournamentData = tournamentDoc.data()!;
  const groupId = tournamentData.groupId;
  
  if (!groupId) {
    console.log(`[tournamentBackfill] ⚠️ Tournament ${tournamentId} has no groupId - skipping (neutral tournament)`);
    return;
  }
  
  const tournamentName = tournamentData.name || 'Unbenanntes Turnier';
  const participantPlayerIds = tournamentData.rankedPlayerUids || [];
  
  if (participantPlayerIds.length === 0) {
    console.log(`[tournamentBackfill] ⚠️ Tournament ${tournamentId} has no ranked player IDs - skipping`);
    return;
  }
  
  console.log(`[tournamentBackfill] Tournament: ${tournamentName}, Group: ${groupId}, Players: ${participantPlayerIds.length}`);
  
  // Lade alle Games
  const games = await loadTournamentGames(tournamentId);
  
  if (games.length === 0) {
    console.log(`[tournamentBackfill] ⚠️ No completed games found for tournament ${tournamentId}`);
    return;
  }
  
  // Berechne alle Metriken
  const metrics = await calculateTournamentMetrics({
    tournamentId,
    tournamentName,
    groupId,
    participantPlayerIds,
    games
  });
  
  // Finde das jassGameSummaries Dokument für dieses Turnier
  const summariesRef = db.collection(`groups/${groupId}/jassGameSummaries`);
  const summaryQuery = summariesRef.where('tournamentId', '==', tournamentId).limit(1);
  const summarySnapshot = await summaryQuery.get();
  
  if (summarySnapshot.empty) {
    console.log(`[tournamentBackfill] ⚠️ No jassGameSummaries document found for tournament ${tournamentId} in group ${groupId}`);
    return;
  }
  
  const summaryDoc = summarySnapshot.docs[0];
  const summaryId = summaryDoc.id;
  
  console.log(`[tournamentBackfill] Found summary document: ${summaryId}`);
  
  // Bereite Update-Daten vor
  const updateData: any = {
    // Neue Felder
    eventCounts: metrics.eventCounts,
    sessionTotalWeisPoints: metrics.sessionTotalWeisPoints,
    gameResults: metrics.gameResults,
    gameWinsByTeam: metrics.gameWinsByTeam,
    gameWinsByPlayer: metrics.gameWinsByPlayer,
    totalRounds: metrics.totalRounds,
    durationSeconds: metrics.durationSeconds,
    gamesPlayed: games.length,
    
    // Update Timestamps falls vorhanden
    ...(metrics.startedAt && { startedAt: metrics.startedAt }),
    ...(metrics.endedAt && { endedAt: metrics.endedAt }),
    
    // Optionale Felder
    ...(metrics.Rosen10player && { Rosen10player: metrics.Rosen10player }),
    ...(metrics.aggregatedTrumpfCountsByPlayer && { aggregatedTrumpfCountsByPlayer: metrics.aggregatedTrumpfCountsByPlayer }),
    ...(metrics.aggregatedRoundDurationsByPlayer && { aggregatedRoundDurationsByPlayer: metrics.aggregatedRoundDurationsByPlayer }),
    
    // Backfill Metadata
    _backfilled: true,
    _backfilledAt: admin.firestore.Timestamp.now()
  };
  
  // Schreibe Updates
  await summariesRef.doc(summaryId).update(updateData);
  
  console.log(`[tournamentBackfill] ✅ Successfully backfilled tournament ${tournamentId} (${tournamentName})`);
  console.log(`[tournamentBackfill]   - Document: groups/${groupId}/jassGameSummaries/${summaryId}`);
  console.log(`[tournamentBackfill]   - Games: ${games.length}, Rounds: ${metrics.totalRounds}, Duration: ${metrics.durationSeconds}s`);
}

/**
 * Backfill alle Turniere
 */
async function backfillAllTournaments(): Promise<void> {
  console.log(`[tournamentBackfill] Starting backfill for ALL tournaments`);
  
  const tournamentsSnapshot = await db.collection('tournaments').get();
  console.log(`[tournamentBackfill] Found ${tournamentsSnapshot.size} tournaments`);
  
  let successCount = 0;
  const skipCount = 0;
  let errorCount = 0;
  
  for (const tournamentDoc of tournamentsSnapshot.docs) {
    try {
      await backfillTournament(tournamentDoc.id);
      successCount++;
    } catch (error) {
      console.error(`[tournamentBackfill] ❌ Error backfilling tournament ${tournamentDoc.id}:`, error);
      errorCount++;
    }
  }
  
  console.log(`\n[tournamentBackfill] 🎉 Backfill completed!`);
  console.log(`[tournamentBackfill]   - Success: ${successCount}`);
  console.log(`[tournamentBackfill]   - Skipped: ${skipCount}`);
  console.log(`[tournamentBackfill]   - Errors: ${errorCount}`);
}

// ===== CLI INTERFACE =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`[tournamentBackfill] Starting CLI execution for all tournaments`);
    await backfillAllTournaments();
  } else if (args.length === 1) {
    const tournamentId = args[0];
    console.log(`[tournamentBackfill] Starting CLI execution for tournament: ${tournamentId}`);
    await backfillTournament(tournamentId);
  } else {
    console.error(`[tournamentBackfill] Usage: node tournamentSessionBackfill.js [tournamentId]`);
    process.exit(1);
  }
  
  console.log(`[tournamentBackfill] ✅ CLI execution completed successfully`);
  process.exit(0);
}

// Script ausführen
if (require.main === module) {
  main().catch(error => {
    console.error(`[tournamentBackfill] Fatal error:`, error);
    process.exit(1);
  });
}

export { backfillTournament, backfillAllTournaments };

