import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { backfillPlayerScores } from './backfillPlayerScores';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 🎯 MIGRATION SCRIPT: Backfill Player Scores für alle Spieler
 * 
 * Dieses Script migriert alle historischen Daten zu der neuen Player Scores Struktur.
 * Es sollte NUR nach einem Datenbackup ausgeführt werden!
 */
async function migrateAllPlayerScores(): Promise<void> {
  try {
    logger.info('🚀 STARTE VOLLSTÄNDIGE PLAYER SCORES MIGRATION');
    logger.info('⚠️  WARNUNG: Dieses Script verändert die Datenbank!');
    
    const startTime = Date.now();
    
    // 1. Statistiken sammeln
    const stats = await collectMigrationStats();
    logger.info(`📊 MIGRATION STATISTIKEN:`);
    logger.info(`   - Gruppen: ${stats.groupCount}`);
    logger.info(`   - Spieler: ${stats.playerCount}`);
    logger.info(`   - Sessions: ${stats.sessionCount}`);
    logger.info(`   - Geschätzte Zeit: ${Math.ceil(stats.playerCount / 10)} Minuten`);
    
    // 2. Bestätigung
    logger.info('🔄 Starte Migration...');
    
    // 3. Migration ausführen
    await backfillPlayerScores(undefined, undefined, false); // Alle Spieler, nicht DryRun
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    logger.info('✅ MIGRATION ERFOLGREICH ABGESCHLOSSEN!');
    logger.info(`⏱️  Dauer: ${duration} Sekunden`);
    logger.info(`📊 Verarbeitet: ${stats.playerCount} Spieler`);
    
    // 4. Validierung
    await validateMigration();
    
  } catch (error) {
    logger.error('❌ KRITISCHER FEHLER BEI DER MIGRATION:', error);
    throw error;
  }
}

/**
 * 🎯 Sammle Migration-Statistiken
 */
async function collectMigrationStats(): Promise<{
  groupCount: number;
  playerCount: number;
  sessionCount: number;
}> {
  try {
    // Zähle Gruppen
    const groupsSnap = await db.collection('groups').get();
    const groupCount = groupsSnap.size;
    
    // Zähle Spieler
    const playersSnap = await db.collection('players').get();
    const playerCount = playersSnap.size;
    
    // Zähle Sessions (ungefähr)
    let sessionCount = 0;
    for (const groupDoc of groupsSnap.docs) {
      const sessionsSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      sessionCount += sessionsSnap.size;
    }
    
    return { groupCount, playerCount, sessionCount };
    
  } catch (error) {
    logger.error('Fehler beim Sammeln der Statistiken:', error);
    return { groupCount: 0, playerCount: 0, sessionCount: 0 };
  }
}

/**
 * 🎯 Validiere Migration
 */
async function validateMigration(): Promise<void> {
  try {
    logger.info('🔍 VALIDIERE MIGRATION...');
    
    // Prüfe einige zufällige Spieler
    const playersSnap = await db.collection('players').limit(5).get();
    let validCount = 0;
    
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      
      // Prüfe currentScores
      const currentScoresDoc = await db.collection(`players/${playerId}/currentScores`).doc('latest').get();
      if (currentScoresDoc.exists) {
        const data = currentScoresDoc.data();
        if (data?.global && data?.groups && data?.partners && data?.opponents) {
          validCount++;
          logger.info(`✅ Spieler ${playerId}: Scores vorhanden`);
        } else {
          logger.warn(`⚠️  Spieler ${playerId}: Unvollständige Scores`);
        }
      } else {
        logger.warn(`⚠️  Spieler ${playerId}: Keine Scores gefunden`);
      }
    }
    
    logger.info(`🔍 VALIDIERUNG: ${validCount}/${playersSnap.size} Spieler haben korrekte Scores`);
    
    if (validCount === playersSnap.size) {
      logger.info('✅ VALIDIERUNG ERFOLGREICH!');
    } else {
      logger.warn('⚠️  VALIDIERUNG: Einige Spieler haben möglicherweise unvollständige Scores');
    }
    
  } catch (error) {
    logger.error('Fehler bei der Validierung:', error);
  }
}

// Cleanup-Funktion entfernt (nicht verwendet)

// ===== MAIN EXECUTION =====

if (require.main === module) {
  migrateAllPlayerScores()
    .then(() => {
      logger.info('🎉 MIGRATION SCRIPT ERFOLGREICH ABGESCHLOSSEN!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 MIGRATION SCRIPT FEHLGESCHLAGEN:', error);
      process.exit(1);
    });
}

export { migrateAllPlayerScores };
