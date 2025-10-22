import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

// ===== TYPES =====

export interface IndividualScores {
  // ✅ KERN-METRIKEN
  stricheDiff: number;
  pointsDiff: number;
  wins: number;
  losses: number;
  draws: number;
  sessionsDraw: number;
  gamesPlayed: number;
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  
  // ✅ WEIS-METRIKEN
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  
  // ✅ EVENT-METRIKEN
  matschEvents: number;
  schneiderEvents: number;
  kontermatschEvents: number;
  
  // 🆕 EVENT-BILANZEN (für Charts)
  matschBilanz: number;
  schneiderBilanz: number;
  kontermatschBilanz: number;
  
  // ✅ QUOTEN (gewichtet)
  sessionWinRate: number;
  gameWinRate: number;
  weisAverage: number;
  
  // 🆕 HISTORY (für Charts)
  history?: any[];
}

export interface PartnerStats {
  partnerId: string;
  partnerDisplayName: string;
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  sessionsLostWith: number;
  sessionsDrawWith: number;
  gamesPlayedWith: number;
  gamesWonWith: number;
  gamesLostWith: number;
  gamesDrawWith: number;
  totalStricheDifferenceWith: number;
  totalPointsDifferenceWith: number;
  
  // ✅ WEIS-METRIKEN mit Partner
  totalWeisPointsWith: number;
  totalWeisReceivedWith: number;
  weisDifferenceWith: number;
  
  // ✅ EVENT-METRIKEN mit Partner
  matschEventsMadeWith: number;
  matschEventsReceivedWith: number;
  matschBilanz: number;
  schneiderEventsMadeWith: number;
  schneiderEventsReceivedWith: number;
  schneiderBilanz: number;
  kontermatschEventsMadeWith: number;
  kontermatschEventsReceivedWith: number;
  kontermatschBilanz: number;
  
  // ✅ QUOTEN mit Partner
  sessionWinRateWith: number;
  gameWinRateWith: number;
}

export interface OpponentStats {
  opponentId: string;
  opponentDisplayName: string;
  sessionsPlayedAgainst: number;
  sessionsWonAgainst: number;
  sessionsLostAgainst: number;
  sessionsDrawAgainst: number;
  gamesPlayedAgainst: number;
  gamesWonAgainst: number;
  gamesLostAgainst: number;
  gamesDrawAgainst: number;
  totalStricheDifferenceAgainst: number;
  totalPointsDifferenceAgainst: number;
  
  // ✅ WEIS-METRIKEN gegen Gegner
  totalWeisPointsAgainst: number;
  totalWeisReceivedAgainst: number;
  weisDifferenceAgainst: number;
  
  // ✅ EVENT-METRIKEN gegen Gegner
  matschEventsMadeAgainst: number;
  matschEventsReceivedAgainst: number;
  matschBilanz: number;
  schneiderEventsMadeAgainst: number;
  schneiderEventsReceivedAgainst: number;
  schneiderBilanz: number;
  kontermatschEventsMadeAgainst: number;
  kontermatschEventsReceivedAgainst: number;
  kontermatschBilanz: number;
  
  // ✅ QUOTEN gegen Gegner
  sessionWinRateAgainst: number;
  gameWinRateAgainst: number;
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
  partners: PartnerStats[];
  opponents: OpponentStats[];
  
  lastUpdated: admin.firestore.Timestamp;
}

export interface PlayerScoresHistoryEntry {
  timestamp: admin.firestore.Timestamp;
  
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
  partners: PartnerStats[];
  opponents: OpponentStats[];
  
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc';
}

// ===== HELPER FUNCTIONS =====

function getDefaultIndividualScores(): IndividualScores {
  return {
    // ✅ KERN-METRIKEN
    stricheDiff: 0,
    pointsDiff: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    
    // ✅ WEIS-METRIKEN
    totalWeisPoints: 0,
    totalWeisReceived: 0,
    weisDifference: 0,
    
    // ✅ EVENT-METRIKEN
    matschEvents: 0,
    schneiderEvents: 0,
    kontermatschEvents: 0,
    
    // 🆕 EVENT-BILANZEN (für Charts)
    matschBilanz: 0,
    schneiderBilanz: 0,
    kontermatschBilanz: 0,
    
    // ✅ QUOTEN
    sessionWinRate: 0,
    gameWinRate: 0,
    weisAverage: 0,
    
    // 🆕 HISTORY (für Charts)
    history: []
  };
}

function getDefaultPartnerStats(partnerId: string, partnerDisplayName: string): PartnerStats {
  return {
    partnerId,
    partnerDisplayName,
    sessionsPlayedWith: 0,
    sessionsWonWith: 0,
    sessionsLostWith: 0,
    sessionsDrawWith: 0,
    gamesPlayedWith: 0,
    gamesWonWith: 0,
    gamesLostWith: 0,
    gamesDrawWith: 0,
    totalStricheDifferenceWith: 0,
    totalPointsDifferenceWith: 0,
    
    // ✅ WEIS-METRIKEN mit Partner
    totalWeisPointsWith: 0,
    totalWeisReceivedWith: 0,
    weisDifferenceWith: 0,
    
    // ✅ EVENT-METRIKEN mit Partner
    matschEventsMadeWith: 0,
    matschEventsReceivedWith: 0,
    matschBilanz: 0,
    schneiderEventsMadeWith: 0,
    schneiderEventsReceivedWith: 0,
    schneiderBilanz: 0,
    kontermatschEventsMadeWith: 0,
    kontermatschEventsReceivedWith: 0,
    kontermatschBilanz: 0,
    
    // ✅ QUOTEN mit Partner
    sessionWinRateWith: 0,
    gameWinRateWith: 0
  };
}

