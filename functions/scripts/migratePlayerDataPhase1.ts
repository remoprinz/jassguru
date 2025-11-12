/**
 * 🚀 PHASE 1: PLAYER DATA MIGRATION SCRIPT
 * ==========================================
 * 
 * Migriert Spieler-Daten von alten, redundanten Collections in neue konsolidierte Struktur.
 * 
 * ALTE STRUKTUR (wird migriert):
 * - players/{id}/currentScores/latest/
 * - players/{id}/currentStatistics/latest/
 * - playerComputedStats/{id}
 * 
 * NEUE STRUKTUR (Ziel):
 * players/{playerId}/
 * ├── (Root Document) ← globalStats, globalRating, displayName
 * ├── groupStats/{groupId}
 * ├── partnerStats/{partnerId}
 * ├── opponentStats/{opponentId}
 * ├── ratingHistory/{docId} ← bleibt unverändert ✅
 * └── scoresHistory/{docId} ← neu
 * 
 * USAGE:
 * npm run ts-node functions/scripts/migratePlayerDataPhase1.ts [--dry-run] [--group-id=XXX]
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jasstafel-20c64-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.firestore();

// =========================================
// CONFIGURATION
// =========================================

interface MigrationConfig {
  dryRun: boolean;
  groupId?: string; // Optional: Nur Spieler einer bestimmten Gruppe migrieren
  batchSize: number;
  logLevel: 'verbose' | 'normal' | 'minimal';
}

const config: MigrationConfig = {
  dryRun: process.argv.includes('--dry-run'),
  groupId: process.argv.find(arg => arg.startsWith('--group-id='))?.split('=')[1],
  batchSize: 10,
  logLevel: 'verbose',
};

// =========================================
// STATISTICS
// =========================================

interface MigrationStats {
  totalPlayers: number;
  successfulMigrations: number;
  failedMigrations: number;
  skippedPlayers: number;
  errors: Array<{ playerId: string; error: string }>;
  startTime: Date;
  endTime?: Date;
}

const stats: MigrationStats = {
  totalPlayers: 0,
  successfulMigrations: 0,
  failedMigrations: 0,
  skippedPlayers: 0,
  errors: [],
  startTime: new Date(),
};

// =========================================
// LOGGING
// =========================================

function log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = config.dryRun ? '[DRY-RUN]' : '';
  
  if (level === 'error' || config.logLevel === 'verbose') {
    console.log(`${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`, data || '');
  } else if (level === 'warn' && config.logLevel !== 'minimal') {
    console.log(`${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`, data || '');
  } else if (level === 'info' && config.logLevel !== 'minimal') {
    console.log(`${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`, data || '');
  }
}

// =========================================
// HELPER FUNCTIONS
// =========================================

/**
 * Lädt alle Spieler-IDs, die migriert werden sollen
 */
async function getPlayerIds(): Promise<string[]> {
  log('info', 'Lade Spieler-IDs...');
  
  if (config.groupId) {
    // Nur Spieler einer bestimmten Gruppe
    log('info', `Lade Spieler der Gruppe: ${config.groupId}`);
    
    const groupDoc = await db.collection('groups').doc(config.groupId).get();
    if (!groupDoc.exists) {
      throw new Error(`Gruppe ${config.groupId} nicht gefunden!`);
    }
    
    const groupData = groupDoc.data();
    const playerIds = Object.keys(groupData?.players || {});
    
    log('info', `Gefunden: ${playerIds.length} Spieler in Gruppe ${config.groupId}`);
    return playerIds;
  } else {
    // Alle Spieler
    log('info', 'Lade alle Spieler...');
    
    const playersSnapshot = await db.collection('players').get();
    const playerIds = playersSnapshot.docs.map(doc => doc.id);
    
    log('info', `Gefunden: ${playerIds.length} Spieler insgesamt`);
    return playerIds;
  }
}

/**
 * Migriert die Daten eines einzelnen Spielers
 */
