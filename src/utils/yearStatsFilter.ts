/**
 * 🗓️ Year-Filter Helpers für GroupView-Statistiken.
 *
 * Wenn der User einen bestimmten Jahresfilter wählt, kommen alle Stats hier durch:
 *   - Time-Series-Charts: nach Jahr slicen, optional Reset auf 0 bei Jahresanfang
 *   - Player/Team-Aggregate: aus rohen jassGameSummaries client-seitig
 *
 * Logik 1:1 abgeleitet aus dem (bereits validierten) Backfill-Script
 * `scripts/backfill-partner-opponent-stats-v2.mjs` — damit Vorzeichen und
 * Turnier-Handling matched.
 */

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Parse ein Label im Format "D.M.YYYY" oder "DD.MM.YYYY" (toLocaleDateString de-DE).
 * Gibt null zurück bei ungültigem Format.
 */
export function parseGermanDate(label: string): Date | null {
  if (!label || typeof label !== 'string') return null;
  const parts = label.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 1900 || year > 2100) return null;
  return new Date(year, month - 1, day);
}

/**
 * Extrahiert das Jahr aus einem Firestore-Timestamp-ähnlichen Wert.
 */
export function tsToYear(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getFullYear();
  if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000).getFullYear();
  if (ts instanceof Date) return ts.getFullYear();
  if (typeof ts === 'number') return new Date(ts).getFullYear();
  return null;
}

// ============================================================================
// AVAILABLE YEARS
// ============================================================================

/**
 * Welche Jahres-Pills anzeigen?
 * Regel: ein Jahr erscheint, wenn (mindestens 1 Session in dem Jahr) ODER (aktuelles Kalenderjahr).
 * Resultat: descending sortiert (neuestes Jahr zuerst).
 */
