import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall } from 'firebase-functions/v2/https';

// ===== TYPES =====

export interface IndividualScores {
  // ✅ KERN-METRIKEN
  stricheDiff: number;
  pointsDiff: number;
  wins: number;
  losses: number;
  sessionsDraw: number;
  gamesPlayed: number;
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  
  // ✅ WEIS-METRIKEN
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  
  // ✅ EVENT-METRIKEN (MADE + RECEIVED + BILANZ)
  matschEventsMade: number;
  matschEventsReceived: number;
  matschBilanz: number;
  schneiderEventsMade: number;
  schneiderEventsReceived: number;
  schneiderBilanz: number;
  kontermatschEventsMade: number;
  kontermatschEventsReceived: number;
  kontermatschBilanz: number;
  
  // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
  matschEvents: number;  // = matschEventsMade (für Kompatibilität)
  schneiderEvents: number;  // = schneiderEventsMade (für Kompatibilität)
  kontermatschEvents: number;  // = kontermatschEventsMade (für Kompatibilität)
  
  // ✅ QUOTEN (gewichtet)
  sessionWinRate: number;
  gameWinRate: number;
  weisAverage: number;
}

export interface PlayerScores {
  playerId: string;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: IndividualScores;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: IndividualScores;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: IndividualScores;
  };
  
  // 👥 PARTNER/GEGNER
  partners: any[];
  opponents: any[];
  
  lastUpdated: admin.firestore.Timestamp;
}

// ===== HELPER FUNCTIONS =====

function getDefaultIndividualScores(): IndividualScores {
  return {
    // ✅ KERN-METRIKEN
    stricheDiff: 0,
    pointsDiff: 0,
    wins: 0,
    losses: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    
    // ✅ WEIS-METRIKEN
    totalWeisPoints: 0,
    totalWeisReceived: 0,
    weisDifference: 0,
    
    // ✅ EVENT-METRIKEN (MADE + RECEIVED + BILANZ)
    matschEventsMade: 0,
    matschEventsReceived: 0,
    matschBilanz: 0,
    schneiderEventsMade: 0,
    schneiderEventsReceived: 0,
    schneiderBilanz: 0,
    kontermatschEventsMade: 0,
    kontermatschEventsReceived: 0,
    kontermatschBilanz: 0,
    
    // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
    matschEvents: 0,  // = matschEventsMade (für Kompatibilität)
    schneiderEvents: 0,  // = schneiderEventsMade (für Kompatibilität)
    kontermatschEvents: 0,  // = kontermatschEventsMade (für Kompatibilität)
    
    // ✅ QUOTEN
    sessionWinRate: 0,
    gameWinRate: 0,
    weisAverage: 0
  };
}

// ===== MAIN FUNCTION =====

/**
 * 🎯 Cloud Function: Backfill Player Scores für alle Spieler
 */
