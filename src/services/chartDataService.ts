import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, FieldPath } from 'firebase/firestore';
import { getRankingColor } from '../config/chartColors';
import { getGroupSessionsSnapshot, getGroupPlayersSnapshot } from '@/services/groupQueryDeduperService';
import { formatDuration } from '@/utils/formatUtils';

/**
 * Helper: Lädt lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
 */
async function loadPlayerLastActivityForFilter(playerIds: Set<string>): Promise<Map<string, Date | null>> {
  const lastActivityMap = new Map<string, Date | null>();
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  
  if (playerIds.size === 0) {
    return lastActivityMap;
  }
  
  // Lade alle Player-Dokumente in Batches (Firestore 'in' Query Limit: 10)
  const playerIdsArray = Array.from(playerIds);
  const batchSize = 10;
  
  for (let i = 0; i < playerIdsArray.length; i += batchSize) {
    const batch = playerIdsArray.slice(i, i + batchSize);
    try {
      const playerDocs = await getDocs(
        query(
          collection(db, 'players'),
          where(new FieldPath('__name__'), 'in', batch)
        )
      );
      
      playerDocs.forEach(doc => {
        const data = doc.data();
        const globalStats = data?.globalStats || {};
        const lastJassTimestamp = globalStats?.lastJassTimestamp;
        if (lastJassTimestamp) {
          const timestamp = lastJassTimestamp.toDate ? lastJassTimestamp.toDate() : 
                           (lastJassTimestamp._seconds ? new Date(lastJassTimestamp._seconds * 1000) : null);
          lastActivityMap.set(doc.id, timestamp);
        } else {
          lastActivityMap.set(doc.id, null);
        }
      });
    } catch (error) {
      console.warn('[loadPlayerLastActivityForFilter] Error loading batch:', error);
      // Setze null für Spieler, die nicht geladen werden konnten
      batch.forEach(playerId => {
        if (!lastActivityMap.has(playerId)) {
          lastActivityMap.set(playerId, null);
        }
      });
    }
  }
  
  return lastActivityMap;
}

/**
 * Helper: Prüft, ob ein Spieler aktiv ist (<1 Jahr inaktiv)
 */
function isPlayerActive(playerId: string, lastActivityMap: Map<string, Date | null>): boolean {
  const lastActivity = lastActivityMap.get(playerId);
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
  
  // Wenn kein lastJassTimestamp vorhanden ist, behalte den Spieler (für Rückwärtskompatibilität)
  if (!lastActivity) {
    return true;
  }
  
  return lastActivity.getTime() >= oneYearAgo;
}

/**
 * 🎯 CHART DATA SERVICE - AGGREGATED ARCHITEKTUR
 * ============================================== 
 * 
 * Liest Chart-Daten direkt aus groups/{groupId}/aggregated/chartData_*
 * 
 * Vorteile:
 * - Semantisch korrekt: GroupView → groups/{groupId}/aggregated
 * - Performance: Alle Chart-Daten in separatem Ordner
 * - Sauber: jassGameSummaries nicht mit Chart-Daten überladen
 * - Einfach: chartData_elo, chartData_striche, chartData_points sind fertige Chart-Daten
 */

// ✅ Chart-Typen
export type ChartType = 'rating' | 'striche' | 'points';

/**
 * 🚀 Lade Elo-Rating-Chart aus jassGameSummaries (BEREITS KORREKT!)
 * 
 * ELO-Chart wird NICHT aus aggregated geladen, sondern berechnet aus:
 * - jassGameSummaries → playerFinalRatings
 * - ratingHistory (global, nicht gruppenspezifisch!)
 */
export async function getOptimizedRatingChart(
  groupId: string,
  options?: {
    minDataPoints?: number;
    customColors?: boolean;
    sortByRating?: boolean;
  }
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // ⚡ Geteilter Loader (request-deduper) — kollabiert konkurrierende Queries der
    //    4 schweren Charts (Elo, Team-Striche/Points/Matsch) zu einem Roundtrip.
    const summariesSnap = await getGroupSessionsSnapshot(groupId);

    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // NEU: Sessions sequenziell aufbauen – keine Tages-Bündelung
    type SessionPoint = { label: string; timestamp: Date; players: Record<string, { rating: number; displayName?: string }> };
    const sessionPoints: SessionPoint[] = [];

    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      if (!data.playerFinalRatings) return;
      const completedAt = data.completedAt;
      if (!completedAt) return;
      let timestamp: Date;
      if (completedAt?.toDate && typeof completedAt.toDate === 'function') timestamp = completedAt.toDate();
      else if (completedAt?._seconds !== undefined) timestamp = new Date(completedAt._seconds * 1000);
      else return;
      const label = timestamp.toLocaleDateString('de-DE'); // Anzeige bleibt Datum – Sessions können gleiche Labels haben
      sessionPoints.push({ label, timestamp, players: data.playerFinalRatings });
    });

    // Chronologisch sortieren (stabil)
    sessionPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Labels 1:1 aus Sessions
    const sortedLabels = sessionPoints.map(p => p.label);

    // Erstelle Datasets für jeden Spieler
    const datasets: any[] = [];

    // Alle beteiligten Spieler sammeln
    const allPlayerIds = new Set<string>();
    sessionPoints.forEach(p => Object.keys(p.players || {}).forEach(pid => allPlayerIds.add(pid)));

    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = new Map<string, Date | null>();
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    
    if (allPlayerIds.size > 0) {
      // Lade Player-Dokumente in Batches (Firestore 'in' Query Limit: 10)
      const playerIdsArray = Array.from(allPlayerIds);
      const batchSize = 10;
      
      for (let i = 0; i < playerIdsArray.length; i += batchSize) {
        const batch = playerIdsArray.slice(i, i + batchSize);
        try {
          const { getDocs, query, where, collection, FieldPath } = await import('firebase/firestore');
          const playerDocs = await getDocs(
            query(
              collection(db, 'players'),
              where(new FieldPath('__name__'), 'in', batch)
            )
          );
          
          playerDocs.forEach(doc => {
            const data = doc.data();
            const globalStats = data?.globalStats || {};
            const lastJassTimestamp = globalStats?.lastJassTimestamp;
            if (lastJassTimestamp) {
              const timestamp = lastJassTimestamp.toDate ? lastJassTimestamp.toDate() : 
                               (lastJassTimestamp._seconds ? new Date(lastJassTimestamp._seconds * 1000) : null);
              playerLastActivityMap.set(doc.id, timestamp);
            } else {
              playerLastActivityMap.set(doc.id, null);
            }
          });
        } catch (error) {
          console.warn('[getOptimizedRatingChart] Error loading player last activity:', error);
          // Setze null für Spieler, die nicht geladen werden konnten
          batch.forEach(playerId => {
            if (!playerLastActivityMap.has(playerId)) {
              playerLastActivityMap.set(playerId, null);
            }
          });
        }
      }
    }

    allPlayerIds.forEach(playerId => {
      // 🎯 NEU: Filtere Spieler, die >1 Jahr inaktiv sind
      const lastActivity = playerLastActivityMap.get(playerId);
      if (lastActivity && lastActivity.getTime() < oneYearAgo) {
        return; // Überspringe inaktive Spieler
      }
      const displayName = (() => {
        for (const p of sessionPoints) {
          const r = p.players?.[playerId];
          if (r && (r as any).displayName) return (r as any).displayName as string;
        }
        return playerId;
      })();

      const data: (number | null)[] = sessionPoints.map(p => {
        const r = p.players?.[playerId];
        return r ? (r as any).rating || 0 : null;
      });
      
      // ✅ NEU: Lade auch ratingDelta pro Datenpunkt für korrekte Tooltips
      const deltas: (number | null)[] = sessionPoints.map(p => {
        const r = p.players?.[playerId];
        return r ? (r as any).ratingDelta || 0 : null;
      });

      const validPoints = data.filter(v => v !== null && v !== undefined && !isNaN(v as any));
      if (validPoints.length < (options?.minDataPoints || 2)) return;

      datasets.push({
        label: displayName,
        data,
        deltas, // ✅ NEU: ratingDelta pro Session für Tooltips
        playerId,
        borderColor: '#000000',
        backgroundColor: '#000000',
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        spanGaps: true, // ✅ ELO: Verbinde Lücken (kontinuierliche Rating-History)
      });
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    datasets.sort((a, b) => {
      const getLastValidValue = (dataset: any) => {
        for (let i = dataset.data.length - 1; i >= 0; i--) {
          const value = dataset.data[i];
          if (value !== null && value !== undefined && !isNaN(value)) {
            return value;
          }
        }
        return 0;
      };
      
      const aValue = getLastValidValue(a);
      const bValue = getLastValidValue(b);
      
      return bValue - aValue; // Absteigend
    });
    
    // ✅ Farbzuweisung passiert im Frontend (PowerRatingChart.tsx)
    
    return {
      labels: sortedLabels,
      datasets: datasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedRatingChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🗓️ Year-End-Rating-Snapshot pro Spieler.
 *
 * Liest direkt aus den Session-Dokumenten (`playerFinalRatings` pro Session)
 * und umgeht damit die Display-Filter aus `getOptimizedRatingChart`
 * (1-Jahr-Inaktivität + minDataPoints ≥ 2), die für Year-Filter nicht passen.
 *
 * Logik: Sessions chronologisch ASC durchgehen, nur die im Zieljahr behalten.
 * Für jeden Spieler die Rating-Zahl aus der LETZTEN gespielten Session im Jahr
 * speichern. Wer im Jahr nicht gespielt hat, taucht NICHT auf.
 */
export async function getYearEndPlayerRatings(
  groupId: string,
  year: number,
): Promise<Map<string, { id: string; rating: number; displayName: string; lastDelta: number }>> {
  const result = new Map<string, { id: string; rating: number; displayName: string; lastDelta: number }>();
  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    if (summariesSnap.empty) return result;

    type Row = { ts: number; data: any };
    const rows: Row[] = [];
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      if (!d.playerFinalRatings) return;
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;
      rows.push({ ts, data: d });
    });
    rows.sort((a, b) => a.ts - b.ts);

    for (const row of rows) {
      const pfr = row.data.playerFinalRatings || {};
      for (const playerId of Object.keys(pfr)) {
        const r = pfr[playerId];
        if (!r || typeof r.rating !== 'number') continue;
        result.set(playerId, {
          id: playerId,
          rating: r.rating,
          displayName: r.displayName || playerId,
          lastDelta: typeof r.ratingDelta === 'number' ? r.ratingDelta : 0,
        });
      }
    }
  } catch (error) {
    console.warn('[getYearEndPlayerRatings] Fehler:', error);
  }
  return result;
}