function getDefaultOpponentStats(opponentId: string, opponentDisplayName: string): OpponentStats {
  return {
    opponentId,
    opponentDisplayName,
    sessionsPlayedAgainst: 0,
    sessionsWonAgainst: 0,
    sessionsLostAgainst: 0,
    sessionsDrawAgainst: 0,
    gamesPlayedAgainst: 0,
    gamesWonAgainst: 0,
    gamesLostAgainst: 0,
    gamesDrawAgainst: 0,
    totalStricheDifferenceAgainst: 0,
    totalPointsDifferenceAgainst: 0,
    
    // ✅ WEIS-METRIKEN gegen Gegner
    totalWeisPointsAgainst: 0,
    totalWeisReceivedAgainst: 0,
    weisDifferenceAgainst: 0,
    
    // ✅ EVENT-METRIKEN gegen Gegner
    matschEventsMadeAgainst: 0,
    matschEventsReceivedAgainst: 0,
    matschBilanz: 0,
    schneiderEventsMadeAgainst: 0,
    schneiderEventsReceivedAgainst: 0,
    schneiderBilanz: 0,
    kontermatschEventsMadeAgainst: 0,
    kontermatschEventsReceivedAgainst: 0,
    kontermatschBilanz: 0,
    
    // ✅ QUOTEN gegen Gegner
    sessionWinRateAgainst: 0,
    gameWinRateAgainst: 0
  };
}

// ===== MAIN FUNCTIONS =====

/**
 * 🎯 Berechne Player Scores für eine Session
 * Wird von finalizeSession.ts aufgerufen
 */
export async function calculatePlayerScoresForSession(
  groupId: string,
  sessionId: string,
  participantPlayerIds: string[],
  sessionData: any
): Promise<void> {
  try {
    logger.info(`[calculatePlayerScoresForSession] Starte Berechnung für Session ${sessionId} in Gruppe ${groupId}`);
    
    // Lade Session-Daten
    const sessionRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionId);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      logger.error(`[calculatePlayerScoresForSession] Session ${sessionId} nicht gefunden`);
      return;
    }
    
    const sessionData = sessionDoc.data();
    if (!sessionData) {
      logger.error(`[calculatePlayerScoresForSession] Session ${sessionId} hat keine Daten`);
      return;
    }
    
    // Berechne Scores für jeden Spieler
    const playerScoresPromises = participantPlayerIds.map(async (playerId) => {
      try {
        await calculatePlayerScoresForPlayer(playerId, groupId, sessionId, sessionData);
      } catch (error) {
        logger.error(`[calculatePlayerScoresForSession] Fehler bei Spieler ${playerId}:`, error);
      }
    });
    
    await Promise.all(playerScoresPromises);
    
    logger.info(`[calculatePlayerScoresForSession] ✅ Berechnung abgeschlossen für Session ${sessionId}`);
  } catch (error) {
    logger.error(`[calculatePlayerScoresForSession] Fehler bei Session ${sessionId}:`, error);
  }
}

/**
 * 🎯 Berechne Player Scores für einen einzelnen Spieler
 */
