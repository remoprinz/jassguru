/**
 * CLEAR INCORRECT PLAYER FINAL RATINGS
 * 
 * Dieses Script:
 * 1. Löscht alle playerFinalRatings aus jassGameSummaries einer Gruppe
 * 2. Bereitet die Daten für das Backfill-Skript vor
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
async function clearIncorrectPlayerFinalRatings(groupId: string) {
  console.log(`🗑️  CLEAR INCORRECT PLAYER FINAL RATINGS für Gruppe ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // ========== SCHRITT 1: HOLE ALLE JASSGAMESUMMARIES ==========
    console.log('\n📊 Schritt 1/3: Lade alle jassGameSummaries...');
    
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();
    
    if (summariesSnap.empty) {
      console.log('❌ Keine abgeschlossenen Sessions gefunden');
      return;
    }
    
    console.log(`✅ ${summariesSnap.size} Sessions gefunden`);
    
    // ========== SCHRITT 2: IDENTIFIZIERE SUMMARIES MIT PLAYERFINALRATINGS ==========
    console.log('\n🔍 Schritt 2/3: Identifiziere Sessions mit playerFinalRatings...');
    
    const summariesToClear: any[] = [];
    
    for (const summaryDoc of summariesSnap.docs) {
      const summaryData = summaryDoc.data();
      
      // Prüfe ob playerFinalRatings vorhanden sind
      if (summaryData.playerFinalRatings) {
        summariesToClear.push({
          id: summaryDoc.id,
          data: summaryData,
          ref: summaryDoc.ref
        });
      }
    }
    
    console.log(`✅ ${summariesToClear.length} Sessions haben playerFinalRatings`);
    
    if (summariesToClear.length === 0) {
      console.log('🎉 Keine Sessions haben playerFinalRatings!');
      return;
    }
    
    // ========== SCHRITT 3: LÖSCHE PLAYERFINALRATINGS ==========
    console.log('\n🗑️  Schritt 3/3: Lösche playerFinalRatings...');
    
    let clearedCount = 0;
    
    for (const summary of summariesToClear) {
      const { id, ref } = summary;
      
      // Lösche playerFinalRatings Feld
      await ref.update({
        playerFinalRatings: admin.firestore.FieldValue.delete()
      });
      
      clearedCount++;
      console.log(`   ✅ ${id}: playerFinalRatings gelöscht`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ CLEAR INCORRECT PLAYER FINAL RATINGS ABGESCHLOSSEN!');
    console.log(`🗑️  ${clearedCount} Sessions bereinigt`);
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

console.log(`🚨 WARNUNG: Dieses Script löscht ALLE playerFinalRatings für Gruppe ${groupId}!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  clearIncorrectPlayerFinalRatings(groupId);
}, 3000);
