#!/usr/bin/env node

/**
 * 📊 RESTORE globalStats.current
 * 
 * Stellt globalStats.current für alle Spieler wieder her:
 * - sessionsWon, sessionsLost, sessionsDraw
 * - gamesWon, gamesLost
 * - trumpfStatistik
 * 
 * Verwendet jassGameSummaries als einzige Datenquelle.
 */

import * as admin from 'firebase-admin';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

const program = new Command();
program
  .option('--player-id <id>', 'Specific player ID to restore (optional)')
  .option('--dry-run', 'Dry run mode - no actual writes')
  .option('--confirm', 'Confirm actual execution')
  .parse(process.argv);

const options = program.opts();
const targetPlayerId = options.playerId;
const isDryRun = options.dryRun;
const isConfirmed = options.confirm;

interface JassGameSummary {
  sessionId?: string;
  participantPlayerIds: string[];
  gamesPlayed: number;
  teams?: {
    top: { players: Array<{ playerId: string; displayName: string }> };
    bottom: { players: Array<{ playerId: string; displayName: string }> };
  };
  finalScores?: { top: number; bottom: number };
  gameWinsByPlayer?: Record<string, { wins: number; losses: number; draws?: number }>;
  aggregatedTrumpfCountsByPlayer?: Record<string, Record<string, number>>;
  winnerTeamKey?: string;
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  isTournamentSession?: boolean;
}

interface SummaryWithMetadata extends JassGameSummary {
  docId: string;
  groupId: string;
}

