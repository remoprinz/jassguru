import { db } from '@/services/firebaseInit';
import { collection, getDocs } from 'firebase/firestore';
import { getGlobalPlayerStricheTimeSeries } from '@/services/globalStricheHistoryService';
import { getGlobalPlayerPointsTimeSeries } from '@/services/globalPointsHistoryService';

/**
 * 🌍 COMBINED Stat-Charts Loader (5-in-1)
 *
 * Berechnet Striche-, Punkt-, Matsch-, Schneider- und Kontermatsch-Charts
 * aus EINER einzigen `players/{id}/scoresHistory` Query, statt 5 identischen.
 *
 * Verhalten ist exakt identisch zu den 5 Einzel-Services (auch der Fallback
 * für Spieler ohne scoresHistory wird über die alten Services bedient).
 */

type ChartData = {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
};

export type ScoresCharts = {
  striche: ChartData;
  points: ChartData;
  matsch: ChartData;
  schneider: ChartData;
  kontermatsch: ChartData;
};

const THEME_COLORS: Record<string, { border: string; background: string }> = {
  green: { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' },
  blue: { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' },
  purple: { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' },
  yellow: { border: '#eab308', background: 'rgba(234, 179, 8, 0.1)' },
  orange: { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' },
  cyan: { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' },
  pink: { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' },
  teal: { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.1)' },
};

const emptyChart: ChartData = { labels: [], datasets: [] };

/**
 * ⚡ CACHE für ProfileView-Stats-Charts.
 *
 * Key = playerId + limitCount + profileTheme. Hält das fertige ScoresCharts-
 * Objekt im Speicher, bis es explizit über invalidateScoresHistoryCache()
 * geleert wird (typischerweise nach Session-Abschluss).
 */
const scoresCache = new Map<string, ScoresCharts>();

export function invalidateScoresHistoryCache(): void {
  scoresCache.clear();
}

/**
 * Synchroner Cache-Lookup für getGlobalPlayerScoresCharts.
 * Gibt das gecachte ScoresCharts-Objekt zurück oder null.
 */
export function getGlobalPlayerScoresChartsSync(
  playerId: string,
  limitCount: number = 9999,
  profileTheme: string = 'blue',
): ScoresCharts | null {
  const key = `${playerId}::${limitCount}::${profileTheme}`;
  return scoresCache.get(key) || null;
}

function getColors(theme: string) {
  return THEME_COLORS[theme] || THEME_COLORS.blue;
}

function formatDate(ts: any): string {
  return ts?.toDate ? ts.toDate().toLocaleDateString('de-DE') : 'Unbekannt';
}

function isGameLikeEvent(entry: any): boolean {
  return (
    entry.eventType === 'game' ||
    entry.eventType === 'session' ||
    entry.eventType === 'tournament_session'
  );
}

export async function getGlobalPlayerScoresCharts(
  playerId: string,
  limitCount: number = 9999,
  profileTheme: string = 'blue',
): Promise<ScoresCharts> {
  const colors = getColors(profileTheme);

  // ⚡ Cache-Hit? Sofort zurückgeben.
  const cacheKey = `${playerId}::${limitCount}::${profileTheme}`;
  const cached = scoresCache.get(cacheKey);
  if (cached) return cached;

  try {
    const snap = await getDocs(collection(db, 'players', playerId, 'scoresHistory'));

    // Edge-Case: keine scoresHistory → Striche+Points über alte Services (Fallback),
    // Matsch/Schneider/Kontermatsch bleiben leer (identisch zum bisherigen Verhalten).
    if (snap.empty) {
      const [striche, points] = await Promise.all([
        getGlobalPlayerStricheTimeSeries(playerId, limitCount, profileTheme),
        getGlobalPlayerPointsTimeSeries(playerId, limitCount, profileTheme),
      ]);
      const result: ScoresCharts = {
        striche,
        points,
        matsch: emptyChart,
        schneider: emptyChart,
        kontermatsch: emptyChart,
      };
      scoresCache.set(cacheKey, result);
      return result;
    }

    // Einmal sortieren, dann 5× draus rechnen
    const entries = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => {
        const dA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
        const dB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
        return dA.getTime() - dB.getTime();
      });

    // Striche+Points: nur Game-like Entries mit numerischem stricheDiff
    const hasGameEntries = entries.some(
      e => isGameLikeEvent(e) && typeof e.stricheDiff === 'number',
    );

    let striche: ChartData;
    let points: ChartData;

    if (hasGameEntries) {
      const gameEntries = entries.filter(isGameLikeEvent).slice(-limitCount);

      const stricheLabels: string[] = [];
      const stricheData: number[] = [];
      let cumStriche = 0;

      const pointsLabels: string[] = [];
      const pointsData: number[] = [];
      let cumPoints = 0;

      for (const entry of gameEntries) {
        const label = formatDate(entry.completedAt);

        cumStriche += entry.stricheDiff || 0;
        stricheLabels.push(label);
        stricheData.push(cumStriche);

        cumPoints += entry.pointsDiff || 0;
        pointsLabels.push(label);
        pointsData.push(cumPoints);
      }

      striche = {
        labels: stricheLabels,
        datasets: [{
          label: 'Strichdifferenz',
          data: stricheData,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }],
      };
      points = {
        labels: pointsLabels,
        datasets: [{
          label: 'Punktdifferenz',
          data: pointsData,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }],
      };
    } else {
      // Keine passenden Game-Entries → alter Fallback-Pfad (collectionGroup)
      [striche, points] = await Promise.all([
        getGlobalPlayerStricheTimeSeries(playerId, limitCount, profileTheme),
        getGlobalPlayerPointsTimeSeries(playerId, limitCount, profileTheme),
      ]);
    }

    // Matsch / Schneider / Kontermatsch: alle Entries (kein eventType-Filter),
    // exakt wie in den Einzel-Services.
    const limited = entries.slice(-limitCount);

    const matschLabels: string[] = [];
    const matschData: number[] = [];
    let cumMatsch = 0;

    const kmLabels: string[] = [];
    const kmData: number[] = [];
    let cumKm = 0;

    // Schneider: nur Punkt, wenn delta !== 0 (identisch zum alten Service)
    const schneiderLabels: string[] = [];
    const schneiderData: number[] = [];
    let cumSchneider = 0;

    for (const entry of limited) {
      const label = formatDate(entry.completedAt);

      cumMatsch += entry.matschBilanz || 0;
      matschLabels.push(label);
      matschData.push(cumMatsch);

      cumKm += entry.kontermatschBilanz || 0;
      kmLabels.push(label);
      kmData.push(cumKm);

      const sDelta = entry.schneiderBilanz || 0;
      cumSchneider += sDelta;
      if (sDelta !== 0) {
        schneiderLabels.push(label);
        schneiderData.push(cumSchneider);
      }
    }

    const matsch: ChartData = {
      labels: matschLabels,
      datasets: [{
        label: 'Matsch-Bilanz',
        data: matschData,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }],
    };

    const schneider: ChartData = {
      labels: schneiderLabels,
      datasets: [{
        label: 'Schneider-Bilanz',
        data: schneiderData,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }],
    };

    const kontermatsch: ChartData = {
      labels: kmLabels,
      datasets: [{
        label: 'Kontermatsch-Bilanz',
        data: kmData,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }],
    };

    const result: ScoresCharts = { striche, points, matsch, schneider, kontermatsch };
    scoresCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[getGlobalPlayerScoresCharts] Fehler:', error);
    return {
      striche: emptyChart,
      points: emptyChart,
      matsch: emptyChart,
      schneider: emptyChart,
      kontermatsch: emptyChart,
    };
  }
}
