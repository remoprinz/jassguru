const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function manualTriggerStats() {
  console.log('🚀 Manual Trigger Stats Update...\n');

  try {
    // Markiere die Gruppe für Batch-Update
    const groupId = 'UYYJnqdIOhZlygFG2lMo'; // Die Gruppe aus den Logs
    
    console.log(`Markiere Gruppe ${groupId} für Batch-Update...`);
    
    await db.collection('groups').doc(groupId).update({
      needsStatsRecalculation: true,
      manualTriggerTest: admin.firestore.Timestamp.now()
    });
    
    console.log(`✅ Gruppe ${groupId} für Batch-Update markiert`);
    console.log('Die Batch-Funktion sollte diese Gruppe in der nächsten Ausführung verarbeiten.');
    console.log('Schaue in den Firebase Function Logs nach "batchUpdateGroupStats" für Details.');

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
manualTriggerStats()
  .then(() => {
    console.log('\n✅ Manual Trigger abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Manual Trigger fehlgeschlagen:', error);
    process.exit(1);
  }); 