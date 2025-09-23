#!/usr/bin/env node

/**
 * EINFACHES MEMBERS COLLECTION MIGRATION SCRIPT
 * 
 * Verwendet Firebase Client SDK (wie die App selbst) statt Admin SDK
 * Dadurch können wir die bestehende Firebase-Konfiguration nutzen
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

// Firebase Konfiguration aus Umgebungsvariablen (sicher, ohne hardkodierte Keys)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!FIREBASE_API_KEY) {
  console.error('🔑 FIREBASE_API_KEY fehlt! Setze: FIREBASE_API_KEY=your_key node script.js');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: "jassguru.firebaseapp.com",
  projectId: "jassguru",
  storageBucket: "jassguru.appspot.com",
  messagingSenderId: "984448092896",
  appId: "1:984448092896:web:8f2c929004acc3dc448c93",
  measurementId: "G-5JSDGQJQX0"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Command-line Argumente parsen
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');

console.log('🔍 EINFACHES MEMBERS MIGRATION SCRIPT');
console.log('====================================');
console.log(`📋 Modus: ${isDryRun ? 'DRY-RUN (keine Änderungen)' : 'EXECUTE (echte Migration)'}`);
console.log('');

async function analyzeAndMigrate() {
  try {
    // 1. Alle Gruppen laden
    console.log('📥 Lade alle Gruppen...');
    const groupsSnapshot = await getDocs(collection(db, 'groups'));
    console.log(`   ✅ ${groupsSnapshot.size} Gruppen gefunden`);
    
    if (groupsSnapshot.empty) {
      console.log('   ℹ️  Keine Gruppen vorhanden - Migration nicht erforderlich');
      return;
    }

    const migrationPlan = [];
    let totalNewMembers = 0;
    let totalExistingMembers = 0;

    // 2. Jede Gruppe analysieren
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      
      console.log(`\n🔍 Analysiere Gruppe: ${groupData.name} (${groupId})`);
      
      // 2a. Prüfe ob players-Map existiert
      if (!groupData.players || typeof groupData.players !== 'object') {
        console.log(`   ⚠️  Gruppe hat keine players-Map - überspringe`);
        continue;
      }

      const playersInMap = Object.keys(groupData.players);
      console.log(`   📊 ${playersInMap.length} Spieler in players-Map gefunden`);

      // 2b. Prüfe bestehende members-Subcollection
      const membersCollection = collection(db, 'groups', groupId, 'members');
      const existingMembersSnapshot = await getDocs(membersCollection);
      const existingMemberIds = existingMembersSnapshot.docs.map(doc => doc.id);
      console.log(`   📊 ${existingMemberIds.length} bestehende members-Dokumente gefunden`);

      // 2c. Identifiziere fehlende members
      const missingMemberIds = playersInMap.filter(playerId => !existingMemberIds.includes(playerId));
      console.log(`   📊 ${missingMemberIds.length} neue members-Dokumente erforderlich`);

      if (missingMemberIds.length === 0) {
        console.log(`   ✅ Alle members-Dokumente bereits vorhanden`);
        totalExistingMembers += existingMemberIds.length;
        continue;
      }

      // 2d. Für jeden fehlenden member, Player-Dokument validieren
      const memberOperations = [];
      for (const playerId of missingMemberIds) {
        const playerFromMap = groupData.players[playerId];
        
        console.log(`   🔍 Validiere Spieler ${playerId}...`);
        
        // Player-Dokument laden um photoURL zu ermitteln
        let playerDoc = null;
        let photoURL = null;
        
        try {
          const playerSnapshot = await getDoc(doc(db, 'players', playerId));
          if (playerSnapshot.exists()) {
            playerDoc = playerSnapshot.data();
            photoURL = playerDoc.photoURL || null;
            console.log(`      ✅ Player-Dokument gefunden: ${playerDoc.displayName}`);
          } else {
            console.log(`      ⚠️  Player-Dokument ${playerId} nicht gefunden - verwende Map-Daten`);
          }
        } catch (error) {
          console.log(`      ❌ Fehler beim Laden von Player ${playerId}: ${error.message}`);
        }

        // Member-Dokument-Daten zusammenstellen
        const memberData = {
          displayName: playerFromMap.displayName || 'Unbekannt',
          photoURL: photoURL,
          joinedAt: playerFromMap.joinedAt || new Date() // Fallback für fehlende joinedAt
        };

        memberOperations.push({
          playerId,
          data: memberData,
          playerDocExists: !!playerDoc
        });

        console.log(`      📝 Bereitet member-Dokument vor: ${memberData.displayName}`);
      }

      migrationPlan.push({
        groupId,
        groupName: groupData.name,
        operations: memberOperations
      });

      totalNewMembers += memberOperations.length;
      totalExistingMembers += existingMemberIds.length;
    }

    // 3. Migration-Summary anzeigen
    console.log('\n📋 MIGRATIONS-ZUSAMMENFASSUNG');
    console.log('============================');
    console.log(`📊 Analysierte Gruppen: ${groupsSnapshot.size}`);
    console.log(`📊 Bestehende member-Dokumente: ${totalExistingMembers}`);
    console.log(`📊 Neue member-Dokumente: ${totalNewMembers}`);
    console.log('');

    if (totalNewMembers === 0) {
      console.log('✅ Keine Migration erforderlich - alle Daten sind konsistent!');
      return;
    }

    // 4. Detaillierte Operationen auflisten
    console.log('📝 GEPLANTE OPERATIONEN:');
    console.log('========================');
    migrationPlan.forEach(plan => {
      if (plan.operations.length > 0) {
        console.log(`\n🏢 ${plan.groupName} (${plan.groupId}):`);
        plan.operations.forEach(op => {
          const status = op.playerDocExists ? '✅' : '⚠️';
          console.log(`   ${status} ${op.data.displayName} (${op.playerId})`);
        });
      }
    });

    if (isDryRun) {
      console.log('\n🔍 DRY-RUN MODUS - Keine Änderungen vorgenommen');
      console.log('📝 Führe das Skript mit --execute aus, um die Migration durchzuführen');
      return;
    }

    // 5. Echte Migration ausführen
    console.log('\n🚀 STARTE MIGRATION...');
    console.log('======================');
    
    let successCount = 0;
    let errorCount = 0;

    for (const plan of migrationPlan) {
      if (plan.operations.length === 0) continue;

      console.log(`\n📝 Migriere Gruppe: ${plan.groupName}`);
      
      // Batch-Operation für diese Gruppe (max 500 pro Batch)
      const batch = writeBatch(db);
      
      for (const operation of plan.operations) {
        const memberRef = doc(db, 'groups', plan.groupId, 'members', operation.playerId);
        batch.set(memberRef, operation.data);
      }

      try {
        await batch.commit();
        console.log(`   ✅ ${plan.operations.length} member-Dokumente erstellt`);
        successCount += plan.operations.length;
      } catch (error) {
        console.log(`   ❌ Fehler bei Gruppe ${plan.groupName}: ${error.message}`);
        errorCount += plan.operations.length;
      }
    }

    // 6. Final Summary
    console.log('\n🏁 MIGRATION ABGESCHLOSSEN');
    console.log('==========================');
    console.log(`✅ Erfolgreich: ${successCount} member-Dokumente`);
    console.log(`❌ Fehler: ${errorCount} member-Dokumente`);
    
    if (errorCount === 0) {
      console.log('🎉 Migration vollständig erfolgreich!');
    } else {
      console.log('⚠️  Migration mit Fehlern abgeschlossen - prüfe die Logs');
    }

  } catch (error) {
    console.error('💥 KRITISCHER FEHLER:', error);
    process.exit(1);
  }
}

// Skript ausführen
analyzeAndMigrate()
  .then(() => {
    console.log('\n✅ Skript beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Unbehandelter Fehler:', error);
    process.exit(1);
  });
