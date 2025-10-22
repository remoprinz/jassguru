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
 * 🔍 ANALYSIERE DAS ERSTE SPIEL GENAUER
 * 
 * Überprüft die Elo-Berechnung für das erste Spiel und findet den Bug.
 */
async function analyzeFirstGame() {
  console.log('🔍 ANALYSIERE DAS ERSTE SPIEL GENAUER\n');
  console.log('='.repeat(80));
  
  try {
    // ========== 1. HOLE DAS ERSTE SPIEL ==========
    console.log('\n📊 Schritt 1/4: Hole das erste Spiel...');
    
    const firstSessionId = 'fNGTXwzTxxinFXW1EF91B';
    const groupId = 'Tz0wgIHMTlhvTtFastiJ';
    
    const sessionDoc = await db.collection(`groups/${groupId}/jassGameSummaries`).doc(firstSessionId).get();
    
    if (!sessionDoc.exists) {
      console.log('   ❌ Erstes Spiel nicht gefunden!');
      return;
    }
    
    const sessionData = sessionDoc.data()!;
    console.log(`   ✅ Erstes Spiel gefunden: ${firstSessionId}`);
    console.log(`   📅 Datum: ${sessionData.completedAt.toDate().toLocaleDateString('de-CH')}`);
    console.log(`   👥 Teilnehmer: ${sessionData.participantPlayerIds.join(', ')}`);
    
    // ========== 2. ÜBERPRÜFE AKTUELLE PLAYER-RATINGS ==========
    console.log('\n👥 Schritt 2/4: Überprüfe aktuelle Player-Ratings...');
    
    const participantPlayerIds = sessionData.participantPlayerIds;
    
    for (const playerId of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      
      if (playerDoc.exists) {
        const playerData = playerDoc.data()!;
        console.log(`   👤 ${playerData.displayName || playerId}:`);
        console.log(`      • globalRating: ${playerData.globalRating}`);
        console.log(`      • gamesPlayed: ${playerData.gamesPlayed}`);
        console.log(`      • lastSessionDelta: ${playerData.lastSessionDelta}`);
      } else {
        console.log(`   ❌ Player ${playerId} nicht gefunden!`);
      }
    }
    
    // ========== 3. ÜBERPRÜFE RATING HISTORY ==========
    console.log('\n📈 Schritt 3/4: Überprüfe Rating History...');
    
    for (const playerId of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(playerId).get();
      const playerData = playerDoc.data()!;
      const playerName = playerData.displayName || playerId;
      
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      console.log(`   👤 ${playerName} (${playerId}):`);
      
      if (historySnap.empty) {
        console.log(`      ❌ Keine Rating History gefunden!`);
      } else {
        console.log(`      📊 Letzte ${historySnap.size} Einträge:`);
        
        for (const historyDoc of historySnap.docs) {
          const historyData = historyDoc.data();
          const eventDate = historyData.createdAt.toDate();
          console.log(`         • ${eventDate.toLocaleDateString('de-CH')} ${eventDate.toLocaleTimeString('de-CH')}: ${historyData.rating} (${historyData.eventType})`);
        }
      }
    }
    
    // ========== 4. ÜBERPRÜFE PLAYERFINALRATINGS ==========
    console.log('\n🎮 Schritt 4/4: Überprüfe playerFinalRatings...');
    
    if (sessionData.playerFinalRatings) {
      console.log('   ✅ playerFinalRatings gefunden:');
      
      for (const [playerId, ratingData] of Object.entries(sessionData.playerFinalRatings)) {
        const playerDoc = await db.collection('players').doc(playerId).get();
        const playerData = playerDoc.data()!;
        const playerName = playerData.displayName || playerId;
        const rating = ratingData as any;
        
        console.log(`   👤 ${playerName}:`);
        console.log(`      • rating: ${rating.rating}`);
        console.log(`      • ratingDelta: ${rating.ratingDelta}`);
        console.log(`      • gamesPlayed: ${rating.gamesPlayed}`);
      }
    } else {
      console.log('   ❌ Keine playerFinalRatings gefunden!');
    }
    
    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ ANALYSE ABGESCHLOSSEN\n');
    
    console.log('🎯 FAZIT:');
    console.log('   • Das erste Spiel sollte alle Spieler mit 100 Elo starten lassen');
    console.log('   • Wenn unterschiedliche Start-Werte vorhanden sind, liegt ein Bug vor');
    console.log('   • Mögliche Ursachen:');
    console.log('      - Falsche Elo-Berechnung im jassEloUpdater');
    console.log('      - Legacy-Daten wurden nicht vollständig bereinigt');
    console.log('      - Events wurden in falscher Reihenfolge verarbeitet');
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der Spiel-Analyse:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
analyzeFirstGame()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
