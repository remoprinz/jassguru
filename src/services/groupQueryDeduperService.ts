import { db } from '@/services/firebaseInit';
import { collection, getDocs, query, where, orderBy, QuerySnapshot } from 'firebase/firestore';

/**
 * ⚡ REQUEST-DEDUPER für GroupView-Charts.
 *
 * Mehrere Charts auf GroupView (Elo-Verlauf, Team-Striche, Team-Points, Team-Matsch)
 * laden parallel beim Mount EXAKT dieselbe jassGameSummaries-Query und EXAKT dieselbe
 * players-Query. Dieser Deduper sorgt dafür, dass nur EIN Firestore-Roundtrip pro
 * Query passiert — alle Aufrufer teilen sich das in-flight Promise.
 *
 * KEIN persistenter Cache: das Promise wird sofort nach Resolve aus der Map entfernt,
 * sodass der nächste Aufruf nach erfolgreichem Resolve frische Daten holt. Damit
 * gibt es keinerlei Staleness-Risiko — der Deduper kollabiert nur konkurrierende
 * Anfragen, die sowieso identische Daten zurückgeben würden.
 */

const sessionsInFlight = new Map<string, Promise<QuerySnapshot>>();
const playersInFlight = new Map<string, Promise<QuerySnapshot>>();

/**
 * Liefert alle completed jassGameSummaries einer Gruppe, sortiert chronologisch.
 * Konkurrierende Aufrufe teilen sich denselben Roundtrip.
 */
export function getGroupSessionsSnapshot(groupId: string): Promise<QuerySnapshot> {
  const existing = sessionsInFlight.get(groupId);
  if (existing) return existing;

  const promise = getDocs(
    query(
      collection(db, `groups/${groupId}/jassGameSummaries`),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'asc'),
    ),
  ).finally(() => {
    sessionsInFlight.delete(groupId);
  });

  sessionsInFlight.set(groupId, promise);
  return promise;
}

/**
 * Liefert alle Player-Docs einer Gruppe (für DisplayName-Auflösung in Team-Charts).
 * Konkurrierende Aufrufe teilen sich denselben Roundtrip.
 */
export function getGroupPlayersSnapshot(groupId: string): Promise<QuerySnapshot> {
  const existing = playersInFlight.get(groupId);
  if (existing) return existing;

  const promise = getDocs(
    query(collection(db, 'players'), where('groupIds', 'array-contains', groupId)),
  ).finally(() => {
    playersInFlight.delete(groupId);
  });

  playersInFlight.set(groupId, promise);
  return promise;
}
