import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { GroupComputedStats, initialGroupComputedStats, GroupStatHighlightPlayer, GroupStatHighlightTeam } from "./models/group-stats.model";
import { StricheRecord, TeamScores, CompletedGameData, SessionTeams, InitialSessionData, Round } from "./finalizeSession";

// Importiere die benötigten Typen aus der korrekten Quelle
interface StrokeSettings {
  schneider: 0 | 1 | 2;
  kontermatsch: 0 | 1 | 2;
}

interface ScoreSettingsEnabled {
  sieg: boolean;
  berg: boolean;
  schneider: boolean;
  matsch?: boolean;
  kontermatsch?: boolean;
}

// Default Settings definieren
const DEFAULT_SCORE_SETTINGS = {
  enabled: {
    sieg: true,
    berg: true,
    schneider: true,
    matsch: true,
    kontermatsch: true,
  } as ScoreSettingsEnabled
};

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const GROUPS_COLLECTION = 'groups';

// --- LOKALE TYPEN-ERWEITERUNG für diese Funktion ---
// ----------------------------------------------------

// Eine saubere, lokale Schnittstelle, die genau die Daten beschreibt, mit denen wir arbeiten.
interface ProcessableGameData extends CompletedGameData {
    id: string;
    sessionId: string;
    jassTyp?: string; // NEU: Hinzufügen, um den Jass-Typ für die Schneider-Berechnung zu kennen
}

// Interface für die Struktur der Spielerinformationen innerhalb des Group-Dokuments
interface GroupPlayerEntry {
  name: string;
  isGuest: boolean;
  authUid?: string; // Ist bei Gästen nicht vorhanden
  // playerDocId ist der Schlüssel in der Map/dem Objekt
}

// Interface für die von `determinePlayerInfoForStats` zurückgegebenen Informationen
interface ResolvedPlayerInfo {
  finalPlayerName: string;
  finalPlayerIdForStats: string; // Dies wird die playerDocId sein
  authUid?: string;
}

// Hilfsfunktion für Ortsnamen (vereinfacht für Backend)
const getOrtNameByPlz = (plz: string): string | null => {
  // TODO: Diese Funktion könnte mit einer echten PLZ-Datenbank erweitert werden
  // Für jetzt geben wir einfach die PLZ zurück oder null
  logger.info(`[getOrtNameByPlz] PLZ ${plz} -> vereinfachte Rückgabe`);
  return plz || null;
};

function getDateFromTimestamp(timestamp: admin.firestore.Timestamp | number | undefined | null): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof admin.firestore.Timestamp) return timestamp.toDate();
  if (typeof timestamp === 'number') return new Date(timestamp);
  return null;
}

interface MinimalFirestoreGroup {
    id: string;
    name?: string;
    mainLocationZip?: string | null;
    players: { [playerDocId: string]: GroupPlayerEntry };
    adminIds?: string[];
    strokeSettings?: Partial<StrokeSettings>;
    scoreSettings?: { enabled?: Partial<ScoreSettingsEnabled> };
    // Weitere Felder wie description, logoUrl etc. sind für die Statistikberechnung nicht direkt nötig
}

function calculateTotalStriche(
    striche: StricheRecord | undefined,
    _strokeSettingsInput?: Partial<StrokeSettings>,
    scoreEnabledSettingsInput?: Partial<ScoreSettingsEnabled> 
): number {
    if (!striche) return 0;

    const effectiveScoreEnabled = { 
        ...DEFAULT_SCORE_SETTINGS.enabled, 
        ...(scoreEnabledSettingsInput || {}) 
    };

    let total = 0;
    if (effectiveScoreEnabled.berg) total += (striche.berg || 0);
    if (effectiveScoreEnabled.sieg) total += (striche.sieg || 0);
    if (effectiveScoreEnabled.matsch) total += (striche.matsch || 0); // Direkt addieren
    if (effectiveScoreEnabled.schneider) total += (striche.schneider || 0); // Direkt addieren
    if (effectiveScoreEnabled.kontermatsch) total += (striche.kontermatsch || 0); // Direkt addieren
    
    return total;
}

function determineWinningTeam(scores: TeamScores | undefined): 'top' | 'bottom' | 'draw' {
    if (!scores) return 'draw'; 
    if (scores.top > scores.bottom) return 'top';
    if (scores.bottom > scores.top) return 'bottom';
    return 'draw';
}

function extractWeisPointsFromGameData(teamPosition: 'top' | 'bottom', game: CompletedGameData): number {
    if (!game.weisPoints) {
        return 0;
        }
    return game.weisPoints[teamPosition] || 0;
}

function getPlayerTeamInGame(
    playerDocId: string, // Logisch ist es playerDocId
    game: CompletedGameData // Enthält jetzt game.participantPlayerIds
): 'top' | 'bottom' | null {
    const participants = game.participantPlayerIds as string[];
    if (!participants || participants.length !== 4) {
        logger.warn(`[getPlayerTeamInGame] Ungültige Teilnehmerliste für Spiel ${game.activeGameId}`);
        return null;
    }

        const playerIndex = participants.indexOf(playerDocId);
        if (playerIndex === -1) {
        logger.warn(`[getPlayerTeamInGame] PlayerDocId ${playerDocId} nicht in Teilnehmerliste gefunden für Spiel ${game.activeGameId}.`);
            return null;
        }

    // Die einfachste und robusteste Annahme für eine Standard-4er-Jass-Partie:
    // Spieler an Index 0 und 2 sind ein Team.
    // Spieler an Index 1 und 3 sind das andere Team.
    // Die Zuordnung zu 'top' oder 'bottom' ist konsistent, solange die Teilnehmerliste ihre Reihenfolge beibehält.
    // Wir definieren Team (0, 2) als 'bottom' und Team (1, 3) als 'top'.
    // Diese Zuordnung ist willkürlich, aber intern konsistent und das ist alles, was zählt.
    if (playerIndex === 0 || playerIndex === 2) {
        return 'bottom';
    } else { // playerIndex is 1 or 3
        return 'top';
    }
}

// Hilfsfunktion zur Namensauflösung
async function resolvePlayerInfos(
    playerDocIds: Set<string>
): Promise<Map<string, ResolvedPlayerInfo>> {
    const resolvedInfos = new Map<string, ResolvedPlayerInfo>();
    
    if (playerDocIds.size === 0) {
        return resolvedInfos;
    }

    // Schritt 1: Erstelle Referenzen zu allen benötigten Player-Dokumenten
    const playerRefs = Array.from(playerDocIds).map(pId => db.collection('players').doc(pId));

    // Schritt 2: Lese alle Player-Dokumente in einem einzigen, effizienten Batch-Aufruf
    const playerSnapshots = await db.getAll(...playerRefs);

    // Schritt 3: Verarbeite die Ergebnisse und fülle den Cache
    for (const playerSnap of playerSnapshots) {
        if (playerSnap.exists) {
            const playerData = playerSnap.data();
            const pDocId = playerSnap.id;
            
            if (playerData) { // Zusätzliche Sicherheitsprüfung für TypeScript
                resolvedInfos.set(pDocId, {
                    finalPlayerName: playerData.displayName || "Unbekannter Jasser",
                    finalPlayerIdForStats: pDocId,
                    authUid: playerData.userId
                });
            }
        }
    }
    
    // Schritt 4: Fallback für IDs, die in der Collection nicht gefunden wurden (sollte nicht passieren)
    playerDocIds.forEach(pId => {
        if (!resolvedInfos.has(pId)) {
             resolvedInfos.set(pId, {
                finalPlayerName: "Unbekannter Jasser",
                finalPlayerIdForStats: pId,
                authUid: undefined
            });
        }
    });

    return resolvedInfos;
}

