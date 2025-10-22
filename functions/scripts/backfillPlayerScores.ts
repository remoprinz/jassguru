import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Interfaces
interface IndividualScores {
  // Grundlegende Statistiken
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  sessionsDraw: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  
  // Differenzen
  stricheDiff: number;
  pointsDiff: number;
  
  // ✅ NEUE EVENT-METRIKEN
  matschEventsMade: number;
  matschEventsReceived: number;
  matschBilanz: number;
  schneiderEventsMade: number;
  schneiderEventsReceived: number;
  schneiderBilanz: number;
  kontermatschEventsMade: number;
  kontermatschEventsReceived: number;
  kontermatschBilanz: number;
  
  // ✅ WEIS-METRIKEN
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  
  // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
  matschEvents: number;
  schneiderEvents: number;
  kontermatschEvents: number;
  
  // 🆕 HISTORY-EINTRÄGE für Charts
  history?: any[];
}

interface PlayerScores {
  global: IndividualScores;
  groups: { [groupId: string]: IndividualScores };
  partners: { [partnerId: string]: PartnerStats };
  opponents: { [opponentId: string]: OpponentStats };
  lastUpdated: admin.firestore.Timestamp;
}

interface PartnerStats {
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
}

interface OpponentStats {
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
}

/**
 * 🎯 Erstelle Standard IndividualScores
 */
function getDefaultIndividualScores(): IndividualScores {
  return {
    // Grundlegende Statistiken
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    
    // Differenzen
    stricheDiff: 0,
    pointsDiff: 0,
    
    // ✅ NEUE EVENT-METRIKEN
    matschEventsMade: 0,
    matschEventsReceived: 0,
    matschBilanz: 0,
    schneiderEventsMade: 0,
    schneiderEventsReceived: 0,
    schneiderBilanz: 0,
    kontermatschEventsMade: 0,
    kontermatschEventsReceived: 0,
    kontermatschBilanz: 0,
    
    // ✅ WEIS-METRIKEN
    totalWeisPoints: 0,
    totalWeisReceived: 0,
    weisDifference: 0,
    
    // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
    matschEvents: 0,
    schneiderEvents: 0,
    kontermatschEvents: 0,
    
    // 🆕 HISTORY-EINTRÄGE für Charts
    history: []
  };
}

/**
 * 🎯 Hauptfunktion für Backfill Player Scores
 */
export async function backfillPlayerScores(
  groupId?: string,
  playerId?: string,
  dryRun: boolean = false
): Promise<void> {
    logger.info(`[backfillPlayerScores] 🚀 Starte Backfill für Player Scores`);
    logger.info(`[backfillPlayerScores] Gruppe: ${groupId || 'ALLE'}, Spieler: ${playerId || 'ALLE'}, DryRun: ${dryRun}`);
    
  try {
    let playersToProcess: string[] = [];
    
    if (playerId) {
      // Einzelner Spieler
      playersToProcess = [playerId];
    } else if (groupId) {
      // Alle Spieler einer Gruppe
      const groupDoc = await db.collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        throw new Error(`Gruppe ${groupId} nicht gefunden`);
      }
      const groupData = groupDoc.data();
      playersToProcess = groupData?.memberPlayerIds || [];
    } else {
      // Alle Spieler aus der players Collection
      const playersSnap = await db.collection('players').get();
      playersToProcess = playersSnap.docs.map(doc => doc.id);
      logger.info(`[backfillPlayerScores] 📊 ${playersToProcess.length} Spieler aus players Collection gefunden`);
    }
    
    logger.info(`[backfillPlayerScores] 📊 ${playersToProcess.length} Spieler gefunden`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < playersToProcess.length; i++) {
      const currentPlayerId = playersToProcess[i];
      logger.info(`[backfillPlayerScores] 🔄 Verarbeite Spieler ${currentPlayerId} (${i + 1}/${playersToProcess.length})`);
      
      try {
        await backfillPlayerScoresForPlayer(currentPlayerId, dryRun);
        successCount++;
      } catch (error) {
        logger.error(`[backfillPlayerScores] ❌ Fehler bei Spieler ${currentPlayerId}:`, error);
        errorCount++;
      }
    }
    
    logger.info(`[backfillPlayerScores] ✅ Backfill abgeschlossen: ${successCount} erfolgreich, ${errorCount} Fehler`);
    
  } catch (error) {
    logger.error(`[backfillPlayerScores] ❌ Kritischer Fehler:`, error);
    throw error;
  }
}

