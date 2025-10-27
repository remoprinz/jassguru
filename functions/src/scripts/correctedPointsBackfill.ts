#!/usr/bin/env node

/**
 * CORRECTED POINTS CHART BACKFILL SCRIPT
 * 
 * Verwendet die exakte gleiche Logik wie das Debug-Script
 * um korrekte Punktedifferenz-Berechnung zu gewährleisten
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
interface PlayerHistory {
  playerId: string;
  displayName: string;
  data: (number | null)[];
}

interface ChartDataset {
  label: string;
  data: (number | null)[];
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
  lastUpdated: admin.firestore.Timestamp;
  totalSessions: number;
  totalPlayers: number;
}

interface SessionResult {
  sessionId: string;
  date: string;
  playerDeltas: Map<string, number>;
  playerNames: Map<string, string>;
}

// ===== HILFSFUNKTIONEN =====
function formatDate(timestamp: admin.firestore.Timestamp): string {
  const date = timestamp.toDate();
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${day}.${month}.${year}`;
}

// (Keine Hilfsfunktionen mehr benötigt)

// ===== HAUPTFUNKTIONEN =====
async function extractPlayerPointsFromSession(sessionDoc: admin.firestore.DocumentSnapshot): Promise<SessionResult | null> {
  const data = sessionDoc.data();
  if (!data) return null;

  const sessionId = sessionDoc.id;
  
  // ❌ NEUTRALE TURNIERE AUSSCHLIESSEN
  if (data.isTournamentSession && !data.groupId && !data.tournamentId) {
    console.log(`[correctedPointsBackfill] Skipping neutral tournament: ${sessionId}`);
    return null;
  }

  const playerDeltas = new Map<string, number>();
  const playerNames = new Map<string, string>();

  // ✅ Fall 1: Normale Sessions (finalScores vorhanden)
  if (!data.isTournamentSession && data.finalScores && data.teams) {
    console.log(`[correctedPointsBackfill] Processing normal session: ${sessionId}`);
    
    const topTeam = Array.isArray(data.teams.top) ? data.teams.top : (data.teams.top?.players || []);
    const bottomTeam = Array.isArray(data.teams.bottom) ? data.teams.bottom : (data.teams.bottom?.players || []);
    
    const teamPointsdifferenz = data.finalScores.top - data.finalScores.bottom;

    // Top-Team: Positive Differenz (gewonnen)
    topTeam.forEach((player: any) => {
      if (player.playerId && player.displayName) {
        playerDeltas.set(player.playerId, teamPointsdifferenz);
        playerNames.set(player.playerId, player.displayName);
      }
    });

    // Bottom-Team: Negative Differenz (verloren)
    bottomTeam.forEach((player: any) => {
      if (player.playerId && player.displayName) {
        playerDeltas.set(player.playerId, -teamPointsdifferenz);
        playerNames.set(player.playerId, player.displayName);
      }
    });
  } else if (data.isTournamentSession && data.playerDetails && data.playerDetails.length > 0) {
    // ✅ Fall 2: Gruppenspezifische Turniere (playerDetails vorhanden)
    console.log(`[correctedPointsBackfill] Processing group tournament with playerDetails: ${sessionId}`);
    
    data.playerDetails.forEach((player: any) => {
      if (player.playerId && player.displayName) {
        playerDeltas.set(player.playerId, player.pointsDifference);
        playerNames.set(player.playerId, player.displayName);
      }
    });
  } else if (data.isTournamentSession && data.gameResults && (!data.playerDetails || data.playerDetails.length === 0)) {
    // ✅ Fall 3: Alte Turniere (gameResults vorhanden, aber keine playerDetails)
    console.log(`[correctedPointsBackfill] Processing old tournament with gameResults: ${sessionId}`);
    
    const playerPointsMap = new Map<string, { scored: number; received: number; name: string }>();
    
    for (const game of data.gameResults) {
      if (game.teams && game.finalScores) {
        const topTeam = Array.isArray(game.teams.top) ? game.teams.top : (game.teams.top?.players || []);
        const bottomTeam = Array.isArray(game.teams.bottom) ? game.teams.bottom : (game.teams.bottom?.players || []);
        
        // Top-Team
        topTeam.forEach((player: any) => {
          if (player.playerId && player.displayName) {
            if (!playerPointsMap.has(player.playerId)) {
              playerPointsMap.set(player.playerId, { scored: 0, received: 0, name: player.displayName });
            }
            const playerData = playerPointsMap.get(player.playerId)!;
            playerData.scored += game.finalScores.top;
            playerData.received += game.finalScores.bottom;
          }
        });
        
        // Bottom-Team
        bottomTeam.forEach((player: any) => {
          if (player.playerId && player.displayName) {
            if (!playerPointsMap.has(player.playerId)) {
              playerPointsMap.set(player.playerId, { scored: 0, received: 0, name: player.displayName });
            }
            const playerData = playerPointsMap.get(player.playerId)!;
            playerData.scored += game.finalScores.bottom;
            playerData.received += game.finalScores.top;
          }
        });
      }
    }
    
    // Berechne Differenzen
    playerPointsMap.forEach((playerData, playerId) => {
      const diff = playerData.scored - playerData.received;
      playerDeltas.set(playerId, diff);
      playerNames.set(playerId, playerData.name);
    });
  }

  if (playerDeltas.size === 0) {
    console.log(`[correctedPointsBackfill] No valid data found for session: ${sessionId}`);
    return null;
  }

  const date = data.completedAt ? formatDate(data.completedAt) : 'Unknown';
  
  return {
    sessionId,
    date,
    playerDeltas,
    playerNames
  };
}

async function createCorrectedPointsChartData(groupId: string): Promise<void> {
  console.log(`[correctedPointsBackfill] Creating corrected points chart data for group: ${groupId}`);
  
  // Lade alle Sessions
  const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
  const sessionsQuery = sessionsRef
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc');
  
  const sessionsSnapshot = await sessionsQuery.get();
  console.log(`[correctedPointsBackfill] Found ${sessionsSnapshot.size} completed sessions for group: ${groupId}`);
  
  // Verarbeite jede Session
  const sessionResults: SessionResult[] = [];
  
  for (const sessionDoc of sessionsSnapshot.docs) {
    const sessionResult = await extractPlayerPointsFromSession(sessionDoc);
    if (sessionResult) {
      sessionResults.push(sessionResult);
    }
  }
  
  console.log(`[correctedPointsBackfill] Processed ${sessionResults.length} sessions with valid points data`);
  
  // Sammle alle Spieler-IDs
  const allPlayerIds = new Set<string>();
  const playerDisplayNames = new Map<string, string>();
  
  sessionResults.forEach(session => {
    session.playerDeltas.forEach((_, playerId) => {
      allPlayerIds.add(playerId);
    });
    session.playerNames.forEach((name, playerId) => {
      playerDisplayNames.set(playerId, name);
    });
  });
  
  console.log(`[correctedPointsBackfill] Found ${allPlayerIds.size} unique players`);
  
  // Erstelle Player-Histories mit kumulativen Deltas
  const playerHistories = new Map<string, PlayerHistory>();
  
  allPlayerIds.forEach(playerId => {
    const displayName = playerDisplayNames.get(playerId) || playerId;
    playerHistories.set(playerId, {
      playerId,
      displayName,
      data: []
    });
  });
  
  // Berechne kumulative Deltas Session-für-Session
  const cumulativeDeltas = new Map<string, number>();
  
  sessionResults.forEach(session => {
    // Aktualisiere kumulative Deltas für alle Spieler
    allPlayerIds.forEach(playerId => {
      const currentCumulative = cumulativeDeltas.get(playerId) || 0;
      const sessionDelta = session.playerDeltas.get(playerId) || 0;
      const newCumulative = currentCumulative + sessionDelta;
      
      cumulativeDeltas.set(playerId, newCumulative);
      
      const playerHistory = playerHistories.get(playerId)!;
      if (session.playerDeltas.has(playerId)) {
        // Spieler war in dieser Session → Füge kumulative Punktedifferenz hinzu
        playerHistory.data.push(newCumulative);
      } else {
        // Spieler war nicht in dieser Session → Füge null hinzu
        playerHistory.data.push(null);
      }
    });
  });
  
  // Erstelle Labels (Datum-Format)
  const labels = sessionResults.map(session => session.date);
  
  // Erstelle Datasets für Chart
  const datasets: ChartDataset[] = [];
  
  playerHistories.forEach(playerHistory => {
    // Filtere Spieler mit mindestens 2 Datenpunkten
    const validDataPoints = playerHistory.data.filter(value => value !== null);
    if (validDataPoints.length >= 2) {
      datasets.push({
        label: playerHistory.displayName,
        data: playerHistory.data
      });
    }
  });

  const chartData: ChartData = {
    labels,
    datasets,
    lastUpdated: admin.firestore.Timestamp.now(),
    totalSessions: sessionResults.length,
    totalPlayers: datasets.length
  };

  // Speichere korrigierte Chart-Daten
  await db.collection(`groups/${groupId}/aggregated`).doc('chartData_points').set(chartData);
  
  console.log(`[correctedPointsBackfill] Created chart data with ${datasets.length} players and ${sessionResults.length} sessions`);
  
  // Debug: Zeige Remo's Daten
  const remoDataset = datasets.find(dataset => dataset.label === 'Remo');
  if (remoDataset) {
    console.log(`[correctedPointsBackfill] === REMO DEBUG ===`);
    console.log(`[correctedPointsBackfill] Data points: ${remoDataset.data.length}`);
    console.log(`[correctedPointsBackfill] First 5: ${remoDataset.data.slice(0, 5).join(', ')}`);
    console.log(`[correctedPointsBackfill] Last 5: ${remoDataset.data.slice(-5).join(', ')}`);
    console.log(`[correctedPointsBackfill] Final value: ${remoDataset.data[remoDataset.data.length - 1]}`);
  }
}

// ===== CLI INTERFACE =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`[correctedPointsBackfill] Starting CLI execution for all groups`);
    // TODO: Implement all groups logic
  } else if (args.length === 1) {
    const groupId = args[0];
    console.log(`[correctedPointsBackfill] Starting CLI execution for group: ${groupId}`);
    await createCorrectedPointsChartData(groupId);
  } else {
    console.error(`[correctedPointsBackfill] Usage: node correctedPointsBackfill.js [groupId]`);
    process.exit(1);
  }
  
  console.log(`[correctedPointsBackfill] ✅ CLI execution completed successfully`);
  process.exit(0);
}

// Script ausführen
if (require.main === module) {
  main().catch(error => {
    console.error(`[correctedPointsBackfill] Fatal error: ${error}`);
    process.exit(1);
  });
}

export { createCorrectedPointsChartData };
