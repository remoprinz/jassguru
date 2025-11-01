#!/usr/bin/env node

/**
 * 🗑️ LÖSCHE ALLE session_end EVENTS AUS ratingHistory
 * 
 * Diese Events sind nicht mehr benötigt (Charts nutzen nur 'game' Events).
 * Löscht ALLE ratingHistory Einträge mit eventType: 'session_end'.
 * 
 * Usage: node functions/scripts/delete-session-end-events.cjs [--dry-run] [--execute]
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

async function deleteSessionEndEvents() {
  console.log('\n🗑️  LÖSCHE session_end EVENTS AUS ratingHistory');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = {
    playersProcessed: 0,
    eventsDeleted: 0,
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

    // 2. Durchsuche ratingHistory für jeden Spieler
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      
      try {
        // Suche nach session_end Events
        const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
        const sessionEndQuery = ratingHistoryRef.where('eventType', '==', 'session_end');
        const sessionEndSnap = await sessionEndQuery.get();

        if (!sessionEndSnap.empty) {
          console.log(`\n👤 ${playerData.displayName || playerId}`);
          console.log(`   session_end Events gefunden: ${sessionEndSnap.size}`);

          // Zeige Session-IDs
          sessionEndSnap.docs.forEach(doc => {
            const data = doc.data();
            const sessionId = data.sessionId || data.eventId || 'unknown';
            const completedAt = data.completedAt?.toDate?.() || data.createdAt?.toDate?.() || 'unknown';
            console.log(`     - ${sessionId} (${completedAt})`);
          });

          if (!DRY_RUN) {
            // Lösche alle session_end Events
            const batch = db.batch();
            sessionEndSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`   ✅ ${sessionEndSnap.size} Events gelöscht!`);
          } else {
            console.log(`   [DRY-RUN] Würde ${sessionEndSnap.size} Events löschen`);
          }

          stats.eventsDeleted += sessionEndSnap.size;
        }

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
    console.log('  ✅ LÖSCHUNG ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Statistiken:');
    console.log(`  - Spieler verarbeitet: ${stats.playersProcessed}`);
    console.log(`  - session_end Events gelöscht: ${stats.eventsDeleted}`);
    console.log(`  - Fehler: ${stats.errors.length}`);
    console.log(`  - Modus: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}\n`);

    if (stats.errors.length > 0) {
      console.log('⚠️  Fehler aufgetreten:');
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (DRY_RUN) {
      console.log('\n💡 Für echte Löschung verwende:');
      console.log(`   node functions/scripts/delete-session-end-events.cjs --execute\n`);
    } else {
      console.log('\n✅ session_end Events erfolgreich gelöscht!');
      console.log('📝 Charts verwenden nur noch "game" Events.\n');
    }

  } catch (error) {
    console.error('\n❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
deleteSessionEndEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

