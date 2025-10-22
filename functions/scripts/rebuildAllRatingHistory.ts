import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin ZUERST
const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

interface Event {
  id: string;
  type: 'session' | 'tournament_passe' | 'tournament_final';
  groupId: string;
  completedAt: admin.firestore.Timestamp;
  participantPlayerIds: string[];
  tournamentId?: string;
  passeId?: string;
  passeNumber?: number;
  tournamentSummaryId?: string;
}

/**
 * 🔄 REBUILD RATING HISTORY
 * 
 * Baut die komplette Rating History neu auf:
 * 1. Alle Sessions + Tournament-Passen chronologisch sammeln
 * 2. Jedes Event einzeln verarbeiten (auch jede Passe!)
 * 3. ratingHistory Einträge erstellen
 * 4. playerFinalRatings in jassGameSummaries schreiben
 */
async function rebuildAllRatingHistory() {
  console.log('🔄 RATING HISTORY REBUILD GESTARTET\n');
  console.log('='.repeat(80));
  
  // Dynamisch importieren NACH Firebase Init
  const { updateEloForSession, updateEloForTournament } = require('../src/jassEloUpdater');
  const { saveRatingHistorySnapshot } = require('../src/ratingHistoryService');
  
  try {
    // ========== 1. SAMMLE ALLE EVENTS (Sessions + Tournament-Passen) ==========
    console.log('\n📊 Schritt 1/3: Sammle alle Events...');
    
    const allEvents: Event[] = [];
    
    // Hole alle Gruppen
    const groupsSnap = await db.collection('groups').get();
    console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
    
    // ===== A) NORMALE SESSIONS =====
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const summaryDoc of summariesSnap.docs) {
        const data = summaryDoc.data();
        
        // Nur NICHT-Turnier Sessions
        if (!data.isTournamentSession && !data.tournamentId && data.completedAt && data.participantPlayerIds) {
          allEvents.push({
            id: summaryDoc.id,
            type: 'session',
            groupId: groupDoc.id,
            completedAt: data.completedAt,
            participantPlayerIds: data.participantPlayerIds
          });
        }
      }
    }
    
    console.log(`   ✅ Sessions: ${allEvents.length}`);
    
    // ===== B) TOURNAMENTS (PASSE FÜR PASSE!) =====
    const tournamentsSnap = await db.collection('tournaments')
      .orderBy('completedAt')
      .get();
    
    console.log(`   Gefunden: ${tournamentsSnap.size} Turniere`);
    
    for (const tournamentDoc of tournamentsSnap.docs) {
      const tournamentData = tournamentDoc.data();
      
      // Überspringe Turniere ohne completedAt
      if (!tournamentData.completedAt) {
        console.log(`   ⚠️ Turnier ${tournamentDoc.id}: Kein completedAt, überspringe`);
        continue;
      }
      
      // Hole alle Passen des Turniers
      const passesSnap = await db.collection(`tournaments/${tournamentDoc.id}/games`)
        .orderBy('completedAt')
        .get();
      
      if (passesSnap.empty) {
        console.log(`   ⚠️ Turnier ${tournamentDoc.id}: Keine Passen gefunden`);
        continue;
      }
      
      console.log(`   🏆 Turnier ${tournamentDoc.id}: ${passesSnap.size} Passen`);
      
      // Füge jede Passe als separates Event hinzu
      for (const passeDoc of passesSnap.docs) {
        const passeData = passeDoc.data();
        
        if (passeData.completedAt && passeData.participantPlayerIds) {
          allEvents.push({
            id: `${tournamentDoc.id}_passe_${passeDoc.id}`,
            type: 'tournament_passe',
            groupId: tournamentData.groupId,
            completedAt: passeData.completedAt,
            participantPlayerIds: passeData.participantPlayerIds,
            tournamentId: tournamentDoc.id,
            passeId: passeDoc.id,
            passeNumber: passeData.passeNumber
          });
        }
      }
      
      // Füge das Tournament-Finale als Event hinzu (für playerFinalRatings)
      allEvents.push({
        id: `${tournamentDoc.id}_final`,
        type: 'tournament_final',
        groupId: tournamentData.groupId,
        completedAt: tournamentData.completedAt,
        participantPlayerIds: tournamentData.participantPlayerIds || [],
        tournamentId: tournamentDoc.id
      });
    }
    
    // Sortiere alle Events chronologisch
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    const sessionCount = allEvents.filter(e => e.type === 'session').length;
    const passeCount = allEvents.filter(e => e.type === 'tournament_passe').length;
    const finalCount = allEvents.filter(e => e.type === 'tournament_final').length;
    
    console.log(`\n   📈 Total: ${allEvents.length} Events`);
    console.log(`      • ${sessionCount} Sessions`);
    console.log(`      • ${passeCount} Tournament-Passen`);
    console.log(`      • ${finalCount} Tournament-Finales`);

    // ========== 2. VERARBEITE ALLE EVENTS CHRONOLOGISCH ==========
    console.log('\n⚙️ Schritt 2/3: Verarbeite Events chronologisch...\n');
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const event of allEvents) {
      try {
        const eventDate = event.completedAt.toDate().toLocaleDateString('de-CH');
        const eventTime = event.completedAt.toDate().toLocaleTimeString('de-CH');
        
        if (event.type === 'session') {
          // ========== NORMALE SESSION ==========
          console.log(`   [${processedCount + 1}/${allEvents.length}] 🎮 SESSION: ${event.id} (${eventDate} ${eventTime})`);
          
          // 1. Elo berechnen
          await updateEloForSession(event.groupId, event.id);
          
          // 2. Rating History speichern
          await saveRatingHistorySnapshot(
            event.groupId,
            event.id,
            event.participantPlayerIds,
            'session_end'
          );
          
          // 3. playerFinalRatings in jassGameSummary schreiben
          const playerFinalRatings: { [playerId: string]: any } = {};
          
          for (const playerId of event.participantPlayerIds) {
            const playerDoc = await db.collection('players').doc(playerId).get();
            const playerData = playerDoc.data();
            
            if (playerData) {
              playerFinalRatings[playerId] = {
                rating: playerData.globalRating || 100,
                ratingDelta: playerData.lastSessionDelta || 0,
                gamesPlayed: playerData.gamesPlayed || 0,
                displayName: playerData.displayName || ''
              };
            }
          }
          
          await db.collection(`groups/${event.groupId}/jassGameSummaries`)
            .doc(event.id)
            .update({ playerFinalRatings });
          
          console.log(`      ✅ Verarbeitet (${event.participantPlayerIds.length} Spieler)`);
          
        } else if (event.type === 'tournament_passe') {
          // ========== TOURNAMENT PASSE ==========
          console.log(`   [${processedCount + 1}/${allEvents.length}] 🏆 PASSE ${event.passeNumber}: ${event.tournamentId} (${eventDate} ${eventTime})`);
          
          // 1. Elo berechnen für diese Passe
          await updateEloForTournament(event.tournamentId, event.participantPlayerIds);
          
          console.log(`      ✅ Elo berechnet (Passe ${event.passeNumber})`);
          
        } else if (event.type === 'tournament_final') {
          // ========== TOURNAMENT FINALE ==========
          console.log(`   [${processedCount + 1}/${allEvents.length}] 🏁 TURNIER-FINALE: ${event.tournamentId} (${eventDate} ${eventTime})`);
          
          // 1. playerFinalRatings aus finalen player-Daten holen
          const playerFinalRatings: { [playerId: string]: any } = {};
          
          for (const playerId of event.participantPlayerIds) {
            const playerDoc = await db.collection('players').doc(playerId).get();
            const playerData = playerDoc.data();
            
            if (playerData) {
              playerFinalRatings[playerId] = {
                rating: playerData.globalRating || 100,
                ratingDelta: playerData.lastSessionDelta || 0,
                gamesPlayed: playerData.gamesPlayed || 0,
                displayName: playerData.displayName || ''
              };
            }
          }
          
          // 2. Finde das existierende Tournament jassGameSummary
          const tournamentSummariesSnap = await db.collection(`groups/${event.groupId}/jassGameSummaries`)
            .where('tournamentId', '==', event.tournamentId)
            .where('isTournamentSession', '==', true)
            .limit(1)
            .get();
          
          if (!tournamentSummariesSnap.empty) {
            // UPDATE existierendes Summary
            const summaryDoc = tournamentSummariesSnap.docs[0];
            await summaryDoc.ref.update({ playerFinalRatings });
            console.log(`      ✅ playerFinalRatings geschrieben in: ${summaryDoc.id}`);
          } else {
            // ERSTELLE neues Tournament Summary (falls nicht existiert)
            const tournamentSummaryId = `tournament_${event.tournamentId}`;
            await db.collection(`groups/${event.groupId}/jassGameSummaries`)
              .doc(tournamentSummaryId)
              .set({
                playerFinalRatings,
                isTournamentSession: true,
                tournamentId: event.tournamentId,
                completedAt: event.completedAt,
                participantPlayerIds: event.participantPlayerIds,
                groupId: event.groupId,
                status: 'completed',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            console.log(`      ✅ Neues Tournament Summary erstellt: ${tournamentSummaryId}`);
          }
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`      ❌ FEHLER bei Event ${event.id}:`, error);
        errorCount++;
      }
    }
    
    // ========== 3. ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ RATING HISTORY REBUILD ABGESCHLOSSEN\n');
    console.log('Zusammenfassung:');
    console.log(`  • ${processedCount} Events erfolgreich verarbeitet`);
    console.log(`  • ${errorCount} Events mit Fehlern`);
    console.log(`  • ${sessionCount} Sessions`);
    console.log(`  • ${passeCount} Tournament-Passen`);
    console.log(`  • ${finalCount} Tournament-Finales`);
    console.log('\n🎯 Rating History ist vollständig neu aufgebaut!');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Rebuild:', error);
    throw error;
  }
}

// Script ausführen
rebuildAllRatingHistory()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
