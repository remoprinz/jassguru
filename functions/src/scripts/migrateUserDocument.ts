#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Script zur Migration eines User-Dokuments mit neuer User-ID
 * Erstellt ein neues User-Dokument mit der neuen ID und kopiert alle Daten
 */

const OLD_USER_ID = 'C0yNpZF8CRdgqKVuWAPmhpwnrD92';
const NEW_USER_ID = 'Nk5u0FrF2FdC2536HpAjD1bhmyb2';
const PLAYER_ID = 'EvX9acReG6t45Ws7ZJ1F';

async function migrateUserDocument(dryRun = true) {
  try {
    console.log('🔍 Starte User-Migration...');
    console.log(`📋 Alte User-ID: ${OLD_USER_ID}`);
    console.log(`📋 Neue User-ID: ${NEW_USER_ID}`);
    console.log(`📋 Player-ID: ${PLAYER_ID}`);
    console.log('');

    const db = admin.firestore();
    
    // 1. Prüfe, ob die neue User-ID bereits existiert
    const newUserDoc = await db.collection('users').doc(NEW_USER_ID).get();
    if (newUserDoc.exists) {
      console.log('⚠️  WARNUNG: User-Dokument mit neuer ID existiert bereits!');
      console.log('📋 Aktuelle Daten des existierenden Dokuments:');
      console.log(JSON.stringify(newUserDoc.data(), null, 2));
      
      if (!dryRun) {
        console.log('💥 ABBRUCH: Kann nicht fortfahren, da User-Dokument bereits existiert.');
        return;
      }
    }
    
    // 2. Hole das alte User-Dokument
    const oldUserDoc = await db.collection('users').doc(OLD_USER_ID).get();
    if (!oldUserDoc.exists) {
      console.log('💥 FEHLER: Altes User-Dokument nicht gefunden!');
      return;
    }
    
    const oldUserData = oldUserDoc.data();
    console.log('📋 Aktuelle Daten des alten User-Dokuments:');
    console.log(JSON.stringify(oldUserData, null, 2));
    console.log('');
    
    // 3. Erstelle die neuen User-Daten
    const newUserData = {
      ...oldUserData,
      // Aktualisiere Timestamps
      createdAt: oldUserData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      // Stelle sicher, dass die Player-ID korrekt ist
      playerId: PLAYER_ID,
    };
    
    console.log('📋 Neue User-Daten, die erstellt werden:');
    console.log(JSON.stringify(newUserData, null, 2));
    console.log('');
    
    // 4. Prüfe, ob der Player-Eintrag existiert und die richtige User-ID hat
    const playerDoc = await db.collection('players').doc(PLAYER_ID).get();
    if (!playerDoc.exists) {
      console.log('💥 FEHLER: Player-Dokument nicht gefunden!');
      return;
    }
    
    const playerData = playerDoc.data();
    console.log('📋 Aktuelle Player-Daten:');
    console.log(JSON.stringify(playerData, null, 2));
    console.log('');
    
    // 5. Aktualisiere auch die Player-Daten mit der neuen User-ID
    const updatedPlayerData = {
      ...playerData,
      userId: NEW_USER_ID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    console.log('📋 Aktualisierte Player-Daten:');
    console.log(JSON.stringify(updatedPlayerData, null, 2));
    console.log('');
    
    if (dryRun) {
      console.log('🔍 DRY RUN: Keine Änderungen vorgenommen.');
      console.log('✅ Validation erfolgreich! Das Script ist bereit für die Ausführung.');
      return;
    }
    
    // 6. Führe die Migration aus
    console.log('⚡ Führe Migration aus...');
    
    const batch = db.batch();
    
    // Erstelle neues User-Dokument
    batch.set(db.collection('users').doc(NEW_USER_ID), newUserData);
    
    // Aktualisiere Player-Dokument mit neuer User-ID
    batch.update(db.collection('players').doc(PLAYER_ID), {
      userId: NEW_USER_ID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    await batch.commit();
    
    console.log('✅ User-Migration erfolgreich abgeschlossen!');
    console.log(`📋 Neues User-Dokument erstellt: ${NEW_USER_ID}`);
    console.log(`📋 Player-Dokument aktualisiert: ${PLAYER_ID}`);
    console.log('');
    console.log('⚠️  WICHTIG: Das alte User-Dokument wurde NICHT gelöscht!');
    console.log(`📋 Altes User-Dokument: ${OLD_USER_ID}`);
    console.log('💡 Bitte manuell prüfen und löschen, wenn alles funktioniert.');
  } catch (error) {
    console.error('💥 Fehler bei der User-Migration:', error);
    throw error;
  }
}

/**
 * Hauptfunktion zur Ausführung des Scripts
 */
async function runMigration() {
  try {
    console.log('🔧 Starte User-Migration Script...');
    
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
    console.log('');
    
    if (dryRun) {
      console.log('💡 Dies ist ein DRY RUN. Es werden keine Änderungen vorgenommen.');
      console.log('💡 Zum Ausführen: npm run user-migration -- --execute');
      console.log('');
    }
    
    // Migration ausführen
    await migrateUserDocument(dryRun);
    
    console.log('');
    console.log('✅ User-Migration erfolgreich abgeschlossen!');
    
    if (dryRun) {
      console.log('');
      console.log('📋 Nächste Schritte:');
      console.log('1. Logs oben überprüfen');
      console.log('2. Falls korrekt: npm run user-migration -- --execute');
      console.log('3. Nach Ausführung: Funktionalität testen');
      console.log('4. Altes User-Dokument manuell löschen');
    } else {
      console.log('🎉 Änderungen angewendet! Der User sollte jetzt mit der neuen ID funktionieren.');
    }
  } catch (error) {
    console.error('💥 Unerwarteter Fehler:', error);
    process.exit(1);
  }
}

// Script ausführen
runMigration(); 