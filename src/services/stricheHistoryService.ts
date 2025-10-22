import { db } from '@/services/firebaseInit';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { CHART_COLOR_PALETTE, getChartColorForIndex } from '@/config/chartColors';

/**
 * 📊 STRICHDIFFERENZ-VERLAUF SERVICE
 * 
 * Lädt die kumulative Strichdifferenz-Historie für alle Spieler einer Gruppe
 * aus Sessions und Turnieren (jassGameSummaries).
 * 
 * ✅ ANFORDERUNGEN:
 * - Sessions + Turniere laden
 * - Kumulative Strichdifferenz berechnen (gemachte - erhaltene Striche)
 * - Nur Spieler mit ≥2 Sessions
 * - Zentrale Farbpalette (chartColors.ts)
 * - Sortierung nach aktueller Strichdifferenz
 */

interface SessionEvent {
  createdAt: Date;
  sessionId: string;
  tournamentId?: string;
  finalStriche?: { // Optional, da Turnier-Sessions dies auf Game-Ebene haben können
    top: any;
    bottom: any;
  };
  teams?: { // Optional, da Turnier-Sessions dies auf Game-Ebene haben können
    top: { players: Array<{ playerId: string; displayName: string }> };
    bottom: { players: Array<{ playerId: string; displayName: string }> };
  };
  participantPlayerIds: string[];
  gameResults?: Array<{ // Für Turnier-Sessions
    finalStriche: {
      top: any;
      bottom: any;
    };
    teams: {
      top: { players: Array<{ playerId: string; displayName: string }> };
      bottom: { players: Array<{ playerId: string; displayName: string }> };
    };
    // Weitere Game-spezifische Felder
  }>;
}

interface PlayerHistoryData {
  displayName: string;
  currentStricheDiff: number;
  history: Map<string, number>; // dateKey -> kumulative Strichdifferenz
  sessionCount: number;
}

// 🎨 Farbpalette ist jetzt zentral in @/config/chartColors.ts definiert

/**
 * 📊 Hilfsfunktion: Summiere alle Striche eines Spielers
 */
function sumPlayerStriche(stricheData: any): number {
  if (!stricheData) return 0;
  if (typeof stricheData === 'number') return stricheData;
  
  // Summiere: berg + sieg + matsch + schneider + kontermatsch
  return (stricheData.berg || 0) + 
         (stricheData.sieg || 0) + 
         (stricheData.matsch || 0) + 
         (stricheData.schneider || 0) + 
         (stricheData.kontermatsch || 0);
}

/**
 * 📊 Berechne Strichdifferenz für einen Spieler in einer Session
 * 
 * WICHTIG: Die Strichdifferenz ist die **Team-Differenz**, nicht die individuelle!
 * Alle Spieler im gleichen Team haben die gleiche Strichdifferenz.
 * 
 * Die Struktur von finalStriche ist:
 * {
 *   top: { berg: N, sieg: N, matsch: N, schneider: N, kontermatsch: N },
 *   bottom: { berg: N, sieg: N, matsch: N, schneider: N, kontermatsch: N }
 * }
 * → AGGREGIERT PRO TEAM, NICHT PRO SPIELER!
 */
function calculatePlayerStricheDiff(session: SessionEvent, playerId: string): number {
  // 🎯 NEU: Verwende gameResults wenn vollständig vorhanden
  if (session.gameResults && Array.isArray(session.gameResults) && session.gameResults.length > 0) {
    const firstGame = session.gameResults[0];
    if (firstGame.teams && firstGame.finalStriche) {
      return calculateTournamentPlayerStricheDiff(session, playerId);
    }
  }
  
  // 🎯 FALLBACK: Session-Level Daten für Legacy-Sessions
  const finalStriche = session.finalStriche;
  
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) {
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
  
  // Berechne TEAM-Striche (direkt aggregiert)
  const myTeamStriche = sumPlayerStriche(finalStriche[playerTeam]);
  const opponentTeamStriche = sumPlayerStriche(finalStriche[opponentTeam]);
  
  // Team-Differenz: Mein Team - Gegner Team
  return myTeamStriche - opponentTeamStriche;
}

