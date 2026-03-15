import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { GroupComputedStats, initialGroupComputedStats, GroupStatHighlightPlayer, GroupStatHighlightTeam } from "./models/group-stats.model";

const db = admin.firestore();

const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const GROUPS_COLLECTION = 'groups';

const normalizeTrumpfKey = (farbe: string): string => {
  const normalized = String(farbe || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['eicheln', 'eichel', 'eichle', 'schaufel', 'gras'].includes(normalized)) return 'eichel';
  if (['rosen', 'rose', 'kreuz'].includes(normalized)) return 'rosen';
  if (['schellen', 'schelle', 'schalle', 'herz'].includes(normalized)) return 'schellen';
  if (['schilten', 'schilte', 'ecke'].includes(normalized)) return 'schilten';
  if (normalized === 'une' || normalized === 'unde') return 'unde';
  if (normalized === 'misere' || normalized === 'miserefr') return 'misère';
  if (normalized === 'trumpf') return 'obe';

  return normalized;
};

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

// ✅ PHASE 3 IMPLEMENTIERT: Tournament-Rundenzeiten pro Team
// - Tournament Games haben roundDurationsByPlayer pro Game
// - Diese werden in processTournamentCompletion.ts beim Game-Abschluss berechnet
// - groupStatsCalculator lädt sie via passeNumber-Query aus tournaments/{tournamentId}/games
// - Einfach, elegant, robust! ✅

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