async function restoreGlobalStatsCurrent() {
  console.log('🔄 RESTORE globalStats.current');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isDryRun && !isConfirmed) {
    console.log('❌ FEHLER: Für echte Ausführung muss --confirm gesetzt werden!');
    console.log('💡 Verwendung:');
    console.log('   npm run restore-globalStats-current -- --dry-run');
    console.log('   npm run restore-globalStats-current -- --confirm');
    if (targetPlayerId) {
      console.log(`   npm run restore-globalStats-current -- --player-id ${targetPlayerId} --confirm`);
    }
    process.exit(1);
  }

  const stats = {
    summariesProcessed: 0,
    playersUpdated: 0,
    errors: [] as string[]
  };

  try {
    // 1. Lade alle jassGameSummaries
    console.log('\n📊 Lade jassGameSummaries...');
    let summariesQuery: admin.firestore.Query = db.collectionGroup('jassGameSummaries');
    
    const summariesSnap = await summariesQuery.get();
    console.log(`   Gefunden: ${summariesSnap.size} Summaries`);

    if (summariesSnap.empty) {
      console.log('❌ Keine jassGameSummaries gefunden!');
      return;
    }

    // 2. Parse Summaries mit Metadata
    const allSummaries: SummaryWithMetadata[] = [];
    
    summariesSnap.docs.forEach(doc => {
      const data = doc.data() as JassGameSummary;
      
      // Extrahiere groupId aus Collection-Pfad
      const pathParts = doc.ref.path.split('/');
      let groupId: string | undefined;
      
      if (pathParts.includes('groups')) {
        const groupIndex = pathParts.indexOf('groups');
        groupId = pathParts[groupIndex + 1];
      }
      
      if (groupId) {
        allSummaries.push({
          ...data,
          docId: doc.id,
          groupId
        });
      }
    });

    console.log(`   Summaries mit GroupId: ${allSummaries.length}`);

    // 3. Gruppiere Summaries nach Spieler
    console.log('\n📋 Gruppiere Summaries nach Spieler...');
    const summariesByPlayer = new Map<string, SummaryWithMetadata[]>();

    allSummaries.forEach(summary => {
      if (!summary.participantPlayerIds) return;
      
      summary.participantPlayerIds.forEach(playerId => {
        if (!summariesByPlayer.has(playerId)) {
          summariesByPlayer.set(playerId, []);
        }
        summariesByPlayer.get(playerId)!.push(summary);
      });
    });

    console.log(`   Spieler gefunden: ${summariesByPlayer.size}`);

    // 4. Filtere Spieler falls gewünscht
    let playerIdsToProcess = Array.from(summariesByPlayer.keys());
    if (targetPlayerId) {
      if (summariesByPlayer.has(targetPlayerId)) {
        playerIdsToProcess = [targetPlayerId];
        console.log(`   Nur Spieler: ${targetPlayerId}`);
      } else {
        console.log(`❌ Spieler ${targetPlayerId} nicht in Summaries gefunden!`);
        return;
      }
    }

    // 5. Sortiere Summaries chronologisch für jeden Spieler
    console.log('\n📅 Sortiere Summaries chronologisch...');
    
    summariesByPlayer.forEach((summaries, playerId) => {
      summaries.sort((a, b) => {
        const timeA = a.completedAt || a.createdAt;
        const timeB = b.completedAt || b.createdAt;
        return timeA.toMillis() - timeB.toMillis();
      });
    });

    // 6. Berechne Statistiken für jeden Spieler
    console.log('\n🔄 Berechne globalStats.current...');
    
    for (const playerId of playerIdsToProcess) {
      try {
        const summaries = summariesByPlayer.get(playerId)!;
        
        console.log(`\n   👤 Spieler: ${playerId} (${summaries.length} Sessions)`);
        
        // Initialisiere globalStats
        const globalStats: any = {
          totalSessions: 0,
          sessionsWon: 0,
          sessionsLost: 0,
          sessionsDraw: 0,
          totalGames: 0,
          gamesWon: 0,
          gamesLost: 0,
          trumpfStatistik: {},
          totalTrumpfCount: 0
        };

        // Iteriere chronologisch durch alle Sessions
        for (const summary of summaries) {
          stats.summariesProcessed++;
          
          const playerTeam = getPlayerTeam(summary.teams, playerId);
          
          // ✅ SESSIONS
          globalStats.totalSessions++;
          
          // ✅ SESSION WIN/LOSS/DRAW (nur reguläre Sessions, keine Turniere)
          if (!summary.isTournamentSession && playerTeam) {
            if (summary.winnerTeamKey === 'draw') {
              globalStats.sessionsDraw++;
            } else if (summary.winnerTeamKey === playerTeam) {
              globalStats.sessionsWon++;
            } else {
              globalStats.sessionsLost++;
            }
          }
          
          // ✅ GAMES
          globalStats.totalGames += summary.gamesPlayed;
          
          // ✅ GAME WIN/LOSS
          if (summary.gameWinsByPlayer && summary.gameWinsByPlayer[playerId]) {
            const playerWins = summary.gameWinsByPlayer[playerId];
            globalStats.gamesWon += playerWins.wins || 0;
            globalStats.gamesLost += playerWins.losses || 0;
          }
          
          // ✅ TRUMPF-STATISTIK
          if (summary.aggregatedTrumpfCountsByPlayer && summary.aggregatedTrumpfCountsByPlayer[playerId]) {
            const playerTrumpfCounts = summary.aggregatedTrumpfCountsByPlayer[playerId];
            Object.entries(playerTrumpfCounts).forEach(([trumpf, count]) => {
              globalStats.trumpfStatistik[trumpf] = (globalStats.trumpfStatistik[trumpf] || 0) + count;
              globalStats.totalTrumpfCount += count;
            });
          }
        }

        // 7. Speichere globalStats.current
        if (!isDryRun) {
          await db.collection('players').doc(playerId).set({
            globalStats: {
              current: globalStats
            },
            lastUpdated: admin.firestore.Timestamp.now()
          }, { merge: true });

          console.log(`   ✅ Gespeichert:`);
          console.log(`      - Sessions: Won=${globalStats.sessionsWon}, Lost=${globalStats.sessionsLost}, Draw=${globalStats.sessionsDraw}`);
          console.log(`      - Games: Won=${globalStats.gamesWon}, Lost=${globalStats.gamesLost}, Total=${globalStats.totalGames}`);
          console.log(`      - Trumpfansagen: ${globalStats.totalTrumpfCount}`);
          
          stats.playersUpdated++;
        } else {
          console.log(`   [DRY-RUN] Würde speichern:`);
          console.log(`      - Sessions: Won=${globalStats.sessionsWon}, Lost=${globalStats.sessionsLost}, Draw=${globalStats.sessionsDraw}`);
          console.log(`      - Games: Won=${globalStats.gamesWon}, Lost=${globalStats.gamesLost}, Total=${globalStats.totalGames}`);
          console.log(`      - Trumpfansagen: ${globalStats.totalTrumpfCount}`);
        }

      } catch (error) {
        const errorMsg = `Fehler beim Verarbeiten von ${playerId}: ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    // 8. Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ RESTORE ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════');

    console.log('\nStatistiken:');
    console.log(`  - Summaries verarbeitet: ${stats.summariesProcessed}`);
    console.log(`  - Spieler aktualisiert: ${stats.playersUpdated}`);
    console.log(`  - Fehler: ${stats.errors.length}`);
    console.log(`  - Modus: ${isDryRun ? 'DRY-RUN' : 'LIVE-WRITE'}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Fehler aufgetreten:');
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (isDryRun) {
      console.log('\n💡 Für echte Ausführung verwende:');
      if (targetPlayerId) {
        console.log(`   npm run restore-globalStats-current -- --player-id ${targetPlayerId} --confirm`);
      } else {
        console.log(`   npm run restore-globalStats-current -- --confirm`);
      }
    } else {
      console.log('\n🎉 Restore erfolgreich abgeschlossen!');
      console.log('   globalStats.current wurde für alle Spieler wiederhergestellt.');
    }

  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    stats.errors.push(`Kritischer Fehler: ${error}`);
  }
  
  process.exit(0);
}

function getPlayerTeam(teams: JassGameSummary['teams'], playerId: string): 'top' | 'bottom' | null {
  if (!teams || !teams.top || !teams.bottom) return null;
  if (teams.top.players && teams.top.players.some(p => p.playerId === playerId)) return 'top';
  if (teams.bottom.players && teams.bottom.players.some(p => p.playerId === playerId)) return 'bottom';
  return null;
}

// Starte das Script
restoreGlobalStatsCurrent().catch(console.error);

