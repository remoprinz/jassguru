import { db } from '@/services/firebaseInit';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { CHART_COLOR_PALETTE, getChartColorForIndex } from '@/config/chartColors';

// 🎯 INTERFACE FÜR WIN RATE HISTORIE
interface PlayerWinRateHistory {
  playerId: string;
  playerName: string;
  dataPoints: (number | null)[];
  cumulativeWins: number;
  cumulativeLosses: number;
  totalGames: number;
}

interface SessionEvent {
  id: string;
  createdAt: Date;
  endedAt: Date;
  participantPlayerIds: string[];
  gameWinsByPlayer?: { [playerId: string]: { wins: number; losses: number } };
  gameResults?: Array<{
    gameNumber: number;
    winnerTeam: 'top' | 'bottom';
    topScore: number;
    bottomScore: number;
    teams?: {
      top: { players: { playerId: string; displayName: string; }[] };
      bottom: { players: { playerId: string; displayName: string; }[] };
    };
  }>;
  tournamentId?: string;
}

/**
 * Berechnet die Siegrate eines Spielers für eine Session
 */
function calculatePlayerWinRate(session: SessionEvent, playerId: string): number {
  // ✅ REGULAR SESSION: Verwende Session-Level gameWinsByPlayer
  if (!session.tournamentId && session.gameWinsByPlayer?.[playerId]) {
    const playerStats = session.gameWinsByPlayer[playerId];
    const totalGames = playerStats.wins + playerStats.losses;
    return totalGames > 0 ? (playerStats.wins / totalGames) * 100 : 0;
  }
  
  // ✅ TOURNAMENT: Berechne aus gameResults (Teams wechseln pro Spiel)
  if (session.tournamentId && session.gameResults) {
    let wins = 0;
    let totalGames = 0;
    
    for (const game of session.gameResults) {
      if (game.teams) {
        const topPlayerIds = game.teams.top.players.map(p => p.playerId);
        const bottomPlayerIds = game.teams.bottom.players.map(p => p.playerId);
        
        if (topPlayerIds.includes(playerId) || bottomPlayerIds.includes(playerId)) {
          totalGames++;
          
          if (game.winnerTeam === 'top' && topPlayerIds.includes(playerId)) {
            wins++;
          } else if (game.winnerTeam === 'bottom' && bottomPlayerIds.includes(playerId)) {
            wins++;
          }
        }
      }
    }
    
    return totalGames > 0 ? (wins / totalGames) * 100 : 0;
  }
  
  return 0;
}

/**
 * Holt die Win Rate Zeitreihe für eine Gruppe
 */
