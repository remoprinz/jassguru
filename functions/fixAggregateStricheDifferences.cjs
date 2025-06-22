/**
 * Backfill-Script zur Korrektur der Strichdifferenzen in Partner/Gegner-Aggregaten
 * 
 * Problem: Die totalStricheDifferenceWith und totalStricheDifferenceAgainst Felder
 * waren bisher nicht implementiert und sind überall 0.
 * 
 * Lösung: Für jeden Spieler alle Sessions durchgehen und die Aggregate neu berechnen.
 */

const admin = require('firebase-admin');

// Firebase Admin für Production initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jassguru-c8c80', // Deine Firebase-Project ID
  });
}

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassgameSummaries';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

/**
 * Berechnet die Summe aller Striche aus einem StricheRecord
 */
function calculateTotalStriche(striche) {
  if (!striche) return 0;
  return (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + 
         (striche.schneider || 0) + (striche.kontermatsch || 0);
}

/**
 * Ermittelt das Team eines Spielers in einer Session
 */
function getPlayerTeam(playerId, sessionData) {
  if (sessionData.teams?.top?.players?.some(p => p.playerId === playerId)) {
    return 'top';
  }
  if (sessionData.teams?.bottom?.players?.some(p => p.playerId === playerId)) {
    return 'bottom';
  }
  return null;
}

/**
 * Korrigiert die Aggregate für einen einzelnen Spieler
 */
async function fixPlayerAggregates(playerId) {
  console.log(`\n🔧 Fixing aggregates for player ${playerId}...`);
  
  // 1. Alle abgeschlossenen Sessions des Spielers laden
  const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
    .where('participantPlayerIds', 'array-contains', playerId)
    .where('status', '==', 'completed')
    .orderBy('startedAt', 'asc')
    .get();

  if (sessionsSnap.empty) {
    console.log(`   ⚠️  No completed sessions found for player ${playerId}`);
    return;
  }

  // 2. Bestehende Statistiken laden
  const playerStatsRef = db.collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(playerId);
  const playerStatsSnap = await playerStatsRef.get();
  
  if (!playerStatsSnap.exists) {
    console.log(`   ⚠️  No existing stats found for player ${playerId}`);
    return;
  }

  const playerStats = playerStatsSnap.data();
  
  // 3. Aggregate zurücksetzen und neu berechnen
  const partnerDifferences = new Map(); // partnerId -> totalDifference
  const opponentDifferences = new Map(); // opponentId -> totalDifference
  const partnerPointsDifferences = new Map(); // partnerId -> totalPointsDifference
  const opponentPointsDifferences = new Map(); // opponentId -> totalPointsDifference

  console.log(`   📊 Processing ${sessionsSnap.size} sessions...`);

  sessionsSnap.docs.forEach(sessionDoc => {
    const sessionData = sessionDoc.data();
    const playerTeam = getPlayerTeam(playerId, sessionData);
    
    if (!playerTeam || !sessionData.finalStriche || !sessionData.finalScores) {
      return;
    }

    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Berechne Session-Level Differenzen
    const playerStriche = calculateTotalStriche(sessionData.finalStriche[playerTeam]);
    const opponentStriche = calculateTotalStriche(sessionData.finalStriche[opponentTeam]);
    const sessionStricheDifference = playerStriche - opponentStriche;
    
    const playerPoints = sessionData.finalScores[playerTeam] || 0;
    const opponentPoints = sessionData.finalScores[opponentTeam] || 0;
    const sessionPointsDifference = playerPoints - opponentPoints;

    // Partner IDs sammeln
    const partnerIds = sessionData.teams?.[playerTeam]?.players
      ?.filter(p => p.playerId !== playerId)
      ?.map(p => p.playerId) || [];
    
    // Gegner IDs sammeln
    const opponentIds = sessionData.teams?.[opponentTeam]?.players
      ?.map(p => p.playerId) || [];

    // Zu Partner-Aggregaten addieren
    partnerIds.forEach(partnerId => {
      const currentDiff = partnerDifferences.get(partnerId) || 0;
      partnerDifferences.set(partnerId, currentDiff + sessionStricheDifference);
      
      const currentPointsDiff = partnerPointsDifferences.get(partnerId) || 0;
      partnerPointsDifferences.set(partnerId, currentPointsDiff + sessionPointsDifference);
    });

    // Zu Gegner-Aggregaten addieren
    opponentIds.forEach(opponentId => {
      const currentDiff = opponentDifferences.get(opponentId) || 0;
      opponentDifferences.set(opponentId, currentDiff + sessionStricheDifference);
      
      const currentPointsDiff = opponentPointsDifferences.get(opponentId) || 0;
      opponentPointsDifferences.set(opponentId, currentPointsDiff + sessionPointsDifference);
    });
  });

  // 4. Bestehende Aggregate aktualisieren
  let updatedPartnerCount = 0;
  let updatedOpponentCount = 0;

  if (playerStats.partnerAggregates) {
    playerStats.partnerAggregates.forEach(partner => {
      const newStricheDiff = partnerDifferences.get(partner.partnerId) || 0;
      const newPointsDiff = partnerPointsDifferences.get(partner.partnerId) || 0;
      
      if (partner.totalStricheDifferenceWith !== newStricheDiff) {
        console.log(`     Partner ${partner.partnerDisplayName || partner.partnerId}: ${partner.totalStricheDifferenceWith} → ${newStricheDiff}`);
        partner.totalStricheDifferenceWith = newStricheDiff;
        partner.totalPointsDifferenceWith = newPointsDiff;
        updatedPartnerCount++;
      }
    });
  }

  if (playerStats.opponentAggregates) {
    playerStats.opponentAggregates.forEach(opponent => {
      const newStricheDiff = opponentDifferences.get(opponent.opponentId) || 0;
      const newPointsDiff = opponentPointsDifferences.get(opponent.opponentId) || 0;
      
      if (opponent.totalStricheDifferenceAgainst !== newStricheDiff) {
        console.log(`     Opponent ${opponent.opponentDisplayName || opponent.opponentId}: ${opponent.totalStricheDifferenceAgainst} → ${newStricheDiff}`);
        opponent.totalStricheDifferenceAgainst = newStricheDiff;
        opponent.totalPointsDifferenceAgainst = newPointsDiff;
        updatedOpponentCount++;
      }
    });
  }

  // 5. Aktualisierte Statistiken speichern
  if (updatedPartnerCount > 0 || updatedOpponentCount > 0) {
    playerStats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
    await playerStatsRef.set(playerStats, { merge: true });
    console.log(`   ✅ Updated ${updatedPartnerCount} partner aggregates and ${updatedOpponentCount} opponent aggregates`);
  } else {
    console.log(`   ℹ️  No updates needed - all aggregates already correct`);
  }
}

/**
 * Hauptfunktion - korrigiert alle Spielerstatistiken
 */
async function fixAllAggregateStricheDifferences() {
  console.log('🚀 Starting aggregate striche differences fix...\n');
  
  try {
    // Alle Spieler mit Statistiken laden
    const playerStatsSnap = await db.collection(PLAYER_COMPUTED_STATS_COLLECTION).get();
    
    if (playerStatsSnap.empty) {
      console.log('❌ No player statistics found');
      return;
    }

    console.log(`📈 Found ${playerStatsSnap.size} players with statistics`);
    
    // Jeden Spieler verarbeiten
    for (const playerDoc of playerStatsSnap.docs) {
      const playerId = playerDoc.id;
      await fixPlayerAggregates(playerId);
    }
    
    console.log('\n✅ All aggregate striche differences have been fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing aggregate striche differences:', error);
  }
}

// Script ausführen
fixAllAggregateStricheDifferences()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  }); 