export const backfillAllPlayerScores = onCall(
  { region: "europe-west1", timeoutSeconds: 540 },
  async (request) => {
    logger.info('🚀 STARTE VOLLSTÄNDIGE PLAYER SCORES MIGRATION');
    
    try {
      const startTime = Date.now();
      
      // 1. Statistiken sammeln
      const stats = await collectMigrationStats();
      logger.info(`📊 MIGRATION STATISTIKEN:`);
      logger.info(`   - Gruppen: ${stats.groupCount}`);
      logger.info(`   - Spieler: ${stats.playerCount}`);
      logger.info(`   - Sessions: ${stats.sessionCount}`);
      
      if (stats.playerCount === 0) {
        logger.warn('⚠️ Keine Spieler gefunden');
        return { success: true, message: 'Keine Spieler gefunden' };
      }
      
      // 2. Migration ausführen
      let processedCount = 0;
      let errorCount = 0;
      
      for (const playerId of stats.playerIds) {
        try {
          logger.info(`🔄 Verarbeite Spieler ${playerId} (${processedCount + 1}/${stats.playerCount})`);
          
          await backfillPlayerScoresForPlayer(playerId);
          processedCount++;
          
          // Pause zwischen Spielern
          if (processedCount % 10 === 0) {
            logger.info(`⏸️ Pause nach ${processedCount} Spielern`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`❌ Fehler bei Spieler ${playerId}:`, error);
          errorCount++;
        }
      }
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      logger.info('✅ MIGRATION ERFOLGREICH ABGESCHLOSSEN!');
      logger.info(`⏱️  Dauer: ${duration} Sekunden`);
      logger.info(`📊 Verarbeitet: ${processedCount} Spieler, ${errorCount} Fehler`);
      
      return {
        success: true,
        message: `Migration abgeschlossen: ${processedCount} Spieler verarbeitet`,
        stats: {
          processed: processedCount,
          errors: errorCount,
          duration: duration
        }
      };
    } catch (error) {
      logger.error('❌ KRITISCHER FEHLER BEI DER MIGRATION:', error);
      return {
        success: false,
        message: 'Migration fehlgeschlagen',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

/**
 * 🎯 Sammle Migration-Statistiken
 */
async function collectMigrationStats(): Promise<{
  groupCount: number;
  playerCount: number;
  sessionCount: number;
  playerIds: string[];
}> {
  try {
    // Zähle Gruppen
    const groupsSnap = await admin.firestore().collection('groups').get();
    const groupCount = groupsSnap.size;
    
    // Zähle Spieler
    const playersSnap = await admin.firestore().collection('players').get();
    const playerIds = playersSnap.docs.map(doc => doc.id);
    const playerCount = playerIds.length;
    
    // Zähle Sessions (ungefähr)
    let sessionCount = 0;
    for (const groupDoc of groupsSnap.docs) {
      const sessionsSnap = await admin.firestore()
        .collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      sessionCount += sessionsSnap.size;
    }
    
    return { groupCount, playerCount, sessionCount, playerIds };
  } catch (error) {
    logger.error('Fehler beim Sammeln der Statistiken:', error);
    return { groupCount: 0, playerCount: 0, sessionCount: 0, playerIds: [] };
  }
}

/**
 * 🎯 Backfill Player Scores für einen einzelnen Spieler
 */
async function backfillPlayerScoresForPlayer(playerId: string): Promise<void> {
  try {
    logger.info(`🔄 Verarbeite Spieler ${playerId}`);
    
    // 1. Lade alle Sessions des Spielers
    const sessions = await getAllSessionsForPlayer(playerId);
    logger.info(`📊 ${sessions.length} Sessions gefunden für Spieler ${playerId}`);
    
    if (sessions.length === 0) {
      logger.info(`⚠️ Keine Sessions für Spieler ${playerId}`);
      return;
    }
    
    // 2. Sortiere Sessions chronologisch
    sessions.sort((a, b) => {
      const aTime = a.completedAt?.toMillis() || 0;
      const bTime = b.completedAt?.toMillis() || 0;
      return aTime - bTime;
    });
    
    // 3. Berechne kumulative Scores
    const playerScores = await calculateCumulativeScoresForPlayer(playerId, sessions);
    
    // 4. Speichere Scores
    await savePlayerScores(playerId, playerScores);
    logger.info(`✅ Scores gespeichert für Spieler ${playerId}`);
  } catch (error) {
    logger.error(`Fehler bei Spieler ${playerId}:`, error);
    throw error;
  }
}

/**
 * 🎯 Lade alle Sessions für einen Spieler
 */
async function getAllSessionsForPlayer(playerId: string): Promise<any[]> {
  try {
    const sessions: any[] = [];
    
    // Lade alle Gruppen
    const groupsSnap = await admin.firestore().collection('groups').get();
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      
      // Lade Sessions dieser Gruppe
      const sessionsSnap = await admin.firestore()
        .collection(`groups/${groupId}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .where('participantPlayerIds', 'array-contains', playerId)
        .orderBy('completedAt', 'asc')
        .get();
      
      sessionsSnap.docs.forEach(doc => {
        sessions.push({
          sessionId: doc.id,
          groupId: groupId,
          ...doc.data()
        });
      });
    }
    
    return sessions;
  } catch (error) {
    logger.error(`Fehler bei Spieler ${playerId}:`, error);
    return [];
  }
}

/**
 * 🎯 Berechne kumulative Scores für einen Spieler
 */
async function calculateCumulativeScoresForPlayer(
  playerId: string,
  sessions: any[]
): Promise<PlayerScores> {
  try {
    // Initialisiere Scores
    const playerScores: PlayerScores = {
      playerId,
      global: getDefaultIndividualScores(),
      groups: {},
      tournaments: {},
      partners: [],
      opponents: [],
      lastUpdated: admin.firestore.Timestamp.now()
    };
    
    // Verarbeite jede Session chronologisch
    for (const session of sessions) {
      try {
        await processSessionForPlayer(playerId, session, playerScores);
      } catch (error) {
        logger.error(`Fehler bei Session ${session.sessionId}:`, error);
      }
    }
    
    // Berechne finale Quoten
    calculateFinalQuotes(playerScores);
    
    return playerScores;
  } catch (error) {
    logger.error(`Fehler bei Spieler ${playerId}:`, error);
    throw error;
  }
}

/**
 * 🎯 Verarbeite eine Session für einen Spieler
 */
async function processSessionForPlayer(
  playerId: string,
  session: any,
  playerScores: PlayerScores
): Promise<void> {
  try {
    // Bestimme Team des Spielers
    const teams = session.teams;
    if (!teams) return;
    
    let playerTeam: 'top' | 'bottom' | null = null;
    if (teams.top?.players?.some((p: any) => p.playerId === playerId)) {
      playerTeam = 'top';
    } else if (teams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
      playerTeam = 'bottom';
    }
    
    if (!playerTeam) return;
    
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Berechne Session-Delta
    const sessionDelta = calculateSessionDelta(session, playerTeam, opponentTeam);
    
    // Aktualisiere Global Scores
    playerScores.global.stricheDiff += sessionDelta.stricheDiff;
    playerScores.global.pointsDiff += sessionDelta.pointsDiff;
    playerScores.global.wins += sessionDelta.wins;
    playerScores.global.losses += sessionDelta.losses;
    playerScores.global.sessionsDraw += sessionDelta.sessionsDraw;
    playerScores.global.gamesPlayed += sessionDelta.gamesPlayed;
    playerScores.global.sessionsPlayed += 1;
    playerScores.global.sessionsWon += sessionDelta.sessionsWon;
    playerScores.global.sessionsLost += sessionDelta.sessionsLost;
    
    // Aktualisiere Weis-Metriken
    playerScores.global.totalWeisPoints += sessionDelta.totalWeisPoints;
    playerScores.global.totalWeisReceived += sessionDelta.totalWeisReceived;
    playerScores.global.weisDifference = playerScores.global.totalWeisPoints - playerScores.global.totalWeisReceived;
    
    // Aktualisiere Event-Metriken (MADE + RECEIVED + BILANZ)
    playerScores.global.matschEventsMade += sessionDelta.matschEventsMade;
    playerScores.global.matschEventsReceived += sessionDelta.matschEventsReceived;
    playerScores.global.matschBilanz = playerScores.global.matschEventsMade - playerScores.global.matschEventsReceived;
    
    playerScores.global.schneiderEventsMade += sessionDelta.schneiderEventsMade;
    playerScores.global.schneiderEventsReceived += sessionDelta.schneiderEventsReceived;
    playerScores.global.schneiderBilanz = playerScores.global.schneiderEventsMade - playerScores.global.schneiderEventsReceived;
    
    playerScores.global.kontermatschEventsMade += sessionDelta.kontermatschEventsMade;
    playerScores.global.kontermatschEventsReceived += sessionDelta.kontermatschEventsReceived;
    playerScores.global.kontermatschBilanz = playerScores.global.kontermatschEventsMade - playerScores.global.kontermatschEventsReceived;
    
    // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
    playerScores.global.matschEvents = playerScores.global.matschEventsMade;
    playerScores.global.schneiderEvents = playerScores.global.schneiderEventsMade;
    playerScores.global.kontermatschEvents = playerScores.global.kontermatschEventsMade;
    
    // Aktualisiere Gruppen-Scores
    if (!playerScores.groups[session.groupId]) {
      playerScores.groups[session.groupId] = getDefaultIndividualScores();
    }
    
    const groupScores = playerScores.groups[session.groupId];
    groupScores.stricheDiff += sessionDelta.stricheDiff;
    groupScores.pointsDiff += sessionDelta.pointsDiff;
    groupScores.wins += sessionDelta.wins;
    groupScores.losses += sessionDelta.losses;
    groupScores.sessionsDraw += sessionDelta.sessionsDraw;
    groupScores.gamesPlayed += sessionDelta.gamesPlayed;
    groupScores.sessionsPlayed += 1;
    groupScores.sessionsWon += sessionDelta.sessionsWon;
    groupScores.sessionsLost += sessionDelta.sessionsLost;
    
    // Aktualisiere Gruppen Event-Metriken (MADE + RECEIVED + BILANZ)
    groupScores.matschEventsMade += sessionDelta.matschEventsMade;
    groupScores.matschEventsReceived += sessionDelta.matschEventsReceived;
    groupScores.matschBilanz = groupScores.matschEventsMade - groupScores.matschEventsReceived;
    
    groupScores.schneiderEventsMade += sessionDelta.schneiderEventsMade;
    groupScores.schneiderEventsReceived += sessionDelta.schneiderEventsReceived;
    groupScores.schneiderBilanz = groupScores.schneiderEventsMade - groupScores.schneiderEventsReceived;
    
    groupScores.kontermatschEventsMade += sessionDelta.kontermatschEventsMade;
    groupScores.kontermatschEventsReceived += sessionDelta.kontermatschEventsReceived;
    groupScores.kontermatschBilanz = groupScores.kontermatschEventsMade - groupScores.kontermatschEventsReceived;
    
    // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
    groupScores.matschEvents = groupScores.matschEventsMade;
    groupScores.schneiderEvents = groupScores.schneiderEventsMade;
    groupScores.kontermatschEvents = groupScores.kontermatschEventsMade;
  } catch (error) {
    logger.error(`Fehler bei Session ${session.sessionId}:`, error);
  }
}

/**
 * 🎯 Berechne Session-Delta
 */
function calculateSessionDelta(session: any, playerTeam: 'top' | 'bottom', opponentTeam: 'top' | 'bottom'): IndividualScores {
  const delta = getDefaultIndividualScores();
  
  try {
    const finalScores = session.finalScores;
    const finalStriche = session.finalStriche;
    const eventCounts = session.eventCounts;
    const sessionTotalWeisPoints = session.sessionTotalWeisPoints;
    
    if (finalScores && finalStriche) {
      // Session-Gewinner bestimmen
      const playerScore = finalScores[playerTeam] || 0;
      const opponentScore = finalScores[opponentTeam] || 0;
      
      if (playerScore > opponentScore) {
        delta.sessionsWon = 1;
      } else if (playerScore < opponentScore) {
        delta.sessionsLost = 1;
      } else {
        delta.sessionsDraw = 1;
      }
      
      // Striche-Differenz
      const playerStriche = calculateTotalStriche(finalStriche[playerTeam]);
      const opponentStriche = calculateTotalStriche(finalStriche[opponentTeam]);
      delta.stricheDiff = playerStriche - opponentStriche;
      
      // Punkte-Differenz
      delta.pointsDiff = playerScore - opponentScore;
      
      // Games Played
      delta.gamesPlayed = session.gamesPlayed || 0;
      
      // Weis-Points
      if (sessionTotalWeisPoints) {
        delta.totalWeisPoints = sessionTotalWeisPoints[playerTeam] || 0;
        delta.totalWeisReceived = sessionTotalWeisPoints[opponentTeam] || 0;
      }
      
      // Event-Counts (MADE + RECEIVED + BILANZ)
      if (eventCounts) {
        const playerEvents = eventCounts[playerTeam];
        const opponentEvents = eventCounts[opponentTeam];
        
        if (playerEvents) {
          // NEUE FELDER: Made + Received + Bilanz
          delta.matschEventsMade = playerEvents.matsch || 0;
          delta.schneiderEventsMade = playerEvents.schneider || 0;
          delta.kontermatschEventsMade = playerEvents.kontermatsch || 0;
        }
        
        if (opponentEvents) {
          // Events die der Gegner gemacht hat = Events die der Spieler erhalten hat
          delta.matschEventsReceived = opponentEvents.matsch || 0;
          delta.schneiderEventsReceived = opponentEvents.schneider || 0;
          delta.kontermatschEventsReceived = opponentEvents.kontermatsch || 0;
        }
        
        // Berechne Bilanz (Made - Received)
        delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
        delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
        delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
        
        // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
        delta.matschEvents = delta.matschEventsMade;
        delta.schneiderEvents = delta.schneiderEventsMade;
        delta.kontermatschEvents = delta.kontermatschEventsMade;
      }
    }
    
    return delta;
  } catch (error) {
    logger.error('Fehler bei Session-Delta:', error);
    return delta;
  }
}

/**
 * 🎯 Berechne Gesamt-Striche aus StricheRecord
 */
function calculateTotalStriche(stricheRecord: any): number {
  if (!stricheRecord) return 0;
  
  return (stricheRecord.berg || 0) + 
         (stricheRecord.sieg || 0) + 
         (stricheRecord.matsch || 0) + 
         (stricheRecord.schneider || 0) + 
         (stricheRecord.kontermatsch || 0);
}

/**
 * 🎯 Berechne finale Quoten
 */
function calculateFinalQuotes(playerScores: PlayerScores): void {
  try {
    // Global Quotes
    playerScores.global.sessionWinRate = playerScores.global.sessionsPlayed > 0 
      ? playerScores.global.sessionsWon / playerScores.global.sessionsPlayed 
      : 0;
    playerScores.global.gameWinRate = playerScores.global.gamesPlayed > 0 
      ? playerScores.global.wins / playerScores.global.gamesPlayed 
      : 0;
    playerScores.global.weisAverage = playerScores.global.sessionsPlayed > 0 
      ? playerScores.global.totalWeisPoints / playerScores.global.sessionsPlayed 
      : 0;
    
    // Gruppen Quotes
    for (const groupId in playerScores.groups) {
      if (Object.prototype.hasOwnProperty.call(playerScores.groups, groupId)) {
        const groupScores = playerScores.groups[groupId];
        groupScores.sessionWinRate = groupScores.sessionsPlayed > 0 
          ? groupScores.sessionsWon / groupScores.sessionsPlayed 
          : 0;
        groupScores.gameWinRate = groupScores.gamesPlayed > 0 
          ? groupScores.wins / groupScores.gamesPlayed 
          : 0;
        groupScores.weisAverage = groupScores.sessionsPlayed > 0 
          ? groupScores.totalWeisPoints / groupScores.sessionsPlayed 
          : 0;
      }
    }
  } catch (error) {
    logger.error('Fehler bei Quote-Berechnung:', error);
  }
}

/**
 * 🎯 Speichere Player Scores
 */
async function savePlayerScores(playerId: string, playerScores: PlayerScores): Promise<void> {
  try {
    // Speichere aktuelle Scores
    const currentScoresRef = admin.firestore().collection(`players/${playerId}/currentScores`).doc('latest');
    await currentScoresRef.set(playerScores);
    
    // Speichere Historie-Eintrag
    const historyEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      global: playerScores.global,
      groups: playerScores.groups,
      tournaments: playerScores.tournaments,
      partners: playerScores.partners,
      opponents: playerScores.opponents,
      eventType: 'manual_recalc'
    };
    
    const historyRef = admin.firestore().collection(`players/${playerId}/scoresHistory`).doc();
    await historyRef.set(historyEntry);
  } catch (error) {
    logger.error(`Fehler bei Spieler ${playerId}:`, error);
    throw error;
  }
}
