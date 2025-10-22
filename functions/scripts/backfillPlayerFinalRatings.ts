/**
 * BACKFILL PLAYER FINAL RATINGS
 * 
 * Dieses Script:
 * 1. Geht durch alle jassGameSummaries einer Gruppe
 * 2. Findet die fehlenden playerFinalRatings
 * 3. Berechnet die korrekten Werte aus ratingHistory
 * 4. Schreibt sie in die jassGameSummaries zurück
 */

import * as admin from 'firebase-admin';

// Firebase Admin initialisieren
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

/**
 * Hauptfunktion für eine spezifische Gruppe
 */
async function backfillPlayerFinalRatings(groupId: string) {
  console.log(`🎯 BACKFILL PLAYER FINAL RATINGS für Gruppe ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // ========== SCHRITT 1: HOLE ALLE JASSGAMESUMMARIES ==========
    console.log('\n📊 Schritt 1/4: Lade alle jassGameSummaries...');
    
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (summariesSnap.empty) {
      console.log('❌ Keine abgeschlossenen Sessions gefunden');
      return;
    }
    
    console.log(`✅ ${summariesSnap.size} Sessions gefunden`);
    
    // ========== SCHRITT 2: IDENTIFIZIERE FEHLENDE PLAYERFINALRATINGS ==========
    console.log('\n🔍 Schritt 2/4: Identifiziere fehlende playerFinalRatings...');
    
    const summariesToUpdate: any[] = [];
    
    for (const summaryDoc of summariesSnap.docs) {
      const summaryData = summaryDoc.data();
      
      // Prüfe ob playerFinalRatings fehlen
      if (!summaryData.playerFinalRatings && summaryData.participantPlayerIds) {
        summariesToUpdate.push({
          id: summaryDoc.id,
          data: summaryData,
          ref: summaryDoc.ref
        });
      }
    }
    
    console.log(`✅ ${summariesToUpdate.length} Sessions benötigen playerFinalRatings`);
    
    if (summariesToUpdate.length === 0) {
      console.log('🎉 Alle Sessions haben bereits playerFinalRatings!');
      return;
    }
    
    // ========== SCHRITT 3: SAMMLE ALLE SPIELER-IDS ==========
    console.log('\n👥 Schritt 3/4: Sammle alle Spieler-IDs...');
    
    const allPlayerIds = new Set<string>();
    summariesToUpdate.forEach(summary => {
      if (summary.data.participantPlayerIds) {
        summary.data.participantPlayerIds.forEach((id: string) => allPlayerIds.add(id));
      }
    });
    
    console.log(`✅ ${allPlayerIds.size} einzigartige Spieler gefunden`);
    
    // ========== SCHRITT 4: LADE RATING HISTORY FÜR ALLE SPIELER ==========
    console.log('\n📈 Schritt 4/4: Lade Rating History und berechne playerFinalRatings...');
    
    const playerRatingHistory = new Map<string, Array<{
      timestamp: admin.firestore.Timestamp;
      rating: number;
      delta: number;
    }>>();
    
    // Lade Rating History für jeden Spieler
    for (const playerId of allPlayerIds) {
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .orderBy('completedAt', 'asc')
        .get();
      
      const history: Array<{
        timestamp: admin.firestore.Timestamp;
        rating: number;
        delta: number;
        eventType: string;
      }> = [];
      
      historySnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.completedAt && data.rating !== undefined) {
          history.push({
            timestamp: data.completedAt,
            rating: data.rating,
            delta: data.delta || 0,
            eventType: data.eventType || 'unknown'
          });
        }
      });
      
      // 🐛 BUG-FIX: Filtere nur Session-Ende-Einträge (nicht Game-by-Game)
      const sessionEndHistory = history.filter(entry => 
        entry.eventType === 'session_end' || 
        entry.eventType === 'tournament_end' ||
        entry.eventType === 'manual_recalc'
      );
      
      playerRatingHistory.set(playerId, sessionEndHistory);
      console.log(`   👤 ${playerId}: ${sessionEndHistory.length} Session-Ende-Einträge (von ${history.length} total)`);
    }
    
    // ========== SCHRITT 5: BERECHNE PLAYERFINALRATINGS FÜR JEDE SESSION ==========
    console.log('\n⚙️  Schritt 5/5: Berechne playerFinalRatings für jede Session...');
    
    let processedCount = 0;
    
    for (const summary of summariesToUpdate) {
      processedCount++;
      const { id, data, ref } = summary;
      
      console.log(`\n📅 Session ${processedCount}/${summariesToUpdate.length}: ${id}`);
      
      const playerFinalRatings: { [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } } = {};
      
      // Für jeden Teilnehmer der Session
      for (const playerId of data.participantPlayerIds || []) {
        const history = playerRatingHistory.get(playerId) || [];
        
        // Finde den Rating-Eintrag der NACH dieser Session kam
        let finalRating = 100; // Default
        let ratingDelta = 0;
        let gamesPlayed = 0;
        
        // Suche den letzten Rating-Eintrag vor oder zum Zeitpunkt dieser Session
        const sessionCompletedAt = data.completedAt;
        
        // Finde den Rating-Eintrag der dieser Session entspricht
        const sessionRatingEntry = history.find(entry => 
          entry.timestamp.toMillis() === sessionCompletedAt.toMillis()
        );
        
        if (sessionRatingEntry) {
          finalRating = sessionRatingEntry.rating;
          ratingDelta = sessionRatingEntry.delta;
        } else {
          // Fallback: Finde den letzten Rating-Eintrag vor dieser Session
          const lastEntryBeforeSession = history
            .filter(entry => entry.timestamp.toMillis() <= sessionCompletedAt.toMillis())
            .pop();
          
          if (lastEntryBeforeSession) {
            finalRating = lastEntryBeforeSession.rating;
            ratingDelta = lastEntryBeforeSession.delta;
          }
        }
        
        // Zähle Spiele für diesen Spieler
        const playerGamesCount = history.filter(entry => 
          entry.timestamp.toMillis() <= sessionCompletedAt.toMillis()
        ).length;
        
        playerFinalRatings[playerId] = {
          rating: finalRating,
          ratingDelta: ratingDelta,
          gamesPlayed: playerGamesCount
        };
        
        console.log(`   👤 ${playerId}: Rating ${finalRating}, Delta ${ratingDelta}, Games ${playerGamesCount}`);
      }
      
      // Schreibe playerFinalRatings in die Session
      await ref.update({ playerFinalRatings });
      console.log(`   ✅ playerFinalRatings gespeichert für ${Object.keys(playerFinalRatings).length} Spieler`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BACKFILL PLAYER FINAL RATINGS ABGESCHLOSSEN!');
    console.log(`📊 ${processedCount} Sessions aktualisiert`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ FEHLER:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Ausführung
const groupId = process.argv[2] || 'Tz0wgIHMTlhvTtFastiJ'; // Standard: fürDich OGs

console.log(`🚨 WARNUNG: Dieses Script befüllt playerFinalRatings für Gruppe ${groupId}!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  backfillPlayerFinalRatings(groupId);
}, 3000);