export function computeAvailableYears(sessions: Array<{ completedAt?: any; endedAt?: any; startedAt?: any }>): number[] {
  const years = new Set<number>();
  for (const s of sessions) {
    const ts = s.completedAt || s.endedAt || s.startedAt;
    const y = tsToYear(ts);
    if (y !== null) years.add(y);
  }
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

// ============================================================================
// TIME-SERIES FILTER
// ============================================================================

export interface ChartData {
  labels: string[];
  datasets: any[];
}

/**
 * Filtert eine Time-Series (labels + datasets) auf das gewählte Jahr.
 *
 * @param chartData Originale {labels, datasets} Struktur
 * @param year Zieljahr
 * @param resetToZero Wenn true, werden alle Werte um den Wert AM JAHRESANFANG (= letzter Wert vor 1.1. des Jahres)
 *                   reduziert, sodass die Y-Achse bei 0 startet. Für kumulative Stats (Striche, Points usw.).
 *                   Wenn false, bleiben absolute Werte (für Elo).
 */
export function filterTimeSeriesByYear(
  chartData: ChartData | null,
  year: number,
  resetToZero: boolean,
): ChartData {
  if (!chartData || !Array.isArray(chartData.labels) || !Array.isArray(chartData.datasets)) {
    return { labels: [], datasets: [] };
  }

  // Indices, die in das Zieljahr fallen
  const inYearIndices: number[] = [];
  let lastIndexBeforeYear = -1;
  for (let i = 0; i < chartData.labels.length; i++) {
    const d = parseGermanDate(chartData.labels[i]);
    if (!d) continue;
    const y = d.getFullYear();
    if (y < year) {
      lastIndexBeforeYear = i;
    } else if (y === year) {
      inYearIndices.push(i);
    }
    // y > year: stoppen, da labels chronologisch sind (laut bestehender Charts)
  }

  if (inYearIndices.length === 0) {
    return { labels: [], datasets: chartData.datasets.map(ds => ({ ...ds, data: [] })) };
  }

  const newLabels = inYearIndices.map(i => chartData.labels[i]);

  const newDatasets = chartData.datasets.map(ds => {
    const baseValue = resetToZero && lastIndexBeforeYear >= 0
      ? (Number(ds.data?.[lastIndexBeforeYear]) || 0)
      : 0;
    const newData = inYearIndices.map(i => {
      const raw = Number(ds.data?.[i]);
      if (!Number.isFinite(raw)) return ds.data?.[i] ?? null;
      return raw - baseValue;
    });
    return { ...ds, data: newData };
  });

  return { labels: newLabels, datasets: newDatasets };
}

// ============================================================================
// SESSION HELPERS
// ============================================================================

function isCompleted(s: any): boolean {
  return s?.status === 'completed' || s?.status === 'completed_empty';
}

function sumStriche(s: any): number {
  if (!s) return 0;
  return (s.berg || 0) + (s.sieg || 0) + (s.matsch || 0) + (s.schneider || 0) + (s.kontermatsch || 0);
}

/**
 * Filtert Sessions auf das Zieljahr (basierend auf completedAt/endedAt/startedAt).
 */
export function filterSessionsByYear<T extends { completedAt?: any; endedAt?: any; startedAt?: any; status?: string }>(
  sessions: T[],
  year: number,
): T[] {
  return sessions.filter(s => {
    if (!isCompleted(s)) return false;
    const ts = s.completedAt || s.endedAt || s.startedAt;
    return tsToYear(ts) === year;
  });
}

// ============================================================================
// TOP-COUNT
// ============================================================================

export interface YearCounts {
  partien: number;   // Nur normale Sessions (ohne Turniere)
  spiele: number;    // Alle einzelnen Games (Sessions + Turnier-Games)
  turniere: number;  // Tournament-Sessions
}

export function aggregateYearCounts(sessionsInYear: any[]): YearCounts {
  let partien = 0;
  let spiele = 0;
  let turniere = 0;
  for (const s of sessionsInYear) {
    const isTournament = Boolean(s.isTournamentSession) || Boolean(s.tournamentId);
    if (isTournament) {
      turniere++;
      // Tournament-Games werden separat gezählt
      const games = Array.isArray(s.gameResults) ? s.gameResults.length : 0;
      spiele += games;
    } else {
      partien++;
      spiele += s.gamesPlayed || (Array.isArray(s.gameResults) ? s.gameResults.length : 0);
    }
  }
  return { partien, spiele, turniere };
}

// ============================================================================
// PLAYER/TEAM AGGREGATIONS (analog zu chartDataService.ts/backfill-script)
// ============================================================================

/**
 * Pro-Spieler Striche/Points Totals aus gefilterten Sessions.
 * Wendet die gleiche Per-Game-Logik an wie der Backfill-Script v2.
 */
export function aggregatePlayerStrichePointsForYear(
  sessionsInYear: any[],
  type: 'striche' | 'points',
): Map<string, { made: number; received: number }> {
  const totals = new Map<string, { made: number; received: number }>();

  const addToPlayer = (playerId: string, made: number, received: number) => {
    if (!playerId) return;
    const t = totals.get(playerId) || { made: 0, received: 0 };
    t.made += made;
    t.received += received;
    totals.set(playerId, t);
  };

  for (const s of sessionsInYear) {
    const gameResults: any[] = Array.isArray(s.gameResults) && s.gameResults.length > 0
      ? s.gameResults
      : [{
          teams: s.teams,
          finalStriche: s.finalStriche,
          finalScores: s.finalScores,
          topScore: s.finalScores?.top,
          bottomScore: s.finalScores?.bottom,
        }];

    for (const game of gameResults) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];

      let topVal = 0, bottomVal = 0;
      if (type === 'striche') {
        topVal = sumStriche(game.finalStriche?.top);
        bottomVal = sumStriche(game.finalStriche?.bottom);
      } else {
        topVal = (typeof game.topScore === 'number' ? game.topScore : (game.finalScores?.top || 0)) || 0;
        bottomVal = (typeof game.bottomScore === 'number' ? game.bottomScore : (game.finalScores?.bottom || 0)) || 0;
      }

      topPlayers.forEach((p: any) => addToPlayer(p.playerId, topVal, bottomVal));
      bottomPlayers.forEach((p: any) => addToPlayer(p.playerId, bottomVal, topVal));
    }
  }
  return totals;
}