async function migratePlayer(playerId: string): Promise<void> {
  log('info', `Starte Migration für Spieler: ${playerId}`);
  
  try {
    // 1. Lade existierendes Root Document
    const playerDoc = await db.collection('players').doc(playerId).get();
    const playerData = playerDoc.exists ? playerDoc.data() : {};
    
    // 2. Lade alte Daten aus verschiedenen Quellen
    const oldScoresDoc = await db.collection(`players/${playerId}/currentScores`).doc('latest').get();
    const oldStatsDoc = await db.collection(`players/${playerId}/currentStatistics`).doc('latest').get();
    const oldComputedDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    const oldScores = oldScoresDoc.exists ? oldScoresDoc.data() : null;
    const oldStats = oldStatsDoc.exists ? oldStatsDoc.data() : null;
    const oldComputed = oldComputedDoc.exists ? oldComputedDoc.data() : null;
    
    if (!oldScores && !oldStats && !oldComputed) {
      log('warn', `Keine alten Daten gefunden für Spieler ${playerId}, überspringe...`);
      stats.skippedPlayers++;
      return;
    }
    
    log('info', `Gefundene alte Daten für ${playerId}:`, {
      hasScores: !!oldScores,
      hasStats: !!oldStats,
      hasComputed: !!oldComputed,
    });
    
    // 3. Merge und konsolidiere Daten
    const mergedGlobalStats = mergeGlobalStats(oldScores, oldStats, oldComputed);
    
    // 4. Update Root Document
    const rootDocUpdate: any = {
      // Behalte existierende Felder (Rating, etc.)
      ...playerData,
      
      // Füge konsolidierte Stats hinzu
      globalStats: mergedGlobalStats,
      
      // Zeitstempel
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      
      // Migration-Marker
      migratedPhase1: true,
      migratedPhase1At: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (!config.dryRun) {
      await db.collection('players').doc(playerId).set(rootDocUpdate, { merge: true });
      log('info', `✅ Root Document aktualisiert für ${playerId}`);
    } else {
      log('info', `[DRY-RUN] Würde Root Document aktualisieren für ${playerId}`);
    }
    
    // 5. Migriere Group Stats
    if (oldScores?.groups || oldStats?.groups || oldComputed?.groupStats) {
      await migrateGroupStats(playerId, oldScores, oldStats, oldComputed);
    }
    
    // 6. Migriere Partner Stats
    if (oldScores?.partners || oldComputed?.partnerAggregates) {
      await migratePartnerStats(playerId, oldScores, oldComputed);
    }
    
    // 7. Migriere Opponent Stats
    if (oldScores?.opponents || oldComputed?.opponentAggregates) {
      await migrateOpponentStats(playerId, oldScores, oldComputed);
    }
    
    // 8. Erstelle Scores History Eintrag (als Snapshot)
    await createInitialScoresHistory(playerId, mergedGlobalStats);
    
    stats.successfulMigrations++;
    log('info', `✅ Migration erfolgreich für Spieler ${playerId}`);
    
  } catch (error: any) {
    log('error', `❌ Fehler bei Migration von Spieler ${playerId}:`, error.message);
    stats.failedMigrations++;
    stats.errors.push({
      playerId,
      error: error.message,
    });
  }
}

/**
 * Merged globale Stats aus verschiedenen Quellen
 */
function mergeGlobalStats(oldScores: any, oldStats: any, oldComputed: any): any {
  // Priorität: oldComputed > oldScores > oldStats
  // oldComputed hat die vollständigsten und korrektesten Daten
  
  const merged: any = {
    // SESSIONS
    totalSessions: oldComputed?.totalSessions || oldScores?.global?.sessionsPlayed || 0,
    sessionsWon: oldComputed?.sessionWins || oldScores?.global?.sessionsWon || 0,
    sessionsLost: oldComputed?.sessionLosses || oldScores?.global?.sessionsLost || 0,
    sessionsDraw: oldComputed?.sessionTies || oldScores?.global?.sessionsDraw || 0,
    sessionWinRate: oldComputed?.sessionWinRate || oldScores?.global?.sessionWinRate || 0,
    
    // GAMES
    totalGames: oldComputed?.totalGames || oldScores?.global?.gamesPlayed || 0,
    gamesWon: oldComputed?.gameWins || oldScores?.global?.wins || 0,
    gamesLost: oldComputed?.gameLosses || oldScores?.global?.losses || 0,
    gamesDraw: oldScores?.global?.draws || 0,
    gameWinRate: oldComputed?.gameWinRate || oldScores?.global?.gameWinRate || 0,
    
    // SCORES
    totalPointsMade: oldComputed?.totalPointsMade || 0,
    totalPointsReceived: oldComputed?.totalPointsReceived || 0,
    pointsDifference: oldComputed?.totalPointsDifference || oldScores?.global?.pointsDiff || 0,
    avgPointsPerGame: oldComputed?.avgPointsPerGame || oldScores?.global?.avgPointsPerGame || 0,
    
    totalStricheMade: oldComputed?.totalStricheMade || 0,
    totalStricheReceived: oldComputed?.totalStricheReceived || 0,
    stricheDifference: oldComputed?.totalStricheDifference || oldScores?.global?.stricheDiff || 0,
    avgStrichePerGame: oldComputed?.avgStrichePerGame || oldScores?.global?.avgStrichePerGame || 0,
    
    // WEIS
    totalWeisPoints: oldComputed?.playerTotalWeisMade || oldScores?.global?.totalWeisPoints || 0,
    totalWeisReceived: oldScores?.global?.totalWeisReceived || 0,
    weisDifference: oldScores?.global?.weisDifference || 0,
    avgWeisPerGame: oldScores?.global?.weisAverage || 0,
    
    // EVENTS
    matschEventsMade: oldComputed?.totalMatschEventsMade || oldScores?.global?.matschEvents || 0,
    matschEventsReceived: oldComputed?.totalMatschEventsReceived || 0,
    matschBilanz: oldComputed?.matschBilanz || oldScores?.global?.matschBilanz || 0,
    
    schneiderEventsMade: oldComputed?.totalSchneiderEventsMade || oldScores?.global?.schneiderEvents || 0,
    schneiderEventsReceived: oldComputed?.totalSchneiderEventsReceived || 0,
    schneiderBilanz: oldComputed?.schneiderBilanz || oldScores?.global?.schneiderBilanz || 0,
    
    kontermatschEventsMade: oldComputed?.totalKontermatschEventsMade || oldScores?.global?.kontermatschEvents || 0,
    kontermatschEventsReceived: oldComputed?.totalKontermatschEventsReceived || 0,
    kontermatschBilanz: oldComputed?.kontermatschBilanz || oldScores?.global?.kontermatschBilanz || 0,
    
    // TRUMPF
    trumpfStatistik: oldComputed?.trumpfStatistik || {},
    totalTrumpfCount: oldComputed?.totalTrumpfCount || 0,
    
    // ZEIT
    totalPlayTimeSeconds: oldComputed?.totalPlayTimeSeconds || 0,
    avgRoundDurationMilliseconds: oldComputed?.avgRoundDurationMilliseconds || 0,
    
    // HIGHLIGHTS (optional)
    highestPointsSession: oldComputed?.highestPointsSession || null,
    highestStricheSession: oldComputed?.highestStricheSession || null,
    mostWeisPointsSession: oldComputed?.mostWeisPointsSession || null,
    longestWinStreakSessions: oldComputed?.longestWinStreakSessions || null,
    longestWinStreakGames: oldComputed?.longestWinStreakGames || null,
    
    // ZEITSTEMPEL
    firstJassTimestamp: oldComputed?.firstJassTimestamp || null,
    lastJassTimestamp: oldComputed?.lastJassTimestamp || null,
  };
  
  return merged;
}

/**
 * Migriert Group Stats in Subcollection
 */
async function migrateGroupStats(playerId: string, oldScores: any, oldStats: any, oldComputed: any): Promise<void> {
  log('info', `Migriere Group Stats für ${playerId}...`);
  
  // Sammle alle Group IDs aus verschiedenen Quellen
  const groupIds = new Set<string>();
  
  if (oldScores?.groups) {
    Object.keys(oldScores.groups).forEach(gid => groupIds.add(gid));
  }
  if (oldStats?.groups) {
    Object.keys(oldStats.groups).forEach(gid => groupIds.add(gid));
  }
  
  log('info', `Gefunden: ${groupIds.size} Gruppen für Spieler ${playerId}`);
  
  for (const groupId of groupIds) {
    const groupScores = oldScores?.groups?.[groupId];
    const groupStats = oldStats?.groups?.[groupId];
    
    const groupData: any = {
      groupId,
      groupName: groupStats?.groupName || null,
      
      sessionsPlayed: groupScores?.sessionsPlayed || 0,
      sessionsWon: groupScores?.sessionsWon || 0,
      sessionsLost: groupScores?.sessionsLost || 0,
      sessionsDraw: groupScores?.sessionsDraw || 0,
      sessionWinRate: groupStats?.sessionWinRate || 0,
      
      gamesPlayed: groupScores?.gamesPlayed || groupStats?.gamesPlayed || 0,
      gamesWon: groupStats?.gamesWon || 0,
      gamesLost: 0,
      gameWinRate: groupStats?.gameWinRate || 0,
      
      pointsDifference: groupScores?.pointsDiff || 0,
      stricheDifference: groupScores?.stricheDiff || 0,
      avgPointsPerGame: groupStats?.avgPoints || 0,
      avgStrichePerGame: 0,
      
      matschBilanz: groupScores?.matschBilanz || 0,
      schneiderBilanz: groupScores?.schneiderBilanz || 0,
      kontermatschBilanz: groupScores?.kontermatschBilanz || 0,
      
      weisDifference: groupScores?.weisDifference || 0,
      avgWeisPerGame: 0,
      
      lastPlayedInGroup: admin.firestore.Timestamp.now(),
    };
    
    if (!config.dryRun) {
      await db.collection(`players/${playerId}/groupStats`).doc(groupId).set(groupData);
      log('info', `✅ Group Stats migriert: ${groupId}`);
    } else {
      log('info', `[DRY-RUN] Würde Group Stats migrieren: ${groupId}`);
    }
  }
}

/**
 * Migriert Partner Stats in Subcollection
 */
async function migratePartnerStats(playerId: string, oldScores: any, oldComputed: any): Promise<void> {
  log('info', `Migriere Partner Stats für ${playerId}...`);
  
  const partners = oldScores?.partners || oldComputed?.partnerAggregates || [];
  
  log('info', `Gefunden: ${partners.length} Partner für Spieler ${playerId}`);
  
  for (const partner of partners) {
    const partnerId = partner.partnerId;
    
    const partnerData: any = {
      partnerId,
      partnerDisplayName: partner.partnerDisplayName || 'Unbekannt',
      
      sessionsPlayedWith: partner.sessionsPlayedWith || 0,
      sessionsWonWith: partner.sessionsWonWith || 0,
      sessionsLostWith: partner.sessionsLostWith || 0,
      sessionsDrawWith: partner.sessionsDrawWith || 0,
      sessionWinRateWith: partner.sessionWinRate || partner.sessionWinRateWith || 0,
      
      gamesPlayedWith: partner.gamesPlayedWith || 0,
      gamesWonWith: partner.gamesWonWith || 0,
      gamesLostWith: partner.gamesLostWith || 0,
      gameWinRateWith: partner.gameWinRate || partner.gameWinRateWith || 0,
      
      totalStricheDifferenceWith: partner.totalStricheDifferenceWith || 0,
      totalPointsDifferenceWith: partner.totalPointsDifferenceWith || partner.totalPointsWith || 0,
      
      matschBilanzWith: partner.matschBilanz || 0,
      matschEventsMadeWith: partner.matschEventsMadeWith || 0,
      matschEventsReceivedWith: partner.matschEventsReceivedWith || 0,
      
      schneiderBilanzWith: partner.schneiderBilanz || 0,
      schneiderEventsMadeWith: partner.schneiderEventsMadeWith || 0,
      schneiderEventsReceivedWith: partner.schneiderEventsReceivedWith || 0,
      
      kontermatschBilanzWith: partner.kontermatschBilanz || 0,
      kontermatschEventsMadeWith: partner.kontermatschEventsMadeWith || 0,
      kontermatschEventsReceivedWith: partner.kontermatschEventsReceivedWith || 0,
      
      totalWeisPointsWith: partner.totalWeisPointsWith || 0,
      totalWeisReceivedWith: partner.totalWeisReceivedWith || 0,
      weisDifferenceWith: partner.weisDifferenceWith || 0,
      
      lastPlayedWithTimestamp: partner.lastPlayedWithTimestamp || admin.firestore.Timestamp.now(),
    };
    
    if (!config.dryRun) {
      await db.collection(`players/${playerId}/partnerStats`).doc(partnerId).set(partnerData);
      log('info', `✅ Partner Stats migriert: ${partnerId}`);
    } else {
      log('info', `[DRY-RUN] Würde Partner Stats migrieren: ${partnerId}`);
    }
  }
}

/**
 * Migriert Opponent Stats in Subcollection
 */
async function migrateOpponentStats(playerId: string, oldScores: any, oldComputed: any): Promise<void> {
  log('info', `Migriere Opponent Stats für ${playerId}...`);
  
  const opponents = oldScores?.opponents || oldComputed?.opponentAggregates || [];
  
  log('info', `Gefunden: ${opponents.length} Gegner für Spieler ${playerId}`);
  
  for (const opponent of opponents) {
    const opponentId = opponent.opponentId;
    
    const opponentData: any = {
      opponentId,
      opponentDisplayName: opponent.opponentDisplayName || 'Unbekannt',
      
      sessionsPlayedAgainst: opponent.sessionsPlayedAgainst || 0,
      sessionsWonAgainst: opponent.sessionsWonAgainst || 0,
      sessionsLostAgainst: opponent.sessionsLostAgainst || 0,
      sessionsDrawAgainst: opponent.sessionsDrawAgainst || 0,
      sessionWinRateAgainst: opponent.sessionWinRate || opponent.sessionWinRateAgainst || 0,
      
      gamesPlayedAgainst: opponent.gamesPlayedAgainst || 0,
      gamesWonAgainst: opponent.gamesWonAgainst || 0,
      gamesLostAgainst: opponent.gamesLostAgainst || 0,
      gameWinRateAgainst: opponent.gameWinRate || opponent.gameWinRateAgainst || 0,
      
      totalStricheDifferenceAgainst: opponent.totalStricheDifferenceAgainst || 0,
      totalPointsDifferenceAgainst: opponent.totalPointsDifferenceAgainst || opponent.totalPointsScoredWhenOpponent || 0,
      
      matschBilanzAgainst: opponent.matschBilanz || 0,
      matschEventsMadeAgainst: opponent.matschEventsMadeAgainst || 0,
      matschEventsReceivedAgainst: opponent.matschEventsReceivedAgainst || 0,
      
      schneiderBilanzAgainst: opponent.schneiderBilanz || 0,
      schneiderEventsMadeAgainst: opponent.schneiderEventsMadeAgainst || 0,
      schneiderEventsReceivedAgainst: opponent.schneiderEventsReceivedAgainst || 0,
      
      kontermatschBilanzAgainst: opponent.kontermatschBilanz || 0,
      kontermatschEventsMadeAgainst: opponent.kontermatschEventsMadeAgainst || 0,
      kontermatschEventsReceivedAgainst: opponent.kontermatschEventsReceivedAgainst || 0,
      
      totalWeisPointsAgainst: opponent.totalWeisPointsAgainst || 0,
      totalWeisReceivedAgainst: opponent.totalWeisReceivedAgainst || 0,
      weisDifferenceAgainst: opponent.weisDifferenceAgainst || 0,
      
      lastPlayedAgainstTimestamp: opponent.lastPlayedAgainstTimestamp || admin.firestore.Timestamp.now(),
    };
    
    if (!config.dryRun) {
      await db.collection(`players/${playerId}/opponentStats`).doc(opponentId).set(opponentData);
      log('info', `✅ Opponent Stats migriert: ${opponentId}`);
    } else {
      log('info', `[DRY-RUN] Würde Opponent Stats migrieren: ${opponentId}`);
    }
  }
}

/**
 * Erstellt initialen Scores History Eintrag
 */
async function createInitialScoresHistory(playerId: string, globalStats: any): Promise<void> {
  log('info', `Erstelle initialen Scores History Eintrag für ${playerId}...`);
  
  const historyEntry: any = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    sessionId: 'migration-phase1',
    groupId: 'all',
    
    stricheDiff: globalStats.stricheDifference || 0,
    pointsDiff: globalStats.pointsDifference || 0,
    wins: globalStats.gamesWon || 0,
    losses: globalStats.gamesLost || 0,
    draws: globalStats.gamesDraw || 0,
    
    matschBilanz: globalStats.matschBilanz || 0,
    schneiderBilanz: globalStats.schneiderBilanz || 0,
    kontermatschBilanz: globalStats.kontermatschBilanz || 0,
    
    weisDifference: globalStats.weisDifference || 0,
    
    globalStats: globalStats,
    
    eventType: 'manual_recalc',
  };
  
  if (!config.dryRun) {
    await db.collection(`players/${playerId}/scoresHistory`).add(historyEntry);
    log('info', `✅ Scores History Eintrag erstellt`);
  } else {
    log('info', `[DRY-RUN] Würde Scores History Eintrag erstellen`);
  }
}