async function calculatePlayerScoresForPlayer(
  playerId: string,
  groupId: string,
  sessionId: string,
  sessionData: any
): Promise<void> {
  try {
    // Lade aktuelle Scores
    const currentScoresRef = db.collection(`players/${playerId}/currentScores`).doc('latest');
    const currentScoresDoc = await currentScoresRef.get();
    
    let currentScores: PlayerScores;
    if (currentScoresDoc.exists) {
      const data = currentScoresDoc.data();
      currentScores = {
        playerId,
        global: data?.global || getDefaultIndividualScores(),
        groups: data?.groups || {},
        tournaments: data?.tournaments || {},
        partners: data?.partners || [],
        opponents: data?.opponents || [],
        lastUpdated: data?.lastUpdated || admin.firestore.Timestamp.now()
      };
    } else {
      currentScores = {
        playerId,
        global: getDefaultIndividualScores(),
        groups: {},
        tournaments: {},
        partners: [],
        opponents: [],
        lastUpdated: admin.firestore.Timestamp.now()
      };
    }
    
    // Berechne Session-Delta
    const sessionDelta = await calculateSessionDelta(playerId, sessionId, sessionData);
    
    // Aktualisiere Global Scores
    currentScores.global.stricheDiff += sessionDelta.stricheDiff;
    currentScores.global.pointsDiff += sessionDelta.pointsDiff;
    currentScores.global.wins += sessionDelta.wins;
    currentScores.global.losses += sessionDelta.losses;
    currentScores.global.sessionsDraw += sessionDelta.sessionsDraw;
    currentScores.global.gamesPlayed += sessionDelta.gamesPlayed;
    currentScores.global.sessionsPlayed += 1;
    currentScores.global.sessionsWon += sessionDelta.sessionsWon;
    currentScores.global.sessionsLost += sessionDelta.sessionsLost;
    
    // Aktualisiere Weis-Metriken
    currentScores.global.totalWeisPoints += sessionDelta.totalWeisPoints;
    currentScores.global.totalWeisReceived += sessionDelta.totalWeisReceived;
    currentScores.global.weisDifference = currentScores.global.totalWeisPoints - currentScores.global.totalWeisReceived;
    
    // Aktualisiere Event-Metriken
    currentScores.global.matschEvents += sessionDelta.matschEvents;
    currentScores.global.schneiderEvents += sessionDelta.schneiderEvents;
    currentScores.global.kontermatschEvents += sessionDelta.kontermatschEvents;
    
    // Berechne Quoten
    currentScores.global.sessionWinRate = currentScores.global.sessionsPlayed > 0 
      ? currentScores.global.sessionsWon / currentScores.global.sessionsPlayed 
      : 0;
    currentScores.global.gameWinRate = currentScores.global.gamesPlayed > 0 
      ? currentScores.global.wins / currentScores.global.gamesPlayed 
      : 0;
    currentScores.global.weisAverage = currentScores.global.sessionsPlayed > 0 
      ? currentScores.global.totalWeisPoints / currentScores.global.sessionsPlayed 
      : 0;
    
    // Aktualisiere Gruppen-Scores
    if (!currentScores.groups[groupId]) {
      currentScores.groups[groupId] = getDefaultIndividualScores();
    }
    
    const groupScores = currentScores.groups[groupId];
    groupScores.stricheDiff += sessionDelta.stricheDiff;
    groupScores.pointsDiff += sessionDelta.pointsDiff;
    groupScores.wins += sessionDelta.wins;
    groupScores.losses += sessionDelta.losses;
    groupScores.sessionsDraw += sessionDelta.sessionsDraw;
    groupScores.gamesPlayed += sessionDelta.gamesPlayed;
    groupScores.sessionsPlayed += 1;
    groupScores.sessionsWon += sessionDelta.sessionsWon;
    groupScores.sessionsLost += sessionDelta.sessionsLost;
    
    // Aktualisiere Partner/Gegner-Statistiken
    await updatePartnerOpponentStats(currentScores, sessionData, playerId);
    
    // Speichere aktualisierte Scores
    currentScores.lastUpdated = admin.firestore.Timestamp.now();
    await currentScoresRef.set(currentScores);
    
    // Speichere Historie-Eintrag
    await savePlayerScoresHistoryEntry(playerId, currentScores, 'session_end');
    
    // 🆕 SPEICHERE AUCH IN playerScores.global.history für Charts
    await savePlayerScoresGlobalHistory(playerId, sessionId, sessionData, sessionDelta);
    
    logger.info(`[calculatePlayerScoresForPlayer] ✅ Scores aktualisiert für Spieler ${playerId}`);
  } catch (error) {
    logger.error(`[calculatePlayerScoresForPlayer] Fehler bei Spieler ${playerId}:`, error);
  }
}

/**
 * 🎯 Berechne Session-Delta für einen Spieler
 */
