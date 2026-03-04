/**
 * Reparatur-Skript: Synchronisiert alle photoURL-Werte in members-Subcollections
 * 
 * Dieses Skript durchläuft alle Gruppen und deren Mitglieder und stellt sicher,
 * dass die photoURL-Werte in der members-Subcollection mit den players-Dokumenten
 * übereinstimmen.
 * 
 * Verwendung:
 *   node scripts/repair-all-member-photourls.cjs [--dry-run] [--group <groupId>]
 * 
 * Optionen:
 *   --dry-run    Zeigt nur an, was repariert werden würde, ohne Änderungen
 *   --group <id> Repariert nur eine spezifische Gruppe
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialisiere Firebase Admin
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Parse CLI-Argumente
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const groupArgIndex = args.indexOf('--group');
const specificGroupId = groupArgIndex !== -1 ? args[groupArgIndex + 1] : null;

async function repairMemberPhotoURLs() {
  console.log('='.repeat(60));
  console.log('📸 PHOTO URL REPARATUR-SKRIPT');
  console.log('='.repeat(60));
  console.log(`Modus: ${isDryRun ? '🔍 DRY RUN (keine Änderungen)' : '✏️ LIVE (Änderungen werden geschrieben)'}`);
  if (specificGroupId) {
    console.log(`Gruppe: ${specificGroupId}`);
  }
  console.log('');

  // Stats für Zusammenfassung
  const stats = {
    groupsChecked: 0,
    membersChecked: 0,
    membersFixed: 0,
    membersWithMissingPlayer: 0,
    membersAlreadyCorrect: 0,
    errors: 0
  };

  try {
    // Hole alle Gruppen (oder nur die spezifische)
    let groupsQuery = db.collection('groups');
    if (specificGroupId) {
      const groupDoc = await db.collection('groups').doc(specificGroupId).get();
      if (!groupDoc.exists) {
        console.error(`❌ Gruppe ${specificGroupId} nicht gefunden!`);
        process.exit(1);
      }
      console.log(`📦 Prüfe Gruppe: ${groupDoc.data()?.name || specificGroupId}`);
      await processGroup(groupDoc, stats, isDryRun);
    } else {
      const groupsSnapshot = await groupsQuery.get();
      console.log(`📦 Gefunden: ${groupsSnapshot.size} Gruppen\n`);
      
      for (const groupDoc of groupsSnapshot.docs) {
        await processGroup(groupDoc, stats, isDryRun);
      }
    }

    // Zusammenfassung
    console.log('\n' + '='.repeat(60));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(60));
    console.log(`Gruppen geprüft:           ${stats.groupsChecked}`);
    console.log(`Mitglieder geprüft:        ${stats.membersChecked}`);
    console.log(`Bereits korrekt:           ${stats.membersAlreadyCorrect}`);
    console.log(`${isDryRun ? 'Würden repariert werden' : 'Repariert'}:   ${stats.membersFixed}`);
    console.log(`Spieler nicht gefunden:    ${stats.membersWithMissingPlayer}`);
    console.log(`Fehler:                    ${stats.errors}`);
    
    if (isDryRun && stats.membersFixed > 0) {
      console.log('\n⚠️  Dies war ein Dry-Run. Führen Sie das Skript ohne --dry-run aus, um die Änderungen anzuwenden.');
    }

  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
    process.exit(1);
  }
}

async function processGroup(groupDoc, stats, isDryRun) {
  const groupId = groupDoc.id;
  const groupData = groupDoc.data();
  const groupName = groupData?.name || groupId;
  
  stats.groupsChecked++;
  
  // Hole alle Mitglieder der Gruppe
  const membersSnapshot = await db.collection('groups').doc(groupId).collection('members').get();
  
  if (membersSnapshot.empty) {
    console.log(`⏭️  Gruppe "${groupName}" hat keine members-Subcollection`);
    return;
  }

  console.log(`\n🔍 Gruppe: "${groupName}" (${membersSnapshot.size} Mitglieder)`);
  
  const batch = db.batch();
  let batchUpdates = 0;
  
  for (const memberDoc of membersSnapshot.docs) {
    const memberId = memberDoc.id;
    const memberData = memberDoc.data();
    const currentPhotoURL = memberData.photoURL;
    
    stats.membersChecked++;
    
    // Hole das entsprechende Player-Dokument
    const playerDoc = await db.collection('players').doc(memberId).get();
    
    if (!playerDoc.exists) {
      console.log(`  ⚠️  Player ${memberId} nicht gefunden (Mitglied: ${memberData.displayName || 'Unbekannt'})`);
      stats.membersWithMissingPlayer++;
      continue;
    }
    
    const playerData = playerDoc.data();
    const correctPhotoURL = playerData?.photoURL || null;
    
    // Vergleiche und aktualisiere bei Bedarf
    if (currentPhotoURL !== correctPhotoURL) {
      console.log(`  📸 ${memberData.displayName || memberId}:`);
      console.log(`     Aktuell: ${currentPhotoURL || '(null)'}`);
      console.log(`     Korrekt: ${correctPhotoURL || '(null)'}`);
      
      if (!isDryRun) {
        const memberRef = db.collection('groups').doc(groupId).collection('members').doc(memberId);
        batch.update(memberRef, { photoURL: correctPhotoURL });
        batchUpdates++;
        
        // Firestore Batch-Limit: 500 Operationen
        if (batchUpdates >= 450) {
          await batch.commit();
          console.log(`  ✅ Batch mit ${batchUpdates} Updates committed`);
          batchUpdates = 0;
        }
      }
      
      stats.membersFixed++;
    } else {
      stats.membersAlreadyCorrect++;
    }
  }
  
  // Restliche Batch-Updates committen
  if (!isDryRun && batchUpdates > 0) {
    await batch.commit();
    console.log(`  ✅ Batch mit ${batchUpdates} Updates committed`);
  }
}

// Hauptfunktion ausführen
repairMemberPhotoURLs()
  .then(() => {
    console.log('\n✅ Skript abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Skript fehlgeschlagen:', error);
    process.exit(1);
  });