/**
 * 🗓️ Trumpf-Counts pro Farbe für ein bestimmtes Jahr.
 *
 * Liest `aggregatedTrumpfCountsByPlayer` aus den Session-Dokumenten und
 * summiert über alle Spieler. Das Resultat ist {farbe: anzahl} + totalCount,
 * direkt kompatibel mit `getTrumpfDistributionChartData` und der bestehenden
 * Trumpfansagen-Liste.
 */
export async function getYearTrumpfStats(
  groupId: string,
  year: number,
): Promise<{ trumpfStatistik: Record<string, number>; totalTrumpfCount: number }> {
  const trumpfStatistik: Record<string, number> = {};
  let totalTrumpfCount = 0;
  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;

      const perPlayer = d.aggregatedTrumpfCountsByPlayer;
      if (!perPlayer || typeof perPlayer !== 'object') return;
      Object.values(perPlayer).forEach((playerCounts: any) => {
        if (!playerCounts || typeof playerCounts !== 'object') return;
        Object.entries(playerCounts).forEach(([farbe, count]) => {
          if (typeof count !== 'number') return;
          trumpfStatistik[farbe] = (trumpfStatistik[farbe] || 0) + count;
          totalTrumpfCount += count;
        });
      });
    });
  } catch (error) {
    console.warn('[getYearTrumpfStats] Fehler:', error);
  }
  return { trumpfStatistik, totalTrumpfCount };
}

/**
 * 🗓️ Rundentempo pro Spieler für ein bestimmtes Jahr.
 *
 * Liest `aggregatedRoundDurationsByPlayer` aus den jassGameSummaries im Jahr,
 * concat-et die `roundDurations[]` pro Spieler und berechnet den Median.
 *
 * Resultat-Form ist identisch zu `groupStats.playerAllRoundTimes`:
 *   { playerId, playerName, value }  — `value` = Median in Millisekunden.
 *
 * Sortiert aufsteigend (schnellster Spieler zuerst).
 */
export async function getYearPlayerRoundTimes(
  groupId: string,
  year: number,
): Promise<Array<{ playerId: string; playerName: string; value: number }>> {
  const perPlayerRounds = new Map<string, { name: string; durations: number[] }>();
  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;

      const per = d.aggregatedRoundDurationsByPlayer;
      if (!per || typeof per !== 'object') return;

      const playerNamesFromSession = d.playerNames || {};
      Object.entries(per).forEach(([playerId, raw]: [string, any]) => {
        if (!raw || typeof raw !== 'object') return;
        const arr = Array.isArray(raw.roundDurations) ? raw.roundDurations : null;
        if (!arr || arr.length === 0) return;
        if (!perPlayerRounds.has(playerId)) {
          perPlayerRounds.set(playerId, {
            name: playerNamesFromSession[playerId] || raw.displayName || playerId,
            durations: [],
          });
        }
        const entry = perPlayerRounds.get(playerId)!;
        for (const v of arr) {
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) entry.durations.push(v);
        }
        // Falls Name in dieser Session frisch ist, übernehmen
        if (playerNamesFromSession[playerId]) entry.name = playerNamesFromSession[playerId];
      });
    });
  } catch (error) {
    console.warn('[getYearPlayerRoundTimes] Fehler:', error);
    return [];
  }

  const result: Array<{ playerId: string; playerName: string; value: number }> = [];
  perPlayerRounds.forEach((v, playerId) => {
    if (v.durations.length === 0) return;
    const sorted = [...v.durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    result.push({ playerId, playerName: v.name, value: median });
  });
  result.sort((a, b) => a.value - b.value);
  return result;
}

/**
 * 🗓️ Year-aware Aggregat für „Durchschnittswerte & Details" + „Gruppenübersicht".
 *
 * Wird im Year-Mode statt der precomputed groupStats verwendet. Alle Felder
 * sind bereits formatiert (Strings für Zeitwerte, Zahlen für Zähler), damit
 * die JSX 1:1 austauschbar bleibt.
 *
 * memberCount = Anzahl Spieler mit mind. 1 Session im Jahr (Aktive).
 */
