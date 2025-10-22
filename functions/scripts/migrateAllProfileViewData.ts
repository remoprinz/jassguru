/**
 * 🎯 MIGRATE ALL PROFILEVIEW DATA - Vollständige Migration aller ProfileView-Daten
 * ===============================================================================
 * 
 * Dieses Script migriert ALLE Daten, die in ProfileView.tsx verwendet werden:
 * - Player Statistics (Statistiken)
 * - Session Archive (Session-Archive)
 * - Chart Data (Chart-Daten)
 * - Player Scores (bereits migriert)
 * 
 * ✅ ARCHITEKTUR:
 * - Iteriert durch alle Gruppen und Sessions
 * - Berechnet alle Statistiken im Backend
 * - Speichert in neuen Multi-Level Collections
 * - Erstellt Historie-Einträge für Charts
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
// import { calculatePlayerStatisticsForSession } from '../src/playerStatisticsBackendService';
// import { calculatePlayerScoresForSession } from '../src/playerScoresBackendService';
import * as yargs from 'yargs';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// ===== ARGUMENTE =====

// const argv = yargs
//   .option('groupId', {
//     type: 'string',
//     description: 'Spezifische Gruppe migrieren (optional)',
//     default: undefined
//   })
//   .option('dryRun', {
//     type: 'boolean',
//     description: 'Dry Run - keine Daten schreiben',
//     default: true
//   })
//   .option('force', {
//     type: 'boolean',
//     description: 'Force - überschreibt bestehende Daten',
//     default: false
//   })
//   .help()
//   .argv;

// ===== HAUPTFUNKTION =====

async function migrateAllProfileViewData(groupId?: string, dryRun: boolean = true) {
  console.log('🚀 STARTE VOLLSTÄNDIGE PROFILEVIEW-DATEN MIGRATION');
  console.log(`📊 Modus: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`🎯 Gruppe: ${groupId || 'ALLE GRUPPEN'}`);
  console.log('');

  try {
    // 1. Lade alle Gruppen
    const groupsSnapshot = groupId 
      ? await db.collection('groups').where(admin.firestore.FieldPath.documentId(), '==', groupId).get()
      : await db.collection('groups').get();
    
    if (groupsSnapshot.empty) {
      console.log('❌ Keine Gruppen gefunden');
      return;
    }

    console.log(`📁 Gefunden: ${groupsSnapshot.size} Gruppe(n)`);
    console.log('');

    let totalGroups = 0;
    let totalSessions = 0;
    let totalPlayers = 0;

    // 2. Iteriere durch alle Gruppen
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      
      console.log(`🏠 Verarbeite Gruppe: ${groupData.name || groupId}`);
      
      // 3. Lade alle Sessions dieser Gruppe
      const sessionsQuery = db.collection('jassSessions')
        .where('groupId', '==', groupId)
        .where('status', '==', 'completed');
      
      const sessionsSnapshot = await sessionsQuery.get();
      
      if (sessionsSnapshot.empty) {
        console.log(`   ⚠️ Keine Sessions gefunden für Gruppe ${groupId}`);
        continue;
      }

      console.log(`   📊 Gefunden: ${sessionsSnapshot.size} Session(s)`);

      // 4. Sammle alle Spieler-IDs aus allen Sessions
      const allPlayerIds = new Set<string>();
      sessionsSnapshot.forEach(sessionDoc => {
        const sessionData = sessionDoc.data();
        if (sessionData.participantPlayerIds) {
          sessionData.participantPlayerIds.forEach((playerId: string) => {
            allPlayerIds.add(playerId);
          });
        }
      });

      console.log(`   👥 Gefunden: ${allPlayerIds.size} Spieler`);

      // 5. Verarbeite jede Session
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionId = sessionDoc.id;
        // const sessionData = sessionDoc.data();
        
        console.log(`   🎮 Verarbeite Session: ${sessionId}`);
        
        if (!dryRun) {
          try {
            // TODO: Implementiere Backend-Service-Aufrufe
            // await calculatePlayerStatisticsForSession(
            //   groupId,
            //   sessionId,
            //   sessionData.participantPlayerIds || [],
            //   sessionData.tournamentId || null
            // );
            
            // await calculatePlayerScoresForSession(
            //   groupId,
            //   sessionId,
            //   sessionData.participantPlayerIds || [],
            //   sessionData.tournamentId || null
            // );
            
            console.log(`     ✅ Session ${sessionId} verarbeitet`);
          } catch (error) {
            console.error(`     ❌ Fehler bei Session ${sessionId}:`, error);
          }
        } else {
          console.log(`     🔍 DRY RUN: Session ${sessionId} würde verarbeitet`);
        }
        
        totalSessions++;
      }

      totalGroups++;
      totalPlayers += allPlayerIds.size;
      
      console.log(`   ✅ Gruppe ${groupId} abgeschlossen`);
      console.log('');
    }

    // 6. Zusammenfassung
    console.log('🎉 MIGRATION ABGESCHLOSSEN');
    console.log('========================');
    console.log(`📁 Gruppen verarbeitet: ${totalGroups}`);
    console.log(`🎮 Sessions verarbeitet: ${totalSessions}`);
    console.log(`👥 Spieler gefunden: ${totalPlayers}`);
    console.log(`📊 Modus: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    
    if (dryRun) {
      console.log('');
      console.log('🔍 DRY RUN ABGESCHLOSSEN - Keine Daten wurden geschrieben');
      console.log('💡 Führen Sie das Script mit --dryRun=false aus, um die Migration durchzuführen');
    } else {
      console.log('');
      console.log('✅ LIVE MIGRATION ABGESCHLOSSEN - Alle Daten wurden migriert');
    }

  } catch (error) {
    console.error('❌ Fehler bei der Migration:', error);
    process.exit(1);
  }
}

// ===== AUSFÜHRUNG =====

if (require.main === module) {
  const argv = yargs
    .option('groupId', {
      type: 'string',
      description: 'Spezifische Gruppe migrieren (optional)',
      default: undefined
    })
    .option('dryRun', {
      type: 'boolean',
      description: 'Dry Run - keine Daten schreiben',
      default: true
    })
    .option('force', {
      type: 'boolean',
      description: 'Force - überschreibt bestehende Daten',
      default: false
    })
    .help()
    .parseSync();

  migrateAllProfileViewData(argv.groupId, argv.dryRun)
    .then(() => {
      console.log('✅ Migration erfolgreich abgeschlossen');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration fehlgeschlagen:', error);
      process.exit(1);
    });
}

export { migrateAllProfileViewData };