// 🆕 NEU: Berechnung für Turnier-Sessions mit gameResults
function calculateTournamentPlayerStricheDiff(session: SessionEvent, playerId: string): number {
  let totalDiff = 0;
  
  for (const game of session.gameResults) {
    // Finde das Team des Spielers in diesem Spiel
    const playerTeam = findPlayerTeamInGame(game, playerId);
    if (!playerTeam) {
      continue; // Spieler nicht in diesem Spiel
    }
    
    // Berechne Strichdifferenz für dieses Spiel
    const gameDiff = calculateGameStricheDiff(game, playerTeam);
    totalDiff += gameDiff;
  }
  
  return totalDiff;
}

// 🆕 Hilfsfunktion: Finde das Team eines Spielers in einem Spiel
function findPlayerTeamInGame(game: any, playerId: string): 'top' | 'bottom' | null {
  if (game.teams?.top?.players) {
    const inTopTeam = game.teams.top.players.some((p: any) => p.playerId === playerId);
    if (inTopTeam) return 'top';
  }
  
  if (game.teams?.bottom?.players) {
    const inBottomTeam = game.teams.bottom.players.some((p: any) => p.playerId === playerId);
    if (inBottomTeam) return 'bottom';
  }
  
  return null;
}

// 🆕 Hilfsfunktion: Berechne Strichdifferenz für ein einzelnes Spiel
function calculateGameStricheDiff(game: any, playerTeam: 'top' | 'bottom'): number {
  const finalStriche = game.finalStriche;
  
  if (!finalStriche || !finalStriche.top || !finalStriche.bottom) {
    return 0;
  }
  
  const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
  
  const myTeamStriche = sumPlayerStriche(finalStriche[playerTeam]);
  const opponentTeamStriche = sumPlayerStriche(finalStriche[opponentTeam]);
  
  return myTeamStriche - opponentTeamStriche;
}

/**
 * 📊 Hauptfunktion: Lade Strichdifferenz-Zeitreihe für Gruppe
 */
