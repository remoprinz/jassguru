#!/usr/bin/env node

/**
 * 🗑️ LÖSCHE TEST-SESSION VOLLSTÄNDIG
 * 
 * Löscht die Test-Session vom 1. November 2025 und ALLE ihre abgeleiteten Daten:
 * - groups/{groupId}/jassGameSummaries/{sessionId} (die Session selbst)
 * - players/{id}/ratingHistory/* (alle Einträge mit sessionId)
 * - players/{id}/scoresHistory/* (alle Einträge mit sessionId)
 * - Korrigiert globalStats (entfernt NaN-Werte)
 * 
 * ⚠️  WICHTIG: partnerStats/opponentStats werden NICHT hier gelöscht!
 *    Sie müssen durch Backfill neu berechnet werden:
 *    node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
 * 
 *    Das Backfill-Script löscht ALLE partnerStats/opponentStats und berechnet sie
 *    neu OHNE die Test-Session. Dadurch verschwinden neue Stats (z.B. Remo-Karim)
 *    die nur in der Test-Session entstanden sind.
 * 
 * Usage: node functions/scripts/delete-test-session-complete.cjs [--dry-run]
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================
// TEST-SESSION ID
// ============================================
const TEST_SESSION_ID = 'E2NR2w1QQqhkA9x6TM8E4';

// ============================================
// COMMAND-LINE ARGS
// ============================================
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

if (DRY_RUN) {
  console.log('🔍 DRY-RUN MODUS: Keine Änderungen werden vorgenommen\n');
} else {
  console.log('⚠️  EXECUTE MODUS: Änderungen werden geschrieben!\n');
}

// ============================================
// MAIN FUNCTION
// ============================================

async function deleteTestSessionComplete() {
  console.log('\n🗑️  LÖSCHE TEST-SESSION VOLLSTÄNDIG');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📋 Session ID: ${TEST_SESSION_ID}`);
  console.log(`🔧 Modus: ${DRY_RUN ? 'DRY-RUN' : 'LIVE-DELETE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = {
    sessionDeleted: false,
    playersProcessed: 0,
    ratingHistoryDeleted: 0,
    scoresHistoryDeleted: 0,
    globalStatsFixed: 0,
    errors: []
  };

  try {
    // 1. Finde Session in jassGameSummaries
    console.log('📊 Suche Session in jassGameSummaries...');
    
    const groupsSnapshot = await db.collection('groups').get();
    let sessionFound = false;
    let groupId = null;
    let sessionData = null;

    for (const groupDoc of groupsSnapshot.docs) {
      const currentGroupId = groupDoc.id;
      const sessionDoc = await db
        .collection(`groups/${currentGroupId}/jassGameSummaries`)
        .doc(TEST_SESSION_ID)
        .get();

      if (sessionDoc.exists) {
        sessionFound = true;
        groupId = currentGroupId;
        sessionData = sessionDoc.data();
        
        console.log(`   ✅ Session gefunden in Gruppe: ${groupId}`);
        console.log(`   📅 Erstellt: ${sessionData.completedAt?.toDate() || 'unbekannt'}`);
        
        // Lösche Session
        if (!DRY_RUN) {
          await sessionDoc.ref.delete();
          console.log(`   ✅ Session gelöscht!`);
          stats.sessionDeleted = true;
        } else {
          console.log(`   [DRY-RUN] Würde Session löschen`);
        }
        break;
      }
    }

    if (!sessionFound) {
      console.log(`\n⚠️  Session ${TEST_SESSION_ID} nicht in jassGameSummaries gefunden.`);
      console.log('   Möglicherweise wurde sie bereits gelöscht oder existiert nicht.');
      console.log('   Versuche trotzdem, ratingHistory/scoresHistory Einträge zu finden...\n');
    }

    // 2. Finde alle Spieler die an dieser Session teilgenommen haben
    const participantPlayerIds = sessionData?.participantPlayerIds || [];
    const allPlayerIds = new Set(participantPlayerIds);

    if (allPlayerIds.size === 0) {
      console.log('📊 Suche Spieler über ratingHistory...');
      const playersSnapshot = await db.collection('players').get();
      
      for (const playerDoc of playersSnapshot.docs) {
        const ratingHistoryRef = db.collection(`players/${playerDoc.id}/ratingHistory`);
        const ratingHistorySnap = await ratingHistoryRef
          .where('sessionId', '==', TEST_SESSION_ID)
          .limit(1)
          .get();
        
        if (!ratingHistorySnap.empty) {
          allPlayerIds.add(playerDoc.id);
        }
      }
    }

    console.log(`\n👥 Spieler gefunden: ${allPlayerIds.size}\n`);

    // 3. Lösche ratingHistory und scoresHistory für jeden Spieler
    for (const playerId of allPlayerIds) {
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        const playerData = playerDoc.data();
        const displayName = playerData?.displayName || playerId;

        console.log(`\n👤 Verarbeite Spieler: ${displayName}`);

        // 3a. Lösche ratingHistory Einträge
        const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
        const ratingHistoryQuery = ratingHistoryRef.where('sessionId', '==', TEST_SESSION_ID);
        const ratingHistorySnap = await ratingHistoryQuery.get();

        if (!ratingHistorySnap.empty) {
          console.log(`   📉 ratingHistory: ${ratingHistorySnap.size} Einträge gefunden`);
          
          if (!DRY_RUN) {
            const batch = db.batch();
            ratingHistorySnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`   ✅ ratingHistory: ${ratingHistorySnap.size} Einträge gelöscht`);
          } else {
            console.log(`   [DRY-RUN] Würde ${ratingHistorySnap.size} ratingHistory Einträge löschen`);
          }
          
          stats.ratingHistoryDeleted += ratingHistorySnap.size;
        }

        // 3b. Lösche scoresHistory Einträge
        const scoresHistoryRef = db.collection(`players/${playerId}/scoresHistory`);
        const scoresHistoryQuery = scoresHistoryRef.where('sessionId', '==', TEST_SESSION_ID);
        const scoresHistorySnap = await scoresHistoryQuery.get();

        if (!scoresHistorySnap.empty) {
          console.log(`   📊 scoresHistory: ${scoresHistorySnap.size} Einträge gefunden`);
          
          if (!DRY_RUN) {
            const batch = db.batch();
            scoresHistorySnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`   ✅ scoresHistory: ${scoresHistorySnap.size} Einträge gelöscht`);
          } else {
            console.log(`   [DRY-RUN] Würde ${scoresHistorySnap.size} scoresHistory Einträge löschen`);
          }
          
          stats.scoresHistoryDeleted += scoresHistorySnap.size;
        }

        // 3c. Prüfe und fixe globalStats (entferne NaN-Werte)
        const globalStats = playerData?.globalStats;
        if (globalStats && globalStats.current) {
          // Prüfe ob es alte NaN-Felder gibt
          const hasNaNFields = Object.keys(globalStats).some(key => {
            if (key === 'current') return false;
            const value = globalStats[key];
            if (typeof value === 'object' && value !== null) {
              return Object.values(value).some(v => typeof v === 'number' && isNaN(v));
            }
            return typeof value === 'number' && isNaN(value);
          });

          if (hasNaNFields) {
            console.log(`   🔧 globalStats: NaN-Werte gefunden`);
            
            if (!DRY_RUN) {
              // Lösche alle globalStats Felder außer 'current'
              const updateObj = {};
              Object.keys(globalStats).forEach(key => {
                if (key !== 'current') {
                  updateObj[`globalStats.${key}`] = admin.firestore.FieldValue.delete();
                }
              });
              
              if (Object.keys(updateObj).length > 0) {
                await db.collection('players').doc(playerId).update(updateObj);
                console.log(`   ✅ globalStats: NaN-Felder gelöscht`);
                stats.globalStatsFixed++;
              }
            } else {
              console.log(`   [DRY-RUN] Würde NaN-Felder aus globalStats löschen`);
            }
          }
        }

        stats.playersProcessed++;

      } catch (error) {
        const errorMsg = `Fehler bei Spieler ${playerId}: ${error.message}`;
        console.error(`   ❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
        stats.playersProcessed++;
      }
    }

    // 4. Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ LÖSCHUNG ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Statistiken:');
    console.log(`  - Session gelöscht: ${stats.sessionDeleted ? 'Ja' : 'Nein'}`);
    console.log(`  - Spieler verarbeitet: ${stats.playersProcessed}`);
    console.log(`  - ratingHistory gelöscht: ${stats.ratingHistoryDeleted}`);
    console.log(`  - scoresHistory gelöscht: ${stats.scoresHistoryDeleted}`);
    console.log(`  - globalStats bereinigt: ${stats.globalStatsFixed}`);
    console.log(`  - Fehler: ${stats.errors.length}`);
    console.log(`  - Modus: ${DRY_RUN ? 'DRY-RUN' : 'LIVE-DELETE'}\n`);

    if (stats.errors.length > 0) {
      console.log('⚠️  Fehler aufgetreten:');
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (DRY_RUN) {
      console.log('\n💡 Für echte Löschung verwende:');
      console.log(`   node functions/scripts/delete-test-session-complete.cjs\n`);
    } else {
      console.log('\n✅ Test-Session vollständig gelöscht!');
      console.log('📝 NÄCHSTE SCHRITTE:');
      console.log('   1. Prüfe ob Session weg ist:');
      console.log(`      Firestore Console → groups/{groupId}/jassGameSummaries`);
      console.log('   2. Prüfe ob Player Stats korrekt sind:');
      console.log(`      Firestore Console → players/{playerId}/globalStats.current`);
      console.log('   3. ⚠️  WICHTIG: Führe Partner/Opponent Stats Backfill aus!');
      console.log('      Das entfernt neue Stats die nur in Test-Session entstanden:');
      console.log('      node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs');
      console.log('   4. Optional: Weitere Backfills');
      console.log('      npm run backfill-player-data -- --confirm');
      console.log('      node backfill-groupstats.cjs\n');
    }

  } catch (error) {
    console.error('\n❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
deleteTestSessionComplete()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