export async function getYearGroupStats(
  groupId: string,
  year: number,
): Promise<{
  avgSessionDuration: string;
  avgGameDuration: string;
  avgGamesPerSession: number;
  avgRoundsPerGame: number;
  avgMatschPerGame: number;
  avgRoundDuration: string;
  sessionCount: number;
  tournamentCount: number;
  gameCount: number;
  totalPlayTime: string;
  firstJassDate: string | null;
  lastJassDate: string | null;
  memberCount: number;
} | null> {
  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    if (summariesSnap.empty) return null;

    let totalPlayTimeMillis = 0;
    let regularSessionPlayTimeMillis = 0;
    let sessionCount = 0;       // nur Regular Sessions (für Ø Dauer pro Partie)
    let tournamentCount = 0;
    let gameCount = 0;
    let regularSessionGameCount = 0; // Spiele NUR in Regular Sessions (für Ø Spiele/Partie)
    let totalRounds = 0;
    let totalMatsch = 0;
    let roundDurationSumMillis = 0;
    let roundDurationCount = 0;
    let firstMs: number | null = null;
    let lastMs: number | null = null;
    const activePlayerIds = new Set<string>();

    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;

      const isTournament = !!d.isTournamentSession || !!d.tournamentId;
      const durationMs = typeof d.durationSeconds === 'number' ? d.durationSeconds * 1000 : 0;
      totalPlayTimeMillis += durationMs;

      const games = (typeof d.gamesPlayed === 'number' && d.gamesPlayed > 0)
        ? d.gamesPlayed
        : (Array.isArray(d.gameResults) ? d.gameResults.length : 0);
      gameCount += games;

      if (isTournament) {
        tournamentCount++;
      } else {
        sessionCount++;
        regularSessionPlayTimeMillis += durationMs;
        regularSessionGameCount += games;
      }

      if (typeof d.totalRounds === 'number') totalRounds += d.totalRounds;

      const ec = d.eventCounts || {};
      const m = (ec.top?.matsch || 0) + (ec.bottom?.matsch || 0);
      totalMatsch += m;

      const per = d.aggregatedRoundDurationsByPlayer;
      if (per && typeof per === 'object') {
        // Pro Session ein „Tisch" pro Spieler — Summe über Spieler hinweg bringt das
        // Total ÜBER alle Tische in Millisekunden. Da alle 4 Spieler dieselben Runden
        // erleben, repräsentiert ein einzelner Spielereintrag das tatsächliche
        // Rundentotal der Session. → Nimm den MAX-totalDuration/roundCount in der Session.
        let sessionRoundDur = 0;
        let sessionRoundCount = 0;
        Object.values(per).forEach((raw: any) => {
          if (!raw || typeof raw !== 'object') return;
          if (typeof raw.totalDuration === 'number' && raw.totalDuration > sessionRoundDur) {
            sessionRoundDur = raw.totalDuration;
          }
          if (typeof raw.roundCount === 'number' && raw.roundCount > sessionRoundCount) {
            sessionRoundCount = raw.roundCount;
          }
        });
        roundDurationSumMillis += sessionRoundDur;
        roundDurationCount += sessionRoundCount;
      }

      if (firstMs === null || ts < firstMs) firstMs = ts;
      if (lastMs === null || ts > lastMs) lastMs = ts;

      // Aktive Spieler: aus playerFinalRatings (zuverlässigste Quelle), Fallback teams
      const pfr = d.playerFinalRatings;
      if (pfr && typeof pfr === 'object') {
        Object.keys(pfr).forEach(id => activePlayerIds.add(id));
      } else {
        const teams = d.teams || {};
        ['top', 'bottom'].forEach(k => {
          (teams[k]?.players || []).forEach((p: any) => {
            if (p?.playerId) activePlayerIds.add(p.playerId);
          });
        });
      }
    });

    const fmtDateMs = (ms: number | null): string | null => {
      if (ms === null) return null;
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };

    const avgSessionDurMs = sessionCount > 0 ? regularSessionPlayTimeMillis / sessionCount : 0;
    const avgGameDurMs = gameCount > 0 ? totalPlayTimeMillis / gameCount : 0;
    const avgRoundDurMs = roundDurationCount > 0 ? roundDurationSumMillis / roundDurationCount : 0;

    return {
      avgSessionDuration: avgSessionDurMs > 0 ? formatDuration(Math.round(avgSessionDurMs / 1000)) : '-',
      avgGameDuration: avgGameDurMs > 0 ? formatDuration(Math.round(avgGameDurMs / 1000)) : '-',
      avgGamesPerSession: sessionCount > 0 ? regularSessionGameCount / sessionCount : 0,
      avgRoundsPerGame: gameCount > 0 ? totalRounds / gameCount : 0,
      avgMatschPerGame: gameCount > 0 ? totalMatsch / gameCount : 0,
      avgRoundDuration: avgRoundDurMs > 0 ? formatDuration(Math.round(avgRoundDurMs / 1000)) : '-',
      sessionCount,
      tournamentCount,
      gameCount,
      totalPlayTime: totalPlayTimeMillis > 0 ? formatDuration(Math.round(totalPlayTimeMillis / 1000)) : '-',
      firstJassDate: fmtDateMs(firstMs),
      lastJassDate: fmtDateMs(lastMs),
      memberCount: activePlayerIds.size,
    };
  } catch (error) {
    console.warn('[getYearGroupStats] Fehler:', error);
    return null;
  }
}

/**
 * 🗓️ Siegquoten pro Spieler im Zieljahr.
 *
 * Liest `winnerTeamKey` (Session-Level) und `gameResults[].winnerTeam` (Spiel-Level)
 * aus den jassGameSummaries. Turniere zählen NICHT für Session-Quoten (Turnier ist
 * keine Partie), die Spiele aus Turnieren zählen aber für die Spiel-Quote.
 *
 * Resultat: Map<playerId, {sessionWins, sessionLosses, sessionDraws, gameWins, gameLosses}>
 */
export async function getYearPlayerWinRates(
  groupId: string,
  year: number,
): Promise<Map<string, { sessionWins: number; sessionLosses: number; sessionDraws: number; gameWins: number; gameLosses: number }>> {
  const result = new Map<string, { sessionWins: number; sessionLosses: number; sessionDraws: number; gameWins: number; gameLosses: number }>();
  const bump = (playerId: string) => {
    if (!result.has(playerId)) {
      result.set(playerId, { sessionWins: 0, sessionLosses: 0, sessionDraws: 0, gameWins: 0, gameLosses: 0 });
    }
    return result.get(playerId)!;
  };

  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;

      const isTournament = !!d.isTournamentSession || !!d.tournamentId;

      // Session-Quote: Turniere überspringen
      if (!isTournament) {
        const winnerTeamKey: 'top' | 'bottom' | 'draw' | undefined = d.winnerTeamKey;
        const teams = d.teams || {};
        const topIds: string[] = (teams.top?.players || []).map((p: any) => p?.playerId).filter(Boolean);
        const bottomIds: string[] = (teams.bottom?.players || []).map((p: any) => p?.playerId).filter(Boolean);

        if (winnerTeamKey === 'draw') {
          [...topIds, ...bottomIds].forEach(id => { bump(id).sessionDraws++; });
        } else if (winnerTeamKey === 'top' || winnerTeamKey === 'bottom') {
          const winners = winnerTeamKey === 'top' ? topIds : bottomIds;
          const losers = winnerTeamKey === 'top' ? bottomIds : topIds;
          winners.forEach(id => { bump(id).sessionWins++; });
          losers.forEach(id => { bump(id).sessionLosses++; });
        }
      }

      // Spiel-Quote: ALLE Spiele (auch in Turnieren) zählen
      const games: any[] = Array.isArray(d.gameResults) && d.gameResults.length > 0
        ? d.gameResults
        : [];
      games.forEach(g => {
        const wt: 'top' | 'bottom' | undefined = g.winnerTeam;
        if (!wt) return;
        const gTopIds: string[] = (g.teams?.top?.players || []).map((p: any) => p?.playerId).filter(Boolean);
        const gBottomIds: string[] = (g.teams?.bottom?.players || []).map((p: any) => p?.playerId).filter(Boolean);
        const winners = wt === 'top' ? gTopIds : gBottomIds;
        const losers = wt === 'top' ? gBottomIds : gTopIds;
        winners.forEach(id => { bump(id).gameWins++; });
        losers.forEach(id => { bump(id).gameLosses++; });
      });
    });
  } catch (error) {
    console.warn('[getYearPlayerWinRates] Fehler:', error);
  }
  return result;
}