export async function getGroupStricheTimeSeries(
  groupId: string,
  groupTheme: string = 'yellow'
): Promise<{
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    playerId: string;
    displayName: string;
  }[];
}> {
  try {
    
    const allEvents: SessionEvent[] = [];
    
    // 🎯 SCHRITT 1: Lade alle Sessions (mit orderBy für Performance!)
    const sessionsRef = collection(db, `groups/${groupId}/jassGameSummaries`);
    const sessionsQuery = query(sessionsRef, orderBy('createdAt', 'asc'));
    const sessionsSnap = await getDocs(sessionsQuery);
    
    sessionsSnap.forEach(doc => {
      const data = doc.data();
      if (data.createdAt) { // Now assumes createdAt is always present
        // 🔧 DATUM-KONVERTIERUNG (jetzt immer vorhanden!)
        let createdAt: Date;
        if (data.createdAt instanceof Date) {
          createdAt = data.createdAt;
        } else if (typeof data.createdAt.toDate === 'function') {
          createdAt = data.createdAt.toDate();
        } else if (typeof data.createdAt === 'number') {
          createdAt = new Date(data.createdAt);
        } else if (data.createdAt && typeof data.createdAt.seconds === 'number') {
          createdAt = new Date(data.createdAt.seconds * 1000);
        } else {
          console.warn(`[StricheHistory] Session ${doc.id} hat unbekanntes createdAt Format:`, data.createdAt);
          return;
        }
        
        // 🎯 NEU: Vereinfachte Session-Klassifizierung
        if (data.gameResults && Array.isArray(data.gameResults) && data.gameResults.length > 0) {
          const firstGame = data.gameResults[0];
          if (firstGame.teams && firstGame.finalStriche) {
            // 🏆 VOLLSTÄNDIGE SESSION: Verwende gameResults
            allEvents.push({
              createdAt: createdAt,
              sessionId: doc.id,
              tournamentId: data.tournamentId,
              gameResults: data.gameResults,
              participantPlayerIds: data.participantPlayerIds || []
            });
          } else if (data.finalStriche) {
            // 🎮 LEGACY-SESSION: Verwende Session-Level Daten
            allEvents.push({
              createdAt: createdAt,
              sessionId: doc.id,
              tournamentId: data.tournamentId,
              finalStriche: data.finalStriche,
              teams: data.teams,
              participantPlayerIds: data.participantPlayerIds || []
            });
          }
        } else if (data.finalStriche) {
          // 🎮 LEGACY-SESSION: Verwende Session-Level Daten
          allEvents.push({
            createdAt: createdAt,
            sessionId: doc.id,
            finalStriche: data.finalStriche,
            teams: data.teams,
            participantPlayerIds: data.participantPlayerIds || []
          });
        }
      }
    });

    
    // 🎯 SCHRITT 2: Lade Turnier-Sessions direkt aus jassGameSummaries
    // Turnier-Sessions haben gameResults statt finalStriche
    
    
    if (allEvents.length === 0) {
      return { labels: [], datasets: [] };
    }
    
    // 🎯 SCHRITT 3: Sortiere alle Events chronologisch
    allEvents.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // 🎯 SCHRITT 4: Sammle Spieler-Namen (hole aus members)
    const membersRef = collection(db, `groups/${groupId}/members`);
    const membersSnap = await getDocs(membersRef);
    const playerNames = new Map<string, string>();
    
    membersSnap.forEach(doc => {
      const data = doc.data();
      playerNames.set(doc.id, data.displayName || `Spieler_${doc.id.slice(0, 6)}`);
    });
    
    // 🎯 SCHRITT 5: Berechne kumulative Strichdifferenz pro Spieler
    const playerHistories = new Map<string, PlayerHistoryData>();

    for (const event of allEvents) {
      const dateKey = event.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Verarbeite jeden Spieler in diesem Event
      for (const playerId of event.participantPlayerIds) {
        // Initialisiere Spieler falls nötig
        if (!playerHistories.has(playerId)) {
          playerHistories.set(playerId, {
            displayName: playerNames.get(playerId) || `Spieler_${playerId.slice(0, 6)}`,
            currentStricheDiff: 0,
            history: new Map(),
            sessionCount: 0
          });
        }
        
        const playerData = playerHistories.get(playerId)!;
        
        // Berechne Strichdifferenz für diese Session
        const sessionDiff = calculatePlayerStricheDiff(event, playerId);
        
        // Addiere zur kumulativen Strichdifferenz
        playerData.currentStricheDiff += sessionDiff;
        playerData.sessionCount++;
        
        // Speichere kumulative Strichdifferenz
        playerData.history.set(dateKey, playerData.currentStricheDiff);
      }
    }
    
    // 🎯 SCHRITT 6: Filtere Spieler mit ≥2 Sessions
    const eligiblePlayers = Array.from(playerHistories.entries())
      .filter(([_, data]) => data.sessionCount >= 2 && data.history.size > 1)
      .sort((a, b) => b[1].currentStricheDiff - a[1].currentStricheDiff); // Sortiere nach Strichdifferenz
    
    
    if (eligiblePlayers.length === 0) {
      return { labels: [], datasets: [] };
    }

    // 🎯 SCHRITT 7: Erstelle einheitliche Timeline (alle Sessions)
    const allDatesSet = new Set<string>();
    allEvents.forEach(event => {
      const dateKey = event.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      allDatesSet.add(dateKey);
    });
    const sortedDates = Array.from(allDatesSet).sort();
    
    // 🎯 SCHRITT 8: Erstelle Chart-Datasets (wie Elo-Chart)
    const     datasets: any[] = [];
    
    eligiblePlayers.forEach(([playerId, playerData], index) => {
      const colors = getChartColorForIndex(index);
      
      // Erstelle Datenpunkte mit null für Nicht-Teilnahme (exakt wie Elo-Chart)
      const dataPoints: (number | null)[] = [];
      
      for (const dateKey of sortedDates) {
        if (playerData.history.has(dateKey)) {
          // Spieler hat an dieser Session teilgenommen
          dataPoints.push(playerData.history.get(dateKey)!);
        } else {
          // Spieler hat nicht teilgenommen → null (Lücke im Chart)
          dataPoints.push(null);
        }
      }
      
      datasets.push({
        label: playerData.displayName,
        data: dataPoints,
        borderColor: colors.border,
        backgroundColor: colors.background,
        playerId: playerId,
        displayName: playerData.displayName,
        spanGaps: true, // Wie Elo-Chart: Verbinde über null-Werte
        // ✅ Chart-Parameter werden jetzt zentral in PowerRatingChart.tsx definiert!
      });
    });
    
    // 🎯 SCHRITT 9: Formatiere Labels (DD.MM.YY)
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
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
    console.error(`[StricheHistory] Fehler beim Laden der Strichdifferenz-Zeitreihe für Gruppe ${groupId}:`, error);
    return { labels: [], datasets: [] };
  }
}

