#!/usr/bin/env node

/**
 * 🔥 FIX ALL PLAYERS - WORKING VERSION
 * 
 * Basierend auf dem erfolgreichen Tobi-Fix:
 * 1. Collection Group Query funktioniert
 * 2. Session Re-Triggering löst Cloud Functions aus
 * 3. Stats werden korrekt berechnet
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixPlayerStats(playerId, playerName) {
  console.log(`\n🔧 === ${playerName} (${playerId}) ===`);
  
  try {
    // 1. Sammle Sessions für diesen Spieler
    const allSessionsQuery = db.collectionGroup('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', playerId)
      .where('status', '==', 'completed');
    
    const allSessionsSnapshot = await allSessionsQuery.get();
    console.log(`📊 Sessions: ${allSessionsSnapshot.size}`);
    
    if (allSessionsSnapshot.size === 0) {
      console.log('   ✅ Keine Sessions - Skip');
      return { success: true, sessions: 0, action: 'skipped' };
    }
    
    // 2. Lösche alte Stats
    const statsRef = db.collection('playerComputedStats').doc(playerId);
    await statsRef.delete();
    console.log('🗑️  Alte Stats gelöscht');
    
    // 3. Re-trigger alle Sessions
    console.log('🔄 Re-trigger Sessions...');
    let triggeredCount = 0;
    
    for (const doc of allSessionsSnapshot.docs) {
      await doc.ref.update({
        _statsRecalcTrigger: admin.firestore.FieldValue.serverTimestamp(),
        _triggeredBy: 'fix-all-players-working',
        _forPlayer: playerId
      });
      triggeredCount++;
      
      // Kurze Pause um Cloud Functions nicht zu überlasten
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ ${triggeredCount} Sessions re-getriggert`);
    
    return { success: true, sessions: allSessionsSnapshot.size, action: 'retriggered' };
    
  } catch (error) {
    console.error(`❌ Fehler für ${playerName}:`, error.message);
    return { success: false, error: error.message, action: 'failed' };
  }
}

async function fixAllPlayers() {
  console.log('🔥 === FIX ALL PLAYERS STATS ===\n');
  
  try {
    // Lade alle aktiven Spieler
    const playersSnapshot = await db.collection('players')
      .where('isActive', '!=', false)
      .get();
    
    console.log(`📋 Aktive Spieler gefunden: ${playersSnapshot.size}\n`);
    
    const results = {
      total: playersSnapshot.size,
      processed: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      details: []
    };
    
    // Verarbeite jeden Spieler
    for (const playerDoc of playersSnapshot.docs) {
      const playerData = playerDoc.data();
      const playerId = playerDoc.id;
      const playerName = playerData.displayName || 'Unknown';
      
      const result = await fixPlayerStats(playerId, playerName);
      
      results.processed++;
      results.details.push({
        playerId,
        playerName,
        ...result
      });
      
      if (result.success) {
        if (result.action === 'skipped') {
          results.skipped++;
        } else {
          results.success++;
        }
      } else {
        results.failed++;
      }
      
      // Pause zwischen Spielern
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Warte auf Cloud Function Processing
    console.log('\n⏳ Warte 30 Sekunden für Cloud Function Processing...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Zusammenfassung
    console.log('\n📊 === ZUSAMMENFASSUNG ===');
    console.log(`Total Spieler: ${results.total}`);
    console.log(`Verarbeitet: ${results.processed}`);
    console.log(`Erfolgreich: ${results.success}`);
    console.log(`Übersprungen: ${results.skipped}`);
    console.log(`Fehlgeschlagen: ${results.failed}`);
    
    // Detailprüfung für ersten Spieler
    if (results.details.length > 0) {
      const firstPlayer = results.details[0];
      if (firstPlayer.success && firstPlayer.action === 'retriggered') {
        console.log(`\n🔍 Prüfe ${firstPlayer.playerName}...`);
        const statsDoc = await db.collection('playerComputedStats').doc(firstPlayer.playerId).get();
        if (statsDoc.exists) {
          const data = statsDoc.data();
          console.log(`   totalSessions: ${data.totalSessions}`);
          console.log(`   Opponents: ${data.opponentAggregates?.length || 0}`);
          console.log(`   Partners: ${data.partnerAggregates?.length || 0}`);
          
          if (data.totalSessions > 0) {
            console.log('✅ ERFOLG: Stats wurden korrekt berechnet!');
          }
        }
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Gesamtfehler:', error);
    throw error;
  }
}

fixAllPlayers().then((results) => {
  console.log('\n🎯 Fix All Players abgeschlossen!');
  console.log(`Finale Bilanz: ${results.success}/${results.total} erfolgreich`);
  process.exit(0);
}).catch(error => {
  console.error('💥 Script Error:', error);
  process.exit(1);
});