// =========================================
// MAIN MIGRATION FUNCTION
// =========================================

async function runMigration() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🚀 PHASE 1: PLAYER DATA MIGRATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  if (config.dryRun) {
    console.log('⚠️  DRY-RUN MODE: Keine Daten werden tatsächlich geschrieben!');
    console.log('');
  }
  
  console.log('Konfiguration:');
  console.log(`  - Dry-Run: ${config.dryRun}`);
  console.log(`  - Group ID: ${config.groupId || 'alle Gruppen'}`);
  console.log(`  - Batch Size: ${config.batchSize}`);
  console.log(`  - Log Level: ${config.logLevel}`);
  console.log('');
  
  try {
    // 1. Lade Spieler-IDs
    const playerIds = await getPlayerIds();
    stats.totalPlayers = playerIds.length;
    
    console.log(`Gefundene Spieler: ${playerIds.length}`);
    console.log('');
    
    if (playerIds.length === 0) {
      console.log('⚠️  Keine Spieler gefunden, breche ab.');
      return;
    }
    
    // 2. Bestätigung bei Production-Run
    if (!config.dryRun) {
      console.log('⚠️  ACHTUNG: Dies ist KEIN Dry-Run!');
      console.log('   Daten werden tatsächlich migriert.');
      console.log('');
      console.log('   Drücke Ctrl+C um abzubrechen, oder warte 5 Sekunden...');
      console.log('');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('✅ Starte Migration...');
      console.log('');
    }
    
    // 3. Migriere jeden Spieler
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      
      console.log('');
      console.log(`───────────────────────────────────────────────────────────`);
      console.log(`[${i + 1}/${playerIds.length}] Migriere Spieler: ${playerId}`);
      console.log(`───────────────────────────────────────────────────────────`);
      
      await migratePlayer(playerId);
      
      // Kurze Pause zwischen Spielern (Firestore Rate Limits)
      if (!config.dryRun && i < playerIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 4. Abschluss
    stats.endTime = new Date();
    const durationSeconds = Math.round((stats.endTime.getTime() - stats.startTime.getTime()) / 1000);
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ MIGRATION ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Statistiken:');
    console.log(`  - Gesamt Spieler: ${stats.totalPlayers}`);
    console.log(`  - Erfolgreich migriert: ${stats.successfulMigrations}`);
    console.log(`  - Fehlgeschlagen: ${stats.failedMigrations}`);
    console.log(`  - Übersprungen: ${stats.skippedPlayers}`);
    console.log(`  - Dauer: ${durationSeconds}s`);
    console.log('');
    
    if (stats.errors.length > 0) {
      console.log('Fehler:');
      stats.errors.forEach(err => {
        console.log(`  - ${err.playerId}: ${err.error}`);
      });
      console.log('');
    }
    
    // 5. Speichere Migration Report
    const reportPath = path.join(__dirname, `migration-phase1-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
    console.log(`📊 Migration Report gespeichert: ${reportPath}`);
    console.log('');
    
  } catch (error: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('  ❌ KRITISCHER FEHLER');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

// =========================================
// START
// =========================================

runMigration()
  .then(() => {
    console.log('🎉 Migration erfolgreich abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration fehlgeschlagen:', error);
    process.exit(1);
  });