/**
 * 🗓️ Rundentempo pro Team für ein bestimmtes Jahr.
 *
 * Logik analog zur Cloud Function: für jede Session/jedes Tournament-Game in der
 * Year-Range werden die roundDurations[] beider Partner an das Team-Bucket
 * angehängt; am Ende = Median in Millisekunden. Aufsteigend sortiert (schnellstes
 * Team zuerst). Shape identisch zu groupStats.teamWithFastestRounds.
 */
export async function getYearTeamRoundTimes(
  groupId: string,
  year: number,
): Promise<Array<{ names: string[]; playerIds: string[]; value: number; eventsPlayed: number }>> {
  const teamMap = new Map<string, { playerIds: string[]; durations: number[] }>();

  const sortedKey = (ids: string[]) => [...ids].sort().join('-');

  const addToTeam = (playerIds: string[], durations: number[]) => {
    if (playerIds.length !== 2) return;
    const key = sortedKey(playerIds);
    if (!teamMap.has(key)) teamMap.set(key, { playerIds: [...playerIds].sort(), durations: [] });
    const bucket = teamMap.get(key)!;
    for (const v of durations) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) bucket.durations.push(v);
    }
  };

  // Player-Display-Namen laden (für Name-Resolution + Photo-Lookup im UI).
  // Ausserhalb des äusseren try-Blocks deklariert, damit der Map-Lookup beim
  // Bauen des result-Arrays Zugriff hat.
  const playerDisplayNames = new Map<string, string>();
  try {
    try {
      const playersSnap = await getGroupPlayersSnapshot(groupId);
      playersSnap.forEach(doc => {
        const d = doc.data();
        if (d?.displayName) playerDisplayNames.set(doc.id, d.displayName);
      });
    } catch { /* leeres Mapping → playerId als Name */ }

    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;

      const isTournament = !!d.isTournamentSession || !!d.tournamentId;
      const perPlayer = d.aggregatedRoundDurationsByPlayer || {};

      const collectDurations = (playerId: string): number[] => {
        const raw = perPlayer[playerId];
        if (!raw || typeof raw !== 'object') return [];
        if (Array.isArray(raw.roundDurations)) return raw.roundDurations.filter((v: any) => typeof v === 'number' && v > 0);
        if (typeof raw.roundCount === 'number' && raw.roundCount > 0 && typeof raw.totalDuration === 'number') {
          // Fallback: avg über roundCount duplizieren
          const avg = raw.totalDuration / raw.roundCount;
          return Array(raw.roundCount).fill(avg);
        }
        return [];
      };

      if (isTournament && Array.isArray(d.gameResults) && d.gameResults.length > 0) {
        // Pro Game eigene Team-Composition
        d.gameResults.forEach((g: any) => {
          const top: string[] = (g.teams?.top?.players || []).map((p: any) => p?.playerId).filter(Boolean);
          const bottom: string[] = (g.teams?.bottom?.players || []).map((p: any) => p?.playerId).filter(Boolean);
          // Für Turniere fehlt evtl. eine per-Game Rundendauer; Cloud-Fn nutzt session-level
          // aggregatedRoundDurationsByPlayer. Hier identisch.
          const topDurs = top.flatMap(collectDurations);
          const botDurs = bottom.flatMap(collectDurations);
          addToTeam(top, topDurs);
          addToTeam(bottom, botDurs);
        });
      } else {
        const top: string[] = (d.teams?.top?.players || []).map((p: any) => p?.playerId).filter(Boolean);
        const bottom: string[] = (d.teams?.bottom?.players || []).map((p: any) => p?.playerId).filter(Boolean);
        const topDurs = top.flatMap(collectDurations);
        const botDurs = bottom.flatMap(collectDurations);
        addToTeam(top, topDurs);
        addToTeam(bottom, botDurs);
      }
    });
  } catch (error) {
    console.warn('[getYearTeamRoundTimes] Fehler:', error);
    return [];
  }

  const result: Array<{ names: string[]; playerIds: string[]; value: number; eventsPlayed: number }> = [];
  teamMap.forEach(bucket => {
    if (bucket.durations.length === 0) return;
    const sorted = [...bucket.durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const names = bucket.playerIds.map(id => playerDisplayNames.get(id) || id);
    result.push({ names, playerIds: bucket.playerIds, value: median, eventsPlayed: bucket.durations.length });
  });
  result.sort((a, b) => a.value - b.value);
  return result;
}

/**
 * 🗓️ Rohe jassGameSummary-Docs eines Jahres als Plain-Objects.
 *
 * Genau das, was die client-seitigen Aggregatoren brauchen:
 *   - `gameResults[]` (für Turniere mit wechselnden Teams)
 *   - `teams`, `finalStriche`, `finalScores`, `eventCounts` (Regular Sessions)
 *
 * SessionSummary (aus fetchAllGroupSessions) hat das alles NICHT, deshalb
 * versagen aggregatePlayerStrichePointsForYear & Co. bei Turnieren.
 */
export async function getYearRawSessions(
  groupId: string,
  year: number,
): Promise<any[]> {
  const out: any[] = [];
  try {
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    summariesSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const status = d.status;
      if (status !== 'completed' && status !== 'completed_empty') return;
      const c = d.completedAt;
      if (!c) return;
      const ts = c.toDate ? c.toDate().getTime() : (c._seconds ? c._seconds * 1000 : null);
      if (!ts) return;
      if (new Date(ts).getFullYear() !== year) return;
      out.push(d);
    });
  } catch (error) {
    console.warn('[getYearRawSessions] Fehler:', error);
  }
  return out;
}

/**
 * 🚀 Lade Strichdifferenz-Chart aus aggregated/chartData_striche
 */
export async function getOptimizedStricheChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 📊 Lade chartData_striche aus aggregated
    const stricheDocRef = doc(db, `groups/${groupId}/aggregated/chartData_striche`);
    const stricheDoc = await getDoc(stricheDocRef);
    
    if (!stricheDoc.exists()) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    const chartData = stricheDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    // ✅ Chart-Daten sind bereits fertig formatiert
    // Einfach zurückgeben mit spanGaps: true für verbundene Linien
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true, // ✅ STRICHE: Verbinde ALLE Datenpunkte
    }));
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels: sortedLabels,
      datasets: enhancedDatasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedStricheChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🚀 Lade Punktedifferenz-Chart aus aggregated/chartData_points
 */
export async function getOptimizedPointsChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 📊 Lade chartData_points aus aggregated
    const pointsDocRef = doc(db, `groups/${groupId}/aggregated/chartData_points`);
    const pointsDoc = await getDoc(pointsDocRef);
    
    if (!pointsDoc.exists()) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    const chartData = pointsDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    // ✅ Chart-Daten sind bereits fertig formatiert
    // Einfach zurückgeben mit spanGaps: true für verbundene Linien
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true, // ✅ PUNKTE: Verbinde ALLE Datenpunkte
    }));
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING (letzter gültiger Wert)
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels: sortedLabels,
      datasets: enhancedDatasets,
      source: 'backfill',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedPointsChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

// 🎨 FARBPALETTE wird jetzt aus chartColors.ts importiert

/**
 * 🚀 Lade Matsch-Bilanz-Chart aus aggregated/chartData_matsch
 */
