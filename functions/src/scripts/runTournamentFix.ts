#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';
import { runTournamentFix } from './fixTournamentDocument';

/**
 * Script zur Ausführung der Tournament-Fix-Funktion
 * Initialisiert Firebase Admin SDK und führt die Korrektur aus
 */
async function runFix() {
  try {
    console.log('🔧 Starte Tournament Fix Script...');
    
    // Firebase Admin SDK initialisieren mit Service Account Key
    const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
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
    
    console.log(`📋 Modus: ${dryRun ? '🔍 DRY RUN (Vorschau)' : '⚡ EXECUTE (macht Änderungen!)'}`);
    console.log(`🎯 Tournament ID: 6eNr8fnsTO06jgCqjelt`);
    console.log('');
    
    if (dryRun) {
      console.log('💡 Dies ist ein DRY RUN. Es werden keine Änderungen vorgenommen.');
      console.log('💡 Zum Ausführen: npm run tournament-fix -- --execute');
      console.log('');
    }
    
    // Dokument-Fix ausführen
    await runTournamentFix(dryRun);
    
    console.log('');
    console.log('✅ Tournament Fix erfolgreich abgeschlossen!');
    
    if (dryRun) {
      console.log('');
      console.log('📋 Nächste Schritte:');
      console.log('1. Logs oben überprüfen');
      console.log('2. Falls korrekt: npm run tournament-fix -- --execute');
      console.log('3. Nach Ausführung: Gruppenstatistiken prüfen');
    } else {
      console.log('🎉 Änderungen angewendet! Das Tournament-Dokument sollte jetzt kompatibel sein.');
    }
  } catch (error) {
    console.error('💥 Unerwarteter Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
runFix(); 