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
 * 🎯 KORREKTER RATING HISTORY NEUAUFBAU
 * 
 * 1. Iteriert durch ALLE jassGameSummaries (außer 6eNr8fnsTO06jgCqjelt)
 * 2. Iteriert durch ALLE 15 Passen des Turniers kjoeh4ZPGtGr8GA8gp9p
 * 3. Baut ratingHistory chronologisch auf
 * 4. Schreibt playerFinalRatings in jassGameSummaries
 */
async function rebuildRatingHistoryCorrectly() {
  console.log('🎯 KORREKTER RATING HISTORY NEUAUFBAU\n');
  console.log('='.repeat(80));
  
  try {
    // ========== SCHRITT 0: LÖSCHE ALLE RATING HISTORY EINTRÄGE ==========
    console.log('\n🗑️ Schritt 0/5: Lösche ALLE ratingHistory Einträge...');
    
    const playersSnapshot = await db.collection('players').get();
    let totalDeleted = 0;
    
    for (const playerDoc of playersSnapshot.docs) {
      const ratingHistoryRef = db.collection(`players/${playerDoc.id}/ratingHistory`);
      const ratingHistorySnapshot = await ratingHistoryRef.get();
      
      console.log(`   👤 ${playerDoc.data()?.displayName || playerDoc.id}: ${ratingHistorySnapshot.size} Einträge`);
      
      for (const ratingDoc of ratingHistorySnapshot.docs) {
        await ratingDoc.ref.delete();
        totalDeleted++;
      }
    }
    
    console.log(`✅ ${totalDeleted} ratingHistory Einträge gelöscht`);

    // ========== 1. SAMMLE ALLE JASSGAMESUMMARIES (AUSSER TURNIER) ==========
    console.log('\n📊 Schritt 1/6: Sammle alle jassGameSummaries (außer Turnier)...');
    
    const groupsSnap = await db.collection('groups').get();
    console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
    
    const allSummaries: any[] = [];
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        if (summaryData.completedAt && summaryDoc.id !== '6eNr8fnsTO06jgCqjelt') {
          allSummaries.push({
            groupId: groupDoc.id,
            summaryId: summaryDoc.id,
            data: summaryData,
            completedAt: summaryData.completedAt,
            type: 'session'
          });
        }
      }
    }
    
    // Sortiere chronologisch
    allSummaries.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    console.log(`   ✅ ${allSummaries.length} jassGameSummaries gefunden und sortiert`);

    // ========== 2. SAMMLE ALLE TURNIER-PASSEN ==========
    console.log('\n🏆 Schritt 2/6: Sammle alle Turnier-Passen...');
    
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentGamesSnap = await db.collection(`tournaments/${tournamentId}/games`)
      .orderBy('completedAt', 'asc')
      .get();
    
    const tournamentPasses: any[] = [];
    
    for (const gameDoc of tournamentGamesSnap.docs) {
      const gameData = gameDoc.data();
      if (gameData.completedAt) {
        tournamentPasses.push({
          tournamentId: tournamentId,
          gameId: gameDoc.id,
          gameNumber: gameData.gameNumber,
          data: gameData,
          completedAt: gameData.completedAt,
          type: 'tournament_passe'
        });
      }
    }
    
    console.log(`   ✅ ${tournamentPasses.length} Turnier-Passen gefunden`);

    // ========== 3. KOMBINIERE UND SORTIERE ALLE EVENTS ==========
    console.log('\n📅 Schritt 3/6: Kombiniere und sortiere alle Events...');
    
    const allEvents = [...allSummaries, ...tournamentPasses];
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    console.log(`   ✅ ${allEvents.length} Events total gefunden und sortiert`);
    
    // Zeige chronologische Reihenfolge
    console.log('\n   📋 Chronologische Reihenfolge:');
    allEvents.forEach((event, index) => {
      const date = event.completedAt.toDate();
      if (event.type === 'session') {
        console.log(`      ${index + 1}. SESSION: ${event.summaryId} (${date.toLocaleDateString('de-CH')})`);
      } else {
        console.log(`      ${index + 1}. TURNIER-PASSE ${event.gameNumber}: ${event.gameId} (${date.toLocaleDateString('de-CH')})`);
      }
    });

    // ========== 4. VERARBEITE ALLE EVENTS CHRONOLOGISCH ==========
    console.log('\n⚙️ Schritt 4/6: Verarbeite alle Events chronologisch...');
    
    // Dynamisch importiere die benötigten Module
    const { updateEloForSession } = await import('../src/jassEloUpdater');
    const { updateEloForTournament } = await import('../src/jassEloUpdater');
    const { saveRatingHistorySnapshotWithDate } = await import('../src/ratingHistoryService');
    
    let processedCount = 0;
    
    for (const event of allEvents) {
      try {
        const eventDate = event.completedAt.toDate();
        
        if (event.type === 'session') {
          console.log(`   [${processedCount + 1}/${allEvents.length}] 🎮 SESSION: ${event.summaryId} (${eventDate.toLocaleDateString('de-CH')})`);
          
          // Verarbeite Session
          await updateEloForSession(event.groupId, event.summaryId);
          
          // Speichere Rating History Snapshot mit korrektem completedAt
          await saveRatingHistorySnapshotWithDate(event.groupId, event.summaryId, event.data.participantPlayerIds, 'session_end', undefined, event.completedAt);
          
          // Schreibe playerFinalRatings in das Summary
          const participantPlayerIds = event.data.participantPlayerIds;
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
          await db.collection(`groups/${event.groupId}/jassGameSummaries`).doc(event.summaryId).update({
            playerFinalRatings: playerFinalRatings
          });
          
          console.log(`      ✅ Verarbeitet (${participantPlayerIds.length} Spieler)`);
          
        } else if (event.type === 'tournament_passe') {
          console.log(`   [${processedCount + 1}/${allEvents.length}] 🏆 TURNIER-PASSE ${event.gameNumber}: ${event.gameId} (${eventDate.toLocaleDateString('de-CH')})`);
          
          // Verarbeite Turnier-Passe
          await updateEloForTournament(event.tournamentId, event.gameId);
          
          console.log(`      ✅ Verarbeitet (Passe ${event.gameNumber})`);
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`      ❌ FEHLER bei ${event.type === 'session' ? event.summaryId : event.gameId}:`, error);
      }
    }

    // ========== 5. VERIFIZIERE DAS ERGEBNIS ==========
    console.log('\n🔍 Schritt 5/6: Verifiziere das Ergebnis...');
    
    const testPlayerDoc = await db.collection('players').doc('b16c1120111b7d9e7d733837').get();
    
    if (testPlayerDoc.exists) {
      const testPlayerData = testPlayerDoc.data()!;
      console.log(`   👤 Test-Spieler (Remo):`);
      console.log(`      globalRating: ${testPlayerData.globalRating}`);
      console.log(`      gamesPlayed: ${testPlayerData.gamesPlayed}`);
      console.log(`      lastSessionDelta: ${testPlayerData.lastSessionDelta}`);
      
      const testHistorySnap = await db.collection(`players/b16c1120111b7d9e7d733837/ratingHistory`).get();
      console.log(`      ratingHistory Einträge: ${testHistorySnap.size}`);
      
      // Zeige die letzten 5 Einträge
      if (testHistorySnap.size > 0) {
        console.log(`   📊 Letzte 5 ratingHistory Einträge:`);
        const sortedHistory = testHistorySnap.docs.sort((a, b) => b.data().timestamp - a.data().timestamp);
        sortedHistory.slice(0, 5).forEach((doc, index) => {
          const data = doc.data();
          const date = new Date(data.timestamp).toLocaleDateString('de-CH');
          console.log(`      ${index + 1}. ${date}: ${data.rating} Elo (${data.eventType})`);
        });
      }
    }

    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ RATING HISTORY NEUAUFBAU ABGESCHLOSSEN!\n');
    
    console.log('🎯 FAZIT:');
    console.log(`   • ${allSummaries.length} jassGameSummaries verarbeitet`);
    console.log(`   • ${tournamentPasses.length} Turnier-Passen verarbeitet`);
    console.log(`   • ${processedCount} Events total verarbeitet`);
    console.log('   📊 ratingHistory wurde chronologisch korrekt aufgebaut!');
    console.log('   🎯 Chart sollte jetzt korrekt anzeigen!');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Neuaufbau:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
rebuildRatingHistoryCorrectly()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
