import * as admin from 'firebase-admin';
import { Command } from 'commander';
import * as path from 'path';

// Initialize Firebase Admin SDK mit Service Account Key
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  projectId: 'jassguru'
});
const db = admin.firestore();

const program = new Command();
program
  .option('--dry-run', 'Do not delete any data, just simulate the cleanup')
  .option('--group-id <id>', 'Cleanup only players belonging to a specific group ID')
  .option('--confirm', 'Confirm deletion (required for actual cleanup)')
  .option('--backup', 'Create backup before deletion')
  .parse(process.argv);

const options = program.opts();
const isDryRun = options.dryRun;
const targetGroupId = options.groupId;
const isConfirmed = options.confirm;
const shouldBackup = options.backup;

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`  🛡️  SAFE CLEANUP: ALTE PLAYER DATA COLLECTIONS`);
console.log(`═══════════════════════════════════════════════════════════`);

if (isDryRun) {
  console.log(`⚠️  DRY-RUN MODE: Keine Daten werden tatsächlich gelöscht!`);
} else if (!isConfirmed) {
  console.log(`❌ FEHLER: --confirm Flag ist erforderlich für echte Löschung!`);
  console.log(`   Verwende: npm run safe-cleanup-old-data-group -- --confirm`);
  process.exit(1);
} else {
  console.log(`🚨 ACHTUNG: Dies ist KEIN Dry-Run!`);
  console.log(`   Daten werden tatsächlich gelöscht!`);
}

console.log(`\nKonfiguration:`);
console.log(`  - Dry-Run: ${isDryRun}`);
console.log(`  - Group ID: ${targetGroupId || 'all'}`);
console.log(`  - Confirmed: ${isConfirmed}`);
console.log(`  - Backup: ${shouldBackup}`);

// Subcollections die gelöscht werden sollen
const SUBCOLLECTIONS_TO_DELETE = [
  'currentScores',
  'currentStatistics'
];

interface CleanupStats {
  playersProcessed: number;
  playerComputedStatsDeleted: number;
  subcollectionsDeleted: number;
  documentsDeleted: number;
  errors: string[];
}