async function calculateSessionDelta(
  playerId: string,
  sessionId: string,
  sessionData: any
): Promise<IndividualScores> {
  const delta = getDefaultIndividualScores();
  
  try {
    // Bestimme Team des Spielers
    const teams = sessionData.teams;
    if (!teams) {
      logger.warn(`[calculateSessionDelta] Keine Teams in Session ${sessionId}`);
      return delta;
    }
    
    let playerTeam: 'top' | 'bottom' | null = null;
    if (teams.top?.players?.some((p: any) => p.playerId === playerId)) {
      playerTeam = 'top';
    } else if (teams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
      playerTeam = 'bottom';
    }
    
    if (!playerTeam) {
      logger.warn(`[calculateSessionDelta] Spieler ${playerId} nicht in Teams gefunden`);
      return delta;
    }
    
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Berechne Session-Ergebnis
    const finalScores = sessionData.finalScores;
    const finalStriche = sessionData.finalStriche;
    const eventCounts = sessionData.eventCounts;
    const sessionTotalWeisPoints = sessionData.sessionTotalWeisPoints;
    
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
      delta.gamesPlayed = sessionData.gamesPlayed || 0;
      
      // Weis-Points
      if (sessionTotalWeisPoints) {
        delta.totalWeisPoints = sessionTotalWeisPoints[playerTeam] || 0;
        delta.totalWeisReceived = sessionTotalWeisPoints[opponentTeam] || 0;
      }
      
      // Event-Counts
      if (eventCounts) {
        const playerEvents = eventCounts[playerTeam];
        
        if (playerEvents) {
          delta.matschEvents = playerEvents.matsch || 0;
          delta.schneiderEvents = playerEvents.schneider || 0;
          delta.kontermatschEvents = playerEvents.kontermatsch || 0;
        }
      }
    }
    
    return delta;
  } catch (error) {
    logger.error(`[calculateSessionDelta] Fehler bei Session ${sessionId}:`, error);
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
 * 🎯 Aktualisiere Partner/Gegner-Statistiken
 */
async function updatePartnerOpponentStats(
  currentScores: PlayerScores,
  sessionData: any,
  playerId: string
): Promise<void> {
  try {
    const teams = sessionData.teams;
    if (!teams) return;
    
    // Finde Partner und Gegner
    const playerTeam = teams.top?.players?.some((p: any) => p.playerId === playerId) ? 'top' : 'bottom';
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    const partners = teams[playerTeam]?.players?.filter((p: any) => p.playerId !== playerId) || [];
    const opponents = teams[opponentTeam]?.players || [];
    
    // Aktualisiere Partner-Statistiken
    for (const partner of partners) {
      let partnerStats = currentScores.partners.find(p => p.partnerId === partner.playerId);
      if (!partnerStats) {
        partnerStats = getDefaultPartnerStats(partner.playerId, partner.displayName);
        currentScores.partners.push(partnerStats);
      }
      
      // Aktualisiere Partner-Metriken
      partnerStats.sessionsPlayedWith += 1;
      // ... weitere Berechnungen
    }
    
    // Aktualisiere Gegner-Statistiken
    for (const opponent of opponents) {
      let opponentStats = currentScores.opponents.find(o => o.opponentId === opponent.playerId);
      if (!opponentStats) {
        opponentStats = getDefaultOpponentStats(opponent.playerId, opponent.displayName);
        currentScores.opponents.push(opponentStats);
      }
      
      // Aktualisiere Gegner-Metriken
      opponentStats.sessionsPlayedAgainst += 1;
      // ... weitere Berechnungen
    }
  } catch (error) {
    logger.error(`[updatePartnerOpponentStats] Fehler:`, error);
  }
}

/**
 * 🎯 Speichere Player Scores Historie-Eintrag
 */
async function savePlayerScoresHistoryEntry(
  playerId: string,
  scores: PlayerScores,
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc'
): Promise<void> {
  try {
    const historyEntry: PlayerScoresHistoryEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      global: scores.global,
      groups: scores.groups,
      tournaments: scores.tournaments,
      partners: scores.partners,
      opponents: scores.opponents,
      eventType
    };
    
    const historyRef = db.collection(`players/${playerId}/scoresHistory`).doc();
    await historyRef.set(historyEntry);
  } catch (error) {
    logger.error(`[savePlayerScoresHistoryEntry] Fehler bei Spieler ${playerId}:`, error);
  }
}

/**
 * 🎯 Berechne Player Scores für ein Turnier
 * Wird von finalizeTournament.ts aufgerufen
 */
export async function calculatePlayerScoresForTournament(
  tournamentId: string,
  participantPlayerIds: string[],
  tournamentData: any
): Promise<void> {
  try {
    logger.info(`[calculatePlayerScoresForTournament] Starte Berechnung für Turnier ${tournamentId}`);
    
    // Lade Turnier-Daten
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      logger.error(`[calculatePlayerScoresForTournament] Turnier ${tournamentId} nicht gefunden`);
      return;
    }
    
    const tournamentData = tournamentDoc.data();
    if (!tournamentData) {
      logger.error(`[calculatePlayerScoresForTournament] Turnier ${tournamentId} hat keine Daten`);
      return;
    }
    
    // Lade alle Turnier-Spiele
    const gamesRef = tournamentRef.collection('games');
    const gamesSnap = await gamesRef.where('status', '==', 'completed').get();
    
    if (gamesSnap.empty) {
      logger.warn(`[calculatePlayerScoresForTournament] Keine abgeschlossenen Spiele im Turnier ${tournamentId}`);
      return;
    }
    
    const tournamentGames = gamesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Berechne Scores für jeden Spieler
    const playerScoresPromises = participantPlayerIds.map(async (playerId) => {
      try {
        await calculatePlayerScoresForPlayerInTournament(playerId, tournamentId, tournamentGames, tournamentData);
      } catch (error) {
        logger.error(`[calculatePlayerScoresForTournament] Fehler bei Spieler ${playerId}:`, error);
      }
    });
    
    await Promise.all(playerScoresPromises);
    
    logger.info(`[calculatePlayerScoresForTournament] ✅ Berechnung abgeschlossen für Turnier ${tournamentId}`);
  } catch (error) {
    logger.error(`[calculatePlayerScoresForTournament] Fehler bei Turnier ${tournamentId}:`, error);
  }
}

/**
 * 🎯 Berechne Player Scores für einen Spieler in einem Turnier
 */