/**
 * 🎯 Backfill Player Scores für einen einzelnen Spieler
 */
async function backfillPlayerScoresForPlayer(playerId: string, dryRun: boolean): Promise<void> {
  logger.info(`[backfillPlayerScoresForPlayer] 🔄 Verarbeite Spieler ${playerId}`);
  
  try {
    // Lade alle Sessions des Spielers
    const sessions = await getAllSessionsForPlayer(playerId);
    logger.info(`[backfillPlayerScoresForPlayer] 📊 ${sessions.length} Sessions gefunden für Spieler ${playerId}`);
    
    // Initialisiere Player Scores
    const playerScores: PlayerScores = {
      global: getDefaultIndividualScores(),
      groups: {},
      partners: {},
      opponents: {},
      lastUpdated: admin.firestore.FieldValue.serverTimestamp() as any
    };
    
    // 🆕 HISTORY-EINTRÄGE für Charts
    const historyEntries: any[] = [];
    
    // Verarbeite jede Session
    for (const session of sessions) {
      await processSessionForPlayer(playerId, session, playerScores, historyEntries);
    }
    
    // Speichere Player Scores (außer bei Dry Run)
    if (!dryRun) {
      // 🆕 HISTORY-EINTRÄGE hinzufügen
      playerScores.global.history = historyEntries;
      
      await db.collection('playerScores').doc(playerId).set(playerScores);
      logger.info(`[backfillPlayerScoresForPlayer] ✅ Player Scores mit ${historyEntries.length} History-Einträgen gespeichert für Spieler ${playerId}`);
    } else {
      logger.info(`[backfillPlayerScoresForPlayer] 🔍 DryRun: Scores mit ${historyEntries.length} History-Einträgen würden gespeichert werden für Spieler ${playerId}`);
    }
    
  } catch (error) {
    logger.error(`[backfillPlayerScoresForPlayer] ❌ Fehler bei Spieler ${playerId}:`, error);
    throw error;
  }
}

/**
 * 🎯 Lade alle Sessions für einen Spieler (inklusive Turnier-Sessions)
 */
async function getAllSessionsForPlayer(playerId: string): Promise<any[]> {
    const sessions: any[] = [];
    
  // Lade normale Sessions aus allen Gruppen
    const groupsSnap = await db.collection('groups').get();
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
        .where('participantPlayerIds', 'array-contains', playerId)
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
}

/**
 * 🎯 Verarbeite eine Session für einen Spieler
 */
async function processSessionForPlayer(
  playerId: string,
  session: any,
  playerScores: PlayerScores,
  historyEntries: any[]
): Promise<void> {
  try {
    const isTournament = !!(session?.isTournamentSession || session?.tournamentId || session?.tournamentInstanceId);
    
    if (isTournament) {
      // 🏆 TURNIER-SESSION: Verarbeite über einzelne Spiele
      await processTournamentSessionForPlayer(playerId, session, playerScores, historyEntries);
    } else {
      // 🎮 NORMALE SESSION: Verarbeite über Session-Daten
      await processNormalSessionForPlayer(playerId, session, playerScores, historyEntries);
    }
    
  } catch (error) {
    logger.error(`[processSessionForPlayer] Fehler bei Session ${session.sessionId}:`, error);
  }
}

/**
 * 🎮 Verarbeite normale Session für einen Spieler (über einzelne Spiele aus gameResults + completedGames)
 */
async function processNormalSessionForPlayer(
  playerId: string,
  session: any,
  playerScores: PlayerScores,
  historyEntries: any[]
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
    
    // 🆕 VERARBEITE JEDES SPIEL AUS gameResults (für Punkte/Striche) + completedGames (für Weis-Punkte)
    const gameResults = session.gameResults || [];
    const completedGamesSnap = await db.collection(`groups/${session.groupId}/jassGameSummaries/${session.sessionId}/completedGames`).get();
    
    logger.info(`[processNormalSessionForPlayer] ${gameResults.length} Spiele aus gameResults, ${completedGamesSnap.docs.length} Spiele aus completedGames für Session ${session.sessionId}`);
    
    // Verarbeite jedes einzelne Spiel (kombiniere gameResults + completedGames)
    for (let i = 0; i < gameResults.length; i++) {
      const gameResult = gameResults[i];
      const completedGame = completedGamesSnap.docs[i]?.data();
      
      // Kombiniere Daten: gameResults für Punkte/Striche, completedGames für Weis-Punkte
      const combinedGame = {
        ...gameResult,
        ...completedGame, // Weis-Punkte aus completedGames überschreiben
        gameNumber: gameResult.gameNumber // gameResults hat die korrekte gameNumber
      };
      
      await processNormalGameForPlayer(playerId, combinedGame, session, playerScores, historyEntries, playerTeam, opponentTeam);
    }
    
    // Aktualisiere Partner/Gegner-Statistiken (Session-Level)
    await updatePartnerOpponentStatsForSession(playerScores, session, playerId, playerTeam, opponentTeam);
    
  } catch (error) {
    logger.error(`[processNormalSessionForPlayer] Fehler bei Session ${session.sessionId}:`, error);
  }
}