async function createBackup(playerIds: string[]): Promise<void> {
  if (!shouldBackup || isDryRun) return;
  
  console.log(`\n💾 Erstelle Backup vor Cleanup...`);
  const backupData: any = {};
  
  for (const playerId of playerIds) {
    backupData[playerId] = {};
    
    // Backup playerComputedStats
    const computedStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    if (computedStatsDoc.exists) {
      backupData[playerId].playerComputedStats = computedStatsDoc.data();
    }
    
    // Backup Subcollections
    for (const subcollectionName of SUBCOLLECTIONS_TO_DELETE) {
      const subcollectionSnap = await db.collection(`players/${playerId}/${subcollectionName}`).get();
      if (!subcollectionSnap.empty) {
        backupData[playerId][subcollectionName] = {};
        subcollectionSnap.docs.forEach(doc => {
          backupData[playerId][subcollectionName][doc.id] = doc.data();
        });
      }
    }
  }
  
  // Speichere Backup als JSON
  const fs = require('fs');
  const backupPath = path.join(__dirname, `backup-before-cleanup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log(`   ✅ Backup gespeichert: ${backupPath}`);
}

async function safeCleanupOldPlayerData(): Promise<void> {
  const stats: CleanupStats = {
    playersProcessed: 0,
    playerComputedStatsDeleted: 0,
    subcollectionsDeleted: 0,
    documentsDeleted: 0,
    errors: []
  };

  const playerIdsToCleanup: string[] = [];

  // 1. Hole alle Spieler-IDs
  try {
    if (targetGroupId) {
      console.log(`\n📋 Lade Spieler der Gruppe: ${targetGroupId}`);
      const groupMembersSnap = await db.collection('groups').doc(targetGroupId).collection('members').get();
      groupMembersSnap.forEach(doc => playerIdsToCleanup.push(doc.id));
      console.log(`   Gefunden: ${playerIdsToCleanup.length} Spieler in Gruppe ${targetGroupId}`);
    } else {
      console.log(`\n📋 Lade alle Spieler...`);
      const playersSnap = await db.collection('players').get();
      playersSnap.forEach(doc => playerIdsToCleanup.push(doc.id));
      console.log(`   Gefunden: ${playerIdsToCleanup.length} Spieler insgesamt`);
    }
  } catch (error) {
    console.error(`❌ Fehler beim Laden der Spieler:`, error);
    stats.errors.push(`Fehler beim Laden der Spieler: ${error}`);
    return;
  }

  if (playerIdsToCleanup.length === 0) {
    console.log(`\n❌ Keine Spieler gefunden. Cleanup abgebrochen.`);
    return;
  }

  console.log(`\n🎯 Spieler für Cleanup: ${playerIdsToCleanup.join(', ')}`);

  // 2. Validiere neue Struktur und filtere nur migrierte Spieler
  console.log(`\n🔍 Validiere neue Struktur...`);
  let validatedPlayers = 0;
  const migratedPlayerIds: string[] = [];
  
  for (const playerId of playerIdsToCleanup) {
    try {
      const playerDoc = await db.collection('players').doc(playerId).get();
      if (playerDoc.exists) {
        const playerData = playerDoc.data();
        if (playerData?.globalStats) {
          console.log(`   ✅ players/${playerId}/globalStats vorhanden`);
          validatedPlayers++;
          migratedPlayerIds.push(playerId);
        } else {
          console.log(`   ⚠️  players/${playerId}/globalStats fehlt! (Spieler nicht migriert - überspringe Cleanup)`);
          stats.errors.push(`players/${playerId}/globalStats fehlt nach Migration - Cleanup übersprungen`);
        }
      }
    } catch (error) {
      const errorMsg = `Fehler beim Validieren von players/${playerId}: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }
  
  console.log(`\n🎯 Nur migrierte Spieler für Cleanup: ${migratedPlayerIds.length}/${playerIdsToCleanup.length}`);
  if (migratedPlayerIds.length !== playerIdsToCleanup.length) {
    console.log(`   ⚠️  ${playerIdsToCleanup.length - migratedPlayerIds.length} Spieler übersprungen (nicht migriert)`);
  }

  // 3. Erstelle Backup falls gewünscht (nur für migrierte Spieler)
  await createBackup(migratedPlayerIds);

  // 4. Lösche playerComputedStats Collection (nur für migrierte Spieler)
  console.log(`\n🗑️  Lösche playerComputedStats Collection...`);
  
  for (const playerId of migratedPlayerIds) {
    try {
      const docRef = db.collection('playerComputedStats').doc(playerId);
      const docSnap = await docRef.get();
      
      if (docSnap.exists) {
        if (isDryRun) {
          console.log(`   [DRY-RUN] Würde playerComputedStats/${playerId} löschen`);
        } else {
          await docRef.delete();
          console.log(`   ✅ playerComputedStats/${playerId} gelöscht`);
        }
        stats.playerComputedStatsDeleted++;
      }
    } catch (error) {
      const errorMsg = `Fehler beim Löschen von playerComputedStats/${playerId}: ${error}`;
      console.error(`   ❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }
  
  console.log(`   📊 playerComputedStats: ${stats.playerComputedStatsDeleted} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);

  // 5. Lösche Subcollections in players/{playerId} (nur für migrierte Spieler)
  console.log(`\n🗑️  Lösche Subcollections in players/{playerId}...`);
  
  for (const playerId of migratedPlayerIds) {
    for (const subcollectionName of SUBCOLLECTIONS_TO_DELETE) {
      try {
        const subcollectionRef = db.collection(`players/${playerId}/${subcollectionName}`);
        const subcollectionSnap = await subcollectionRef.get();
        
        if (!subcollectionSnap.empty) {
          if (isDryRun) {
            console.log(`   [DRY-RUN] Würde players/${playerId}/${subcollectionName} löschen (${subcollectionSnap.size} Dokumente)`);
          } else {
            // Lösche alle Dokumente in der Subcollection
            const batch = db.batch();
            subcollectionSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`   ✅ players/${playerId}/${subcollectionName} gelöscht (${subcollectionSnap.size} Dokumente)`);
          }
          stats.subcollectionsDeleted++;
          stats.documentsDeleted += subcollectionSnap.size;
        }
      } catch (error) {
        const errorMsg = `Fehler beim Löschen von players/${playerId}/${subcollectionName}: ${error}`;
        console.error(`   ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }
  }
  
  console.log(`   📊 Subcollections: ${stats.subcollectionsDeleted} Subcollections, ${stats.documentsDeleted} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);

  // 6. Zusammenfassung
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ✅ SAFE CLEANUP ABGESCHLOSSEN`);
  console.log(`═══════════════════════════════════════════════════════════`);
  
  console.log(`\nStatistiken:`);
  console.log(`  - Spieler in Gruppe: ${playerIdsToCleanup.length}`);
  console.log(`  - Migrierte Spieler: ${migratedPlayerIds.length}`);
  console.log(`  - Übersprungene Spieler: ${playerIdsToCleanup.length - migratedPlayerIds.length}`);
  console.log(`  - playerComputedStats: ${stats.playerComputedStatsDeleted} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);
  console.log(`  - Subcollections: ${stats.subcollectionsDeleted} Subcollections, ${stats.documentsDeleted} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);
  console.log(`  - Neue Struktur validiert: ${validatedPlayers}/${migratedPlayerIds.length} migrierte Spieler`);
  console.log(`  - Fehler: ${stats.errors.length}`);
  console.log(`  - Modus: ${isDryRun ? 'DRY-RUN' : 'LIVE-DELETION'}`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Fehler aufgetreten:`);
    stats.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  if (isDryRun) {
    console.log(`\n💡 Für echte Löschung verwende:`);
    if (targetGroupId) {
      console.log(`   npm run safe-cleanup-old-data-group -- --confirm`);
    } else {
      console.log(`   npm run safe-cleanup-old-data -- --confirm`);
    }
  } else {
    console.log(`\n🎉 Safe Cleanup erfolgreich abgeschlossen!`);
    console.log(`   Alte Collections wurden sicher gelöscht.`);
    console.log(`   Neue Struktur ist jetzt die einzige Quelle der Wahrheit.`);
    
    if (validatedPlayers === migratedPlayerIds.length) {
      console.log(`   ✅ Alle migrierten Spieler haben gültige neue Struktur!`);
    } else {
      console.log(`   ⚠️  ${migratedPlayerIds.length - validatedPlayers} migrierte Spieler haben Probleme mit der neuen Struktur.`);
    }
    
    if (migratedPlayerIds.length < playerIdsToCleanup.length) {
      console.log(`   ℹ️  ${playerIdsToCleanup.length - migratedPlayerIds.length} Spieler wurden übersprungen (nicht migriert).`);
    }
  }
}

safeCleanupOldPlayerData().catch(error => {
  console.error(`\n💥 KRITISCHER FEHLER beim Safe Cleanup:`, error);
  process.exit(1);
});
