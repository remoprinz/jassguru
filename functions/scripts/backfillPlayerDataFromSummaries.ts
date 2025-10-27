import * as admin from 'firebase-admin';
import { Command } from 'commander';

// Initialize Firebase Admin
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});
const db = admin.firestore();

const program = new Command();
program
  .option('--group-id <id>', 'Specific group ID to backfill (optional)')
  .option('--player-id <id>', 'Specific player ID to backfill (optional)')
  .option('--dry-run', 'Dry run mode - no actual writes')
  .option('--confirm', 'Confirm actual execution')
  .parse(process.argv);

const options = program.opts();
const targetGroupId = options.groupId;
const targetPlayerId = options.playerId;
const isDryRun = options.dryRun;
const isConfirmed = options.confirm;

interface JassGameSummary {
  sessionId?: string;
  tournamentId?: string;
  tournamentName?: string;
  participantPlayerIds: string[];
  gamesPlayed: number;
  teams?: {
    top: { players: Array<{ playerId: string; displayName: string }> };
    bottom: { players: Array<{ playerId: string; displayName: string }> };
  };
  finalScores?: { top: number; bottom: number };
  finalStriche?: {
    top: { matsch: number; schneider: number; kontermatsch: number; berg: number; sieg: number };
    bottom: { matsch: number; schneider: number; kontermatsch: number; berg: number; sieg: number };
  };
  gameWinsByPlayer?: Record<string, { wins: number; losses: number; draws?: number }>;
  eventCounts?: {
    top: { matsch: number; schneider: number; kontermatsch: number; berg: number; sieg: number };
    bottom: { matsch: number; schneider: number; kontermatsch: number; berg: number; sieg: number };
  };
  aggregatedTrumpfCountsByPlayer?: Record<string, Record<string, number>>;
  aggregatedRoundDurationsByPlayer?: Record<string, { totalDuration: number; roundCount: number }>;
  sessionTotalWeisPoints?: { top: number; bottom: number };
  winnerTeamKey?: string; // ✅ NEU: Für Session-Ergebnis (draw, top, bottom)
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  isTournamentSession?: boolean;
}

interface SummaryWithMetadata extends JassGameSummary {
  docId: string;
  groupId: string;
}

interface PlayerStats {
  // ✅ SESSIONS
  totalSessions: number;
  sessionsWon: number;
  sessionsLost: number;
  sessionsDraw: number;
  sessionWinRate: number;
  
  // ✅ GAMES
  totalGames: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  gameWinRate: number;
  
  // ✅ SCORES
  totalPointsMade: number;
  totalPointsReceived: number;
  pointsDifference: number;
  avgPointsPerGame: number;
  
  totalStricheMade: number;
  totalStricheReceived: number;
  stricheDifference: number;
  avgStrichePerGame: number;
  
  // ✅ WEIS
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  avgWeisPerGame: number;
  
  // ✅ EVENTS
  matschEventsMade: number;
  matschEventsReceived: number;
  matschBilanz: number;
  
  schneiderEventsMade: number;
  schneiderEventsReceived: number;
  schneiderBilanz: number;
  
  kontermatschEventsMade: number;
  kontermatschEventsReceived: number;
  kontermatschBilanz: number;
  
  // ✅ TRUMPF
  trumpfStatistik: Record<string, number>;
  totalTrumpfCount: number;
  
  // ✅ ZEIT
  totalPlayTimeSeconds: number;
  avgRoundDurationMilliseconds: number;
  
  // ✅ ZEITSTEMPEL
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;
}

