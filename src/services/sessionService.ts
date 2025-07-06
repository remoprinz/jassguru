import { getFirestore, collection, query, where, orderBy, getDocs, Timestamp as ClientTimestamp, doc, updateDoc, deleteField, getDoc, Timestamp } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import type { PlayerNames, TeamScores, StricheRecord, CompletedGameSummary, FirestoreGroup } from '@/types/jass';
import { db } from "./firebaseInit";
import { JassSession } from "../types/jass";

/**
 * Definiert die Struktur der zusammengefassten Informationen einer Session für die Listenansicht.
 * Diese Interface-Definition erleichtert die Integration mit den anderen Komponenten.
 */
export interface SessionSummary {
  id: string; // Session ID
  startedAt: number | null; // Startzeit als Millisekunden-Timestamp
  endedAt?: number | null; // Endzeit als Millisekunden-Timestamp (optional)
  lastCompletedGameUpdate?: number | Timestamp | null; // NEU: Für den grünen Haken
  groupId?: string | null; // Gruppen-ID, zu der die Session gehört
  playerNames: PlayerNames;
  participantUids: string[];
  finalScores?: TeamScores; // Optional, falls vorhanden
  finalStriche?: { top: StricheRecord; bottom: StricheRecord }; // Optional, falls vorhanden
  status?: string; // z.B. 'completed', 'active'
  // Erweiterte Felder für neue Statistik-Funktionalität
  teams?: any; // Die genaue Struktur aus jass.ts
  pairingIdentifiers?: any; // Die genaue Struktur aus jass.ts
  gruppeId?: string | null; // Alternative Bezeichnung für groupId (Legacy-Unterstützung)
  completedGamesCount?: number;
  currentScoreLimit?: number;
  lastActivity?: number | null;
  isTournamentSession?: boolean;
  tournamentInstanceId?: string | null;
  tournamentId?: string | null; // ✅ NEU: Für Turnier-Sessions aus jassGameSummaries
  metadata?: any; // Die genaue Struktur aus jass.ts
}

/**
 * Hilfsfunktion zum sicheren Parsen von Firestore Timestamps zu Millisekunden.
 */
function parseTimestampToMillis(timestamp: any): number | null {
  if (!timestamp) return null;
  if (timestamp instanceof ClientTimestamp) {
    return timestamp.toMillis();
  }
  if (typeof timestamp === 'object' && timestamp !== null &&
      typeof (timestamp as any).seconds === 'number' &&
      typeof (timestamp as any).nanoseconds === 'number') {
    return new ClientTimestamp((timestamp as any).seconds, (timestamp as any).nanoseconds).toMillis();
  }
  if (typeof timestamp === 'number') {
      return timestamp;
  }
  console.warn('Unrecognized timestamp format for parsing:', timestamp);
  return null;
}

/**
 * Lädt eine Liste von abgeschlossenen (oder aktiven) Jass-Session-Zusammenfassungen
 * für einen bestimmten Benutzer aus Firestore.
 *
 * @param userId Die UID des Benutzers, dessen Sessions geladen werden sollen.
 * @returns Ein Promise, das ein Array von SessionSummary-Objekten auflöst.
 */
export const fetchCompletedSessionsForUser = async (userId: string): Promise<SessionSummary[]> => {
  if (!userId) {
    console.error("[fetchCompletedSessionsForUser] userId is required.");
    return [];
  }

  try {
    const db = getFirestore(firebaseApp);
    const summariesRef = collection(db, 'jassGameSummaries');
    const q = query(
      summariesRef,
      where('participantUids', 'array-contains', userId),
      where('status', 'in', ['completed', 'completed_empty']),
      orderBy('startedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const sessions: SessionSummary[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      sessions.push({
        id: docSnap.id,
        startedAt: parseTimestampToMillis(data.startedAt),
        endedAt: parseTimestampToMillis(data.endedAt),
        groupId: data.groupId ?? data.gruppeId ?? null,
        playerNames: data.playerNames || {},
        participantUids: data.participantUids || [],
        finalScores: data.finalScores || null,
        finalStriche: data.finalStriche || null,
        status: data.status || 'unknown',
        teams: data.teams || null,
        pairingIdentifiers: data.pairingIdentifiers || null,
        gruppeId: data.gruppeId ?? data.groupId ?? null,
        currentScoreLimit: data.currentScoreLimit || 0,
        completedGamesCount: data.completedGamesCount || 0,
        lastActivity: data.lastActivity ? parseTimestampToMillis(data.lastActivity) : null,
        isTournamentSession: data.isTournamentSession || false,
        tournamentInstanceId: data.tournamentInstanceId || null,
        tournamentId: data.tournamentId || null, // ✅ NEU: Für Turnier-Sessions
        metadata: data.metadata || {},
      });
    });
    sessions.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    // console.log(`[fetchCompletedSessionsForUser] Found ${sessions.length} sessions for user: ${userId}`);
    return sessions;
  } catch (error) {
    console.error(`[fetchCompletedSessionsForUser] Error fetching sessions for user ${userId}:`, error);
    return [];
  }
};