export async function getOptimizedMatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const matschDocRef = doc(db, `groups/${groupId}/aggregated/chartData_matsch`);
    const matschDoc = await getDoc(matschDocRef);
    
    if (!matschDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = matschDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedMatschChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * 🚀 Lade Schneider-Bilanz-Chart aus aggregated/chartData_schneider
 */
export async function getOptimizedSchneiderChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const schneiderDocRef = doc(db, `groups/${groupId}/aggregated/chartData_schneider`);
    const schneiderDoc = await getDoc(schneiderDocRef);
    
    if (!schneiderDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = schneiderDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedSchneiderChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * 🚀 Lade Kontermatsch-Bilanz-Chart aus aggregated/chartData_kontermatsch
 */
export async function getOptimizedKontermatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    const kontermatschDocRef = doc(db, `groups/${groupId}/aggregated/chartData_kontermatsch`);
    const kontermatschDoc = await getDoc(kontermatschDocRef);
    
    if (!kontermatschDoc.exists()) {
      return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
    }
    
    const chartData = kontermatschDoc.data();
    const sortedLabels = chartData.labels || [];
    const datasets = chartData.datasets || [];
    
    const enhancedDatasets = datasets.map(dataset => ({
      ...dataset,
      spanGaps: true,
    }));
    
    enhancedDatasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    enhancedDatasets.forEach((dataset, index) => {
      const rank = index + 1;
      dataset.borderColor = getRankingColor(rank);
      dataset.backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return { labels: sortedLabels, datasets: enhancedDatasets, source: 'backfill', lastUpdated: new Date() };
  } catch (error) {
    console.error('[getOptimizedKontermatschChart] Fehler:', error);
    return { labels: [], datasets: [], source: 'live', lastUpdated: new Date() };
  }
}

/**
 * Getzt Backfill Status (für zukünftige Implementierung)
 */
export async function getBackfillStatus(groupId: string): Promise<{
  isBackfilled: boolean;
  lastUpdated?: Date;
}> {
  try {
    const eloDocRef = doc(db, `groups/${groupId}/aggregated/chartData_elo`);
    const eloDoc = await getDoc(eloDocRef);
    
    if (!eloDoc.exists()) {
      return {
        isBackfilled: false,
        lastUpdated: undefined
      };
    }
    
    const chartData = eloDoc.data();
    return {
      isBackfilled: true,
      lastUpdated: chartData.lastUpdated?.toDate?.() || new Date()
    };
  } catch (error) {
    console.error('[getBackfillStatus] Fehler:', error);
    return {
      isBackfilled: false
    };
  }
}

/**
 * 🚀 Lade Team-Matsch-Bilanz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamMatschChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getGroupPlayersSnapshot(groupId);
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamMatschChart] Could not load player names:', error);
    }

    // ⚡ Geteilter Sessions-Loader (request-deduper)
    const summariesSnap = await getGroupSessionsSnapshot(groupId);

    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId;
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames, SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      // ✅ KRITISCH: Sortiere ERST nach playerId, DANN hole Namen (für konsistente Team-Namen!)
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameEventCounts = game.eventCounts || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Matsch-Bilanz für dieses Game
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentTeamEvents = gameEventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamMade = teamEvents.matsch || 0;
            const opponentMade = opponentTeamEvents.matsch || 0;
            const delta = teamMade - opponentMade;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const eventCounts = data.eventCounts || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Matsch-Bilanz für dieses Team
          const teamEvents = eventCounts[teamKey] || {};
          const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const teamMade = teamEvents.matsch || 0;
          const opponentMade = opponentTeamEvents.matsch || 0;
          const delta = teamMade - opponentMade;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamMatschChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * ✅ NEU: Berechnet Team Event-Counts (Made/Received) direkt aus jassGameSummaries
 * Gibt eine Map zurück: Team-Name -> { eventsMade, eventsReceived }
 */
export async function getTeamEventCounts(
  groupId: string
): Promise<Map<string, { eventsMade: number; eventsReceived: number }>> {
  const teamEventCountsMap = new Map<string, { eventsMade: number; eventsReceived: number }>();
  
  try {
    // 🎯 KRITISCH: Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getTeamEventCounts] Could not load player names:', error);
    }
    
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames, SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      // ✅ KRITISCH: Sortiere ERST nach playerId, DANN hole Namen (für konsistente Team-Namen!)
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      // 🎯 KORREKTE TOURNAMENT-ERKENNUNG: Nur explizite Turniere!
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere Event-Counts pro Game
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameEventCounts = game.eventCounts || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Team-Level Event-Counts aus diesem Game
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentTeamEvents = gameEventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamMade = teamEvents.matsch || 0;
            const teamReceived = opponentTeamEvents.matsch || 0;
            
            // Aggregiere für dieses Team
            if (!teamEventCountsMap.has(teamName)) {
              teamEventCountsMap.set(teamName, { eventsMade: 0, eventsReceived: 0 });
            }
            const stats = teamEventCountsMap.get(teamName)!;
            stats.eventsMade += teamMade;
            stats.eventsReceived += teamReceived;
          });
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level Event-Counts
        const eventCounts = data.eventCounts || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return;
          
          const teamName = getTeamName(teamPlayers);
          
          // Team-Level Event-Counts aus dieser Session
          const teamEvents = eventCounts[teamKey] || {};
          const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const teamMade = teamEvents.matsch || 0;
          const teamReceived = opponentTeamEvents.matsch || 0;
          
          // Aggregiere für dieses Team
          if (!teamEventCountsMap.has(teamName)) {
            teamEventCountsMap.set(teamName, { eventsMade: 0, eventsReceived: 0 });
          }
          const stats = teamEventCountsMap.get(teamName)!;
          stats.eventsMade += teamMade;
          stats.eventsReceived += teamReceived;
        });
      }
    });
  } catch (error) {
    console.error('[getTeamEventCounts] Fehler:', error);
  }
  
  return teamEventCountsMap;
}

/**
 * 🎯 NEU: Lade Spieler-Event-Counts (Matsch, Schneider) für eine Gruppe
 * Gibt für jeden Spieler Made/Received-Counts zurück
 */
export async function getPlayerEventCounts(
  groupId: string,
  eventType: 'matsch' | 'schneider' = 'matsch'
): Promise<Map<string, { eventsMade: number; eventsReceived: number }>> {
  const playerEventCountsMap = new Map<string, { eventsMade: number; eventsReceived: number }>();
  
  try {
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      const isTournament = data.isTournamentSession || !!data.tournamentId;
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere Event-Counts pro Game pro Spieler
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameEventCounts = game.eventCounts || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
            
            teamPlayers.forEach((player: any) => {
              const playerId = player.playerId;
              if (!playerId) return;
              
              // Event-Counts für diesen Spieler in diesem Game
              const teamEvents = gameEventCounts[teamKey] || {};
              const opponentEvents = gameEventCounts[opponentKey] || {};
              
              const made = teamEvents[eventType] || 0;
              const received = opponentEvents[eventType] || 0;
              
              if (!playerEventCountsMap.has(playerId)) {
                playerEventCountsMap.set(playerId, { eventsMade: 0, eventsReceived: 0 });
              }
              const stats = playerEventCountsMap.get(playerId)!;
              stats.eventsMade += made;
              stats.eventsReceived += received;
            });
          });
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level Event-Counts
        const eventCounts = data.eventCounts || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
          
          teamPlayers.forEach((player: any) => {
            const playerId = player.playerId;
            if (!playerId) return;
            
            // Event-Counts für diesen Spieler in dieser Session
            const teamEvents = eventCounts[teamKey] || {};
            const opponentEvents = eventCounts[opponentKey] || {};
            
            const made = teamEvents[eventType] || 0;
            const received = opponentEvents[eventType] || 0;
            
            if (!playerEventCountsMap.has(playerId)) {
              playerEventCountsMap.set(playerId, { eventsMade: 0, eventsReceived: 0 });
            }
            const stats = playerEventCountsMap.get(playerId)!;
            stats.eventsMade += made;
            stats.eventsReceived += received;
          });
        });
      }
    });
  } catch (error) {
    console.error('[getPlayerEventCounts] Fehler:', error);
  }
  
  return playerEventCountsMap;
}

/**
 * 🎯 NEU: Lade Spieler-Striche/Punkte-Totals für eine Gruppe
 * Gibt für jeden Spieler gemachte/erhaltene Striche oder Punkte zurück
 */
