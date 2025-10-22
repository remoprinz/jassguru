/**
 * FIX RATING HISTORY BUG
 * 
 * Dieses Script behebt den Bug in der ratingHistory:
 * - Entfernt doppelte Game-by-Game Einträge
 * - Behält nur Session-Ende-Einträge
 * - Korrigiert falsche Startwerte (z.B. 100 nach Verlust)
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
async function fixRatingHistoryBug(groupId: string) {
  console.log(`🔧 FIX RATING HISTORY BUG für Gruppe ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // ========== SCHRITT 1: HOLE ALLE MITGLIEDER ==========
    console.log('\n📊 Schritt 1/4: Lade alle Gruppenmitglieder...');
    
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    const memberIds = membersSnap.docs.map(doc => doc.id);
    
    if (memberIds.length === 0) {
      console.log('❌ Keine Mitglieder gefunden');
      return;
    }
    
    console.log(`✅ ${memberIds.length} Mitglieder gefunden`);
    
    // ========== SCHRITT 2: ANALYSIERE RATING HISTORY FÜR JEDEN SPIELER ==========
    console.log('\n🔍 Schritt 2/4: Analysiere Rating History für jeden Spieler...');
    
    const playerIssues: Array<{
      playerId: string;
      totalEntries: number;
      sessionEndEntries: number;
      gameByGameEntries: number;
      issues: string[];
    }> = [];
    
    for (const playerId of memberIds) {
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .orderBy('completedAt', 'asc')
        .get();
      
      const allEntries = historySnap.docs.map(doc => ({
        id: doc.id,
        data: doc.data(),
        ref: doc.ref
      }));
      
      const sessionEndEntries = allEntries.filter(entry => 
        entry.data.eventType === 'session_end' || 
        entry.data.eventType === 'tournament_end' ||
        entry.data.eventType === 'manual_recalc'
      );
      
      const gameByGameEntries = allEntries.filter(entry => 
        entry.data.eventType !== 'session_end' && 
        entry.data.eventType !== 'tournament_end' &&
        entry.data.eventType !== 'manual_recalc'
      );
      
      const issues: string[] = [];
      
      // Prüfe auf doppelte Einträge
      if (gameByGameEntries.length > 0) {
        issues.push(`${gameByGameEntries.length} Game-by-Game Einträge (sollten gelöscht werden)`);
      }
      
      // Prüfe auf falsche Startwerte
      if (sessionEndEntries.length > 0) {
        const firstEntry = sessionEndEntries[0];
        if (firstEntry.data.rating === 100 && firstEntry.data.delta < 0) {
          issues.push(`Falscher Startwert: 100 nach Verlust (Delta: ${firstEntry.data.delta})`);
        }
      }
      
      playerIssues.push({
        playerId,
        totalEntries: allEntries.length,
        sessionEndEntries: sessionEndEntries.length,
        gameByGameEntries: gameByGameEntries.length,
        issues
      });
      
      console.log(`   👤 ${playerId}: ${allEntries.length} total, ${sessionEndEntries.length} Session-Ende, ${gameByGameEntries.length} Game-by-Game`);
      if (issues.length > 0) {
        console.log(`      ⚠️  Issues: ${issues.join(', ')}`);
      }
    }
    
    // ========== SCHRITT 3: LÖSCHE GAME-BY-GAME EINTRÄGE ==========
    console.log('\n🗑️  Schritt 3/4: Lösche Game-by-Game Einträge...');
    
    let deletedCount = 0;
    
    for (const playerIssue of playerIssues) {
      if (playerIssue.gameByGameEntries > 0) {
        const historySnap = await db.collection(`players/${playerIssue.playerId}/ratingHistory`)
          .orderBy('completedAt', 'asc')
          .get();
        
        const gameByGameEntries = historySnap.docs.filter(doc => {
          const data = doc.data();
          return data.eventType !== 'session_end' && 
                 data.eventType !== 'tournament_end' &&
                 data.eventType !== 'manual_recalc';
        });
        
        // Lösche Game-by-Game Einträge
        for (const entry of gameByGameEntries) {
          await entry.ref.delete();
          deletedCount++;
          console.log(`   ✅ ${playerIssue.playerId}: Game-by-Game Eintrag gelöscht`);
        }
      }
    }
    
    // ========== SCHRITT 4: KORRIGIERE FALSCHE STARTWERTE ==========
    console.log('\n🔧 Schritt 4/4: Korrigiere falsche Startwerte...');
    
    let correctedCount = 0;
    
    for (const playerIssue of playerIssues) {
      if (playerIssue.issues.some(issue => issue.includes('Falscher Startwert'))) {
        const historySnap = await db.collection(`players/${playerIssue.playerId}/ratingHistory`)
          .orderBy('completedAt', 'asc')
          .get();
        
        const firstEntry = historySnap.docs[0];
        if (firstEntry) {
          const data = firstEntry.data();
          if (data.rating === 100 && data.delta < 0) {
            // Korrigiere: Rating sollte 100 + Delta sein
            const correctedRating = 100 + data.delta;
            await firstEntry.ref.update({
              rating: correctedRating,
              delta: 0 // Delta sollte 0 sein für den ersten Eintrag
            });
            correctedCount++;
            console.log(`   ✅ ${playerIssue.playerId}: Startwert korrigiert 100 → ${correctedRating}`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ RATING HISTORY BUG FIX ABGESCHLOSSEN!');
    console.log(`🗑️  ${deletedCount} Game-by-Game Einträge gelöscht`);
    console.log(`🔧 ${correctedCount} falsche Startwerte korrigiert`);
    console.log('='.repeat(80));
    console.log('\n🚀 NÄCHSTER SCHRITT: Führe backfillPlayerFinalRatings.ts aus!');

  } catch (error) {
    console.error('❌ FEHLER:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Ausführung
const groupId = process.argv[2] || 'Tz0wgIHMTlhvTtFastiJ'; // Standard: fürDich OGs

console.log(`🚨 WARNUNG: Dieses Script korrigiert die ratingHistory für Gruppe ${groupId}!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  fixRatingHistoryBug(groupId);
}, 3000);
