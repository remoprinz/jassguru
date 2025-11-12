/**
 * Backfill Script: playerFinalRatings in jassGameSummaries
 * 
 * ✅ KORREKTE LOGIK:
 * 1. Lese bereits kalkulierte Daten aus ratingHistory
 * 2. Für jede Session: Nehme letzten Eintrag der Session
 * 3. Delta = Rating nach Session - Rating vor Session
 * 4. Schreibe in jassGameSummaries
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Command-line Arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--confirm');

interface BackfillUpdate {
  groupId: string;
  sessionId: string;
  playerFinalRatings: {
    [playerId: string]: {
      rating: number;
      ratingDelta: number;
      gamesPlayed: number;
      displayName?: string;
    };
  };
}

/**
 * Sammle alle jassGameSummaries und extrahiere playerFinalRatings aus ratingHistory
 */
async function collectUpdates(): Promise<BackfillUpdate[]> {
  console.log('\n📥 PHASE 1: Sammle alle Sessions und ihre Spieler...\n');
  
  const updates: BackfillUpdate[] = [];
  
  // Lade alle Gruppen
  const groupsSnap = await db.collection('groups').get();
  console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
  
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    
    // Lade alle completed Sessions
    const summariesSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();
    
    console.log(`   - Gruppe ${groupId}: ${summariesSnap.size} Sessions`);
    
    for (const summaryDoc of summariesSnap.docs) {
      const sessionId = summaryDoc.id;
      const data = summaryDoc.data();
      
      // Extrahiere Spieler-IDs
      const playerIds = data.participantPlayerIds || [];
      if (playerIds.length === 0) continue;
      
      const playerFinalRatings: BackfillUpdate['playerFinalRatings'] = {};
      
      // Für jeden Spieler: Finde letzten ratingHistory-Eintrag dieser Session
      for (const playerId of playerIds) {
        try {
          // Lade alle ratingHistory-Einträge für diese Session
          const historySnap = await db
            .collection(`players/${playerId}/ratingHistory`)
            .get();
          
          // Filtere nach sessionId oder tournamentId
          const isTournament = data.isTournamentSession === true || data.tournamentId;
          const sessionEntries = historySnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((entry: any) => {
              if (isTournament) {
                return entry.tournamentId === (data.tournamentId || sessionId);
              } else {
                return entry.sessionId === sessionId;
              }
            })
            .sort((a: any, b: any) => {
              // ✅ WICHTIG: Sortiere nach gameNumber ODER passeNumber (nicht nach Timestamp!)
              const gameNumA = a.gameNumber || a.passeNumber || 0;
              const gameNumB = b.gameNumber || b.passeNumber || 0;
              
              if (gameNumA !== gameNumB) return gameNumA - gameNumB;
              
              // Fallback: Timestamp wenn gameNumber identisch
              const tsA = a.createdAt || a.completedAt || a.timestamp;
              const tsB = b.createdAt || b.completedAt || b.timestamp;
              
              const timeA = tsA?.toDate ? tsA.toDate().getTime() : (tsA?._seconds ? tsA._seconds * 1000 : 0);
              const timeB = tsB?.toDate ? tsB.toDate().getTime() : (tsB?._seconds ? tsB._seconds * 1000 : 0);
              
              return timeA - timeB;
            });
          
          if (sessionEntries.length === 0) {
            console.warn(`   ⚠️ Keine ratingHistory für Spieler ${playerId} in Session ${sessionId}`);
            continue;
          }
          
          // Nehme letzten Eintrag (finales Rating der Session)
          const lastEntry = sessionEntries[sessionEntries.length - 1] as any;
          
          // 🔍 DEBUG
          console.log(`   📊 ${playerId}: ${sessionEntries.length} entries, lastGame=${lastEntry.gameNumber || 'N/A'}, rating=${lastEntry.rating?.toFixed(2)}`);
          
          // ✅ KORREKT: Summiere ALLE Deltas in dieser Session
          const sessionDelta = sessionEntries.reduce((sum: number, entry: any) => {
            return sum + (entry.delta || 0);
          }, 0);
          
          const ratingAfter = lastEntry.rating;
          const ratingDelta = sessionDelta; // Delta = Summe aller Deltas in dieser Session
          
          // Hole displayName
          const playerDoc = await db.collection('players').doc(playerId).get();
          const playerData = playerDoc.exists ? playerDoc.data() : null;
          const displayName = playerData?.displayName || playerId;
          const gamesPlayed = playerData?.globalStats?.current?.totalGames || 0;
          
          playerFinalRatings[playerId] = {
            rating: ratingAfter,
            ratingDelta: ratingDelta,
            gamesPlayed: gamesPlayed,
            displayName: displayName
          };
          
        } catch (error) {
          console.error(`   ❌ Fehler beim Laden von ratingHistory für ${playerId}:`, error);
        }
      }
      
      // Nur hinzufügen wenn Daten vorhanden
      if (Object.keys(playerFinalRatings).length > 0) {
        updates.push({
          groupId,
          sessionId,
          playerFinalRatings
        });
      }
    }
  }
  
  console.log(`\n   ✅ ${updates.length} Sessions vorbereitet\n`);
  
  return updates;
}

