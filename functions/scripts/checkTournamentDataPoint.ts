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
 * 🔍 ÜBERPRÜFE TOURNAMENT-DATENPUNKT
 * 
 * Überprüft, warum das Turnier vom 11. Mai 2025 nicht im Chart erscheint.
 */
async function checkTournamentDataPoint() {
  console.log('🔍 ÜBERPRÜFE TOURNAMENT-DATENPUNKT\n');
  console.log('='.repeat(80));
  
  try {
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentDate = '11. Mai 2025';
    
    console.log(`🎯 Analysiere Turnier: ${tournamentId}`);
    console.log(`📅 Erwarteter Datum: ${tournamentDate}\n`);
    
    // ========== 1. ÜBERPRÜFE TOURNAMENT-DOKUMENT ==========
    console.log('📊 Schritt 1/4: Überprüfe Tournament-Dokument...');
    
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    
    if (!tournamentDoc.exists) {
      console.log('   ❌ Tournament-Dokument nicht gefunden!');
      return;
    }
    
    const tournamentData = tournamentDoc.data()!;
    console.log(`   ✅ Tournament-Dokument gefunden`);
    console.log(`   📅 completedAt: ${tournamentData.completedAt.toDate().toLocaleDateString('de-CH')}`);
    console.log(`   👥 Teilnehmer: ${tournamentData.participantPlayerIds?.join(', ') || 'Keine'}`);
    console.log(`   🎮 Spiele: ${tournamentData.gamesPlayed}`);
    
    // ========== 2. ÜBERPRÜFE TOURNAMENT-SUMMARY ==========
    console.log('\n🎮 Schritt 2/4: Überprüfe Tournament-Summary...');
    
    const groupId = tournamentData.groupId;
    const tournamentSummaryId = `tournament_${tournamentId}`;
    
    const summaryDoc = await db.collection(`groups/${groupId}/jassGameSummaries`).doc(tournamentSummaryId).get();
    
    if (!summaryDoc.exists) {
      console.log(`   ❌ Tournament-Summary nicht gefunden: ${tournamentSummaryId}`);
      console.log('   💡 Das erklärt, warum der Datenpunkt fehlt!');
    } else {
      const summaryData = summaryDoc.data()!;
      console.log(`   ✅ Tournament-Summary gefunden: ${tournamentSummaryId}`);
      
      if (summaryData.playerFinalRatings) {
        console.log('   ✅ playerFinalRatings vorhanden:');
        
        for (const [playerId, ratingData] of Object.entries(summaryData.playerFinalRatings)) {
          const playerDoc = await db.collection('players').doc(playerId).get();
          const playerData = playerDoc.data()!;
          const playerName = playerData.displayName || playerId;
          const rating = ratingData as any;
          
          console.log(`      👤 ${playerName}: ${rating.rating} (${rating.ratingDelta > 0 ? '+' : ''}${rating.ratingDelta})`);
        }
      } else {
        console.log('   ❌ Keine playerFinalRatings in Tournament-Summary!');
      }
    }
    
    // ========== 3. ÜBERPRÜFE RATING HISTORY ==========
    console.log('\n📈 Schritt 3/4: Überprüfe Rating History...');
    
    for (const playerId of tournamentData.participantPlayerIds || []) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerData = playerDoc.data()!;
      const playerName = playerData.displayName || playerId;
      
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('eventType', '==', 'tournament_passe')
        .where('tournamentId', '==', tournamentId)
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();
      
      console.log(`   👤 ${playerName}:`);
      
      if (historySnap.empty) {
        console.log(`      ❌ Keine tournament_passe Einträge gefunden!`);
      } else {
        console.log(`      📊 ${historySnap.size} tournament_passe Einträge:`);
        
        for (const historyDoc of historySnap.docs) {
          const historyData = historyDoc.data();
          const eventDate = historyData.createdAt.toDate();
          console.log(`         • ${eventDate.toLocaleDateString('de-CH')} ${eventDate.toLocaleTimeString('de-CH')}: ${historyData.rating}`);
        }
      }
    }
    
    // ========== 4. ÜBERPRÜFE CHART-DATEN ==========
    console.log('\n📊 Schritt 4/4: Überprüfe Chart-Daten...');
    
    // Simuliere den Chart-Service
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt')
      .get();
    
    console.log(`   📊 Gefunden: ${summariesSnap.size} jassGameSummaries`);
    
    let tournamentSummaryWithRatings = false;
    
    for (const summaryDoc of summariesSnap.docs) {
      const summaryData = summaryDoc.data();
      const summaryDate = summaryData.completedAt.toDate();
      
      if (summaryDoc.id === tournamentSummaryId) {
        console.log(`   ✅ Tournament-Summary gefunden: ${summaryDoc.id}`);
        console.log(`      📅 Datum: ${summaryDate.toLocaleDateString('de-CH')}`);
        
        if (summaryData.playerFinalRatings) {
          tournamentSummaryWithRatings = true;
          console.log(`      ✅ playerFinalRatings vorhanden`);
        } else {
          console.log(`      ❌ Keine playerFinalRatings`);
        }
      }
      
      // Prüfe auf Tournament-Summaries um den 11. Mai
      if (summaryDate.toDateString() === tournamentData.completedAt.toDate().toDateString()) {
        console.log(`   📅 Summary am ${summaryDate.toLocaleDateString('de-CH')}: ${summaryDoc.id}`);
        if (summaryData.playerFinalRatings) {
          console.log(`      ✅ Hat playerFinalRatings`);
        } else {
          console.log(`      ❌ Hat keine playerFinalRatings`);
        }
      }
    }
    
    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ ANALYSE ABGESCHLOSSEN\n');
    
    console.log('🎯 FAZIT:');
    
    if (!summaryDoc.exists) {
      console.log('   ❌ PROBLEM GEFUNDEN: Tournament-Summary fehlt!');
      console.log('   💡 Das Rebuild-Script hat das Tournament-Finale nicht korrekt verarbeitet');
      console.log('   🔧 LÖSUNG: Tournament-Summary manuell erstellen oder Rebuild-Script korrigieren');
    } else if (!tournamentSummaryWithRatings) {
      console.log('   ❌ PROBLEM GEFUNDEN: Tournament-Summary hat keine playerFinalRatings!');
      console.log('   💡 Das Rebuild-Script hat playerFinalRatings nicht korrekt geschrieben');
      console.log('   🔧 LÖSUNG: playerFinalRatings manuell hinzufügen oder Rebuild-Script korrigieren');
    } else {
      console.log('   ✅ Tournament-Summary und playerFinalRatings vorhanden');
      console.log('   🤔 Problem liegt möglicherweise im Frontend Chart-Service');
      console.log('   🔧 LÖSUNG: Frontend Chart-Service überprüfen');
    }
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der Tournament-Analyse:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
checkTournamentDataPoint()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