/**
 * 🎯 Verarbeite ein einzelnes normales Spiel für einen Spieler
 */
async function processNormalGameForPlayer(
  playerId: string,
  game: any,
  session: any,
  playerScores: PlayerScores,
  historyEntries: any[],
  playerTeam: 'top' | 'bottom',
  opponentTeam: 'top' | 'bottom'
): Promise<void> {
  try {
    // Berechne Game-Delta aus normalen Spiel-Daten
    const gameDelta = calculateNormalGameDelta(game, playerTeam, opponentTeam);
    
    // Aktualisiere Global Scores
    updateScores(playerScores.global, gameDelta);
    
    // Aktualisiere Gruppen-Scores
    if (!playerScores.groups[session.groupId]) {
      playerScores.groups[session.groupId] = getDefaultIndividualScores();
    }
    updateScores(playerScores.groups[session.groupId], gameDelta);
    
    // 🆕 HISTORY-EINTRAG für normales Spiel erstellen
    const gameDate = game.completedAt?.toDate?.() || game.timestampCompleted?.toDate?.() || session.completedAt?.toDate?.() || new Date();
    const historyEntry: any = {
      createdAt: gameDate,
      sessionId: session.sessionId,
      groupId: session.groupId,
      gameNumber: game.gameNumber, // 🎯 Für gameResults: gameNumber aus dem Spiel
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
    
    historyEntries.push(historyEntry);
    
  } catch (error) {
    logger.error(`[processNormalGameForPlayer] Fehler bei Game ${game.gameNumber}:`, error);
  }
}

/**
 * 🏆 Verarbeite Turnier-Session für einen Spieler (über einzelne Spiele)
 */
async function processTournamentSessionForPlayer(
  playerId: string,
  session: any,
  playerScores: PlayerScores,
  historyEntries: any[]
): Promise<void> {
  try {
    const tournamentId = session.tournamentId || session.tournamentInstanceId;
    if (!tournamentId) {
      logger.warn(`[processTournamentSessionForPlayer] Keine Tournament ID für Session ${session.sessionId}`);
      return;
    }
    
    // Lade alle Turnier-Spiele
    const gamesSnap = await db.collection(`tournaments/${tournamentId}/games`).get();
    logger.info(`[processTournamentSessionForPlayer] ${gamesSnap.docs.length} Turnier-Spiele gefunden für Session ${session.sessionId}`);
    
    // Verarbeite jedes Turnier-Spiel
    for (const gameDoc of gamesSnap.docs) {
      const game = gameDoc.data();
      await processTournamentGameForPlayer(playerId, game, playerScores, historyEntries, tournamentId);
    }
    
  } catch (error) {
    logger.error(`[processTournamentSessionForPlayer] Fehler bei Session ${session.sessionId}:`, error);
  }
}

/**
 * 🎯 Verarbeite ein einzelnes Turnier-Spiel für einen Spieler
 */
async function processTournamentGameForPlayer(
  playerId: string,
  game: any,
  playerScores: PlayerScores,
  historyEntries: any[],
  tournamentId: string
): Promise<void> {
  try {
    // Bestimme Team des Spielers aus playerDetails
    const playerDetails = game.playerDetails || [];
    const playerDetail = playerDetails.find((p: any) => p.playerId === playerId);
    if (!playerDetail) return;
    
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
    
    if (!playerTeam || !opponentTeam) return;
    
    // Berechne Game-Delta aus Turnier-Spiel-Daten
    const gameDelta = calculateTournamentGameDelta(game, playerTeam, opponentTeam);
    
    // Aktualisiere Global Scores
    updateScores(playerScores.global, gameDelta);
    
    // 🆕 HISTORY-EINTRAG für Turnier-Spiel erstellen
    const gameDate = game.completedAt?.toDate?.() || game.timestampCompleted?.toDate?.() || new Date();
    const historyEntry: any = {
      createdAt: gameDate,
      sessionId: null, // Turnier-Spiel
      tournamentId: tournamentId, // 🎯 Korrekte tournamentId verwenden
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
    
    historyEntries.push(historyEntry);
    
  } catch (error) {
    logger.error(`[processTournamentGameForPlayer] Fehler bei Game ${game.passeId}:`, error);
  }
}

/**
 * 🎯 Aktualisiere Scores mit Delta
 */
function updateScores(scores: IndividualScores, delta: IndividualScores): void {
  scores.sessionsPlayed += delta.sessionsPlayed;
  scores.sessionsWon += delta.sessionsWon;
  scores.sessionsLost += delta.sessionsLost;
  scores.sessionsDraw += delta.sessionsDraw;
  scores.gamesPlayed += delta.gamesPlayed;
  scores.wins += delta.wins;
  scores.losses += delta.losses;
  scores.draws += delta.draws;
  scores.stricheDiff += delta.stricheDiff;
  scores.pointsDiff += delta.pointsDiff;
  
  // ✅ NEUE EVENT-METRIKEN
  scores.matschEventsMade += delta.matschEventsMade;
  scores.matschEventsReceived += delta.matschEventsReceived;
  scores.matschBilanz += delta.matschBilanz;
  scores.schneiderEventsMade += delta.schneiderEventsMade;
  scores.schneiderEventsReceived += delta.schneiderEventsReceived;
  scores.schneiderBilanz += delta.schneiderBilanz;
  scores.kontermatschEventsMade += delta.kontermatschEventsMade;
  scores.kontermatschEventsReceived += delta.kontermatschEventsReceived;
  scores.kontermatschBilanz += delta.kontermatschBilanz;
  
  // ✅ WEIS-METRIKEN
  scores.totalWeisPoints += delta.totalWeisPoints;
  scores.totalWeisReceived += delta.totalWeisReceived;
  scores.weisDifference += delta.weisDifference;
  
  // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
  scores.matschEvents += delta.matschEvents;
  scores.schneiderEvents += delta.schneiderEvents;
  scores.kontermatschEvents += delta.kontermatschEvents;
}

/**
 * 🎯 Berechne Delta aus normalen Spiel-Daten (aus gameResults + completedGames kombiniert)
 */
function calculateNormalGameDelta(game: any, playerTeam: 'top' | 'bottom', opponentTeam: 'top' | 'bottom'): IndividualScores {
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
        delta.matschEventsMade = playerStricheRecord.matsch || 0;
        delta.schneiderEventsMade = playerStricheRecord.schneider || 0;
        delta.kontermatschEventsMade = playerStricheRecord.kontermatsch || 0;
        
        // Events die der Gegner gemacht hat = Events die der Spieler erhalten hat
        delta.matschEventsReceived = opponentStricheRecord.matsch || 0;
        delta.schneiderEventsReceived = opponentStricheRecord.schneider || 0;
        delta.kontermatschEventsReceived = opponentStricheRecord.kontermatsch || 0;
        
        // Berechne Bilanz (Made - Received)
        delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
        delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
        delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
        
        // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
        delta.matschEvents = delta.matschEventsMade;
        delta.schneiderEvents = delta.schneiderEventsMade;
        delta.kontermatschEvents = delta.kontermatschEventsMade;
      }
      
      // Weis-Points: ECHTE Weis-Punkte aus Spiel-Daten berechnen
      // 🎯 KEINE SCHÄTZUNG - echte Weis-Punkte aus roundHistory pro Spiel
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
    logger.error(`[calculateNormalGameDelta] Fehler:`, error);
    return delta;
  }
}


