import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { GroupComputedStats, initialGroupComputedStats, GroupStatHighlightPlayer, GroupStatHighlightTeam } from "./models/group-stats.model";

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const GROUPS_COLLECTION = 'groups';

// Interface für Gruppendaten
interface GroupData {
  id: string;
  name?: string;
  mainLocationZip?: string;
  players: { [playerDocId: string]: { displayName: string; email?: string; joinedAt?: any } };
  adminIds?: string[];
  strokeSettings?: { kontermatsch?: number; schneider?: number; [key: string]: any };
}

// ✅ OPTIMIERT: ProcessableGameData Interface entfernt - nicht mehr benötigt durch Session-Level Optimierung


// ✅ VEREINFACHT: Extrahiere Player-Doc-IDs direkt aus participantPlayerIds
function extractPlayerDocIdsFromSessionSimple(sessionData: any): string[] {
  // Verwende nur participantPlayerIds - das sind die korrekten Player-Doc-IDs
  if (sessionData.participantPlayerIds && Array.isArray(sessionData.participantPlayerIds)) {
    return sessionData.participantPlayerIds.filter((id: string) => id && typeof id === 'string');
  }
  
  logger.warn('Session missing participantPlayerIds, falling back to empty array');
  return [];
}

// ✅ VEREINFACHT: Extrahiere Team-Zuordnungen direkt als top/bottom
function extractTeamsWithPlayerDocIds(sessionData: any): { top: string[], bottom: string[] } {
  const top: string[] = [];
  const bottom: string[] = [];
  
  const sessionDocIdForLogging = sessionData.id || 'unknown';

  // Extrahiere direkt aus teams-Struktur mit top/bottom
  if (sessionData.teams?.top?.players) {
    sessionData.teams.top.players.forEach((player: any) => {
      if (player.playerId && typeof player.playerId === 'string') {
        top.push(player.playerId);
      } else {
        logger.warn(`Invalid or missing playerId in top team for session ${sessionDocIdForLogging}`);
      }
    });
  }
  
  if (sessionData.teams?.bottom?.players) {
    sessionData.teams.bottom.players.forEach((player: any) => {
      if (player.playerId && typeof player.playerId === 'string') {
        bottom.push(player.playerId);
      } else {
        logger.warn(`Invalid or missing playerId in bottom team for session ${sessionDocIdForLogging}`);
      }
    });
  }
  
  // Strikte Validierung: Sicherstellen, dass die extrahierten IDs gültige Teilnehmer sind.
  const allTeamPlayerIds = [...top, ...bottom];
  const validParticipantPlayerIds = sessionData.participantPlayerIds || [];
  for (const id of allTeamPlayerIds) {
    if (!validParticipantPlayerIds.includes(id)) {
      logger.error(`[groupStatsCalculator] FATAL DATA INCONSISTENCY in session ${sessionDocIdForLogging}: Team structure contains an ID '${id}' which is not in participantPlayerIds. This must be fixed in the database.`, {
        participantPlayerIds: validParticipantPlayerIds,
        teams: sessionData.teams
      });
    }
  }
  
  return { 
    top: top.sort(), 
    bottom: bottom.sort() 
  };
}
  
// ✅ VEREINFACHT: Bestimme Team eines Player Doc ID als top/bottom
function getPlayerTeamAssignment(playerDocId: string, sessionData: any): 'top' | 'bottom' | null {
  const teams = extractTeamsWithPlayerDocIds(sessionData);
  
  if (teams.top.includes(playerDocId)) {
    return 'top';
  }
  
  if (teams.bottom.includes(playerDocId)) {
    return 'bottom';
  }
  
  return null;
}

// NEU: Erweiterte Validierungsfunktionen
function validateSessionDataEnhanced(sessionData: any): boolean {
  if (!sessionData.participantPlayerIds || !Array.isArray(sessionData.participantPlayerIds)) {
    logger.warn(`Session validation failed: missing or invalid participantPlayerIds`);
    return false;
  }
  
  if (sessionData.participantPlayerIds.length !== 4) {
    logger.warn(`Session validation failed: expected 4 participants, got ${sessionData.participantPlayerIds.length}`);
    return false;
  }
  
  return true;
}

function validateCalculatedStats(stats: GroupComputedStats): boolean {
  const errors: string[] = [];
  
  // Basis-Validierungen
  if (stats.sessionCount < 0) errors.push('Negative sessionCount');
  if (stats.gameCount < 0) errors.push('Negative gameCount');
  if (stats.memberCount < 0) errors.push('Negative memberCount');
  if (stats.totalPlayTimeSeconds < 0) errors.push('Negative totalPlayTimeSeconds');
  
  // Logische Validierungen
  if (stats.gameCount > 0 && stats.sessionCount === 0) {
    errors.push('Games exist but no sessions');
  }
  
  if (stats.sessionCount > 0 && stats.gameCount === 0) {
    errors.push('Sessions exist but no games');
  }
  
  // Durchschnittswerte
  if (stats.avgGameDurationSeconds < 0) {
    errors.push('Negative average game duration');
  }
  
  if (stats.avgSessionDurationSeconds < 0) {
    errors.push('Negative average session duration');
  }
  
  if (errors.length > 0) {
    logger.error('Statistics validation failed:', errors);
    return false;
  }
  
  return true;
}

function logStatisticsCalculation(groupId: string, stats: GroupComputedStats, rawDataSummary: any) {
  logger.info(`[STATS_CALCULATION] Group ${groupId} Summary:`, {
    sessionsFound: rawDataSummary.sessionsCount,
    gamesFound: rawDataSummary.gamesCount,
    roundsFound: rawDataSummary.roundsCount,
    calculatedSessions: stats.sessionCount,
    calculatedGames: stats.gameCount,
    calculatedMembers: stats.memberCount,
    calculatedPlayTime: stats.totalPlayTimeSeconds,
    playerStatsCount: stats.playerWithMostGames?.length || 0,
    teamStatsCount: stats.teamWithHighestWinRateSession?.length || 0,
    trumpfStatsCount: Object.keys(stats.trumpfStatistik || {}).length,
    dataQualityIssues: rawDataSummary.dataErrors || 0
  });
}

