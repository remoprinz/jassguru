import { useEffect, useState, useRef } from 'react';
import { onSnapshot, query, collection, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';
import { invalidateAllSessionCaches } from '@/services/sessionCacheInvalidation';

/**
 * 🔔 Realtime-Listener auf das jüngste abgeschlossene jassGameSummary einer Gruppe.
 *
 * Sobald eine NEUE Session (oder ein Turnier) abgeschlossen wird — auch von einem
 * anderen Gerät —, invalidiert dieser Hook alle clientseitigen Caches und liefert
 * eine inkrementierende `revision` zurück. Komponenten fügen diese revision in ihre
 * data-loading useEffect deps ein → useEffects re-runnen → frische Daten aus Firestore.
 *
 * Implementation:
 * - Query `jassGameSummaries` where status='completed', orderBy completedAt desc, limit 1
 * - Bei der INITIALEN Snapshot wird nichts gemacht (sonst Endlos-Refetch beim Mount).
 * - Danach: jede Änderung des Top-Dokuments (neue oder umgeschriebene Session) →
 *   invalidate + setRevision(prev + 1).
 *
 * Robustheit:
 * - Auto-Reconnect ist in Firestore-SDK eingebaut (auch nach Offline-Phasen).
 * - Bei Snapshot-Fehler wird ein Warning geloggt, kein Crash.
 * - Ein Listener pro Gruppe; unsubscribe automatisch beim Wechsel/Unmount.
 */
export function useGroupSessionListener(groupId: string | undefined): number {
  const [revision, setRevision] = useState(0);
  const initialReceivedRef = useRef(false);
  const lastSeenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!groupId) {
      initialReceivedRef.current = false;
      lastSeenAtRef.current = null;
      return;
    }

    // Reset für neuen Gruppen-Wechsel
    initialReceivedRef.current = false;
    lastSeenAtRef.current = null;

    const q = query(
      collection(db, `groups/${groupId}/jassGameSummaries`),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const doc = snap.docs[0];
        const completedAt: any = doc?.data()?.completedAt;
        let ts: number | null = null;
        if (completedAt?.toMillis) {
          ts = completedAt.toMillis();
        } else if (typeof completedAt?._seconds === 'number') {
          ts = completedAt._seconds * 1000;
        }

        if (!initialReceivedRef.current) {
          // Initial-Snapshot — nur Baseline merken, kein Refetch triggern.
          initialReceivedRef.current = true;
          lastSeenAtRef.current = ts;
          return;
        }

        if (ts !== lastSeenAtRef.current) {
          lastSeenAtRef.current = ts;
          invalidateAllSessionCaches();
          setRevision((r) => r + 1);
        }
      },
      (error) => {
        console.warn('[useGroupSessionListener] onSnapshot error:', error);
      },
    );

    return () => unsubscribe();
  }, [groupId]);

  return revision;
}
