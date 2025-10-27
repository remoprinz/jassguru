import { db } from '@/services/firebaseInit';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

/**
 * 🌍 GLOBALE WEIS-DIFFERENZ ZEITREIHE - Über alle Gruppen & Turniere hinweg
 * Quelle: groups/{groupId}/jassGameSummaries.sessionTotalWeisPoints
 * BESONDERHEIT: Berechnet auf SESSION-Level (nicht Game-Level)
 */
export async function getGlobalPlayerWeisTimeSeries(
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
    // 📊 Neue Struktur: Lade alle jassGameSummaries für diesen Spieler
    const playerDoc = await getDoc(doc(db, 'players', playerId));
    const playerData = playerDoc.data();
    const groupIds = playerData?.groupIds || [];
    
    if (groupIds.length === 0) {
      console.warn(`[getGlobalPlayerWeisTimeSeries] Keine Gruppen für ${playerId}`);
      return {
        labels: [],
        datasets: []
      };
    }
    
    // Sammle alle Sessions aus allen Gruppen
    const allSessions: any[] = [];
    
    for (const groupId of groupIds) {
      const sessionsQuery = query(
        collection(db, `groups/${groupId}/jassGameSummaries`),
        where('participantPlayerIds', 'array-contains', playerId),
        where('status', '==', 'completed')
      );
      
      const sessionsSnapshot = await getDocs(sessionsQuery);
      
      sessionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        allSessions.push({
          ...data,
          groupId,
          sessionId: doc.id
        });
      });
    }
    
    if (allSessions.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    // Sortiere nach completedAt
    allSessions.sort((a, b) => {
      const dateA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
      const dateB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Begrenze auf die neuesten Einträge
    const limitedSessions = allSessions.slice(-limitCount);
    
    // Berechne WeisDifference pro Session
    const weisDiffData: number[] = [];
    const filteredLabels: string[] = [];
    let cumulativeWeisDiff = 0;
    
    limitedSessions.forEach(session => {
      let sessionWeisDiff = 0;
      
      // ✅ UNTERSCHEIDUNG: Regular Sessions vs Tournaments
      if (session.tournamentId || session.isTournamentSession) {
        // Tournament: Verwende sessionTotalWeisPoints (bereits aggregiert!)
        const sessionTotalWeisPoints = session.sessionTotalWeisPoints || { top: 0, bottom: 0 };
        const teams = session.teams || {};
        const topPlayers = teams.top?.players || [];
        const bottomPlayers = teams.bottom?.players || [];
        
        const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
        const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
        
        if (!isTopPlayer && !isBottomPlayer) {
          weisDiffData.push(cumulativeWeisDiff);
          filteredLabels.push(session.completedAt?.toDate ? 
            session.completedAt.toDate().toLocaleDateString('de-DE') : 
            'Unbekannt'
          );
          return;
        }
        
        const teamKey = isTopPlayer ? 'top' : 'bottom';
        const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
        const playerWeis = sessionTotalWeisPoints[teamKey] || 0;
        const opponentWeis = sessionTotalWeisPoints[opponentTeamKey] || 0;
        sessionWeisDiff = playerWeis - opponentWeis;
      } else {
        // Regular Session: Verwende sessionTotalWeisPoints
        const sessionTotalWeisPoints = session.sessionTotalWeisPoints || { top: 0, bottom: 0 };
        const teams = session.teams || {};
        const topPlayers = teams.top?.players || [];
        const bottomPlayers = teams.bottom?.players || [];
        
        const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
        const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
        
        if (!isTopPlayer && !isBottomPlayer) {
          // Spieler nicht in dieser Session
          weisDiffData.push(cumulativeWeisDiff);
          filteredLabels.push(session.completedAt?.toDate ? 
            session.completedAt.toDate().toLocaleDateString('de-DE') : 
            'Unbekannt'
          );
          return;
        }
        
        // Berechne WeisDifference für diese Session
        const teamKey = isTopPlayer ? 'top' : 'bottom';
        const opponentTeamKey = isTopPlayer ? 'bottom' : 'top';
        const playerWeis = sessionTotalWeisPoints[teamKey] || 0;
        const opponentWeis = sessionTotalWeisPoints[opponentTeamKey] || 0;
        sessionWeisDiff = playerWeis - opponentWeis;
      }
      
      cumulativeWeisDiff += sessionWeisDiff;
      weisDiffData.push(cumulativeWeisDiff);
      filteredLabels.push(session.completedAt?.toDate ? 
        session.completedAt.toDate().toLocaleDateString('de-DE') : 
        'Unbekannt'
      );
    });

    // Theme-Farben (identisch mit PowerRatingChart)
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

    const colors = themeColors[profileTheme as keyof typeof themeColors] || themeColors.blue;

    return {
      labels: filteredLabels,
      datasets: [{
        label: 'Weisdifferenz',
        data: weisDiffData,
        borderColor: colors.border,
        backgroundColor: colors.background
      } as any]
    };

  } catch (error) {
    console.error('[getGlobalPlayerWeisTimeSeries] Fehler:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}