/**
 * Pro-Team Striche/Points Totals aus gefilterten Sessions.
 * Team-Name = sortierte Spielernamen mit " & ".
 */
export function aggregateTeamStrichePointsForYear(
  sessionsInYear: any[],
  type: 'striche' | 'points',
  playerDisplayNames: Map<string, string>,
): Map<string, { made: number; received: number }> {
  const totals = new Map<string, { made: number; received: number }>();

  const getTeamName = (players: any[]): string => {
    const sorted = [...players].sort((a, b) => String(a.playerId || '').localeCompare(String(b.playerId || '')));
    return sorted.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
  };

  const addToTeam = (teamName: string, made: number, received: number) => {
    if (!teamName) return;
    const t = totals.get(teamName) || { made: 0, received: 0 };
    t.made += made;
    t.received += received;
    totals.set(teamName, t);
  };

  for (const s of sessionsInYear) {
    const gameResults: any[] = Array.isArray(s.gameResults) && s.gameResults.length > 0
      ? s.gameResults
      : [{
          teams: s.teams,
          finalStriche: s.finalStriche,
          topScore: s.finalScores?.top,
          bottomScore: s.finalScores?.bottom,
        }];

    for (const game of gameResults) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      if (topPlayers.length !== 2 || bottomPlayers.length !== 2) continue;

      let topVal = 0, bottomVal = 0;
      if (type === 'striche') {
        topVal = sumStriche(game.finalStriche?.top);
        bottomVal = sumStriche(game.finalStriche?.bottom);
      } else {
        topVal = (typeof game.topScore === 'number' ? game.topScore : 0) || 0;
        bottomVal = (typeof game.bottomScore === 'number' ? game.bottomScore : 0) || 0;
      }

      const topName = getTeamName(topPlayers);
      const bottomName = getTeamName(bottomPlayers);
      addToTeam(topName, topVal, bottomVal);
      addToTeam(bottomName, bottomVal, topVal);
    }
  }
  return totals;
}

/**
 * Pro-Spieler Event-Counts (matsch/schneider/kontermatsch) aus gefilterten Sessions.
 */
export function aggregatePlayerEventCountsForYear(
  sessionsInYear: any[],
  eventType: 'matsch' | 'schneider' | 'kontermatsch',
): Map<string, { eventsMade: number; eventsReceived: number }> {
  const map = new Map<string, { eventsMade: number; eventsReceived: number }>();

  const addToPlayer = (playerId: string, made: number, received: number) => {
    if (!playerId) return;
    const t = map.get(playerId) || { eventsMade: 0, eventsReceived: 0 };
    t.eventsMade += made;
    t.eventsReceived += received;
    map.set(playerId, t);
  };

  for (const s of sessionsInYear) {
    const gameResults: any[] = Array.isArray(s.gameResults) && s.gameResults.length > 0
      ? s.gameResults
      : [{ teams: s.teams, eventCounts: s.eventCounts }];

    for (const game of gameResults) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      const ec = game.eventCounts || {};
      const topVal = ec.top?.[eventType] || 0;
      const bottomVal = ec.bottom?.[eventType] || 0;
      topPlayers.forEach((p: any) => addToPlayer(p.playerId, topVal, bottomVal));
      bottomPlayers.forEach((p: any) => addToPlayer(p.playerId, bottomVal, topVal));
    }
  }
  return map;
}

/**
 * Pro-Team Event-Counts (matsch/schneider/kontermatsch) aus gefilterten Sessions.
 * Format identisch zu teamEventCountsMap im GroupView.
 */
