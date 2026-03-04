#!/usr/bin/env node
/**
 * 🏆 Update Group Leaderboard
 * 
 * Aktualisiert das aggregierte Leaderboard-Dokument einer Gruppe
 * basierend auf den aktuellen playerRatings aus der Subcollection.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateGroupLeaderboard(groupId) {
  console.log(`\n🏆 Aktualisiere Leaderboard für Gruppe ${groupId}...`);
  
  try {
    // 1. Lade alle playerRatings aus der Gruppen-Subcollection
    const ratingsSnap = await db.collection(`groups/${groupId}/playerRatings`).get();
    
    if (ratingsSnap.empty) {
      console.log('⚠️  Keine playerRatings gefunden in dieser Gruppe.');
      return;
    }
    
    console.log(`📊 ${ratingsSnap.size} Spieler gefunden`);
    
    // 2. Lade Spieler-Daten für photoURL
    const leaderboardEntries = [];
    
    for (const doc of ratingsSnap.docs) {
      const data = doc.data();
      const playerId = doc.id;
      
      // Lade Spieler-Dokument für photoURL
      let photoURL = '';
      try {
        const playerDoc = await db.collection('players').doc(playerId).get();
        if (playerDoc.exists) {
          const playerData = playerDoc.data();
          photoURL = playerData.photoURL || playerData.profilePhotoUrl || '';
        }
      } catch (error) {
        console.warn(`   ⚠️  Konnte Player ${playerId} nicht laden:`, error.message);
      }
      
      leaderboardEntries.push({
        playerId,
        displayName: data.displayName || `Spieler_${playerId.slice(0, 6)}`,
        rating: data.rating || 100,
        gamesPlayed: data.gamesPlayed || 0,
        lastDelta: data.lastDelta || 0,
        tier: data.tier || 'Just Egg',
        tierEmoji: data.tierEmoji || '🥚',
        photoURL,
      });
    }
    
    // 3. Nach Rating sortieren (höchstes zuerst)
    leaderboardEntries.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    // 4. Leaderboard-Dokument schreiben
    const leaderboardData = {
      entries: leaderboardEntries,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalMembers: leaderboardEntries.length,
    };
    
    await db.doc(`groups/${groupId}/aggregated/leaderboard`).set(leaderboardData);
    
    console.log(`✅ Leaderboard erfolgreich aktualisiert!`);
    console.log(`\n🏆 TOP 5:`);
    leaderboardEntries.slice(0, 5).forEach((entry, idx) => {
      console.log(`   ${idx + 1}. ${entry.tierEmoji} ${entry.displayName}: ${Math.round(entry.rating)} (${entry.gamesPlayed} Spiele, Delta: ${entry.lastDelta > 0 ? '+' : ''}${entry.lastDelta})`);
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Aktualisieren des Leaderboards:', error);
    throw error;
  }
}

// === MAIN ===
const groupId = process.argv[2];

if (!groupId) {
  console.log(`
🏆 Update Group Leaderboard

USAGE:
  node scripts/updateGroupLeaderboard.cjs <groupId>

BEISPIEL:
  node scripts/updateGroupLeaderboard.cjs Tz0wgIHMTlhvTtFastiJ
  `);
  process.exit(1);
}

updateGroupLeaderboard(groupId)
  .then(() => {
    console.log('\n✅ Fertig!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