interface PartnerStats {
  partnerId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface OpponentStats {
  opponentId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface GroupStats {
  groupId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  averageScore: number;
  totalPointsMade: number;
  totalPointsReceived: number;
  pointsDifference: number;
  totalStricheMade: number;
  totalStricheReceived: number;
  stricheDifference: number;
}

interface ScoresHistoryEntry {
  timestamp: admin.firestore.Timestamp;
  eventType: 'session_end';
  sessionId: string;
  tournamentId?: string;
  tournamentName?: string;
  groupId: string;
  globalStatsSnapshot: PlayerStats;
  groupStatsSnapshot: GroupStats;
}

// Hilfsfunktion für Striche-Berechnung
function calculateTotalStriche(stricheData: any): number {
  if (!stricheData) return 0;
  
  return (stricheData.matsch || 0) + 
         (stricheData.schneider || 0) + 
         (stricheData.kontermatsch || 0) + 
         (stricheData.berg || 0) + 
         (stricheData.sieg || 0);
}

async function backfillPlayerDataFromSummaries() {
  console.log('🚀 BACKFILL: Spieler-Daten aus jassGameSummaries neu aufbauen');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isDryRun && !isConfirmed) {
    console.log('❌ FEHLER: Für echte Ausführung muss --confirm gesetzt werden!');
    console.log('💡 Verwendung:');
    console.log('   npm run backfill-player-data -- --dry-run');
    console.log('   npm run backfill-player-data -- --confirm');
    process.exit(1);
  }

  const stats = {
    summariesProcessed: 0,
    playersUpdated: 0,
    historyEntriesCreated: 0,
    errors: [] as string[]
  };

  try {
    // 1. Lade alle jassGameSummaries
    console.log('\n📊 Lade jassGameSummaries...');
    let summariesQuery: admin.firestore.Query;
    
    if (targetGroupId) {
      summariesQuery = db.collection(`groups/${targetGroupId}/jassGameSummaries`);
    } else {
      summariesQuery = db.collectionGroup('jassGameSummaries');
    }
    
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
      let groupId = targetGroupId;
      if (!groupId && pathParts.includes('groups')) {
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

    // 5. Lösche bestehende Daten (nur wenn nicht dry-run)
    if (!isDryRun) {
      console.log('\n🗑️  Lösche bestehende Spieler-Daten...');
      for (const playerId of playerIdsToProcess) {
        try {
          // Lösche globalStats
          const globalStatsRef = db.collection('players').doc(playerId).collection('globalStats').doc('current');
          await globalStatsRef.delete();

          // Lösche groupStats
          const groupStatsRef = db.collection('players').doc(playerId).collection('groupStats');
          const groupStatsSnap = await groupStatsRef.get();
          if (!groupStatsSnap.empty) {
            const batch = db.batch();
            groupStatsSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }

          // Lösche partnerStats
          const partnerStatsRef = db.collection('players').doc(playerId).collection('partnerStats');
          const partnerStatsSnap = await partnerStatsRef.get();
          if (!partnerStatsSnap.empty) {
            const batch = db.batch();
            partnerStatsSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }

          // Lösche opponentStats
          const opponentStatsRef = db.collection('players').doc(playerId).collection('opponentStats');
          const opponentStatsSnap = await opponentStatsRef.get();
          if (!opponentStatsSnap.empty) {
            const batch = db.batch();
            opponentStatsSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }

          // Lösche scoresHistory
          const scoresHistoryRef = db.collection('players').doc(playerId).collection('scoresHistory');
          const scoresHistorySnap = await scoresHistoryRef.get();
          if (!scoresHistorySnap.empty) {
            const batch = db.batch();
            scoresHistorySnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }

          console.log(`   ✅ Alte Daten für ${playerId} gelöscht`);
        } catch (error) {
          const errorMsg = `Fehler beim Löschen von ${playerId}: ${error}`;
          console.error(`   ❌ ${errorMsg}`);
          stats.errors.push(errorMsg);
        }
      }
    }

    // 6. Sortiere Summaries chronologisch für jeden Spieler
    console.log('\n📅 Sortiere Summaries chronologisch...');
    
    summariesByPlayer.forEach((summaries, playerId) => {
      summaries.sort((a, b) => {
        const timeA = a.completedAt || a.createdAt;
        const timeB = b.completedAt || b.createdAt;
        return timeA.toMillis() - timeB.toMillis();
      });
    });

    // 7. Berechne kumulative Statistiken für jeden Spieler
    console.log('\n🔄 Berechne kumulative Statistiken...');
    
    for (const playerId of playerIdsToProcess) {
      try {
        const summaries = summariesByPlayer.get(playerId)!;
        
        console.log(`\n   👤 Spieler: ${playerId} (${summaries.length} Sessions)`);
        
        // Initialisiere kumulative Stats
        const globalStats: PlayerStats = {
          // ✅ SESSIONS
          totalSessions: 0,
          sessionsWon: 0,
          sessionsLost: 0,
          sessionsDraw: 0,
          sessionWinRate: 0,
          
          // ✅ GAMES
          totalGames: 0,
          gamesWon: 0,
          gamesLost: 0,
          gamesDraw: 0,
          gameWinRate: 0,
          
          // ✅ SCORES
          totalPointsMade: 0,
          totalPointsReceived: 0,
          pointsDifference: 0,
          avgPointsPerGame: 0,
          
          totalStricheMade: 0,
          totalStricheReceived: 0,
          stricheDifference: 0,
          avgStrichePerGame: 0,
          
          // ✅ WEIS
          totalWeisPoints: 0,
          totalWeisReceived: 0,
          weisDifference: 0,
          avgWeisPerGame: 0,
          
          // ✅ EVENTS
          matschEventsMade: 0,
          matschEventsReceived: 0,
          matschBilanz: 0,
          
          schneiderEventsMade: 0,
          schneiderEventsReceived: 0,
          schneiderBilanz: 0,
          
          kontermatschEventsMade: 0,
          kontermatschEventsReceived: 0,
          kontermatschBilanz: 0,
          
          // ✅ TRUMPF
          trumpfStatistik: {},
          totalTrumpfCount: 0,
          
          // ✅ ZEIT
          totalPlayTimeSeconds: 0,
          avgRoundDurationMilliseconds: 0,
          
          // ✅ ZEITSTEMPEL
          firstJassTimestamp: null,
          lastJassTimestamp: null
        };

        const groupStatsMap = new Map<string, GroupStats>();
        const partnerStatsMap = new Map<string, PartnerStats>();
        const opponentStatsMap = new Map<string, OpponentStats>();
        const historyEntries: ScoresHistoryEntry[] = [];

        // Iteriere chronologisch durch alle Sessions
        for (const summary of summaries) {
          stats.summariesProcessed++;
          
          const sessionId = summary.sessionId || summary.docId;
          const timestamp = summary.completedAt || summary.createdAt;
          
          // ✅ ADDIERE DELTA DIESER SESSION
          
          // Sessions
          globalStats.totalSessions += 1;
          
          // Games
          globalStats.totalGames += summary.gamesPlayed;
          
          // Wins/Losses
          if (summary.gameWinsByPlayer && summary.gameWinsByPlayer[playerId]) {
            const playerWins = summary.gameWinsByPlayer[playerId];
            globalStats.gamesWon += playerWins.wins || 0;
            globalStats.gamesLost += playerWins.losses || 0;
            globalStats.gamesDraw += playerWins.draws || 0;
          }
          
          // Event-Counts (matsch, schneider, etc.)
          const playerTeam = getPlayerTeam(summary.teams, playerId);
          if (playerTeam && summary.eventCounts && summary.eventCounts[playerTeam]) {
            const teamEvents = summary.eventCounts[playerTeam];
            globalStats.matschEventsMade += teamEvents.matsch || 0;
            globalStats.schneiderEventsMade += teamEvents.schneider || 0;
            globalStats.kontermatschEventsMade += teamEvents.kontermatsch || 0;
          }
          
          // ✅ POINTS-DIFFERENZ BERECHNEN
          if (playerTeam && summary.finalScores) {
            const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
            const playerPoints = summary.finalScores[playerTeam] || 0;
            const opponentPoints = summary.finalScores[opponentTeam] || 0;
            
            globalStats.totalPointsMade += playerPoints;
            globalStats.totalPointsReceived += opponentPoints;
            globalStats.pointsDifference = globalStats.totalPointsMade - globalStats.totalPointsReceived;
          }
          
          // ✅ STRICHE-DIFFERENZ BERECHNEN
          if (playerTeam && summary.finalStriche) {
            const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
            
            // Berechne Gesamt-Striche für beide Teams
            const playerStriche = calculateTotalStriche(summary.finalStriche[playerTeam]);
            const opponentStriche = calculateTotalStriche(summary.finalStriche[opponentTeam]);
            
            globalStats.totalStricheMade += playerStriche;
            globalStats.totalStricheReceived += opponentStriche;
            globalStats.stricheDifference = globalStats.totalStricheMade - globalStats.totalStricheReceived;
          }
          
          // Trumpf-Statistik
          if (summary.aggregatedTrumpfCountsByPlayer && summary.aggregatedTrumpfCountsByPlayer[playerId]) {
            const playerTrumpfCounts = summary.aggregatedTrumpfCountsByPlayer[playerId];
            Object.entries(playerTrumpfCounts).forEach(([trumpf, count]) => {
              globalStats.trumpfStatistik[trumpf] = (globalStats.trumpfStatistik[trumpf] || 0) + count;
              globalStats.totalTrumpfCount += count;
            });
          }
          
          // Spielzeit (in Sekunden)
          if (summary.aggregatedRoundDurationsByPlayer && summary.aggregatedRoundDurationsByPlayer[playerId]) {
            const playerRoundDuration = summary.aggregatedRoundDurationsByPlayer[playerId];
            globalStats.totalPlayTimeSeconds += Math.round((playerRoundDuration.totalDuration || 0) / 1000);
          }
          
          // Weis-Points
          if (playerTeam && summary.sessionTotalWeisPoints && summary.sessionTotalWeisPoints[playerTeam]) {
            globalStats.totalWeisPoints += summary.sessionTotalWeisPoints[playerTeam];
          }
          
          // ✅ NEU: SESSION-SIEGE/NIEDERLAGEN/UNENTSCHIEDENE (nur reguläre Sessions, keine Turniere)
          if (!summary.isTournamentSession) {
            if (playerTeam) {
              // ✅ KORREKT: Verwende winnerTeamKey statt finalScores für Session-Ergebnis
              if (summary.winnerTeamKey === 'draw') {
                globalStats.sessionsDraw++;
              } else if (summary.winnerTeamKey === playerTeam) {
                globalStats.sessionsWon++;
              } else {
                globalStats.sessionsLost++;
              }
            }
          }
          
          // ✅ BERECHNE ABGELEITETE WERTE NEU
          globalStats.gameWinRate = globalStats.totalGames > 0 ? globalStats.gamesWon / globalStats.totalGames : 0;
          globalStats.avgPointsPerGame = globalStats.totalGames > 0 ? globalStats.pointsDifference / globalStats.totalGames : 0;
          globalStats.avgStrichePerGame = globalStats.totalGames > 0 ? globalStats.stricheDifference / globalStats.totalGames : 0;
          globalStats.avgWeisPerGame = globalStats.totalGames > 0 ? globalStats.weisDifference / globalStats.totalGames : 0;
          globalStats.avgRoundDurationMilliseconds = globalStats.totalGames > 0 ? (globalStats.totalPlayTimeSeconds * 1000) / globalStats.totalGames : 0;
          
          // ✅ NEU: Session-WinRate berechnen
          const totalSessions = globalStats.sessionsWon + globalStats.sessionsLost + globalStats.sessionsDraw;
          globalStats.sessionWinRate = totalSessions > 0 ? globalStats.sessionsWon / totalSessions : 0;
          
          // ✅ ZEITSTEMPEL
          if (!globalStats.firstJassTimestamp) {
            globalStats.firstJassTimestamp = summary.createdAt;
          }
          globalStats.lastJassTimestamp = summary.completedAt || summary.createdAt;
          
          // ✅ AKTUALISIERE GRUPPEN-STATS (kumulativ)
          let groupStats = groupStatsMap.get(summary.groupId);
          if (!groupStats) {
            groupStats = {
              groupId: summary.groupId,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              winRate: 0,
              totalScore: 0,
              averageScore: 0,
              totalPointsMade: 0,
              totalPointsReceived: 0,
              pointsDifference: 0,
              totalStricheMade: 0,
              totalStricheReceived: 0,
              stricheDifference: 0
            };
            groupStatsMap.set(summary.groupId, groupStats);
          }
          
          groupStats.gamesPlayed += summary.gamesPlayed;
          if (summary.gameWinsByPlayer && summary.gameWinsByPlayer[playerId]) {
            const playerWins = summary.gameWinsByPlayer[playerId];
            groupStats.wins += playerWins.wins || 0;
            groupStats.losses += playerWins.losses || 0;
          }
          
          // ✅ POINTS-DIFFERENZ FÜR GRUPPEN-STATS
          if (playerTeam && summary.finalScores) {
            const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
            const playerPoints = summary.finalScores[playerTeam] || 0;
            const opponentPoints = summary.finalScores[opponentTeam] || 0;
            
            groupStats.totalPointsMade += playerPoints;
            groupStats.totalPointsReceived += opponentPoints;
            groupStats.pointsDifference = groupStats.totalPointsMade - groupStats.totalPointsReceived;
          }
          
          // ✅ AKTUALISIERE GRUPPEN-STRICHE (kumulativ)
          if (playerTeam && summary.finalStriche) {
            const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
            
            const playerStriche = calculateTotalStriche(summary.finalStriche[playerTeam]);
            const opponentStriche = calculateTotalStriche(summary.finalStriche[opponentTeam]);
            
            groupStats.totalStricheMade += playerStriche;
            groupStats.totalStricheReceived += opponentStriche;
            groupStats.stricheDifference = groupStats.totalStricheMade - groupStats.totalStricheReceived;
          }
          groupStats.winRate = groupStats.gamesPlayed > 0 ? groupStats.wins / groupStats.gamesPlayed : 0;
          groupStats.averageScore = groupStats.gamesPlayed > 0 ? groupStats.totalScore / groupStats.gamesPlayed : 0;
          
          // ✅ AKTUALISIERE PARTNER/OPPONENT STATS (kumulativ)
          updatePartnerOpponentStats(summary, playerId, partnerStatsMap, opponentStatsMap);
          
          // ✅ ERSTELLE SNAPSHOT DES AKTUELLEN ZUSTANDS
          const historyEntry: ScoresHistoryEntry = {
            timestamp: timestamp,
            eventType: 'session_end',
            sessionId: sessionId,
            groupId: summary.groupId,
            globalStatsSnapshot: JSON.parse(JSON.stringify(globalStats)), // Deep copy
            groupStatsSnapshot: JSON.parse(JSON.stringify(groupStats))    // Deep copy
          };
          
          // Füge optionale Felder hinzu
          if (summary.tournamentId) {
            historyEntry.tournamentId = summary.tournamentId;
          }
          if (summary.tournamentName) {
            historyEntry.tournamentName = summary.tournamentName;
          }
          
          historyEntries.push(historyEntry);
        }

        // 8. Speichere finale kumulative Daten
        if (!isDryRun) {
          // ✅ SPEICHERE GLOBAL STATS IM ROOT DOCUMENT
          // ✅ ENTFERNE REDUNDANTE FELDER - nur globalStats.current speichern
          await db.collection('players').doc(playerId).update({
            globalStats: {
              current: globalStats
            },
            // ✅ ENTFERNE REDUNDANTE FELDER
            gamesPlayed: admin.firestore.FieldValue.delete(),
            lastSessionGames: admin.firestore.FieldValue.delete(),
            lastSessionLosses: admin.firestore.FieldValue.delete(),
            lastSessionWins: admin.firestore.FieldValue.delete(),
            lastSessionPoints: admin.firestore.FieldValue.delete(),
            totalGamesPlayed: admin.firestore.FieldValue.delete(),
            // ✅ BEHALTE NUR WICHTIGE ROOT-FELDER
            lastUpdated: admin.firestore.Timestamp.now()
          });

          // Speichere groupStats
          for (const [groupId, groupStats] of groupStatsMap) {
            await db.collection('players').doc(playerId).collection('groupStats').doc(groupId).set(groupStats);
          }

          // Speichere partnerStats
          for (const [partnerId, partnerStats] of partnerStatsMap) {
            await db.collection('players').doc(playerId).collection('partnerStats').doc(partnerId).set(partnerStats);
          }

          // Speichere opponentStats
          for (const [opponentId, opponentStats] of opponentStatsMap) {
            await db.collection('players').doc(playerId).collection('opponentStats').doc(opponentId).set(opponentStats);
          }

          // Speichere scoresHistory
          for (const historyEntry of historyEntries) {
            await db.collection('players').doc(playerId).collection('scoresHistory').add(historyEntry);
          }

          console.log(`   ✅ ${playerId}: ${historyEntries.length} Historie-Einträge gespeichert`);
          stats.playersUpdated++;
          stats.historyEntriesCreated += historyEntries.length;
        } else {
          console.log(`   [DRY-RUN] ${playerId}: ${historyEntries.length} Historie-Einträge`);
          console.log(`     - Games: ${globalStats.totalGames}, Wins: ${globalStats.gamesWon}, WinRate: ${(globalStats.gameWinRate * 100).toFixed(1)}%`);
        }

      } catch (error) {
        const errorMsg = `Fehler beim Verarbeiten von ${playerId}: ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    // 9. Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ BACKFILL ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════');

    console.log('\nStatistiken:');
    console.log(`  - Summaries verarbeitet: ${stats.summariesProcessed}`);
    console.log(`  - Spieler aktualisiert: ${stats.playersUpdated}`);
    console.log(`  - Historie-Einträge erstellt: ${stats.historyEntriesCreated}`);
    console.log(`  - Fehler: ${stats.errors.length}`);
    console.log(`  - Modus: ${isDryRun ? 'DRY-RUN' : 'LIVE-WRITE'}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Fehler aufgetreten:');
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (isDryRun) {
      console.log('\n💡 Für echte Ausführung verwende:');
      if (targetGroupId) {
        console.log(`   npm run backfill-player-data-group -- --confirm`);
      } else if (targetPlayerId) {
        console.log(`   npm run backfill-player-data-player -- --confirm`);
      } else {
        console.log(`   npm run backfill-player-data -- --confirm`);
      }
    } else {
      console.log('\n🎉 Backfill erfolgreich abgeschlossen!');
      console.log('   Alle Spieler-Daten wurden chronologisch korrekt aus jassGameSummaries aufgebaut.');
      console.log('   Jeder Historie-Eintrag ist ein kumulativer Snapshot nach der jeweiligen Session.');
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

function updatePartnerOpponentStats(
  summary: SummaryWithMetadata,
  playerId: string,
  partnerStatsMap: Map<string, PartnerStats>,
  opponentStatsMap: Map<string, OpponentStats>
) {
  const playerTeam = getPlayerTeam(summary.teams, playerId);
  if (!playerTeam || !summary.teams || !summary.teams[playerTeam] || !summary.teams[playerTeam].players) return;

  const playerTeamPlayers = summary.teams[playerTeam].players;
  const otherTeam = playerTeam === 'top' ? 'bottom' : 'top';
  if (!summary.teams[otherTeam] || !summary.teams[otherTeam].players) return;
  const otherTeamPlayers = summary.teams[otherTeam].players;

  // Partner-Stats (kumulativ)
  playerTeamPlayers.forEach(partner => {
    if (partner.playerId !== playerId) {
      let partnerStats = partnerStatsMap.get(partner.playerId);
      if (!partnerStats) {
        partnerStats = {
          partnerId: partner.playerId,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0
        };
        partnerStatsMap.set(partner.playerId, partnerStats);
      }
      
      partnerStats.gamesPlayed += summary.gamesPlayed;
      
      if (summary.gameWinsByPlayer && summary.gameWinsByPlayer[playerId]) {
        const playerWins = summary.gameWinsByPlayer[playerId];
        partnerStats.wins += playerWins.wins || 0;
        partnerStats.losses += playerWins.losses || 0;
      }
      
      partnerStats.winRate = partnerStats.gamesPlayed > 0 ? partnerStats.wins / partnerStats.gamesPlayed : 0;
    }
  });

  // Opponent-Stats (kumulativ)
  otherTeamPlayers.forEach(opponent => {
    let opponentStats = opponentStatsMap.get(opponent.playerId);
    if (!opponentStats) {
      opponentStats = {
        opponentId: opponent.playerId,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0
      };
      opponentStatsMap.set(opponent.playerId, opponentStats);
    }
    
    opponentStats.gamesPlayed += summary.gamesPlayed;
    
    if (summary.gameWinsByPlayer && summary.gameWinsByPlayer[playerId]) {
      const playerWins = summary.gameWinsByPlayer[playerId];
      opponentStats.wins += playerWins.wins || 0;
      opponentStats.losses += playerWins.losses || 0;
    }
    
    opponentStats.winRate = opponentStats.gamesPlayed > 0 ? opponentStats.wins / opponentStats.gamesPlayed : 0;
  });
}

// Starte das Script
backfillPlayerDataFromSummaries().catch(console.error);