async function calculatePlayerScoresForPlayerInTournament(
  playerId: string,
  tournamentId: string,
  tournamentGames: any[],
  tournamentData: any
): Promise<void> {
  try {
    // Lade aktuelle Scores
    const currentScoresRef = db.collection(`players/${playerId}/currentScores`).doc('latest');
    const currentScoresDoc = await currentScoresRef.get();
    
    let currentScores: PlayerScores;
    if (currentScoresDoc.exists) {
      const data = currentScoresDoc.data();
      currentScores = {
        playerId,
        global: data?.global || getDefaultIndividualScores(),
        groups: data?.groups || {},
        tournaments: data?.tournaments || {},
        partners: data?.partners || [],
        opponents: data?.opponents || [],
        lastUpdated: data?.lastUpdated || admin.firestore.Timestamp.now()
      };
    } else {
      currentScores = {
        playerId,
        global: getDefaultIndividualScores(),
        groups: {},
        tournaments: {},
        partners: [],
        opponents: [],
        lastUpdated: admin.firestore.Timestamp.now()
      };
    }
    
    // Berechne Turnier-Delta
    const tournamentDelta = await calculateTournamentDelta(playerId, tournamentId, tournamentGames, tournamentData);
    
    // Aktualisiere Global Scores
    currentScores.global.stricheDiff += tournamentDelta.stricheDiff;
    currentScores.global.pointsDiff += tournamentDelta.pointsDiff;
    currentScores.global.wins += tournamentDelta.wins;
    currentScores.global.losses += tournamentDelta.losses;
    currentScores.global.sessionsDraw += tournamentDelta.sessionsDraw;
    currentScores.global.gamesPlayed += tournamentDelta.gamesPlayed;
    currentScores.global.sessionsPlayed += tournamentDelta.sessionsPlayed;
    currentScores.global.sessionsWon += tournamentDelta.sessionsWon;
    currentScores.global.sessionsLost += tournamentDelta.sessionsLost;
    
    // Aktualisiere Weis-Metriken
    currentScores.global.totalWeisPoints += tournamentDelta.totalWeisPoints;
    currentScores.global.totalWeisReceived += tournamentDelta.totalWeisReceived;
    currentScores.global.weisDifference = currentScores.global.totalWeisPoints - currentScores.global.totalWeisReceived;
    
    // Aktualisiere Event-Metriken
    currentScores.global.matschEvents += tournamentDelta.matschEvents;
    currentScores.global.schneiderEvents += tournamentDelta.schneiderEvents;
    currentScores.global.kontermatschEvents += tournamentDelta.kontermatschEvents;
    
    // Berechne Quoten
    currentScores.global.sessionWinRate = currentScores.global.sessionsPlayed > 0 
      ? currentScores.global.sessionsWon / currentScores.global.sessionsPlayed 
      : 0;
    currentScores.global.gameWinRate = currentScores.global.gamesPlayed > 0 
      ? currentScores.global.wins / currentScores.global.gamesPlayed 
      : 0;
    currentScores.global.weisAverage = currentScores.global.sessionsPlayed > 0 
      ? currentScores.global.totalWeisPoints / currentScores.global.sessionsPlayed 
      : 0;
    
    // Aktualisiere Turnier-Scores
    if (!currentScores.tournaments[tournamentId]) {
      currentScores.tournaments[tournamentId] = getDefaultIndividualScores();
    }
    
    const tournamentScores = currentScores.tournaments[tournamentId];
    tournamentScores.stricheDiff = tournamentDelta.stricheDiff;
    tournamentScores.pointsDiff = tournamentDelta.pointsDiff;
    tournamentScores.wins = tournamentDelta.wins;
    tournamentScores.losses = tournamentDelta.losses;
    tournamentScores.sessionsDraw = tournamentDelta.sessionsDraw;
    tournamentScores.gamesPlayed = tournamentDelta.gamesPlayed;
    tournamentScores.sessionsPlayed = tournamentDelta.sessionsPlayed;
    tournamentScores.sessionsWon = tournamentDelta.sessionsWon;
    tournamentScores.sessionsLost = tournamentDelta.sessionsLost;
    
    // Speichere aktualisierte Scores
    currentScores.lastUpdated = admin.firestore.Timestamp.now();
    await currentScoresRef.set(currentScores);
    
    // Speichere Historie-Eintrag
    await savePlayerScoresHistoryEntry(playerId, currentScores, 'tournament_end');
    
    // 🆕 SPEICHERE AUCH IN playerScores.global.history für Charts
    await savePlayerScoresGlobalHistoryForTournament(playerId, tournamentId, tournamentGames, tournamentDelta);
    
    logger.info(`[calculatePlayerScoresForPlayerInTournament] ✅ Scores aktualisiert für Spieler ${playerId} in Turnier ${tournamentId}`);
  } catch (error) {
    logger.error(`[calculatePlayerScoresForPlayerInTournament] Fehler bei Spieler ${playerId}:`, error);
  }
}

/**
 * 🎯 Berechne Turnier-Delta für einen Spieler
 */
async function calculateTournamentDelta(
  playerId: string,
  tournamentId: string,
  tournamentGames: any[],
  tournamentData: any
): Promise<IndividualScores> {
  const delta = getDefaultIndividualScores();
  
  try {
    // Bestimme Team des Spielers basierend auf Turnier-Modus
    const tournamentMode = tournamentData.tournamentMode;
    
    if (tournamentMode === 'single') {
      // Single-Modus: Jeder Spieler spielt einzeln
      await calculateSingleModeDelta(playerId, tournamentGames, delta);
    } else if (tournamentMode === 'doubles') {
      // Doubles-Modus: Spieler spielen in Teams
      await calculateDoublesModeDelta(playerId, tournamentGames, tournamentData.teams, delta);
    } else if (tournamentMode === 'groupVsGroup') {
      // GroupVsGroup-Modus: Gruppen spielen gegeneinander
      await calculateGroupVsGroupModeDelta(playerId, tournamentGames, tournamentData.groups, delta);
    }
    
    return delta;
  } catch (error) {
    logger.error(`[calculateTournamentDelta] Fehler bei Turnier ${tournamentId}:`, error);
    return delta;
  }
}

