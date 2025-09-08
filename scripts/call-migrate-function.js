#!/usr/bin/env node

/**
 * Ruft die migrateMembers Cloud Function auf
 */

import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase Konfiguration (gleiche wie in der App)
const firebaseConfig = {
  apiKey: "AIzaSyD-9tSrke72PFVo4Ry7580kN_n7PQu4_3c",
  authDomain: "jassguru.firebaseapp.com",
  projectId: "jassguru",
  storageBucket: "jassguru.appspot.com",
  messagingSenderId: "984448092896",
  appId: "1:984448092896:web:8f2c929004acc3dc448c93",
  measurementId: "G-5JSDGQJQX0"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'europe-west1');

// Command-line Argumente parsen
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const removeOldPlayer = args.find(arg => arg.startsWith('--remove='))?.split('=')[1];

console.log('🔍 CLOUD FUNCTION MIGRATION CALLER');
console.log('===================================');
console.log(`📋 Modus: ${isDryRun ? 'DRY-RUN (keine Änderungen)' : 'EXECUTE (echte Migration)'}`);
if (removeOldPlayer) {
  console.log(`🗑️ Entferne Player: ${removeOldPlayer}`);
}
console.log('');

async function callMigration() {
  try {
    console.log('📞 Rufe Cloud Function migrateMembers auf...');
    
    const migrateMembers = httpsCallable(functions, 'migrateMembers');
    const result = await migrateMembers({
      dryRun: isDryRun,
      removeOldPlayer: removeOldPlayer
    });

    console.log('✅ Cloud Function erfolgreich ausgeführt');
    console.log('');
    
    const data = result.data;
    
    if (data.dryRun) {
      console.log('🔍 DRY-RUN ERGEBNIS:');
      console.log(`📊 Neue member-Dokumente: ${data.summary.newMembers}`);
      console.log(`📊 Zu entfernende Player: ${data.summary.removedPlayers}`);
      console.log('');
      
      if (data.operations.length > 0) {
        console.log('📝 GEPLANTE OPERATIONEN:');
        data.operations.forEach(op => {
          if (op.newMembers.length > 0 || op.removedPlayers.length > 0) {
            console.log(`\n🏢 ${op.groupName} (${op.groupId}):`);
            op.newMembers.forEach(member => {
              const status = member.playerDocExists ? '✅' : '⚠️';
              console.log(`   ${status} Hinzufügen: ${member.data.displayName} (${member.playerId})`);
            });
            op.removedPlayers.forEach(playerId => {
              console.log(`   🗑️ Entfernen: ${playerId}`);
            });
          }
        });
      }
      
      console.log('\n📝 Führe das Skript mit --execute aus, um die Migration durchzuführen');
      if (removeOldPlayer) {
        console.log(`📝 Für das Entfernen von Player ${removeOldPlayer}, füge --remove=${removeOldPlayer} hinzu`);
      }
    } else {
      console.log('🏁 MIGRATION ABGESCHLOSSEN:');
      console.log(`✅ Erfolgreich: ${data.summary.successful}`);
      console.log(`❌ Fehler: ${data.summary.errors}`);
      console.log(`📊 Neue member-Dokumente: ${data.summary.newMembers}`);
      console.log(`📊 Entfernte Player: ${data.summary.removedPlayers}`);
      
      if (data.summary.errors === 0) {
        console.log('🎉 Migration vollständig erfolgreich!');
      } else {
        console.log('⚠️  Migration mit Fehlern abgeschlossen');
      }
    }

  } catch (error) {
    console.error('💥 FEHLER beim Aufruf der Cloud Function:', error);
    process.exit(1);
  }
}

// Ausführen
callMigration()
  .then(() => {
    console.log('\n✅ Skript beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Unbehandelter Fehler:', error);
    process.exit(1);
  });
