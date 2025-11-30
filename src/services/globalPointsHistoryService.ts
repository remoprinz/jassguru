import { db } from '@/services/firebaseInit';
import { collection, collectionGroup, getDocs, query, where, orderBy } from 'firebase/firestore';

/**
 * 🌍 GLOBALE PUNKT-DIFFERENZ ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * Quelle: players/{playerId}/scoresHistory (neue unified Struktur)
 * SCHNELL: Direkt aus Precomputed-Daten!
 */
export async function getGlobalPlayerPointsTimeSeries(
  playerId: string,
  limitCount: number = 100,
  profileTheme: string = 'yellow'
): Promise<{
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
}> {
  try {
    // 📊 SCHNELLER PFAD: Versuche zuerst, game-basierte ScoresHistory zu verwenden
    const scoresHistorySnapshot = await getDocs(
      collection(db, 'players', playerId, 'scoresHistory')
    );
    
    if (!scoresHistorySnapshot.empty) {
      const historyEntries = scoresHistorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any)).sort((a, b) => {
        const dateA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
        const dateB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
        return dateA.getTime() - dateB.getTime();
      });

      const hasGameEntries = historyEntries.some(e => e.eventType === 'game' && typeof e.pointsDiff === 'number');

      if (hasGameEntries) {
        const limitedHistory = historyEntries
          .filter(e => e.eventType === 'game' || e.eventType === 'session') // ✅ Akzeptiere auch Session-Events
          .slice(-limitCount);

        const pointsDiffData: number[] = [];
        const filteredLabels: string[] = [];
        let cumulativePointsDiff = 0;
        
        limitedHistory.forEach(entry => {
          cumulativePointsDiff += entry.pointsDiff || 0;
          pointsDiffData.push(cumulativePointsDiff);
          filteredLabels.push(entry.completedAt?.toDate ? 
            entry.completedAt.toDate().toLocaleDateString('de-DE') : 
            'Unbekannt'
          );
        });

        const colors = getThemeColorsPoints(profileTheme);

        return {
          labels: filteredLabels,
          datasets: [{
            label: 'Punktdifferenz',
            data: pointsDiffData,
            borderColor: colors.border,
            backgroundColor: colors.background
          } as any]
        };
      }
    }

    // 🐢 FALLBACK: Rekonstruiere Punktedifferenz-Zeitreihe direkt aus allen jassGameSummaries,
    // wenn keine oder keine passenden ScoresHistory-Events vorhanden sind.
    console.warn(`[getGlobalPlayerPointsTimeSeries] Verwende Fallback über jassGameSummaries für ${playerId}`);

    const sessionsQuery = query(
      collectionGroup(db, 'jassGameSummaries'),
      where('participantPlayerIds', 'array-contains', playerId),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'asc')
    );
    const sessionsSnap = await getDocs(sessionsQuery);

    if (sessionsSnap.empty) {
      return {
        labels: [],
        datasets: []
      };
    }

    type SessionEvent = {
      completedAt: Date;
      finalScores?: any;
      teams?: any;
      gameResults?: any[];
      participantPlayerIds: string[];
    };

    const events: SessionEvent[] = [];

    sessionsSnap.forEach(docSnap => {
      const data: any = docSnap.data();
      const completedAtTs = data.completedAt || data.endedAt || data.createdAt;
      if (!completedAtTs) return;

      const completedAt: Date = completedAtTs.toDate ? completedAtTs.toDate() : new Date(completedAtTs);

      const event: SessionEvent = {
        completedAt,
        participantPlayerIds: Array.isArray(data.participantPlayerIds) ? data.participantPlayerIds : [],
      };

      if (data.gameResults && Array.isArray(data.gameResults) && data.gameResults.length > 0) {
        event.gameResults = data.gameResults;
      } else if (data.finalScores) {
        event.finalScores = data.finalScores;
        event.teams = data.teams;
      }

      events.push(event);
    });

    if (events.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    events.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    const labels: string[] = [];
    const dataPoints: number[] = [];
    let cumulativeDiff = 0;

    for (const ev of events) {
      const sessionDiff = calculatePlayerPointsDiffFallback(ev, playerId);
      cumulativeDiff += sessionDiff;
      labels.push(ev.completedAt.toLocaleDateString('de-DE'));
      dataPoints.push(cumulativeDiff);
    }

    const colors = getThemeColorsPoints(profileTheme);

    return {
      labels,
      datasets: [{
        label: 'Punktdifferenz',
        data: dataPoints,
        borderColor: colors.border,
        backgroundColor: colors.background
      } as any]
    };

  } catch (error) {
    console.error('[getGlobalPlayerPointsTimeSeries] Fehler:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}

// === Hilfsfunktionen für Fallback-Berechnung (aus pointsHistoryService.ts übernommen) ===

function getThemeColorsPoints(profileTheme: string) {
  const themeColors = {
    green: { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' },
    blue: { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' },
    purple: { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' },
    yellow: { border: '#eab308', background: 'rgba(234, 179, 8, 0.1)' },
    orange: { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' },
    cyan: { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' },
    pink: { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' },
    teal: { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.1)' }
  };
  return themeColors[profileTheme as keyof typeof themeColors] || themeColors.blue;
}

type SessionEventPointsFallback = {
  completedAt: Date;
  finalScores?: any;
  teams?: any;
  gameResults?: any[];
  participantPlayerIds: string[];
};

function calculatePlayerPointsDiffFallback(session: SessionEventPointsFallback, playerId: string): number {
  if (session.gameResults && Array.isArray(session.gameResults) && session.gameResults.length > 0) {
    return calculateTournamentPlayerPointsDiffFallback(session, playerId);
  }

  const finalScores = session.finalScores;
  if (!finalScores || typeof finalScores.top !== 'number' || typeof finalScores.bottom !== 'number') {
    return 0;
  }

  let playerTeam: 'top' | 'bottom' | null = null;
  if (session.teams) {
    if (session.teams.top?.players) {
      const inTopTeam = session.teams.top.players.some((p: any) => p.playerId === playerId);
      if (inTopTeam) playerTeam = 'top';
    }
    if (!playerTeam && session.teams.bottom?.players) {
      const inBottomTeam = session.teams.bottom.players.some((p: any) => p.playerId === playerId);
      if (inBottomTeam) playerTeam = 'bottom';
    }
  }

  if (!playerTeam) return 0;

  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  const myTeamPoints = finalScores[playerTeam];
  const opponentTeamPoints = finalScores[opponentTeam];
  return myTeamPoints - opponentTeamPoints;
}

function calculateTournamentPlayerPointsDiffFallback(session: SessionEventPointsFallback, playerId: string): number {
  if (!session.gameResults) return 0;
  let totalPointsDiff = 0;

  for (const game of session.gameResults) {
    if (!game.teams) continue;

    let playerTeam: 'top' | 'bottom' | null = null;
    if (game.teams.top?.players) {
      const inTopTeam = game.teams.top.players.some((p: any) => p.playerId === playerId);
      if (inTopTeam) playerTeam = 'top';
    }
    if (!playerTeam && game.teams.bottom?.players) {
      const inBottomTeam = game.teams.bottom.players.some((p: any) => p.playerId === playerId);
      if (inBottomTeam) playerTeam = 'bottom';
    }

    if (!playerTeam) continue;

    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    const myTeamPoints = playerTeam === 'top' ? game.topScore : game.bottomScore;
    const opponentTeamPoints = opponentTeam === 'top' ? game.topScore : game.bottomScore;
    totalPointsDiff += (myTeamPoints - opponentTeamPoints);
  }

  return totalPointsDiff;
}