/**
 * 🎯 Berechne Delta für Single-Modus
 */
async function calculateSingleModeDelta(
  playerId: string,
  tournamentGames: any[],
  delta: IndividualScores
): Promise<void> {
  // Implementierung für Single-Modus
  // ... (Details je nach Turnier-Struktur)
}

/**
 * 🎯 Berechne Delta für Doubles-Modus
 */
async function calculateDoublesModeDelta(
  playerId: string,
  tournamentGames: any[],
  teams: any[],
  delta: IndividualScores
): Promise<void> {
  // Implementierung für Doubles-Modus
  // ... (Details je nach Turnier-Struktur)
}

/**
 * 🎯 Berechne Delta für GroupVsGroup-Modus
 */
async function calculateGroupVsGroupModeDelta(
  playerId: string,
  tournamentGames: any[],
  groups: any[],
  delta: IndividualScores
): Promise<void> {
  // Implementierung für GroupVsGroup-Modus
  // ... (Details je nach Turnier-Struktur)
}

/**
 * 🆕 Speichere Player Scores Global History für Charts (Session)
 */
async function savePlayerScoresGlobalHistory(
  playerId: string,
  sessionId: string,
  sessionData: any,
  sessionDelta: IndividualScores
): Promise<void> {
  try {
    // Lade playerScores Dokument
    const playerScoresRef = db.collection('playerScores').doc(playerId);
    const playerScoresDoc = await playerScoresRef.get();
    
    let playerScores: any;
    if (playerScoresDoc.exists) {
      playerScores = playerScoresDoc.data();
    } else {
      playerScores = {
        global: getDefaultIndividualScores(),
        groups: {},
        tournaments: {},
        partners: [],
        opponents: [],
        lastUpdated: admin.firestore.Timestamp.now()
      };
    }
    
    // Initialisiere history falls nicht vorhanden
    if (!playerScores.global.history) {
      playerScores.global.history = [];
    }
    
    // Erstelle History-Eintrag für jedes Spiel in der Session
    const gameResults = sessionData.gameResults || [];
    const completedGamesRef = db.collection(`groups/${sessionData.groupId}/jassGameSummaries/${sessionId}/completedGames`);
    const completedGamesSnap = await completedGamesRef.get();
    
    // Verarbeite jedes Spiel
    for (let i = 0; i < gameResults.length; i++) {
      const gameResult = gameResults[i];
      const completedGame = completedGamesSnap.docs[i]?.data();
      
      // Kombiniere Daten wie im backfillPlayerScores.ts
      const combinedGame = {
        ...gameResult,
        ...completedGame,
        gameNumber: gameResult.gameNumber
      };
      
      // Bestimme Team des Spielers
      const teams = sessionData.teams;
      if (!teams) continue;
      
      let playerTeam: 'top' | 'bottom' | null = null;
      if (teams.top?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'top';
      } else if (teams.bottom?.players?.some((p: any) => p.playerId === playerId)) {
        playerTeam = 'bottom';
      }
      
      if (!playerTeam) continue;
      
      const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
      
      // Berechne Game-Delta
      const gameDelta = calculateGameDeltaFromCombinedData(combinedGame, playerTeam, opponentTeam);
      
      // Erstelle History-Eintrag
      const gameDate = combinedGame.completedAt?.toDate?.() || combinedGame.timestampCompleted?.toDate?.() || sessionData.completedAt?.toDate?.() || new Date();
      const historyEntry: any = {
        createdAt: gameDate,
        sessionId: sessionId,
        groupId: sessionData.groupId,
        gameNumber: combinedGame.gameNumber,
        stricheDiff: gameDelta.stricheDiff,
        pointsDiff: gameDelta.pointsDiff,
        matschBilanz: gameDelta.matschBilanz,
        schneiderBilanz: gameDelta.schneiderBilanz,
        kontermatschBilanz: gameDelta.kontermatschBilanz,
        weisDifference: gameDelta.weisDifference,
        gamesPlayed: gameDelta.gamesPlayed,
        wins: gameDelta.wins,
        losses: gameDelta.losses,
        draws: gameDelta.draws
      };
      
      // Entferne undefined Werte
      Object.keys(historyEntry).forEach(key => {
        if (historyEntry[key] === undefined) {
          delete historyEntry[key];
        }
      });
      
      playerScores.global.history.push(historyEntry);
    }
    
    // Speichere aktualisierte playerScores
    await playerScoresRef.set(playerScores, { merge: true });
    
    logger.info(`[savePlayerScoresGlobalHistory] ✅ Global History für Spieler ${playerId} aktualisiert`);
  } catch (error) {
    logger.error(`[savePlayerScoresGlobalHistory] Fehler bei Spieler ${playerId}:`, error);
  }
}

/**
 * 🆕 Speichere Player Scores Global History für Charts (Tournament)
 */
