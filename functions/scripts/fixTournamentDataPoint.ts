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
 * 🔧 FIXE TOURNAMENT-DATENPUNKT
 * 
 * Ergänzt die fehlenden playerFinalRatings für das Turnier vom 11. Mai 2025.
 */
async function fixTournamentDataPoint() {
  console.log('🔧 FIXE TOURNAMENT-DATENPUNKT\n');
  console.log('='.repeat(80));
  
  try {
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    const tournamentSummaryId = '6eNr8fnsTO06jgCqjelt'; // Das existierende Summary
    
    console.log(`🎯 Fixe Turnier: ${tournamentId}`);
    console.log(`📅 Datum: 11. Mai 2025`);
    console.log(`📄 Summary-ID: ${tournamentSummaryId}\n`);
    
    // ========== 1. HOLE TOURNAMENT-DATEN ==========
    console.log('📊 Schritt 1/3: Hole Tournament-Daten...');
    
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    
    if (!tournamentDoc.exists) {
      console.log('   ❌ Tournament-Dokument nicht gefunden!');
      return;
    }
    
    const tournamentData = tournamentDoc.data()!;
    console.log(`   ✅ Tournament-Dokument gefunden`);
    console.log(`   📅 completedAt: ${tournamentData.completedAt.toDate().toLocaleDateString('de-CH')}`);
    
    // ========== 2. HOLE AKTUELLE PLAYER-RATINGS ==========
    console.log('\n👥 Schritt 2/3: Hole aktuelle Player-Ratings...');
    
    // Da das Tournament bereits verarbeitet wurde, hole die aktuellen Ratings
    const participantPlayerIds = ['b16c1120111b7d9e7d733837', 'PLaDRlPBo91yu5Ij8MOT2', 'TPBwj8bP9W59n5LoGWP5', 'F1uwdthL6zu7F0cYf1jbe'];
    const playerFinalRatings: any = {};
    
    for (const playerId of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      
      if (playerDoc.exists) {
        const playerData = playerDoc.data()!;
        const playerName = playerData.displayName || playerId;
        
        // Verwende die aktuellen Player-Ratings (nach dem Tournament)
        const finalRating = playerData.globalRating || 100;
        const gamesPlayed = playerData.gamesPlayed || 0;
        
        playerFinalRatings[playerId] = {
          displayName: playerName,
          rating: finalRating,
          ratingDelta: 0, // Tournament-Delta wird nicht separat gespeichert
          gamesPlayed: gamesPlayed
        };
        
        console.log(`   👤 ${playerName}: ${finalRating} (${gamesPlayed} Spiele)`);
      }
    }
    
    // ========== 3. AKTUALISIERE TOURNAMENT-SUMMARY ==========
    console.log('\n📝 Schritt 3/3: Aktualisiere Tournament-Summary...');
    
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
    console.log('✅ TOURNAMENT-DATENPUNKT GEFIXT!\n');
    
    console.log('🎯 FAZIT:');
    console.log('   ✅ Tournament-Summary mit playerFinalRatings ergänzt');
    console.log('   📊 Chart sollte jetzt den Datenpunkt für 11. Mai 2025 anzeigen');
    console.log('   🔄 Frontend muss möglicherweise neu geladen werden');
    
  } catch (error) {
    console.error('\n❌ FEHLER beim Fixen des Tournament-Datenpunkts:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
fixTournamentDataPoint()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
