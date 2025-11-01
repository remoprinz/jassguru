#!/usr/bin/env node

/**
 * 🗑️ LÖSCHE NEUE PARTNER/OPPONENT STATS (NACH RESTORE)
 * 
 * Nach einem Firestore Restore bleiben neue partnerStats/opponentStats erhalten,
 * die nach dem Backup erstellt wurden (z.B. aus Test-Session).
 * 
 * Dieses Script löscht nur die NEUEN Stats, ohne vollständiges Backfill:
 * - Identifiziert Partner/Opponent-Paarungen aus der Test-Session
 * - Prüft ob diese auch in anderen Sessions vorkommen
 * - Löscht nur Dokumente, die NUR in der Test-Session entstanden sind
 * 
 * ⚠️  Für Stats die auch in anderen Sessions vorkommen, siehe --force Option.
 * 
 * Usage: 
 *   node functions/scripts/delete-new-partner-opponent-stats.cjs [--dry-run] [--force]
 * 
 * Options:
 *   --dry-run: Nur anzeigen, keine Änderungen
 *   --force: Lösche ALLE partnerStats/opponentStats (vollständiges Backfill nötig)
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================
// TEST-SESSION ID & BACKUP-DATUM
// ============================================
const TEST_SESSION_ID = 'E2NR2w1QQqhkA9x6TM8E4';
const BACKUP_DATE = new Date('2025-10-31T04:00:00Z'); // Backup-Datum

// Test-Session Teilnehmer
const TEST_SESSION_PLAYERS = {
  'b16c1120111b7d9e7d733837': 'Remo',
  'PLaDRlPBo91yu5Ij8MOT2': 'Studi',
  'EvX9acReG6t45Ws7ZJ1F': 'Toby',
  '8f45eac1b70c8ad7a9a9d9cb': 'Karim'
};

// Neue Opponent-Paarungen aus Test-Session (waren vorher nicht Opponents)
const NEW_OPPONENT_PAIRINGS = [
  ['b16c1120111b7d9e7d733837', '8f45eac1b70c8ad7a9a9d9cb'], // Remo vs Karim
  ['PLaDRlPBo91yu5Ij8MOT2', '8f45eac1b70c8ad7a9a9d9cb'],    // Studi vs Karim
  ['PLaDRlPBo91yu5Ij8MOT2', 'EvX9acReG6t45Ws7ZJ1F'],        // Studi vs Toby
  ['EvX9acReG6t45Ws7ZJ1F', 'PLaDRlPBo91yu5Ij8MOT2'],        // Toby vs Studi
  ['8f45eac1b70c8ad7a9a9d9cb', 'PLaDRlPBo91yu5Ij8MOT2'],    // Karim vs Studi
  ['8f45eac1b70c8ad7a9a9d9cb', 'b16c1120111b7d9e7d733837']  // Karim vs Remo
];

// ============================================
// COMMAND-LINE ARGS
// ============================================
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

if (DRY_RUN) {
  console.log('🔍 DRY-RUN MODUS: Keine Änderungen werden vorgenommen\n');
} else {
  console.log('⚠️  EXECUTE MODUS: Änderungen werden geschrieben!\n');
}

if (FORCE) {
  console.log('⚠️  FORCE MODUS: Lösche ALLE partnerStats/opponentStats!\n');
}

// ============================================
// MAIN FUNCTION
// ============================================

async function deleteNewPartnerOpponentStats() {
  console.log('\n🗑️  LÖSCHE NEUE PARTNER/OPPONENT STATS (NACH RESTORE)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📋 Test-Session ID: ${TEST_SESSION_ID}`);
  console.log(`📅 Backup-Datum: ${BACKUP_DATE.toISOString()}`);
  console.log(`🔧 Modus: ${DRY_RUN ? 'DRY-RUN' : 'LIVE-DELETE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = {
    playersProcessed: 0,
    partnerStatsDeleted: 0,
    opponentStatsDeleted: 0,
    partnerStatsKept: 0,
    opponentStatsKept: 0,
    errors: []
  };

  try {
    // 1. Finde Test-Session und ihre Partner/Opponent-Paarungen
    console.log('📊 Suche Test-Session...');
    
    const groupsSnapshot = await db.collection('groups').get();
    let sessionFound = false;
    let sessionData = null;

    for (const groupDoc of groupsSnapshot.docs) {
      const currentGroupId = groupDoc.id;
      const sessionDoc = await db
        .collection(`groups/${currentGroupId}/jassGameSummaries`)
        .doc(TEST_SESSION_ID)
        .get();

      if (sessionDoc.exists) {
        sessionFound = true;
        sessionData = sessionDoc.data();
        console.log(`   ✅ Test-Session gefunden in Gruppe: ${currentGroupId}`);
        break;
      }
    }

    if (!sessionFound) {
      console.log(`\n⚠️  Test-Session ${TEST_SESSION_ID} nicht gefunden.`);
      console.log('   Möglicherweise wurde sie bereits gelöscht.');
      console.log('   Fahre trotzdem fort und prüfe Stats nach Datum...\n');
    }

    // 2. Identifiziere Partner/Opponent-Paarungen aus Test-Session
    const testSessionPairings = {
      partners: new Set(),
      opponents: new Set()
    };

    if (sessionData) {
      const teams = sessionData.teams;
      if (teams) {
        const topPlayerIds = (teams.top?.players || []).map(p => p.playerId).filter(Boolean);
        const bottomPlayerIds = (teams.bottom?.players || []).map(p => p.playerId).filter(Boolean);

        // Partner-Paarungen
        for (let i = 0; i < topPlayerIds.length; i++) {
          for (let j = i + 1; j < topPlayerIds.length; j++) {
            testSessionPairings.partners.add(`${topPlayerIds[i]}_${topPlayerIds[j]}`);
            testSessionPairings.partners.add(`${topPlayerIds[j]}_${topPlayerIds[i]}`);
          }
        }
        for (let i = 0; i < bottomPlayerIds.length; i++) {
          for (let j = i + 1; j < bottomPlayerIds.length; j++) {
            testSessionPairings.partners.add(`${bottomPlayerIds[i]}_${bottomPlayerIds[j]}`);
            testSessionPairings.partners.add(`${bottomPlayerIds[j]}_${bottomPlayerIds[i]}`);
          }
        }

        // Opponent-Paarungen
        for (const topId of topPlayerIds) {
          for (const bottomId of bottomPlayerIds) {
            testSessionPairings.opponents.add(`${topId}_${bottomId}`);
            testSessionPairings.opponents.add(`${bottomId}_${topId}`);
          }
        }

        console.log(`   📋 Partner-Paarungen in Test-Session: ${testSessionPairings.partners.size / 2}`);
        console.log(`   📋 Opponent-Paarungen in Test-Session: ${testSessionPairings.opponents.size / 2}`);
      }
    }

    // 3. Durchsuche alle Spieler
    console.log('\n👥 Durchsuche Spieler...\n');
    const playersSnapshot = await db.collection('players').get();

    for (const playerDoc of playersSnapshot.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      const displayName = playerData?.displayName || playerId;

      console.log(`\n👤 ${displayName}`);

      // 3a. Prüfe partnerStats
      const partnerStatsRef = db.collection(`players/${playerId}/partnerStats`);
      const partnerStatsSnap = await partnerStatsRef.get();

      for (const partnerDoc of partnerStatsSnap.docs) {
        const partnerId = partnerDoc.id;
        const partnerStats = partnerDoc.data();
        const pairingKey = `${playerId}_${partnerId}`;

        let shouldDelete = false;
        let reason = '';

        if (FORCE) {
          shouldDelete = true;
          reason = 'FORCE mode';
        } else {
          // Prüfe ob diese Paarung nur in Test-Session vorkommt
          const inTestSession = testSessionPairings.partners.has(pairingKey);
          const lastPlayed = partnerStats.lastPlayedWithTimestamp;
          
          if (lastPlayed && typeof lastPlayed.toDate === 'function') {
            const lastPlayedDate = lastPlayed.toDate();
            const isAfterBackup = lastPlayedDate > BACKUP_DATE;
            
            if (inTestSession && isAfterBackup) {
              // Prüfe ob nur 1 Session gespielt
              const sessionsPlayed = partnerStats.sessionsPlayedWith || 0;
              if (sessionsPlayed === 1) {
                shouldDelete = true;
                reason = 'Nur in Test-Session';
              } else {
                reason = `Behalten (${sessionsPlayed} Sessions, braucht Backfill)`;
              }
            }
          }
        }

        if (shouldDelete) {
          console.log(`   🗑️  partnerStats/${partnerId}: ${reason}`);
          if (!DRY_RUN) {
            await partnerDoc.ref.delete();
          }
          stats.partnerStatsDeleted++;
        } else if (reason) {
          console.log(`   ✅ partnerStats/${partnerId}: ${reason}`);
          stats.partnerStatsKept++;
        }
      }

      // 3b. Prüfe opponentStats
      const opponentStatsRef = db.collection(`players/${playerId}/opponentStats`);
      const opponentStatsSnap = await opponentStatsRef.get();

      for (const opponentDoc of opponentStatsSnap.docs) {
        const opponentId = opponentDoc.id;
        const opponentStats = opponentDoc.data();
        const opponentName = TEST_SESSION_PLAYERS[opponentId] || opponentId;

        let shouldDelete = false;
        let reason = '';

        if (FORCE) {
          shouldDelete = true;
          reason = 'FORCE mode';
        } else {
          // Prüfe ob diese Paarung in der Liste der neuen Paarungen ist
          const isNewPairing = NEW_OPPONENT_PAIRINGS.some(
            ([p1, p2]) => (p1 === playerId && p2 === opponentId)
          );

          if (isNewPairing) {
            // Prüfe ob wirklich nur 1 Session (aus Test-Session)
            const sessionsPlayed = opponentStats.sessionsPlayedAgainst || 0;
            const lastPlayed = opponentStats.lastPlayedAgainstTimestamp;
            
            let isAfterBackup = false;
            if (lastPlayed) {
              let date;
              if (typeof lastPlayed.toDate === 'function') {
                date = lastPlayed.toDate();
              } else if (lastPlayed.seconds) {
                date = new Date(lastPlayed.seconds * 1000);
              }
              isAfterBackup = date && date > BACKUP_DATE;
            }

            if (sessionsPlayed === 1 && isAfterBackup) {
              shouldDelete = true;
              reason = 'Nur in Test-Session (neue Paarung)';
            } else {
              reason = `Behalten (${sessionsPlayed} Sessions, braucht Backfill)`;
            }
          }
        }

        if (shouldDelete) {
          console.log(`   🗑️  opponentStats/${opponentName} (${opponentId}): ${reason}`);
          if (!DRY_RUN) {
            await opponentDoc.ref.delete();
          }
          stats.opponentStatsDeleted++;
        } else if (!shouldDelete && Object.keys(TEST_SESSION_PLAYERS).includes(opponentId)) {
          console.log(`   ✅ opponentStats/${opponentName} (${opponentId}): Behalten (war schon vorher)`);
          stats.opponentStatsKept++;
        }
      }

      stats.playersProcessed++;
    }

    // 4. Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ LÖSCHUNG ABGESCHLOSSEN');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Statistiken:');
    console.log(`  - Spieler verarbeitet: ${stats.playersProcessed}`);
    console.log(`  - partnerStats gelöscht: ${stats.partnerStatsDeleted}`);
    console.log(`  - opponentStats gelöscht: ${stats.opponentStatsDeleted}`);
    console.log(`  - partnerStats behalten: ${stats.partnerStatsKept}`);
    console.log(`  - opponentStats behalten: ${stats.opponentStatsKept}`);
    console.log(`  - Modus: ${DRY_RUN ? 'DRY-RUN' : 'LIVE-DELETE'}\n`);

    if (stats.partnerStatsKept > 0 || stats.opponentStatsKept > 0) {
      console.log('⚠️  WICHTIG: Einige Stats wurden behalten, weil sie auch in anderen Sessions vorkommen.');
      console.log('   Diese müssen durch Backfill korrigiert werden:');
      console.log('   node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs\n');
    }

    if (DRY_RUN) {
      console.log('\n💡 Für echte Löschung verwende:');
      console.log(`   node functions/scripts/delete-new-partner-opponent-stats.cjs\n`);
    } else {
      console.log('\n✅ Neue Partner/Opponent Stats gelöscht!');
      
      if (stats.partnerStatsKept === 0 && stats.opponentStatsKept === 0) {
        console.log('📝 Kein weiteres Backfill nötig - alle neuen Stats wurden gelöscht! ✅\n');
      } else {
        console.log('📝 NÄCHSTER SCHRITT: Backfill für behaltene Stats');
        console.log('   node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs\n');
      }
    }

  } catch (error) {
    console.error('\n❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
deleteNewPartnerOpponentStats()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

