import * as admin from 'firebase-admin';

// DEPRECATED: Chart-Daten werden jetzt direkt aus jassGameSummaries gelesen
// Dieses Script ist nicht mehr nötig!
console.log('⚠️ DEPRECATED: Chart-Daten werden jetzt direkt aus jassGameSummaries gelesen!');
console.log('📊 Verwenden Sie stattdessen den neuen chartDataService im Frontend.');

// Use existing Firebase app or initialize if needed
try {
  admin.app();
} catch (error) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'jassguru'
  });
}

async function regenerateChartData() {
  console.log('⚠️ DEPRECATED: Dieses Script ist nicht mehr nötig!');
  console.log('📊 Chart-Daten werden jetzt direkt aus jassGameSummaries gelesen.');
  console.log('✅ Frontend chartDataService wurde bereits aktualisiert.');
}

// Ausführung nur wenn direkt aufgerufen
if (require.main === module) {
  regenerateChartData()
    .then(() => {
      console.log('✅ Script abgeschlossen (deprecated)');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fehler:', error);
      process.exit(1);
    });
}