export async function calculateGroupStatisticsInternal(groupId: string): Promise<GroupComputedStats> {
    logger.info(`[calculateGroupStatisticsInternal] Starting calculation for groupId: ${groupId}`);
  
    const calculatedStats: GroupComputedStats = JSON.parse(JSON.stringify(initialGroupComputedStats));
    calculatedStats.groupId = groupId;
    calculatedStats.lastUpdateTimestamp = admin.firestore.Timestamp.now();

    try {
        // Schritt 1: Gruppendetails laden
        const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
        if (!groupDoc.exists) {
            logger.warn(`[calculateGroupStatisticsInternal] Group ${groupId} not found.`);
            return calculatedStats; 
        }
    
    const groupData = groupDoc.data() as GroupData;
        groupData.id = groupDoc.id;

    // Gruppenmitglieder
    const groupMemberPlayerDocIds = new Set<string>(Object.keys(groupData.players || {}));
        calculatedStats.memberCount = groupMemberPlayerDocIds.size;
    calculatedStats.hauptspielortName = groupData.mainLocationZip || null;

        // Schritt 2: Alle abgeschlossenen Sessions der Gruppe laden
        const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
            .where("groupId", "==", groupId)
            .where("status", "==", "completed")
            .orderBy("startedAt", "asc")
            .get();

        if (sessionsSnap.empty) {
            logger.info(`[calculateGroupStatisticsInternal] No completed sessions found for group ${groupId}.`);
            return calculatedStats;
        }

        calculatedStats.sessionCount = sessionsSnap.docs.length;

    // Initialisiere Variablen für Aggregationen
        let totalPlayTimeMillis = 0;
    let firstJassTimestamp: admin.firestore.Timestamp | null = null;
    let lastJassTimestamp: admin.firestore.Timestamp | null = null;
    let totalRounds = 0;
    let totalRoundDurationMillis = 0;
    let totalMatschCount = 0;

    // ✅ OPTIMIERT: allGames Array entfernt - verwende nur noch Session-Level Daten
    const playerLastActivity = new Map<string, admin.firestore.Timestamp>();
    const playerGameCounts = new Map<string, number>();
    const playerPointsStats = new Map<string, { made: number; received: number; games: number }>();
    const playerStricheStats = new Map<string, { made: number; received: number; games: number }>();
    const playerSessionStats = new Map<string, { wins: number; losses: number; ties: number; sessions: number }>();
    const playerGameStats = new Map<string, { wins: number; losses: number; games: number }>();
    const playerMatschStats = new Map<string, { made: number; received: number; games: number }>();
    const playerSchneiderStats = new Map<string, { made: number; received: number; games: number }>();
    const playerKontermatschStats = new Map<string, { made: number; received: number; games: number }>();
    const playerWeisStats = new Map<string, { made: number; games: number }>();
    const playerRoundTimes = new Map<string, number[]>();
    const trumpfCounts = new Map<string, number>();

    // VEREINFACHT: Player-ID zu Namen-Map aus Gruppendaten
    const playerIdToNameMap = new Map<string, string>();
    Object.entries(groupData.players || {}).forEach(([playerId, playerData]) => {
      if (playerData.displayName) {
        playerIdToNameMap.set(playerId, playerData.displayName);
      }
    });

    // Schritt 3: Alle Sessions und Spiele verarbeiten
        for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      
      if (!validateSessionDataEnhanced(sessionData)) {
        logger.warn(`Invalid session data structure for ${sessionDoc.id}, skipping.`);
        continue;
      }

      // VEREINFACHT: Verwende nur participantPlayerIds
      const sessionPlayerDocIds = extractPlayerDocIdsFromSessionSimple(sessionData);
      
      logger.info(`[calculateGroupStatisticsInternal] Session ${sessionDoc.id} players:`, {
        participantPlayerIds: sessionData.participantPlayerIds,
        extractedPlayerIds: sessionPlayerDocIds
      });

      // Namen aus playerNames ergänzen (falls verfügbar)
      if (sessionData.playerNames) {
        sessionPlayerDocIds.forEach((playerId: string, index: number) => {
          const playerName = sessionData.playerNames[index + 1]; // playerNames ist 1-basiert
          if (playerName && !playerIdToNameMap.has(playerId)) {
            playerIdToNameMap.set(playerId, playerName);
          }
        });
      }

      // Zeitstempel aktualisieren
      if (sessionData.startedAt) {
        let startedAtTimestamp: admin.firestore.Timestamp;
        if (sessionData.startedAt instanceof admin.firestore.Timestamp) {
          startedAtTimestamp = sessionData.startedAt;
        } else if (typeof sessionData.startedAt === 'object' && sessionData.startedAt && 'seconds' in sessionData.startedAt) {
          // Firestore Timestamp Objekt mit seconds/nanoseconds
          const timestampObj = sessionData.startedAt as { seconds: number; nanoseconds?: number };
          startedAtTimestamp = new admin.firestore.Timestamp(timestampObj.seconds, timestampObj.nanoseconds || 0);
        } else if (typeof sessionData.startedAt === 'number') {
          startedAtTimestamp = admin.firestore.Timestamp.fromMillis(sessionData.startedAt);
        } else {
          logger.warn(`Invalid startedAt format for session ${sessionDoc.id}:`, sessionData.startedAt);
          continue;
        }
        
        if (!firstJassTimestamp || startedAtTimestamp.toMillis() < firstJassTimestamp.toMillis()) {
          firstJassTimestamp = startedAtTimestamp;
        }
      }
      
      if (sessionData.endedAt) {
        let endedAtTimestamp: admin.firestore.Timestamp;
        if (sessionData.endedAt instanceof admin.firestore.Timestamp) {
          endedAtTimestamp = sessionData.endedAt;
        } else if (typeof sessionData.endedAt === 'object' && sessionData.endedAt && 'seconds' in sessionData.endedAt) {
          // Firestore Timestamp Objekt mit seconds/nanoseconds
          const timestampObj = sessionData.endedAt as { seconds: number; nanoseconds?: number };
          endedAtTimestamp = new admin.firestore.Timestamp(timestampObj.seconds, timestampObj.nanoseconds || 0);
        } else if (typeof sessionData.endedAt === 'number') {
          endedAtTimestamp = admin.firestore.Timestamp.fromMillis(sessionData.endedAt);
        } else {
          logger.warn(`Invalid endedAt format for session ${sessionDoc.id}:`, sessionData.endedAt);
                continue;
            }

        if (!lastJassTimestamp || endedAtTimestamp.toMillis() > lastJassTimestamp.toMillis()) {
          lastJassTimestamp = endedAtTimestamp;
        }
      }

      // Spieler-Aktivität aktualisieren
      sessionPlayerDocIds.forEach((playerId: string) => {
        if (sessionData.endedAt) {
          let endedAtForActivity: admin.firestore.Timestamp;
          if (sessionData.endedAt instanceof admin.firestore.Timestamp) {
            endedAtForActivity = sessionData.endedAt;
          } else if (typeof sessionData.endedAt === 'object' && sessionData.endedAt && 'seconds' in sessionData.endedAt) {
            const timestampObj = sessionData.endedAt as { seconds: number; nanoseconds?: number };
            endedAtForActivity = new admin.firestore.Timestamp(timestampObj.seconds, timestampObj.nanoseconds || 0);
          } else {
            return; // Skip if we can't parse the timestamp
          }
          
          const currentLast = playerLastActivity.get(playerId);
          if (!currentLast || endedAtForActivity.toMillis() > currentLast.toMillis()) {
            playerLastActivity.set(playerId, endedAtForActivity);
          }
        }
      });

      // ✅ KORRIGIERT: Session-Level Statistiken mit Player Doc IDs
      sessionPlayerDocIds.forEach((playerId: string) => {
        // Session-Gewinnraten
        if (!playerSessionStats.has(playerId)) {
          playerSessionStats.set(playerId, { wins: 0, losses: 0, ties: 0, sessions: 0 });
        }
        
        const sessionStats = playerSessionStats.get(playerId)!;
        sessionStats.sessions++;
        
        // ✅ KORRIGIERT: Verwende neue Player Doc ID basierte Team-Zuordnung
        const playerTeam = getPlayerTeamAssignment(playerId, sessionData);
        
        if (!playerTeam) {
          logger.warn(`Player ${playerId} not found in teams structure for session ${sessionDoc.id}`);
          return;
        }
        
        // ✅ KORRIGIERT: Session-Ergebnis auswerten
        const winnerTeamKey = sessionData.winnerTeamKey;
        if (winnerTeamKey === 'draw' || winnerTeamKey === 'tie') {
          sessionStats.ties++;
        } else if (winnerTeamKey === playerTeam) {
          sessionStats.wins++;
        } else {
          sessionStats.losses++;
        }
        
        // KORRIGIERT: Punkte-Statistiken mit korrekter Team-Zuordnung
        if (sessionData.finalScores) {
          if (!playerPointsStats.has(playerId)) {
            playerPointsStats.set(playerId, { made: 0, received: 0, games: 0 });
          }
          
          const pointsStats = playerPointsStats.get(playerId)!;
          pointsStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele dieser Session
          
          // VEREINFACHT: Direkte top/bottom Zuordnung ohne teamScoreMapping
          if (playerTeam === 'top') {
            pointsStats.made += sessionData.finalScores.top || 0;
            pointsStats.received += sessionData.finalScores.bottom || 0;
          } else {
            pointsStats.made += sessionData.finalScores.bottom || 0;
            pointsStats.received += sessionData.finalScores.top || 0;
          }
        }
        
        // KORRIGIERT: Striche-Statistiken mit korrekter Team-Zuordnung
        if (sessionData.finalStriche) {
          if (!playerStricheStats.has(playerId)) {
            playerStricheStats.set(playerId, { made: 0, received: 0, games: 0 });
          }
          
          const stricheStats = playerStricheStats.get(playerId)!;
          stricheStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele dieser Session
          
          // VEREINFACHT: Direkte top/bottom Zuordnung
          const playerStriche = sessionData.finalStriche[playerTeam] || {};
          const opponentStriche = sessionData.finalStriche[playerTeam === 'top' ? 'bottom' : 'top'] || {};
          
          const playerTotal = (playerStriche.berg || 0) + (playerStriche.sieg || 0) + (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + (playerStriche.kontermatsch || 0);
          const opponentTotal = (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + (opponentStriche.kontermatsch || 0);
          
          stricheStats.made += playerTotal;
          stricheStats.received += opponentTotal;
        }
        
        // Spiel-Zählung für Player-Game-Counts
        playerGameCounts.set(playerId, (playerGameCounts.get(playerId) || 0) + (sessionData.gamesPlayed || 0));
            
        // ✅ OPTIMIERT: Spiel-Gewinnraten aus Session-Level Daten
            if (!playerGameStats.has(playerId)) {
              playerGameStats.set(playerId, { wins: 0, losses: 0, games: 0 });
            }
            
            const gameStats = playerGameStats.get(playerId)!;
        gameStats.games += sessionData.gamesPlayed || 0;
        
        // Session-Gewinner bestimmt die Spiel-Gewinnrate (vereinfacht)
        if (winnerTeamKey && winnerTeamKey !== 'draw' && winnerTeamKey !== 'tie') {
          // Wenn Spieler-Team die Session gewonnen hat, werden mehr Spiele als gewonnen gezählt
          const teamWonSession = (playerTeam === 'top' && winnerTeamKey === 'top') || 
                               (playerTeam === 'bottom' && winnerTeamKey === 'bottom');
          if (teamWonSession) {
            // Schätze Spiel-Gewinne basierend auf Session-Sieg (vereinfacht)
            const estimatedGameWins = Math.ceil((sessionData.gamesPlayed || 0) * 0.6); // 60% Gewinnrate für Session-Gewinner
            gameStats.wins += estimatedGameWins;
            gameStats.losses += (sessionData.gamesPlayed || 0) - estimatedGameWins;
          } else {
            // Verlierer-Team
            const estimatedGameWins = Math.floor((sessionData.gamesPlayed || 0) * 0.4); // 40% Gewinnrate für Session-Verlierer
            gameStats.wins += estimatedGameWins;
            gameStats.losses += (sessionData.gamesPlayed || 0) - estimatedGameWins;
                }
        } else {
          // Unentschieden: 50/50 Verteilung
          const estimatedGameWins = Math.round((sessionData.gamesPlayed || 0) * 0.5);
          gameStats.wins += estimatedGameWins;
          gameStats.losses += (sessionData.gamesPlayed || 0) - estimatedGameWins;
                }

        // ✅ OPTIMIERT: Event-Statistiken direkt aus eventCounts verwenden (DRASTISCHE PERFORMANCE-VERBESSERUNG)
        if (sessionData.eventCounts) {
          // VEREINFACHT: Direkte top/bottom Zuordnung
          const playerEventCounts = sessionData.eventCounts[playerTeam] || {};
          const opponentEventCounts = sessionData.eventCounts[playerTeam === 'top' ? 'bottom' : 'top'] || {};

          // ✅ OPTIMIERT: Matsch-Statistiken direkt aus eventCounts
              if (!playerMatschStats.has(playerId)) {
                playerMatschStats.set(playerId, { made: 0, received: 0, games: 0 });
              }
              const matschStats = playerMatschStats.get(playerId)!;
          matschStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele der Session
          matschStats.made += playerEventCounts.matsch || 0;
          matschStats.received += opponentEventCounts.matsch || 0;

          // ✅ OPTIMIERT: Schneider-Statistiken direkt aus eventCounts
              if (!playerSchneiderStats.has(playerId)) {
                playerSchneiderStats.set(playerId, { made: 0, received: 0, games: 0 });
              }
              const schneiderStats = playerSchneiderStats.get(playerId)!;
          schneiderStats.games += sessionData.gamesPlayed || 0;
          schneiderStats.made += playerEventCounts.schneider || 0;
          schneiderStats.received += opponentEventCounts.schneider || 0;

          // ✅ OPTIMIERT: Kontermatsch-Statistiken direkt aus eventCounts
              if (!playerKontermatschStats.has(playerId)) {
                playerKontermatschStats.set(playerId, { made: 0, received: 0, games: 0 });
              }
              const kontermatschStats = playerKontermatschStats.get(playerId)!;
          kontermatschStats.games += sessionData.gamesPlayed || 0;
          kontermatschStats.made += playerEventCounts.kontermatsch || 0;
          kontermatschStats.received += opponentEventCounts.kontermatsch || 0;
            }

        // ✅ OPTIMIERT: Verwende Session-Level Weis-Aggregation wenn verfügbar
        if (sessionData.sessionTotalWeisPoints) {
              if (!playerWeisStats.has(playerId)) {
                playerWeisStats.set(playerId, { made: 0, games: 0 });
              }
              const weisStats = playerWeisStats.get(playerId)!;
          weisStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele der Session
              
          // VEREINFACHT: Direkte top/bottom Zuordnung
          weisStats.made += sessionData.sessionTotalWeisPoints[playerTeam] || 0;
            }

        // ✅ OPTIMIERT: Verwende Session-Level Rundendauer-Aggregation wenn verfügbar
        if (sessionData.aggregatedRoundDurationsByPlayer && sessionData.aggregatedRoundDurationsByPlayer[playerId]) {
          if (!playerRoundTimes.has(playerId)) {
            playerRoundTimes.set(playerId, []);
          }
          
          const playerRoundDurations = sessionData.aggregatedRoundDurationsByPlayer[playerId];
          const avgRoundDuration = playerRoundDurations.roundCount > 0 
            ? playerRoundDurations.totalDuration / playerRoundDurations.roundCount 
            : 0;
          
          // Addiere zur Session-Total-Rundendauer
          totalRoundDurationMillis += playerRoundDurations.totalDuration;
              
          // Füge die durchschnittliche Rundendauer für alle Runden dieser Session hinzu
          for (let i = 0; i < playerRoundDurations.roundCount; i++) {
            playerRoundTimes.get(playerId)!.push(avgRoundDuration);
          }
        }
      });

      // ✅ OPTIMIERT: Session-Level Totals statt einzelne Spiel-Iteration
      if (sessionData.totalRounds) {
        totalRounds += sessionData.totalRounds;
      } else {
        // Fallback: Einzelspiel-Zählung nur wenn Session-Level Daten fehlen
        const gamesPlayed = sessionData.gamesPlayed || 0;
        for (let gameNumber = 1; gameNumber <= gamesPlayed; gameNumber++) {
          try {
            const gameDoc = await sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber.toString()).get();
            if (gameDoc.exists) {
              const gameData = gameDoc.data();
              if (gameData && gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
                totalRounds += gameData.roundHistory.length;
              }
                }
          } catch (error) {
            logger.warn(`Error loading game ${gameNumber} for round count from session ${sessionDoc.id}:`, error);
          }
        }
      }

      // ✅ OPTIMIERT: Verwende Session-Level eventCounts für Matsch-Totals
      if (sessionData.eventCounts) {
        const topMatsch = sessionData.eventCounts.top?.matsch || 0;
        const bottomMatsch = sessionData.eventCounts.bottom?.matsch || 0;
        totalMatschCount += topMatsch + bottomMatsch;
      } else {
        // Fallback: Einzelspiel-Berechnung
        const gamesPlayed = sessionData.gamesPlayed || 0;
        for (let gameNumber = 1; gameNumber <= gamesPlayed; gameNumber++) {
          try {
            const gameDoc = await sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber.toString()).get();
            if (gameDoc.exists) {
              const gameData = gameDoc.data();
              if (gameData && gameData.finalStriche) {
                const topMatsch = gameData.finalStriche.top?.matsch || 0;
                const bottomMatsch = gameData.finalStriche.bottom?.matsch || 0;
                totalMatschCount += topMatsch + bottomMatsch;
              }
            }
          } catch (error) {
            logger.warn(`Error loading game ${gameNumber} for matsch count from session ${sessionDoc.id}:`, error);
                    }
                  }
                }

      // ✅ OPTIMIERT: Verwende Session-Level Trumpf-Aggregation wenn verfügbar
      if (sessionData.aggregatedTrumpfCountsByPlayer) {
        // Aggregiere alle Trumpf-Counts aller Spieler zur Session-Summe
        Object.values(sessionData.aggregatedTrumpfCountsByPlayer).forEach(playerTrumpfCounts => {
          if (playerTrumpfCounts && typeof playerTrumpfCounts === 'object') {
            Object.entries(playerTrumpfCounts).forEach(([farbe, count]) => {
              if (typeof count === 'number') {
                trumpfCounts.set(farbe.toLowerCase(), (trumpfCounts.get(farbe.toLowerCase()) || 0) + count);
              }
                });
            }
        });
      } else {
        // Fallback: Einzelspiel-Trumpf-Zählung
        const gamesPlayed = sessionData.gamesPlayed || 0;
        for (let gameNumber = 1; gameNumber <= gamesPlayed; gameNumber++) {
          try {
            const gameDoc = await sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber.toString()).get();
            if (gameDoc.exists) {
              const gameData = gameDoc.data();
              if (gameData && gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
                gameData.roundHistory.forEach((round: any) => {
                  if (round.farbe) {
                    const farbe = round.farbe.toLowerCase();
                    trumpfCounts.set(farbe, (trumpfCounts.get(farbe) || 0) + 1);
                  }
                });
              }
          }
        } catch (error) {
            logger.warn(`Error loading game ${gameNumber} for trumpf count from session ${sessionDoc.id}:`, error);
        }
      }
      }

      // ✅ OPTIMIERT: Session-Dauer und Spiel-Dauer aus Session-Level Daten
      totalPlayTimeMillis += sessionData.durationSeconds ? sessionData.durationSeconds * 1000 : 0;

      // ✅ OPTIMIERT: Verwende vorkalkulierte Spiel-Anzahl
      calculatedStats.gameCount += sessionData.gamesPlayed || 0;
    }

    // Schritt 4: Basis-Statistiken berechnen
        calculatedStats.totalPlayTimeSeconds = Math.round(totalPlayTimeMillis / 1000);
    calculatedStats.firstJassTimestamp = firstJassTimestamp;
    calculatedStats.lastJassTimestamp = lastJassTimestamp;
        
    // Durchschnittswerte
        if (calculatedStats.sessionCount > 0 && totalPlayTimeMillis > 0) {
            calculatedStats.avgSessionDurationSeconds = Math.round((totalPlayTimeMillis / calculatedStats.sessionCount) / 1000);
        }
    
        if (calculatedStats.gameCount > 0 && totalPlayTimeMillis > 0) {
            calculatedStats.avgGameDurationSeconds = Math.round((totalPlayTimeMillis / calculatedStats.gameCount) / 1000);
        }
    
        if (calculatedStats.gameCount > 0) {
            calculatedStats.avgGamesPerSession = parseFloat((calculatedStats.gameCount / calculatedStats.sessionCount).toFixed(2));
        }
    
        if (totalRounds > 0) {
            calculatedStats.avgRoundsPerGame = parseFloat((totalRounds / calculatedStats.gameCount).toFixed(2));
            
            if (totalRoundDurationMillis > 0) {
                calculatedStats.avgRoundDurationSeconds = Math.round(totalRoundDurationMillis / totalRounds / 1000);
                logger.info(`[calculateGroupStatisticsInternal] Rundendauer-Berechnung: ${totalRoundDurationMillis}ms total, ${totalRounds} Runden, Durchschnitt: ${calculatedStats.avgRoundDurationSeconds}s`);
            } else {
                logger.warn(`[calculateGroupStatisticsInternal] WARNUNG: Keine Rundendauer-Daten gefunden! totalRoundDurationMillis = ${totalRoundDurationMillis}`);
            }
        }
    
        if (calculatedStats.gameCount > 0) {
            calculatedStats.avgMatschPerGame = parseFloat((totalMatschCount / calculatedStats.gameCount).toFixed(2));
        }

    // Trumpf-Statistiken
    calculatedStats.trumpfStatistik = Object.fromEntries(trumpfCounts);
    calculatedStats.totalTrumpfCount = Array.from(trumpfCounts.values()).reduce((sum, count) => sum + count, 0);

    // Schritt 5: Spieler-Highlights berechnen
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    
    // Spieler mit den meisten Spielen
        const playerMostGamesList: GroupStatHighlightPlayer[] = [];
    playerGameCounts.forEach((count, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo) {
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
            playerMostGamesList.push({
          playerId,
          playerName: playerName,
                value: count,
          lastPlayedTimestamp: lastActivity,
                });
            }
        });

        playerMostGamesList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithMostGames = playerMostGamesList;
        
    // Spieler mit höchster Punkte-Differenz
    const playerPointsDiffList: GroupStatHighlightPlayer[] = [];
    playerPointsStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games > 0) {
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerPointsDiffList.push({
          playerId,
          playerName: playerName,
          value: stats.made - stats.received,
          eventsPlayed: stats.games,
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    
    playerPointsDiffList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestPointsDiff = playerPointsDiffList;

    // Spieler mit höchster Striche-Differenz
    const playerStricheDiffList: GroupStatHighlightPlayer[] = [];
    playerStricheStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games > 0) {
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
                playerStricheDiffList.push({
          playerId,
          playerName: playerName,
                    value: stats.made - stats.received,
                    eventsPlayed: stats.games,
          lastPlayedTimestamp: lastActivity,
                        });
                    }
                });

        playerStricheDiffList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestStricheDiff = playerStricheDiffList;

    // Spieler mit höchster Session-Gewinnrate
        const playerSessionWinRateList: GroupStatHighlightPlayer[] = [];
        playerSessionStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.sessions >= 1) { // KEINE Mindestanforderung mehr!
        const winRate = stats.sessions > 0 ? stats.wins / stats.sessions : 0;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerSessionWinRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(winRate.toFixed(3)), // KORREKTUR: Keine *100 Multiplikation - Frontend macht das!
          eventsPlayed: stats.sessions,
          lastPlayedTimestamp: lastActivity,
        });
      }
    });

    playerSessionWinRateList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestWinRateSession = playerSessionWinRateList;

    // Spieler mit höchster Spiel-Gewinnrate
    const playerGameWinRateList: GroupStatHighlightPlayer[] = [];
    playerGameStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games >= 1) { // KEINE Mindestanforderung mehr!
        const winRate = stats.games > 0 ? stats.wins / stats.games : 0;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerGameWinRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(winRate.toFixed(3)), // KORREKTUR: Keine *100 Multiplikation - Frontend macht das!
          eventsPlayed: stats.games,
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerGameWinRateList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestWinRateGame = playerGameWinRateList;

    // Spieler mit höchster Matsch-Rate
        const playerMatschRateList: GroupStatHighlightPlayer[] = [];
        playerMatschStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      const totalGames = playerGameCounts.get(playerId) || 0;
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && totalGames >= 1) {
        const matschRate = stats.made / totalGames;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
                playerMatschRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(matschRate.toFixed(2)),
          eventsPlayed: totalGames,
          lastPlayedTimestamp: lastActivity,
                });
            }
        });
    playerMatschRateList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestMatschRate = playerMatschRateList;

    // Spieler mit höchster Schneider-Rate
        const playerSchneiderRateList: GroupStatHighlightPlayer[] = [];
        playerSchneiderStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      const totalGames = playerGameCounts.get(playerId) || 0;
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && totalGames >= 1) {
        const schneiderRate = stats.made / totalGames;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
                playerSchneiderRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(schneiderRate.toFixed(2)),
          eventsPlayed: totalGames,
          lastPlayedTimestamp: lastActivity,
                });
            }
        });
    playerSchneiderRateList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestSchneiderRate = playerSchneiderRateList;

    // Spieler mit höchster Kontermatsch-Rate
        const playerKontermatschRateList: GroupStatHighlightPlayer[] = [];
        playerKontermatschStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      const totalGames = playerGameCounts.get(playerId) || 0;
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && totalGames >= 1) {
        const kontermatschRate = stats.made / totalGames;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
                playerKontermatschRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(kontermatschRate.toFixed(2)),
          eventsPlayed: totalGames,
          lastPlayedTimestamp: lastActivity,
                });
            }
        });
    playerKontermatschRateList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestKontermatschRate = playerKontermatschRateList;

    // Spieler mit meisten Weis-Punkten im Durchschnitt
    const playerWeisAvgList: GroupStatHighlightPlayer[] = [];
    playerWeisStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games >= 1) { // KEINE Mindestanforderung mehr!
        const weisAvg = stats.games > 0 ? stats.made / stats.games : 0;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerWeisAvgList.push({
          playerId,
          playerName: playerName,
          value: Math.round(weisAvg),
          eventsPlayed: stats.games,
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerWeisAvgList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithMostWeisPointsAvg = playerWeisAvgList;

    // Spieler-Rundenzeiten (alle Zeiten für Durchschnitt)
    const playerAllRoundTimesList: GroupStatHighlightPlayer[] = [];
    playerRoundTimes.forEach((times, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && times.length >= 1) { // KEINE Mindestanforderung mehr!
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerAllRoundTimesList.push({
          playerId,
          playerName: playerName,
          value: Math.round(avgTime),
          eventsPlayed: times.length,
          lastPlayedTimestamp: lastActivity,
          displayValue: `${Math.round(avgTime / 1000)}s`,
        });
      }
    });
    playerAllRoundTimesList.sort((a, b) => a.value - b.value); // Aufsteigend für Durchschnittszeit
    calculatedStats.playerAllRoundTimes = playerAllRoundTimesList;

    // Schnellste und langsamste Spieler
    calculatedStats.playerWithFastestRounds = playerAllRoundTimesList.slice(0, 10);
    calculatedStats.playerWithSlowestRounds = [...playerAllRoundTimesList].reverse().slice(0, 10);

    // Schritt 6: Team-Highlights berechnen - VOLLSTÄNDIG NEU MIT SESSION-LEVEL DATEN
    // ✅ OPTIMIERT: Verwende Session-Level Daten statt einzelne Spiele für maximale Performance
    const teamPairings = new Map<string, { 
      playerIds: string[]; // Für Aktivitätsfilterung
      games: number; 
      wins: number; 
      sessions: number;
      sessionWins: number;
      pointsMade: number; 
      pointsReceived: number;
      stricheMade: number;
      stricheReceived: number;
      matschMade: number;
      schneiderMade: number;
      kontermatschMade: number;
      weisMade: number;
      roundTimes: number[];
      playerNames: string[];
    }>();

    // ✅ OPTIMIERT: Session-basierte Team-Statistiken mit allen notwendigen Daten
    sessionsSnap.docs.forEach(sessionDoc => {
      const sessionData = sessionDoc.data();
      if (!validateSessionDataEnhanced(sessionData)) return;
      
      // Extrahiere Team-Zuordnungen
      const teams = extractTeamsWithPlayerDocIds(sessionData);
      if (teams.top.length !== 2 || teams.bottom.length !== 2) {
        logger.warn(`Session ${sessionDoc.id} hat ungültige Team-Struktur, überspringe Team-Statistiken`);
        return;
      }

      const topPlayerIds = teams.top;
      const bottomPlayerIds = teams.bottom;
      
      const topNames = topPlayerIds.map(id => playerIdToNameMap.get(id) || 'Unbekannt');
      const bottomNames = bottomPlayerIds.map(id => playerIdToNameMap.get(id) || 'Unbekannt');
      
      const topKey = topPlayerIds.join('_');
      const bottomKey = bottomPlayerIds.join('_');

      // ✅ OPTIMIERT: Top Team - Session-Level Aggregation
      if (!teamPairings.has(topKey)) {
        teamPairings.set(topKey, { 
          playerIds: topPlayerIds,
          games: 0, 
          wins: 0,
          sessions: 0,
          sessionWins: 0,
          pointsMade: 0, 
          pointsReceived: 0,
          stricheMade: 0,
          stricheReceived: 0,
          matschMade: 0,
          schneiderMade: 0,
          kontermatschMade: 0,
          weisMade: 0,
          roundTimes: [],
          playerNames: topNames
        });
      }
      
      const topStats = teamPairings.get(topKey)!;
      
      // Session- und Spiel-Counts
      topStats.sessions++;
      topStats.games += sessionData.gamesPlayed || 0;
      
      // Session-Gewinn
      if (sessionData.winnerTeamKey === 'top') {
        topStats.sessionWins++;
        
        // Schätze Spiel-Gewinne für Session-Gewinner (60% Gewinnrate)
        const estimatedGameWins = Math.ceil((sessionData.gamesPlayed || 0) * 0.6);
        topStats.wins += estimatedGameWins;
      } else if (sessionData.winnerTeamKey === 'bottom') {
        // Schätze Spiel-Gewinne für Session-Verlierer (40% Gewinnrate)
        const estimatedGameWins = Math.floor((sessionData.gamesPlayed || 0) * 0.4);
        topStats.wins += estimatedGameWins;
      } else {
        // Unentschieden: 50/50 Verteilung
        const estimatedGameWins = Math.round((sessionData.gamesPlayed || 0) * 0.5);
        topStats.wins += estimatedGameWins;
      }

      // ✅ OPTIMIERT: Punkte aus Session-Level finalScores
      if (sessionData.finalScores) {
        topStats.pointsMade += sessionData.finalScores.top || 0;
        topStats.pointsReceived += sessionData.finalScores.bottom || 0;
      }

      // ✅ OPTIMIERT: Striche aus Session-Level finalStriche
      if (sessionData.finalStriche) {
        const topStriche = sessionData.finalStriche.top || {};
        const bottomStriche = sessionData.finalStriche.bottom || {};
        
        const topStricheTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + (topStriche.matsch || 0) + (topStriche.schneider || 0) + (topStriche.kontermatsch || 0);
        const bottomStricheTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + (bottomStriche.kontermatsch || 0);
        
        topStats.stricheMade += topStricheTotal;
        topStats.stricheReceived += bottomStricheTotal;
      }

      // ✅ OPTIMIERT: Event-Statistiken direkt aus eventCounts (MASSIVE PERFORMANCE-VERBESSERUNG)
      if (sessionData.eventCounts) {
        const topEventCounts = sessionData.eventCounts.top || {};
        
        topStats.matschMade += topEventCounts.matsch || 0;
        topStats.schneiderMade += topEventCounts.schneider || 0;
        topStats.kontermatschMade += topEventCounts.kontermatsch || 0;
      }

      // ✅ OPTIMIERT: Weis aus Session-Level sessionTotalWeisPoints
      if (sessionData.sessionTotalWeisPoints) {
        topStats.weisMade += sessionData.sessionTotalWeisPoints.top || 0;
      }

      // ✅ OPTIMIERT: Rundenzeiten aus aggregatedRoundDurationsByPlayer
      if (sessionData.aggregatedRoundDurationsByPlayer) {
        topPlayerIds.forEach(playerId => {
          const playerRoundData = sessionData.aggregatedRoundDurationsByPlayer[playerId];
          if (playerRoundData && playerRoundData.roundCount > 0) {
            const avgRoundDuration = playerRoundData.totalDuration / playerRoundData.roundCount;
            
            // Füge durchschnittliche Rundendauer für alle Runden dieser Session hinzu
            for (let i = 0; i < playerRoundData.roundCount; i++) {
              topStats.roundTimes.push(avgRoundDuration);
            }
          }
        });
      }

      // ✅ OPTIMIERT: Bottom Team - Session-Level Aggregation (identische Logik)
      if (!teamPairings.has(bottomKey)) {
        teamPairings.set(bottomKey, { 
          playerIds: bottomPlayerIds,
          games: 0, 
          wins: 0,
          sessions: 0,
          sessionWins: 0,
          pointsMade: 0, 
          pointsReceived: 0,
          stricheMade: 0,
          stricheReceived: 0,
          matschMade: 0,
          schneiderMade: 0,
          kontermatschMade: 0,
          weisMade: 0,
          roundTimes: [],
          playerNames: bottomNames
        });
      }
      
      const bottomStats = teamPairings.get(bottomKey)!;
      
      // Session- und Spiel-Counts
      bottomStats.sessions++;
      bottomStats.games += sessionData.gamesPlayed || 0;
      
      // Session-Gewinn
      if (sessionData.winnerTeamKey === 'bottom') {
        bottomStats.sessionWins++;
        
        // Schätze Spiel-Gewinne für Session-Gewinner (60% Gewinnrate)
        const estimatedGameWins = Math.ceil((sessionData.gamesPlayed || 0) * 0.6);
        bottomStats.wins += estimatedGameWins;
      } else if (sessionData.winnerTeamKey === 'top') {
        // Schätze Spiel-Gewinne für Session-Verlierer (40% Gewinnrate)
        const estimatedGameWins = Math.floor((sessionData.gamesPlayed || 0) * 0.4);
        bottomStats.wins += estimatedGameWins;
      } else {
        // Unentschieden: 50/50 Verteilung
        const estimatedGameWins = Math.round((sessionData.gamesPlayed || 0) * 0.5);
        bottomStats.wins += estimatedGameWins;
      }

      // Punkte aus Session-Level finalScores
      if (sessionData.finalScores) {
        bottomStats.pointsMade += sessionData.finalScores.bottom || 0;
        bottomStats.pointsReceived += sessionData.finalScores.top || 0;
      }

      // Striche aus Session-Level finalStriche
      if (sessionData.finalStriche) {
        const topStriche = sessionData.finalStriche.top || {};
        const bottomStriche = sessionData.finalStriche.bottom || {};
        
        const topStricheTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + (topStriche.matsch || 0) + (topStriche.schneider || 0) + (topStriche.kontermatsch || 0);
        const bottomStricheTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + (bottomStriche.kontermatsch || 0);
        
        bottomStats.stricheMade += bottomStricheTotal;
        bottomStats.stricheReceived += topStricheTotal;
      }

      // Event-Statistiken direkt aus eventCounts
      if (sessionData.eventCounts) {
        const bottomEventCounts = sessionData.eventCounts.bottom || {};
        
        bottomStats.matschMade += bottomEventCounts.matsch || 0;
        bottomStats.schneiderMade += bottomEventCounts.schneider || 0;
        bottomStats.kontermatschMade += bottomEventCounts.kontermatsch || 0;
      }

      // Weis aus Session-Level sessionTotalWeisPoints
      if (sessionData.sessionTotalWeisPoints) {
        bottomStats.weisMade += sessionData.sessionTotalWeisPoints.bottom || 0;
      }

      // Rundenzeiten aus aggregatedRoundDurationsByPlayer
      if (sessionData.aggregatedRoundDurationsByPlayer) {
        bottomPlayerIds.forEach(playerId => {
          const playerRoundData = sessionData.aggregatedRoundDurationsByPlayer[playerId];
          if (playerRoundData && playerRoundData.roundCount > 0) {
            const avgRoundDuration = playerRoundData.totalDuration / playerRoundData.roundCount;
            
            // Füge durchschnittliche Rundendauer für alle Runden dieser Session hinzu
            for (let i = 0; i < playerRoundData.roundCount; i++) {
              bottomStats.roundTimes.push(avgRoundDuration);
            }
          }
        });
      }
    });

    // Team mit höchster Gewinnrate (Spiele)
    const teamWinRateList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });

      if (stats.games >= 1 && isTeamActive) {
        const winRate = stats.games > 0 ? stats.wins / stats.games : 0;
        teamWinRateList.push({
                    names: stats.playerNames,
          value: parseFloat(winRate.toFixed(3)), // KORREKTUR: Keine *100 Multiplikation - Frontend macht das!
          eventsPlayed: stats.games,
                });
            }
        });
    
    teamWinRateList.sort((a, b) => {
            const valA = typeof a.value === 'number' ? a.value : 0;
            const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestWinRateGame = teamWinRateList;

    // Team mit höchster Punkte-Differenz
        const teamPointsDiffList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const pointsDiff = stats.pointsMade - stats.pointsReceived;
                teamPointsDiffList.push({
                    names: stats.playerNames,
          value: pointsDiff,
                    eventsPlayed: stats.games,
                });
            }
        });

    teamPointsDiffList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
        calculatedStats.teamWithHighestPointsDiff = teamPointsDiffList;

    // Team mit höchster Session-Gewinnrate
    const teamSessionWinRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.sessions >= 1 && isTeamActive) {
        const sessionWinRate = stats.sessions > 0 ? stats.sessionWins / stats.sessions : 0;
        teamSessionWinRateList.push({
          names: stats.playerNames,
          value: parseFloat(sessionWinRate.toFixed(3)), // KORREKTUR: Keine *100 Multiplikation - Frontend macht das!
          eventsPlayed: stats.sessions,
        });
      }
    });
    teamSessionWinRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestWinRateSession = teamSessionWinRateList;

    // Team mit höchster Striche-Differenz
        const teamStricheDiffList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const stricheDiff = stats.stricheMade - stats.stricheReceived;
                teamStricheDiffList.push({
                    names: stats.playerNames,
          value: stricheDiff,
                    eventsPlayed: stats.games,
                });
            }
        });
    teamStricheDiffList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
        calculatedStats.teamWithHighestStricheDiff = teamStricheDiffList;

    // Team mit höchster Matsch-Rate
    const teamMatschRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const matschRate = stats.games > 0 ? stats.matschMade / stats.games : 0;
        teamMatschRateList.push({
          names: stats.playerNames,
          value: parseFloat(matschRate.toFixed(2)),
          eventsPlayed: stats.games,
        });
      }
    });
    teamMatschRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestMatschRate = teamMatschRateList;

    // Team mit höchster Schneider-Rate
    const teamSchneiderRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const schneiderRate = stats.games > 0 ? stats.schneiderMade / stats.games : 0;
        teamSchneiderRateList.push({
          names: stats.playerNames,
          value: parseFloat(schneiderRate.toFixed(2)),
          eventsPlayed: stats.games,
        });
      }
    });
    teamSchneiderRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestSchneiderRate = teamSchneiderRateList;

    // Team mit höchster Kontermatsch-Rate
    const teamKontermatschRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const kontermatschRate = stats.games > 0 ? stats.kontermatschMade / stats.games : 0;
        teamKontermatschRateList.push({
          names: stats.playerNames,
          value: parseFloat(kontermatschRate.toFixed(2)),
          eventsPlayed: stats.games,
        });
      }
    });
    teamKontermatschRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestKontermatschRate = teamKontermatschRateList;

    // Team mit meisten Weis-Punkten im Durchschnitt
        const teamWeisAvgList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        const weisAvg = stats.games > 0 ? stats.weisMade / stats.games : 0;
                teamWeisAvgList.push({
          names: stats.playerNames,
          value: Math.round(weisAvg),
          eventsPlayed: stats.games,
                });
            }
        });
    teamWeisAvgList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
        calculatedStats.teamWithMostWeisPointsAvg = teamWeisAvgList;

    // Team mit schnellsten Runden
        const teamFastestRoundsList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.roundTimes.length >= 1 && isTeamActive) {
        const avgTime = stats.roundTimes.reduce((sum, time) => sum + time, 0) / stats.roundTimes.length;
                teamFastestRoundsList.push({
          names: stats.playerNames,
          value: Math.round(avgTime),
          eventsPlayed: stats.roundTimes.length,
                });
            }
        });
    teamFastestRoundsList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valA - valB; // Aufsteigend für schnellste Zeit
    });
        calculatedStats.teamWithFastestRounds = teamFastestRoundsList;

    // ✅ DIAGNOSTIK: Logge Team-Statistiken für Debugging
    logger.info(`[calculateGroupStatisticsInternal] Team-Statistiken berechnet:`, {
      teamPairingsCount: teamPairings.size,
      teamWithHighestWinRateGameCount: calculatedStats.teamWithHighestWinRateGame?.length || 0,
      teamWithHighestWinRateSessionCount: calculatedStats.teamWithHighestWinRateSession?.length || 0,
      teamWithHighestMatschRateCount: calculatedStats.teamWithHighestMatschRate?.length || 0,
      teamWithFastestRoundsCount: calculatedStats.teamWithFastestRounds?.length || 0,
      sampleTeamPairings: Array.from(teamPairings.entries()).slice(0, 2).map(([key, stats]) => ({
        key,
        games: stats.games,
        sessions: stats.sessions,
        wins: stats.wins,
        sessionWins: stats.sessionWins,
        playerNames: stats.playerNames
      }))
    });

    logger.info(`[calculateGroupStatisticsInternal] Calculation completed for groupId: ${groupId}`);
    return calculatedStats;
  } catch (error) {
    logger.error(`[calculateGroupStatisticsInternal] Error calculating stats for group ${groupId}:`, error);
    return calculatedStats;
  }
}