async function savePlayerScoresGlobalHistoryForTournament(
  playerId: string,
  tournamentId: string,
  tournamentGames: any[],
  tournamentDelta: IndividualScores
): Promise<void> {
  try {
    // Lade playerScores Dokument
    const playerScoresRef = db.collection('playerScores').doc(playerId);
    const playerScoresDoc = await playerScoresRef.get();
    
    let playerScores: any;
    if (playerScoresDoc.exists) {
      playerScores = playerScoresDoc.data();
    } else {
      playerScores = {
        global: getDefaultIndividualScores(),
        groups: {},
        tournaments: {},
        partners: [],
        opponents: [],
        lastUpdated: admin.firestore.Timestamp.now()
      };
    }
    
    // Initialisiere history falls nicht vorhanden
    if (!playerScores.global.history) {
      playerScores.global.history = [];
    }
    
    // Erstelle History-Eintrag für jedes Turnier-Spiel
    for (const game of tournamentGames) {
      // Bestimme Team des Spielers aus playerDetails
      const playerDetails = game.playerDetails || [];
      const playerDetail = playerDetails.find((p: any) => p.playerId === playerId);
      if (!playerDetail) continue;
      
      // Bestimme Team basierend auf playerDetail
      let playerTeam: 'top' | 'bottom' | null = null;
      let opponentTeam: 'top' | 'bottom' | null = null;
      
      if (playerDetail.team === 'top') {
        playerTeam = 'top';
        opponentTeam = 'bottom';
      } else if (playerDetail.team === 'bottom') {
        playerTeam = 'bottom';
        opponentTeam = 'top';
      }
      
      if (!playerTeam || !opponentTeam) continue;
      
      // Berechne Game-Delta aus Turnier-Spiel-Daten
      const gameDelta = calculateTournamentGameDelta(game, playerTeam, opponentTeam);
      
      // Erstelle History-Eintrag
      const gameDate = game.completedAt?.toDate?.() || game.timestampCompleted?.toDate?.() || new Date();
      const historyEntry: any = {
        createdAt: gameDate,
        sessionId: null, // Turnier-Spiel
        tournamentId: tournamentId,
        gameNumber: game.passeId || game.gameNumber,
        stricheDiff: gameDelta.stricheDiff,
        pointsDiff: gameDelta.pointsDiff,
        matschBilanz: gameDelta.matschBilanz,
        schneiderBilanz: gameDelta.schneiderBilanz,
        kontermatschBilanz: gameDelta.kontermatschBilanz,
        weisDifference: gameDelta.weisDifference,
        gamesPlayed: gameDelta.gamesPlayed,
        wins: gameDelta.wins,
        losses: gameDelta.losses,
        draws: gameDelta.draws
      };
      
      // Entferne undefined Werte
      Object.keys(historyEntry).forEach(key => {
        if (historyEntry[key] === undefined) {
          delete historyEntry[key];
        }
      });
      
      playerScores.global.history.push(historyEntry);
    }
    
    // Speichere aktualisierte playerScores
    await playerScoresRef.set(playerScores, { merge: true });
    
    logger.info(`[savePlayerScoresGlobalHistoryForTournament] ✅ Global History für Spieler ${playerId} in Turnier ${tournamentId} aktualisiert`);
  } catch (error) {
    logger.error(`[savePlayerScoresGlobalHistoryForTournament] Fehler bei Spieler ${playerId}:`, error);
  }
}

/**
 * 🆕 Berechne Game-Delta aus kombinierten Daten (wie im backfillPlayerScores.ts)
 */
function calculateGameDeltaFromCombinedData(game: any, playerTeam: 'top' | 'bottom', opponentTeam: 'top' | 'bottom'): IndividualScores {
  const delta = getDefaultIndividualScores();
  
  try {
    // Spiel-Daten aus kombinierten gameResults + completedGames verwenden
    const playerScore = game[`${playerTeam}Score`] || 0;
    const opponentScore = game[`${opponentTeam}Score`] || 0;
    const finalStriche = game.finalStriche;
    
    if (finalStriche) {
      // Spiel-Gewinner bestimmen
      if (playerScore > opponentScore) {
        delta.wins = 1;
      } else if (playerScore < opponentScore) {
        delta.losses = 1;
      } else {
        delta.draws = 1;
      }
      
      // Striche-Differenz
      const playerStricheTotal = calculateTotalStriche(finalStriche[playerTeam]);
      const opponentStricheTotal = calculateTotalStriche(finalStriche[opponentTeam]);
      delta.stricheDiff = playerStricheTotal - opponentStricheTotal;
      
      // Punkte-Differenz
      delta.pointsDiff = playerScore - opponentScore;
      
      // Games Played (1 Spiel)
      delta.gamesPlayed = 1;
      
      // Event-Counts aus Spiel-Striche berechnen
      const playerStricheRecord = finalStriche[playerTeam];
      const opponentStricheRecord = finalStriche[opponentTeam];
      
      if (playerStricheRecord && opponentStricheRecord) {
        // Events die der Spieler gemacht hat
        const matschEventsMade = playerStricheRecord.matsch || 0;
        const schneiderEventsMade = playerStricheRecord.schneider || 0;
        const kontermatschEventsMade = playerStricheRecord.kontermatsch || 0;
        
        // Events die der Gegner gemacht hat = Events die der Spieler erhalten hat
        const matschEventsReceived = opponentStricheRecord.matsch || 0;
        const schneiderEventsReceived = opponentStricheRecord.schneider || 0;
        const kontermatschEventsReceived = opponentStricheRecord.kontermatsch || 0;
        
        // Berechne Bilanz (Made - Received)
        delta.matschBilanz = matschEventsMade - matschEventsReceived;
        delta.schneiderBilanz = schneiderEventsMade - schneiderEventsReceived;
        delta.kontermatschBilanz = kontermatschEventsMade - kontermatschEventsReceived;
        
        // Legacy-Felder
        delta.matschEvents = matschEventsMade;
        delta.schneiderEvents = schneiderEventsMade;
        delta.kontermatschEvents = kontermatschEventsMade;
      }
      
      // Weis-Points: ECHTE Weis-Punkte aus Spiel-Daten berechnen
      let totalWeisPoints = 0;
      let totalWeisReceived = 0;
      
      if (game.roundHistory && Array.isArray(game.roundHistory)) {
        game.roundHistory.forEach((round: any) => {
          if (round.weisPoints) {
            const playerWeis = round.weisPoints[playerTeam] || 0;
            const opponentWeis = round.weisPoints[opponentTeam] || 0;
            totalWeisPoints += playerWeis;
            totalWeisReceived += opponentWeis;
          }
        });
      }
      
      delta.totalWeisPoints = totalWeisPoints;
      delta.totalWeisReceived = totalWeisReceived;
      delta.weisDifference = delta.totalWeisPoints - delta.totalWeisReceived;
    }
    
    return delta;
  } catch (error) {
    logger.error(`[calculateGameDeltaFromCombinedData] Fehler:`, error);
    return delta;
  }
}

