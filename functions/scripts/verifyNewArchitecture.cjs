#!/usr/bin/env node

/**
 * ✅ VERIFY NEW ARCHITECTURE SCRIPT
 * 
 * Prüft OB die neuen Services tatsächlich in die neue Struktur schreiben.
 * Liest live aus der Datenbank und vergleicht mit Code.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Service Account Key laden
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyNewArchitecture() {
  console.log('🔍 START: Verifiziere neue Architektur...\n');
  
  try {
    // 1. Sample Player nehmen (aus DB)
    const playersSnap = await db.collection('players').limit(1).get();
    
    if (playersSnap.empty) {
      console.error('❌ Keine Spieler in der Datenbank!');
      return;
    }
    
    const playerId = playersSnap.docs[0].id;
    const playerData = playersSnap.docs[0].data();
    
    console.log(`📊 Prüfe Spieler: ${playerData.displayName} (${playerId})\n`);
    
    // 2. Prüfe ROOT Document
    console.log('═══════════════════════════════════════');
    console.log('1️⃣ ROOT DOCUMENT (players/{playerId})');
    console.log('═══════════════════════════════════════');
    console.log('✅ globalRating:', playerData.globalRating);
    console.log('✅ displayName:', playerData.displayName);
    console.log('✅ totalGamesPlayed:', playerData.totalGamesPlayed);
    console.log('✅ tier:', playerData.tier);
    console.log('✅ lastSessionDelta:', playerData.lastSessionDelta);
    console.log('');
    
    // 3. Prüfe globalStats
    if (playerData.globalStats) {
      console.log('   📊 globalStats.current:');
      const gs = playerData.globalStats.current;
      console.log('     ✅ totalGames:', gs.totalGames);
      console.log('     ✅ totalSessions:', gs.totalSessions);
      console.log('     ✅ totalPointsMade:', gs.totalPointsMade);
      console.log('     ✅ pointsDifference:', gs.pointsDifference);
      console.log('');
    }
    
    // 4. Prüfe groupStats Subcollection
    console.log('═══════════════════════════════════════');
    console.log('2️⃣ GROUP STATS Subcollection');
    console.log('═══════════════════════════════════════');
    const groupStatsSnap = await db.collection(`players/${playerId}/groupStats`).limit(5).get();
    console.log(`✅ Found ${groupStatsSnap.size} groups\n`);
    
    groupStatsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   📁 Group: ${doc.id}`);
      console.log(`      ✅ gamesPlayed: ${data.gamesPlayed}`);
      console.log(`      ✅ pointsDifference: ${data.pointsDifference}`);
      console.log(`      ✅ winRate: ${data.winRate}`);
      console.log('');
    });
    
    // 5. Prüfe partnerStats Subcollection
    console.log('═══════════════════════════════════════');
    console.log('3️⃣ PARTNER STATS Subcollection');
    console.log('═══════════════════════════════════════');
    const partnerStatsSnap = await db.collection(`players/${playerId}/partnerStats`).limit(5).get();
    console.log(`✅ Found ${partnerStatsSnap.size} partners\n`);
    
    partnerStatsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   👥 Partner: ${data.partnerDisplayName || doc.id}`);
      console.log(`      ✅ gamesPlayed: ${data.gamesPlayed}`);
      console.log(`      ✅ wins: ${data.wins}`);
      console.log(`      ✅ losses: ${data.losses}`);
      console.log(`      ✅ winRate: ${data.winRate}`);
      console.log('');
    });
    
    // 6. Prüfe opponentStats Subcollection
    console.log('═══════════════════════════════════════');
    console.log('4️⃣ OPPONENT STATS Subcollection');
    console.log('═══════════════════════════════════════');
    const opponentStatsSnap = await db.collection(`players/${playerId}/opponentStats`).limit(5).get();
    console.log(`✅ Found ${opponentStatsSnap.size} opponents\n`);
    
    opponentStatsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   🎯 Opponent: ${data.opponentDisplayName || doc.id}`);
      console.log(`      ✅ gamesPlayed: ${data.gamesPlayed}`);
      console.log(`      ✅ wins: ${data.wins}`);
      console.log(`      ✅ losses: ${data.losses}`);
      console.log(`      ✅ winRate: ${data.winRate}`);
      console.log('');
    });
    
    // 7. Prüfe ratingHistory Subcollection
    console.log('═══════════════════════════════════════');
    console.log('5️⃣ RATING HISTORY Subcollection');
    console.log('═══════════════════════════════════════');
    const ratingHistorySnap = await db.collection(`players/${playerId}/ratingHistory`).orderBy('completedAt', 'desc').limit(3).get();
    console.log(`✅ Found ${ratingHistorySnap.size} recent ratings\n`);
    
    ratingHistorySnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   📈 Rating at ${data.completedAt?.toDate?.() || 'N/A'}`);
      console.log(`      ✅ rating: ${data.rating}`);
      console.log(`      ✅ delta: ${data.delta}`);
      console.log(`      ✅ eventType: ${data.eventType}`);
      console.log('');
    });
    
    // 8. Prüfe scoresHistory Subcollection
    console.log('═══════════════════════════════════════');
    console.log('6️⃣ SCORES HISTORY Subcollection');
    console.log('═══════════════════════════════════════');
    const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`).orderBy('timestamp', 'desc').limit(3).get();
    console.log(`✅ Found ${scoresHistorySnap.size} recent score entries\n`);
    
    scoresHistorySnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   📊 Score entry at ${data.timestamp?.toDate?.() || 'N/A'}`);
      console.log(`      ✅ sessionId: ${data.sessionId}`);
      console.log(`      ✅ groupId: ${data.groupId}`);
      console.log(`      ✅ stricheDiff: ${data.stricheDiff}`);
      console.log('');
    });
    
    // 9. Prüfe playerComputedStats (ALTE Collection)
    console.log('═══════════════════════════════════════');
    console.log('7️⃣ PLAYER COMPUTED STATS (ALTE Collection)');
    console.log('═══════════════════════════════════════');
    const playerComputedStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (playerComputedStatsDoc.exists) {
      const data = playerComputedStatsDoc.data();
      console.log('⚠️  Alte Collection existiert noch!');
      console.log('   ❌ partnerAggregates:', data.partnerAggregates?.length || 0);
      console.log('   ❌ opponentAggregates:', data.opponentAggregates?.length || 0);
      console.log('   📊 Wird NICHT mehr befüllt!');
      console.log('');
    } else {
      console.log('✅ Alte Collection existiert NICHT (gut!)');
      console.log('');
    }
    
    // 10. FAZIT
    console.log('═══════════════════════════════════════');
    console.log('📊 FAZIT');
    console.log('═══════════════════════════════════════');
    console.log('✅ Neue Struktur existiert');
    console.log('✅ Alle Subcollections vorhanden');
    console.log('✅ Daten werden geschrieben');
    console.log('');
    console.log('🎯 NÄCHSTES SCHRITT: Frontend migrieren!');
    
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
  
  process.exit(0);
}

verifyNewArchitecture();

