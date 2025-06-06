import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { GroupComputedStats, initialGroupComputedStats, GroupStatHighlightPlayer, GroupStatHighlightTeam } from "./models/group-stats.model";
import { StricheRecord, TeamScores, CompletedGameData, SessionTeams, InitialSessionData, TeamConfig } from "./finalizeSession"; // Importiere benötigte Typen
import { DEFAULT_SCORE_SETTINGS, StrokeSettings, ScoreSettingsEnabled } from "./models/game-settings.model"; // Importiere benötigte Einstellungen

const db = admin.firestore();

const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';
const GROUPS_COLLECTION = 'groups';
const USERS_COLLECTION = 'users'; // Hinzugefügt für Klarheit

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
    // playerIds: string[]; // Veraltet zugunsten von players Objekt mit playerDocId als Key
    players: { [playerDocId: string]: GroupPlayerEntry }; // playerDocId als Schlüssel
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
    let weisFromGameObject = 0;
    let weisFromSavedPoints = 0;

    if (game.weisPoints) {
        const weisValue = game.weisPoints[teamPosition];
        if (typeof weisValue === 'number') {
            weisFromGameObject = weisValue;
        } else if (typeof weisValue === 'string') {
            const parsed = parseInt(weisValue, 10);
            if (!isNaN(parsed)) weisFromGameObject = parsed;
        }
    }

    if (game.roundHistory && game.roundHistory.length > 0) {
        const firstRound = game.roundHistory[0] as Record<string, unknown>; 
        if (firstRound && firstRound._savedWeisPoints && typeof firstRound._savedWeisPoints === 'object') {
            const savedWeis = firstRound._savedWeisPoints as Record<string, unknown>;
            const savedValue = savedWeis[teamPosition];
            if (typeof savedValue === 'number') {
                weisFromSavedPoints = savedValue;
            } else if (typeof savedValue === 'string') {
                const parsed = parseInt(savedValue, 10);
                if (!isNaN(parsed)) weisFromSavedPoints = parsed;
            }
        }
    }
    return Math.max(weisFromGameObject, weisFromSavedPoints);
}

function getPlayerTeamInGame(
    playerDocId: string, // Logisch ist es playerDocId
    game: CompletedGameData, // Enthält game.participantUids, die wir als playerDocIds behandeln
    sessionTeams?: SessionTeams, 
    sessionTeamScoreMapping?: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' }
): 'top' | 'bottom' | null {
    // Diese Funktion muss grundlegend überarbeitet werden, um mit playerDocId zu arbeiten
    // und die Teamzugehörigkeit aus game.teams (das player numbers enthält, die zu playerDocIds gemappt werden müssen)
    // oder game.teamScoreMapping (das teamA/teamB zu top/bottom mappt) zu bestimmen.

    // Annahme: game.participantUids enthält die PlayerDocIDs in der Reihenfolge der Spieler 1-4
    // Annahme: game.teams enthält { top: [spielernummer1, spielernummer2], bottom: [spielernummer3, spielernummer4] }
    // Wobei spielernummer X (1-4) dem Index in participantUids entspricht (0-3)
    
    const participants = game.participantUids as string[]; // Behandle UIDs als PlayerDocIDs
    if (participants && participants.length === 4) {
        const playerIndex = participants.indexOf(playerDocId);
        if (playerIndex === -1) {
            logger.warn(`[calculateGroupStatisticsInternal:getPlayerTeamInGame] PlayerDocId ${playerDocId} nicht in game.participantUids ${game.activeGameId || game.gameNumber} gefunden.`);
            return null;
        }

        if (game.teams) { // Explizite Teamzuordnung im Spiel
            // Prüfe, ob game.teams die erwartete Struktur hat
            if (typeof game.teams === 'object' && 'top' in game.teams && 'bottom' in game.teams) {
                // Wenn teams Struktur { top: { playerUids: string[] }, bottom: { playerUids: string[] } } hat
                if ('playerUids' in game.teams.top && Array.isArray(game.teams.top.playerUids)) {
                    if (game.teams.bottom.playerUids?.includes(playerDocId)) return 'bottom';
                    if (game.teams.top.playerUids?.includes(playerDocId)) return 'top';
                } else {
                    // Wenn teams Struktur { top: [number, number], bottom: [number, number] } hat (TeamConfig)
                    // Prüfe explizit, ob es sich um ein TeamConfig handelt
                    const teamsAsAny = game.teams as unknown;
                    if (Array.isArray((teamsAsAny as TeamConfig).top) && Array.isArray((teamsAsAny as TeamConfig).bottom)) {
                        const playerNumberBasedOnIndex = playerIndex + 1; // Spielernummern sind oft 1-basiert
                        if ((teamsAsAny as TeamConfig).bottom.includes(playerNumberBasedOnIndex)) return 'bottom';
                        if ((teamsAsAny as TeamConfig).top.includes(playerNumberBasedOnIndex)) return 'top';
                    }
                }
            }
        }
        
        // Fallback oder Standardzuordnung basierend auf Index, wenn game.teams nicht vorhanden/eindeutig
        // Team Bottom: Spieler 0 und 2 (Index)
        // Team Top: Spieler 1 und 3 (Index)
        if (playerIndex === 0 || playerIndex === 2) return (game.teamScoreMapping?.teamA === 'bottom' || game.teamScoreMapping?.teamB === 'bottom') ? 'bottom' : 'top'; // Hängt von teamScoreMapping ab
        if (playerIndex === 1 || playerIndex === 3) return (game.teamScoreMapping?.teamA === 'top' || game.teamScoreMapping?.teamB === 'top') ? 'top' : 'bottom';


        // Fallback: Standard Jass-Paarung, wenn keine spezifischen Infos
        // Spieler an Index 0 und 2 sind ein Team, Spieler an Index 1 und 3 sind das andere.
        // Welches Team 'top' oder 'bottom' ist, könnte von game.teamScoreMapping abhängen oder Default sein.
        // Für eine einfache Annahme:
        if (game.teamScoreMapping) {
            if (sessionTeams) { // Wenn SessionTeams UND teamScoreMapping existiert
                 if (sessionTeams.teamA.players.some(p => p.playerId === playerDocId)) return game.teamScoreMapping.teamA; // p.playerDocId -> p.playerId
                 if (sessionTeams.teamB.players.some(p => p.playerId === playerDocId)) return game.teamScoreMapping.teamB; // p.playerDocId -> p.playerId
            }
        }
        // Standardzuordnung, wenn nichts anderes greift (Potenzial für Fehler, wenn teamScoreMapping fehlt/anders ist)
        // Diese Logik muss ggf. genauer an die tatsächliche Datenstruktur von `teams` und `teamScoreMapping` im Spiel angepasst werden.
        // Für eine robustere Lösung braucht man die genaue Semantik von game.teams und game.teamScoreMapping.
        // Die ursprüngliche Logik hier war sehr komplex und scheint authUids mit DisplayNames zu mischen.
        // Ich gehe von einer Standardzuordnung aus, wenn game.teams nicht klar ist:
        if (playerIndex === 0 || playerIndex === 2) return 'bottom'; 
        if (playerIndex === 1 || playerIndex === 3) return 'top';  
    }
    
    logger.warn(`[calculateGroupStatisticsInternal:getPlayerTeamInGame] Konnte Team für Spieler ${playerDocId} in Spiel ${game.activeGameId || game.gameNumber} nicht eindeutig bestimmen.`);
    return null;
}

