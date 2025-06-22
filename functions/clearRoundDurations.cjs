const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Korrekter Dateiname im selben Verzeichnis

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearAggregatedRoundDurations() {
  console.log('🗑️  Starte Bereinigung der alten Runden-Statistiken (`aggregatedRoundDurationsByPlayer`)...');

  const summariesCollectionRef = db.collection('jassGameSummaries');
  let processedCount = 0;
  let updatedCount = 0;
  let batch = db.batch();
  let batchCounter = 0;

  try {
    const snapshot = await summariesCollectionRef.get();
    const totalDocs = snapshot.docs.length;
    console.log(`🔎 ${totalDocs} Session-Zusammenfassungen gefunden. Analysiere und bereinige...`);

    if (snapshot.empty) {
      console.log('✅ Keine Dokumente zum Verarbeiten gefunden.');
      return;
    }

    snapshot.forEach(doc => {
      processedCount++;
      const data = doc.data();

      // Prüfen, ob das Feld existiert
      if (data.aggregatedRoundDurationsByPlayer) {
        // Feld zum Löschen zum Batch hinzufügen
        batch.update(doc.ref, { 
          aggregatedRoundDurationsByPlayer: admin.firestore.FieldValue.delete() 
        });
        updatedCount++;
        batchCounter++;
        console.log(`  - Markiere Feld in Session ${doc.id} zum Löschen.`);
      }

      // Commit batch if it reaches the limit (500 operations)
      if (batchCounter === 499) {
        batch.commit();
        console.log('📝 Batch wurde geschrieben...');
        batch = db.batch();
        batchCounter = 0;
      }
    });

    // Commit any remaining operations in the last batch
    if (batchCounter > 0) {
      await batch.commit();
      console.log('📝 Letzten Batch geschrieben...');
    }

    console.log('\n=================================================');
    console.log('✅ Bereinigung erfolgreich abgeschlossen.');
    console.log(`   - ${processedCount} Dokumente verarbeitet.`);
    console.log(`   - ${updatedCount} Dokumente hatten das Feld und wurden aktualisiert.`);
    console.log('=================================================');

  } catch (error) {
    console.error('Fehler bei der Bereinigung der Runden-Statistiken:', error);
  }
}

clearAggregatedRoundDurations(); 