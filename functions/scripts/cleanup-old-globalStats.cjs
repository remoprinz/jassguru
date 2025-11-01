#!/usr/bin/env node

/**
 * 🧹 CLEANUP: Alte globalStats ohne .current löschen
 * 
 * Löscht alle globalStats Felder die NICHT in globalStats.current sind.
 * Diese sind veraltet und enthalten NaN-Werte.
 * 
 * Usage: node functions/scripts/cleanup-old-globalStats.cjs [--dry-run] [--execute]
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================
// COMMAND-LINE ARGS
// ============================================
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');

if (DRY_RUN) {
  console.log('🔍 DRY-RUN MODUS: Keine Änderungen werden vorgenommen\n');
} else {
  console.log('⚠️  EXECUTE MODUS: Änderungen werden geschrieben!\n');
}

// ============================================
// MAIN FUNCTION
// ============================================

async function cleanupOldGlobalStats() {
  console.log('\n🧹 CLEANUP: Alte globalStats ohne .current');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = {
    playersProcessed: 0,
    playersCleaned: 0,
    fieldsDeleted: 0,
    errors: []
  };

  try {
    // 1. Lade alle Spieler
    console.log('📊 Lade alle Spieler...');
    const playersSnap = await db.collection('players').get();
    console.log(`   Gefunden: ${playersSnap.size} Spieler\n`);

    if (playersSnap.empty) {
      console.log('❌ Keine Spieler gefunden!');
      return;
    }

    // 2. Prüfe jeden Spieler
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      
      try {
        // Prüfe ob globalStats existiert UND ob es alte Felder hat
        const globalStats = playerData.globalStats;
        
        if (!globalStats) {
          // Kein globalStats - überspringe
          continue;
        }

        // Prüfe ob globalStats.current existiert
        if (!globalStats.current) {
          console.log(`⚠️  ${playerId}: globalStats hat kein .current`);
          continue;
        }

        // Sammle alle Felder die NICHT 'current' sind
        const fieldsToDelete = [];
        for (const key in globalStats) {
          if (key !== 'current') {
            fieldsToDelete.push(`globalStats.${key}`);
          }
        }

        if (fieldsToDelete.length === 0) {
          // Keine alten Felder - überspringe
          continue;
        }

        console.log(`\n👤 ${playerData.displayName || playerId}`);
        console.log(`   Felder zum Löschen: ${fieldsToDelete.length}`);
        fieldsToDelete.forEach(field => console.log(`     - ${field}`));

        if (!DRY_RUN) {
          // Erstelle Update-Objekt mit FieldValue.delete()
          const updateObj = {};
          fieldsToDelete.forEach(field => {
            updateObj[field] = admin.firestore.FieldValue.delete();
          });

          await db.collection('players').doc(playerId).update(updateObj);
          console.log(`   ✅ Gelöscht!`);
        } else {
          console.log(`   [DRY-RUN] Würde löschen`);
        }

        stats.playersCleaned++;
        stats.fieldsDeleted += fieldsToDelete.length;
        stats.playersProcessed++;

      } catch (error) {
        const errorMsg = `Fehler bei ${playerId}: ${error.message}`;
        console.error(`   ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
        stats.playersProcessed++;
      }
    }

    // 3. Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ CLEANUP ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Statistiken:');
    console.log(`  - Spieler verarbeitet: ${stats.playersProcessed}`);
    console.log(`  - Spieler bereinigt: ${stats.playersCleaned}`);
    console.log(`  - Felder gelöscht: ${stats.fieldsDeleted}`);
    console.log(`  - Fehler: ${stats.errors.length}`);
    console.log(`  - Modus: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}\n`);

    if (stats.errors.length > 0) {
      console.log('⚠️  Fehler aufgetreten:');
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (DRY_RUN) {
      console.log('\n💡 Für echte Bereinigung verwende:');
      console.log(`   node functions/scripts/cleanup-old-globalStats.cjs --execute\n`);
    } else {
      console.log('\n✅ Alte globalStats erfolgreich gelöscht!');
      console.log('📝 NÄCHSTER SCHRITT: Führe Backfill aus:\n');
      console.log('   npm run backfill-player-data -- --confirm\n');
    }

  } catch (error) {
    console.error('\n❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
cleanupOldGlobalStats()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

