import { persistToStorage, loadFromStorage, removeFromStorage } from '@/services/persistentCacheHelper';
import type { PlayerRatingWithTier } from '@/services/jassElo';

/**
 * 🚀 INSTANT-Cache für die drei wichtigsten Elo-Anzeigen.
 *
 * Im Gegensatz zu den anderen Caches (die nach playerIds-Liste gekeyed sind und
 * nur via useEffect-Sync-Pfad greifen) sind diese hier nach **stabilen IDs**
 * gekeyed (groupId / playerId). Damit können Komponenten direkt im
 * useState-Initializer Daten aus localStorage holen — der allererste Render
 * zeigt schon die echten Daten, ohne Spinner-Flash.
 *
 * Gilt für:
 * - GroupView "🏆 Jass-Elo Rangliste"  → playerRatings, by groupId
 * - GroupView "📈 Jass-Elo Verlauf"    → chart-data, by groupId
 * - ProfileView "📈 Jass-Elo Verlauf"  → chart-data, by playerId
 *
 * Invalidiert via clearAllEloInstantCache() (nach Session-Abschluss).
 */

type ChartData = { labels: string[]; datasets: any[] };

const RANGLISTE_KEY = (gid: string) => `elo-rangliste:${gid}`;
const GROUP_VERLAUF_KEY = (gid: string) => `elo-verlauf-group:${gid}`;
const PLAYER_VERLAUF_KEY = (pid: string) => `elo-verlauf-player:${pid}`;

const KNOWN_GROUPS = new Set<string>();
const KNOWN_PLAYERS = new Set<string>();

// === Jass-Elo Rangliste (GroupView) ===
export function getRanglisteFromCache(groupId: string): Map<string, PlayerRatingWithTier> | null {
  const raw = loadFromStorage<Array<[string, PlayerRatingWithTier]>>(RANGLISTE_KEY(groupId));
  if (!raw || !Array.isArray(raw)) return null;
  try {
    return new Map(raw);
  } catch {
    return null;
  }
}

export function setRanglisteCache(groupId: string, ratings: Map<string, PlayerRatingWithTier>): void {
  persistToStorage(RANGLISTE_KEY(groupId), Array.from(ratings.entries()));
  KNOWN_GROUPS.add(groupId);
}

// === Jass-Elo Verlauf Chart (GroupView) ===
export function getGroupEloVerlaufFromCache(groupId: string): ChartData | null {
  return loadFromStorage<ChartData>(GROUP_VERLAUF_KEY(groupId));
}

export function setGroupEloVerlaufCache(groupId: string, data: ChartData): void {
  persistToStorage(GROUP_VERLAUF_KEY(groupId), data);
  KNOWN_GROUPS.add(groupId);
}

// === Jass-Elo Verlauf Chart (ProfileView) ===
export function getPlayerEloVerlaufFromCache(playerId: string): ChartData | null {
  return loadFromStorage<ChartData>(PLAYER_VERLAUF_KEY(playerId));
}

export function setPlayerEloVerlaufCache(playerId: string, data: ChartData): void {
  persistToStorage(PLAYER_VERLAUF_KEY(playerId), data);
  KNOWN_PLAYERS.add(playerId);
}

// === Invalidation ===
export function clearAllEloInstantCache(): void {
  KNOWN_GROUPS.forEach(gid => {
    removeFromStorage(RANGLISTE_KEY(gid));
    removeFromStorage(GROUP_VERLAUF_KEY(gid));
  });
  KNOWN_PLAYERS.forEach(pid => {
    removeFromStorage(PLAYER_VERLAUF_KEY(pid));
  });
  KNOWN_GROUPS.clear();
  KNOWN_PLAYERS.clear();
}