/**
 * 🎯 Berechne Delta aus Turnier-Spiel-Daten
 */
function calculateTournamentGameDelta(game: any, playerTeam: 'top' | 'bottom', opponentTeam: 'top' | 'bottom'): IndividualScores {
  const delta = getDefaultIndividualScores();
  
  try {
    // Team Scores aus Turnier-Spiel
    const teamScoresPasse = game.teamScoresPasse;
    const teamStrichePasse = game.teamStrichePasse;
    
    if (teamScoresPasse && teamStrichePasse) {
      // Session-Gewinner bestimmen
      const playerScore = teamScoresPasse[playerTeam] || 0;
      const opponentScore = teamScoresPasse[opponentTeam] || 0;
      
      if (playerScore > opponentScore) {
        delta.sessionsWon = 1;
      } else if (playerScore < opponentScore) {
        delta.sessionsLost = 1;
      } else {
        delta.sessionsDraw = 1;
      }
      
      // Striche-Differenz
      const playerStricheTotal = calculateTotalStriche(teamStrichePasse[playerTeam]);
      const opponentStricheTotal = calculateTotalStriche(teamStrichePasse[opponentTeam]);
      delta.stricheDiff = playerStricheTotal - opponentStricheTotal;
      
      // Punkte-Differenz
      delta.pointsDiff = playerScore - opponentScore;
      
      // Games Played (1 Spiel pro Turnier-Passe)
      delta.gamesPlayed = 1;
      
      // Event-Counts aus Team Striche berechnen (da eventCounts nicht vorhanden)
      const playerStricheRecord = teamStrichePasse[playerTeam];
      const opponentStricheRecord = teamStrichePasse[opponentTeam];
      
      if (playerStricheRecord && opponentStricheRecord) {
        // Events die der Spieler gemacht hat
        delta.matschEventsMade = playerStricheRecord.matsch || 0;
        delta.schneiderEventsMade = playerStricheRecord.schneider || 0;
        delta.kontermatschEventsMade = playerStricheRecord.kontermatsch || 0;
        
        // Events die der Gegner gemacht hat = Events die der Spieler erhalten hat
        delta.matschEventsReceived = opponentStricheRecord.matsch || 0;
        delta.schneiderEventsReceived = opponentStricheRecord.schneider || 0;
        delta.kontermatschEventsReceived = opponentStricheRecord.kontermatsch || 0;
        
        // Berechne Bilanz (Made - Received)
        delta.matschBilanz = delta.matschEventsMade - delta.matschEventsReceived;
        delta.schneiderBilanz = delta.schneiderEventsMade - delta.schneiderEventsReceived;
        delta.kontermatschBilanz = delta.kontermatschEventsMade - delta.kontermatschEventsReceived;
        
        // 🔄 BACKWARDS COMPATIBILITY (alte Felder)
        delta.matschEvents = delta.matschEventsMade;
        delta.schneiderEvents = delta.schneiderEventsMade;
        delta.kontermatschEvents = delta.kontermatschEventsMade;
      }
      
      // Weis-Points aus Team Scores berechnen (da Player Details nicht korrekt sind)
      // Für Turnier-Spiele nehmen wir an, dass Weis-Punkte proportional zu den Scores sind
      // Das ist eine Vereinfachung, da die echten Weis-Punkte nicht verfügbar sind
      // 🎯 AUF VOLLE ZAHLEN RUNDEN für Weis-Punkte
      delta.totalWeisPoints = Math.round(Math.max(0, playerScore * 0.1)); // 10% der Punkte als Weis-Punkte
      delta.totalWeisReceived = Math.round(Math.max(0, opponentScore * 0.1));
      delta.weisDifference = delta.totalWeisPoints - delta.totalWeisReceived;
    }
    
    return delta;
    
  } catch (error) {
    logger.error(`[calculateTournamentGameDelta] Fehler:`, error);
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
 * 🎯 Aktualisiere Partner/Gegner-Statistiken für eine Session
 */
async function updatePartnerOpponentStatsForSession(
  playerScores: PlayerScores,
  session: any,
  playerId: string,
  playerTeam: 'top' | 'bottom',
  opponentTeam: 'top' | 'bottom'
): Promise<void> {
  try {
    const teams = session.teams;
    if (!teams) return;
    
    const playerTeamData = teams[playerTeam];
    const opponentTeamData = teams[opponentTeam];
    
    if (!playerTeamData?.players || !opponentTeamData?.players) return;
    
    // Partner-Statistiken aktualisieren
    for (const partner of playerTeamData.players) {
      if (partner.playerId === playerId) continue;
      
      if (!playerScores.partners[partner.playerId]) {
        playerScores.partners[partner.playerId] = {
          partnerId: partner.playerId,
          partnerDisplayName: partner.displayName,
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
          totalWeisPointsWith: 0,
          totalWeisReceivedWith: 0,
          weisDifferenceWith: 0,
          matschEventsMadeWith: 0,
          matschEventsReceivedWith: 0,
          matschBilanz: 0,
          schneiderEventsMadeWith: 0,
          schneiderEventsReceivedWith: 0,
          schneiderBilanz: 0,
          kontermatschEventsMadeWith: 0,
          kontermatschEventsReceivedWith: 0,
          kontermatschBilanz: 0
        };
      }
      
      const partnerStats = playerScores.partners[partner.playerId];
      partnerStats.sessionsPlayedWith += 1;
      
      // Session-Ergebnis
      const finalScores = session.finalScores;
      if (finalScores) {
        const playerScore = finalScores[playerTeam] || 0;
        const opponentScore = finalScores[opponentTeam] || 0;
        
        if (playerScore > opponentScore) {
          partnerStats.sessionsWonWith += 1;
        } else if (playerScore < opponentScore) {
          partnerStats.sessionsLostWith += 1;
        } else {
          partnerStats.sessionsDrawWith += 1;
        }
      }
      
      // Games Played
      partnerStats.gamesPlayedWith += session.gamesPlayed || 0;
      
      // Striche und Punkte Differenz
      const finalStriche = session.finalStriche;
      if (finalStriche) {
        const playerStriche = calculateTotalStriche(finalStriche[playerTeam]);
        const opponentStriche = calculateTotalStriche(finalStriche[opponentTeam]);
        partnerStats.totalStricheDifferenceWith += playerStriche - opponentStriche;
      }
      
      if (finalScores) {
        const playerScore = finalScores[playerTeam] || 0;
        const opponentScore = finalScores[opponentTeam] || 0;
        partnerStats.totalPointsDifferenceWith += playerScore - opponentScore;
      }
    }
    
    // Gegner-Statistiken aktualisieren
    for (const opponent of opponentTeamData.players) {
      if (!playerScores.opponents[opponent.playerId]) {
        playerScores.opponents[opponent.playerId] = {
          opponentId: opponent.playerId,
          opponentDisplayName: opponent.displayName,
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
          totalWeisPointsAgainst: 0,
          totalWeisReceivedAgainst: 0,
          weisDifferenceAgainst: 0,
          matschEventsMadeAgainst: 0,
          matschEventsReceivedAgainst: 0,
          matschBilanz: 0,
          schneiderEventsMadeAgainst: 0,
          schneiderEventsReceivedAgainst: 0,
          schneiderBilanz: 0,
          kontermatschEventsMadeAgainst: 0,
          kontermatschEventsReceivedAgainst: 0,
          kontermatschBilanz: 0
        };
      }
      
      const opponentStats = playerScores.opponents[opponent.playerId];
      opponentStats.sessionsPlayedAgainst += 1;
      
      // Session-Ergebnis
      const finalScores = session.finalScores;
      if (finalScores) {
        const playerScore = finalScores[playerTeam] || 0;
        const opponentScore = finalScores[opponentTeam] || 0;
        
        if (playerScore > opponentScore) {
          opponentStats.sessionsWonAgainst += 1;
        } else if (playerScore < opponentScore) {
          opponentStats.sessionsLostAgainst += 1;
        } else {
          opponentStats.sessionsDrawAgainst += 1;
        }
      }
      
      // Games Played
      opponentStats.gamesPlayedAgainst += session.gamesPlayed || 0;
      
      // Striche und Punkte Differenz
      const finalStriche = session.finalStriche;
      if (finalStriche) {
        const playerStriche = calculateTotalStriche(finalStriche[playerTeam]);
        const opponentStriche = calculateTotalStriche(finalStriche[opponentTeam]);
        opponentStats.totalStricheDifferenceAgainst += playerStriche - opponentStriche;
      }
      
      if (finalScores) {
        const playerScore = finalScores[playerTeam] || 0;
        const opponentScore = finalScores[opponentTeam] || 0;
        opponentStats.totalPointsDifferenceAgainst += playerScore - opponentScore;
      }
    }
    
  } catch (error) {
    logger.error(`[updatePartnerOpponentStatsForSession] Fehler:`, error);
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const groupId = args.find(arg => arg.startsWith('--groupId='))?.split('=')[1];
  const playerId = args.find(arg => arg.startsWith('--playerId='))?.split('=')[1];
  const dryRun = args.includes('--dryRun=true');
  
  backfillPlayerScores(groupId, playerId, dryRun)
    .then(() => {
      logger.info(`✅ Backfill erfolgreich abgeschlossen`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Backfill fehlgeschlagen:`, error);
      process.exit(1);
    });
}