/**
 * Schreibe Updates zu Firestore
 */
async function applyUpdates(updates: BackfillUpdate[]): Promise<void> {
  console.log('\n💾 PHASE 2: Schreibe playerFinalRatings zu jassGameSummaries...\n');
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN: Keine Änderungen werden geschrieben\n');
    
    // Zeige erste 5 Updates als Beispiel
    console.log('📝 Beispiel-Updates (erste 5):\n');
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const update = updates[i];
      console.log(`${i + 1}. Group ${update.groupId}, Session ${update.sessionId}:`);
      Object.entries(update.playerFinalRatings).forEach(([playerId, data]) => {
        console.log(`   ${data.displayName || playerId}: Rating ${data.rating.toFixed(2)} (${data.ratingDelta > 0 ? '+' : ''}${data.ratingDelta.toFixed(2)}) | Games: ${data.gamesPlayed}`);
      });
      console.log('');
    }
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ DRY-RUN ABGESCHLOSSEN!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`\nFühre das Skript mit --confirm aus, um ${updates.length} Updates zu schreiben:\n`);
    console.log('   npx ts-node scripts/backfillPlayerFinalRatingsFromHistory.ts --confirm\n');
    
    return;
  }
  
  // Echtes Schreiben in Batches
  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    const batchUpdates = updates.slice(i, i + batchSize);
    
    for (const update of batchUpdates) {
      const docRef = db
        .collection(`groups/${update.groupId}/jassGameSummaries`)
        .doc(update.sessionId);
      
      batch.update(docRef, { playerFinalRatings: update.playerFinalRatings });
    }
    
    try {
      await batch.commit();
      successCount += batchUpdates.length;
      console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${batchUpdates.length} Updates geschrieben`);
    } catch (error) {
      errorCount += batchUpdates.length;
      console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1} fehlgeschlagen:`, error);
    }
  }
  
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ BACKFILL ABGESCHLOSSEN!');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   Erfolgreich: ${successCount} Updates`);
  console.log(`   Fehler: ${errorCount} Updates`);
  console.log('');
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 BACKFILL: playerFinalRatings aus ratingHistory');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   Modus: ${isDryRun ? '🧪 DRY-RUN' : '✅ LIVE'}`);
  console.log('════════════════════════════════════════════════════════════════');
  
  try {
    // Phase 1: Sammle Updates
    const updates = await collectUpdates();
    
    if (updates.length === 0) {
      console.log('\n⚠️ Keine Updates gefunden. Beende Skript.\n');
      process.exit(0);
    }
    
    // Phase 2: Schreibe Updates
    await applyUpdates(updates);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
}

main();