function getPlayerTeamInSession(
    playerDocId: string, // Logisch ist es playerDocId
    sessionData: InitialSessionData & { id: string, participantUids?: string[] } // participantPlayerDocIds -> participantUids
): 'teamA' | 'teamB' | null {
    // Muss angepasst werden, um playerDocId zu verwenden
    if (sessionData.teams?.teamA?.players.find(p => p.playerId === playerDocId)) return 'teamA'; // p.playerDocId -> p.playerId
    if (sessionData.teams?.teamB?.players.find(p => p.playerId === playerDocId)) return 'teamB'; // p.playerDocId -> p.playerId

    // Fallback basierend auf Index in participantUids
    if (sessionData.participantUids) { // participantPlayerDocIds -> participantUids
        const playerIndex = sessionData.participantUids.indexOf(playerDocId);
        if (playerIndex === -1) return null;
        // Standardannahme: Spieler 0&2 -> Team A, Spieler 1&3 -> Team B
        if (playerIndex === 0 || playerIndex === 2) return 'teamA';
        if (playerIndex === 1 || playerIndex === 3) return 'teamB';
    }
    return null;
}

// Hilfsfunktion zur Namensauflösung
async function resolvePlayerInfos(
    playerDocIds: Set<string>,
    groupPlayers: { [playerDocId: string]: GroupPlayerEntry }
): Promise<Map<string, ResolvedPlayerInfo>> {
    const resolvedInfos = new Map<string, ResolvedPlayerInfo>();
    const authUidsToFetch = new Set<string>();

    // Schritt 1: Infos aus groupPlayers holen
    for (const pDocId of playerDocIds) {
        const groupEntry = groupPlayers[pDocId];
        let name = "Unbekannter Spieler";
        let authUid: string | undefined = undefined;

        if (groupEntry) {
            name = groupEntry.name || name;
            authUid = groupEntry.authUid;
            if (!groupEntry.isGuest && authUid && (!groupEntry.name || groupEntry.name.trim() === "")) {
                authUidsToFetch.add(authUid); // Name aus User-Profil holen, wenn Gruppenname leer
            }
        }
        resolvedInfos.set(pDocId, {
            finalPlayerName: name,
            finalPlayerIdForStats: pDocId,
            authUid: authUid
        });
    }

    // Schritt 2: Fehlende Namen für registrierte User aus Users-Collection holen
    if (authUidsToFetch.size > 0) {
        const userProfilePromises = Array.from(authUidsToFetch).map(async (uid) => {
            try {
                const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData && userData.displayName) {
                        return { authUid: uid, displayName: userData.displayName };
                    }
                }
                return { authUid: uid, displayName: null };
            } catch (error) {
                logger.error(`[resolvePlayerInfos] Error fetching user profile for ${uid}:`, error);
                return { authUid: uid, displayName: null };
            }
        });
        const userProfiles = await Promise.all(userProfilePromises);
        const usersCache = new Map<string, string>();
        userProfiles.forEach(p => {
            if (p.displayName) usersCache.set(p.authUid, p.displayName);
        });

        // Namen in resolvedInfos aktualisieren
        for (const pDocId of playerDocIds) {
            const currentInfo = resolvedInfos.get(pDocId);
            if (currentInfo && currentInfo.authUid && (!currentInfo.finalPlayerName || currentInfo.finalPlayerName === "Unbekannter Spieler" || currentInfo.finalPlayerName.trim() === "")) {
                 if (usersCache.has(currentInfo.authUid)) {
                    const cachedName = usersCache.get(currentInfo.authUid);
                    if (cachedName) {
                        currentInfo.finalPlayerName = cachedName;
                    }
                 }
            }
            if (currentInfo && (!currentInfo.finalPlayerName || currentInfo.finalPlayerName.trim() === "")) {
                currentInfo.finalPlayerName = "Unbekannter Jasser"; // Endgültiger Fallback
            }
        }
    }
     // Sicherstellen, dass jeder einen Namen hat
    resolvedInfos.forEach(info => {
        if (!info.finalPlayerName || info.finalPlayerName.trim() === "") {
            info.finalPlayerName = "Unbekannter Jasser";
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

        // Annahme: groupData.players enthält { playerDocId: GroupPlayerEntry }
        const groupMemberPlayerDocIds = new Set<string>(Object.keys(groupData.players || {}));
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
        const allGamesFlat: CompletedGameData[] = [];
        const gamesBySessionIdMap = new Map<string, CompletedGameData[]>();
        const sessionDataCache = new Map<string, InitialSessionData & { id: string, endedAt?: admin.firestore.Timestamp | number, startedAt?: admin.firestore.Timestamp | number, participantUids?: string[] }>(); // participantPlayerDocIds -> participantUids
        
        // Erste Schleife: Sammle alle PlayerDocIds aus allen Spielen und Basis-Zeitstempel
        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDoc.data() as InitialSessionData & { id: string, endedAt?: admin.firestore.Timestamp | number, startedAt?: admin.firestore.Timestamp | number, participantUids?: string[] }; // participantPlayerDocIds -> participantUids
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
            const gamesOfThisSession: CompletedGameData[] = [];
            gamesSnap.forEach(gameDoc => {
                const game = gameDoc.data() as CompletedGameData; // Enthält participantUids
                if (game.participantUids && Array.isArray(game.participantUids)) { // participantPlayerDocIds -> participantUids
                    game.participantUids.forEach(pId => { // pDocId -> pId (behandeln als PlayerDocID)
                        actualParticipantPlayerDocIds.add(pId); 
                    });
                }
                (game as CompletedGameData & { sessionId?: string }).sessionId = sessionDoc.id;
                totalPlayTimeMillis += game.durationMillis || 0;
                allGamesFlat.push(game);
                gamesOfThisSession.push(game);
            });
            gamesBySessionIdMap.set(sessionDoc.id, gamesOfThisSession);
        }
        
        // NEU: Lade Spielernamen und Infos basierend auf PlayerDocIDs
        const playerInfoCache = await resolvePlayerInfos(actualParticipantPlayerDocIds, groupData.players || {});
        logger.info(`[calculateGroupStatisticsInternal] actualParticipantPlayerDocIds (from games, size ${actualParticipantPlayerDocIds.size}): ${Array.from(actualParticipantPlayerDocIds).join(', ')}`);
        logger.info(`[calculateGroupStatisticsInternal] playerInfoCache (size ${playerInfoCache.size}) populated.`);
        
        // groupMemberPlayerDocIds wurde bereits oben aus groupData.players geholt.

        const playerLastActivityMs = new Map<string, number>(); // Key ist playerDocId

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

            if (sessionData.participantUids && sessionEndMs > 0) { // participantPlayerDocIds -> participantUids
                sessionData.participantUids.forEach(pDocId => { // pid -> pDocId, behandeln als PlayerDocID
                    if (groupMemberPlayerDocIds.has(pDocId)) { // Prüfe gegen groupMemberPlayerDocIds
                        const currentLastMs = playerLastActivityMs.get(pDocId) || 0;
                        playerLastActivityMs.set(pDocId, Math.max(currentLastMs, sessionEndMs));
                    }
                });
            }
        }

        calculatedStats.gameCount = allGamesFlat.length;
        calculatedStats.totalPlayTimeSeconds = Math.round(totalPlayTimeMillis / 1000);
        if (firstJassTimestampMs) calculatedStats.firstJassTimestamp = admin.firestore.Timestamp.fromMillis(firstJassTimestampMs);
        if (lastJassTimestampMs) calculatedStats.lastJassTimestamp = admin.firestore.Timestamp.fromMillis(lastJassTimestampMs);
        
        // Hier beginnt die Portierung der komplexeren Logik aus statisticsService.ts
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
        allGamesFlat.forEach(game => {
            totalRounds += (game.roundHistory?.length || 0) -1; // -1, da History Index 0-basiert ist für Anzahl Runden
        });
        if (calculatedStats.gameCount > 0 && totalRounds > 0) {
            calculatedStats.avgRoundsPerGame = parseFloat((totalRounds / calculatedStats.gameCount).toFixed(1));
            calculatedStats.avgRoundDurationSeconds = Math.round((totalPlayTimeMillis / totalRounds) / 1000);
        }

        let totalMatschStiche = 0;
        allGamesFlat.forEach(game => {
            totalMatschStiche += (game.finalStriche?.top?.matsch || 0) + (game.finalStriche?.bottom?.matsch || 0);
        });
        if (calculatedStats.gameCount > 0) {
            calculatedStats.avgMatschPerGame = parseFloat((totalMatschStiche / calculatedStats.gameCount).toFixed(2));
        }

        // Trumpffarben-Statistik (Beispiel, muss detailliert implementiert werden)
        // TODO: Trumpf-Logik aus statisticsService.ts portieren (game.trumpf)
        const trumpfCounts: { [key: string]: number } = {};
        allGamesFlat.forEach(game => {
            const gameData = game as CompletedGameData & { trumpf?: string }; // Für Zugriff auf dynamische Felder wie trumpf
            if (gameData.trumpf) {
                trumpfCounts[gameData.trumpf] = (trumpfCounts[gameData.trumpf] || 0) + 1;
            }
        });
        if (allGamesFlat.length > 0) {
            calculatedStats.trumpfFarbenStatistik = Object.entries(trumpfCounts).map(([farbe, anzahl]) => ({
                farbe,
                anzahl,
                anteil: parseFloat((anzahl / allGamesFlat.length).toFixed(3)) // Anteil berechnen und auf 3 Dezimalstellen runden
            })).sort((a, b) => b.anzahl - a.anzahl);
        }

        // Spieler-Highlights und Team-Highlights
        // Diese sind die komplexesten Teile und erfordern die Portierung der Ranking-Logik
        // Für den Moment lasse ich sie als `null`, um das Grundgerüst funktionsfähig zu halten.
        // Die Implementierung würde hier folgen, basierend auf allGamesFlat, sessionsSnap.docs und groupData.

        // Temporäre Platzhalter für noch nicht portierte Highlight-Listen:
        // calculatedStats.playerWithMostGames = null; // Wird jetzt implementiert

        const playerGameCounts = new Map<string, number>(); // Key: playerDocId
        allGamesFlat.forEach(game => {
            if (game.participantUids && Array.isArray(game.participantUids)) { // participantPlayerDocIds -> participantUids
                game.participantUids.forEach(pDocIdFromGame => {  // authUidFromGame -> pDocIdFromGame, behandeln als PlayerDocID
                    if (groupMemberPlayerDocIds.has(pDocIdFromGame)) {  // groupMemberAuthUIDs -> groupMemberPlayerDocIds
                        const currentCount = playerGameCounts.get(pDocIdFromGame) || 0;
                        playerGameCounts.set(pDocIdFromGame, currentCount + 1);
                    } else {
                        logger.warn(`[calculateGroupStatisticsInternal] Spieler ${pDocIdFromGame} aus Spiel ist KEIN Mitglied der Gruppe und wird für Spielanzahl nicht gezählt.`);
                    }
                });
            }
        });

        const playerMostGamesList: GroupStatHighlightPlayer[] = [];
        playerGameCounts.forEach((count, pDocId) => { // authUID -> pDocId
            const lastMs = playerLastActivityMs.get(pDocId);
            const playerInfo = playerInfoCache.get(pDocId);
            playerMostGamesList.push({
                playerId: pDocId, // playerDocId
                playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                value: count,
                lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
            });
        });

        // Sortieren nach Anzahl Spiele (absteigend)
        playerMostGamesList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithMostGames = playerMostGamesList;
        
        const playerStricheStats = new Map<string, { for: number, against: number, games: number }>(); // Key: playerDocId

        actualParticipantPlayerDocIds.forEach(pDocId => { // authUID -> pDocId
            if (groupMemberPlayerDocIds.has(pDocId)) { // Initialisiere nur für Gruppenmitglieder
                playerStricheStats.set(pDocId, { for: 0, against: 0, games: 0 });
            }
        });

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id);
            if (!sessionData) continue; // Überspringen, falls nicht im Cache

            const gamesOfThisSession = gamesBySessionIdMap.get(sessionDoc.id) || [];

            for (const game of gamesOfThisSession) {
                if (game.finalStriche && game.participantUids) { // participantPlayerDocIds -> participantUids
                    const stricheTopTeam = calculateTotalStriche(game.finalStriche.top, groupData.strokeSettings, groupData.scoreSettings?.enabled);
                    const stricheBottomTeam = calculateTotalStriche(game.finalStriche.bottom, groupData.strokeSettings, groupData.scoreSettings?.enabled);

                    game.participantUids.forEach(pDocIdFromGame => { // authUidFromGame -> pDocIdFromGame, behandeln als PlayerDocID
                        if (groupMemberPlayerDocIds.has(pDocIdFromGame)) { 
                            const playerCurrentStats = playerStricheStats.get(pDocIdFromGame); 
                            if (playerCurrentStats) { 
                                playerCurrentStats.games++; 

                                const playerTeamPosition = getPlayerTeamInGame(pDocIdFromGame, game, sessionData.teams ?? undefined, sessionData.teamScoreMapping);

                                if (playerTeamPosition === 'top') {
                                    playerCurrentStats.for += stricheTopTeam;
                                    playerCurrentStats.against += stricheBottomTeam;
                                } else if (playerTeamPosition === 'bottom') {
                                    playerCurrentStats.for += stricheBottomTeam;
                                    playerCurrentStats.against += stricheTopTeam;
                                } else {
                                    logger.warn(`[calculateGroupStatisticsInternal] Spieler ${pDocIdFromGame} in Spiel ${game.activeGameId || game.gameNumber} (Session ${sessionData.id}) keinem Team zugeordnet für Striche.`);
                                }
                            }
                        }
                    });
                }
            }
        }

        const playerStricheDiffList: GroupStatHighlightPlayer[] = [];
        playerStricheStats.forEach((stats, pDocId) => { // authUID -> pDocId
            if (stats.games > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                playerStricheDiffList.push({
                    playerId: pDocId, // playerDocId
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.for - stats.against,
                    eventsPlayed: stats.games,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerStricheDiffList.sort((a, b) => b.value - a.value);
        calculatedStats.playerWithHighestStricheDiff = playerStricheDiffList;

        // calculatedStats.playerWithHighestWinRateSession = null; // Wird jetzt implementiert
        const playerSessionWinStats = new Map<string, { played: number, won: number }>(); // Key: playerDocId
        actualParticipantPlayerDocIds.forEach(pDocId => { // authUID -> pDocId
            if (groupMemberPlayerDocIds.has(pDocId)) { 
                playerSessionWinStats.set(pDocId, { played: 0, won: 0 });
            }
        });

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id) as InitialSessionData & { id: string, status?: string, finalScores?: { teamA: number, teamB: number }, teams?: SessionTeams, participantUids?: string[] }; // participantPlayerDocIds -> participantUids
            if (!sessionData) continue; // Überspringen, falls nicht im Cache

            logger.info(`[calculateGroupStatisticsInternal] Processing session ID: ${sessionData.id}`); // LOGGING START
            logger.info(`[calculateGroupStatisticsInternal] Session Data for ${sessionData.id}:`, {
                status: sessionData.status,
                finalScores: sessionData.finalScores,
                teams: JSON.stringify(sessionData.teams), // Stringify für bessere Log-Ausgabe von Objekten
                participantUids: sessionData.participantUids,
            }); // LOGGING END

            if (sessionData.status !== 'completed' || 
                !sessionData.finalScores || 
                !sessionData.participantUids || 
                sessionData.participantUids.length === 0 || 
                !sessionData.teams) { 
                logger.warn(`[calculateGroupStatisticsInternal] Session ${sessionData.id} wird für WinRate übersprungen: Status nicht completed, keine finalScores, keine Teilnehmer oder keine Teamdaten.`); // Erweiterte Log-Nachricht
                continue; 
            }

            let sessionWinnerTeamLabel: 'teamA' | 'teamB' | 'draw' = 'draw';
            if (sessionData.finalScores.teamA > sessionData.finalScores.teamB) {
                sessionWinnerTeamLabel = 'teamA';
            } else if (sessionData.finalScores.teamB > sessionData.finalScores.teamA) {
                sessionWinnerTeamLabel = 'teamB';
            }
            logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Determined winnerTeamLabel: ${sessionWinnerTeamLabel}`); // LOGGING

            sessionData.participantUids.forEach(pDocIdFromSession => { 
                logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}, Processing player: ${pDocIdFromSession}`); // LOGGING

                if (groupMemberPlayerDocIds.has(pDocIdFromSession)) { 
                    const stats = playerSessionWinStats.get(pDocIdFromSession);
                    if (stats) { 
                        stats.played++;
                        logger.info(`[calculateGroupStatisticsInternal] Player ${pDocIdFromSession} in Session ${sessionData.id}: stats.played incremented to ${stats.played}`); // LOGGING

                        if (sessionWinnerTeamLabel !== 'draw') {
                            const playerActualTeamInSession = getPlayerTeamInSession(pDocIdFromSession, sessionData);
                            logger.info(`[calculateGroupStatisticsInternal] Player ${pDocIdFromSession} in Session ${sessionData.id}: playerActualTeamInSession = ${playerActualTeamInSession}`); // LOGGING

                            if (playerActualTeamInSession === sessionWinnerTeamLabel) {
                                stats.won++;
                                logger.info(`[calculateGroupStatisticsInternal] Player ${pDocIdFromSession} in Session ${sessionData.id}: WIN! stats.won incremented to ${stats.won}. (playerTeam: ${playerActualTeamInSession}, winnerLabel: ${sessionWinnerTeamLabel})`); // LOGGING
                            } else {
                                logger.info(`[calculateGroupStatisticsInternal] Player ${pDocIdFromSession} in Session ${sessionData.id}: NO WIN. (playerTeam: ${playerActualTeamInSession}, winnerLabel: ${sessionWinnerTeamLabel})`); // LOGGING
                            }
                        } else {
                            logger.info(`[calculateGroupStatisticsInternal] Player ${pDocIdFromSession} in Session ${sessionData.id}: DRAW. No win counted.`); // LOGGING
                        }
                    } else {
                        logger.warn(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Keine Win-Stats für Spieler ${pDocIdFromSession} gefunden, obwohl er Gruppenmitglied ist.`); // Erweiterte Log-Nachricht
                    }
                } else {
                    logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Spieler ${pDocIdFromSession} ist kein Gruppenmitglied, wird für WinRate ignoriert.`); // Erweiterte Log-Nachricht
                }
            });
        }

        const playerSessionWinRateList: GroupStatHighlightPlayer[] = [];
        playerSessionWinStats.forEach((stats, pDocId) => { // authUID -> pDocId
            if (stats.played > 0) {
                const lastMs = playerLastActivityMs.get(pDocId);
                const playerInfo = playerInfoCache.get(pDocId);
                playerSessionWinRateList.push({
                    playerId: pDocId, // playerDocId
                    playerName: playerInfo?.finalPlayerName || "Unbekannter Jasser",
                    value: stats.won / stats.played,
                    eventsPlayed: stats.played,
                    lastPlayedTimestamp: lastMs ? admin.firestore.Timestamp.fromMillis(lastMs) : null,
                });
            }
        });

        playerSessionWinRateList.sort((a, b) => {
            if (b.value !== a.value) {
                return b.value - a.value; // Höchste WinRate zuerst
            }
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0); // Bei gleicher Rate, mehr Sessions zuerst
        });
        calculatedStats.playerWithHighestWinRateSession = playerSessionWinRateList;

        // calculatedStats.playerWithHighestWinRateGame = null; // Wird jetzt implementiert
        const playerGameWinStats = new Map<string, { played: number, won: number }>(); // Key: playerDocId
        actualParticipantPlayerDocIds.forEach(pDocId => { // authUID -> pDocId
            if (groupMemberPlayerDocIds.has(pDocId)) { 
                playerGameWinStats.set(pDocId, { played: 0, won: 0 });
            }
        });

        for (const game of allGamesFlat) {
            if (!game.finalScores || !game.participantUids) { // participantPlayerDocIds -> participantUids
                continue; // Nur Spiele mit Scores und Teilnehmern
            }
            const currentGameSessionData = game.sessionId ? sessionDataCache.get(game.sessionId) : undefined;

            const winningTeamPosition = determineWinningTeam(game.finalScores);

            game.participantUids.forEach(pDocIdFromGame => { // authUidFromGame -> pDocIdFromGame, behandeln als PlayerDocID
                if (groupMemberPlayerDocIds.has(pDocIdFromGame)) { 
                    const stats = playerGameWinStats.get(pDocIdFromGame);
                    if (stats) { 
                        stats.played++;

                        if (winningTeamPosition !== 'draw') {
                            const playerTeam = getPlayerTeamInGame(pDocIdFromGame, game, currentGameSessionData?.teams ?? undefined, currentGameSessionData?.teamScoreMapping);
                            if (playerTeam === winningTeamPosition) {
                                stats.won++;
                            }
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

        // calculatedStats.playerWithHighestMatschRate = null; // Wird jetzt implementiert
        const teamMatschStats = new Map<string, { playerDocIds: [string, string], playerNames: [string, string], played: number, matschWon: number }>(); // Key: teamKey

        for (const game of allGamesFlat) {
            if (!game.finalStriche || !game.participantUids || game.participantUids.length !== 4) { // participantPlayerDocIds -> participantUids (twice)
                continue; // Nur Spiele mit finalStriche und Teilnehmern
            }
            const currentGameSessionData = game.sessionId ? sessionDataCache.get(game.sessionId) : undefined;
            const pids = game.participantUids; // participantPlayerDocIds -> participantUids

            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}_${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}_${teamBPidsSorted[1]}`;
            const teamANames: [string, string] = [playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X', playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y']; // livePlayerNamesMap -> playerInfoCache
            const teamBNames: [string, string] = [playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z', playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W']; // livePlayerNamesMap -> playerInfoCache

            if (!teamMatschStats.has(teamAKey)) {
                teamMatschStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, played: 0, matschWon: 0 }); // playerIds -> playerDocIds
            }
            const teamAStats = teamMatschStats.get(teamAKey);
            if (teamAStats) teamAStats.played++;

            if (!teamMatschStats.has(teamBKey)) {
                teamMatschStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, played: 0, matschWon: 0 }); // playerIds -> playerDocIds
            }
            const teamBStats = teamMatschStats.get(teamBKey);
            if (teamBStats) teamBStats.played++;

            const topTeamScoredMatsch = (game.finalStriche.top?.matsch || 0) > 0;
            const bottomTeamScoredMatsch = (game.finalStriche.bottom?.matsch || 0) > 0;

            if (topTeamScoredMatsch || bottomTeamScoredMatsch) {
                const teamAPosition = getPlayerTeamInGame(pids[0], game, currentGameSessionData?.teams ?? undefined, currentGameSessionData?.teamScoreMapping);
                const teamBPosition = getPlayerTeamInGame(pids[1], game, currentGameSessionData?.teams ?? undefined, currentGameSessionData?.teamScoreMapping);

                if (teamAStats) {
                    if (teamAPosition === 'top' && topTeamScoredMatsch) {
                        teamAStats.matschWon++;
                    } else if (teamAPosition === 'bottom' && bottomTeamScoredMatsch) {
                        teamAStats.matschWon++;
                    }
                }

                // Prüfe Team B separat, da Teams nicht unbedingt komplementär sind, falls getPlayerTeamInGame für einen Spieler null liefert
                if (teamBStats) {
                    if (teamBPosition === 'top' && topTeamScoredMatsch) {
                        teamBStats.matschWon++;
                    } else if (teamBPosition === 'bottom' && bottomTeamScoredMatsch) {
                        teamBStats.matschWon++;
                    }
                }
            }
        }

        const teamMatschRateList: GroupStatHighlightTeam[] = [];
        teamMatschStats.forEach((stats) => {
            if (stats.played > 0) {
                teamMatschRateList.push({
                    names: stats.playerNames,
                    value: parseFloat((stats.matschWon / stats.played).toFixed(2)),
                    eventsPlayed: stats.played,
                });
            }
        });

        teamMatschRateList.sort((a, b) => {
            const valA = typeof a.value === 'number' ? a.value : 0;
            const valB = typeof b.value === 'number' ? b.value : 0;
            if (valB !== valA) {
                return valB - valA;
            }
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.teamWithHighestMatschRate = teamMatschRateList;

        // calculatedStats.teamWithMostWeisPointsAvg = null; // Wird jetzt implementiert
        const teamWeisStats = new Map<string, { playerDocIds: [string, string], playerNames: string[], totalWeis: number, gamesPlayed: number }>(); // playerIds -> playerDocIds, playerNames zu string[] geändert

        for (const game of allGamesFlat) {
            if (!game.participantUids || game.participantUids.length !== 4) { // participantPlayerDocIds -> participantUids
                continue; 
            }
            const currentGameSessionData = game.sessionId ? sessionDataCache.get(game.sessionId) : undefined;
            const pids = game.participantUids; // participantPlayerDocIds -> participantUids

            const teamAPidsSorted = [pids[0], pids[2]].sort() as [string, string];
            const teamBPidsSorted = [pids[1], pids[3]].sort() as [string, string];
            const teamAKey = `${teamAPidsSorted[0]}_${teamAPidsSorted[1]}`;
            const teamBKey = `${teamBPidsSorted[0]}_${teamBPidsSorted[1]}`;
            const teamANames: string[] = [playerInfoCache.get(teamAPidsSorted[0])?.finalPlayerName || 'Sp X', playerInfoCache.get(teamAPidsSorted[1])?.finalPlayerName || 'Sp Y']; // livePlayerNamesMap -> playerInfoCache, Typ zu string[]
            const teamBNames: string[] = [playerInfoCache.get(teamBPidsSorted[0])?.finalPlayerName || 'Sp Z', playerInfoCache.get(teamBPidsSorted[1])?.finalPlayerName || 'Sp W']; // livePlayerNamesMap -> playerInfoCache, Typ zu string[]

            if (!teamWeisStats.has(teamAKey)) {
                teamWeisStats.set(teamAKey, { playerDocIds: teamAPidsSorted, playerNames: teamANames, totalWeis: 0, gamesPlayed: 0 }); // playerIds -> playerDocIds
            }
            const teamAWeisStats = teamWeisStats.get(teamAKey);
            if (teamAWeisStats) teamAWeisStats.gamesPlayed++;

            if (!teamWeisStats.has(teamBKey)) {
                teamWeisStats.set(teamBKey, { playerDocIds: teamBPidsSorted, playerNames: teamBNames, totalWeis: 0, gamesPlayed: 0 }); // playerIds -> playerDocIds
            }
            const teamBWeisStats = teamWeisStats.get(teamBKey);
            if (teamBWeisStats) teamBWeisStats.gamesPlayed++;

            const teamAPosition = getPlayerTeamInGame(pids[0], game, currentGameSessionData?.teams ?? undefined, currentGameSessionData?.teamScoreMapping);
            const teamBPosition = getPlayerTeamInGame(pids[1], game, currentGameSessionData?.teams ?? undefined, currentGameSessionData?.teamScoreMapping);

            if (teamAPosition && teamAWeisStats) {
                const weisTeamA = extractWeisPointsFromGameData(teamAPosition, game);
                teamAWeisStats.totalWeis += weisTeamA;
            }
            if (teamBPosition && teamBWeisStats) {
                const weisTeamB = extractWeisPointsFromGameData(teamBPosition, game);
                teamBWeisStats.totalWeis += weisTeamB;
            }
        }

        const teamAvgWeisList: GroupStatHighlightTeam[] = [];
        teamWeisStats.forEach((stats) => {
            if (stats.gamesPlayed > 0) {
                teamAvgWeisList.push({
                    names: stats.playerNames,
                    value: parseFloat((stats.totalWeis / stats.gamesPlayed).toFixed(1)),
                    eventsPlayed: stats.gamesPlayed,
                });
            }
        });

        teamAvgWeisList.sort((a, b) => {
            const valA = typeof a.value === 'number' ? a.value : 0;
            const valB = typeof b.value === 'number' ? b.value : 0;
            if (valB !== valA) {
                return valB - valA;
            }
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.teamWithMostWeisPointsAvg = teamAvgWeisList;

        // NEU: teamWithHighestWinRateSession Logik überarbeiten
        const teamSessionWinStats = new Map<string, { playerDocIds: string[], playerNames: string[], played: number, won: number }>();

        for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDataCache.get(sessionDoc.id) as InitialSessionData & { id: string, status?: string, finalScores?: { teamA: number, teamB: number }, teams?: SessionTeams, participantUids?: string[] };
            
            logger.info(`[calculateGroupStatisticsInternal] Processing session ID: ${sessionData.id}`); // LOGGING START
            logger.info(`[calculateGroupStatisticsInternal] Session Data for ${sessionData.id}:`, {
                status: sessionData.status,
                finalScores: sessionData.finalScores,
                teams: JSON.stringify(sessionData.teams), // Stringify für bessere Log-Ausgabe von Objekten
                participantUids: sessionData.participantUids,
            }); // LOGGING END

            if (sessionData.status !== 'completed' || 
                !sessionData.finalScores || 
                !sessionData.participantUids || 
                sessionData.participantUids.length === 0 || 
                !sessionData.teams) { 
                logger.warn(`[calculateGroupStatisticsInternal] Session ${sessionData.id} wird für Team-WinRate übersprungen: unvollständige Daten (Status, Scores, Teilnehmer, Teams).`);
                continue;
            }

            const teamAPlayers = sessionData.teams.teamA.players.map(p => p.playerId).filter(pId => groupMemberPlayerDocIds.has(pId)).sort();
            const teamBPlayers = sessionData.teams.teamB.players.map(p => p.playerId).filter(pId => groupMemberPlayerDocIds.has(pId)).sort();

            logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Filtered teamAPlayers (must be group members): [${teamAPlayers.join(', ')}], Filtered teamBPlayers: [${teamBPlayers.join(', ')}]`);

            if (teamAPlayers.length === 0 && teamBPlayers.length === 0) { // Geändert: erlaubt, dass ein Team leer ist, wenn das andere Spieler hat
                 logger.warn(`[calculateGroupStatisticsInternal] Session ${sessionData.id} hat KEINE Spieler in Team A UND Team B nach Filterung auf Gruppenmitglieder. Überspringe für Team-WinRate.`);
                 continue;
            }
            
            const teamAKey = teamAPlayers.join('_');
            const teamBKey = teamBPlayers.join('_');

            if (teamAKey === teamBKey && teamAPlayers.length > 0) { 
                logger.warn(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Team A und Team B sind identisch nach Spielerfilterung (${teamAKey}). Überspringe für Team-WinRate.`);
                continue;
            }

            const teamANames = teamAPlayers.map(pId => playerInfoCache.get(pId)?.finalPlayerName || 'N/A');
            const teamBNames = teamBPlayers.map(pId => playerInfoCache.get(pId)?.finalPlayerName || 'N/A');

            logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Team A Key: '${teamAKey}', Names: [${teamANames.join(', ')}]. Team B Key: '${teamBKey}', Names: [${teamBNames.join(', ')}]`);

            // Team A Stats
            if (teamAPlayers.length > 0) { 
                if (!teamSessionWinStats.has(teamAKey)) {
                    teamSessionWinStats.set(teamAKey, { playerDocIds: teamAPlayers, playerNames: teamANames, played: 0, won: 0 });
                }
                const teamAStats = teamSessionWinStats.get(teamAKey);
                if (teamAStats) teamAStats.played++;
                logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}, Team A (${teamAKey}): stats.played incremented to ${teamAStats?.played}`);
            }

            // Team B Stats
            if (teamBPlayers.length > 0) { 
                if (!teamSessionWinStats.has(teamBKey)) {
                    teamSessionWinStats.set(teamBKey, { playerDocIds: teamBPlayers, playerNames: teamBNames, played: 0, won: 0 });
                }
                const teamBStats = teamSessionWinStats.get(teamBKey);
                if (teamBStats) teamBStats.played++;
                 logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}, Team B (${teamBKey}): stats.played incremented to ${teamBStats?.played}`);
            }
            
            // Gewinner ermitteln
            const finalScores = sessionData.finalScores as { teamA: number, teamB: number }; // Type assertion
            if (finalScores.teamA > finalScores.teamB) {
                const teamAStats = teamSessionWinStats.get(teamAKey);
                if (teamAPlayers.length > 0 && teamAStats) {
                    teamAStats.won++;
                    logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}, Team A (${teamAKey}): WIN! stats.won incremented to ${teamAStats.won}. (Score A: ${finalScores.teamA}, Score B: ${finalScores.teamB})`);
                } else if (teamAPlayers.length === 0) {
                    logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Team A hat gewonnen, aber Team A Key ('${teamAKey}') hatte keine Spieler nach Filterung. Kein Gewinn für Team A verbucht.`);
                }
            } else if (finalScores.teamB > finalScores.teamA) {
                const teamBStats = teamSessionWinStats.get(teamBKey);
                if (teamBPlayers.length > 0 && teamBStats) {
                    teamBStats.won++;
                     logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}, Team B (${teamBKey}): WIN! stats.won incremented to ${teamBStats.won}. (Score A: ${finalScores.teamA}, Score B: ${finalScores.teamB})`);
                } else if (teamBPlayers.length === 0) {
                     logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: Team B hat gewonnen, aber Team B Key ('${teamBKey}') hatte keine Spieler nach Filterung. Kein Gewinn für Team B verbucht.`);
                }
            } else {
                 logger.info(`[calculateGroupStatisticsInternal] Session ${sessionData.id}: DRAW. No win counted for teams. (Score A: ${finalScores.teamA}, Score B: ${finalScores.teamB})`);
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
            if (valB !== valA) {
                return valB - valA;
            }
            return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        });
        calculatedStats.teamWithHighestWinRateSession = teamSessionWinRateList; // Hier zuweisen

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