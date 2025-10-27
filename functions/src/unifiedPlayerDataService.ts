/**
 * 🎯 UNIFIED PLAYER DATA SERVICE
 * ================================
 * 
 * Konsolidierter Service für alle Spieler-Daten-Updates.
 * Ersetzt die redundanten Services:
 * - playerScoresBackendService.ts ❌
 * - playerStatisticsBackendService.ts ❌
 * - playerStatsCalculator.ts ❌
 * 
 * Neue Architektur:
 * players/{playerId}/
 * ├── (Root Document) ← globalStats, globalRating, displayName
 * ├── groupStats/{groupId}
 * ├── partnerStats/{partnerId}
 * ├── opponentStats/{opponentId}
 * ├── ratingHistory/{docId} ← von jassEloUpdater ✅
 * └── scoresHistory/{docId}
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {
  PlayerRootDocument,
  GlobalPlayerStats,
  GroupPlayerStats,
  PartnerPlayerStats,
  OpponentPlayerStats,
  // ❌ ENTFERNT: ScoresHistoryEntry (wird nur von jassEloUpdater.ts verwendet)
  getDefaultGlobalPlayerStats,
  getDefaultGroupPlayerStats,
} from './models/unified-player-data.model';

const db = admin.firestore();

// =========================================
// MAIN ENTRY POINT
// =========================================

/**
 * Aktualisiert alle Spieler-Daten nach einer Session
 * Wird von finalizeSession aufgerufen
 */
