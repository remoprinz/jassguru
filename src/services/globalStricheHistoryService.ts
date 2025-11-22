import { db } from '@/services/firebaseInit';
import { collection, collectionGroup, getDocs, query, where, orderBy } from 'firebase/firestore';

/**
 * 🌍 GLOBALE STRICH-DIFFERENZ ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * Quelle: players/{playerId}/scoresHistory (neue unified Struktur)
 * SCHNELL: Direkt aus Precomputed-Daten!
 */
export async function getGlobalPlayerStricheTimeSeries(
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
      // Konvertiere zu Array und sortiere nach completedAt
      const historyEntries = scoresHistorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any)).sort((a, b) => {
        const dateA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
        const dateB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
        return dateA.getTime() - dateB.getTime();
      });

      // Prüfe, ob die Einträge wirklich game-basiert sind (eventType === 'game' und stricheDiff vorhanden)
      const hasGameEntries = historyEntries.some(e => e.eventType === 'game' && typeof e.stricheDiff === 'number');

      if (hasGameEntries) {
        const limitedHistory = historyEntries
          .filter(e => e.eventType === 'game')
          .slice(-limitCount);

        const stricheDiffData: number[] = [];
        const filteredLabels: string[] = [];
        let cumulativeStricheDiff = 0;
        
        limitedHistory.forEach(entry => {
          cumulativeStricheDiff += entry.stricheDiff || 0;
          stricheDiffData.push(cumulativeStricheDiff);
          filteredLabels.push(entry.completedAt?.toDate ? 
            entry.completedAt.toDate().toLocaleDateString('de-DE') : 
            'Unbekannt'
          );
        });

        const colors = getThemeColors(profileTheme);

        return {
          labels: filteredLabels,
          datasets: [{
            label: 'Strichdifferenz',
            data: stricheDiffData,
            borderColor: colors.border,
            backgroundColor: colors.background
          } as any]
        };
      }
    }

    // 🐢 FALLBACK: Rekonstruiere Strichdifferenz-Zeitreihe direkt aus allen jassGameSummaries,
    // wenn keine oder keine passenden ScoresHistory-Events vorhanden sind.
    console.warn(`[getGlobalPlayerStricheTimeSeries] Verwende Fallback über jassGameSummaries für ${playerId}`);

    // Lade alle Sessions über collectionGroup, in denen der Spieler teilgenommen hat
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
      finalStriche?: any;
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
      } else if (data.finalStriche) {
        event.finalStriche = data.finalStriche;
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

    // Sortiere chronologisch
    events.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    // Berechne kumulative Strichdifferenz pro Session für diesen Spieler
    const labels: string[] = [];
    const dataPoints: number[] = [];
    let cumulativeDiff = 0;

    for (const ev of events) {
      const sessionDiff = calculatePlayerStricheDiff(ev, playerId);
      cumulativeDiff += sessionDiff;
      labels.push(ev.completedAt.toLocaleDateString('de-DE'));
      dataPoints.push(cumulativeDiff);
    }

    const colors = getThemeColors(profileTheme);

    return {
      labels,
      datasets: [{
        label: 'Strichdifferenz',
        data: dataPoints,
        borderColor: colors.border,
        backgroundColor: colors.background
      } as any]
    };

  } catch (error) {
    console.error('[getGlobalPlayerStricheTimeSeries] Fehler:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}

// === Hilfsfunktionen für Fallback-Berechnung (aus stricheHistoryService.ts übernommen) ===

function getThemeColors(profileTheme: string) {
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

type SessionEventFallback = {
  completedAt: Date;
  finalStriche?: any;
  teams?: any;
  gameResults?: any[];
  participantPlayerIds: string[];
};

function sumStricheRecord(stricheData: any): number {
  if (!stricheData) return 0;
  return (stricheData.berg || 0) +
         (stricheData.sieg || 0) +
         (stricheData.matsch || 0) +
         (stricheData.schneider || 0) +
         (stricheData.kontermatsch || 0);
}

function calculatePlayerStricheDiff(session: SessionEventFallback, playerId: string): number {
  if (session.gameResults && Array.isArray(session.gameResults) && session.gameResults.length > 0) {
    const firstGame = session.gameResults[0];
    if (firstGame.teams && firstGame.finalStriche) {
      return calculateTournamentPlayerStricheDiff(session, playerId);
    }
  }
  
  const finalStriche = session.finalStriche;
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) {
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
  const myTeamStriche = sumStricheRecord(finalStriche[playerTeam]);
  const opponentTeamStriche = sumStricheRecord(finalStriche[opponentTeam]);
  return myTeamStriche - opponentTeamStriche;
}

function calculateTournamentPlayerStricheDiff(session: SessionEventFallback, playerId: string): number {
  if (!session.gameResults) return 0;
  let totalDiff = 0;
  for (const game of session.gameResults) {
    const playerTeam = findPlayerTeamInGame(game, playerId);
    if (!playerTeam) continue;
    totalDiff += calculateGameStricheDiff(game, playerTeam);
  }
  return totalDiff;
}

function findPlayerTeamInGame(game: any, playerId: string): 'top' | 'bottom' | null {
  if (game.teams?.top?.players) {
    const inTop = game.teams.top.players.some((p: any) => p.playerId === playerId);
    if (inTop) return 'top';
  }
  if (game.teams?.bottom?.players) {
    const inBottom = game.teams.bottom.players.some((p: any) => p.playerId === playerId);
    if (inBottom) return 'bottom';
  }
  return null;
}

function calculateGameStricheDiff(game: any, playerTeam: 'top' | 'bottom'): number {
  const finalStriche = game.finalStriche;
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) return 0;
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  const myTeamStriche = sumStricheRecord(finalStriche[playerTeam]);
  const opponentTeamStriche = sumStricheRecord(finalStriche[opponentTeam]);
  return myTeamStriche - opponentTeamStriche;
}
