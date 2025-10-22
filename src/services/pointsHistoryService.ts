import { db } from '@/services/firebaseInit';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { CHART_COLOR_PALETTE, getChartColorForIndex } from '@/config/chartColors';

// 🎯 IDENTISCH ZU STRICHEHISTORYSERVICE.TS - NUR PUNKTEDIFFERENZ STATT STRICHDIFFERENZ

interface SessionEvent {
  id: string;
  createdAt: Date;
  endedAt?: Date;
  participantPlayerIds: string[];
  teams?: {
    top: { players: { playerId: string; displayName: string; }[] };
    bottom: { players: { playerId: string; displayName: string; }[] };
  };
  finalScores?: {
    top: number;
    bottom: number;
  };
  gameResults?: Array<{
    gameNumber: number;
    topScore: number;
    bottomScore: number;
    winnerTeam: string;
    teams?: {
      top: { players: { playerId: string; displayName: string; }[] };
      bottom: { players: { playerId: string; displayName: string; }[] };
    };
  }>;
  tournamentId?: string;
}

interface PlayerPointsHistory {
  playerId: string;
  playerName: string;
  dataPoints: (number | null)[];
  cumulativePoints: number;
}

interface PointsTimeSeriesData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: (number | null)[];
    borderColor: string;
    backgroundColor: string;
    spanGaps: boolean;
    // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
  }>;
}

/**
 * 📊 Berechne Punktedifferenz für einen Spieler in einer Session
 * 
 * WICHTIG: Die Punktedifferenz ist die **Team-Differenz**, nicht die individuelle!
 * Alle Spieler im gleichen Team haben die gleiche Punktedifferenz.
 * 
 * Die Struktur von finalScores ist:
 * {
 *   top: number,
 *   bottom: number
 * }
 * → AGGREGIERT PRO TEAM, NICHT PRO SPIELER!
 */
function calculatePlayerPointsDiff(session: SessionEvent, playerId: string): number {
  // 🎯 NEU: Verwende gameResults wenn vollständig vorhanden
  if (session.gameResults && Array.isArray(session.gameResults) && session.gameResults.length > 0) {
    const firstGame = session.gameResults[0];
    if (firstGame.teams) {
      return calculateTournamentPlayerPointsDiff(session, playerId);
    }
  }
  
  // 🎯 FALLBACK: Session-Level Daten für Legacy-Sessions
  const finalScores = session.finalScores;
  
  if (!finalScores || typeof finalScores.top !== 'number' || typeof finalScores.bottom !== 'number') {
    return 0;
  }
  
  // Finde das Team des Spielers aus der teams-Struktur
  let playerTeam: 'top' | 'bottom' | null = null;
  
  if (session.teams) {
    // Check top team
    if (session.teams.top && session.teams.top.players) {
      const inTopTeam = session.teams.top.players.some(p => p.playerId === playerId);
      if (inTopTeam) playerTeam = 'top';
    }
    // Check bottom team
    if (!playerTeam && session.teams.bottom && session.teams.bottom.players) {
      const inBottomTeam = session.teams.bottom.players.some(p => p.playerId === playerId);
      if (inBottomTeam) playerTeam = 'bottom';
    }
  }
  
  if (!playerTeam) {
    return 0; // Spieler nicht in dieser Session
  }
  
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  // Berechne TEAM-Punkte (direkt aggregiert)
  const myTeamPoints = finalScores[playerTeam];
  const opponentTeamPoints = finalScores[opponentTeam];
  
  // Team-Differenz: Mein Team - Gegner Team
  return myTeamPoints - opponentTeamPoints;
}

// 🆕 NEU: Berechnung für Turnier-Sessions mit gameResults
function calculateTournamentPlayerPointsDiff(session: SessionEvent, playerId: string): number {
  if (!session.gameResults || !Array.isArray(session.gameResults)) {
    return 0;
  }
  
  let totalPointsDiff = 0;
  
  for (const game of session.gameResults) {
    if (!game.teams) continue;
    
    // Finde das Team des Spielers in diesem Spiel
    let playerTeam: 'top' | 'bottom' | null = null;
    
    if (game.teams.top && game.teams.top.players) {
      const inTopTeam = game.teams.top.players.some(p => p.playerId === playerId);
      if (inTopTeam) playerTeam = 'top';
    }
    
    if (!playerTeam && game.teams.bottom && game.teams.bottom.players) {
      const inBottomTeam = game.teams.bottom.players.some(p => p.playerId === playerId);
      if (inBottomTeam) playerTeam = 'bottom';
    }
    
    if (!playerTeam) continue; // Spieler nicht in diesem Spiel
    
    const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
    
    // Berechne Punkte-Differenz für dieses Spiel
    const myTeamPoints = playerTeam === 'top' ? game.topScore : game.bottomScore;
    const opponentTeamPoints = opponentTeam === 'top' ? game.topScore : game.bottomScore;
    
    totalPointsDiff += (myTeamPoints - opponentTeamPoints);
  }
  
  return totalPointsDiff;
}

/**
 * 🎯 Hauptfunktion: Lade Punktedifferenz-Verlauf für alle Spieler einer Gruppe
 */
