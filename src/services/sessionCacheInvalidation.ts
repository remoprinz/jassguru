import { invalidateGroupQueries } from '@/services/groupQueryDeduperService';
import { invalidatePlayerRatingsCache } from '@/services/jassElo';
import { invalidateScoresHistoryCache } from '@/services/globalScoresHistoryService';

/**
 * 🔄 ZENTRALE CACHE-INVALIDIERUNG nach Session-Abschluss.
 *
 * Wird nach erfolgreichem finalizeSession-Aufruf gerufen (ResultatKreidetafel.tsx).
 * Leert alle drei Caches, sodass beim nächsten Render der frische Stand geladen
 * wird (inkl. der gerade abgeschlossenen Session).
 *
 * Die Caches sind dauerhaft (kein TTL) — diese Funktion ist der einzige Mechanismus,
 * der sie clearen darf.
 */
export function invalidateAllSessionCaches(): void {
  invalidateGroupQueries();
  invalidatePlayerRatingsCache();
  invalidateScoresHistoryCache();
}