export function aggregateTeamEventCountsForYear(
  sessionsInYear: any[],
  playerDisplayNames: Map<string, string>,
): Map<string, {
  eventsMade: number;
  eventsReceived: number;
  matschMade?: number;
  matschReceived?: number;
  schneiderMade?: number;
  schneiderReceived?: number;
  kontermatschMade?: number;
  kontermatschReceived?: number;
}> {
  const map = new Map<string, any>();

  const getTeamName = (players: any[]): string => {
    const sorted = [...players].sort((a, b) => String(a.playerId || '').localeCompare(String(b.playerId || '')));
    return sorted.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
  };

  const addToTeam = (teamName: string, made: any, received: any) => {
    if (!teamName) return;
    const t = map.get(teamName) || {
      eventsMade: 0, eventsReceived: 0,
      matschMade: 0, matschReceived: 0,
      schneiderMade: 0, schneiderReceived: 0,
      kontermatschMade: 0, kontermatschReceived: 0,
    };
    t.matschMade += made.matsch || 0;
    t.matschReceived += received.matsch || 0;
    t.schneiderMade += made.schneider || 0;
    t.schneiderReceived += received.schneider || 0;
    t.kontermatschMade += made.kontermatsch || 0;
    t.kontermatschReceived += received.kontermatsch || 0;
    t.eventsMade = t.matschMade + t.schneiderMade + t.kontermatschMade;
    t.eventsReceived = t.matschReceived + t.schneiderReceived + t.kontermatschReceived;
    map.set(teamName, t);
  };

  for (const s of sessionsInYear) {
    const gameResults: any[] = Array.isArray(s.gameResults) && s.gameResults.length > 0
      ? s.gameResults
      : [{ teams: s.teams, eventCounts: s.eventCounts }];

    for (const game of gameResults) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      if (topPlayers.length !== 2 || bottomPlayers.length !== 2) continue;
      const ec = game.eventCounts || {};
      const topEv = ec.top || {};
      const bottomEv = ec.bottom || {};
      addToTeam(getTeamName(topPlayers), topEv, bottomEv);
      addToTeam(getTeamName(bottomPlayers), bottomEv, topEv);
    }
  }
  return map;
}

// ============================================================================
// PLAYER-RATINGS aus gefilterter Elo-Chart-Daten
// ============================================================================

import type { PlayerRatingWithTier } from '@/services/jassElo';
import { getRatingTier } from '@/shared/rating-tiers';

/**
 * Aus den gefilterten Elo-Chart-Daten (= ein bestimmtes Jahr) das Year-End-Rating
 * pro Spieler ableiten (Snapshot-Logik: letzter Wert im Jahr).
 *
 * Spieler ohne Datenpunkt im Jahr: nicht enthalten in der Map.
 */
export function derivePlayerRatingsFromChart(
  filteredEloChart: ChartData | null,
): Map<string, PlayerRatingWithTier> {
  const result = new Map<string, PlayerRatingWithTier>();
  if (!filteredEloChart || !Array.isArray(filteredEloChart.datasets)) return result;

  for (const ds of filteredEloChart.datasets) {
    if (!ds.playerId || !Array.isArray(ds.data)) continue;
    // Finde letzten gültigen Datenpunkt (Number)
    let lastVal: number | null = null;
    for (let i = ds.data.length - 1; i >= 0; i--) {
      const v = Number(ds.data[i]);
      if (Number.isFinite(v)) {
        lastVal = v;
        break;
      }
    }
    if (lastVal === null) continue;
    const tier = getRatingTier(lastVal);
    result.set(ds.playerId, {
      id: ds.playerId,
      rating: lastVal,
      gamesPlayed: 0,
      lastUpdated: Date.now(),
      displayName: ds.label || ds.displayName || ds.playerId,
      tier: tier.name,
      tierEmoji: tier.emoji,
      lastDelta: 0,
      lastSessionDelta: 0,
    });
  }
  return result;
}