export async function getPlayerStrichePointsTotals(
  groupId: string,
  type: 'striche' | 'points' = 'striche'
): Promise<Map<string, { made: number; received: number }>> {
  const playerTotalsMap = new Map<string, { made: number; received: number }>();
  
  try {
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    // Helper: Berechne totale Striche aus finalStriche-Objekt
    const getTotalStriche = (finalStricheObj: any): number => {
      if (!finalStricheObj) return 0;
      let total = 0;
      for (const val of Object.values(finalStricheObj)) {
        total += (Number(val) || 0);
      }
      return total;
    };
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere pro Game pro Spieler
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
            
            let teamScore = 0;
            let opponentScore = 0;
            
            if (type === 'striche') {
              // Striche: Summiere alle Strich-Typen aus finalStriche
              teamScore = getTotalStriche(game.finalStriche?.[teamKey]);
              opponentScore = getTotalStriche(game.finalStriche?.[opponentKey]);
            } else {
              // Punkte: Verwende topScore/bottomScore
              teamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
              opponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
            }
            
            teamPlayers.forEach((player: any) => {
              const playerId = player.playerId;
              if (!playerId) return;
              
              if (!playerTotalsMap.has(playerId)) {
                playerTotalsMap.set(playerId, { made: 0, received: 0 });
              }
              const stats = playerTotalsMap.get(playerId)!;
              stats.made += teamScore;
              stats.received += opponentScore;
            });
          });
        });
      } else {
        // ✅ NORMALE SESSION: Aggregiere aus gameResults
        const teams = data.teams || {};
        const gameResults = data.gameResults || [];
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
          
          let teamTotal = 0;
          let opponentTotal = 0;
          
          // Summiere über alle Games dieser Session
          gameResults.forEach((game: any) => {
            if (type === 'striche') {
              teamTotal += getTotalStriche(game.finalStriche?.[teamKey]);
              opponentTotal += getTotalStriche(game.finalStriche?.[opponentKey]);
            } else {
              teamTotal += (teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0));
              opponentTotal += (teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0));
            }
          });
          
          teamPlayers.forEach((player: any) => {
            const playerId = player.playerId;
            if (!playerId) return;
            
            if (!playerTotalsMap.has(playerId)) {
              playerTotalsMap.set(playerId, { made: 0, received: 0 });
            }
            const stats = playerTotalsMap.get(playerId)!;
            stats.made += teamTotal;
            stats.received += opponentTotal;
          });
        });
      }
    });
  } catch (error) {
    console.error('[getPlayerStrichePointsTotals] Fehler:', error);
  }
  
  return playerTotalsMap;
}

/**
 * 🎯 NEU: Lade Team-Striche/Punkte-Totals für eine Gruppe
 * Gibt für jedes Team gemachte/erhaltene Striche oder Punkte zurück
 */
export async function getTeamStrichePointsTotals(
  groupId: string,
  type: 'striche' | 'points' = 'striche'
): Promise<Map<string, { made: number; received: number }>> {
  const teamTotalsMap = new Map<string, { made: number; received: number }>();
  
  try {
    // 🎯 KRITISCH: Lade aktuelle Player-DisplayNames
    const playerDisplayNames = new Map<string, string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getTeamStrichePointsTotals] Could not load player names:', error);
    }
    
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    // Helper: Team-Namen generieren (SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Berechne totale Striche aus finalStriche-Objekt
    const getTotalStriche = (finalStricheObj: any): number => {
      if (!finalStricheObj) return 0;
      let total = 0;
      for (const val of Object.values(finalStricheObj)) {
        total += (Number(val) || 0);
      }
      return total;
    };
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere pro Game
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
            const teamName = getTeamName(teamPlayers);
            
            let teamScore = 0;
            let opponentScore = 0;
            
            if (type === 'striche') {
              teamScore = getTotalStriche(game.finalStriche?.[teamKey]);
              opponentScore = getTotalStriche(game.finalStriche?.[opponentKey]);
            } else {
              teamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
              opponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
            }
            
            if (!teamTotalsMap.has(teamName)) {
              teamTotalsMap.set(teamName, { made: 0, received: 0 });
            }
            const stats = teamTotalsMap.get(teamName)!;
            stats.made += teamScore;
            stats.received += opponentScore;
          });
        });
      } else {
        // ✅ NORMALE SESSION: Aggregiere aus gameResults
        const teams = data.teams || {};
        const gameResults = data.gameResults || [];
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return;
          
          const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
          const teamName = getTeamName(teamPlayers);
          
          let teamTotal = 0;
          let opponentTotal = 0;
          
          // Summiere über alle Games dieser Session
          gameResults.forEach((game: any) => {
            if (type === 'striche') {
              teamTotal += getTotalStriche(game.finalStriche?.[teamKey]);
              opponentTotal += getTotalStriche(game.finalStriche?.[opponentKey]);
            } else {
              teamTotal += (teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0));
              opponentTotal += (teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0));
            }
          });
          
          if (!teamTotalsMap.has(teamName)) {
            teamTotalsMap.set(teamName, { made: 0, received: 0 });
          }
          const stats = teamTotalsMap.get(teamName)!;
          stats.made += teamTotal;
          stats.received += opponentTotal;
        });
      }
    });
  } catch (error) {
    console.error('[getTeamStrichePointsTotals] Fehler:', error);
  }
  
  return teamTotalsMap;
}

/**
 * 🚀 Lade Team-Weis-Punkte-Totals (Made/Received)
 * Analog zu getTeamStrichePointsTotals, aber für Weis-Punkte
 */
export async function getTeamWeisPointsTotals(
  groupId: string
): Promise<Map<string, { made: number; received: number }>> {
  const teamTotalsMap = new Map<string, { made: number; received: number }>();
  
  try {
    // 🎯 KRITISCH: Lade aktuelle Player-DisplayNames
    const playerDisplayNames = new Map<string, string>();
    try {
      const playersSnap = await getDocs(
        query(collection(db, 'players'), where('groupIds', 'array-contains', groupId))
      );
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getTeamWeisPointsTotals] Could not load player names:', error);
    }
    
    const summariesSnap = await getDocs(
      query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'asc')
      )
    );
    
    // Helper: Team-Namen generieren (SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    summariesSnap.docs.forEach((summaryDoc) => {
      const data = summaryDoc.data();
      const sessionId = summaryDoc.id;
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId ||
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        // ✅ TURNIER: Aggregiere Weis-Punkte pro Game
        const gameResults = data.gameResults;
        
        gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          const weisPoints = game.weisPoints || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
            const teamName = getTeamName(teamPlayers);
            
            const teamWeisPoints = weisPoints[teamKey] || 0;
            const opponentWeisPoints = weisPoints[opponentKey] || 0;
            
            if (!teamTotalsMap.has(teamName)) {
              teamTotalsMap.set(teamName, { made: 0, received: 0 });
            }
            const stats = teamTotalsMap.get(teamName)!;
            stats.made += teamWeisPoints;
            stats.received += opponentWeisPoints;
          });
        });
      } else {
        // ✅ NORMALE SESSION: Verwende sessionTotalWeisPoints
        const teams = data.teams || {};
        const sessionTotalWeisPoints = data.sessionTotalWeisPoints || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return;
          
          const opponentKey = teamKey === 'top' ? 'bottom' : 'top';
          const teamName = getTeamName(teamPlayers);
          
          const teamWeisPoints = sessionTotalWeisPoints[teamKey] || 0;
          const opponentWeisPoints = sessionTotalWeisPoints[opponentKey] || 0;
          
          if (!teamTotalsMap.has(teamName)) {
            teamTotalsMap.set(teamName, { made: 0, received: 0 });
          }
          const stats = teamTotalsMap.get(teamName)!;
          stats.made += teamWeisPoints;
          stats.received += opponentWeisPoints;
        });
      }
    });
  } catch (error) {
    console.error('[getTeamWeisPointsTotals] Fehler:', error);
  }
  
  return teamTotalsMap;
}