/**
 * Setzt das currentActiveGameId Feld in einem JassSession-Dokument auf null.
 * @param sessionId Die ID der JassSession.
 */
export const clearActiveGameInSession = async (sessionId: string): Promise<void> => {
  if (!sessionId) {
    console.error("[clearActiveGameInSession] sessionId is required.");
    throw new Error("sessionId is required for clearActiveGameInSession");
  }

  const sessionRef = doc(db, "jassGameSummaries", sessionId);

  try {
    console.log(`[clearActiveGameInSession] Attempting to clear active game for session ${sessionId}.`);
    
    const docSnap = await getDoc(sessionRef);

    if (docSnap.exists()) {
      await updateDoc(sessionRef, {
        currentActiveGameId: null,
      });
      // console.log(`[clearActiveGameInSession] Successfully removed currentActiveGameId from session ${sessionId}.`);
    } else {
      // Wenn das Dokument nicht existiert, ist kein Update notwendig. Das Ziel (kein aktives Spiel) ist erreicht.
      console.log(`[clearActiveGameInSession] Document for session ${sessionId} does not exist. No update needed.`);
    }
  } catch (error) {
    console.error(`[clearActiveGameInSession] Error clearing active game from session ${sessionId}:`, error);
    // Den Fehler hier nicht erneut werfen, um den restlichen Abbruchprozess nicht zu stören,
    // es sei denn, es ist ein kritischer Fehler, der nicht ignoriert werden kann.
    // Für den Fall "No document to update" ist es sicher, den Fehler nicht weiterzugeben.
    if (!(error instanceof Error && error.message.includes("No document to update"))) {
      // Wirft den Fehler nur, wenn es nicht der erwartete "No document to update" Fehler ist.
      // Inzwischen sollte dieser Fall aber durch docSnap.exists() abgefangen werden.
      // throw error; // Überlege, ob andere Fehler hier fatal sind.
    }
  }
};

/**
 * Lädt alle abgeschlossenen oder leeren Sessions für eine bestimmte Gruppe.
 * Sortiert nach Startdatum absteigend.
 * @param groupId Die ID der Gruppe.
 * @returns Ein Promise, das ein Array von SessionSummary-Objekten (aus @/types/jass) auflöst.
 */
export const fetchAllGroupSessions = async (groupId: string): Promise<SessionSummary[]> => {
  if (!groupId) {
    console.error("[fetchAllGroupSessions] groupId is required.");
    return [];
  }
  // console.log(`[fetchAllGroupSessions] Fetching sessions for group: ${groupId}`);

  try {
    const db = getFirestore(firebaseApp);
    const sessionsRef = collection(db, 'jassGameSummaries');

    const q = query(
      sessionsRef,
      where('groupId', '==', groupId),
      where('status', 'in', ['completed', 'completed_empty']),
      orderBy('startedAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const sessions: SessionSummary[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      sessions.push({
        id: docSnap.id,
        startedAt: parseTimestampToMillis(data.startedAt),
        endedAt: parseTimestampToMillis(data.endedAt),
        groupId: data.groupId ?? data.gruppeId ?? null,
        playerNames: data.playerNames || {},
        participantUids: data.participantUids || [],
        finalScores: data.finalScores || null,
        finalStriche: data.finalStriche || null,
        status: data.status || 'unknown',
        teams: data.teams || null,
        pairingIdentifiers: data.pairingIdentifiers || null,
        gruppeId: data.gruppeId ?? data.groupId ?? null,
        currentScoreLimit: data.currentScoreLimit || 0,
        completedGamesCount: data.completedGamesCount || 0,
        lastActivity: data.lastActivity ? parseTimestampToMillis(data.lastActivity) : null,
        isTournamentSession: data.isTournamentSession || false,
        tournamentInstanceId: data.tournamentInstanceId || null,
        tournamentId: data.tournamentId || null, // ✅ NEU: Für Turnier-Sessions
        metadata: data.metadata || {},
      });
    });

    // console.log(`[fetchAllGroupSessions] Found ${sessions.length} sessions for group: ${groupId}.`);
    return sessions;
  } catch (error) {
    console.error(`[fetchAllGroupSessions] Error fetching sessions for group ${groupId}:`, error);
    return [];
  }
};

/**
 * Lädt alle abgeschlossenen Spiele für eine bestimmte Session.
 * @param sessionId Die ID der Session.
 * @returns Ein Promise, das ein Array von CompletedGameSummary-Objekten (aus @/types/jass) auflöst.
 */
