#!/usr/bin/env node
/**
 * 🚀 PERFORMANCE: Migrations-Skript für Leaderboard-Dokumente
 * ========================================================
 * 
 * Erstellt für alle Gruppen die initialen Leaderboard-Dokumente.
 * Lädt die Daten aus groups/{groupId}/members und groups/{groupId}/playerRatings
 * und erstellt daraus groups/{groupId}/aggregated/leaderboard.
 * 
 * Usage:
 *   node scripts/createLeaderboards.cjs [GROUP_ID]   # Für eine spezifische Gruppe
 *   node scripts/createLeaderboards.cjs              # Für alle Gruppen
 */

const admin = require('firebase-admin');

async function init() {
  try {
    admin.initializeApp();
  } catch (e) {
    // Already initialized
  }
  return admin.firestore();
}

async function createLeaderboardForGroup(db, groupId) {
  console.log(`[${groupId}] Creating leaderboard...`);
  
  try {
    // 1. Alle Mitglieder der Gruppe laden
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    const memberIds = membersSnap.docs.map(doc => doc.id);
    
    if (memberIds.length === 0) {
      console.log(`[${groupId}] No members found, skipping.`);
      return;
    }
    
    // 2. Ratings für alle Mitglieder laden
    const leaderboardEntries = [];
    
    for (const memberId of memberIds) {
      const memberDoc = membersSnap.docs.find(doc => doc.id === memberId);
      const memberData = memberDoc?.data();
      
      const ratingSnap = await db.doc(`groups/${groupId}/playerRatings/${memberId}`).get();
      
      if (ratingSnap.exists) {
        const rating = ratingSnap.data();
        leaderboardEntries.push({
          playerId: memberId,
          rating: rating.rating || 100,
          displayName: rating.displayName || memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          tier: rating.tier || 'Anfänger',
          tierEmoji: rating.tierEmoji || '🆕',
          gamesPlayed: rating.gamesPlayed || 0,
          lastDelta: rating.lastDelta || 0,
          photoURL: memberData?.photoURL || null,
        });
      } else {
        // Fallback für Mitglieder ohne Rating
        leaderboardEntries.push({
          playerId: memberId,
          rating: 100,
          displayName: memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
          tier: 'Anfänger',
          tierEmoji: '🆕',
          gamesPlayed: 0,
          lastDelta: 0,
          photoURL: memberData?.photoURL || null,
        });
      }
    }
    
    // 3. Nach Rating sortieren (höchstes zuerst)
    leaderboardEntries.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    // 4. Leaderboard-Dokument erstellen
    const leaderboardData = {
      entries: leaderboardEntries,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalMembers: leaderboardEntries.length,
      migratedAt: admin.firestore.Timestamp.now(),
    };
    
    await db.doc(`groups/${groupId}/aggregated/leaderboard`).set(leaderboardData);
    console.log(`[${groupId}] ✅ Leaderboard created with ${leaderboardEntries.length} members`);
    
  } catch (error) {
    console.error(`[${groupId}] ❌ Error creating leaderboard:`, error);
  }
}

async function main() {
  const db = await init();
  const targetGroupId = process.argv[2];
  
  if (targetGroupId) {
    // Nur eine spezifische Gruppe
    console.log(`Creating leaderboard for group: ${targetGroupId}`);
    await createLeaderboardForGroup(db, targetGroupId);
  } else {
    // Alle Gruppen
    console.log('Creating leaderboards for all groups...');
    const groupsSnap = await db.collection('groups').get();
    
    for (const groupDoc of groupsSnap.docs) {
      await createLeaderboardForGroup(db, groupDoc.id);
    }
  }
  
  console.log('✅ Migration completed!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
