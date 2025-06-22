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
  
  // ✅ KORRIGIERT: Tournament-Sessions haben KEINE Session-Level teams, nur gameResults
  if (sessionData.tournamentId) {
    // Für Tournament-Sessions: Teams sind nur in gameResults verfügbar
    logger.info(`[groupStatsCalculator] Tournament session ${sessionData.id || 'unknown'} - teams only available in gameResults`);
    return { top, bottom };
  }
  
  // Für Regular Sessions: Verwende Session-Level teams
  if (sessionData.teams?.top?.players && sessionData.teams?.bottom?.players) {
    sessionData.teams.top.players.forEach((player: any) => {
      if (player.playerId) top.push(player.playerId);
    });
    sessionData.teams.bottom.players.forEach((player: any) => {
      if (player.playerId) bottom.push(player.playerId);
    });
  } else {
    logger.warn(`[groupStatsCalculator] Regular session ${sessionData.id || 'unknown'} hat keine gültige teams.top/bottom Struktur`);
  }
  
  return { top, bottom };
}

// ✅ KORRIGIERT: Bestimme Team eines Player Doc ID - für Tournaments über gameResults
function getPlayerTeamAssignment(playerDocId: string, sessionData: any): 'top' | 'bottom' | null {
  // ✅ WICHTIG: Tournament-Sessions haben keine Session-Level Teams
  if (sessionData.tournamentId) {
    // Für Tournament-Sessions: Teams ändern sich pro Spiel, daher keine Session-Level Zuordnung möglich
    return null;
  }
  
  // Für Regular Sessions: Verwende Session-Level teams
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
  if (stats.gameCount > 0 && stats.sessionCount === 0 && (stats.tournamentCount || 0) === 0) {
    errors.push('Games exist but no sessions or tournaments');
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
    tournamentsFound: rawDataSummary.tournamentsCount,
    gamesFound: rawDataSummary.gamesCount,
    roundsFound: rawDataSummary.roundsCount,
    calculatedSessions: stats.sessionCount,
    calculatedTournaments: stats.tournamentCount || 0,
    calculatedGames: stats.gameCount,
    calculatedMembers: stats.memberCount,
    calculatedPlayTime: stats.totalPlayTimeSeconds,
    playerStatsCount: stats.playerWithMostGames?.length || 0,
    teamStatsCount: stats.teamWithHighestWinRateSession?.length || 0,
    trumpfStatsCount: Object.keys(stats.trumpfStatistik || {}).length,
    dataQualityIssues: rawDataSummary.dataErrors || 0
  });
}

