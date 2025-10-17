#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';
import { backfillRatingHistoryForGroup, testSanitizeFunction } from './backfillRatingHistory';

/**
 * Script zur Ausführung des Rating History Backfill
 * Initialisiert Firebase Admin SDK und führt das Backfill aus
 */
async function runBackfill() {
  try {
    console.log('🚀 Starte Rating History Backfill Script...');
    
    // Firebase Admin SDK initialisieren mit Service Account Key
    const serviceAccountPath = path.resolve(__dirname, '../../../serviceAccountKey.json');
    console.log(`📁 Service Account Pfad: ${serviceAccountPath}`);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin SDK initialisiert');
    }

    // Determine execution mode
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--execute');
    const testMode = args.includes('--test');
    const groupId = args.find(arg => arg.startsWith('--groupId='))?.split('=')[1];
    
    console.log(`📋 Modus: ${dryRun ? '🔍 DRY RUN (Vorschau)' : '⚡ EXECUTE (macht Änderungen!)'}`);
    
    if (testMode) {
      console.log('🧪 Test-Modus: Validiere Sanitize-Funktion...');
      testSanitizeFunction();
      console.log('✅ Sanitize-Test abgeschlossen!');
      return;
    }
    
    if (!groupId) {
      console.error('❌ Fehler: Gruppen-ID erforderlich!');
      console.log('💡 Verwendung: npm run backfill-rating-history -- --groupId=DEINE_GRUPPEN_ID [--execute]');
      console.log('💡 Beispiel: npm run backfill-rating-history -- --groupId=Tz0wgIHMTlhvTtFastiJ --execute');
      process.exit(1);
    }
    
    console.log(`🎯 Gruppen-ID: ${groupId}`);
    console.log('');
    
    if (dryRun) {
      console.log('💡 Dies ist ein DRY RUN. Es werden keine Änderungen vorgenommen.');
      console.log('💡 Zum Ausführen: npm run backfill-rating-history -- --groupId=' + groupId + ' --execute');
      console.log('');
    }
    
    // Backfill ausführen
    console.log('🔄 Starte Backfill-Prozess...');
    await backfillRatingHistoryForGroup(groupId, !dryRun);
    
    console.log('');
    console.log('✅ Rating History Backfill erfolgreich abgeschlossen!');
    
    if (dryRun) {
      console.log('');
      console.log('📋 Nächste Schritte:');
      console.log('1. Logs oben überprüfen');
      console.log('2. Falls korrekt: npm run backfill-rating-history -- --groupId=' + groupId + ' --execute');
      console.log('3. Nach Ausführung: Rating-Historie in der App prüfen');
    } else {
      console.log('🎉 Rating-Historie wurde erfolgreich erstellt!');
      console.log('📊 Prüfe die Rating-Historie in der App unter dem Profil der Spieler.');
    }
  } catch (error) {
    console.error('💥 Unerwarteter Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
runBackfill();