export async function getGroupWinRateTimeSeries(groupId: string) {
  try {
    // 🎯 FETCHE SESSIONS: Nur completed Sessions
    const sessionsRef = collection(db, `groups/${groupId}/jassGameSummaries`);
    const sessionsQuery = query(
      sessionsRef,
      where('status', '==', 'completed'),
      orderBy('createdAt', 'asc')
    );
    
    const sessionsSnap = await getDocs(sessionsQuery);
    
    if (sessionsSnap.empty) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    // 🎯 KONVERTIERE SESSIONS: Firestore Timestamp → Date
    const sessions: SessionEvent[] = sessionsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        endedAt: data.endedAt?.toDate ? data.endedAt.toDate() : new Date(data.endedAt),
        participantPlayerIds: data.participantPlayerIds || [],
        gameWinsByPlayer: data.gameWinsByPlayer,
        gameResults: data.gameResults,
        tournamentId: data.tournamentId
      };
    });
    
    // 🎯 FETCHE SPIELERNAMEN: Aus members collection
    const membersRef = collection(db, `groups/${groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    const playerNames = new Map<string, string>();
    
    membersSnap.forEach(doc => {
      const data = doc.data();
      playerNames.set(doc.id, data.displayName || `Spieler_${doc.id.slice(0, 6)}`);
    });
    
    // 🎯 SAMMLE ALLE SPIELER: Die jemals teilgenommen haben
    const allPlayerIds = new Set<string>();
    sessions.forEach(session => {
      session.participantPlayerIds?.forEach(playerId => {
        allPlayerIds.add(playerId);
      });
    });
    
    // 🎯 ERSTELLE SPIELER-HISTORIEN
    const playerHistories: PlayerWinRateHistory[] = Array.from(allPlayerIds).map(playerId => ({
      playerId,
      playerName: playerNames.get(playerId) || `Spieler_${playerId.slice(0, 6)}`,
      dataPoints: [],
      cumulativeWins: 0,
      cumulativeLosses: 0,
      totalGames: 0
    }));
    
    // 🎯 ERSTELLE GLOBALE TIMELINE (IDENTISCH ZU STRICHEHISTORYSERVICE)
    // Sammle alle Session-Daten im YYYY-MM-DD Format für korrekte Sortierung
    const sessionsByDate = new Map<string, SessionEvent>();
    const allDatesSet = new Set<string>();
    
    sessions.forEach(session => {
      const date = session.createdAt;
      // ✅ WICHTIG: YYYY-MM-DD Format für chronologische Sortierung!
      const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      sessionsByDate.set(dateKey, session);
      allDatesSet.add(dateKey);
    });
    
    // Sortiere Daten chronologisch (YYYY-MM-DD sortiert korrekt)
    const sortedDates = Array.from(allDatesSet).sort();
    
    // Berechne Win Rate für jeden Spieler über die globale Timeline
    playerHistories.forEach(playerHistory => {
      let cumulativeWins = 0;
      let cumulativeLosses = 0;
      
      sortedDates.forEach(dateKey => {
        const session = sessionsByDate.get(dateKey);
        if (!session) return;
        
        // Prüfe ob Spieler in dieser Session teilgenommen hat
        const participated = session.participantPlayerIds?.includes(playerHistory.playerId) || false;
        
        if (participated) {
          // Berechne Win Rate für diese Session
          const sessionWinRate = calculatePlayerWinRate(session, playerHistory.playerId);
          
          // Aktualisiere kumulative Statistiken
          if (!session.tournamentId && session.gameWinsByPlayer?.[playerHistory.playerId]) {
            // Regular Session
            const playerStats = session.gameWinsByPlayer[playerHistory.playerId];
            cumulativeWins += playerStats.wins || 0;
            cumulativeLosses += playerStats.losses || 0;
          } else if (session.tournamentId && session.gameResults) {
            // Tournament - berechne Wins/Losses für diese Session
            let sessionWins = 0;
            let sessionLosses = 0;
            
            for (const game of session.gameResults) {
              if (game.teams) {
                const topPlayerIds = game.teams.top.players.map(p => p.playerId);
                const bottomPlayerIds = game.teams.bottom.players.map(p => p.playerId);
                
                if (topPlayerIds.includes(playerHistory.playerId) || bottomPlayerIds.includes(playerHistory.playerId)) {
                  if (game.winnerTeam === 'top' && topPlayerIds.includes(playerHistory.playerId)) {
                    sessionWins++;
                  } else if (game.winnerTeam === 'bottom' && bottomPlayerIds.includes(playerHistory.playerId)) {
                    sessionWins++;
                  } else {
                    sessionLosses++;
                  }
                }
              }
            }
            
            cumulativeWins += sessionWins;
            cumulativeLosses += sessionLosses;
          }
          
          // Berechne kumulative Win Rate
          const totalGames = cumulativeWins + cumulativeLosses;
          const cumulativeWinRate = totalGames > 0 ? (cumulativeWins / totalGames) * 100 : 0;
          
          playerHistory.dataPoints.push(cumulativeWinRate);
        } else {
          // Spieler hat nicht teilgenommen - null für Lücke im Chart
          playerHistory.dataPoints.push(null);
        }
      });
      
      playerHistory.cumulativeWins = cumulativeWins;
      playerHistory.cumulativeLosses = cumulativeLosses;
      playerHistory.totalGames = cumulativeWins + cumulativeLosses;
    });
    
    // 🎯 FILTERE SPIELER: Nur die mit mindestens einem Spiel
    const activePlayers = playerHistories.filter(player => player.totalGames > 0);
    
    // 🎯 SORTIERE SPIELER: Nach finaler Win Rate (absteigend)
    activePlayers.sort((a, b) => {
      const aWinRate = a.totalGames > 0 ? (a.cumulativeWins / a.totalGames) * 100 : 0;
      const bWinRate = b.totalGames > 0 ? (b.cumulativeWins / b.totalGames) * 100 : 0;
      return bWinRate - aWinRate;
    });
    
    // 🎯 ERSTELLE DATASETS: Mit zentralisierten Farben
    const datasets = activePlayers.map((player, index) => {
      const colors = getChartColorForIndex(index); // Use centralized color logic
      
      return {
        label: player.playerName,
        data: player.dataPoints,
        borderColor: colors.border,
        backgroundColor: colors.background,
        spanGaps: true, // Verbinde Punkte über Lücken hinweg
        playerId: player.playerId,
        displayName: player.playerName
        // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
      };
    });
    
    // 🎯 FORMATIERE LABELS: YYYY-MM-DD → DD.MM.YY (IDENTISCH ZU STRICHEHISTORYSERVICE)
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr); // YYYY-MM-DD parst korrekt
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    });
    
    return {
      labels,
      datasets
    };
    
  } catch (error) {
    console.error('Error fetching win rate time series:', error);
    return {
      labels: [],
      datasets: []
    };
  }
}