/**
 * 🚀 Lade Team-Strichdifferenz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamStricheChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getGroupPlayersSnapshot(groupId);
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamStricheChart] Could not load player names:', error);
    }

    // ⚡ Geteilter Sessions-Loader (request-deduper)
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId;
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames, SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      // ✅ KRITISCH: Sortiere ERST nach playerId, DANN hole Namen (für konsistente Team-Namen!)
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        const calculateTotalStriche = (striche: any) => {
          return (striche?.sieg || 0) + (striche?.berg || 0) + (striche?.matsch || 0) + (striche?.schneider || 0) + (striche?.kontermatsch || 0);
        };
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameFinalStriche = game.finalStriche || {};
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Strichdifferenz für dieses Game
            const teamStriche = gameFinalStriche[teamKey] || {};
            const opponentTeamStriche = gameFinalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
            
            const teamTotal = calculateTotalStriche(teamStriche);
            const opponentTotal = calculateTotalStriche(opponentTeamStriche);
            const delta = teamTotal - opponentTotal;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const finalStriche = data.finalStriche || {};
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Strichdifferenz für dieses Team
          const teamStriche = finalStriche[teamKey] || {};
          const opponentTeamStriche = finalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const calculateTotalStriche = (striche: any) => {
            return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
          };
          
          const teamTotal = calculateTotalStriche(teamStriche);
          const opponentTotal = calculateTotalStriche(opponentTeamStriche);
          const delta = teamTotal - opponentTotal;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamStricheChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🚀 Lade Team-Punktedifferenz-Chart
 * Teams als "playerId1-playerId2" (sortiert) - nur Top 15 Teams
 */
export async function getOptimizedTeamPointsChart(
  groupId: string,
  options?: any
): Promise<{
  labels: string[];
  datasets: any[];
  source: 'backfill' | 'live';
  lastUpdated?: Date;
}> {
  try {
    // 🎯 Lade aktuelle Player-DisplayNames (für korrekte Namen bei Umbenennungen)
    const playerDisplayNames = new Map<string, string>();
    const allPlayerIdsInSessions = new Set<string>();
    try {
      const playersSnap = await getGroupPlayersSnapshot(groupId);
      playersSnap.forEach(doc => {
        playerDisplayNames.set(doc.id, doc.data().displayName);
      });
    } catch (error) {
      console.warn('[getOptimizedTeamPointsChart] Could not load player names:', error);
    }

    // ⚡ Geteilter Sessions-Loader (request-deduper)
    const summariesSnap = await getGroupSessionsSnapshot(groupId);
    
    if (summariesSnap.empty) {
      return {
        labels: [],
        datasets: [],
        source: 'live',
        lastUpdated: new Date()
      };
    }
    
    // 🎯 NEU: Sammle alle Player-IDs aus Sessions für Aktivitätsfilter
    summariesSnap.docs.forEach(summaryDoc => {
      const data = summaryDoc.data();
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId;
      
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        data.gameResults.forEach((game: any) => {
          const gameTeams = game.teams || {};
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            teamPlayers.forEach((p: any) => {
              if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
            });
          });
        });
      } else {
        const teams = data.teams || {};
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          teamPlayers.forEach((p: any) => {
            if (p.playerId) allPlayerIdsInSessions.add(p.playerId);
          });
        });
      }
    });
    
    // 🎯 NEU: Lade lastJassTimestamp für alle Spieler (1-Jahr-Inaktivitätsfilter)
    const playerLastActivityMap = await loadPlayerLastActivityForFilter(allPlayerIdsInSessions);
    
    // Helper: Team-ID generieren (sortiert für Konsistenz)
    const getTeamId = (players: Array<{ playerId: string; displayName?: string }>): string => {
      const sortedIds = players.map(p => p.playerId).sort();
      return sortedIds.join('-');
    };
    
    // Helper: Team-Namen generieren (mit aktuellen DisplayNames, SORTIERT!)
    const getTeamName = (players: Array<{ playerId: string; displayName?: string }>): string => {
      // ✅ KRITISCH: Sortiere ERST nach playerId, DANN hole Namen (für konsistente Team-Namen!)
      const sortedPlayers = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
      return sortedPlayers.map(p => playerDisplayNames.get(p.playerId) || p.displayName || p.playerId).join(' & ');
    };
    
    // Helper: Prüft, ob ein Team aktiv ist (beide Spieler müssen aktiv sein)
    const isTeamActive = (players: Array<{ playerId: string; displayName?: string }>): boolean => {
      return players.every(p => isPlayerActive(p.playerId, playerLastActivityMap));
    };
    
    // Sammle alle Sessions und berechne Team-Daten
    const labels: string[] = [];
    const teamToSessionsMap = new Map<string, { name: string; sessionIndices: Set<number>; deltas: Map<number, number> }>();
    
    summariesSnap.docs.forEach((summaryDoc, sessionIndex) => {
      const data = summaryDoc.data();
      const completedAt = data.completedAt;
      if (!completedAt) return;
      
      const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
      const label = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      labels.push(label);
      
      const sessionId = summaryDoc.id;
      // 🎯 ROBUSTE TOURNAMENT-ERKENNUNG: Prüfe tournamentId, gameResults oder isTournamentSession
      const isTournament = data.isTournamentSession || 
                           !!data.tournamentId || 
                           sessionId === '6eNr8fnsTO06jgCqjelt';
      
      // ✅ TURNIER: Aggregiere alle Game-Level-Teams
      if (isTournament && data.gameResults && Array.isArray(data.gameResults)) {
        const gameResults = data.gameResults;
        const tournamentTeamDeltas = new Map<string, number>();
        
        // Iteriere durch alle Games im Turnier
        gameResults.forEach((game: any) => {
          const gameScores = { top: game.topScore || 0, bottom: game.bottomScore || 0 };
          const gameTeams = game.teams || {};
          
          ['top', 'bottom'].forEach(teamKey => {
            const teamPlayers = gameTeams[teamKey]?.players || [];
            if (teamPlayers.length !== 2) return;
            
            // 🎯 NEU: Filtere Teams mit inaktiven Spielern
            if (!isTeamActive(teamPlayers)) return;
            
            const teamId = getTeamId(teamPlayers);
            const teamName = getTeamName(teamPlayers);
            
            // Berechne Punktedifferenz für dieses Game
            const teamScore = gameScores[teamKey] || 0;
            const opponentScore = gameScores[teamKey === 'top' ? 'bottom' : 'top'] || 0;
            const delta = teamScore - opponentScore;
            
            // Aggregiere Delta für dieses Team über alle Games
            tournamentTeamDeltas.set(teamId, (tournamentTeamDeltas.get(teamId) || 0) + delta);
            
            // Track Team-Namen (erstes Vorkommen)
            if (!teamToSessionsMap.has(teamId)) {
              teamToSessionsMap.set(teamId, {
                name: teamName,
                sessionIndices: new Set(),
                deltas: new Map()
              });
            }
          });
        });
        
        // Füge EINEN Datenpunkt für das gesamte Turnier hinzu
        tournamentTeamDeltas.forEach((totalDelta, teamId) => {
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, totalDelta);
        });
      } else {
        // ✅ NORMALE SESSION: Verwende Session-Level-Teams
        const finalScores = data.finalScores || { top: 0, bottom: 0 };
        const teams = data.teams || {};
        
        ['top', 'bottom'].forEach(teamKey => {
          const teamPlayers = teams[teamKey]?.players || [];
          if (teamPlayers.length !== 2) return; // Nur 2er-Teams
          
          // 🎯 NEU: Filtere Teams mit inaktiven Spielern
          if (!isTeamActive(teamPlayers)) return;
          
          const teamId = getTeamId(teamPlayers);
          const teamName = getTeamName(teamPlayers);
          
          // Berechne Punktedifferenz für dieses Team
          const teamScore = finalScores[teamKey] || 0;
          const opponentScore = finalScores[teamKey === 'top' ? 'bottom' : 'top'] || 0;
          const delta = teamScore - opponentScore;
          
          // Track Team
          if (!teamToSessionsMap.has(teamId)) {
            teamToSessionsMap.set(teamId, {
              name: teamName,
              sessionIndices: new Set(),
              deltas: new Map()
            });
          }
          
          const teamData = teamToSessionsMap.get(teamId)!;
          teamData.sessionIndices.add(sessionIndex);
          teamData.deltas.set(sessionIndex, delta);
        });
      }
    });
    
    // Filter: Nur Teams mit mehr als 0 Sessions
    const teamsArray = Array.from(teamToSessionsMap.entries())
      .map(([teamId, stats]) => ({
        teamId,
        teamName: stats.name,
        sessions: stats.sessionIndices.size,
        data: stats.sessionIndices,
        deltas: stats.deltas
      }))
      .filter(t => t.sessions > 0);
    
    // 🔥 TOP 15 TEAMS nach Session-Anzahl
    const topTeams = teamsArray.sort((a, b) => b.sessions - a.sessions).slice(0, 15);
    
    // Erstelle Datasets mit null-Werten für Sessions wo Team nicht gespielt hat
    const datasets = topTeams.map(team => {
      const data: (number | null)[] = [];
      let cumulativeValue = 0;
      
      for (let i = 0; i < labels.length; i++) {
        if (team.data.has(i)) {
          // Team hat in dieser Session gespielt
          const delta = team.deltas.get(i) || 0;
          cumulativeValue += delta;
          data.push(cumulativeValue);
        } else {
          // Team hat in dieser Session NICHT gespielt
          data.push(null);
        }
      }
      
      return {
        label: team.teamName,
        displayName: team.teamName,
        teamId: team.teamId,
        data,
        spanGaps: true,
        borderColor: '', // Wird unten gesetzt
        backgroundColor: '' // Wird unten gesetzt
      };
    });
    
    // ✅ SORTIERE DATASETS NACH AKTUELLEM RANKING
    datasets.sort((a, b) => {
      const aLast = a.data[a.data.length - 1] ?? 0;
      const bLast = b.data[b.data.length - 1] ?? 0;
      return bLast - aLast;
    });
    
    // ✅ WEISE RANKING-BASIERTE FARBEN ZU
    datasets.forEach((dataset, index) => {
      const rank = index + 1;
      (dataset as any).borderColor = getRankingColor(rank);
      (dataset as any).backgroundColor = getRankingColor(rank, 0.1);
    });
    
    return {
      labels,
      datasets,
      source: 'live',
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('[getOptimizedTeamPointsChart] Fehler:', error);
    return {
      labels: [],
      datasets: [],
      source: 'live',
      lastUpdated: new Date()
    };
  }
}

