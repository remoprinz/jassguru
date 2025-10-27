import * as admin from 'firebase-admin';
import { Command } from 'commander';

// Initialize Firebase Admin SDK
admin.initializeApp({
  projectId: 'jassguru'
});
const db = admin.firestore();

const program = new Command();
program
  .option('--dry-run', 'Do not delete any data, just simulate the cleanup')
  .option('--group-id <id>', 'Cleanup only players belonging to a specific group ID')
  .option('--confirm', 'Confirm deletion (required for actual cleanup)')
  .parse(process.argv);

const options = program.opts();
const isDryRun = options.dryRun;
const targetGroupId = options.groupId;
const isConfirmed = options.confirm;

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`  🗑️  CLEANUP: ALTE PLAYER DATA COLLECTIONS`);
console.log(`═══════════════════════════════════════════════════════════`);

if (isDryRun) {
  console.log(`⚠️  DRY-RUN MODE: Keine Daten werden tatsächlich gelöscht!`);
} else if (!isConfirmed) {
  console.log(`❌ FEHLER: --confirm Flag ist erforderlich für echte Löschung!`);
  console.log(`   Verwende: npm run cleanup-old-data -- --confirm`);
  process.exit(1);
} else {
  console.log(`🚨 ACHTUNG: Dies ist KEIN Dry-Run!`);
  console.log(`   Daten werden tatsächlich gelöscht!`);
}

console.log(`\nKonfiguration:`);
console.log(`  - Dry-Run: ${isDryRun}`);
console.log(`  - Group ID: ${targetGroupId || 'all'}`);
console.log(`  - Confirmed: ${isConfirmed}`);

// Subcollections die gelöscht werden sollen
const SUBCOLLECTIONS_TO_DELETE = [
  'currentScores',
  'currentStatistics'
];

async function cleanupOldPlayerData() {
  const playerIdsToCleanup: string[] = [];

  // 1. Hole alle Spieler-IDs
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

  if (playerIdsToCleanup.length === 0) {
    console.log(`\n❌ Keine Spieler gefunden. Cleanup abgebrochen.`);
    return;
  }

  console.log(`\n🎯 Spieler für Cleanup: ${playerIdsToCleanup.join(', ')}`);

  // 2. Lösche playerComputedStats Collection
  console.log(`\n🗑️  Lösche playerComputedStats Collection...`);
  let deletedComputedStats = 0;
  
  for (const playerId of playerIdsToCleanup) {
    const docRef = db.collection('playerComputedStats').doc(playerId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      if (isDryRun) {
        console.log(`   [DRY-RUN] Würde playerComputedStats/${playerId} löschen`);
      } else {
        await docRef.delete();
        console.log(`   ✅ playerComputedStats/${playerId} gelöscht`);
      }
      deletedComputedStats++;
    }
  }
  
  console.log(`   📊 playerComputedStats: ${deletedComputedStats} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);

  // 3. Lösche Subcollections in players/{playerId}
  console.log(`\n🗑️  Lösche Subcollections in players/{playerId}...`);
  let deletedSubcollections = 0;
  
  for (const playerId of playerIdsToCleanup) {
    for (const subcollectionName of SUBCOLLECTIONS_TO_DELETE) {
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
        deletedSubcollections += subcollectionSnap.size;
      }
    }
  }
  
  console.log(`   📊 Subcollections: ${deletedSubcollections} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);

  // 4. Zusammenfassung
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ✅ CLEANUP ABGESCHLOSSEN`);
  console.log(`═══════════════════════════════════════════════════════════`);
  
  console.log(`\nStatistiken:`);
  console.log(`  - Spieler verarbeitet: ${playerIdsToCleanup.length}`);
  console.log(`  - playerComputedStats: ${deletedComputedStats} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);
  console.log(`  - Subcollections: ${deletedSubcollections} Dokumente ${isDryRun ? 'würden gelöscht' : 'gelöscht'}`);
  console.log(`  - Modus: ${isDryRun ? 'DRY-RUN' : 'LIVE-DELETION'}`);
  
  if (isDryRun) {
    console.log(`\n💡 Für echte Löschung verwende:`);
    if (targetGroupId) {
      console.log(`   npm run cleanup-old-data-group -- --confirm`);
    } else {
      console.log(`   npm run cleanup-old-data -- --confirm`);
    }
  } else {
    console.log(`\n🎉 Cleanup erfolgreich abgeschlossen!`);
    console.log(`   Alte Collections wurden gelöscht.`);
    console.log(`   Neue Struktur ist jetzt die einzige Quelle der Wahrheit.`);
  }
}

cleanupOldPlayerData().catch(console.error);