export async function updatePlayerDataAfterSession(
  groupId: string,
  sessionId: string,
  participantPlayerIds: string[],
  tournamentId: string | null = null
): Promise<void> {
  logger.info(`[updatePlayerDataAfterSession] Starte Update für Session ${sessionId} (${participantPlayerIds.length} Spieler)`);
  
  try {
    // Lade Session-Daten
    const sessionDoc = await db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId).get();
    if (!sessionDoc.exists) {
      logger.error(`[updatePlayerDataAfterSession] Session ${sessionId} nicht gefunden`);
      return;
    }
    
    const sessionData = sessionDoc.data()!;
    
    // Lade Gruppen-Daten
    const groupDoc = await db.collection('groups').doc(groupId).get();
    const groupData = groupDoc.exists ? groupDoc.data() : null;
    const groupName = groupData?.name || 'Unbekannte Gruppe';
    
    // Update jeden Spieler
    const updatePromises = participantPlayerIds.map(playerId => 
      updatePlayerData(playerId, groupId, groupName, sessionId, sessionData, tournamentId)
    );
    
    await Promise.all(updatePromises);
    
    logger.info(`[updatePlayerDataAfterSession] ✅ Update abgeschlossen für Session ${sessionId}`);
  } catch (error: any) {
    logger.error(`[updatePlayerDataAfterSession] Fehler bei Session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Aktualisiert alle Spieler-Daten nach einem Turnier
 * Wird von finalizeTournament aufgerufen
 */
export async function updatePlayerDataAfterTournament(
  tournamentId: string,
  participantPlayerIds: string[]
): Promise<void> {
  logger.info(`[updatePlayerDataAfterTournament] Starte Update für Turnier ${tournamentId} (${participantPlayerIds.length} Spieler)`);
  
  try {
    // Lade alle Sessions des Turniers
    const sessionsSnapshot = await db.collectionGroup('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .where('status', '==', 'completed')
      .get();
    
    logger.info(`[updatePlayerDataAfterTournament] Gefundene Sessions: ${sessionsSnapshot.size}`);
    
    // Gruppiere Sessions nach groupId
    const sessionsByGroup = new Map<string, any[]>();
    sessionsSnapshot.docs.forEach(doc => {
      const sessionData = doc.data();
      const groupId = sessionData.groupId || sessionData.gruppeId;
      
      if (groupId) {
        if (!sessionsByGroup.has(groupId)) {
          sessionsByGroup.set(groupId, []);
        }
        sessionsByGroup.get(groupId)!.push({
          id: doc.id,
          ...sessionData,
        });
      }
    });
    
    // Update jeden Spieler für alle seine Turnier-Sessions
    for (const playerId of participantPlayerIds) {
      try {
        // Für jede Gruppe, in der der Spieler im Turnier gespielt hat
        for (const [groupId, sessions] of sessionsByGroup) {
          const playerSessions = sessions.filter(s => 
            s.participantPlayerIds?.includes(playerId)
          );
          
          if (playerSessions.length > 0) {
            // Lade Gruppen-Daten
            const groupDoc = await db.collection('groups').doc(groupId).get();
            const groupName = groupDoc.exists ? groupDoc.data()?.name : 'Unbekannte Gruppe';
            
            // Update für jede Session
            for (const sessionData of playerSessions) {
              await updatePlayerData(
                playerId,
                groupId,
                groupName,
                sessionData.id,
                sessionData,
                tournamentId
              );
            }
          }
        }
      } catch (error: any) {
        logger.error(`[updatePlayerDataAfterTournament] Fehler bei Spieler ${playerId}:`, error);
      }
    }
    
    logger.info(`[updatePlayerDataAfterTournament] ✅ Update abgeschlossen für Turnier ${tournamentId}`);
  } catch (error: any) {
    logger.error(`[updatePlayerDataAfterTournament] Fehler bei Turnier ${tournamentId}:`, error);
    throw error;
  }
}

// =========================================
// CORE UPDATE LOGIC
// =========================================

/**
 * Aktualisiert alle Daten für einen einzelnen Spieler nach einer Session
 */
async function updatePlayerData(
  playerId: string,
  groupId: string,
  groupName: string,
  sessionId: string,
  sessionData: any,
  tournamentId: string | null
): Promise<void> {
  logger.info(`[updatePlayerData] Update für Spieler ${playerId} in Session ${sessionId}`);
  
  try {
    // 1. Lade aktuelles Root Document
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    const playerData = playerDoc.exists ? playerDoc.data() : {};
    
    // 2. Berechne Session-Delta
    const sessionDelta = calculateSessionDelta(playerId, sessionData);
    
    // 3. Update Global Stats
    const currentGlobalStats = playerData?.globalStats || getDefaultGlobalPlayerStats();
    const updatedGlobalStats = updateGlobalStats(currentGlobalStats, sessionDelta, sessionData);
    
    // 4. Update Root Document
    const rootUpdate: Partial<PlayerRootDocument> = {
      globalStats: updatedGlobalStats,
      lastActivity: admin.firestore.Timestamp.now(),
      lastUpdated: admin.firestore.Timestamp.now(),
    };
    
    // Füge groupId hinzu falls nicht vorhanden
    if (playerData?.groupIds && !playerData.groupIds.includes(groupId)) {
      rootUpdate.groupIds = [...playerData.groupIds, groupId];
    } else if (!playerData?.groupIds) {
      rootUpdate.groupIds = [groupId];
    }
    
    await playerRef.set(rootUpdate, { merge: true });
    logger.info(`[updatePlayerData] ✅ Root Document aktualisiert für ${playerId}`);
    
    // 5. Update Group Stats
    await updateGroupStatsSubcollection(playerId, groupId, groupName, sessionDelta, sessionData);
    
    // 6. Update Partner Stats
    await updatePartnerStatsSubcollection(playerId, sessionData, sessionDelta);
    
    // 7. Update Opponent Stats
    await updateOpponentStatsSubcollection(playerId, sessionData, sessionDelta);
    
    // ❌ ENTFERNT: Session-Level ScoresHistory wird NICHT mehr erstellt!
    // Pro-Spiel-Entries werden von jassEloUpdater.ts erstellt
    
    logger.info(`[updatePlayerData] ✅ Alle Updates abgeschlossen für Spieler ${playerId}`);
  } catch (error: any) {
    logger.error(`[updatePlayerData] Fehler bei Spieler ${playerId}:`, error);
    throw error;
  }
}

// =========================================
// DELTA CALCULATION
// =========================================

interface SessionDelta {
  // SESSIONS
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  sessionsDraw: number;
  
  // GAMES
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  
  // SCORES
  pointsMade: number;
  pointsReceived: number;
  pointsDifference: number;
  
  stricheMade: number;
  stricheReceived: number;
  stricheDifference: number;
  
  // WEIS
  weisPoints: number;
  weisReceived: number;
  weisDifference: number;
  
  // EVENTS
  matschEventsMade: number;
  matschEventsReceived: number;
  matschBilanz: number;
  
  schneiderEventsMade: number;
  schneiderEventsReceived: number;
  schneiderBilanz: number;
  
  kontermatschEventsMade: number;
  kontermatschEventsReceived: number;
  kontermatschBilanz: number;
  
  // TRUMPF
  trumpfStatistik: { [farbe: string]: number };
  
  // ZEIT
  playTimeSeconds: number;
  
  // PARTNER/OPPONENT IDs für weitere Updates
  partnerIds: string[];
  partnerNames: { [id: string]: string };
  opponentIds: string[];
  opponentNames: { [id: string]: string };
  
  // Player Team
  playerTeam: 'top' | 'bottom' | null;
}

/**
 * Berechnet das Delta (Änderung) durch eine Session
 */
function calculateSessionDelta(playerId: string, sessionData: any): SessionDelta {
  const delta: SessionDelta = {
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
    pointsMade: 0,
    pointsReceived: 0,
    pointsDifference: 0,
    stricheMade: 0,
    stricheReceived: 0,
    stricheDifference: 0,
    weisPoints: 0,
    weisReceived: 0,
    weisDifference: 0,
    matschEventsMade: 0,
    matschEventsReceived: 0,
    matschBilanz: 0,
    schneiderEventsMade: 0,
    schneiderEventsReceived: 0,
    schneiderBilanz: 0,
    kontermatschEventsMade: 0,
    kontermatschEventsReceived: 0,
    kontermatschBilanz: 0,
    trumpfStatistik: {},
    playTimeSeconds: 0,
    partnerIds: [],
    partnerNames: {},
    opponentIds: [],
    opponentNames: {},
    playerTeam: null,
  };
  
  // Bestimme Team des Spielers
  let playerTeam: 'top' | 'bottom' | null = null;
  if (sessionData.teams?.top?.players?.some((p: any) => p.playerId === playerId)) {
    playerTeam = 'top';
  } else if (sessionData.teams?.bottom?.players?.some((p: any) => p.playerId === playerId)) {
    playerTeam = 'bottom';
  }
  
  if (!playerTeam) {
    logger.warn(`[calculateSessionDelta] Spieler ${playerId} nicht in Teams gefunden`);
    return delta;
  }
  
  delta.playerTeam = playerTeam;
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // SESSIONS
  delta.sessionsPlayed = 1;
  if (sessionData.winnerTeamKey === playerTeam) {
    delta.sessionsWon = 1;
  } else if (sessionData.winnerTeamKey === 'draw' || sessionData.winnerTeamKey === 'tie') {
    delta.sessionsDraw = 1;
  } else {
    delta.sessionsLost = 1;
  }
  
  // GAMES
  delta.gamesPlayed = sessionData.gamesPlayed || 0;
  const playerGameWins = sessionData.gameWinsByPlayer?.[playerId];
  if (playerGameWins) {
    delta.gamesWon = playerGameWins.wins || 0;
    delta.gamesLost = playerGameWins.losses || 0;
    delta.gamesDraw = playerGameWins.ties || 0;
  }
  
  // SCORES
  if (sessionData.finalScores) {
    delta.pointsMade = sessionData.finalScores[playerTeam] || 0;
    delta.pointsReceived = sessionData.finalScores[opponentTeam] || 0;
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  }
  
  if (sessionData.finalStriche) {
    const playerStriche = sessionData.finalStriche[playerTeam];
    const opponentStriche = sessionData.finalStriche[opponentTeam];
    
    delta.stricheMade = sumStriche(playerStriche);
    delta.stricheReceived = sumStriche(opponentStriche);
    delta.stricheDifference = delta.stricheMade - delta.stricheReceived;
  }
  
  // WEIS
  if (sessionData.sessionTotalWeisPoints) {
    delta.weisPoints = sessionData.sessionTotalWeisPoints[playerTeam] || 0;
    delta.weisReceived = sessionData.sessionTotalWeisPoints[opponentTeam] || 0;
    delta.weisDifference = delta.weisPoints - delta.weisReceived;
  }
  
  // EVENTS
  if (sessionData.eventCounts) {
    const playerEvents = sessionData.eventCounts[playerTeam] || {};
    const opponentEvents = sessionData.eventCounts[opponentTeam] || {};
    
    delta.matschEventsMade = playerEvents.matsch || 0;
    delta.matschEventsReceived = opponentEvents.matsch || 0;
    delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
    
    delta.schneiderEventsMade = playerEvents.schneider || 0;
    delta.schneiderEventsReceived = opponentEvents.schneider || 0;
    delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
    
    delta.kontermatschEventsMade = playerEvents.kontermatsch || 0;
    delta.kontermatschEventsReceived = opponentEvents.kontermatsch || 0;
    delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
  }
  
  // TRUMPF
  if (sessionData.aggregatedTrumpfCountsByPlayer?.[playerId]) {
    delta.trumpfStatistik = sessionData.aggregatedTrumpfCountsByPlayer[playerId];
  }
  
  // ZEIT
  delta.playTimeSeconds = sessionData.durationSeconds || 0;
  
  // PARTNER/OPPONENT
  const teamPlayers = sessionData.teams[playerTeam]?.players || [];
  const opponentPlayers = sessionData.teams[opponentTeam]?.players || [];
  
  teamPlayers.forEach((p: any) => {
    if (p.playerId !== playerId) {
      delta.partnerIds.push(p.playerId);
      delta.partnerNames[p.playerId] = p.displayName || 'Unbekannt';
    }
  });
  
  opponentPlayers.forEach((p: any) => {
    delta.opponentIds.push(p.playerId);
    delta.opponentNames[p.playerId] = p.displayName || 'Unbekannt';
  });
  
  return delta;
}

/**
 * Summiert alle Striche (berg, sieg, matsch, schneider, kontermatsch)
 */
function sumStriche(stricheRecord: any): number {
  if (!stricheRecord) return 0;
  return (
    (stricheRecord.berg || 0) +
    (stricheRecord.sieg || 0) +
    (stricheRecord.matsch || 0) +
    (stricheRecord.schneider || 0) +
    (stricheRecord.kontermatsch || 0)
  );
}

// =========================================
// UPDATE FUNCTIONS
// =========================================

/**
 * Aktualisiert Global Stats mit Session-Delta
 */
function updateGlobalStats(
  current: GlobalPlayerStats,
  delta: SessionDelta,
  sessionData: any
): GlobalPlayerStats {
  const updated: GlobalPlayerStats = {
    ...current,
    
    // SESSIONS
    totalSessions: current.totalSessions + delta.sessionsPlayed,
    sessionsWon: current.sessionsWon + delta.sessionsWon,
    sessionsLost: current.sessionsLost + delta.sessionsLost,
    sessionsDraw: current.sessionsDraw + delta.sessionsDraw,
    
    // GAMES
    totalGames: current.totalGames + delta.gamesPlayed,
    gamesWon: current.gamesWon + delta.gamesWon,
    gamesLost: current.gamesLost + delta.gamesLost,
    gamesDraw: current.gamesDraw + delta.gamesDraw,
    
    // SCORES
    totalPointsMade: current.totalPointsMade + delta.pointsMade,
    totalPointsReceived: current.totalPointsReceived + delta.pointsReceived,
    pointsDifference: current.pointsDifference + delta.pointsDifference,
    
    totalStricheMade: current.totalStricheMade + delta.stricheMade,
    totalStricheReceived: current.totalStricheReceived + delta.stricheReceived,
    stricheDifference: current.stricheDifference + delta.stricheDifference,
    
    // WEIS
    totalWeisPoints: current.totalWeisPoints + delta.weisPoints,
    totalWeisReceived: current.totalWeisReceived + delta.weisReceived,
    weisDifference: current.weisDifference + delta.weisDifference,
    
    // EVENTS
    matschEventsMade: current.matschEventsMade + delta.matschEventsMade,
    matschEventsReceived: current.matschEventsReceived + delta.matschEventsReceived,
    matschBilanz: current.matschBilanz + delta.matschBilanz,
    
    schneiderEventsMade: current.schneiderEventsMade + delta.schneiderEventsMade,
    schneiderEventsReceived: current.schneiderEventsReceived + delta.schneiderEventsReceived,
    schneiderBilanz: current.schneiderBilanz + delta.schneiderBilanz,
    
    kontermatschEventsMade: current.kontermatschEventsMade + delta.kontermatschEventsMade,
    kontermatschEventsReceived: current.kontermatschEventsReceived + delta.kontermatschEventsReceived,
    kontermatschBilanz: current.kontermatschBilanz + delta.kontermatschBilanz,
    
    // TRUMPF
    trumpfStatistik: mergeTrumpfStats(current.trumpfStatistik, delta.trumpfStatistik),
    totalTrumpfCount: current.totalTrumpfCount + Object.values(delta.trumpfStatistik).reduce((sum, count) => sum + count, 0),
    
    // ZEIT
    totalPlayTimeSeconds: current.totalPlayTimeSeconds + delta.playTimeSeconds,
    
    // ZEITSTEMPEL
    lastJassTimestamp: sessionData.endedAt || sessionData.completedAt || admin.firestore.Timestamp.now(),
  };
  
  // Berechne Durchschnittswerte
  if (updated.totalGames > 0) {
    updated.avgPointsPerGame = updated.pointsDifference / updated.totalGames;
    updated.avgStrichePerGame = updated.stricheDifference / updated.totalGames;
    updated.avgWeisPerGame = updated.weisDifference / updated.totalGames;
  }
  
  // Berechne Win Rates
  const decidedSessions = updated.sessionsWon + updated.sessionsLost;
  updated.sessionWinRate = decidedSessions > 0 ? updated.sessionsWon / decidedSessions : 0;
  updated.gameWinRate = updated.totalGames > 0 ? updated.gamesWon / updated.totalGames : 0;
  
  // First Jass Timestamp (nur beim ersten Mal setzen)
  if (!current.firstJassTimestamp) {
    updated.firstJassTimestamp = sessionData.startedAt || admin.firestore.Timestamp.now();
  } else {
    updated.firstJassTimestamp = current.firstJassTimestamp;
  }
  
  return updated;
}

/**
 * Merged Trumpf-Statistiken
 */
function mergeTrumpfStats(
  current: { [farbe: string]: number },
  delta: { [farbe: string]: number }
): { [farbe: string]: number } {
  const merged = { ...current };
  
  Object.entries(delta).forEach(([farbe, count]) => {
    merged[farbe] = (merged[farbe] || 0) + count;
  });
  
  return merged;
}

/**
 * Aktualisiert Group Stats Subcollection
 */
async function updateGroupStatsSubcollection(
  playerId: string,
  groupId: string,
  groupName: string,
  delta: SessionDelta,
  sessionData: any
): Promise<void> {
  const groupStatsRef = db.collection(`players/${playerId}/groupStats`).doc(groupId);
  const groupStatsDoc = await groupStatsRef.get();
  
  const current: GroupPlayerStats = groupStatsDoc.exists 
    ? groupStatsDoc.data() as GroupPlayerStats
    : getDefaultGroupPlayerStats(groupId, groupName);
  
  const updated: GroupPlayerStats = {
    ...current,
    groupName, // Update name in case it changed
    
    sessionsPlayed: current.sessionsPlayed + delta.sessionsPlayed,
    sessionsWon: current.sessionsWon + delta.sessionsWon,
    sessionsLost: current.sessionsLost + delta.sessionsLost,
    sessionsDraw: current.sessionsDraw + delta.sessionsDraw,
    
    gamesPlayed: current.gamesPlayed + delta.gamesPlayed,
    gamesWon: current.gamesWon + delta.gamesWon,
    gamesLost: current.gamesLost + delta.gamesLost,
    
    pointsDifference: current.pointsDifference + delta.pointsDifference,
    stricheDifference: current.stricheDifference + delta.stricheDifference,
    
    matschBilanz: current.matschBilanz + delta.matschBilanz,
    schneiderBilanz: current.schneiderBilanz + delta.schneiderBilanz,
    kontermatschBilanz: current.kontermatschBilanz + delta.kontermatschBilanz,
    
    weisDifference: current.weisDifference + delta.weisDifference,
    
    lastPlayedInGroup: sessionData.endedAt || admin.firestore.Timestamp.now(),
  };
  
  // Berechne Durchschnittswerte
  if (updated.gamesPlayed > 0) {
    updated.avgPointsPerGame = updated.pointsDifference / updated.gamesPlayed;
    updated.avgStrichePerGame = updated.stricheDifference / updated.gamesPlayed;
    updated.avgWeisPerGame = updated.weisDifference / updated.gamesPlayed;
  }
  
  // Berechne Win Rates
  const decidedSessions = updated.sessionsWon + updated.sessionsLost;
  updated.sessionWinRate = decidedSessions > 0 ? updated.sessionsWon / decidedSessions : 0;
  updated.gameWinRate = updated.gamesPlayed > 0 ? updated.gamesWon / updated.gamesPlayed : 0;
  
  await groupStatsRef.set(updated);
  logger.info(`[updateGroupStatsSubcollection] ✅ Group Stats aktualisiert: ${groupId}`);
}

/**
 * Aktualisiert Partner Stats Subcollection
 */
async function updatePartnerStatsSubcollection(
  playerId: string,
  sessionData: any,
  delta: SessionDelta
): Promise<void> {
  for (const partnerId of delta.partnerIds) {
    const partnerStatsRef = db.collection(`players/${playerId}/partnerStats`).doc(partnerId);
    const partnerStatsDoc = await partnerStatsRef.get();
    
    const current: PartnerPlayerStats = partnerStatsDoc.exists
      ? partnerStatsDoc.data() as PartnerPlayerStats
      : {
          partnerId,
          partnerDisplayName: delta.partnerNames[partnerId] || 'Unbekannt',
          sessionsPlayedWith: 0,
          sessionsWonWith: 0,
          sessionsLostWith: 0,
          sessionsDrawWith: 0,
          sessionWinRateWith: 0,
          gamesPlayedWith: 0,
          gamesWonWith: 0,
          gamesLostWith: 0,
          gameWinRateWith: 0,
          totalStricheDifferenceWith: 0,
          totalPointsDifferenceWith: 0,
          matschBilanzWith: 0,
          matschEventsMadeWith: 0,
          matschEventsReceivedWith: 0,
          schneiderBilanzWith: 0,
          schneiderEventsMadeWith: 0,
          schneiderEventsReceivedWith: 0,
          kontermatschBilanzWith: 0,
          kontermatschEventsMadeWith: 0,
          kontermatschEventsReceivedWith: 0,
      totalWeisPointsWith: 0,
      totalWeisReceivedWith: 0,
      weisDifferenceWith: 0,
      totalRoundDurationWith: 0,
      totalRoundsWith: 0,
      avgRoundDurationWith: 0,
      trumpfStatistikWith: {},
      lastPlayedWithTimestamp: admin.firestore.Timestamp.now(),
    };
    
    const updated: PartnerPlayerStats = {
      ...current,
      partnerDisplayName: delta.partnerNames[partnerId] || current.partnerDisplayName, // Update name
      
      sessionsPlayedWith: current.sessionsPlayedWith + delta.sessionsPlayed,
      sessionsWonWith: current.sessionsWonWith + delta.sessionsWon,
      sessionsLostWith: current.sessionsLostWith + delta.sessionsLost,
      sessionsDrawWith: current.sessionsDrawWith + delta.sessionsDraw,
      
      gamesPlayedWith: current.gamesPlayedWith + delta.gamesPlayed,
      gamesWonWith: current.gamesWonWith + delta.gamesWon,
      gamesLostWith: current.gamesLostWith + delta.gamesLost,
      
      totalStricheDifferenceWith: current.totalStricheDifferenceWith + delta.stricheDifference,
      totalPointsDifferenceWith: current.totalPointsDifferenceWith + delta.pointsDifference,
      
      matschBilanzWith: current.matschBilanzWith + delta.matschBilanz,
      matschEventsMadeWith: current.matschEventsMadeWith + delta.matschEventsMade,
      matschEventsReceivedWith: current.matschEventsReceivedWith + delta.matschEventsReceived,
      
      schneiderBilanzWith: current.schneiderBilanzWith + delta.schneiderBilanz,
      schneiderEventsMadeWith: current.schneiderEventsMadeWith + delta.schneiderEventsMade,
      schneiderEventsReceivedWith: current.schneiderEventsReceivedWith + delta.schneiderEventsReceived,
      
      kontermatschBilanzWith: current.kontermatschBilanzWith + delta.kontermatschBilanz,
      kontermatschEventsMadeWith: current.kontermatschEventsMadeWith + delta.kontermatschEventsMade,
      kontermatschEventsReceivedWith: current.kontermatschEventsReceivedWith + delta.kontermatschEventsReceived,
      
      totalWeisPointsWith: current.totalWeisPointsWith + delta.weisPoints,
      totalWeisReceivedWith: current.totalWeisReceivedWith + delta.weisReceived,
      weisDifferenceWith: current.weisDifferenceWith + delta.weisDifference,
      
      lastPlayedWithTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
    };
    
    // ✅ NEU: Rundentempo & Trumpfansagen für Partner
    // ✅ KORREKTUR: Summiere Runden von BEIDEN Partnern (gemeinsames Team)
    const playerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[playerId];
    const partnerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[partnerId];
    
    if ((playerRounds && playerRounds.roundCount > 0) || (partnerRounds && partnerRounds.roundCount > 0)) {
      // Summiere Dauer und Rundenanzahl von beiden Spielern
      const playerDuration = playerRounds?.totalDuration || 0;
      const partnerDuration = partnerRounds?.totalDuration || 0;
      const playerCount = playerRounds?.roundCount || 0;
      const partnerCount = partnerRounds?.roundCount || 0;
      
      updated.totalRoundDurationWith = (current.totalRoundDurationWith || 0) + playerDuration + partnerDuration;
      updated.totalRoundsWith = (current.totalRoundsWith || 0) + playerCount + partnerCount;
    }
    
    // Trumpfansagen: Summiere beide Partner
    const playerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
    const partnerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[partnerId] || {};
    
    if (Object.keys(playerTrumpfs).length > 0 || Object.keys(partnerTrumpfs).length > 0) {
      const combinedTrumpfs = { ...(current.trumpfStatistikWith || {}) };
      
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        combinedTrumpfs[farbe] = (combinedTrumpfs[farbe] || 0) + (count as number);
      });
      
      Object.entries(partnerTrumpfs).forEach(([farbe, count]) => {
        combinedTrumpfs[farbe] = (combinedTrumpfs[farbe] || 0) + (count as number);
      });
      
      updated.trumpfStatistikWith = combinedTrumpfs;
    }
    
    // Berechne Win Rates & avgRoundDuration
    const decidedSessions = updated.sessionsWonWith + updated.sessionsLostWith;
    updated.sessionWinRateWith = decidedSessions > 0 ? updated.sessionsWonWith / decidedSessions : 0;
    updated.gameWinRateWith = updated.gamesPlayedWith > 0 ? updated.gamesWonWith / updated.gamesPlayedWith : 0;
    if (updated.totalRoundsWith !== undefined && updated.totalRoundsWith > 0 && updated.totalRoundDurationWith !== undefined) {
      updated.avgRoundDurationWith = updated.totalRoundDurationWith / updated.totalRoundsWith;
    }
    
    await partnerStatsRef.set(updated);
  }
  
  logger.info(`[updatePartnerStatsSubcollection] ✅ Partner Stats aktualisiert (${delta.partnerIds.length} Partner)`);
}

/**
 * Aktualisiert Opponent Stats Subcollection
 */
async function updateOpponentStatsSubcollection(
  playerId: string,
  sessionData: any,
  delta: SessionDelta
): Promise<void> {
  for (const opponentId of delta.opponentIds) {
    const opponentStatsRef = db.collection(`players/${playerId}/opponentStats`).doc(opponentId);
    const opponentStatsDoc = await opponentStatsRef.get();
    
    const current: OpponentPlayerStats = opponentStatsDoc.exists
      ? opponentStatsDoc.data() as OpponentPlayerStats
      : {
          opponentId,
          opponentDisplayName: delta.opponentNames[opponentId] || 'Unbekannt',
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          sessionsLostAgainst: 0,
          sessionsDrawAgainst: 0,
          sessionWinRateAgainst: 0,
          gamesPlayedAgainst: 0,
          gamesWonAgainst: 0,
          gamesLostAgainst: 0,
          gameWinRateAgainst: 0,
          totalStricheDifferenceAgainst: 0,
          totalPointsDifferenceAgainst: 0,
          matschBilanzAgainst: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          schneiderBilanzAgainst: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
          kontermatschBilanzAgainst: 0,
          kontermatschEventsMadeAgainst: 0,
          kontermatschEventsReceivedAgainst: 0,
          totalWeisPointsAgainst: 0,
          totalWeisReceivedAgainst: 0,
          weisDifferenceAgainst: 0,
          totalRoundDurationAgainst: 0,
          totalRoundsAgainst: 0,
          avgRoundDurationAgainst: 0,
          trumpfStatistikAgainst: {},
          lastPlayedAgainstTimestamp: admin.firestore.Timestamp.now(),
        };
    
    const updated: OpponentPlayerStats = {
      ...current,
      opponentDisplayName: delta.opponentNames[opponentId] || current.opponentDisplayName, // Update name
      
      sessionsPlayedAgainst: current.sessionsPlayedAgainst + delta.sessionsPlayed,
      sessionsWonAgainst: current.sessionsWonAgainst + delta.sessionsWon,
      sessionsLostAgainst: current.sessionsLostAgainst + delta.sessionsLost,
      sessionsDrawAgainst: current.sessionsDrawAgainst + delta.sessionsDraw,
      
      gamesPlayedAgainst: current.gamesPlayedAgainst + delta.gamesPlayed,
      gamesWonAgainst: current.gamesWonAgainst + delta.gamesWon,
      gamesLostAgainst: current.gamesLostAgainst + delta.gamesLost,
      
      totalStricheDifferenceAgainst: current.totalStricheDifferenceAgainst + delta.stricheDifference,
      totalPointsDifferenceAgainst: current.totalPointsDifferenceAgainst + delta.pointsDifference,
      
      matschBilanzAgainst: current.matschBilanzAgainst + delta.matschBilanz,
      matschEventsMadeAgainst: current.matschEventsMadeAgainst + delta.matschEventsMade,
      matschEventsReceivedAgainst: current.matschEventsReceivedAgainst + delta.matschEventsReceived,
      
      schneiderBilanzAgainst: current.schneiderBilanzAgainst + delta.schneiderBilanz,
      schneiderEventsMadeAgainst: current.schneiderEventsMadeAgainst + delta.schneiderEventsMade,
      schneiderEventsReceivedAgainst: current.schneiderEventsReceivedAgainst + delta.schneiderEventsReceived,
      
      kontermatschBilanzAgainst: current.kontermatschBilanzAgainst + delta.kontermatschBilanz,
      kontermatschEventsMadeAgainst: current.kontermatschEventsMadeAgainst + delta.kontermatschEventsMade,
      kontermatschEventsReceivedAgainst: current.kontermatschEventsReceivedAgainst + delta.kontermatschEventsReceived,
      
      totalWeisPointsAgainst: current.totalWeisPointsAgainst + delta.weisPoints,
      totalWeisReceivedAgainst: current.totalWeisReceivedAgainst + delta.weisReceived,
      weisDifferenceAgainst: current.weisDifferenceAgainst + delta.weisDifference,
      
      lastPlayedAgainstTimestamp: sessionData.endedAt || admin.firestore.Timestamp.now(),
    };
    
    // ✅ NEU: Rundentempo & Trumpfansagen für Gegner
    // ✅ KORREKTUR: Summiere Runden von BEIDEN Gegnern (gemeinsames Spiel)
    const playerRounds = sessionData.aggregatedRoundDurationsByPlayer?.[playerId];
    const opponentRounds = sessionData.aggregatedRoundDurationsByPlayer?.[opponentId];
    
    if ((playerRounds && playerRounds.roundCount > 0) || (opponentRounds && opponentRounds.roundCount > 0)) {
      // Summiere Dauer und Rundenanzahl von beiden Spielern
      const playerDuration = playerRounds?.totalDuration || 0;
      const opponentDuration = opponentRounds?.totalDuration || 0;
      const playerCount = playerRounds?.roundCount || 0;
      const opponentCount = opponentRounds?.roundCount || 0;
      
      updated.totalRoundDurationAgainst = (current.totalRoundDurationAgainst || 0) + playerDuration + opponentDuration;
      updated.totalRoundsAgainst = (current.totalRoundsAgainst || 0) + playerCount + opponentCount;
    }
    
    // Trumpfansagen gegen Gegner: Nutze eigene Trumpfe
    const playerTrumpfs = sessionData.aggregatedTrumpfCountsByPlayer?.[playerId] || {};
    if (Object.keys(playerTrumpfs).length > 0) {
      const existingTrumpfs = { ...(current.trumpfStatistikAgainst || {}) };
      Object.entries(playerTrumpfs).forEach(([farbe, count]) => {
        existingTrumpfs[farbe] = (existingTrumpfs[farbe] || 0) + (count as number);
      });
      updated.trumpfStatistikAgainst = existingTrumpfs;
    }
    
    // Berechne Win Rates & avgRoundDuration
    const decidedSessions = updated.sessionsWonAgainst + updated.sessionsLostAgainst;
    updated.sessionWinRateAgainst = decidedSessions > 0 ? updated.sessionsWonAgainst / decidedSessions : 0;
    updated.gameWinRateAgainst = updated.gamesPlayedAgainst > 0 ? updated.gamesWonAgainst / updated.gamesPlayedAgainst : 0;
    if (updated.totalRoundsAgainst !== undefined && updated.totalRoundsAgainst > 0 && updated.totalRoundDurationAgainst !== undefined) {
      updated.avgRoundDurationAgainst = updated.totalRoundDurationAgainst / updated.totalRoundsAgainst;
    }
    
    await opponentStatsRef.set(updated);
  }
  
  logger.info(`[updateOpponentStatsSubcollection] ✅ Opponent Stats aktualisiert (${delta.opponentIds.length} Gegner)`);
}

// ❌ ENTFERNT: createScoresHistoryEntry()
// Session-Level ScoresHistory wird NICHT mehr erstellt!
// Pro-Spiel-Entries werden direkt von jassEloUpdater.ts erstellt.