export async function getGroupPointsTimeSeries(
  groupId: string, 
  theme: string = 'yellow'
): Promise<PointsTimeSeriesData | null> {
  try {
    // Lade alle Sessions der Gruppe
    const sessionsRef = collection(db, `groups/${groupId}/jassGameSummaries`);
    const sessionsQuery = query(
      sessionsRef,
      where('status', '==', 'completed'),
      orderBy('createdAt', 'asc')
    );
    
    const sessionsSnap = await getDocs(sessionsQuery);
    
    if (sessionsSnap.empty) {
      return null;
    }
    
    const sessions: SessionEvent[] = sessionsSnap.docs.map(doc => {
      const data = doc.data();
      // 🔧 DATUM-KONVERTIERUNG (robust wie in stricheHistoryService)
      let createdAt: Date;
      if (data.createdAt instanceof Date) {
        createdAt = data.createdAt;
      } else if (typeof data.createdAt?.toDate === 'function') {
        createdAt = data.createdAt.toDate();
      } else if (typeof data.createdAt === 'number') {
        createdAt = new Date(data.createdAt);
      } else if (data.createdAt && typeof data.createdAt.seconds === 'number') {
        createdAt = new Date(data.createdAt.seconds * 1000);
      } else {
        console.warn(`[PointsHistory] Session ${doc.id} hat unbekanntes createdAt Format:`, data.createdAt);
        createdAt = new Date(); // Fallback
      }
      
      return {
        ...data,
        id: doc.id,
        createdAt  // ← Überschreibt data.createdAt mit unserem Date-Objekt
      } as SessionEvent;
    });
    
    // Sammle alle einzigartigen Spieler-IDs
    const allPlayerIds = new Set<string>();
    sessions.forEach(session => {
      if (session.participantPlayerIds) {
        session.participantPlayerIds.forEach(playerId => allPlayerIds.add(playerId));
      }
    });
    
    if (allPlayerIds.size === 0) {
      return null;
    }
    
    // 🎯 SCHRITT 3: Sammle Spieler-Namen (hole aus members) - IDENTISCH ZU STRICHEHISTORYSERVICE
    const membersRef = collection(db, `groups/${groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    const playerNames = new Map<string, string>();
    
    membersSnap.forEach(doc => {
      const data = doc.data();
      playerNames.set(doc.id, data.displayName || `Spieler_${doc.id.slice(0, 6)}`);
    });
    
    // Erstelle Spieler-Historie mit echten Namen
    const playerHistories: PlayerPointsHistory[] = Array.from(allPlayerIds).map(playerId => ({
      playerId,
      playerName: playerNames.get(playerId) || `Spieler_${playerId.slice(0, 6)}`, // Echte Namen!
      dataPoints: [],
      cumulativePoints: 0
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
    
    // Berechne Punktedifferenz für jeden Spieler über die globale Timeline
    playerHistories.forEach(playerHistory => {
      let cumulativePoints = 0;
      
      sortedDates.forEach(dateKey => {
        const session = sessionsByDate.get(dateKey);
        if (!session) return;
        
        // Prüfe ob Spieler in dieser Session teilgenommen hat
        const participated = session.participantPlayerIds?.includes(playerHistory.playerId) || false;
        
        if (participated) {
          const sessionPointsDiff = calculatePlayerPointsDiff(session, playerHistory.playerId);
          cumulativePoints += sessionPointsDiff;
          playerHistory.dataPoints.push(cumulativePoints);
        } else {
          // Spieler hat nicht teilgenommen - null für Lücke im Chart
          playerHistory.dataPoints.push(null);
        }
      });
      
      playerHistory.cumulativePoints = cumulativePoints;
    });
    
    // Filtere Spieler mit mindestens 2 Sessions heraus
    const activePlayers = playerHistories.filter(player => {
      const participationCount = player.dataPoints.filter(point => point !== null).length;
      return participationCount >= 2;
    });
    
    if (activePlayers.length === 0) {
      return null;
    }
    
    // Sortiere Spieler nach kumulativer Punktedifferenz (absteigend)
    activePlayers.sort((a, b) => b.cumulativePoints - a.cumulativePoints);
    
    // 🎯 ERSTELLE CHART-DATASETS - ZENTRALE FARBPALETTE
    const datasets = activePlayers.map((player, index) => {
      const colors = getChartColorForIndex(index);
      
      return {
        label: player.playerName,
        data: player.dataPoints,
        borderColor: colors.border,
        backgroundColor: colors.background,
        spanGaps: true, // Verbinde Punkte über Lücken hinweg
        // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
      };
    });
    
    // 🎯 FORMATIERE LABELS: YYYY-MM-DD → DD.MM.YY (IDENTISCH ZU STRICHEHISTORYSERVICE)
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr); // YYYY-MM-DD kann korrekt geparst werden
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
    console.error('Fehler beim Laden der Punktedifferenz-Chart-Daten:', error);
    return null;
  }
}

// 🗑️ GELÖSCHT: getThemeColors wird nicht mehr benötigt - wir verwenden COLOR_PALETTE