/**
 * 🆕 Berechne Turnier-Game-Delta (wie im backfillPlayerScores.ts)
 */
function calculateTournamentGameDelta(game: any, playerTeam: 'top' | 'bottom', opponentTeam: 'top' | 'bottom'): IndividualScores {
  const delta = getDefaultIndividualScores();
  
  try {
    // Spiel-Daten aus Turnier-Spiel verwenden
    const playerScore = game.finalScores?.[playerTeam] || 0;
    const opponentScore = game.finalScores?.[opponentTeam] || 0;
    const finalStriche = game.finalStriche;
    
    if (finalStriche) {
      // Spiel-Gewinner bestimmen
      if (playerScore > opponentScore) {
        delta.wins = 1;
      } else if (playerScore < opponentScore) {
        delta.losses = 1;
      } else {
        delta.draws = 1;
      }
      
      // Striche-Differenz
      const playerStricheTotal = calculateTotalStriche(finalStriche[playerTeam]);
      const opponentStricheTotal = calculateTotalStriche(finalStriche[opponentTeam]);
      delta.stricheDiff = playerStricheTotal - opponentStricheTotal;
      
      // Punkte-Differenz
      delta.pointsDiff = playerScore - opponentScore;
      
      // Games Played (1 Spiel)
      delta.gamesPlayed = 1;
      
      // Event-Counts aus Spiel-Striche berechnen
      const playerStricheRecord = finalStriche[playerTeam];
      const opponentStricheRecord = finalStriche[opponentTeam];
      
      if (playerStricheRecord && opponentStricheRecord) {
        // Events die der Spieler gemacht hat
        const matschEventsMade = playerStricheRecord.matsch || 0;
        const schneiderEventsMade = playerStricheRecord.schneider || 0;
        const kontermatschEventsMade = playerStricheRecord.kontermatsch || 0;
        
        // Events die der Gegner gemacht hat = Events die der Spieler erhalten hat
        const matschEventsReceived = opponentStricheRecord.matsch || 0;
        const schneiderEventsReceived = opponentStricheRecord.schneider || 0;
        const kontermatschEventsReceived = opponentStricheRecord.kontermatsch || 0;
        
        // Berechne Bilanz (Made - Received)
        delta.matschBilanz = matschEventsMade - matschEventsReceived;
        delta.schneiderBilanz = schneiderEventsMade - schneiderEventsReceived;
        delta.kontermatschBilanz = kontermatschEventsMade - kontermatschEventsReceived;
        
        // Legacy-Felder
        delta.matschEvents = matschEventsMade;
        delta.schneiderEvents = schneiderEventsMade;
        delta.kontermatschEvents = kontermatschEventsMade;
      }
      
      // Weis-Points: Schätzung aus teamScoresPasse (10% Regel)
      const playerScoreFromPasse = game.teamScoresPasse?.[playerTeam] || 0;
      const opponentScoreFromPasse = game.teamScoresPasse?.[opponentTeam] || 0;
      
      const totalWeisPoints = Math.round(playerScoreFromPasse * 0.1);
      const totalWeisReceived = Math.round(opponentScoreFromPasse * 0.1);
      
      delta.totalWeisPoints = totalWeisPoints;
      delta.totalWeisReceived = totalWeisReceived;
      delta.weisDifference = delta.totalWeisPoints - delta.totalWeisReceived;
    }
    
    return delta;
  } catch (error) {
    logger.error(`[calculateTournamentGameDelta] Fehler:`, error);
    return delta;
  }
}

// ===== EXPORTS =====

// Export-Deklarationen entfernt (Funktionen sind bereits als export async function deklariert)