/**
 * Berechnet die umfassenden Statistiken für eine einzelne Gruppe.
 * Diese Funktion ist dazu gedacht, serverseitig aufgerufen zu werden.
 */
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
        const groupData = groupDoc.data() as MinimalFirestoreGroup;
        groupData.id = groupDoc.id;

        // Gruppenmitglieder: Nur die Spieler in der players Map zählen
        const playerKeys = Object.keys(groupData.players || {});
        const groupMemberPlayerDocIds = new Set<string>(playerKeys);
        
        calculatedStats.memberCount = groupMemberPlayerDocIds.size;
        calculatedStats.hauptspielortName = groupData.mainLocationZip ? (getOrtNameByPlz(groupData.mainLocationZip) || groupData.mainLocationZip) : null;

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

        // Initialisiere Variablen für Aggregationen VOR den Schleifen
        let totalPlayTimeMillis = 0;
        let firstJassTimestampMs: number | null = null;
        let lastJassTimestampMs: number | null = null;

        const actualParticipantPlayerDocIds = new Set<string>(); // Logisch PlayerDocIds
        const allGamesFlat: ProcessableGameData[] = [];
        const gamesBySessionIdMap = new Map<string, ProcessableGameData[]>();
        const sessionDataCache = new Map<string, InitialSessionData & { id: string, status?: string, endedAt?: admin.firestore.Timestamp | number, startedAt?: admin.firestore.Timestamp | number, participantPlayerIds?: string[] }>(); // participantPlayerDocIds -> participantPlayerIds
        
        // Erste Schleife: Sammle alle PlayerDocIds aus allen Spielen und Basis-Zeitstempel
        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDoc.data() as InitialSessionData & { id: string, status?: string, endedAt?: admin.firestore.Timestamp | number, startedAt?: admin.firestore.Timestamp | number, participantPlayerIds?: string[] };
            sessionData.id = sessionDoc.id;
            sessionDataCache.set(sessionDoc.id, sessionData);

            const startedAtDate = getDateFromTimestamp(sessionData.startedAt as admin.firestore.Timestamp | number);
            if (startedAtDate) {
                if (firstJassTimestampMs === null || startedAtDate.getTime() < firstJassTimestampMs) {
                    firstJassTimestampMs = startedAtDate.getTime();
                }
                const endedAt = sessionDoc.data().endedAt as admin.firestore.Timestamp | number | undefined;
                const endedAtDate = getDateFromTimestamp(endedAt) || startedAtDate; 
                if (lastJassTimestampMs === null || endedAtDate.getTime() > lastJassTimestampMs) {
                    lastJassTimestampMs = endedAtDate.getTime();
                }
            }
            
            const gamesSnap = await db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionDoc.id)
                                     .collection(COMPLETED_GAMES_SUBCOLLECTION).orderBy("gameNumber").get();
            const gamesOfThisSession: ProcessableGameData[] = [];
            gamesSnap.forEach(gameDoc => {
                const gameData = gameDoc.data() as CompletedGameData;
                
                const gameWithMetadata: ProcessableGameData = {
                    ...gameData,
                    id: gameDoc.id,
                    sessionId: sessionDoc.id
                };

                if (gameWithMetadata.participantPlayerIds && Array.isArray(gameWithMetadata.participantPlayerIds)) {
                    gameWithMetadata.participantPlayerIds.forEach((pId: string) => {
                        actualParticipantPlayerDocIds.add(pId);
                    });
                }
                
                totalPlayTimeMillis += gameWithMetadata.durationMillis || 0;
                allGamesFlat.push(gameWithMetadata);
                gamesOfThisSession.push(gameWithMetadata);
            });
            gamesBySessionIdMap.set(sessionDoc.id, gamesOfThisSession);
        }
        
        // Vereinfacht: Da wir Trumpfstatistiken aus playerComputedStats aggregieren, brauchen wir roundHistory nicht mehr
        const allGamesWithRoundHistory: (ProcessableGameData & { roundHistory: Round[] })[] = allGamesFlat.map(game => ({
            ...game,
            roundHistory: game.roundHistory || []
        }));

        // NEU: Lade Spielernamen und Infos basierend auf PlayerDocIDs
        const allPlayerIdsFromGames = new Set<string>();
        allGamesFlat.forEach(game => {
            if (game.participantPlayerIds) {
                game.participantPlayerIds.forEach(id => allPlayerIdsFromGames.add(id));
            }
        });

        // KORREKTUR: Berücksichtige auch die Spieler aus der Gruppendefinition selbst,
        // damit die Namen von inaktiven Mitgliedern nicht verloren gehen.
        const allPlayerIdsFromGroupDef = new Set(Object.keys(groupData.players || {}));

        // Kombiniere beide Quellen für eine vollständige Spielerliste
        const allKnownPlayerDocIds = new Set([...allPlayerIdsFromGames, ...allPlayerIdsFromGroupDef]);
        
        logger.info(`[calculateGroupStatisticsInternal] Resolving player info. From games: ${allPlayerIdsFromGames.size}, from group members: ${allPlayerIdsFromGroupDef.size}. Total unique: ${allKnownPlayerDocIds.size}.`);

        const playerInfoCache = await resolvePlayerInfos(allKnownPlayerDocIds);
        logger.info(`[calculateGroupStatisticsInternal] playerInfoCache (size ${playerInfoCache.size}) populated.`);
        
        // groupMemberPlayerDocIds wurde bereits oben aus groupData.players geholt.

        const playerLastActivityMs = new Map<string, number>(); // Key ist playerDocId

        // NEU: Map von AuthUID zu PlayerDocId für die Übersetzung in alten Datenstrukturen
        const authUidToPlayerDocIdMap = new Map<string, string>();
        playerInfoCache.forEach((info, playerDocId) => {
            if (info.authUid) {
                authUidToPlayerDocIdMap.set(info.authUid, playerDocId);
            }
        });

        // Schritt 3: Sessions iterieren und Timestamp-Daten sammeln (Games bereits geladen)
        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id); // Bereits im Cache
            if (!sessionData) {
                logger.warn(`[calculateGroupStatisticsInternal] Konnte Session-Daten für ID ${sessionDoc.id} nicht im Cache finden. Überspringe...`);
                continue;
            }

            // Update playerLastActivityMs
            const sessionEndTimestamp = sessionData.endedAt || sessionData.startedAt;
            let sessionEndMs = 0;
            if (sessionEndTimestamp instanceof admin.firestore.Timestamp) {
                sessionEndMs = sessionEndTimestamp.toMillis();
            } else if (typeof sessionEndTimestamp === 'number') {
                sessionEndMs = sessionEndTimestamp;
            }

            if (sessionData.participantPlayerIds && sessionEndMs > 0) { // KORREKTUR: participantPlayerIds
                sessionData.participantPlayerIds.forEach(pDocId => { // pid -> pDocId, behandeln als PlayerDocID
                    // KORREKTUR: Der Check gegen groupMemberPlayerDocIds wird entfernt.
                    // Die letzte Aktivität muss für jeden Spieler erfasst werden, der je teilgenommen hat.
                        const currentLastMs = playerLastActivityMs.get(pDocId) || 0;
                        playerLastActivityMs.set(pDocId, Math.max(currentLastMs, sessionEndMs));
                });
            }
        }

        // NEU: Globaler Einjahresfilter
        const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 Jahr in Millisekunden
        const activePlayerDocIds = new Set<string>();
        actualParticipantPlayerDocIds.forEach(pDocId => {
            const lastMs = playerLastActivityMs.get(pDocId);
            if (lastMs && lastMs >= oneYearAgo) {
                activePlayerDocIds.add(pDocId);
            }
        });
        logger.info(`[Global-Filter] Von ${actualParticipantPlayerDocIds.size} Teilnehmern sind ${activePlayerDocIds.size} im letzten Jahr aktiv.`);

        calculatedStats.gameCount = allGamesFlat.length;
        calculatedStats.totalPlayTimeSeconds = Math.round(totalPlayTimeMillis / 1000);
        if (firstJassTimestampMs) calculatedStats.firstJassTimestamp = admin.firestore.Timestamp.fromMillis(firstJassTimestampMs);
        if (lastJassTimestampMs) calculatedStats.lastJassTimestamp = admin.firestore.Timestamp.fromMillis(lastJassTimestampMs);
        
        // Durchschnittswerte:
        if (calculatedStats.sessionCount > 0 && totalPlayTimeMillis > 0) {
            calculatedStats.avgSessionDurationSeconds = Math.round((totalPlayTimeMillis / calculatedStats.sessionCount) / 1000);
        }
        if (calculatedStats.gameCount > 0 && totalPlayTimeMillis > 0) {
            calculatedStats.avgGameDurationSeconds = Math.round((totalPlayTimeMillis / calculatedStats.gameCount) / 1000);
        }
        if (calculatedStats.sessionCount > 0) {
            calculatedStats.avgGamesPerSession = parseFloat((calculatedStats.gameCount / calculatedStats.sessionCount).toFixed(1));
        }
        
        let totalRounds = 0;
        allGamesWithRoundHistory.forEach(game => {
            totalRounds += (game.roundHistory?.length || 0); 
        });
        if (calculatedStats.gameCount > 0 && totalRounds > 0) {
            calculatedStats.avgRoundsPerGame = parseFloat((totalRounds / calculatedStats.gameCount).toFixed(1));
            calculatedStats.avgRoundDurationSeconds = Math.round((totalPlayTimeMillis / totalRounds) / 1000);
        }

        let totalMatschStiche = 0;
        allGamesWithRoundHistory.forEach(game => {
            totalMatschStiche += (game.finalStriche?.top?.matsch || 0) + (game.finalStriche?.bottom?.matsch || 0);
        });
        if (calculatedStats.gameCount > 0) {
            calculatedStats.avgMatschPerGame = parseFloat((totalMatschStiche / calculatedStats.gameCount).toFixed(2));
        }

        // Spieler-Highlights und Team-Highlights
        // Diese sind die komplexesten Teile und erfordern die Portierung der Ranking-Logik
        // Für den Moment lasse ich sie als `null`, um das Grundgerüst funktionsfähig zu halten.
        // Die Implementierung würde hier folgen, basierend auf allGamesFlat, sessionsSnap.docs und groupData.

        // Temporäre Platzhalter für noch nicht portierte Highlight-Listen:
        // calculatedStats.playerWithMostGames = null; // Wird jetzt implementiert

        const playerGameCounts = new Map<string, number>();
        allGamesWithRoundHistory.forEach(game => {
            const participants = game.participantPlayerIds || [];
            participants.forEach((uid: string) => {
                playerGameCounts.set(uid, (playerGameCounts.get(uid) || 0) + 1);
            });
        });

        const playerMostGamesList: GroupStatHighlightPlayer[] = [];
        playerGameCounts.forEach((count, pDocId) => {
            const lastMs = playerLastActivityMs.get(pDocId);
            const playerInfo = playerInfoCache.get(pDocId);
            
            // Nur Spieler einschließen, die im letzten Jahr gespielt haben (NEUER globaler Filter)
            if (!activePlayerDocIds.has(pDocId)) return;
            
            playerMostGamesList.push({
                playerId: pDocId,
                playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                value: count,
                lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
            });
        });

        // Sortieren nach Anzahl Spiele (absteigend)
        playerMostGamesList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithMostGames = playerMostGamesList;
        
        const playerStricheStats = new Map<string, { made: number, received: number, games: number }>(); // Key: playerDocId

        actualParticipantPlayerDocIds.forEach(pDocId => {
            playerStricheStats.set(pDocId, { made: 0, received: 0, games: 0 });
        });

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id);
            if (!sessionData) continue; 

            const gamesOfThisSession = gamesBySessionIdMap.get(sessionDoc.id) || [];

            for (const game of gamesOfThisSession) {
                if (game.finalStriche && game.participantPlayerIds) {
                    const stricheTopTeam = calculateTotalStriche(game.finalStriche.top, groupData.strokeSettings, groupData.scoreSettings?.enabled);
                    const stricheBottomTeam = calculateTotalStriche(game.finalStriche.bottom, groupData.strokeSettings, groupData.scoreSettings?.enabled);

                    game.participantPlayerIds.forEach(pDocIdFromGame => {
                        const playerCurrentStats = playerStricheStats.get(pDocIdFromGame); 
                        if (playerCurrentStats) { 
                            playerCurrentStats.games++; 

                            const playerTeamPosition = getPlayerTeamInGame(pDocIdFromGame, game);

                            if (playerTeamPosition === 'top') {
                                playerCurrentStats.made += stricheTopTeam;
                                playerCurrentStats.received += stricheBottomTeam;
                            } else if (playerTeamPosition === 'bottom') {
                                playerCurrentStats.made += stricheBottomTeam;
                                playerCurrentStats.received += stricheTopTeam;
                            } else {
                                logger.warn(`[calculateGroupStatisticsInternal] Spieler ${pDocIdFromGame} in Spiel ${game.activeGameId || game.gameNumber} (Session ${sessionData.id}) keinem Team zugeordnet für Striche.`);
                            }
                        }
                    });
                }
            }
        }

        const playerStricheDiffList: GroupStatHighlightPlayer[] = [];
        playerStricheStats.forEach((stats, pDocId) => {
            if (stats.games > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                
                // Filter ist nicht mehr nötig, da nur aktive Spieler in der Liste sind
                
                playerStricheDiffList.push({
                    playerId: pDocId, 
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.made - stats.received,
                    eventsPlayed: stats.games,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerStricheDiffList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestStricheDiff = playerStricheDiffList;

        // NEU: Punktedifferenz für Spieler
        const playerPointsStats = new Map<string, { diff: number, games: number }>();
        activePlayerDocIds.forEach(pDocId => { // KORREKTUR: Nur aktive Spieler initialisieren
            playerPointsStats.set(pDocId, { diff: 0, games: 0 });
        });

        for (const game of allGamesWithRoundHistory) {
            if (game.finalScores && game.participantPlayerIds) {
                const pointsTopTeam = game.finalScores.top || 0;
                const pointsBottomTeam = game.finalScores.bottom || 0;

                game.participantPlayerIds.forEach(pDocIdFromGame => {
                    const playerCurrentStats = playerPointsStats.get(pDocIdFromGame);
                    if (playerCurrentStats) {
                        playerCurrentStats.games++;
                        const playerTeamPosition = getPlayerTeamInGame(pDocIdFromGame, game);

                        if (playerTeamPosition === 'top') {
                            playerCurrentStats.diff += (pointsTopTeam - pointsBottomTeam);
                        } else if (playerTeamPosition === 'bottom') {
                            playerCurrentStats.diff += (pointsBottomTeam - pointsTopTeam);
                        }
                    }
                });
            }
        }

        const playerPointsDiffList: GroupStatHighlightPlayer[] = [];
        playerPointsStats.forEach((stats, pDocId) => {
            if (stats.games > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                
                // Filter ist nicht mehr nötig, da nur aktive Spieler in der Liste sind
                
                playerPointsDiffList.push({
                    playerId: pDocId, 
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.diff,
                    eventsPlayed: stats.games,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerPointsDiffList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestPointsDiff = playerPointsDiffList;

        // NEU: playerWithHighestWinRateSession Logik
        const playerSessionWinStats = new Map<string, { played: number, won: number }>();
        activePlayerDocIds.forEach(pDocId => {
            playerSessionWinStats.set(pDocId, { played: 0, won: 0 });
        });

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id);
            if (!sessionData || sessionData.status !== 'completed' || !sessionData.teams || !sessionData.participantPlayerIds) {
                continue;
            }

            const winnerTeamKey = sessionData.winnerTeamKey;

            if (winnerTeamKey && winnerTeamKey !== 'draw') {
                const sessionParticipants = sessionData.participantPlayerIds;
                
                sessionParticipants.forEach(pId => {
                    const stats = playerSessionWinStats.get(pId);
                    if (stats) stats.played++;
                });

                const finalTeamAPlayerDocIds = sessionData.teams.teamA.players.map(p => authUidToPlayerDocIdMap.get(p.playerId) || p.playerId);
                const finalTeamBPlayerDocIds = sessionData.teams.teamB.players.map(p => authUidToPlayerDocIdMap.get(p.playerId) || p.playerId);

                let winningPlayerDocIds: string[] = [];
                if (winnerTeamKey === 'teamA') winningPlayerDocIds = finalTeamAPlayerDocIds;
                if (winnerTeamKey === 'teamB') winningPlayerDocIds = finalTeamBPlayerDocIds;
                
                winningPlayerDocIds.forEach(pDocId => {
                    if (pDocId && playerSessionWinStats.has(pDocId)) {
                        const stats = playerSessionWinStats.get(pDocId)!;
                        stats.won++;
                    }
                });
            }
        }

        const playerSessionWinRateList: GroupStatHighlightPlayer[] = [];
        playerSessionWinStats.forEach((stats, pDocId) => {
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);

                if (!lastMs || lastMs < oneYearAgo) return;

                playerSessionWinRateList.push({
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.won / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerSessionWinRateList.sort((a, b) => {
            if (b.value !== a.value) return b.value - a.value;
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.playerWithHighestWinRateSession = playerSessionWinRateList;

        // NEU: teamWithHighestWinRateSession Logik überarbeiten
        const teamSessionWinStats = new Map<string, { playerDocIds: string[], playerNames: string[], played: number, won: number }>();

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id) as InitialSessionData & { id: string, status?: string, teams?: SessionTeams, winnerTeamKey?: 'teamA' | 'teamB' | 'draw' };
            const sessionDocData = sessionDoc.data();
            
            if (sessionData?.status !== 'completed' || !sessionData.teams) {
                continue; 
            }

            // KORREKTUR: Übersetze AuthUIDs aus der Session in PlayerDocIDs, falls nötig.
            const teamAPlayers = sessionData.teams.teamA.players
                .map(p => authUidToPlayerDocIdMap.get(p.playerId) || p.playerId)
                .sort();
            const teamBPlayers = sessionData.teams.teamB.players
                .map(p => authUidToPlayerDocIdMap.get(p.playerId) || p.playerId)
                .sort();

            if (teamAPlayers.length === 0 || teamBPlayers.length === 0) continue;

            const teamAKey = teamAPlayers.join('|');
            const teamBKey = teamBPlayers.join('|');

            // Verwende nur winnerTeamKey - dies ist das autoritative Feld
            const actualWinnerTeamKey: 'teamA' | 'teamB' | 'draw' | undefined = sessionData.winnerTeamKey || sessionDocData.winnerTeamKey;
            
            // KORREKTUR: "played" und "won" nur zählen, wenn die Partie NICHT unentschieden ist.
            if (actualWinnerTeamKey && actualWinnerTeamKey !== 'draw') {
            if (!teamSessionWinStats.has(teamAKey)) {
                const teamANames = teamAPlayers.map(pId => playerInfoCache.get(pId)?.finalPlayerName || 'Unbekannter Spieler');
                teamSessionWinStats.set(teamAKey, { playerDocIds: teamAPlayers, playerNames: teamANames, played: 0, won: 0 });
            }
                const teamAStats = teamSessionWinStats.get(teamAKey)!;
                teamAStats.played++;

            if (!teamSessionWinStats.has(teamBKey)) {
                const teamBNames = teamBPlayers.map(pId => playerInfoCache.get(pId)?.finalPlayerName || 'Unbekannter Spieler');
                teamSessionWinStats.set(teamBKey, { playerDocIds: teamBPlayers, playerNames: teamBNames, played: 0, won: 0 });
            }
                const teamBStats = teamSessionWinStats.get(teamBKey)!;
                teamBStats.played++;
            
                if (actualWinnerTeamKey === 'teamA') {
                teamAStats.won++;
                } else if (actualWinnerTeamKey === 'teamB') {
                teamBStats.won++;
                }
            }
        }

        const teamSessionWinRateList: GroupStatHighlightTeam[] = [];
        teamSessionWinStats.forEach((stats) => {
            if (stats.played > 0) {
                teamSessionWinRateList.push({
                    names: stats.playerNames,
                    value: parseFloat((stats.won / stats.played).toFixed(2)),
                    eventsPlayed: stats.played,
                });
            }
        });

        teamSessionWinRateList.sort((a, b) => {
            const valA = typeof a.value === 'number' ? a.value : 0;
            const valB = typeof b.value === 'number' ? b.value : 0;
            if (valB !== valA) return valB - valA;
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.teamWithHighestWinRateSession = teamSessionWinRateList;

        // calculatedStats.playerWithHighestWinRateGame = null; // Wird jetzt implementiert
        const playerGameWinStats = new Map<string, { played: number, won: number }>(); // Key: playerDocId
        activePlayerDocIds.forEach(pDocId => { // KORREKTUR: Nur aktive Spieler initialisieren
                playerGameWinStats.set(pDocId, { played: 0, won: 0 });
        });

        for (const game of allGamesWithRoundHistory) {
            if (!game.finalScores || !game.participantPlayerIds) { // KORREKTUR
                continue; // Nur Spiele mit Scores und Teilnehmern
            }

            const winningTeamPosition = determineWinningTeam(game.finalScores);

            game.participantPlayerIds.forEach(pDocIdFromGame => { // KORREKTUR
                    const stats = playerGameWinStats.get(pDocIdFromGame);
                    if (stats) { 
                        stats.played++;

                        if (winningTeamPosition !== 'draw') {
                        const playerTeam = getPlayerTeamInGame(pDocIdFromGame, game);
                            if (playerTeam === winningTeamPosition) {
                                stats.won++;
                        }
                    }
                }
            });
        }

        const playerGameWinRateList: GroupStatHighlightPlayer[] = [];
        
        playerGameWinStats.forEach((stats, pDocId) => { // authUID -> pDocId
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                
                // Filter nicht mehr nötig
                
                playerGameWinRateList.push({
                    playerId: pDocId, // playerDocId
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.won / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerGameWinRateList.sort((a, b) => {
            if (b.value !== a.value) {
                return b.value - a.value;
            }
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.playerWithHighestWinRateGame = playerGameWinRateList;

        // BEREINIGTE EVENT-ZÄHLUNG FÜR MATSCH, SCHNEIDER, KONTERMATSCH (SPIELER)
        const playerEventStats = new Map<string, { played: number, matschMade: number, matschReceived: number, schneiderMade: number, schneiderReceived: number, kontermatschMade: number, kontermatschReceived: number }>();
        activePlayerDocIds.forEach(pDocId => { // KORREKTUR: Nur aktive Spieler
            playerEventStats.set(pDocId, { played: 0, matschMade: 0, matschReceived: 0, schneiderMade: 0, schneiderReceived: 0, kontermatschMade: 0, kontermatschReceived: 0 });
        });

        for (const game of allGamesWithRoundHistory) {
            if (!game.participantPlayerIds) continue;

            game.participantPlayerIds.forEach(pDocId => {
                playerEventStats.get(pDocId)!.played++;
            });

            // KORREKTUR: Matsch/Kontermatsch aus roundHistory, Schneider aus finalStriche
            if (game.roundHistory && Array.isArray(game.roundHistory)) {
                game.roundHistory.forEach(round => {
                    if (round.strichInfo?.type && round.strichInfo.team) {
                        const eventType = round.strichInfo.type;
                        const eventTeam = round.strichInfo.team;

                        game.participantPlayerIds?.forEach(pDocId => {
                            const stats = playerEventStats.get(pDocId);
                            if (stats) {
                                const playerTeam = getPlayerTeamInGame(pDocId, game);
                                if (playerTeam) {
                                    const isReceiver = playerTeam === eventTeam;
                                    switch (eventType) {
                                        case 'matsch':
                                            if (isReceiver) stats.matschMade++; else stats.matschReceived++;
                                            break;
                                        // 'schneider' wird hier entfernt, da es ein Game-End-Event ist
                                        case 'kontermatsch':
                                            if (isReceiver) stats.kontermatschMade++; else stats.kontermatschReceived++;
                                            break;
                                    }
                                }
                            }
                        });
                    }
                });
            }

            // NEU: Korrekte Zählung für Schneider-Events auf Spiel-Ebene basierend auf den Endpunkten
            if (game.finalScores) { // KORREKTUR: Die Prüfung auf jassTyp wird entfernt
                const { top: topScore, bottom: bottomScore } = game.finalScores;
                
                // Da die Scores variieren, ist die EINZIG sichere Annahme, dass das Verlierer-Team weniger als die Hälfte des Gewinner-Teams hat.
                const schneiderLimitRatio = 0.5;

                let schneiderReceivedBy: 'top' | 'bottom' | null = null;
                if (topScore > bottomScore && (bottomScore / topScore) < schneiderLimitRatio) {
                    schneiderReceivedBy = 'bottom';
                } else if (bottomScore > topScore && (topScore / bottomScore) < schneiderLimitRatio) {
                    schneiderReceivedBy = 'top';
                    }

                if (schneiderReceivedBy) {
                     game.participantPlayerIds?.forEach(pDocId => {
                        const stats = playerEventStats.get(pDocId);
                        if (stats) {
                            const playerTeam = getPlayerTeamInGame(pDocId, game);
                            if (playerTeam === schneiderReceivedBy) {
                                stats.schneiderReceived++;
                            } else {
                                stats.schneiderMade++;
                            }
                        }
                    });
                } else {
                    logger.info(`[Schneider-Check] GameID: ${game.id} SKIPPED (JassTyp: ${game.jassTyp}, HasFinalScores: ${!!game.finalScores})`);
                    }
                }
            }

        // --- Matschquote Spieler ---
        const playerMatschRateList: GroupStatHighlightPlayer[] = [];
        playerEventStats.forEach((stats, pDocId) => {
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                if (!lastMs || lastMs < oneYearAgo) return;
                playerMatschRateList.push({
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: (stats.matschMade - stats.matschReceived) / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });
        playerMatschRateList.sort((a, b) => (b.value - a.value) || ((b.eventsPlayed || 0) - (a.eventsPlayed || 0)));
        calculatedStats.playerWithHighestMatschRate = playerMatschRateList;

        // --- Schneiderquote Spieler ---
        const playerSchneiderRateList: GroupStatHighlightPlayer[] = [];
        playerEventStats.forEach((stats, pDocId) => {
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                if (!lastMs || lastMs < oneYearAgo) return;
                playerSchneiderRateList.push({
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: (stats.schneiderMade - stats.schneiderReceived) / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });
        playerSchneiderRateList.sort((a, b) => (b.value - a.value) || ((b.eventsPlayed || 0) - (a.eventsPlayed || 0)));
        calculatedStats.playerWithHighestSchneiderRate = playerSchneiderRateList;

        // --- Kontermatschquote Spieler ---
        const playerKontermatschRateList: GroupStatHighlightPlayer[] = [];
        playerEventStats.forEach((stats, pDocId) => {
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                if (!lastMs || lastMs < oneYearAgo) return;
                playerKontermatschRateList.push({
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: (stats.kontermatschMade - stats.kontermatschReceived) / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });
        playerKontermatschRateList.sort((a, b) => (b.value - a.value) || ((b.eventsPlayed || 0) - (a.eventsPlayed || 0)));
        calculatedStats.playerWithHighestKontermatschRate = playerKontermatschRateList;


        // BEREINIGTE EVENT-ZÄHLUNG FÜR MATSCH, SCHNEIDER, KONTERMATSCH (TEAMS)
        const teamEventStats = new Map<string, { playerDocIds: [string, string], playerNames: [string, string], played: number, matschMade: number, matschReceived: number, schneiderMade: number, schneiderReceived: number, kontermatschMade: number, kontermatschReceived: number }>();

        for (const game of allGamesWithRoundHistory) {
            if (!game.participantPlayerIds || game.participantPlayerIds.length !== 4) continue;
            
            const pids = game.participantPlayerIds;
            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}|${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}|${teamBPidsSorted[1]}`;
            
            if (!teamEventStats.has(teamAKey)) {
                const teamANames: [string, string] = [playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X', playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y'];
                teamEventStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, played: 0, matschMade: 0, matschReceived: 0, schneiderMade: 0, schneiderReceived: 0, kontermatschMade: 0, kontermatschReceived: 0 });
            }
            if (!teamEventStats.has(teamBKey)) {
                const teamBNames: [string, string] = [playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z', playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W'];
                teamEventStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, played: 0, matschMade: 0, matschReceived: 0, schneiderMade: 0, schneiderReceived: 0, kontermatschMade: 0, kontermatschReceived: 0 });
            }

            const teamAStats = teamEventStats.get(teamAKey)!;
            const teamBStats = teamEventStats.get(teamBKey)!;
            teamAStats.played++;
            teamBStats.played++;
            
            // KORREKTUR: Matsch/Kontermatsch aus roundHistory, Schneider aus finalStriche
            if (game.roundHistory && Array.isArray(game.roundHistory)) {
                const teamAPosition = getPlayerTeamInGame(pids[0], game);
                
                game.roundHistory.forEach(round => {
                    if (round.strichInfo?.type && round.strichInfo.team) {
                        const eventType = round.strichInfo.type;
                        const eventTeam = round.strichInfo.team;

                        if (teamAPosition) {
                            const isTeamAEventReceiver = teamAPosition === eventTeam;
                            switch (eventType) {
                                case 'matsch':
                                    if (isTeamAEventReceiver) {
 teamAStats.matschMade++; teamBStats.matschReceived++;
} else {
 teamAStats.matschReceived++; teamBStats.matschMade++;
}
                                    break;
                                // 'schneider' wird hier entfernt
                                case 'kontermatsch':
                                     if (isTeamAEventReceiver) {
 teamAStats.kontermatschMade++; teamBStats.kontermatschReceived++;
} else {
 teamAStats.kontermatschReceived++; teamBStats.kontermatschMade++;
}
                                    break;
                            }
                        }
                    }
                });
            }

            // NEU: Korrekte Zählung für Schneider-Events für Teams auf Spiel-Ebene basierend auf den Endpunkten
            if (game.finalScores) { // KORREKTUR: Die Prüfung auf jassTyp wird entfernt
                const { top: topScore, bottom: bottomScore } = game.finalScores;
                const schneiderLimitRatio = 0.5;

                let schneiderReceiver: 'top' | 'bottom' | null = null;
                if (topScore > bottomScore && (bottomScore / topScore) < schneiderLimitRatio) {
                    schneiderReceiver = 'bottom';
                } else if (bottomScore > topScore && (topScore / bottomScore) < schneiderLimitRatio) {
                    schneiderReceiver = 'top';
                }

                if (schneiderReceiver) {
                    const teamAPosition = getPlayerTeamInGame(pids[0], game);
                    if (teamAPosition === schneiderReceiver) {
                        teamAStats.schneiderReceived++;
                        teamBStats.schneiderMade++;
                    } else {
                        teamAStats.schneiderMade++;
                        teamBStats.schneiderReceived++;
                    }
                }
            }
        }

        // --- Team-Quoten ---
        const teamMatschRateList: GroupStatHighlightTeam[] = [];
        const teamSchneiderRateList: GroupStatHighlightTeam[] = [];
        const teamKontermatschRateList: GroupStatHighlightTeam[] = [];

        teamEventStats.forEach((stats) => {
            if (stats.played > 0) {
                teamMatschRateList.push({ names: stats.playerNames, value: (stats.matschMade - stats.matschReceived) / stats.played, eventsPlayed: stats.played });
                teamSchneiderRateList.push({ names: stats.playerNames, value: (stats.schneiderMade - stats.schneiderReceived) / stats.played, eventsPlayed: stats.played });
                teamKontermatschRateList.push({ names: stats.playerNames, value: (stats.kontermatschMade - stats.kontermatschReceived) / stats.played, eventsPlayed: stats.played });
            }
        });

        const sortTeamList = (a: GroupStatHighlightTeam, b: GroupStatHighlightTeam) => (b.value as number - (a.value as number)) || ((b.eventsPlayed || 0) - (a.eventsPlayed || 0));
        teamMatschRateList.sort(sortTeamList);
        teamSchneiderRateList.sort(sortTeamList);
        teamKontermatschRateList.sort(sortTeamList);

        calculatedStats.teamWithHighestMatschRate = teamMatschRateList;
        calculatedStats.teamWithHighestSchneiderRate = teamSchneiderRateList;
        calculatedStats.teamWithHighestKontermatschRate = teamKontermatschRateList;

        // 3. playerWithMostWeisPointsAvg - Spieler-Weispunkte-Durchschnitt
        const playerWeisStats = new Map<string, { totalWeis: number, gamesPlayed: number }>();
        activePlayerDocIds.forEach(pDocId => { // KORREKTUR: Nur aktive Spieler
            playerWeisStats.set(pDocId, { totalWeis: 0, gamesPlayed: 0 });
        });

        for (const game of allGamesWithRoundHistory) {
            if (!game.participantPlayerIds) continue;

            game.participantPlayerIds.forEach(pDocId => {
                // Logik ist hier bereits korrekt, da sie nicht auf groupMemberPlayerDocIds prüft
                const stats = playerWeisStats.get(pDocId);
                if (stats) {
                    stats.gamesPlayed++;
                    const playerTeam = getPlayerTeamInGame(pDocId, game);
                    if (playerTeam) {
                        stats.totalWeis += extractWeisPointsFromGameData(playerTeam, game);
                    }
                }
            });
        }

        const playerWeisAvgList: GroupStatHighlightPlayer[] = [];
        playerWeisStats.forEach((stats, pDocId) => {
            if (stats.gamesPlayed > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                
                // Filter nicht mehr nötig
                
                playerWeisAvgList.push({
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: parseFloat((stats.totalWeis / stats.gamesPlayed).toFixed(1)),
                    eventsPlayed: stats.gamesPlayed,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });
        playerWeisAvgList.sort((a, b) => {
            if (b.value !== a.value) return b.value - a.value;
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.playerWithMostWeisPointsAvg = playerWeisAvgList;

        // 4. Rundenzeiten-Statistiken
        const playerRoundTimeStats = new Map<string, number[]>(); // Speichert alle Rundenzeiten
        activePlayerDocIds.forEach(pDocId => { // KORREKTUR: Nur aktive Spieler
            playerRoundTimeStats.set(pDocId, []);
        });

        for (const game of allGamesWithRoundHistory) {
            if (!game.roundHistory || !game.participantPlayerIds) continue;
            
            game.roundHistory.forEach(round => {
                if (round.actionType === 'jass' && typeof round.currentPlayer === 'number' && game.participantPlayerIds) {
                    const playerIndex = round.currentPlayer - 1; // 1-based zu 0-based
                    if (playerIndex >= 0 && playerIndex < game.participantPlayerIds.length) {
                        const pDocId = game.participantPlayerIds[playerIndex];
                        // Logik ist hier bereits korrekt, da sie nicht auf groupMemberPlayerDocIds prüft
                        if (game.durationMillis) {
                            // Vereinfachte Rundenzeitberechnung: Gesamtzeit / Anzahl Runden
                            const avgRoundTime = game.durationMillis / game.roundHistory.length;
                            playerRoundTimeStats.get(pDocId)?.push(avgRoundTime);
                        }
                    }
                }
            });
        }

        const playerAllRoundTimesList: (GroupStatHighlightPlayer & { displayValue?: string })[] = [];
        const fastestList: GroupStatHighlightPlayer[] = [];
        const slowestList: GroupStatHighlightPlayer[] = [];

        playerRoundTimeStats.forEach((times, pDocId) => {
            if (times.length > 0) {
                const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                
                // Filter nicht mehr nötig
                
                const displayValue = `${Math.round(avgTime / 1000)}s`;

                const player = {
                    playerId: pDocId,
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: avgTime,
                    eventsPlayed: times.length,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                    displayValue: displayValue
                };

                playerAllRoundTimesList.push(player);
                fastestList.push({ ...player });
                slowestList.push({ ...player });
            }
        });

        // Sortierungen
        playerAllRoundTimesList.sort((a, b) => a.value - b.value);
        fastestList.sort((a, b) => a.value - b.value);
        slowestList.sort((a, b) => b.value - a.value);

        calculatedStats.playerAllRoundTimes = playerAllRoundTimesList;
        calculatedStats.playerWithFastestRounds = fastestList;
        calculatedStats.playerWithSlowestRounds = slowestList;

        // 5. teamWithHighestWinRateGame - Team-Spiel-Siegquote
        const teamGameWinStats = new Map<string, { playerDocIds: [string, string], playerNames: [string, string], played: number, won: number }>();

        for (const game of allGamesWithRoundHistory) {
            if (!game.finalScores || !game.participantPlayerIds || game.participantPlayerIds.length !== 4) continue;
            const pids = game.participantPlayerIds;

            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}|${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}|${teamBPidsSorted[1]}`;

            const teamANames: [string, string] = [
                playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X',
                playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y'
            ];
            const teamBNames: [string, string] = [
                playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z',
                playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W'
            ];

            // Initialisiere Teams
            if (!teamGameWinStats.has(teamAKey)) {
                teamGameWinStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, played: 0, won: 0 });
            }
            if (!teamGameWinStats.has(teamBKey)) {
                teamGameWinStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, played: 0, won: 0 });
            }

            const teamAStats = teamGameWinStats.get(teamAKey);
            const teamBStats = teamGameWinStats.get(teamBKey);
            if (teamAStats) teamAStats.played++;
            if (teamBStats) teamBStats.played++;

            // Gewinner bestimmen
            const winningTeam = determineWinningTeam(game.finalScores);
            if (winningTeam !== 'draw') {
                const teamAPosition = getPlayerTeamInGame(pids[0], game);
                const teamBPosition = getPlayerTeamInGame(pids[1], game);

                if (teamAStats && teamAPosition === winningTeam) teamAStats.won++;
                if (teamBStats && teamBPosition === winningTeam) teamBStats.won++;
            }
        }

        const teamGameWinRateList: GroupStatHighlightTeam[] = [];
        teamGameWinStats.forEach((stats) => {
            if (stats.played > 0) {
                teamGameWinRateList.push({
                    names: stats.playerNames,
                    value: parseFloat((stats.won / stats.played).toFixed(2)),
                    eventsPlayed: stats.played,
                });
            }
        });
        teamGameWinRateList.sort((a, b) => {
            const valA = typeof a.value === 'number' ? a.value : 0;
            const valB = typeof b.value === 'number' ? b.value : 0;
            if (valB !== valA) return valB - valA;
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.teamWithHighestWinRateGame = teamGameWinRateList;

        // NEU: teamWithHighestPointsDiff Logik
        const teamPointsStats = new Map<string, { playerDocIds: [string, string], playerNames: [string, string], diff: number, games: number }>();

        for (const game of allGamesWithRoundHistory) {
            if (!game.finalScores || !game.participantPlayerIds || game.participantPlayerIds.length !== 4) continue;
            
            const pids = game.participantPlayerIds;
            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}|${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}|${teamBPidsSorted[1]}`;
            
            if (!teamPointsStats.has(teamAKey)) {
                const teamANames: [string, string] = [playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X', playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y'];
                teamPointsStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, diff: 0, games: 0 });
            }
            if (!teamPointsStats.has(teamBKey)) {
                const teamBNames: [string, string] = [playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z', playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W'];
                teamPointsStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, diff: 0, games: 0 });
            }
            
            const teamAStats = teamPointsStats.get(teamAKey)!;
            const teamBStats = teamPointsStats.get(teamBKey)!;
            teamAStats.games++;
            teamBStats.games++;
            
            const pointsTopTeam = game.finalScores.top || 0;
            const pointsBottomTeam = game.finalScores.bottom || 0;
            
            // Team A (pids 0 & 2) ist 'bottom', Team B (pids 1 & 3) ist 'top'
            teamAStats.diff += (pointsBottomTeam - pointsTopTeam);
            teamBStats.diff += (pointsTopTeam - pointsBottomTeam);
        }

        const teamPointsDiffList: GroupStatHighlightTeam[] = [];
        teamPointsStats.forEach((stats) => {
            if (stats.games > 0) {
                teamPointsDiffList.push({
                    names: stats.playerNames,
                    value: stats.diff,
                    eventsPlayed: stats.games,
                });
            }
        });

        teamPointsDiffList.sort((a, b) => (b.value as number) - (a.value as number));
        calculatedStats.teamWithHighestPointsDiff = teamPointsDiffList;

        // NEU: teamWithHighestStricheDiff Logik
        const teamStricheStats = new Map<string, { playerDocIds: [string, string], playerNames: [string, string], diff: number, games: number }>();

        for (const game of allGamesWithRoundHistory) {
            if (!game.finalStriche || !game.participantPlayerIds || game.participantPlayerIds.length !== 4) continue;
            
            const pids = game.participantPlayerIds;
            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}|${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}|${teamBPidsSorted[1]}`;
            
            if (!teamStricheStats.has(teamAKey)) {
                const teamANames: [string, string] = [playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X', playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y'];
                teamStricheStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, diff: 0, games: 0 });
            }
            if (!teamStricheStats.has(teamBKey)) {
                const teamBNames: [string, string] = [playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z', playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W'];
                teamStricheStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, diff: 0, games: 0 });
            }
            
            const teamAStats = teamStricheStats.get(teamAKey)!;
            const teamBStats = teamStricheStats.get(teamBKey)!;
            teamAStats.games++;
            teamBStats.games++;
            
            const stricheTopTeam = calculateTotalStriche(game.finalStriche.top, groupData.strokeSettings, groupData.scoreSettings?.enabled);
            const stricheBottomTeam = calculateTotalStriche(game.finalStriche.bottom, groupData.strokeSettings, groupData.scoreSettings?.enabled);
            
            // Team A (pids 0 & 2) ist 'bottom', Team B (pids 1 & 3) ist 'top'
            teamAStats.diff += (stricheBottomTeam - stricheTopTeam);
            teamBStats.diff += (stricheTopTeam - stricheBottomTeam);
        }

        const teamStricheDiffList: GroupStatHighlightTeam[] = [];
        teamStricheStats.forEach((stats) => {
            if (stats.games > 0) {
                teamStricheDiffList.push({
                    names: stats.playerNames,
                    value: stats.diff,
                    eventsPlayed: stats.games,
                });
            }
        });

        teamStricheDiffList.sort((a, b) => (b.value as number) - (a.value as number));
        calculatedStats.teamWithHighestStricheDiff = teamStricheDiffList;

        // NEU: teamWithMostWeisPointsAvg und teamWithFastestRounds
        const teamWeisStats = new Map<string, { totalWeis: number, gamesPlayed: number }>();
        const teamRoundTimeStats = new Map<string, number[]>();

        for (const game of allGamesWithRoundHistory) {
            if (!game.participantPlayerIds || game.participantPlayerIds.length !== 4) continue;

            const pids = game.participantPlayerIds;
            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}|${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}|${teamBPidsSorted[1]}`;

            // Initialisiere die Maps, falls nötig
            if (!teamWeisStats.has(teamAKey)) teamWeisStats.set(teamAKey, { totalWeis: 0, gamesPlayed: 0 });
            if (!teamWeisStats.has(teamBKey)) teamWeisStats.set(teamBKey, { totalWeis: 0, gamesPlayed: 0 });
            if (!teamRoundTimeStats.has(teamAKey)) teamRoundTimeStats.set(teamAKey, []);
            if (!teamRoundTimeStats.has(teamBKey)) teamRoundTimeStats.set(teamBKey, []);

            const teamAWeisStats = teamWeisStats.get(teamAKey)!;
            const teamBWeisStats = teamWeisStats.get(teamBKey)!;
            teamAWeisStats.gamesPlayed++;
            teamBWeisStats.gamesPlayed++;
            
            // Weispunkte
            teamAWeisStats.totalWeis += extractWeisPointsFromGameData('bottom', game);
            teamBWeisStats.totalWeis += extractWeisPointsFromGameData('top', game);

            // Rundenzeit
            if (game.durationMillis && game.roundHistory && game.roundHistory.length > 0) {
                const avgRoundTime = game.durationMillis / game.roundHistory.length;
                teamRoundTimeStats.get(teamAKey)?.push(avgRoundTime);
                teamRoundTimeStats.get(teamBKey)?.push(avgRoundTime);
            }
        }

        const teamWeisAvgList: GroupStatHighlightTeam[] = [];
        teamWeisStats.forEach((stats, key) => {
            if (stats.gamesPlayed > 0) {
                const pids = key.split('|');
                const names: [string, string] = [
                    playerInfoCache.get(pids[0])?.finalPlayerName || '?',
                    playerInfoCache.get(pids[1])?.finalPlayerName || '?'
                ];
                teamWeisAvgList.push({
                    names,
                    value: parseFloat((stats.totalWeis / stats.gamesPlayed).toFixed(1)),
                    eventsPlayed: stats.gamesPlayed,
                });
            }
        });
        teamWeisAvgList.sort((a, b) => (b.value as number) - (a.value as number));
        calculatedStats.teamWithMostWeisPointsAvg = teamWeisAvgList;

        const teamFastestRoundsList: GroupStatHighlightTeam[] = [];
        teamRoundTimeStats.forEach((times, key) => {
            if (times.length > 0) {
                const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
                const pids = key.split('|');
                const names: [string, string] = [
                    playerInfoCache.get(pids[0])?.finalPlayerName || '?',
                    playerInfoCache.get(pids[1])?.finalPlayerName || '?'
                ];
                teamFastestRoundsList.push({
                    names,
                    value: avgTime, // Wert als Millisekunden speichern
                    eventsPlayed: times.length,
                });
            }
        });
        teamFastestRoundsList.sort((a, b) => (a.value as number) - (b.value as number)); // Aufsteigend für schnellste Zeit
        calculatedStats.teamWithFastestRounds = teamFastestRoundsList;


        // --- FINALE, KORREKTE TRUMPF-BERECHNUNG AUS ROHDATEN ---
        const gruppeTrumpfStatistik: { [farbe: string]: number } = {};
        let gruppeTotalTrumpfCount = 0;

        for (const game of allGamesWithRoundHistory) {
            // Analysiere die roundHistory für jedes Spiel
            if (game.roundHistory && Array.isArray(game.roundHistory)) {
                game.roundHistory.forEach(round => {
                    // Zähle nur Runden vom Typ 'jass' mit einer gültigen Trumpffarbe
                    if (round.actionType === 'jass' && round.farbe && typeof round.farbe === 'string') {
                        const farbe = round.farbe.toLowerCase();
                        gruppeTrumpfStatistik[farbe] = (gruppeTrumpfStatistik[farbe] || 0) + 1;
                        gruppeTotalTrumpfCount++;
                    }
                });
            }
        }

        calculatedStats.trumpfStatistik = gruppeTrumpfStatistik;
        calculatedStats.totalTrumpfCount = gruppeTotalTrumpfCount;
        
        logger.info(`[calculateGroupStatisticsInternal] Successfully calculated team statistics for groupId: ${groupId}`);
        return calculatedStats;
    } catch (error) {
        logger.error(`[calculateGroupStatisticsInternal] Error calculating stats for groupId ${groupId}:`, error);
        const errorStats = JSON.parse(JSON.stringify(initialGroupComputedStats));
        errorStats.groupId = groupId;
        errorStats.lastUpdateTimestamp = admin.firestore.Timestamp.now();
        return errorStats;
    } // Korrekte Schließung des catch-Blocks
} // Korrekte Schließung der Funktion calculateGroupStatisticsInternal

/**
 * Wird nach jeder Session aufgerufen, um die groupComputedStats zu aktualisieren.
 */
export async function updateGroupComputedStatsAfterSession(groupId: string): Promise<void> {
    if (!groupId) {
        logger.warn("[updateGroupComputedStatsAfterSession] groupId is missing, skipping update.");
        return;
    }
    try {
        logger.info(`[updateGroupComputedStatsAfterSession] Triggered for groupId: ${groupId}. Starting recalculation.`);
        const groupStats = await calculateGroupStatisticsInternal(groupId);
        
        const groupStatsRef = db.collection('groupComputedStats').doc(groupId);
        await groupStatsRef.set(groupStats, { merge: true }); // Mit merge: true, falls das Dokument schon existiert und nur Teile aktualisiert werden
        logger.info(`[updateGroupComputedStatsAfterSession] Successfully updated groupComputedStats for groupId: ${groupId}`);
    } catch (error) {
        logger.error(`[updateGroupComputedStatsAfterSession] Error updating groupComputedStats for groupId ${groupId}:`, error);
        // Hier könnte man einen Mechanismus für Retries oder Fehler-Logging implementieren
    }
} 