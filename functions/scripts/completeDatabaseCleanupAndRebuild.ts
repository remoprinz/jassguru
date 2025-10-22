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
 * 🧹 KOMPLETTE DATENBANK-BEREINIGUNG UND NEUAUFBAU
 * 
 * 1. Löscht ALLE ratingHistory Einträge
 * 2. Löscht ALLE playerFinalRatings aus jassGameSummaries
 * 3. Setzt ALLE globalRating auf 100 zurück
 * 4. Setzt ALLE gamesPlayed auf 0 zurück
 * 5. Baut ALLES von Grund auf neu auf
 */
async function completeDatabaseCleanupAndRebuild() {
  console.log('🧹 KOMPLETTE DATENBANK-BEREINIGUNG UND NEUAUFBAU\n');
  console.log('='.repeat(80));
  
  try {
    // ========== 1. LÖSCHE ALLE RATING HISTORY EINTRÄGE ==========
    console.log('\n🗑️ Schritt 1/6: Lösche alle ratingHistory Einträge...');
    
    const playersSnap = await db.collection('players').get();
    console.log(`   Gefunden: ${playersSnap.size} Spieler`);
    
    let ratingHistoryDeletedCount = 0;
    
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

    // ========== 2. LÖSCHE ALLE PLAYERFINALRATINGS AUS JASSGAMESUMMARIES ==========
    console.log('\n📊 Schritt 2/6: Lösche alle playerFinalRatings aus jassGameSummaries...');
    
    const groupsSnap = await db.collection('groups').get();
    console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
    
    let summariesUpdatedCount = 0;
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`).get();
      
      if (!summariesSnap.empty) {
        const batch = db.batch();
        summariesSnap.docs.forEach(doc => {
          batch.update(doc.ref, {
            playerFinalRatings: admin.firestore.FieldValue.delete()
          });
        });
        await batch.commit();
        summariesUpdatedCount += summariesSnap.size;
        console.log(`   ✅ ${summariesSnap.size} Summaries bereinigt für Gruppe: ${groupDoc.id}`);
      }
    }
    
    console.log(`   ✅ ${summariesUpdatedCount} jassGameSummaries bereinigt`);

    // ========== 3. SETZE ALLE GLOBALRATING AUF 100 ZURÜCK ==========
    console.log('\n👥 Schritt 3/6: Setze alle globalRating auf 100 zurück...');
    
    let playersResetCount = 0;
    
    for (const playerDoc of playersSnap.docs) {
      await playerDoc.ref.update({
        globalRating: 100,
        gamesPlayed: 0,
        lastSessionDelta: 0
      });
      playersResetCount++;
      console.log(`   ✅ Spieler zurückgesetzt: ${playerDoc.id}`);
    }
    
    console.log(`   ✅ ${playersResetCount} Spieler auf 100 Elo zurückgesetzt`);

    // ========== 4. LÖSCHE ALLE CHARTDATA DOKUMENTE ==========
    console.log('\n📈 Schritt 4/6: Lösche alle chartData Dokumente...');
    
    let chartDataDeletedCount = 0;
    
    for (const groupDoc of groupsSnap.docs) {
      const chartDataDoc = await db.doc(`groups/${groupDoc.id}/aggregated/chartData`).get();
      
      if (chartDataDoc.exists) {
        await chartDataDoc.ref.delete();
        chartDataDeletedCount++;
        console.log(`   ✅ ChartData gelöscht für Gruppe: ${groupDoc.id}`);
      }
    }
    
    console.log(`   ✅ ${chartDataDeletedCount} chartData Dokumente gelöscht`);

    // ========== 5. SAMMLE ALLE JASSGAMESUMMARIES CHRONOLOGISCH ==========
    console.log('\n📊 Schritt 5/6: Sammle alle jassGameSummaries chronologisch...');
    
    const allSummaries: any[] = [];
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        if (summaryData.completedAt) {
          allSummaries.push({
            groupId: groupDoc.id,
            summaryId: summaryDoc.id,
            data: summaryData,
            completedAt: summaryData.completedAt
          });
        }
      }
    }
    
    // Sortiere chronologisch
    allSummaries.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    console.log(`   ✅ ${allSummaries.length} jassGameSummaries gefunden und sortiert`);

    // ========== 6. VERARBEITE ALLE SUMMARIES CHRONOLOGISCH ==========
    console.log('\n⚙️ Schritt 6/6: Verarbeite alle Summaries chronologisch...');
    
    // Dynamisch importiere die benötigten Module
    const { updateEloForSession } = await import('../src/jassEloUpdater');
    const { saveRatingHistorySnapshot } = await import('../src/ratingHistoryService');
    
    let processedCount = 0;
    
    for (const summary of allSummaries) {
      try {
        const summaryDate = summary.completedAt.toDate();
        
        console.log(`   [${processedCount + 1}/${allSummaries.length}] 🎮 SESSION: ${summary.summaryId} (${summaryDate.toLocaleDateString('de-CH')})`);
        
        // Verarbeite Session
        await updateEloForSession(summary.groupId, summary.summaryId);
        
        // Speichere Rating History Snapshot
        await saveRatingHistorySnapshot(summary.groupId, summary.summaryId, summary.data.participantPlayerIds, 'session_end');
        
        // Schreibe playerFinalRatings in das Summary
        const participantPlayerIds = summary.data.participantPlayerIds;
        const playerFinalRatings: any = {};
        
        for (const playerId of participantPlayerIds) {
          const playerDoc = await db.collection('players').doc(playerId).get();
          
          if (playerDoc.exists) {
            const playerData = playerDoc.data()!;
            const playerName = playerData.displayName || playerId;
            
            playerFinalRatings[playerId] = {
              displayName: playerName,
              rating: playerData.globalRating,
              ratingDelta: playerData.lastSessionDelta || 0,
              gamesPlayed: playerData.gamesPlayed
            };
          }
        }
        
        // Aktualisiere das Summary mit playerFinalRatings
        await db.collection(`groups/${summary.groupId}/jassGameSummaries`).doc(summary.summaryId).update({
          playerFinalRatings: playerFinalRatings
        });
        
        console.log(`      ✅ Verarbeitet (${participantPlayerIds.length} Spieler)`);
        processedCount++;
        
      } catch (error) {
        console.error(`      ❌ FEHLER bei ${summary.summaryId}:`, error);
      }
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ KOMPLETTE BEREINIGUNG UND NEUAUFBAU ABGESCHLOSSEN!\n');
    
    console.log('🎯 FAZIT:');
    console.log(`   • ${ratingHistoryDeletedCount} ratingHistory Einträge gelöscht`);
    console.log(`   • ${summariesUpdatedCount} jassGameSummaries bereinigt`);
    console.log(`   • ${playersResetCount} Spieler auf 100 Elo zurückgesetzt`);
    console.log(`   • ${chartDataDeletedCount} chartData Dokumente gelöscht`);
    console.log(`   • ${processedCount} jassGameSummaries neu verarbeitet`);
    console.log('   📊 Alle Spieler starten jetzt bei 100 Elo!');
    console.log('   🎯 Chart sollte jetzt korrekt anzeigen!');
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der kompletten Bereinigung:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
completeDatabaseCleanupAndRebuild()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