// ✅ ELEGANTE LÖSUNG: Kanonische Team-Schlüssel für konsistente Team-Identifikation
function createCanonicalTeamKey(playerIds: string[]): string {
  // Sortiere die Spieler-IDs alphabetisch für konsistente Team-Identifikation
  // Dadurch wird sichergestellt, dass ["id_A", "id_B"] und ["id_B", "id_A"] 
  // immer denselben Schlüssel "id_A_id_B" ergeben
  return [...playerIds].sort().join('_');
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

        // ✅ KRITISCH: Separiere Tournament Sessions von Regular Sessions
        const regularSessions: admin.firestore.QueryDocumentSnapshot[] = [];
        const tournamentSessions: admin.firestore.QueryDocumentSnapshot[] = [];
        
        sessionsSnap.docs.forEach(doc => {
            const sessionData = doc.data();
            if (sessionData.tournamentId) {
                tournamentSessions.push(doc);
            } else {
                regularSessions.push(doc);
            }
        });

        // ✅ KORRIGIERT: Nur Regular Sessions zählen als Sessions, Tournaments separat
        calculatedStats.sessionCount = regularSessions.length;
        calculatedStats.tournamentCount = tournamentSessions.length;
        
        logger.info(`[calculateGroupStatisticsInternal] Found ${regularSessions.length} regular sessions and ${tournamentSessions.length} tournaments for group ${groupId}.`);

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
    // ✅ KORRIGIERT: Verarbeite ALLE Sessions (Regular + Tournament) für Spiel-Statistiken,
    // aber unterscheide für Session-basierte Statistiken
    const allSessions = [...regularSessions, ...tournamentSessions];
    
        for (const sessionDoc of allSessions) {
      const sessionData = sessionDoc.data();
      const isTournamentSession = Boolean(sessionData.tournamentId);
      
      if (!validateSessionDataEnhanced(sessionData)) {
        logger.warn(`Invalid session data structure for ${sessionDoc.id}, skipping.`);
        continue;
      }

      // VEREINFACHT: Verwende nur participantPlayerIds
      const sessionPlayerDocIds = extractPlayerDocIdsFromSessionSimple(sessionData);
      
      logger.debug(`[calculateGroupStatisticsInternal] Session ${sessionDoc.id} (tournament: ${isTournamentSession}) players:`, {
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

      // Zeitstempel aktualisieren (für ALLE Sessions)
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

      // Spieler-Aktivität aktualisieren (für ALLE Sessions)
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
        // ✅ KRITISCH: Session-Gewinnraten NUR für Regular Sessions zählen
        if (!isTournamentSession) {
          if (!playerSessionStats.has(playerId)) {
            playerSessionStats.set(playerId, { wins: 0, losses: 0, ties: 0, sessions: 0 });
          }
          
          const sessionStats = playerSessionStats.get(playerId)!;
          sessionStats.sessions++;
          
          // ✅ KORRIGIERT: Verwende neue Player Doc ID basierte Team-Zuordnung
          const playerTeam = getPlayerTeamAssignment(playerId, sessionData);
          
          if (!playerTeam) {
            logger.warn(`Player ${playerId} not found in teams structure for regular session ${sessionDoc.id}`);
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
        }
        
        // ✅ WICHTIG: Spiel-Level Statistiken für ALLE Sessions (Regular + Tournament)
        // ✅ KORRIGIERT: Tournament-Sessions verwenden gameResults für Team-Zuordnung
        let playerTeamForGameStats: 'top' | 'bottom' | null = null;
        
        if (isTournamentSession) {
          // ✅ NEU: Für Tournament-Sessions verwende gameResults für Spiel-Statistiken
          // Da Teams pro Spiel wechseln, müssen wir über gameResults iterieren
          if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
            // Verarbeite jedes Spiel einzeln für Tournament-Sessions
            sessionData.gameResults.forEach((game: any, gameIndex: number) => {
              if (game.teams?.top?.players && game.teams?.bottom?.players) {
                const gameTopPlayerIds = game.teams.top.players.map((p: any) => p.playerId).filter(Boolean);
                const gameBottomPlayerIds = game.teams.bottom.players.map((p: any) => p.playerId).filter(Boolean);
                
                let gamePlayerTeam: 'top' | 'bottom' | null = null;
                if (gameTopPlayerIds.includes(playerId)) {
                  gamePlayerTeam = 'top';
                } else if (gameBottomPlayerIds.includes(playerId)) {
                  gamePlayerTeam = 'bottom';
                }
                
                if (gamePlayerTeam) {
                  // ✅ KORRIGIERT: Punkte-Statistiken pro Spiel für Tournaments
                  if (game.topScore !== undefined && game.bottomScore !== undefined) {
                    if (!playerPointsStats.has(playerId)) {
                      playerPointsStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    
                    const pointsStats = playerPointsStats.get(playerId)!;
                    pointsStats.games += 1; // Ein Spiel
                    
                    if (gamePlayerTeam === 'top') {
                      pointsStats.made += game.topScore || 0;
                      pointsStats.received += game.bottomScore || 0;
                    } else {
                      pointsStats.made += game.bottomScore || 0;
                      pointsStats.received += game.topScore || 0;
                    }
                  }
                  
                  // ✅ KORRIGIERT: Striche-Statistiken pro Spiel für Tournaments
                  if (game.finalStriche) {
                    if (!playerStricheStats.has(playerId)) {
                      playerStricheStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    
                    const stricheStats = playerStricheStats.get(playerId)!;
                    stricheStats.games += 1; // Ein Spiel
                    
                    const playerStriche = game.finalStriche[gamePlayerTeam] || {};
                    const opponentStriche = game.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top'] || {};
                    
                    const playerTotal = (playerStriche.berg || 0) + (playerStriche.sieg || 0) + (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + (playerStriche.kontermatsch || 0);
                    const opponentTotal = (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + (opponentStriche.kontermatsch || 0);
                      
                    stricheStats.made += playerTotal;
                    stricheStats.received += opponentTotal;
                    
                    // ✅ KORRIGIERT: Event-Statistiken pro Spiel für Tournaments
                    if (!playerMatschStats.has(playerId)) {
                      playerMatschStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    if (!playerSchneiderStats.has(playerId)) {
                      playerSchneiderStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    if (!playerKontermatschStats.has(playerId)) {
                      playerKontermatschStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    
                    const matschStats = playerMatschStats.get(playerId)!;
                    const schneiderStats = playerSchneiderStats.get(playerId)!;
                    const kontermatschStats = playerKontermatschStats.get(playerId)!;
                    
                    matschStats.games += 1;
                    schneiderStats.games += 1;
                    kontermatschStats.games += 1;
                    
                    matschStats.made += playerStriche.matsch || 0;
                    matschStats.received += opponentStriche.matsch || 0;
                    
                    schneiderStats.made += playerStriche.schneider || 0;
                    schneiderStats.received += opponentStriche.schneider || 0;
                    
                    kontermatschStats.made += playerStriche.kontermatsch || 0;
                    kontermatschStats.received += opponentStriche.kontermatsch || 0;
                  }
                  
                  // ✅ KORRIGIERT: Spiel-Gewinnraten für Tournament-Sessions
                  if (!playerGameStats.has(playerId)) {
                    playerGameStats.set(playerId, { wins: 0, losses: 0, games: 0 });
                  }
                  
                  const gameStats = playerGameStats.get(playerId)!;
                  gameStats.games += 1; // Ein Spiel
                  
                  if (game.winnerTeam === gamePlayerTeam) {
                    gameStats.wins += 1;
                  } else if (game.winnerTeam && game.winnerTeam !== 'tie') {
                    gameStats.losses += 1;
                  }
                }
              }
            });
          }
          
          // ✅ WICHTIG: Spiel-Zählung für Tournament-Sessions
          playerGameCounts.set(playerId, (playerGameCounts.get(playerId) || 0) + (sessionData.gamesPlayed || 0));
        } else {
          // ✅ EXISTING: Regular Session Logik (unverändert)
          playerTeamForGameStats = getPlayerTeamAssignment(playerId, sessionData);
          
          if (!playerTeamForGameStats) {
            logger.warn(`Player ${playerId} not found in teams structure for regular session ${sessionDoc.id}`);
            return;
          }
          
          // KORRIGIERT: Punkte-Statistiken mit korrekter Team-Zuordnung
          if (sessionData.finalScores) {
            if (!playerPointsStats.has(playerId)) {
              playerPointsStats.set(playerId, { made: 0, received: 0, games: 0 });
            }
            
            const pointsStats = playerPointsStats.get(playerId)!;
            pointsStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele dieser Session
            
            // VEREINFACHT: Direkte top/bottom Zuordnung ohne teamScoreMapping
            if (playerTeamForGameStats === 'top') {
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
            const playerStriche = sessionData.finalStriche[playerTeamForGameStats] || {};
            const opponentStriche = sessionData.finalStriche[playerTeamForGameStats === 'top' ? 'bottom' : 'top'] || {};
            
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
          
          // Zähle die Spiele der Session IMMER zur Gesamtzahl hinzu
          gameStats.games += sessionData.gamesPlayed || 0;
          
          // ✅ NEU & KORRIGIERT: Verwende exakte gameWinsByPlayer-Daten.
          // Die Logik hier muss exakt sein, da wir jetzt wissen, dass die Daten da sind.
          if (sessionData.gameWinsByPlayer && sessionData.gameWinsByPlayer[playerId]) {
            const playerWinData = sessionData.gameWinsByPlayer[playerId];
            if (typeof playerWinData.wins === 'number') {
              gameStats.wins += playerWinData.wins;
            }
            if (typeof playerWinData.losses === 'number') {
              gameStats.losses += playerWinData.losses;
            }
          } else {
            // Dieser Fall sollte nach unserer Verifizierung nicht mehr eintreten, aber wir loggen ihn sicherheitshalber.
            logger.warn(`[groupStatsCalculator] No 'gameWinsByPlayer' data found for player ${playerId} in session ${sessionDoc.id}. Wins/losses for this session will be 0.`);
          }
          
          // ✅ OPTIMIERT: Event-Statistiken direkt aus eventCounts verwenden (DRASTISCHE PERFORMANCE-VERBESSERUNG)
          if (sessionData.eventCounts) {
            // VEREINFACHT: Direkte top/bottom Zuordnung
            const playerEventCounts = sessionData.eventCounts[playerTeamForGameStats] || {};
            const opponentEventCounts = sessionData.eventCounts[playerTeamForGameStats === 'top' ? 'bottom' : 'top'] || {};

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
            weisStats.made += sessionData.sessionTotalWeisPoints[playerTeamForGameStats] || 0;
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
              
      // ✅ OPTIMIERT: Verwende Session-Level eventCounts für Matsch-Totals (wenn verfügbar)
      if (sessionData.eventCounts) {
        const topMatsch = sessionData.eventCounts.top?.matsch || 0;
        const bottomMatsch = sessionData.eventCounts.bottom?.matsch || 0;
        totalMatschCount += topMatsch + bottomMatsch;
      } else if (!isTournamentSession) {
        // Fallback: Einzelspiel-Berechnung nur für Regular Sessions
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
      } else if (!isTournamentSession) {
        // Fallback: Einzelspiel-Trumpf-Zählung nur für Regular Sessions
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

      // ✅ OPTIMIERT: Session-Dauer aus Session-Level Daten
      // ✅ KRITISCH: Alle Sessions (Regular + Tournament) zählen zur Gesamtspielzeit
      totalPlayTimeMillis += sessionData.durationSeconds ? sessionData.durationSeconds * 1000 : 0;

      // ✅ OPTIMIERT: Verwende vorkalkulierte Spiel-Anzahl
      calculatedStats.gameCount += sessionData.gamesPlayed || 0;
    }

    // Schritt 4: Basis-Statistiken berechnen
        calculatedStats.totalPlayTimeSeconds = Math.round(totalPlayTimeMillis / 1000);
    calculatedStats.firstJassTimestamp = firstJassTimestamp;
    calculatedStats.lastJassTimestamp = lastJassTimestamp;
        
    // ✅ KORRIGIERT: Durchschnittswerte mit separater Session/Tournament-Logik
    // ✅ KRITISCH: Berechne Session-Dauer nur für Regular Sessions
    let totalRegularSessionPlayTimeMillis = 0;
    for (const sessionDoc of regularSessions) {
      const sessionData = sessionDoc.data();
      totalRegularSessionPlayTimeMillis += sessionData.durationSeconds ? sessionData.durationSeconds * 1000 : 0;
    }
    
    // Durchschnittswerte
    if (calculatedStats.sessionCount > 0 && totalRegularSessionPlayTimeMillis > 0) {
        calculatedStats.avgSessionDurationSeconds = Math.round((totalRegularSessionPlayTimeMillis / calculatedStats.sessionCount) / 1000);
    }

    if (calculatedStats.gameCount > 0 && totalPlayTimeMillis > 0) {
        calculatedStats.avgGameDurationSeconds = Math.round((totalPlayTimeMillis / calculatedStats.gameCount) / 1000);
    }

    // ✅ KRITISCH: avgGamesPerSession nur für Regular Sessions berechnen
    if (calculatedStats.gameCount > 0 && calculatedStats.sessionCount > 0) {
        // Berechne Spiele nur aus Regular Sessions für diesen Durchschnitt
        let regularSessionGameCount = 0;
        for (const sessionDoc of regularSessions) {
          const sessionData = sessionDoc.data();
          regularSessionGameCount += sessionData.gamesPlayed || 0;
        }
        calculatedStats.avgGamesPerSession = parseFloat((regularSessionGameCount / calculatedStats.sessionCount).toFixed(2));
    }
    
    // ✅ KORREKTUR: avgRoundsPerGame nur für Regular Sessions berechnen (Turniere ausschließen)
    if (totalRounds > 0) {
        // Berechne Spiele nur aus Regular Sessions für korrekte Rundendurchschnitte
        let regularSessionGameCount = 0;
        for (const sessionDoc of regularSessions) {
          const sessionData = sessionDoc.data();
          regularSessionGameCount += sessionData.gamesPlayed || 0;
        }
        
        if (regularSessionGameCount > 0) {
            calculatedStats.avgRoundsPerGame = parseFloat((totalRounds / regularSessionGameCount).toFixed(2));
            logger.info(`[calculateGroupStatisticsInternal] Runden-Berechnung: ${totalRounds} Runden aus ${regularSessionGameCount} Regular-Session-Spielen = ${calculatedStats.avgRoundsPerGame} avg`);
        } else {
            calculatedStats.avgRoundsPerGame = 0;
        }
        
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

    // ✅ ENTFERNT: Alte Matsch-Rate Berechnung wurde durch Bilanz ersetzt (siehe oben)

    // ✅ ENTFERNT: Alte Schneider-Rate Berechnung wurde durch Bilanz ersetzt

    // ✅ ENTFERNT: Alte Kontermatsch-Rate Berechnung wurde durch Bilanz ersetzt

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
      matschReceived: number;
      schneiderMade: number;
      schneiderReceived: number;
      kontermatschMade: number;
      kontermatschReceived: number;
      weisMade: number;
      roundTimes: number[];
      playerNames: string[];
    }>();

    // ✅ KORRIGIERT: Session-basierte Team-Statistiken mit Tournament-Awareness
    // ✅ KRITISCH: Regular Sessions vs Tournament Sessions unterschiedlich behandeln
    
    // ✅ SCHRITT 1: Regular Sessions - verwende Session-Level Teams
    regularSessions.forEach(sessionDoc => {
      const sessionData = sessionDoc.data();
      if (!validateSessionDataEnhanced(sessionData)) return;
      
      // Extrahiere Team-Zuordnungen für Regular Sessions
      const teams = extractTeamsWithPlayerDocIds(sessionData);
      if (teams.top.length !== 2 || teams.bottom.length !== 2) {
        logger.warn(`Regular session ${sessionDoc.id} hat ungültige Team-Struktur, überspringe Team-Statistiken`);
        return;
      }

      const topPlayerIds = teams.top;
      const bottomPlayerIds = teams.bottom;
        
      const topNames = topPlayerIds.map((id: string) => playerIdToNameMap.get(id) || 'Unbekannt');
      const bottomNames = bottomPlayerIds.map((id: string) => playerIdToNameMap.get(id) || 'Unbekannt');
        
      const topKey = createCanonicalTeamKey(topPlayerIds);
      const bottomKey = createCanonicalTeamKey(bottomPlayerIds);
        
      // ✅ OPTIMIERT: Top Team - Session-Level Aggregation für Regular Sessions
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
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
          kontermatschMade: 0,
          kontermatschReceived: 0,
          weisMade: 0,
          roundTimes: [],
          playerNames: topNames
        });
      }
        
      const topStats = teamPairings.get(topKey)!;
      
      // ✅ KORRIGIERT: Session-Counts für Regular Sessions
      topStats.sessions++;
      
      // Session-Gewinn für Regular Sessions
      if (sessionData.winnerTeamKey === 'top') {
        topStats.sessionWins++;
      }
      
      // ✅ WICHTIG: Spiel-Counts für Regular Sessions
      topStats.games += sessionData.gamesPlayed || 0;
      
      // ✅ KORRIGIERT: Spielgewinne für das Team aus Session-Level Daten
      if (sessionData.gameWinsByTeam && typeof sessionData.gameWinsByTeam.top === 'number') {
        topStats.wins += sessionData.gameWinsByTeam.top;
      } else {
        logger.warn(`[groupStatsCalculator] No gameWinsByTeam data for top team in regular session ${sessionDoc.id}.`);
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
        const bottomEventCounts = sessionData.eventCounts.bottom || {};
        
        topStats.matschMade += topEventCounts.matsch || 0;
        topStats.schneiderMade += topEventCounts.schneider || 0;
        topStats.kontermatschMade += topEventCounts.kontermatsch || 0;
        
        // Füge "received" Statistiken hinzu (von opponent team)
        topStats.matschReceived += bottomEventCounts.matsch || 0;
        topStats.schneiderReceived += bottomEventCounts.schneider || 0;
        topStats.kontermatschReceived += bottomEventCounts.kontermatsch || 0;
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
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
          kontermatschMade: 0,
          kontermatschReceived: 0,
          weisMade: 0,
          roundTimes: [],
          playerNames: bottomNames
        });
      }
        
      const bottomStats = teamPairings.get(bottomKey)!;
      
      // ✅ KORRIGIERT: Session-Counts für Regular Sessions
      bottomStats.sessions++;
      
      // Session-Gewinn für Regular Sessions
      if (sessionData.winnerTeamKey === 'bottom') {
        bottomStats.sessionWins++;
      }
      
      // ✅ WICHTIG: Spiel-Counts für Regular Sessions
      bottomStats.games += sessionData.gamesPlayed || 0;

      // ✅ KORRIGIERT: Spielgewinne für das Team
      if (sessionData.gameWinsByTeam && typeof sessionData.gameWinsByTeam.bottom === 'number') {
        bottomStats.wins += sessionData.gameWinsByTeam.bottom;
      } else {
        logger.warn(`[groupStatsCalculator] No gameWinsByTeam data for bottom team in regular session ${sessionDoc.id}.`);
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
        const topEventCounts = sessionData.eventCounts.top || {};
        
        bottomStats.matschMade += bottomEventCounts.matsch || 0;
        bottomStats.schneiderMade += bottomEventCounts.schneider || 0;
        bottomStats.kontermatschMade += bottomEventCounts.kontermatsch || 0;
        
        // Füge "received" Statistiken hinzu (von opponent team)
        bottomStats.matschReceived += topEventCounts.matsch || 0;
        bottomStats.schneiderReceived += topEventCounts.schneider || 0;
        bottomStats.kontermatschReceived += topEventCounts.kontermatsch || 0;
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

    // ✅ SCHRITT 2: Tournament Sessions - verwende gameResults für Team-Zuordnungen
    tournamentSessions.forEach(sessionDoc => {
      const sessionData = sessionDoc.data();
      if (!validateSessionDataEnhanced(sessionData)) return;
      
      // ✅ NEU: Tournament-Sessions verwenden gameResults für Team-Statistiken
      if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
        sessionData.gameResults.forEach((game: any, gameIndex: number) => {
          if (game.teams?.top?.players && game.teams?.bottom?.players) {
            const gameTopPlayerIds = game.teams.top.players.map((p: any) => p.playerId).filter(Boolean);
            const gameBottomPlayerIds = game.teams.bottom.players.map((p: any) => p.playerId).filter(Boolean);
            
            if (gameTopPlayerIds.length !== 2 || gameBottomPlayerIds.length !== 2) {
              logger.warn(`Tournament session ${sessionDoc.id} game ${gameIndex + 1} hat ungültige Team-Struktur, überspringe`);
              return;
            }
            
            const topNames = gameTopPlayerIds.map((id: string) => playerIdToNameMap.get(id) || 'Unbekannt');
            const bottomNames = gameBottomPlayerIds.map((id: string) => playerIdToNameMap.get(id) || 'Unbekannt');
              
            const topKey = createCanonicalTeamKey(gameTopPlayerIds);
            const bottomKey = createCanonicalTeamKey(gameBottomPlayerIds);
            
            // ✅ NEU: Top Team für Tournament-Spiel
            if (!teamPairings.has(topKey)) {
              teamPairings.set(topKey, { 
                playerIds: gameTopPlayerIds,
                games: 0, 
                wins: 0,
                sessions: 0,
                sessionWins: 0,
                pointsMade: 0, 
                pointsReceived: 0,
                stricheMade: 0,
                stricheReceived: 0,
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0,
                weisMade: 0,
                roundTimes: [],
                playerNames: topNames
              });
            }
            
            const topStats = teamPairings.get(topKey)!;
            
            // ✅ WICHTIG: Spiel-Counts für Tournament-Sessions (Sessions werden NICHT gezählt)
            topStats.games += 1; // Ein Spiel
            
            // ✅ KORRIGIERT: Spielgewinne für Tournament-Sessions
            if (game.winnerTeam === 'top') {
              topStats.wins += 1;
            }

            // ✅ KORRIGIERT: Punkte aus Game-Level Daten
            if (game.topScore !== undefined && game.bottomScore !== undefined) {
              topStats.pointsMade += game.topScore || 0;
              topStats.pointsReceived += game.bottomScore || 0;
            }

            // ✅ KORRIGIERT: Striche aus Game-Level finalStriche
            if (game.finalStriche) {
              const topStriche = game.finalStriche.top || {};
              const bottomStriche = game.finalStriche.bottom || {};
                
              const topStricheTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + (topStriche.matsch || 0) + (topStriche.schneider || 0) + (topStriche.kontermatsch || 0);
              const bottomStricheTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + (bottomStriche.kontermatsch || 0);
                
              topStats.stricheMade += topStricheTotal;
              topStats.stricheReceived += bottomStricheTotal;
              
              // ✅ KORRIGIERT: Event-Statistiken aus Game-Level finalStriche
              topStats.matschMade += topStriche.matsch || 0;
              topStats.schneiderMade += topStriche.schneider || 0;
              topStats.kontermatschMade += topStriche.kontermatsch || 0;
              
              // Füge "received" Statistiken hinzu (von opponent team)
              topStats.matschReceived += bottomStriche.matsch || 0;
              topStats.schneiderReceived += bottomStriche.schneider || 0;
              topStats.kontermatschReceived += bottomStriche.kontermatsch || 0;
            }

            // ✅ NEU: Bottom Team für Tournament-Spiel (identische Logik)
            if (!teamPairings.has(bottomKey)) {
              teamPairings.set(bottomKey, { 
                playerIds: gameBottomPlayerIds,
                games: 0, 
                wins: 0,
                sessions: 0,
                sessionWins: 0,
                pointsMade: 0, 
                pointsReceived: 0,
                stricheMade: 0,
                stricheReceived: 0,
                matschMade: 0,
                matschReceived: 0,
                schneiderMade: 0,
                schneiderReceived: 0,
                kontermatschMade: 0,
                kontermatschReceived: 0,
                weisMade: 0,
                roundTimes: [],
                playerNames: bottomNames
              });
            }
              
            const bottomStats = teamPairings.get(bottomKey)!;
            
            // ✅ WICHTIG: Spiel-Counts für Tournament-Sessions
            bottomStats.games += 1; // Ein Spiel

            // ✅ KORRIGIERT: Spielgewinne für Tournament-Sessions
            if (game.winnerTeam === 'bottom') {
              bottomStats.wins += 1;
            }

            // Punkte aus Game-Level Daten
            if (game.topScore !== undefined && game.bottomScore !== undefined) {
              bottomStats.pointsMade += game.bottomScore || 0;
              bottomStats.pointsReceived += game.topScore || 0;
            }

            // Striche aus Game-Level finalStriche
            if (game.finalStriche) {
              const topStriche = game.finalStriche.top || {};
              const bottomStriche = game.finalStriche.bottom || {};
                
              const topStricheTotal = (topStriche.berg || 0) + (topStriche.sieg || 0) + (topStriche.matsch || 0) + (topStriche.schneider || 0) + (topStriche.kontermatsch || 0);
              const bottomStricheTotal = (bottomStriche.berg || 0) + (bottomStriche.sieg || 0) + (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + (bottomStriche.kontermatsch || 0);
                
              bottomStats.stricheMade += bottomStricheTotal;
              bottomStats.stricheReceived += topStricheTotal;
              
              // Event-Statistiken aus Game-Level finalStriche
              bottomStats.matschMade += bottomStriche.matsch || 0;
              bottomStats.schneiderMade += bottomStriche.schneider || 0;
              bottomStats.kontermatschMade += bottomStriche.kontermatsch || 0;
              
              // Füge "received" Statistiken hinzu (von opponent team)
              bottomStats.matschReceived += topStriche.matsch || 0;
              bottomStats.schneiderReceived += topStriche.schneider || 0;
              bottomStats.kontermatschReceived += topStriche.kontermatsch || 0;
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

    // Team mit höchster Matsch-Bilanz (normalisierte Differenz pro Spiel)
    const teamMatschRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        // Normalisierte Differenz-Rate: (gemacht - erhalten) / anzahl_spiele
        const matschBilanz = stats.matschMade - stats.matschReceived;
        teamMatschRateList.push({
          names: stats.playerNames,
          value: matschBilanz,
          eventsPlayed: stats.games,
          eventsMade: stats.matschMade,
          eventsReceived: stats.matschReceived,
        });
      }
    });
    teamMatschRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestMatschBilanz = teamMatschRateList;

    // Team mit höchster Schneider-Bilanz (normalisierte Differenz pro Spiel)
    const teamSchneiderRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        // Normalisierte Differenz-Rate: (gemacht - erhalten) / anzahl_spiele
        const schneiderBilanz = stats.schneiderMade - stats.schneiderReceived;
        teamSchneiderRateList.push({
          names: stats.playerNames,
          value: schneiderBilanz,
          eventsPlayed: stats.games,
          eventsMade: stats.schneiderMade,
          eventsReceived: stats.schneiderReceived,
        });
      }
    });
    teamSchneiderRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestSchneiderBilanz = teamSchneiderRateList;

    // Team mit höchster Kontermatsch-Bilanz (normalisierte Differenz pro Spiel)
    const teamKontermatschRateList: GroupStatHighlightTeam[] = [];
    teamPairings.forEach((stats, teamKey) => {
      const isTeamActive = stats.playerIds.some(pid => {
        const lastActivity = playerLastActivity.get(pid);
        return lastActivity ? lastActivity.toMillis() >= oneYearAgo : false;
      });
      if (stats.games >= 1 && isTeamActive) {
        // Normalisierte Differenz-Rate: (gemacht - erhalten) / anzahl_spiele
        const kontermatschBilanz = stats.kontermatschMade - stats.kontermatschReceived;
        teamKontermatschRateList.push({
          names: stats.playerNames,
          value: kontermatschBilanz, // 3 Dezimalstellen für seltene Events
          eventsPlayed: stats.games,
        });
      }
    });
    teamKontermatschRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestKontermatschBilanz = teamKontermatschRateList;

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
      teamWithHighestMatschBilanzCount: calculatedStats.teamWithHighestMatschBilanz?.length || 0,
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

    // ✅ GEÄNDERT: Spieler mit höchster Matsch-Bilanz (absolute Zahlen statt Rate)
    const playerMatschBilanzList: GroupStatHighlightPlayer[] = [];
    playerMatschStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games >= 1) {
        const matschBilanz = stats.made - stats.received;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerMatschBilanzList.push({
          playerId,
          playerName: playerName,
          value: matschBilanz, // ✅ Absolute Differenz statt Rate
          eventsPlayed: stats.games,
          eventsMade: stats.made, // ✅ NEU: Für Bilanz-Details
          eventsReceived: stats.received, // ✅ NEU: Für Bilanz-Details
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerMatschBilanzList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestMatschBilanz = playerMatschBilanzList;

    // ✅ GEÄNDERT: Spieler mit höchster Schneider-Bilanz (absolute Zahlen statt Rate)
    const playerSchneiderBilanzList: GroupStatHighlightPlayer[] = [];
    playerSchneiderStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && stats.games >= 1) {
        const schneiderBilanz = stats.made - stats.received;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerSchneiderBilanzList.push({
          playerId,
          playerName: playerName,
          value: schneiderBilanz, // ✅ Absolute Differenz statt Rate
          eventsPlayed: stats.games,
          eventsMade: stats.made, // ✅ NEU: Für Bilanz-Details
          eventsReceived: stats.received, // ✅ NEU: Für Bilanz-Details
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerSchneiderBilanzList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestSchneiderBilanz = playerSchneiderBilanzList;

    // ✅ GEÄNDERT: Spieler mit höchster Kontermatsch-Bilanz (absolute Zahlen + Filterung)
    const playerKontermatschBilanzList: GroupStatHighlightPlayer[] = [];
    playerKontermatschStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      // ✅ SMART: Nur Spieler mit Kontermatsch-Erfahrung anzeigen
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && (stats.made > 0 || stats.received > 0)) {
        const kontermatschBilanz = stats.made - stats.received;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerKontermatschBilanzList.push({
          playerId,
          playerName: playerName,
          value: kontermatschBilanz, // ✅ Absolute Differenz statt Rate
          eventsPlayed: stats.games,
          eventsMade: stats.made, // ✅ NEU: Für Bilanz-Details
          eventsReceived: stats.received, // ✅ NEU: Für Bilanz-Details
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerKontermatschBilanzList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestKontermatschBilanz = playerKontermatschBilanzList;

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
    // Sessions zählen und separieren
    const sessionsSnap = await db.collection(JASS_SUMMARIES_COLLECTION)
      .where("groupId", "==", groupId)
      .where("status", "==", "completed")
      .get();
    
    let regularSessionsCount = 0;
    let tournamentSessionsCount = 0;
    let totalGames = 0;
    let totalRounds = 0;
    let dataErrors = 0;
    
    // Sessions separieren und zählen
    sessionsSnap.docs.forEach(doc => {
      const sessionData = doc.data();
      if (sessionData.tournamentId) {
        tournamentSessionsCount++;
      } else {
        regularSessionsCount++;
      }
    });
    
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
      sessionsCount: regularSessionsCount,
      tournamentsCount: tournamentSessionsCount,
      gamesCount: totalGames,
      roundsCount: totalRounds,
      dataErrors: dataErrors
    };
  } catch (error) {
    logger.warn(`Error collecting raw data summary for group ${groupId}:`, error);
    return {
      sessionsCount: 0,
      tournamentsCount: 0,
      gamesCount: 0,
      roundsCount: 0,
      dataErrors: 1
    };
    }
} 