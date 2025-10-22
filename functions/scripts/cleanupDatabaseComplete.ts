import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin mit serviceAccountKey aus Hauptverzeichnis
const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

/**
 * 🧹 VOLLSTÄNDIGE DATENBANK-BEREINIGUNG
 * 
 * Bereitet die Datenbank für den kompletten Elo-Rebuild vor:
 * 1. Löscht alle chartData Dokumente
 * 2. Löscht alle ratingHistory Einträge
 * 3. Löscht playerFinalRatings aus jassGameSummaries
 * 4. Setzt players zurück (globalRating: 100, etc.)
 * 5. Entfernt peakRating & lowestRating Felder
 * 6. 🆕 LÖSCHT ALLE globalRating Subcollections (Legacy-Daten!)
 */
async function cleanupDatabaseComplete() {
  console.log('🧹 VOLLSTÄNDIGE DATENBANK-BEREINIGUNG GESTARTET\n');
  console.log('='.repeat(80));
  
  try {
    // ========== 1. LÖSCHE CHARTDATA DOKUMENTE ==========
    console.log('\n📊 Schritt 1/6: Lösche chartData Dokumente...');
    let chartDataDeletedCount = 0;
    
    const groupsSnap = await db.collection('groups').get();
    console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
    
    for (const groupDoc of groupsSnap.docs) {
      const chartDataRef = db.collection(`groups/${groupDoc.id}/aggregated`).doc('chartData');
      const chartDataSnap = await chartDataRef.get();
      
      if (chartDataSnap.exists) {
        await chartDataRef.delete();
        chartDataDeletedCount++;
        console.log(`   ✅ chartData gelöscht für Gruppe: ${groupDoc.id}`);
      }
    }
    
    console.log(`   ✅ ${chartDataDeletedCount} chartData Dokumente gelöscht`);

    // ========== 2. LÖSCHE RATINGHISTORY EINTRÄGE ==========
    console.log('\n📈 Schritt 2/6: Lösche alle ratingHistory Einträge...');
    let ratingHistoryDeletedCount = 0;
    
    const playersSnap = await db.collection('players').get();
    console.log(`   Gefunden: ${playersSnap.size} Spieler`);
    
    for (const playerDoc of playersSnap.docs) {
      const historySnap = await db.collection(`players/${playerDoc.id}/ratingHistory`).get();
      
      if (!historySnap.empty) {
        const batch = db.batch();
        historySnap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        ratingHistoryDeletedCount += historySnap.size;
        console.log(`   ✅ ${historySnap.size} Einträge gelöscht für Spieler: ${playerDoc.id}`);
      }
    }
    
    console.log(`   ✅ ${ratingHistoryDeletedCount} ratingHistory Einträge gelöscht`);

    // ========== 3. LÖSCHE PLAYERFINALRATINGS AUS JASSGAMESUMMARIES ==========
    console.log('\n🎮 Schritt 3/6: Lösche playerFinalRatings aus jassGameSummaries...');
    let playerFinalRatingsDeletedCount = 0;
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`).get();
      
      if (!summariesSnap.empty) {
        const batch = db.batch();
        let batchCount = 0;
        
        for (const summaryDoc of summariesSnap.docs) {
          if (summaryDoc.data().playerFinalRatings) {
            batch.update(summaryDoc.ref, {
              playerFinalRatings: admin.firestore.FieldValue.delete()
            });
            batchCount++;
            playerFinalRatingsDeletedCount++;
            
            // Firestore Batch Limit: 500 operations
            if (batchCount >= 500) {
              await batch.commit();
              console.log(`   ⚙️ Batch committed (500 operations)`);
              batchCount = 0;
            }
          }
        }
        
        if (batchCount > 0) {
          await batch.commit();
        }
        
        console.log(`   ✅ playerFinalRatings gelöscht für Gruppe: ${groupDoc.id} (${summariesSnap.size} summaries geprüft)`);
      }
    }
    
    console.log(`   ✅ ${playerFinalRatingsDeletedCount} playerFinalRatings Felder gelöscht`);

    // ========== 4. SETZE PLAYERS ZURÜCK ==========
    console.log('\n👥 Schritt 4/6: Setze alle players zurück...');
    let playersResetCount = 0;
    
    const batch = db.batch();
    let batchCount = 0;
    
    for (const playerDoc of playersSnap.docs) {
      batch.update(playerDoc.ref, {
        globalRating: 100,
        gamesPlayed: 0,
        lastSessionDelta: 0
      });
      batchCount++;
      playersResetCount++;
      
      // Firestore Batch Limit: 500 operations
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`   ⚙️ Batch committed (500 operations)`);
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`   ✅ ${playersResetCount} Spieler zurückgesetzt (globalRating: 100, gamesPlayed: 0)`);

    // ========== 5. ENTFERNE DEPRECATED FELDER ==========
    console.log('\n🗑️ Schritt 5/6: Entferne peakRating & lowestRating...');
    let deprecatedFieldsRemovedCount = 0;
    
    const batch2 = db.batch();
    let batch2Count = 0;
    
    for (const playerDoc of playersSnap.docs) {
      const playerData = playerDoc.data();
      
      if (playerData.peakRating !== undefined || playerData.lowestRating !== undefined) {
        batch2.update(playerDoc.ref, {
          peakRating: admin.firestore.FieldValue.delete(),
          lowestRating: admin.firestore.FieldValue.delete()
        });
        batch2Count++;
        deprecatedFieldsRemovedCount++;
        
        // Firestore Batch Limit: 500 operations
        if (batch2Count >= 500) {
          await batch2.commit();
          console.log(`   ⚙️ Batch committed (500 operations)`);
          batch2Count = 0;
        }
      }
    }
    
    if (batch2Count > 0) {
      await batch2.commit();
    }
    
    console.log(`   ✅ ${deprecatedFieldsRemovedCount} Spieler: peakRating & lowestRating entfernt`);

    // ========== 6. 🆕 LÖSCHE GLOBALRATING SUBCOLLECTIONS ==========
    console.log('\n🌍 Schritt 6/6: Lösche alle globalRating Subcollections (Legacy-Daten)...');
    let globalRatingSubcollectionsDeletedCount = 0;
    
    for (const playerDoc of playersSnap.docs) {
      const globalRatingSnap = await db.collection(`players/${playerDoc.id}/globalRating`).get();
      
      if (!globalRatingSnap.empty) {
        const batch = db.batch();
        globalRatingSnap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        globalRatingSubcollectionsDeletedCount += globalRatingSnap.size;
        console.log(`   ✅ ${globalRatingSnap.size} globalRating Einträge gelöscht für Spieler: ${playerDoc.id}`);
      }
    }
    
    console.log(`   ✅ ${globalRatingSubcollectionsDeletedCount} globalRating Subcollection-Einträge gelöscht`);

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ VOLLSTÄNDIGE DATENBANK-BEREINIGUNG ABGESCHLOSSEN\n');
    console.log('Zusammenfassung:');
    console.log(`  • ${chartDataDeletedCount} chartData Dokumente gelöscht`);
    console.log(`  • ${ratingHistoryDeletedCount} ratingHistory Einträge gelöscht`);
    console.log(`  • ${playerFinalRatingsDeletedCount} playerFinalRatings Felder gelöscht`);
    console.log(`  • ${playersResetCount} Spieler zurückgesetzt`);
    console.log(`  • ${deprecatedFieldsRemovedCount} Spieler: deprecated Felder entfernt`);
    console.log(`  • ${globalRatingSubcollectionsDeletedCount} globalRating Subcollection-Einträge gelöscht`);
    console.log('\n🎯 Datenbank ist vollständig bereinigt für den Elo-Rebuild!');
    console.log('🚨 WICHTIG: Führen Sie jetzt rebuildAllRatingHistory.ts aus!');
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der vollständigen Datenbank-Bereinigung:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
cleanupDatabaseComplete()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