/**
 * Aktualisiert die Gruppenstatistiken nach Abschluss einer Session
 * VERBESSERTE VERSION mit Retry-Logik und Validierung
 */
export async function updateGroupComputedStatsAfterSession(groupId: string): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      logger.info(`[updateGroupComputedStatsAfterSession] Attempt ${attempt + 1}/${maxRetries} for group: ${groupId}`);
      
      // Schritt 1: Berechne Statistiken
      logger.info(`[updateGroupComputedStatsAfterSession] Step 1: Calculating statistics for ${groupId}`);
      const newStats = await calculateGroupStatisticsInternal(groupId);
      
      // Schritt 2: Validiere berechnete Statistiken
      logger.info(`[updateGroupComputedStatsAfterSession] Step 2: Validating calculated statistics for ${groupId}`);
      if (!validateCalculatedStats(newStats)) {
        throw new Error('Calculated statistics failed validation');
      }
      
      // Schritt 3: Sammle Rohdaten-Zusammenfassung für Logging
      const rawDataSummary = await collectRawDataSummary(groupId);
      
      // Schritt 4: Detailliertes Logging
      logStatisticsCalculation(groupId, newStats, rawDataSummary);
      
      // Schritt 5: Speichere Statistiken
      logger.info(`[updateGroupComputedStatsAfterSession] Step 3: Saving statistics to Firestore for ${groupId}`);
      const statsRef = db.collection('groupComputedStats').doc(groupId);
      await statsRef.set(newStats, { merge: true });
      
      logger.info(`[updateGroupComputedStatsAfterSession] SUCCESS for group: ${groupId}`);
      logger.info(`[updateGroupComputedStatsAfterSession] Final stats: ${newStats.sessionCount} sessions, ${newStats.gameCount} games, ${newStats.memberCount} members`);
      return;
    } catch (error) {
      attempt++;
      logger.error(`[updateGroupComputedStatsAfterSession] Attempt ${attempt} failed for group ${groupId}:`, error);
      
      if (attempt >= maxRetries) {
        logger.error(`[updateGroupComputedStatsAfterSession] FINAL FAILURE after ${maxRetries} attempts for group ${groupId}`);
        throw error;
      }
      
      // Exponential backoff
      const backoffMs = Math.pow(2, attempt) * 1000;
      logger.info(`[updateGroupComputedStatsAfterSession] Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Sammelt eine Zusammenfassung der Rohdaten für Logging-Zwecke
 */
async function collectRawDataSummary(groupId: string): Promise<any> {
  try {
    // Sessions zählen
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where("groupId", "==", groupId)
      .where("status", "==", "completed")
      .get();
    
    let totalGames = 0;
    let totalRounds = 0;
    let dataErrors = 0;
    
    // Spiele und Runden zählen
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const gamesPlayed = sessionData.gamesPlayed || 0;
      
      for (let gameNumber = 1; gameNumber <= gamesPlayed; gameNumber++) {
        try {
          const gameDoc = await sessionDoc.ref.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber.toString()).get();
          
          if (gameDoc.exists) {
            totalGames++;
            const gameData = gameDoc.data();
            
            if (gameData?.roundHistory && Array.isArray(gameData.roundHistory)) {
              totalRounds += gameData.roundHistory.length;
            }
            
            // Prüfe Datenqualität
            if (!gameData?.finalScores || !gameData?.finalStriche) {
              dataErrors++;
            }
          }
    } catch (error) {
          dataErrors++;
        }
      }
    }
    
    return {
      sessionsCount: sessionsSnap.docs.length,
      gamesCount: totalGames,
      roundsCount: totalRounds,
      dataErrors: dataErrors
    };
  } catch (error) {
    logger.warn(`Error collecting raw data summary for group ${groupId}:`, error);
    return {
      sessionsCount: 0,
      gamesCount: 0,
      roundsCount: 0,
      dataErrors: 1
    };
    }
} 