export const fetchAllGamesForSession = async (sessionId: string): Promise<CompletedGameSummary[]> => {
  if (!sessionId) {
    console.error("[fetchAllGamesForSession] sessionId is required.");
    return [];
  }
  if (process.env.NODE_ENV === 'development') {
    console.log(`[fetchAllGamesForSession] Fetching games for session: ${sessionId}`);
  }

  try {
    const db = getFirestore(firebaseApp);
    const gamesRef = collection(db, 'jassGameSummaries', sessionId, 'completedGames');
    const q = query(gamesRef, orderBy('timestampCompleted', 'asc'));

    const querySnapshot = await getDocs(q);
    const games: CompletedGameSummary[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Explizites Mapping zu CompletedGameSummary Feldern
      games.push({
        gameNumber: data.gameNumber || 0,
        timestampCompleted: data.timestampCompleted,
        durationMillis: data.durationMillis || 0,
        finalScores: data.finalScores || { top: 0, bottom: 0 },
        finalStriche: data.finalStriche || { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
        weisPoints: data.weisPoints || { top: 0, bottom: 0 },
        startingPlayer: data.startingPlayer || 1,
        initialStartingPlayer: data.initialStartingPlayer || 1,
        playerNames: data.playerNames || {},
        trumpColorsPlayed: data.trumpColorsPlayed || [],
        roundHistory: data.roundHistory || [],
        participantUids: data.participantUids || [],
        groupId: data.groupId || null,
        activeGameId: data.activeGameId || docSnap.id,
        completedAt: data.completedAt,
        teams: data.teams || null,
      } as CompletedGameSummary);
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAllGamesForSession] Found ${games.length} games for session: ${sessionId}.`);
    }
    return games;
  } catch (error) {
    console.error(`[fetchAllGamesForSession] Error fetching games for session ${sessionId}:`, error);
    return [];
  }
};

/**
 * Lädt alle Sessions und die zugehörigen Spiele für eine Gruppe.
 * @param groupId Die ID der Gruppe.
 * @returns Ein Promise, das eine Map von Session-ID zu einem Array von CompletedGameSummary-Objekten auflöst.
 */
export const fetchAllGamesForGroup = async (groupId: string): Promise<Map<string, CompletedGameSummary[]>> => {
  const gamesBySessionMap = new Map<string, CompletedGameSummary[]>();
  if (!groupId) {
    console.error("[fetchAllGamesForGroup] groupId is required.");
    return gamesBySessionMap;
  }

  const sessions = await fetchAllGroupSessions(groupId);
  if (sessions.length === 0) {
    console.log(`[fetchAllGamesForGroup] No sessions found for group ${groupId}, returning empty map.`);
    return gamesBySessionMap;
  }

  console.log(`[fetchAllGamesForGroup] Fetching games for ${sessions.length} sessions in group ${groupId}.`);
  for (const session of sessions) {
    const games = await fetchAllGamesForSession(session.id);
    gamesBySessionMap.set(session.id, games);
    console.log(`[fetchAllGamesForGroup] Fetched ${games.length} games for session ${session.id}.`);
  }

  return gamesBySessionMap;
};

/**
 * Lädt die Details einer Gruppe.
 * @param groupId Die ID der Gruppe.
 * @returns Ein Promise, das ein FirestoreGroup-Objekt oder null auflöst.
 */
export const getGroupDetails = async (groupId: string): Promise<FirestoreGroup | null> => {
  if (!groupId) {
    console.error("[getGroupDetails] groupId is required.");
    return null;
  }
  console.log(`[getGroupDetails] Fetching details for group: ${groupId}`);

  try {
    const db = getFirestore(firebaseApp);
    const groupDocRef = doc(db, 'groups', groupId);
    const docSnap = await getDoc(groupDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const groupDetails: FirestoreGroup = {
        id: docSnap.id,
        name: data.name || '',
        description: data.description || '',
        logoUrl: data.logoUrl || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        createdBy: data.createdBy || '',
        playerIds: data.playerIds || [],
        adminIds: data.adminIds || [],
        isPublic: data.isPublic || false,
        players: data.players || {},
        farbeSettings: data.farbeSettings || undefined,
        scoreSettings: data.scoreSettings || undefined,
        strokeSettings: data.strokeSettings || undefined,
        gameCount: data.gameCount || 0,
      };
      console.log(`[getGroupDetails] Details found for group: ${groupId}.`);
      return groupDetails;
    }
    console.warn(`[getGroupDetails] No group found with ID: ${groupId}.`);
    return null;
  } catch (error) {
    console.error(`[getGroupDetails] Error fetching group details for ${groupId}:`, error);
    return null;
  }
}; 