/**
 * Berechnet den Median eines Arrays von Zahlen
 * Robuster als Durchschnitt gegen Ausreißer (z.B. unterbrochene Runden)
 * @param values - Array von Zahlen
 * @returns Median-Wert oder 0 bei leerem Array
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    // Bei gerader Anzahl: Durchschnitt der beiden mittleren Werte
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  // Bei ungerader Anzahl: Mittlerer Wert
  return sorted[mid];
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

        // Schritt 2: Alle abgeschlossenen Sessions der Gruppe laden (NEUE ARCHITEKTUR)
        logger.info(`[NEW ARCHITECTURE] 📊 Lese Sessions aus groups/${groupId}/jassGameSummaries`);
        
        const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
            .where("status", "==", "completed")
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
    const playerWeisStats = new Map<string, { made: number; received: number; games: number }>();
    const playerRoundTimes = new Map<string, number[]>();
    const trumpfCounts = new Map<string, number>();

    // ✅ Player-ID zu Namen-Map wird nach allSessions-Definition befüllt
    const playerIdToNameMap = new Map<string, string>();
    
    // Schritt 3: Alle Sessions und Spiele verarbeiten
    // ✅ KORRIGIERT: Verarbeite ALLE Sessions (Regular + Tournament) für Spiel-Statistiken,
    // aber unterscheide für Session-basierte Statistiken
    const allSessions = [...regularSessions, ...tournamentSessions];
    
    // ✅ KORRIGIERT: Player-ID zu Namen-Map vollständig aus players Collection laden (analog zu playerStatsCalculator)
    // Step 1: Sammle alle unique Player-IDs aus allen Sessions für effizientes Laden
    const allPlayerIdsInvolved = new Set<string>();
    allSessions.forEach(sessionDoc => {
      const sessionData = sessionDoc.data();
      const sessionPlayerDocIds = extractPlayerDocIdsFromSessionSimple(sessionData);
      sessionPlayerDocIds.forEach(id => allPlayerIdsInvolved.add(id));
    });
    
    // Step 2: Lade alle Player-Dokumente auf einmal und erstelle Lookup-Map
    if (allPlayerIdsInvolved.size > 0) {
      try {
        const playerDocs = await db.collection('players').where(admin.firestore.FieldPath.documentId(), 'in', Array.from(allPlayerIdsInvolved)).get();
        playerDocs.forEach(doc => {
          playerIdToNameMap.set(doc.id, doc.data()?.displayName || 'Unbekannt');
        });
        logger.info(`[calculateGroupStatisticsInternal] Loaded ${playerDocs.size} player names from players collection`);
      } catch (error) {
        logger.error(`[calculateGroupStatisticsInternal] Error loading player names:`, error);
      }
    }
    
    // Step 3: Ergänze aus Gruppendaten (als Fallback und für Vollständigkeit)
    Object.entries(groupData.players || {}).forEach(([playerId, playerData]) => {
      if (playerData.displayName && !playerIdToNameMap.has(playerId)) {
        playerIdToNameMap.set(playerId, playerData.displayName);
      }
    });

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
          // ✅ OPTIMIERT: Für Tournament-Sessions verwende bereits aggregierte Daten aus jassGameSummary
          // Diese sind bereits korrekt berechnet in finalizeTournament.ts
          
          // ✅ OPTIMIERT: Punkte-Statistiken aus totalPointsByPlayer (bereits aggregiert)
          if (sessionData.totalPointsByPlayer && sessionData.totalPointsByPlayer[playerId] !== undefined) {
            if (!playerPointsStats.has(playerId)) {
              playerPointsStats.set(playerId, { made: 0, received: 0, games: 0 });
            }
            
            const pointsStats = playerPointsStats.get(playerId)!;
            pointsStats.games += sessionData.gamesPlayed || 0;
            
            // ✅ Für Turniere: Berechne "received" aus Differenz zu anderen Spielern
            // Da wir nur totalPointsByPlayer haben, müssen wir received anders berechnen
            // ODER: Iteriere über gameResults für Punkte (da totalPointsByPlayer nur "made" ist)
            // ABER: Für Striche/Events können wir totalStricheByPlayer/totalEventCountsByPlayer verwenden!
            
            // ✅ FALLBACK: Iteriere über gameResults für Punkte (da totalPointsByPlayer nur "made" ist)
          if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
              sessionData.gameResults.forEach((game: any) => {
              if (game.teams?.top?.players && game.teams?.bottom?.players) {
                const gameTopPlayerIds = game.teams.top.players.map((p: any) => p.playerId).filter(Boolean);
                const gameBottomPlayerIds = game.teams.bottom.players.map((p: any) => p.playerId).filter(Boolean);
                
                let gamePlayerTeam: 'top' | 'bottom' | null = null;
                if (gameTopPlayerIds.includes(playerId)) {
                  gamePlayerTeam = 'top';
                } else if (gameBottomPlayerIds.includes(playerId)) {
                  gamePlayerTeam = 'bottom';
                }
                
                  if (gamePlayerTeam && game.topScore !== undefined && game.bottomScore !== undefined) {
                    if (gamePlayerTeam === 'top') {
                      pointsStats.received += game.bottomScore || 0;
                    } else {
                      pointsStats.received += game.topScore || 0;
                    }
                  }
                }
              });
            }
            
            // ✅ Verwende totalPointsByPlayer für "made"
            pointsStats.made += sessionData.totalPointsByPlayer[playerId] || 0;
          }
                  
          // ✅ OPTIMIERT: Striche-Statistiken aus totalStricheByPlayer (bereits aggregiert)
          if (sessionData.totalStricheByPlayer && sessionData.totalStricheByPlayer[playerId]) {
                    if (!playerStricheStats.has(playerId)) {
                      playerStricheStats.set(playerId, { made: 0, received: 0, games: 0 });
                    }
                    
                    const stricheStats = playerStricheStats.get(playerId)!;
            stricheStats.games += sessionData.gamesPlayed || 0;
                    
            const playerStriche = sessionData.totalStricheByPlayer[playerId];
                    const playerTotal = (playerStriche.berg || 0) + (playerStriche.sieg || 0) + (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + (playerStriche.kontermatsch || 0);
                      
                    stricheStats.made += playerTotal;
            
            // ✅ Berechne "received" aus Differenz zu anderen Spielern
            // Summiere alle Striche aller anderen Spieler
            let opponentTotal = 0;
            Object.entries(sessionData.totalStricheByPlayer || {}).forEach(([otherPlayerId, otherStriche]: [string, any]) => {
              if (otherPlayerId !== playerId) {
                const otherTotal = (otherStriche.berg || 0) + (otherStriche.sieg || 0) + (otherStriche.matsch || 0) + (otherStriche.schneider || 0) + (otherStriche.kontermatsch || 0);
                opponentTotal += otherTotal;
              }
            });
                    
            // ✅ KORREKTUR: Bei Turnieren spielt jeder Spieler gegen verschiedene Gegner
            // "received" sollte die Summe der Striche aller Gegner-Teams sein
            // Da Teams wechseln, müssen wir über gameResults iterieren
            if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
              let receivedStriche = 0;
              sessionData.gameResults.forEach((game: any) => {
                if (game.teams?.top?.players && game.teams?.bottom?.players) {
                  const gameTopPlayerIds = game.teams.top.players.map((p: any) => p.playerId).filter(Boolean);
                  const gameBottomPlayerIds = game.teams.bottom.players.map((p: any) => p.playerId).filter(Boolean);
                  
                  let gamePlayerTeam: 'top' | 'bottom' | null = null;
                  if (gameTopPlayerIds.includes(playerId)) {
                    gamePlayerTeam = 'top';
                  } else if (gameBottomPlayerIds.includes(playerId)) {
                    gamePlayerTeam = 'bottom';
                  }
                  
                  if (gamePlayerTeam && game.finalStriche) {
                    const opponentStriche = game.finalStriche[gamePlayerTeam === 'top' ? 'bottom' : 'top'] || {};
                    const opponentTotal = (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + (opponentStriche.kontermatsch || 0);
                    receivedStriche += opponentTotal;
                  }
                }
              });
              stricheStats.received += receivedStriche;
            }
          }
          
          // ✅ OPTIMIERT: Event-Statistiken aus totalEventCountsByPlayer (bereits aggregiert)
          if (sessionData.totalEventCountsByPlayer && sessionData.totalEventCountsByPlayer[playerId]) {
            const playerEventCounts = sessionData.totalEventCountsByPlayer[playerId];
            
            // ✅ OPTIMIERT: Matsch-Statistiken
                      if (!playerMatschStats.has(playerId)) {
                        playerMatschStats.set(playerId, { made: 0, received: 0, games: 0 });
                      }
            const matschStats = playerMatschStats.get(playerId)!;
            matschStats.games += sessionData.gamesPlayed || 0;
            matschStats.made += playerEventCounts.matschMade || 0;
            matschStats.received += playerEventCounts.matschReceived || 0;
            
            // ✅ OPTIMIERT: Schneider-Statistiken
                      if (!playerSchneiderStats.has(playerId)) {
                        playerSchneiderStats.set(playerId, { made: 0, received: 0, games: 0 });
                      }
            const schneiderStats = playerSchneiderStats.get(playerId)!;
            schneiderStats.games += sessionData.gamesPlayed || 0;
            schneiderStats.made += playerEventCounts.schneiderMade || 0;
            schneiderStats.received += playerEventCounts.schneiderReceived || 0;
            
            // ✅ OPTIMIERT: Kontermatsch-Statistiken
                      if (!playerKontermatschStats.has(playerId)) {
                        playerKontermatschStats.set(playerId, { made: 0, received: 0, games: 0 });
                      }
                      const kontermatschStats = playerKontermatschStats.get(playerId)!;
            kontermatschStats.games += sessionData.gamesPlayed || 0;
            kontermatschStats.made += playerEventCounts.kontermatschMade || 0;
            kontermatschStats.received += playerEventCounts.kontermatschReceived || 0;
                  }
                  
          // ✅ OPTIMIERT: Spiel-Gewinnraten aus gameWinsByPlayer (bereits aggregiert)
                  if (!playerGameStats.has(playerId)) {
                    playerGameStats.set(playerId, { wins: 0, losses: 0, games: 0 });
                  }
                  
                  const gameStats = playerGameStats.get(playerId)!;
          gameStats.games += sessionData.gamesPlayed || 0;
          
          // ✅ NEU: Verwende gameWinsByPlayer für Turniere (wie bei Regular Sessions)
          if (sessionData.gameWinsByPlayer && sessionData.gameWinsByPlayer[playerId]) {
            const playerWinData = sessionData.gameWinsByPlayer[playerId];
            if (typeof playerWinData.wins === 'number') {
              gameStats.wins += playerWinData.wins;
            }
            if (typeof playerWinData.losses === 'number') {
              gameStats.losses += playerWinData.losses;
                  }
          } else {
            logger.warn(`[groupStatsCalculator] No 'gameWinsByPlayer' data found for player ${playerId} in tournament session ${sessionDoc.id}. Wins/losses for this session will be 0.`);
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
              playerWeisStats.set(playerId, { made: 0, received: 0, games: 0 });
            }
            const weisStats = playerWeisStats.get(playerId)!;
            weisStats.games += sessionData.gamesPlayed || 0; // Anzahl Spiele der Session
                
            // VEREINFACHT: Direkte top/bottom Zuordnung
            weisStats.made += sessionData.sessionTotalWeisPoints[playerTeamForGameStats] || 0;
            weisStats.received += sessionData.sessionTotalWeisPoints[playerTeamForGameStats === 'top' ? 'bottom' : 'top'] || 0;
          }

          // ✅ OPTIMIERT: Verwende roundDurations Array direkt (Median-optimiert)
          if (sessionData.aggregatedRoundDurationsByPlayer && sessionData.aggregatedRoundDurationsByPlayer[playerId]) {
            if (!playerRoundTimes.has(playerId)) {
              playerRoundTimes.set(playerId, []);
            }
            
            const playerRoundDurations = sessionData.aggregatedRoundDurationsByPlayer[playerId];
            
            // Addiere zur Session-Total-Rundendauer
            totalRoundDurationMillis += playerRoundDurations.totalDuration;
                
            // ✅ MEDIAN: Verwende roundDurations Array (falls vorhanden)
            if (playerRoundDurations.roundDurations && Array.isArray(playerRoundDurations.roundDurations)) {
              // NEU: Direkt das gespeicherte Array verwenden
              playerRoundTimes.get(playerId)!.push(...playerRoundDurations.roundDurations);
            } else if (playerRoundDurations.roundCount > 0) {
              // FALLBACK: Alte Daten ohne roundDurations Array (für Migration-Übergangszeit)
              const avgRoundDuration = playerRoundDurations.totalDuration / playerRoundDurations.roundCount;
              for (let i = 0; i < playerRoundDurations.roundCount; i++) {
                playerRoundTimes.get(playerId)!.push(avgRoundDuration);
              }
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
                const normalizedFarbe = normalizeTrumpfKey(farbe);
                trumpfCounts.set(normalizedFarbe, (trumpfCounts.get(normalizedFarbe) || 0) + count);
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
                    const farbe = normalizeTrumpfKey(round.farbe);
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
        // ✅ KORRIGIERT: Session Win Rate - nur entschiedene Sessions berücksichtigen (Unentschieden ausschließen)
        const decidedSessions = stats.wins + stats.losses;
        const winRate = decidedSessions > 0 ? stats.wins / decidedSessions : 0;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerSessionWinRateList.push({
          playerId,
          playerName: playerName,
          value: parseFloat(winRate.toFixed(3)), // KORREKTUR: Keine *100 Multiplikation - Frontend macht das!
          eventsPlayed: decidedSessions, // ✅ KORRIGIERT: Nur entschiedene Sessions anzeigen
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

    // ✅ MEDIAN: Spieler-Rundenzeiten (Median statt Durchschnitt - robuster gegen Ausreißer)
    const playerAllRoundTimesList: GroupStatHighlightPlayer[] = [];
    playerRoundTimes.forEach((times, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && times.length >= 1) {
        // ✅ MEDIAN statt Durchschnitt: Robuster gegen Ausreißer (z.B. unterbrochene Runden)
        const medianTime = calculateMedian(times);
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerAllRoundTimesList.push({
          playerId,
          playerName: playerName,
          value: Math.round(medianTime),
          eventsPlayed: times.length, // Anzahl Sessions mit Rundenzeiten
          lastPlayedTimestamp: lastActivity,
          displayValue: `${Math.round(medianTime / 1000)}s`,
        });
      }
    });
    playerAllRoundTimesList.sort((a, b) => a.value - b.value); // Aufsteigend für schnellste → langsamste
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
      weisReceived: number; // ✅ NEU: Für Weisdifferenz-Berechnung
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
          weisReceived: 0, // ✅ NEU: Für Weisdifferenz-Berechnung
          roundTimes: [],
          playerNames: topNames
        });
      }
        
      const topStats = teamPairings.get(topKey)!;
      
      // ✅ KORRIGIERT: Session-Counts nur für entschiedene Sessions (Unentschieden ausschließen)
      if (sessionData.winnerTeamKey !== 'draw' && sessionData.winnerTeamKey !== 'tie') {
        topStats.sessions++;
        
        // Session-Gewinn für Regular Sessions
        if (sessionData.winnerTeamKey === 'top') {
          topStats.sessionWins++;
        }
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
        topStats.weisReceived += sessionData.sessionTotalWeisPoints.bottom || 0; // ✅ NEU: Gegner-Weis
      }

      // ✅ OPTIMIERT: Rundenzeiten aus aggregatedRoundDurationsByPlayer
      if (sessionData.aggregatedRoundDurationsByPlayer) {
        topPlayerIds.forEach(playerId => {
          const playerRoundData = sessionData.aggregatedRoundDurationsByPlayer[playerId];
          if (playerRoundData) {
            // ✅ MEDIAN-KORREKTUR: Verwende roundDurations Array falls vorhanden
            if (playerRoundData.roundDurations && Array.isArray(playerRoundData.roundDurations)) {
              topStats.roundTimes.push(...playerRoundData.roundDurations);
            } else if (playerRoundData.roundCount > 0) {
              // Fallback für alte Daten ohne roundDurations Array
              const avgRoundDuration = playerRoundData.totalDuration / playerRoundData.roundCount;
              for (let i = 0; i < playerRoundData.roundCount; i++) {
                topStats.roundTimes.push(avgRoundDuration);
              }
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
          weisReceived: 0, // ✅ NEU: Für Weisdifferenz-Berechnung
          roundTimes: [],
          playerNames: bottomNames
        });
      }
        
      const bottomStats = teamPairings.get(bottomKey)!;
      
      // ✅ KORRIGIERT: Session-Counts nur für entschiedene Sessions (Unentschieden ausschließen)
      if (sessionData.winnerTeamKey !== 'draw' && sessionData.winnerTeamKey !== 'tie') {
        bottomStats.sessions++;
        
        // Session-Gewinn für Regular Sessions
        if (sessionData.winnerTeamKey === 'bottom') {
          bottomStats.sessionWins++;
        }
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
        bottomStats.weisReceived += sessionData.sessionTotalWeisPoints.top || 0; // ✅ NEU: Gegner-Weis
      }

      // Rundenzeiten aus aggregatedRoundDurationsByPlayer
      if (sessionData.aggregatedRoundDurationsByPlayer) {
        bottomPlayerIds.forEach(playerId => {
          const playerRoundData = sessionData.aggregatedRoundDurationsByPlayer[playerId];
          if (playerRoundData) {
            // ✅ MEDIAN-KORREKTUR: Verwende roundDurations Array falls vorhanden
            if (playerRoundData.roundDurations && Array.isArray(playerRoundData.roundDurations)) {
              bottomStats.roundTimes.push(...playerRoundData.roundDurations);
            } else if (playerRoundData.roundCount > 0) {
              // Fallback für alte Daten ohne roundDurations Array
              const avgRoundDuration = playerRoundData.totalDuration / playerRoundData.roundCount;
              for (let i = 0; i < playerRoundData.roundCount; i++) {
                bottomStats.roundTimes.push(avgRoundDuration);
              }
            }
          }
        });
      }
    });

    // ✅ SCHRITT 2: Tournament Sessions - verwende gameResults für Team-Zuordnungen
    // ✅ WICHTIG: for...of statt forEach um async/await zu ermöglichen
    for (const sessionDoc of tournamentSessions) {
      const sessionData = sessionDoc.data();
      if (!validateSessionDataEnhanced(sessionData)) continue;
      
      // ✅ NEU: Tournament-Sessions verwenden gameResults für Team-Statistiken
      if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
        // ✅ WICHTIG: for...of statt forEach um async/await zu ermöglichen
        for (let gameIndex = 0; gameIndex < sessionData.gameResults.length; gameIndex++) {
          const game: any = sessionData.gameResults[gameIndex];
          if (game.teams?.top?.players && game.teams?.bottom?.players) {
            const gameTopPlayerIds = game.teams.top.players.map((p: any) => p.playerId).filter(Boolean);
            const gameBottomPlayerIds = game.teams.bottom.players.map((p: any) => p.playerId).filter(Boolean);
            
            if (gameTopPlayerIds.length !== 2 || gameBottomPlayerIds.length !== 2) {
              logger.warn(`Tournament session ${sessionDoc.id} game ${gameIndex + 1} hat ungültige Team-Struktur, überspringe`);
              continue;
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
                weisReceived: 0, // ✅ NEU: Für Weisdifferenz-Berechnung
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
              
              // ✅ KORRIGIERT: Event-Statistiken aus Game-Level eventCounts (nicht finalStriche!)
              if (game.eventCounts) {
                const gameTopEventCounts = game.eventCounts.top || {};
                const gameBottomEventCounts = game.eventCounts.bottom || {};
                
                topStats.matschMade += gameTopEventCounts.matsch || 0;
                topStats.schneiderMade += gameTopEventCounts.schneider || 0;
                topStats.kontermatschMade += gameTopEventCounts.kontermatsch || 0;
                
                // Füge "received" Statistiken hinzu (von opponent team)
                topStats.matschReceived += gameBottomEventCounts.matsch || 0;
                topStats.schneiderReceived += gameBottomEventCounts.schneider || 0;
                topStats.kontermatschReceived += gameBottomEventCounts.kontermatsch || 0;
              } else {
                // Fallback wenn eventCounts fehlt - aber mit Warnung
                logger.warn(`[groupStatsCalculator] Missing eventCounts for tournament game ${gameIndex + 1} in session ${sessionDoc.id}`);
                
                // WICHTIG: Verwende NICHT finalStriche als Fallback, da das falsche Werte liefert!
                // Events bleiben auf 0 wenn eventCounts fehlt
              }
            }
            
            // ✅ PHASE 3: Tournament-Rundenzeiten – zuerst direkt aus Summary lesen
            if (game.roundDurationsByPlayer && typeof game.roundDurationsByPlayer === 'object') {
              gameTopPlayerIds.forEach((playerId: string) => {
                const durations = game.roundDurationsByPlayer[playerId];
                if (durations && Array.isArray(durations) && durations.length > 0) {
                  topStats.roundTimes.push(...durations);
                }
              });
            } else if (sessionData.tournamentId) {
              // Fallback: Aus tournaments/{id}/games laden (passeNumber == gameNumber)
              try {
                const gameSnap = await db.collection(`tournaments/${sessionData.tournamentId}/games`)
                  .where('passeNumber', '==', game.gameNumber)
                  .limit(1)
                  .get();
                if (!gameSnap.empty) {
                  const gameData = gameSnap.docs[0].data();
                  if (gameData.roundDurationsByPlayer) {
                    gameTopPlayerIds.forEach((playerId: string) => {
                      const durations = gameData.roundDurationsByPlayer[playerId];
                      if (durations && Array.isArray(durations) && durations.length > 0) {
                        topStats.roundTimes.push(...durations);
                      }
                    });
                  }
                }
              } catch (error) {
                logger.warn(`[groupStatsCalculator] Could not load tournament game ${game.gameNumber} from tournament ${sessionData.tournamentId}:`, error);
              }
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
                weisReceived: 0, // ✅ NEU: Für Weisdifferenz-Berechnung
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
              
              // ✅ KORRIGIERT: Event-Statistiken aus Game-Level eventCounts (nicht finalStriche!)
              if (game.eventCounts) {
                const gameBottomEventCounts = game.eventCounts.bottom || {};
                const gameTopEventCounts = game.eventCounts.top || {};
                
                bottomStats.matschMade += gameBottomEventCounts.matsch || 0;
                bottomStats.schneiderMade += gameBottomEventCounts.schneider || 0;
                bottomStats.kontermatschMade += gameBottomEventCounts.kontermatsch || 0;
                
                // Füge "received" Statistiken hinzu (von opponent team)
                bottomStats.matschReceived += gameTopEventCounts.matsch || 0;
                bottomStats.schneiderReceived += gameTopEventCounts.schneider || 0;
                bottomStats.kontermatschReceived += gameTopEventCounts.kontermatsch || 0;
              } else {
                // Fallback wenn eventCounts fehlt - aber mit Warnung
                logger.warn(`[groupStatsCalculator] Missing eventCounts for tournament game ${gameIndex + 1} in session ${sessionDoc.id}`);
                
                // WICHTIG: Verwende NICHT finalStriche als Fallback, da das falsche Werte liefert!
                // Events bleiben auf 0 wenn eventCounts fehlt
              }
            }
            
            // ✅ PHASE 3: Tournament-Rundenzeiten – zuerst direkt aus Summary lesen (Bottom)
            if (game.roundDurationsByPlayer && typeof game.roundDurationsByPlayer === 'object') {
              gameBottomPlayerIds.forEach((playerId: string) => {
                const durations = game.roundDurationsByPlayer[playerId];
                if (durations && Array.isArray(durations) && durations.length > 0) {
                  bottomStats.roundTimes.push(...durations);
                }
              });
            } else if (sessionData.tournamentId) {
              // Fallback: Aus tournaments/{id}/games laden (passeNumber == gameNumber)
              try {
                const gameSnap = await db.collection(`tournaments/${sessionData.tournamentId}/games`)
                  .where('passeNumber', '==', game.gameNumber)
                  .limit(1)
                  .get();
                if (!gameSnap.empty) {
                  const gameData = gameSnap.docs[0].data();
                  if (gameData.roundDurationsByPlayer) {
                    gameBottomPlayerIds.forEach((playerId: string) => {
                      const durations = gameData.roundDurationsByPlayer[playerId];
                      if (durations && Array.isArray(durations) && durations.length > 0) {
                        bottomStats.roundTimes.push(...durations);
                      }
                    });
                  }
                }
              } catch (error) {
                logger.warn(`[groupStatsCalculator] Could not load tournament game ${game.gameNumber} from tournament ${sessionData.tournamentId}:`, error);
              }
            }
          }
        }
      }
    }

    // Team mit höchster Gewinnrate (Spiele)
    const teamWinRateList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.sessions >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
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
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
        // Normalisierte Differenz-Rate: (gemacht - erhalten) / anzahl_spiele
        const kontermatschBilanz = stats.kontermatschMade - stats.kontermatschReceived;
        teamKontermatschRateList.push({
          names: stats.playerNames,
          value: kontermatschBilanz,
          eventsPlayed: stats.games,
          eventsMade: stats.kontermatschMade,        // ✅ KORRIGIERT: Hinzugefügt für Klammerwerte
          eventsReceived: stats.kontermatschReceived, // ✅ KORRIGIERT: Hinzugefügt für Klammerwerte
        });
      }
    });
    teamKontermatschRateList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA;
    });
    calculatedStats.teamWithHighestKontermatschBilanz = teamKontermatschRateList;

    // Team mit bester Weisdifferenz (absolute Differenz)
        const teamWeisAvgList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Daten
      if (stats.games >= 1) {
        // ✅ KORRIGIERT: Absolute Differenz (analog zu Striche/Punkte-Differenz)
        const weisDiff = stats.weisMade - stats.weisReceived;
                teamWeisAvgList.push({
          names: stats.playerNames,
          value: weisDiff, // ✅ Absolute Differenz, nicht Durchschnitt!
          eventsPlayed: stats.games,
                });
            }
        });
    teamWeisAvgList.sort((a, b) => {
      const valA = typeof a.value === 'number' ? a.value : 0;
      const valB = typeof b.value === 'number' ? b.value : 0;
      return valB - valA; // Höchste Differenz zuerst
    });
        calculatedStats.teamWithMostWeisPointsAvg = teamWeisAvgList;

    // Team mit schnellsten Runden
        const teamFastestRoundsList: GroupStatHighlightTeam[] = [];
        teamPairings.forEach((stats, teamKey) => {
      // ✅ KEIN isTeamActive Filter: Zeige ALLE Teams mit Rundentempo-Daten
      if (stats.roundTimes.length >= 1) {
        // ✅ KORRIGIERT: Median statt Durchschnitt für konsistente Berechnung
        const medianTime = calculateMedian(stats.roundTimes);
                teamFastestRoundsList.push({
          names: stats.playerNames,
          value: Math.round(medianTime),
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

    // Spieler mit höchster Weis-Differenz
    const playerWeisDifferenceList: GroupStatHighlightPlayer[] = [];
    playerWeisStats.forEach((stats, playerId) => {
      const lastActivity = playerLastActivity.get(playerId);
      // ✅ SMART: Nur Spieler mit Weis-Erfahrung anzeigen
      if (lastActivity && lastActivity.toMillis() >= oneYearAgo && (stats.made > 0 || stats.received > 0)) {
        const weisDifference = stats.made - stats.received;
        const playerName = playerIdToNameMap.get(playerId) || groupData.players[playerId]?.displayName || "Unbekannter Jasser";
        playerWeisDifferenceList.push({
          playerId,
          playerName: playerName,
          value: weisDifference, // ✅ Absolute Differenz statt Durchschnitt
          eventsPlayed: stats.games,
          eventsMade: stats.made, // ✅ NEU: Für Bilanz-Details
          eventsReceived: stats.received, // ✅ NEU: Für Bilanz-Details
          lastPlayedTimestamp: lastActivity,
        });
      }
    });
    playerWeisDifferenceList.sort((a, b) => b.value - a.value);
    calculatedStats.playerWithHighestWeisDifference = playerWeisDifferenceList;

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
      
      // NEU: Lade den Gruppennamen aus der groups Collection
      try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (groupDoc.exists) {
          const groupData = groupDoc.data();
          newStats.groupName = groupData?.name || null;
          logger.info(`[updateGroupComputedStatsAfterSession] Loaded group name for ${groupId}: ${newStats.groupName}`);
        } else {
          logger.warn(`[updateGroupComputedStatsAfterSession] Group document ${groupId} not found, groupName will be null`);
          newStats.groupName = null;
        }
      } catch (nameError) {
        logger.error(`[updateGroupComputedStatsAfterSession] Error loading group name for ${groupId}:`, nameError);
        newStats.groupName = null; // Fallback to null if name loading fails
      }
      
      // Schritt 2: Validiere berechnete Statistiken
      logger.info(`[updateGroupComputedStatsAfterSession] Step 2: Validating calculated statistics for ${groupId}`);
      if (!validateCalculatedStats(newStats)) {
        throw new Error('Calculated statistics failed validation');
      }
      
      // Schritt 3: Sammle Rohdaten-Zusammenfassung für Logging
      const rawDataSummary = await collectRawDataSummary(groupId);
      
      // Schritt 4: Detailliertes Logging
      logStatisticsCalculation(groupId, newStats, rawDataSummary);
      
      // Schritt 5: Speichere Statistiken (NEUE ARCHITEKTUR)
      logger.info(`[updateGroupComputedStatsAfterSession] Step 3: Saving statistics to Firestore for ${groupId}`);
      await saveGroupStats(groupId, newStats);
      
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
    // Sessions zählen und separieren (NEUE ARCHITEKTUR)
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
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

/**
 * 🚀 NEUE ARCHITEKTUR: GroupStats in neuer Struktur speichern
 */
async function saveGroupStats(groupId: string, statsData: GroupComputedStats): Promise<void> {
  logger.info(`[NEW ARCHITECTURE] 📊 Schreibe GroupStats in groups/${groupId}/stats/computed`);
  
  const statsRef = db.collection('groups').doc(groupId).collection('stats').doc('computed');
  await statsRef.set(statsData, { merge: true });
  
  logger.info(`[NEW ARCHITECTURE] ✅ GroupStats für ${groupId} erfolgreich gespeichert`);
} 