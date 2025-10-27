#!/usr/bin/env node

/**
 * REMO DEBUG SCRIPT - PUNKTEDIFFERENZ BERECHNUNG
 * 
 * Berechnet die korrekte Punktedifferenz für Remo Session-für-Session
 * und zeigt die Delta-Berechnung detailliert an.
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
interface RemoSessionResult {
  sessionId: string;
  date: string;
  remoTeam: 'top' | 'bottom';
  teamScore: number;
  opponentScore: number;
  sessionDelta: number;
  cumulativeDelta: number;
  details: string;
}

// ===== HILFSFUNKTIONEN =====
function formatDate(timestamp: admin.firestore.Timestamp): string {
  const date = timestamp.toDate();
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${day}.${month}.${year}`;
}

function findRemoInTeam(team: any[]): boolean {
  return team.some(player => 
    player.playerId === 'b16c1120111b7d9e7d733837' || 
    player.displayName === 'Remo'
  );
}

// ===== HAUPTFUNKTIONEN =====
async function extractRemoPointsFromSession(sessionDoc: admin.firestore.DocumentSnapshot): Promise<RemoSessionResult | null> {
  const data = sessionDoc.data();
  if (!data) return null;

  const sessionId = sessionDoc.id;
  
  // ❌ NEUTRALE TURNIERE AUSSCHLIESSEN
  if (data.isTournamentSession && !data.groupId && !data.tournamentId) {
    console.log(`[remoDebug] Skipping neutral tournament: ${sessionId}`);
    return null;
  }

  // ✅ Fall 1: Normale Sessions (finalScores vorhanden)
  if (!data.isTournamentSession && data.finalScores && data.teams) {
    console.log(`[remoDebug] Processing normal session: ${sessionId}`);
    
    const topTeam = Array.isArray(data.teams.top) ? data.teams.top : (data.teams.top?.players || []);
    const bottomTeam = Array.isArray(data.teams.bottom) ? data.teams.bottom : (data.teams.bottom?.players || []);
    
    const remoInTop = findRemoInTeam(topTeam);
    const remoInBottom = findRemoInTeam(bottomTeam);
    
    if (!remoInTop && !remoInBottom) {
      console.log(`[remoDebug] Remo not found in teams for session: ${sessionId}`);
      return null;
    }
    
    const remoTeam = remoInTop ? 'top' : 'bottom';
    const teamScore = data.finalScores[remoTeam];
    const opponentScore = data.finalScores[remoTeam === 'top' ? 'bottom' : 'top'];
    const sessionDelta = teamScore - opponentScore;
    
    const date = data.completedAt ? formatDate(data.completedAt) : 'Unknown';
    
    return {
      sessionId,
      date,
      remoTeam,
      teamScore,
      opponentScore,
      sessionDelta,
      cumulativeDelta: 0, // Wird später berechnet
      details: `Normal session - Remo in ${remoTeam} team (${teamScore} vs ${opponentScore})`
    };
  }

  // ✅ Fall 2: Gruppenspezifische Turniere (playerDetails vorhanden)
  if (data.isTournamentSession && data.playerDetails && data.playerDetails.length > 0) {
    console.log(`[remoDebug] Processing group tournament with playerDetails: ${sessionId}`);
    
    const remoPlayer = data.playerDetails.find((player: any) => 
      player.playerId === 'b16c1120111b7d9e7d733837' || 
      player.displayName === 'Remo'
    );
    
    if (!remoPlayer) {
      console.log(`[remoDebug] Remo not found in playerDetails for tournament: ${sessionId}`);
      return null;
    }
    
    const sessionDelta = remoPlayer.pointsDifference;
    const date = data.completedAt ? formatDate(data.completedAt) : 'Unknown';
    
    return {
      sessionId,
      date,
      remoTeam: sessionDelta >= 0 ? 'top' : 'bottom',
      teamScore: remoPlayer.pointsScored,
      opponentScore: remoPlayer.pointsReceived,
      sessionDelta,
      cumulativeDelta: 0, // Wird später berechnet
      details: `Tournament - Remo scored ${remoPlayer.pointsScored}, received ${remoPlayer.pointsReceived}`
    };
  }

  // ✅ Fall 3: Alte Turniere (gameResults vorhanden, aber keine playerDetails)
  if (data.isTournamentSession && data.gameResults && (!data.playerDetails || data.playerDetails.length === 0)) {
    console.log(`[remoDebug] Processing old tournament with gameResults: ${sessionId}`);
    
    let remoPointsScored = 0;
    let remoPointsReceived = 0;
    
    for (const game of data.gameResults) {
      if (game.teams && game.finalScores) {
        const topTeam = Array.isArray(game.teams.top) ? game.teams.top : (game.teams.top?.players || []);
        const bottomTeam = Array.isArray(game.teams.bottom) ? game.teams.bottom : (game.teams.bottom?.players || []);
        
        const remoInTop = findRemoInTeam(topTeam);
        const remoInBottom = findRemoInTeam(bottomTeam);
        
        if (remoInTop) {
          remoPointsScored += game.finalScores.top;
          remoPointsReceived += game.finalScores.bottom;
        } else if (remoInBottom) {
          remoPointsScored += game.finalScores.bottom;
          remoPointsReceived += game.finalScores.top;
        }
      }
    }
    
    const sessionDelta = remoPointsScored - remoPointsReceived;
    const date = data.completedAt ? formatDate(data.completedAt) : 'Unknown';
    
    return {
      sessionId,
      date,
      remoTeam: sessionDelta >= 0 ? 'top' : 'bottom',
      teamScore: remoPointsScored,
      opponentScore: remoPointsReceived,
      sessionDelta,
      cumulativeDelta: 0, // Wird später berechnet
      details: `Old tournament - Remo scored ${remoPointsScored}, received ${remoPointsReceived}`
    };
  }

  console.log(`[remoDebug] No valid data found for session: ${sessionId}`);
  return null;
}

async function debugRemoPoints(groupId: string): Promise<void> {
  console.log(`[remoDebug] Starting Remo points debug for group: ${groupId}`);
  
  // Lade alle Sessions
  const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
  const sessionsQuery = sessionsRef
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc');
  
  const sessionsSnapshot = await sessionsQuery.get();
  console.log(`[remoDebug] Found ${sessionsSnapshot.size} completed sessions`);
  
  // Verarbeite jede Session
  const remoSessions: RemoSessionResult[] = [];
  
  for (const sessionDoc of sessionsSnapshot.docs) {
    const remoResult = await extractRemoPointsFromSession(sessionDoc);
    if (remoResult) {
      remoSessions.push(remoResult);
    }
  }
  
  console.log(`[remoDebug] Found ${remoSessions.length} sessions with Remo data`);
  
  // Berechne kumulative Deltas
  let cumulativeDelta = 0;
  for (let i = 0; i < remoSessions.length; i++) {
    cumulativeDelta += remoSessions[i].sessionDelta;
    remoSessions[i].cumulativeDelta = cumulativeDelta;
  }
  
  // Zeige detaillierte Ergebnisse
  console.log(`\n[remoDebug] === REMO PUNKTEDIFFERENZ VERLAUF ===`);
  console.log(`[remoDebug] Session | Datum    | Team | Score | Opponent | Delta | Kumulativ | Details`);
  console.log(`[remoDebug] --------|----------|------|-------|----------|-------|-----------|--------`);
  
  for (const session of remoSessions) {
    const sessionShort = session.sessionId.substring(0, 8);
    const teamIcon = session.remoTeam === 'top' ? '🔵' : '🔴';
    const deltaSign = session.sessionDelta >= 0 ? '+' : '';
    const cumulSign = session.cumulativeDelta >= 0 ? '+' : '';
    
    console.log(`[remoDebug] ${sessionShort.padEnd(8)} | ${session.date.padEnd(8)} | ${teamIcon} ${session.remoTeam.padEnd(3)} | ${session.teamScore.toString().padEnd(5)} | ${session.opponentScore.toString().padEnd(8)} | ${deltaSign}${session.sessionDelta.toString().padEnd(5)} | ${cumulSign}${session.cumulativeDelta.toString().padEnd(9)} | ${session.details}`);
  }
  
  console.log(`\n[remoDebug] === ZUSAMMENFASSUNG ===`);
  console.log(`[remoDebug] Total Sessions: ${remoSessions.length}`);
  console.log(`[remoDebug] Final Cumulative Delta: ${remoSessions[remoSessions.length - 1]?.cumulativeDelta || 0}`);
  console.log(`[remoDebug] Sessions mit Remo: ${remoSessions.length}`);
  
  // Zeige die letzten 5 Sessions
  console.log(`\n[remoDebug] === LETZTE 5 SESSIONS ===`);
  const lastSessions = remoSessions.slice(-5);
  for (const session of lastSessions) {
    const sessionShort = session.sessionId.substring(0, 8);
    const deltaSign = session.sessionDelta >= 0 ? '+' : '';
    const cumulSign = session.cumulativeDelta >= 0 ? '+' : '';
    console.log(`[remoDebug] ${sessionShort}: ${deltaSign}${session.sessionDelta} → ${cumulSign}${session.cumulativeDelta}`);
  }
}

// ===== CLI INTERFACE =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error(`[remoDebug] Usage: node remoDebug.js <groupId>`);
    process.exit(1);
  }
  
  const groupId = args[0];
  console.log(`[remoDebug] Starting CLI execution for group: ${groupId}`);
  
  try {
    await debugRemoPoints(groupId);
    console.log(`[remoDebug] ✅ CLI execution completed successfully`);
  } catch (error) {
    console.error(`[remoDebug] Fatal error: ${error}`);
    process.exit(1);
  }
  
  process.exit(0);
}

// Script ausführen
if (require.main === module) {
  main();
}

export { debugRemoPoints };
