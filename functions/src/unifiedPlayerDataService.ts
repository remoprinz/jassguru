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
  GlobalPlayerStats,
  // ❌ ENTFERNT: GroupPlayerStats (wird nicht mehr verwendet)
  PartnerPlayerStats,
  OpponentPlayerStats,
  ScoresHistoryEntry,
  getDefaultGlobalPlayerStats,
  // ❌ ENTFERNT: getDefaultGroupPlayerStats (wird nicht mehr verwendet)
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
    // ✅ FIX: Frontend liest aus globalStats.current, daher müssen wir hier auch lesen/schreiben
    const currentGlobalStats = playerData?.globalStats?.current || playerData?.globalStats || getDefaultGlobalPlayerStats();
    const updatedGlobalStats = updateGlobalStats(currentGlobalStats, sessionDelta, sessionData, tournamentId);
    
    // 4. Update Root Document
    // ✅ FIX: Schreibe in globalStats.current (wie Frontend es erwartet)
    const rootUpdate: any = {
      globalStats: {
        current: updatedGlobalStats
      },
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
    
    // ❌ ENTFERNT: Update Group Stats Subcollection (wird nicht verwendet im Frontend)
    // await updateGroupStatsSubcollection(playerId, groupId, groupName, sessionDelta, sessionData);
    
    // 6. Update Partner Stats
    await updatePartnerStatsSubcollection(playerId, sessionData, sessionDelta);
    
    // 7. Update Opponent Stats
    await updateOpponentStatsSubcollection(playerId, sessionData, sessionDelta);
    
    // 8. Update Scores History (aggregiert pro Session)
    await updateScoresHistorySubcollection(playerId, groupId, sessionId, sessionData, sessionDelta, tournamentId);
    
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
  // 🔧 FIX (16.01.2026): Für Turniere suche in gameResults, da teams auf Root fehlen kann
  let playerTeam: 'top' | 'bottom' | null = null;
  
  // Erst in Root-Level teams suchen (normale Sessions)
  if (sessionData.teams?.top?.players?.some((p: any) => p.playerId === playerId)) {
    playerTeam = 'top';
  } else if (sessionData.teams?.bottom?.players?.some((p: any) => p.playerId === playerId)) {
    playerTeam = 'bottom';
  }
  
  // Falls nicht gefunden und Turnier, suche in gameResults
  if (!playerTeam && sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
    for (const game of sessionData.gameResults) {
      if (game.teams?.top?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'top';
        break;
      } else if (game.teams?.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'bottom';
        break;
      }
    }
  }
  
  // Falls nicht gefunden und gameWinsByPlayer existiert, nehme "teilgenommen" an
  // (für Turniere mit wechselnden Teams)
  if (!playerTeam && sessionData.gameWinsByPlayer?.[playerId]) {
    // Spieler hat teilgenommen, aber Team kann nicht eindeutig bestimmt werden
    // Bei Turnieren mit wechselnden Teams ist das OK
    playerTeam = 'top'; // Default, wird für Per-Spieler-Stats eh überschrieben
    logger.info(`[calculateSessionDelta] Spieler ${playerId} in Turnier gefunden (wechselnde Teams)`);
  }
  
  if (!playerTeam) {
    logger.warn(`[calculateSessionDelta] Spieler ${playerId} nicht in Teams gefunden`);
    return delta;
  }
  
  delta.playerTeam = playerTeam;
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // ✅ KORRIGIERT: Prüfe ob Turnier VOR Session-Zählung
  const isTournament = sessionData.isTournamentSession || sessionData.tournamentId;
  
  // SESSIONS
  // ✅ WICHTIG: NUR normale Sessions zählen als "Partien", Turniere separat!
  if (!isTournament) {
  delta.sessionsPlayed = 1;
  if (sessionData.winnerTeamKey === playerTeam) {
    delta.sessionsWon = 1;
  } else if (sessionData.winnerTeamKey === 'draw' || sessionData.winnerTeamKey === 'tie') {
    delta.sessionsDraw = 1;
  } else {
    delta.sessionsLost = 1;
    }
  } else {
    // Turniere zählen NICHT als Sessions
    delta.sessionsPlayed = 0;
    delta.sessionsWon = 0;
    delta.sessionsLost = 0;
    delta.sessionsDraw = 0;
  }
  
  // GAMES
  // ✅ KORRIGIERT: Für Turniere durch gameResults iterieren und zählen
  
  if (isTournament && sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
    // Zähle, in wie vielen Spielen der Spieler tatsächlich war
    let playerGamesCount = 0;
    let playerWins = 0;
    let playerLosses = 0;
    let playerDraws = 0;
    
    sessionData.gameResults.forEach((game: any) => {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      
      const playerInTop = topPlayers.some((p: any) => p.playerId === playerId);
      const playerInBottom = bottomPlayers.some((p: any) => p.playerId === playerId);
      
      if (playerInTop || playerInBottom) {
        playerGamesCount++;
        
        // Bestimme Gewinner
        const playerWon = (playerInTop && game.winnerTeam === 'top') || 
                          (playerInBottom && game.winnerTeam === 'bottom');
        const playerLost = (playerInTop && game.winnerTeam === 'bottom') || 
                           (playerInBottom && game.winnerTeam === 'top');
        
        if (playerWon) playerWins++;
        else if (playerLost) playerLosses++;
        else playerDraws++;
      }
    });
    
    delta.gamesPlayed = playerGamesCount;
    delta.gamesWon = playerWins;
    delta.gamesLost = playerLosses;
    delta.gamesDraw = playerDraws;
  } else {
    // Normale Session
  delta.gamesPlayed = sessionData.gamesPlayed || 0;
  const playerGameWins = sessionData.gameWinsByPlayer?.[playerId];
  if (playerGameWins) {
    delta.gamesWon = playerGameWins.wins || 0;
    delta.gamesLost = playerGameWins.losses || 0;
    delta.gamesDraw = playerGameWins.ties || 0;
    }
  }
  
  // SCORES
  // 🔧 FIX (16.01.2026): Für Turniere verwende totalPointsByPlayer/totalStricheByPlayer
  if (isTournament && sessionData.totalPointsByPlayer) {
    // Tournament: Punkte aus totalPointsByPlayer
    delta.pointsMade = sessionData.totalPointsByPlayer[playerId] || 0;
    
    // Berechne Gegner-Punkte aus gameResults
    let opponentPointsTotal = 0;
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
      sessionData.gameResults.forEach((game: any) => {
        const playerInTop = game.teams?.top?.players?.some((p: any) => p.playerId === playerId);
        const playerInBottom = game.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
        
        if (playerInTop) {
          opponentPointsTotal += game.bottomScore || 0;
        } else if (playerInBottom) {
          opponentPointsTotal += game.topScore || 0;
        }
      });
    }
    delta.pointsReceived = opponentPointsTotal;
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  } else if (sessionData.finalScores) {
    delta.pointsMade = sessionData.finalScores[playerTeam] || 0;
    delta.pointsReceived = sessionData.finalScores[opponentTeam] || 0;
    delta.pointsDifference = delta.pointsMade - delta.pointsReceived;
  }
  
  // 🔧 FIX (16.01.2026): Für Turniere verwende totalStricheByPlayer
  if (isTournament && sessionData.totalStricheByPlayer?.[playerId]) {
    // Tournament: Striche aus totalStricheByPlayer
    const playerStriche = sessionData.totalStricheByPlayer[playerId];
    delta.stricheMade = sumStriche(playerStriche);
    
    // Berechne Gegner-Striche aus gameResults
    let opponentStricheTotal = 0;
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
      sessionData.gameResults.forEach((game: any) => {
        const playerInTop = game.teams?.top?.players?.some((p: any) => p.playerId === playerId);
        const playerInBottom = game.teams?.bottom?.players?.some((p: any) => p.playerId === playerId);
        
        if (playerInTop && game.finalStriche?.bottom) {
          opponentStricheTotal += sumStriche(game.finalStriche.bottom);
        } else if (playerInBottom && game.finalStriche?.top) {
          opponentStricheTotal += sumStriche(game.finalStriche.top);
        }
      });
    }
    delta.stricheReceived = opponentStricheTotal;
    delta.stricheDifference = delta.stricheMade - delta.stricheReceived;
  } else if (sessionData.finalStriche) {
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
  // 🔧 FIX (16.01.2026): Für Turniere verwende totalEventCountsByPlayer
  if (isTournament && sessionData.totalEventCountsByPlayer?.[playerId]) {
    // Tournament: Events aus totalEventCountsByPlayer
    const playerEvents = sessionData.totalEventCountsByPlayer[playerId];
    
    delta.matschEventsMade = playerEvents.matschMade || 0;
    delta.matschEventsReceived = playerEvents.matschReceived || 0;
    delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
    
    delta.schneiderEventsMade = playerEvents.schneiderMade || 0;
    delta.schneiderEventsReceived = playerEvents.schneiderReceived || 0;
    delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
    
    delta.kontermatschEventsMade = playerEvents.kontermatschMade || 0;
    delta.kontermatschEventsReceived = playerEvents.kontermatschReceived || 0;
    delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
  } else if (sessionData.eventCounts) {
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
  // 🔧 FIX (16.01.2026): Für Turniere extrahiere aus gameResults (da teams auf Root fehlt)
  let teamPlayers: any[] = [];
  let opponentPlayers: any[] = [];
  
  if (isTournament && (!sessionData.teams || !sessionData.teams[playerTeam]) && sessionData.gameResults) {
    // Sammle alle Partner und Gegner aus allen Games
    const partnerSet = new Map<string, string>();
    const opponentSet = new Map<string, string>();
    
    sessionData.gameResults.forEach((game: any) => {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      
      const playerInTop = topPlayers.some((p: any) => p.playerId === playerId);
      const playerInBottom = bottomPlayers.some((p: any) => p.playerId === playerId);
      
      if (playerInTop) {
        topPlayers.forEach((p: any) => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        bottomPlayers.forEach((p: any) => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      } else if (playerInBottom) {
        bottomPlayers.forEach((p: any) => {
          if (p.playerId !== playerId) partnerSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
        topPlayers.forEach((p: any) => {
          opponentSet.set(p.playerId, p.displayName || 'Unbekannt');
        });
      }
    });
    
    teamPlayers = Array.from(partnerSet.entries()).map(([pid, name]) => ({ playerId: pid, displayName: name }));
    opponentPlayers = Array.from(opponentSet.entries()).map(([pid, name]) => ({ playerId: pid, displayName: name }));
  } else {
    teamPlayers = sessionData.teams?.[playerTeam]?.players || [];
    opponentPlayers = sessionData.teams?.[opponentTeam]?.players || [];
  }
  
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
  sessionData: any,
  tournamentId: string | null
): GlobalPlayerStats {
  // ✅ KORRIGIERT: Prüfe beide Quellen für Turnier-Status
  const isTournament = Boolean(tournamentId) || Boolean(sessionData.isTournamentSession) || Boolean(sessionData.tournamentId);
  // 1. Berechne neue ABSOLUTE Summen (Rohdaten)
  const newTotalPointsMade = current.totalPointsMade + delta.pointsMade;
  const newTotalPointsReceived = current.totalPointsReceived + delta.pointsReceived;
  
  const newTotalStricheMade = current.totalStricheMade + delta.stricheMade;
  const newTotalStricheReceived = current.totalStricheReceived + delta.stricheReceived;
  
  const newTotalWeisPoints = current.totalWeisPoints + delta.weisPoints;
  const newTotalWeisReceived = current.totalWeisReceived + delta.weisReceived;
  
  const newMatschEventsMade = current.matschEventsMade + delta.matschEventsMade;
  const newMatschEventsReceived = current.matschEventsReceived + delta.matschEventsReceived;
  
  const newSchneiderEventsMade = current.schneiderEventsMade + delta.schneiderEventsMade;
  const newSchneiderEventsReceived = current.schneiderEventsReceived + delta.schneiderEventsReceived;
  
  const newKontermatschEventsMade = current.kontermatschEventsMade + delta.kontermatschEventsMade;
  const newKontermatschEventsReceived = current.kontermatschEventsReceived + delta.kontermatschEventsReceived;
  
  const updated: GlobalPlayerStats = {
    ...current,
    
    // SESSIONS
    totalSessions: current.totalSessions + delta.sessionsPlayed,
    sessionsWon: current.sessionsWon + delta.sessionsWon,
    sessionsLost: current.sessionsLost + delta.sessionsLost,
    sessionsDraw: current.sessionsDraw + delta.sessionsDraw,
    
    // TOURNAMENTS
    totalTournaments: current.totalTournaments || 0,
    
    // GAMES
    totalGames: current.totalGames + delta.gamesPlayed,
    gamesWon: current.gamesWon + delta.gamesWon,
    gamesLost: current.gamesLost + delta.gamesLost,
    gamesDraw: current.gamesDraw + delta.gamesDraw,
    
    // SCORES (Neu berechnet & Differenz abgeleitet)
    totalPointsMade: newTotalPointsMade,
    totalPointsReceived: newTotalPointsReceived,
    pointsDifference: newTotalPointsMade - newTotalPointsReceived, // ✅ STATELESS DERIVATION
    
    totalStricheMade: newTotalStricheMade,
    totalStricheReceived: newTotalStricheReceived,
    stricheDifference: newTotalStricheMade - newTotalStricheReceived, // ✅ STATELESS DERIVATION
    
    // WEIS (Neu berechnet & Differenz abgeleitet)
    totalWeisPoints: newTotalWeisPoints,
    totalWeisReceived: newTotalWeisReceived,
    weisDifference: newTotalWeisPoints - newTotalWeisReceived, // ✅ STATELESS DERIVATION
    
    // EVENTS (Neu berechnet & Bilanz abgeleitet)
    matschEventsMade: newMatschEventsMade,
    matschEventsReceived: newMatschEventsReceived,
    matschBilanz: newMatschEventsMade - newMatschEventsReceived, // ✅ STATELESS DERIVATION
    
    schneiderEventsMade: newSchneiderEventsMade,
    schneiderEventsReceived: newSchneiderEventsReceived,
    schneiderBilanz: newSchneiderEventsMade - newSchneiderEventsReceived, // ✅ STATELESS DERIVATION
    
    kontermatschEventsMade: newKontermatschEventsMade,
    kontermatschEventsReceived: newKontermatschEventsReceived,
    kontermatschBilanz: newKontermatschEventsMade - newKontermatschEventsReceived, // ✅ STATELESS DERIVATION
    
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
  
  // ✅ NEU: Inkrementiere totalTournaments wenn es ein Turnier ist
  if (isTournament) {
    updated.totalTournaments = (current.totalTournaments || 0) + 1;
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
 * ❌ ENTFERNT: Update Group Stats Subcollection
 * 
 * Diese Funktion wurde entfernt, da `players/{playerId}/groupStats/{groupId}` 
 * NICHT im Frontend verwendet wird. ProfileView.tsx nutzt nur:
 * - `players/{playerId}/globalStats.current`
 * - `players/{playerId}/partnerStats/{partnerId}`
 * - `players/{playerId}/opponentStats/{opponentId}`
 * 
 * Die Subcollection kann optional gelöscht werden, da sie keine Funktionalität beeinträchtigt.
 */
// async function updateGroupStatsSubcollection(
//   playerId: string,
//   groupId: string,
//   groupName: string,
//   delta: SessionDelta,
//   sessionData: any
// ): Promise<void> {
//   // ... entfernt
// }

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
    
      // 1. Berechne neue ABSOLUTE Summen für Partner (konsistente Differenzen)
      const newTotalStricheDiff = (current.totalStricheDifferenceWith || 0) + delta.stricheDifference; // Striche haben keine Made/Received in PartnerStats, daher Inkrement (ok da keine Rohdaten gespeichert)
      
      // HINWEIS: PartnerStats speichern aktuell KEINE Made/Received Punkte, nur die Differenz.
      // Deshalb müssen wir hier inkrementieren. Aber wir können es robuster machen:
      // Wenn der aktuelle Wert undefined/null ist, starte bei 0.
      const currentPointsDiff = current.totalPointsDifferenceWith || 0;
      const newTotalPointsDiff = currentPointsDiff + delta.pointsDifference;
      
      const currentMatschMade = current.matschEventsMadeWith || 0;
      const currentMatschReceived = current.matschEventsReceivedWith || 0;
      const newMatschMade = currentMatschMade + delta.matschEventsMade;
      const newMatschReceived = currentMatschReceived + delta.matschEventsReceived;
      
      const currentSchneiderMade = current.schneiderEventsMadeWith || 0;
      const currentSchneiderReceived = current.schneiderEventsReceivedWith || 0;
      const newSchneiderMade = currentSchneiderMade + delta.schneiderEventsMade;
      const newSchneiderReceived = currentSchneiderReceived + delta.schneiderEventsReceived;
      
      const currentKontermatschMade = current.kontermatschEventsMadeWith || 0;
      const currentKontermatschReceived = current.kontermatschEventsReceivedWith || 0;
      const newKontermatschMade = currentKontermatschMade + delta.kontermatschEventsMade;
      const newKontermatschReceived = currentKontermatschReceived + delta.kontermatschEventsReceived;
      
      const currentWeisMade = current.totalWeisPointsWith || 0;
      const currentWeisReceived = current.totalWeisReceivedWith || 0;
      const newWeisMade = currentWeisMade + delta.weisPoints;
      const newWeisReceived = currentWeisReceived + delta.weisReceived;
    
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
      
      totalStricheDifferenceWith: newTotalStricheDiff,
      totalPointsDifferenceWith: newTotalPointsDiff,
      
      // EVENTS (Neu berechnet & Bilanz abgeleitet)
      matschEventsMadeWith: newMatschMade,
      matschEventsReceivedWith: newMatschReceived,
      matschBilanzWith: newMatschMade - newMatschReceived, // ✅ STATELESS DERIVATION
      
      schneiderEventsMadeWith: newSchneiderMade,
      schneiderEventsReceivedWith: newSchneiderReceived,
      schneiderBilanzWith: newSchneiderMade - newSchneiderReceived, // ✅ STATELESS DERIVATION
      
      kontermatschEventsMadeWith: newKontermatschMade,
      kontermatschEventsReceivedWith: newKontermatschReceived,
      kontermatschBilanzWith: newKontermatschMade - newKontermatschReceived, // ✅ STATELESS DERIVATION
      
      // WEIS (Neu berechnet & Differenz abgeleitet)
      totalWeisPointsWith: newWeisMade,
      totalWeisReceivedWith: newWeisReceived,
      weisDifferenceWith: newWeisMade - newWeisReceived, // ✅ STATELESS DERIVATION
      
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
    
    // ✅ Berechne Win Rates (Draws werden ignoriert: Siege / (Siege + Niederlagen))
    const decidedSessions = updated.sessionsWonWith + updated.sessionsLostWith;
    updated.sessionWinRateWith = decidedSessions > 0 ? updated.sessionsWonWith / decidedSessions : 0;
    const decidedGames = updated.gamesWonWith + updated.gamesLostWith;
    updated.gameWinRateWith = decidedGames > 0 ? updated.gamesWonWith / decidedGames : 0;
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
    
    // 1. Berechne neue ABSOLUTE Summen für Opponent (konsistente Differenzen)
    const newTotalStricheDiff = (current.totalStricheDifferenceAgainst || 0) + delta.stricheDifference;
    const newTotalPointsDiff = (current.totalPointsDifferenceAgainst || 0) + delta.pointsDifference;
    
    const currentMatschMade = current.matschEventsMadeAgainst || 0;
    const currentMatschReceived = current.matschEventsReceivedAgainst || 0;
    const newMatschMade = currentMatschMade + delta.matschEventsMade;
    const newMatschReceived = currentMatschReceived + delta.matschEventsReceived;
    
    const currentSchneiderMade = current.schneiderEventsMadeAgainst || 0;
    const currentSchneiderReceived = current.schneiderEventsReceivedAgainst || 0;
    const newSchneiderMade = currentSchneiderMade + delta.schneiderEventsMade;
    const newSchneiderReceived = currentSchneiderReceived + delta.schneiderEventsReceived;
    
    const currentKontermatschMade = current.kontermatschEventsMadeAgainst || 0;
    const currentKontermatschReceived = current.kontermatschEventsReceivedAgainst || 0;
    const newKontermatschMade = currentKontermatschMade + delta.kontermatschEventsMade;
    const newKontermatschReceived = currentKontermatschReceived + delta.kontermatschEventsReceived;
    
    const currentWeisMade = current.totalWeisPointsAgainst || 0;
    const currentWeisReceived = current.totalWeisReceivedAgainst || 0;
    const newWeisMade = currentWeisMade + delta.weisPoints;
    const newWeisReceived = currentWeisReceived + delta.weisReceived;
    
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
      
      totalStricheDifferenceAgainst: newTotalStricheDiff,
      totalPointsDifferenceAgainst: newTotalPointsDiff,
      
      // EVENTS (Neu berechnet & Bilanz abgeleitet)
      matschEventsMadeAgainst: newMatschMade,
      matschEventsReceivedAgainst: newMatschReceived,
      matschBilanzAgainst: newMatschMade - newMatschReceived, // ✅ STATELESS DERIVATION
      
      schneiderEventsMadeAgainst: newSchneiderMade,
      schneiderEventsReceivedAgainst: newSchneiderReceived,
      schneiderBilanzAgainst: newSchneiderMade - newSchneiderReceived, // ✅ STATELESS DERIVATION
      
      kontermatschEventsMadeAgainst: newKontermatschMade,
      kontermatschEventsReceivedAgainst: newKontermatschReceived,
      kontermatschBilanzAgainst: newKontermatschMade - newKontermatschReceived, // ✅ STATELESS DERIVATION
      
      // WEIS (Neu berechnet & Differenz abgeleitet)
      totalWeisPointsAgainst: newWeisMade,
      totalWeisReceivedAgainst: newWeisReceived,
      weisDifferenceAgainst: newWeisMade - newWeisReceived, // ✅ STATELESS DERIVATION
      
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
    
    // ✅ Berechne Win Rates (Draws werden ignoriert: Siege / (Siege + Niederlagen))
    const decidedSessions = updated.sessionsWonAgainst + updated.sessionsLostAgainst;
    updated.sessionWinRateAgainst = decidedSessions > 0 ? updated.sessionsWonAgainst / decidedSessions : 0;
    const decidedGames = updated.gamesWonAgainst + updated.gamesLostAgainst;
    updated.gameWinRateAgainst = decidedGames > 0 ? updated.gamesWonAgainst / decidedGames : 0;
    if (updated.totalRoundsAgainst !== undefined && updated.totalRoundsAgainst > 0 && updated.totalRoundDurationAgainst !== undefined) {
      updated.avgRoundDurationAgainst = updated.totalRoundDurationAgainst / updated.totalRoundsAgainst;
    }
    
    await opponentStatsRef.set(updated);
  }
  
  logger.info(`[updateOpponentStatsSubcollection] ✅ Opponent Stats aktualisiert (${delta.opponentIds.length} Gegner)`);
}

/**
 * Aktualisiert Scores History Subcollection (Aggregiert pro Session)
 * 
 * Erstellt EINEN Eintrag pro Session/Turnier mit den aufsummierten Werten.
 * Das sorgt für saubere Charts ohne "Zick-Zack" und reduziert die Datenmenge.
 */
async function updateScoresHistorySubcollection(
  playerId: string,
  groupId: string,
  sessionId: string,
  sessionData: any,
  delta: SessionDelta,
  tournamentId: string | null
): Promise<void> {
  try {
    // Prüfen ob bereits ein Eintrag für diese Session existiert
    const historyRef = db.collection(`players/${playerId}/scoresHistory`);
    const existingQuery = await historyRef.where('sessionId', '==', sessionId).get();
    
    let docRef;
    let isUpdate = false;
    
    if (!existingQuery.empty) {
      docRef = existingQuery.docs[0].ref;
      isUpdate = true;
    } else {
      docRef = historyRef.doc();
    }
    
    // Timestamp bestimmen
    const completedAt = sessionData.endedAt || sessionData.completedAt || sessionData.lastUpdated || admin.firestore.Timestamp.now();
    
    const entry: ScoresHistoryEntry = {
      completedAt: completedAt,
      groupId: groupId,
      sessionId: sessionId,
      tournamentId: tournamentId || null,
      
      // Aggregierte Werte aus dem Delta
      stricheDiff: delta.stricheDifference,
      pointsDiff: delta.pointsDifference,
      
      // Wins/Losses sind hier die Anzahl der Spiele!
      wins: delta.gamesWon,
      losses: delta.gamesLost,
      
      // Event Bilanzen
      matschBilanz: delta.matschBilanz,
      schneiderBilanz: delta.schneiderBilanz,
      kontermatschBilanz: delta.kontermatschBilanz,
      
      weisDifference: delta.weisDifference,
      
      // Metadaten
      eventType: tournamentId ? 'tournament_session' : 'session',
      gameNumber: delta.gamesPlayed // Anzahl der Spiele in dieser Session
    };
    
    await docRef.set(entry, { merge: true });
    
    logger.info(`[updateScoresHistorySubcollection] ✅ Scores History ${isUpdate ? 'aktualisiert' : 'erstellt'} für Spieler ${playerId} (Diff: ${delta.stricheDifference}, Games: ${delta.gamesPlayed})`);
  } catch (error) {
    logger.error(`[updateScoresHistorySubcollection] Fehler bei Spieler ${playerId}:`, error);
    // Nicht kritisch, werfen wir nicht weiter
  }
}

