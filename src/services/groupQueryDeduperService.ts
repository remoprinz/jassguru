import { db } from '@/services/firebaseInit';
import { collection, getDocs, query, where, orderBy, QuerySnapshot } from 'firebase/firestore';

/**
 * ⚡ CACHE für GroupView-Queries (Sessions + Players).
 *
 * Mehrere Charts auf GroupView (Elo-Verlauf, Team-Striche, Team-Points, Team-Matsch)
 * laden EXAKT dieselbe jassGameSummaries-Query und dieselbe players-Query.
 *
 * Dieser Cache hält das Resultat dauerhaft (für die ganze Browser-Session), sodass
 * Tab-Wechsel und Re-Mounts keine erneuten Roundtrips auslösen. Invalidiert wird
 * explizit über `invalidateGroupQueries()` — typischerweise nach erfolgreichem
 * Session-Abschluss (siehe ResultatKreidetafel.tsx).
 *
 * In-flight Promises werden weiterhin deduped, damit konkurrierende Aufrufer
 * sich denselben Roundtrip teilen.
 */

const sessionsCache = new Map<string, QuerySnapshot>();
const playersCache = new Map<string, QuerySnapshot>();
const sessionsInFlight = new Map<string, Promise<QuerySnapshot>>();
const playersInFlight = new Map<string, Promise<QuerySnapshot>>();

export function getGroupSessionsSnapshot(groupId: string): Promise<QuerySnapshot> {
  const cached = sessionsCache.get(groupId);
  if (cached) return Promise.resolve(cached);

  const inflight = sessionsInFlight.get(groupId);
  if (inflight) return inflight;

  const promise = getDocs(
    query(
      collection(db, `groups/${groupId}/jassGameSummaries`),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'asc'),
    ),
  ).then(snap => {
    sessionsCache.set(groupId, snap);
    return snap;
  }).finally(() => {
    sessionsInFlight.delete(groupId);
  });

  sessionsInFlight.set(groupId, promise);
  return promise;
}

export function getGroupPlayersSnapshot(groupId: string): Promise<QuerySnapshot> {
  const cached = playersCache.get(groupId);
  if (cached) return Promise.resolve(cached);

  const inflight = playersInFlight.get(groupId);
  if (inflight) return inflight;

  const promise = getDocs(
    query(collection(db, 'players'), where('groupIds', 'array-contains', groupId)),
  ).then(snap => {
    playersCache.set(groupId, snap);
    return snap;
  }).finally(() => {
    playersInFlight.delete(groupId);
  });

  playersInFlight.set(groupId, promise);
  return promise;
}

/**
 * Leert die Group-Query-Caches. Wenn groupId gegeben → nur diese Gruppe, sonst alle.
 * Wird typischerweise nach Session-Abschluss aufgerufen.
 */
export function invalidateGroupQueries(groupId?: string): void {
  if (groupId) {
    sessionsCache.delete(groupId);
    playersCache.delete(groupId);
    sessionsInFlight.delete(groupId);
    playersInFlight.delete(groupId);
  } else {
    sessionsCache.clear();
    playersCache.clear();
    sessionsInFlight.clear();
    playersInFlight.clear();
  }
}
