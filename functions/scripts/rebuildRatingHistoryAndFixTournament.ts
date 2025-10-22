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
 * 🔄 REBUILD RATING HISTORY UND FIXE TOURNAMENT-DATENPUNKT
 * 
 * 1. Löscht alle ratingHistory Einträge
 * 2. Berechnet ratingHistory neu durch alle jassGameSummaries (außer Tournament-Summary)
 * 3. Findet die korrekten Elo-Werte nach der 15. Passe
 * 4. Schreibt diese in das Tournament-Summary
 */
async function rebuildRatingHistoryAndFixTournament() {
  console.log('🔄 REBUILD RATING HISTORY UND FIXE TOURNAMENT-DATENPUNKT\n');
  console.log('='.repeat(80));
  
  try {
    // ========== 1. LÖSCHE ALLE RATING HISTORY EINTRÄGE ==========
    console.log('\n🗑️ Schritt 1/5: Lösche alle ratingHistory Einträge...');
    
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

    // ========== 2. SAMMLE ALLE JASSGAMESUMMARIES (AUßER TOURNAMENT-SUMMARY) ==========
    console.log('\n📊 Schritt 2/5: Sammle alle jassGameSummaries (außer Tournament-Summary)...');
    
    const tournamentSummaryId = '6eNr8fnsTO06jgCqjelt'; // Das Tournament-Summary ausschließen
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt')
      .get();
    
    console.log(`   Gefunden: ${summariesSnap.size} jassGameSummaries`);
    
    const summariesToProcess = summariesSnap.docs.filter(doc => doc.id !== tournamentSummaryId);
    console.log(`   Zu verarbeiten: ${summariesToProcess.length} (${tournamentSummaryId} ausgeschlossen)`);

    // ========== 3. VERARBEITE ALLE SUMMARIES CHRONOLOGISCH ==========
    console.log('\n⚙️ Schritt 3/5: Verarbeite alle Summaries chronologisch...');
    
    // Dynamisch importiere die benötigten Module
    const { updateEloForSession } = await import('../src/jassEloUpdater');
    const { saveRatingHistorySnapshot } = await import('../src/ratingHistoryService');
    
    let processedCount = 0;
    
    for (const summaryDoc of summariesToProcess) {
      try {
        const summaryData = summaryDoc.data();
        const summaryDate = summaryData.completedAt.toDate();
        
        console.log(`   [${processedCount + 1}/${summariesToProcess.length}] 🎮 SESSION: ${summaryDoc.id} (${summaryDate.toLocaleDateString('de-CH')})`);
        
        // Verarbeite Session
        await updateEloForSession(groupId, summaryDoc.id);
        
        // Speichere Rating History Snapshot
        await saveRatingHistorySnapshot(groupId, summaryDoc.id, summaryData.participantPlayerIds, 'session_end');
        
        // Schreibe playerFinalRatings in das Summary
        const participantPlayerIds = summaryData.participantPlayerIds;
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
        await summaryDoc.ref.update({
          playerFinalRatings: playerFinalRatings
        });
        
        console.log(`      ✅ Verarbeitet (${participantPlayerIds.length} Spieler)`);
        processedCount++;
        
      } catch (error) {
        console.error(`      ❌ FEHLER bei ${summaryDoc.id}:`, error);
      }
    }

    // ========== 4. FINDE ELO-WERTE NACH DER 15. PASSE ==========
    console.log('\n🏆 Schritt 4/5: Finde Elo-Werte nach der 15. Passe...');
    
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const participantPlayerIds = ['b16c1120111b7d9e7d733837', 'PLaDRlPBo91yu5Ij8MOT2', 'TPBwj8bP9W59n5LoGWP5', 'F1uwdthL6zu7F0cYf1jbe'];
    
    // Hole die letzte Passe des Turniers (15. Passe)
    const passesSnap = await db.collection(`tournaments/${tournamentId}/games`)
      .orderBy('passeNumber', 'desc')
      .limit(1)
      .get();
    
    if (passesSnap.empty) {
      console.log('   ❌ Keine Passen gefunden!');
      return;
    }
    
    const lastPasse = passesSnap.docs[0];
    const lastPasseData = lastPasse.data();
    
    console.log(`   ✅ Letzte Passe gefunden: Passe ${lastPasseData.passeNumber}`);
    console.log(`   📅 Datum: ${lastPasseData.completedAt.toDate().toLocaleDateString('de-CH')}`);
    
    // Hole die Elo-Werte nach dieser Passe aus der Rating History
    const playerFinalRatings: any = {};
    
    for (const playerId of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerData = playerDoc.data()!;
      const playerName = playerData.displayName || playerId;
      
      // Hole das letzte Rating History Entry für diesen Spieler
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      let finalRating = playerData.globalRating || 100;
      let gamesPlayed = playerData.gamesPlayed || 0;
      
      if (!historySnap.empty) {
        const lastHistory = historySnap.docs[0].data();
        finalRating = lastHistory.rating;
        gamesPlayed = lastHistory.cumulative?.games || gamesPlayed;
      }
      
      playerFinalRatings[playerId] = {
        displayName: playerName,
        rating: finalRating,
        ratingDelta: 0, // Tournament-Delta wird nicht separat gespeichert
        gamesPlayed: gamesPlayed
      };
      
      console.log(`   👤 ${playerName}: ${finalRating} (${gamesPlayed} Spiele)`);
    }

    // ========== 5. AKTUALISIERE TOURNAMENT-SUMMARY ==========
    console.log('\n📝 Schritt 5/5: Aktualisiere Tournament-Summary...');
    
    const summaryRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(tournamentSummaryId);
    
    await summaryRef.update({
      playerFinalRatings: playerFinalRatings,
      isTournamentSession: true,
      tournamentId: tournamentId
    });
    
    console.log(`   ✅ Tournament-Summary aktualisiert: ${tournamentSummaryId}`);
    console.log(`   📊 playerFinalRatings hinzugefügt für ${Object.keys(playerFinalRatings).length} Spieler`);
    
    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ REBUILD UND FIX ABGESCHLOSSEN!\n');
    
    console.log('🎯 FAZIT:');
    console.log(`   • ${ratingHistoryDeletedCount} ratingHistory Einträge gelöscht`);
    console.log(`   • ${processedCount} jassGameSummaries neu verarbeitet`);
    console.log(`   • Tournament-Summary mit korrekten Elo-Werten aktualisiert`);
    console.log('   📊 Chart sollte jetzt den korrekten Datenpunkt für 11. Mai 2025 anzeigen');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Rebuild und Fix:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
rebuildRatingHistoryAndFixTournament()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
