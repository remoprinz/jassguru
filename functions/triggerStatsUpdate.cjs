const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function triggerStatsUpdate() {
  console.log('🚀 Triggering Stats Update via Cloud Function...\n');

  try {
    // 1. Finde eine Gruppe mit Sessions
    console.log('1. Suche nach Gruppen mit Sessions...');
    const groupsSnap = await db.collection('groups').limit(5).get();
    
    if (groupsSnap.empty) {
      console.log('❌ Keine Gruppen gefunden');
      return;
    }

    let testGroupId = null;
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      console.log(`Prüfe Gruppe: ${groupId} (${groupData.name || 'Unbenannt'})`);
      
      const sessionsSnap = await db.collection('jassGameSummaries')
        .where('groupId', '==', groupId)
        .where('status', '==', 'completed')
        .limit(1)
        .get();
      
      if (!sessionsSnap.empty) {
        testGroupId = groupId;
        console.log(`✅ Gruppe mit Sessions gefunden: ${groupId}`);
        break;
      }
    }

    if (!testGroupId) {
      console.log('❌ Keine Gruppe mit abgeschlossenen Sessions gefunden');
      return;
    }

    // 2. Prüfe aktuelle groupComputedStats
    console.log('\n2. Prüfe aktuelle groupComputedStats Collection...');
    const allStatsSnap = await db.collection('groupComputedStats').get();
    console.log(`Aktuelle Anzahl Dokumente in groupComputedStats: ${allStatsSnap.docs.length}`);
    
    if (allStatsSnap.docs.length > 0) {
      console.log('Bestehende Statistik-Dokumente:');
      allStatsSnap.docs.forEach(doc => {
        const stats = doc.data();
        console.log(`   - ${doc.id}: ${stats.sessionCount || 0} Sessions, ${stats.gameCount || 0} Spiele`);
      });
    }

    // 3. Triggere manuelle Batch-Aktualisierung über Cloud Function
    console.log('\n3. Triggere manuelle Batch-Aktualisierung...');
    
    // Markiere die Gruppe für Batch-Update
    await db.collection('groups').doc(testGroupId).update({
      needsStatsRecalculation: true,
      manualTrigger: admin.firestore.Timestamp.now()
    });
    
    console.log(`✅ Gruppe ${testGroupId} für Batch-Update markiert`);
    
    // Warte kurz
    console.log('Warte 5 Sekunden...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. Prüfe Ergebnis
    console.log('\n4. Prüfe Ergebnis nach Trigger...');
    const updatedStatsSnap = await db.collection('groupComputedStats').get();
    console.log(`Anzahl Dokumente nach Update: ${updatedStatsSnap.docs.length}`);
    
    const groupStatsDoc = await db.collection('groupComputedStats').doc(testGroupId).get();
    if (groupStatsDoc.exists) {
      const stats = groupStatsDoc.data();
      console.log(`✅ Statistiken für Gruppe ${testGroupId}:`);
      console.log(`   - Sessions: ${stats.sessionCount}`);
      console.log(`   - Spiele: ${stats.gameCount}`);
      console.log(`   - Mitglieder: ${stats.memberCount}`);
      console.log(`   - Letzte Aktualisierung: ${stats.lastUpdateTimestamp?.toDate()}`);
    } else {
      console.log(`❌ Keine Statistiken für Gruppe ${testGroupId} gefunden`);
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
triggerStatsUpdate()
  .then(() => {
    console.log('\n✅ Trigger abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Trigger fehlgeschlagen:', error);
    process.exit(1);
  }); 