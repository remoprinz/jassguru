import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';

const JASS_SUMMARIES_COLLECTION = 'jassgameSummaries';
const PLAYER_COMPUTED_STATS_COLLECTION = 'playerComputedStats';

/**
 * Berechnet die Summe aller Striche aus einem StricheRecord
 */
function calculateTotalStriche(striche: any): number {
  if (!striche) return 0;
  return (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + 
         (striche.schneider || 0) + (striche.kontermatsch || 0);
}

/**
 * Ermittelt das Team eines Spielers in einer Session
 */
function getPlayerTeam(playerId: string, sessionData: any): 'top' | 'bottom' | null {
  if (sessionData.teams?.top?.players?.some((p: any) => p.playerId === playerId)) {
    return 'top';
  }
  if (sessionData.teams?.bottom?.players?.some((p: any) => p.playerId === playerId)) {
    return 'bottom';
  }
  return null;
}

/**
 * Korrigiert die Aggregate für einen einzelnen Spieler
 */
async function fixPlayerAggregates(playerId: string): Promise<{
  updatedPartnerCount: number;
  updatedOpponentCount: number;
  playerName?: string;
}> {
  console.log(`🔧 Fixing aggregates for player ${playerId}...`);
  
  const playerStatsRef = admin.firestore().collection(PLAYER_COMPUTED_STATS_COLLECTION).doc(playerId);
  const playerStatsSnap = await playerStatsRef.get();
  
  if (!playerStatsSnap.exists) {
    console.log(`   ⚠️  No existing stats found for player ${playerId}`);
    return { updatedPartnerCount: 0, updatedOpponentCount: 0 };
  }

  const playerStats = playerStatsSnap.data()!;
  
  // 2. ✅ OPTIMIERT: Einfache Query ohne komplexen Index
  // Erst alle completed sessions, dann filtern wir nach participantPlayerIds
  const allCompletedSessionsSnap = await admin.firestore().collection(JASS_SUMMARIES_COLLECTION)
    .where('status', '==', 'completed')
    .get();

  if (allCompletedSessionsSnap.empty) {
    console.log(`   ⚠️  No completed sessions found at all`);
    return { updatedPartnerCount: 0, updatedOpponentCount: 0 };
  }

  // Filtern auf Sessions mit diesem Spieler
  const playerSessions = allCompletedSessionsSnap.docs.filter(sessionDoc => {
    const sessionData = sessionDoc.data();
    return sessionData.participantPlayerIds?.includes(playerId) || false;
  });

  if (playerSessions.length === 0) {
    console.log(`   ⚠️  No completed sessions found for player ${playerId}`);
    return { updatedPartnerCount: 0, updatedOpponentCount: 0 };
  }

  // 3. Aggregate zurücksetzen und neu berechnen
  const partnerDifferences = new Map<string, number>();
  const opponentDifferences = new Map<string, number>();
  const partnerPointsDifferences = new Map<string, number>();
  const opponentPointsDifferences = new Map<string, number>();

  console.log(`   📊 Processing ${playerSessions.length} sessions...`);

  playerSessions.forEach(sessionDoc => {
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
      ?.filter((p: any) => p.playerId !== playerId)
      ?.map((p: any) => p.playerId) || [];
    
    // Gegner IDs sammeln
    const opponentIds = sessionData.teams?.[opponentTeam]?.players
      ?.map((p: any) => p.playerId) || [];

    // Zu Partner-Aggregaten addieren
    partnerIds.forEach((partnerId: string) => {
      const currentDiff = partnerDifferences.get(partnerId) || 0;
      partnerDifferences.set(partnerId, currentDiff + sessionStricheDifference);
      
      const currentPointsDiff = partnerPointsDifferences.get(partnerId) || 0;
      partnerPointsDifferences.set(partnerId, currentPointsDiff + sessionPointsDifference);
    });

    // Zu Gegner-Aggregaten addieren
    opponentIds.forEach((opponentId: string) => {
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
    playerStats.partnerAggregates.forEach((partner: any) => {
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
    playerStats.opponentAggregates.forEach((opponent: any) => {
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

  return { 
    updatedPartnerCount, 
    updatedOpponentCount,
    playerName: playerSessions[0]?.data()?.playerNames?.[Object.keys(playerSessions[0]?.data()?.playerNames || {})[0]] || playerId
  };
}

/**
 * Cloud Function zum Korrigieren aller Strichdifferenzen in Partner/Gegner-Aggregaten
 * 
 * Aufruf: https://europe-west1-jassguru.cloudfunctions.net/fixAggregateStricheDifferences
 */
export const fixAggregateStricheDifferences = functions
  .region('europe-west1')
  .runWith({ 
    timeoutSeconds: 540, // 9 Minuten
    memory: '1GB' 
  })
  .https.onRequest(async (req: Request, res: Response) => {
    console.log('🚀 Starting aggregate striche differences fix...');
    
    const startTime = Date.now();
    let totalPlayersProcessed = 0;
    let totalPartnersUpdated = 0;
    let totalOpponentsUpdated = 0;
    const results: Array<{
      playerId: string;
      playerName?: string;
      partnersUpdated: number;
      opponentsUpdated: number;
    }> = [];

    try {
      // Alle Spieler mit Statistiken laden
      const playerStatsSnap = await admin.firestore().collection(PLAYER_COMPUTED_STATS_COLLECTION).get();
      
      if (playerStatsSnap.empty) {
        console.log('❌ No player statistics found');
        res.status(404).json({ 
          success: false, 
          message: 'No player statistics found' 
        });
        return;
      }

      console.log(`📈 Found ${playerStatsSnap.size} players with statistics`);
      
      // Jeden Spieler verarbeiten
      for (const playerDoc of playerStatsSnap.docs) {
        const playerId = playerDoc.id;
        const result = await fixPlayerAggregates(playerId);
        
        results.push({
          playerId,
          playerName: result.playerName,
          partnersUpdated: result.updatedPartnerCount,
          opponentsUpdated: result.updatedOpponentCount
        });
        
        totalPlayersProcessed++;
        totalPartnersUpdated += result.updatedPartnerCount;
        totalOpponentsUpdated += result.updatedOpponentCount;
      }
      
      const duration = Date.now() - startTime;
      console.log('\n✅ All aggregate striche differences have been fixed!');
      console.log(`⏱️  Total duration: ${(duration / 1000).toFixed(1)}s`);
      console.log(`👥 Players processed: ${totalPlayersProcessed}`);
      console.log(`🤝 Partner aggregates updated: ${totalPartnersUpdated}`);
      console.log(`⚔️  Opponent aggregates updated: ${totalOpponentsUpdated}`);
      
      res.status(200).json({
        success: true,
        message: 'Aggregate striche differences have been fixed successfully!',
        stats: {
          playersProcessed: totalPlayersProcessed,
          partnerAggregatesUpdated: totalPartnersUpdated,
          opponentAggregatesUpdated: totalOpponentsUpdated,
          durationMs: duration
        },
        results: results.filter(r => r.partnersUpdated > 0 || r.opponentsUpdated > 0)
      });
    } catch (error) {
      console.error('❌ Error fixing aggregate striche differences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fix aggregate striche differences',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }); 