/**
 * 🎯 TRUMPF-VERTEILUNG zu Chart-Daten transformieren
 * Wandelt trumpfStatistik (groupStats) in PieChart-Format um
 */
export interface TrumpfDistributionData {
  labels: string[];
  values: number[];
  backgroundColor?: string[];
  pictogramPaths?: string[]; // ✅ NEU: Pfade zu Bild-Pictogrammen
  percentages?: number[]; // ✅ NEU: Prozentsätze (sortiert nach Häufigkeit)
}

export function getTrumpfDistributionChartData(
  trumpfStatistik: { [farbe: string]: number },
  totalTrumpfCount: number
): TrumpfDistributionData | null {
  if (!trumpfStatistik || totalTrumpfCount === 0) {
    return null;
  }

  const canonicalTrumpfKey = (farbe: string): string => {
    const normalized = farbe
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (["eicheln", "eichel", "eichle", "schaufel", "gras"].includes(normalized)) return "eichel";
    if (["rosen", "rose", "kreuz"].includes(normalized)) return "rosen";
    if (["schellen", "schelle", "schalle", "herz"].includes(normalized)) return "schellen";
    if (["schilten", "schilte", "ecke"].includes(normalized)) return "schilten";
    if (normalized === "une" || normalized === "unde") return "unde";
    if (normalized === "misere" || normalized === "miserefr") return "misere";
    if (normalized === "trumpf") return "obe";

    return normalized;
  };

  // ✅ KORREKTUR: Alle Varianten auf kanonische Keys zusammenführen
  const consolidatedStats: Record<string, number> = {};
  
  Object.entries(trumpfStatistik).forEach(([farbe, anzahl]) => {
    const mappedFarbe = canonicalTrumpfKey(farbe);
    
    // Zusammenfassen
    consolidatedStats[mappedFarbe] = (consolidatedStats[mappedFarbe] || 0) + anzahl;
  });
  
  // ✅ Verwende konsolidierte Stats
  const trumpfStatistikConsolidated = consolidatedStats;

  // Pictogramm-Pfade für Trumpffarben (DE + FR)
  const trumpfPictogramMap: { [key: string]: string } = {
    // Deutsche Farben (PNG-Dateien)
    'eichel': '/assets/pictograms/standardDE/eichel.png',
    'eicheln': '/assets/pictograms/standardDE/eichel.png',
    'rosen': '/assets/pictograms/standardDE/rosen.png',
    'rose': '/assets/pictograms/standardDE/rosen.png',
    'schellen': '/assets/pictograms/standardDE/schellen.png',
    'schelle': '/assets/pictograms/standardDE/schellen.png',
    'schilten': '/assets/pictograms/standardDE/schilten.png',
    'schilte': '/assets/pictograms/standardDE/schilten.png',
    // Spezielle Trumpf-Typen (SVG-Dateien)
    'unde': '/assets/pictograms/standardDE/unde.svg',
    'une': '/assets/pictograms/standardDE/unde.svg',
    'obe': '/assets/pictograms/standardDE/obe.svg',
    'quer': '/assets/pictograms/standardDE/quer.svg',
    'misere': '/assets/pictograms/standardDE/misere.svg',
    'misère': '/assets/pictograms/standardDE/misere.svg',
    'slalom': '/assets/pictograms/standardDE/slalom.svg',
    '3x3': '/assets/pictograms/standardDE/3x3.svg'
  };
  
  // ✅ Verwende GLEICHE Farbreihenfolge wie Verlaufcharts (getRankingColor wird aus chartColors.ts importiert)
  
  // ✅ Farben zuordnen nach Rang (sortiert bereits nach Häufigkeit)

  // Sortiere nach Häufigkeit (höchste zuerst) - ✅ Verwende konsolidierte Stats!
  const sortedEntries = Object.entries(trumpfStatistikConsolidated)
    .map(([farbe, anzahl]) => ({
      farbe: farbe.toLowerCase(),
      anzahl,
      percentage: (anzahl / totalTrumpfCount) * 100
    }))
    .sort((a, b) => b.anzahl - a.anzahl);

  // Nur Farben mit Daten
  const filteredEntries = sortedEntries.filter(entry => entry.anzahl > 0);

  if (filteredEntries.length === 0) {
    return null;
  }

  return {
    labels: filteredEntries.map(entry => entry.farbe.charAt(0).toUpperCase() + entry.farbe.slice(1)),
    values: filteredEntries.map(entry => entry.anzahl),
    percentages: filteredEntries.map(entry => entry.percentage), // ✅ NEU: Bereits berechnete Prozentsätze
    // ✅ Farben basierend auf Rang (sortiert nach Häufigkeit)
    backgroundColor: filteredEntries.map((entry, idx) => 
      getRankingColor(idx + 1) // Rank 1, 2, 3, ... (Grün, Blau, Lila, ...)
    ),
    pictogramPaths: filteredEntries.map(entry => 
      trumpfPictogramMap[entry.farbe.toLowerCase()] || '' // ✅ NEU: Pictogramm-Pfade
    )
  };
}