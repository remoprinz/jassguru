import { db } from '@/services/firebaseInit';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

/**
 * 🎯 PLAYER SCORES SERVICE
 * 
 * Zentrale Verwaltung aller Spieler-Metriken (außer Elo-Rating):
 * - Individuelle Statistiken (Striche, Punkte, Wins, Losses)
 * - Partner-Statistiken (alle Metriken pro Partner)
 * - Gegner-Statistiken (alle Metriken pro Gegner)
 * 
 * Architektur analog zu jassElo.ts:
 * - currentScores: Aktuelle Werte (wie globalRating)
 * - scoresHistory: Zeitreihen (wie ratingHistory)
 */

// ===== TYPES =====

export interface IndividualScores {
  // ✅ KERN-METRIKEN
  stricheDiff: number;
  pointsDiff: number;
  wins: number;
  losses: number;
  sessionsDraw: number;        // 🆕 NEU: Unentschieden
  gamesPlayed: number;
  sessionsPlayed: number;
  sessionsWon: number;
  sessionsLost: number;
  
  // ✅ WEIS-METRIKEN
  totalWeisPoints: number;
  totalWeisReceived: number;
  weisDifference: number;
  
  // ✅ EVENT-METRIKEN
  matschEvents: number;        // 🆕 NEU: Gesamt-Matsch-Events
  schneiderEvents: number;     // 🆕 NEU: Gesamt-Schneider-Events
  kontermatschEvents: number;  // 🆕 NEU: Gesamt-Kontermatsch-Events
  
  // ✅ QUOTEN (gewichtet)
  sessionWinRate: number;      // Gleitender Durchschnitt
  gameWinRate: number;         // Gleitender Durchschnitt
  weisAverage: number;         // Gleitender Durchschnitt
}

export interface PartnerStats {
  partnerId: string;
  partnerDisplayName: string;
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  sessionsLostWith: number;
  sessionsDrawWith: number;        // 🆕 NEU: Unentschieden mit Partner
  gamesPlayedWith: number;
  gamesWonWith: number;
  gamesLostWith: number;
  gamesDrawWith: number;           // 🆕 NEU: Unentschieden-Spiele mit Partner
  totalStricheDifferenceWith: number;
  totalPointsDifferenceWith: number;
  
  // ✅ WEIS-METRIKEN mit Partner
  totalWeisPointsWith: number;
  totalWeisReceivedWith: number;
  weisDifferenceWith: number;
  
  // ✅ EVENT-METRIKEN mit Partner
  matschEventsMadeWith: number;
  matschEventsReceivedWith: number;
  matschBilanz: number;
  schneiderEventsMadeWith: number;
  schneiderEventsReceivedWith: number;
  schneiderBilanz: number;
  kontermatschEventsMadeWith: number;
  kontermatschEventsReceivedWith: number;
  kontermatschBilanz: number;
  
  // ✅ QUOTEN mit Partner
  sessionWinRateWith: number;
  gameWinRateWith: number;
}

export interface OpponentStats {
  opponentId: string;
  opponentDisplayName: string;
  sessionsPlayedAgainst: number;
  sessionsWonAgainst: number;
  sessionsLostAgainst: number;
  sessionsDrawAgainst: number;     // 🆕 NEU: Unentschieden gegen Gegner
  gamesPlayedAgainst: number;
  gamesWonAgainst: number;
  gamesLostAgainst: number;
  gamesDrawAgainst: number;        // 🆕 NEU: Unentschieden-Spiele gegen Gegner
  totalStricheDifferenceAgainst: number;
  totalPointsDifferenceAgainst: number;
  
  // ✅ WEIS-METRIKEN gegen Gegner
  totalWeisPointsAgainst: number;
  totalWeisReceivedAgainst: number;
  weisDifferenceAgainst: number;
  
  // ✅ EVENT-METRIKEN gegen Gegner
  matschEventsMadeAgainst: number;
  matschEventsReceivedAgainst: number;
  matschBilanz: number;
  schneiderEventsMadeAgainst: number;
  schneiderEventsReceivedAgainst: number;
  schneiderBilanz: number;
  kontermatschEventsMadeAgainst: number;
  kontermatschEventsReceivedAgainst: number;
  kontermatschBilanz: number;
  
  // ✅ QUOTEN gegen Gegner
  sessionWinRateAgainst: number;
  gameWinRateAgainst: number;
}

export interface PlayerScores {
  playerId: string;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: IndividualScores;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: IndividualScores;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: IndividualScores;
  };
  
  // 👥 PARTNER/GEGNER (bleibt unverändert)
  partners: PartnerStats[];
  opponents: OpponentStats[];
  
  lastUpdated: Date;
}

export interface PlayerScoresHistoryEntry {
  timestamp: Date;
  
  // 🌍 GLOBAL (über alle Gruppen/Turniere)
  global: IndividualScores;
  
  // 🏠 GRUPPEN-SPEZIFISCH
  groups: {
    [groupId: string]: IndividualScores;
  };
  
  // 🏆 TURNIER-SPEZIFISCH  
  tournaments: {
    [tournamentId: string]: IndividualScores;
  };
  
  // 👥 PARTNER/GEGNER
  partners: PartnerStats[];
  opponents: OpponentStats[];
  
  eventType: 'session_end' | 'tournament_end' | 'manual_recalc';
}

// ===== SERVICE FUNCTIONS =====

/**
 * 🎯 Lade aktuelle Player Scores für mehrere Spieler
 * Analog zu loadPlayerRatings() aus jassElo.ts
 */
export async function loadPlayerScores(playerIds: string[]): Promise<Map<string, PlayerScores>> {
  const scoresMap = new Map<string, PlayerScores>();
  
  if (playerIds.length === 0) {
    return scoresMap;
  }

  try {
    // Lade currentScores für alle Spieler parallel
    const loadPromises = playerIds.map(async (playerId) => {
      try {
        const scoresDoc = await getDoc(doc(db, 'players', playerId, 'currentScores', 'latest'));
        
        if (scoresDoc.exists()) {
          const data = scoresDoc.data();
          const scores: PlayerScores = {
            playerId,
            global: data.global || getDefaultIndividualScores(),
            groups: data.groups || {},
            tournaments: data.tournaments || {},
            partners: data.partners || [],
            opponents: data.opponents || [],
            lastUpdated: data.lastUpdated?.toDate() || new Date()
          };
          scoresMap.set(playerId, scores);
        } else {
          // Fallback: Erstelle Default-Scores
          scoresMap.set(playerId, {
            playerId,
            global: getDefaultIndividualScores(),
            groups: {},
            tournaments: {},
            partners: [],
            opponents: [],
            lastUpdated: new Date()
          });
        }
      } catch (error) {
        console.warn(`Fehler beim Laden der Scores für Spieler ${playerId}:`, error);
        // Fallback: Erstelle Default-Scores
        scoresMap.set(playerId, {
          playerId,
          global: getDefaultIndividualScores(),
          groups: {},
          tournaments: {},
          partners: [],
          opponents: [],
          lastUpdated: new Date()
        });
      }
    });

    await Promise.all(loadPromises);
    
    console.log(`✅ Player Scores geladen für ${scoresMap.size} Spieler`);
    return scoresMap;
    
  } catch (error) {
    console.error('Fehler beim Laden der Player Scores:', error);
    return scoresMap;
  }
}

/**
 * 🎯 Lade Player Scores Historie für einen Spieler
 * Analog zu getPlayerRatingHistory() aus jassElo.ts
 */
export async function getPlayerScoresHistory(
  playerId: string,
  limitCount: number = 100
): Promise<PlayerScoresHistoryEntry[]> {
  try {
    const historyRef = collection(db, `players/${playerId}/scoresHistory`);
    const historyQuery = query(
      historyRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const historySnap = await getDocs(historyQuery);
    const history: PlayerScoresHistoryEntry[] = [];

    historySnap.docs.forEach(doc => {
      const data = doc.data();
      history.push({
        timestamp: data.timestamp?.toDate() || new Date(),
        global: data.global || getDefaultIndividualScores(),
        groups: data.groups || {},
        tournaments: data.tournaments || {},
        partners: data.partners || [],
        opponents: data.opponents || [],
        eventType: data.eventType || 'session_end'
      });
    });

    console.log(`✅ Player Scores Historie geladen für Spieler ${playerId}: ${history.length} Einträge`);
    return history;
    
  } catch (error) {
    console.error(`Fehler beim Laden der Player Scores Historie für Spieler ${playerId}:`, error);
    return [];
  }
}

/**
 * 🎯 Lade Player Scores Zeitreihe für Charts
 * Analog zu getGlobalPlayerRatingTimeSeries()
 */
export async function getPlayerScoresTimeSeries(
  playerId: string,
  metric: 'stricheDiff' | 'pointsDiff' | 'wins' | 'losses',
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
    const history = await getPlayerScoresHistory(playerId, limitCount);
    
    if (history.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Sortiere chronologisch (älteste zuerst)
    const sortedHistory = history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Extrahiere Metrik-Werte
    const values: number[] = [];
    const labels: string[] = [];
    
    sortedHistory.forEach(entry => {
      let value = 0;
      
      switch (metric) {
        case 'stricheDiff':
          value = entry.global.stricheDiff;
          break;
        case 'pointsDiff':
          value = entry.global.pointsDiff;
          break;
        case 'wins':
          value = entry.global.wins;
          break;
        case 'losses':
          value = entry.global.losses;
          break;
      }
      
      values.push(value);
      labels.push(entry.timestamp.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      }));
    });

    // Theme-Farben
    const themeColors = {
      blue: { border: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)' },
      green: { border: '#10B981', background: 'rgba(16, 185, 129, 0.1)' },
      purple: { border: '#8B5CF6', background: 'rgba(139, 92, 246, 0.1)' },
      orange: { border: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)' },
      red: { border: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' },
      yellow: { border: '#EAB308', background: 'rgba(234, 179, 8, 0.1)' },
      pink: { border: '#EC4899', background: 'rgba(236, 72, 153, 0.1)' },
      teal: { border: '#14B8A6', background: 'rgba(20, 184, 166, 0.1)' },
      cyan: { border: '#06B6D4', background: 'rgba(6, 182, 212, 0.1)' }
    } as const;

    const colors = (themeColors as any)[profileTheme] || themeColors.yellow;

    return {
      labels,
      datasets: [{
        label: getMetricLabel(metric),
        data: values,
        borderColor: colors.border,
        backgroundColor: colors.background
      }]
    };
    
  } catch (error) {
    console.error(`Fehler beim Laden der Player Scores Zeitreihe für Spieler ${playerId}:`, error);
    return { labels: [], datasets: [] };
  }
}

// ===== HELPER FUNCTIONS =====

function getDefaultIndividualScores(): IndividualScores {
  return {
    // ✅ KERN-METRIKEN
    stricheDiff: 0,
    pointsDiff: 0,
    wins: 0,
    losses: 0,
    sessionsDraw: 0,
    gamesPlayed: 0,
    sessionsPlayed: 0,
    sessionsWon: 0,
    sessionsLost: 0,
    
    // ✅ WEIS-METRIKEN
    totalWeisPoints: 0,
    totalWeisReceived: 0,
    weisDifference: 0,
    
    // ✅ EVENT-METRIKEN
    matschEvents: 0,
    schneiderEvents: 0,
    kontermatschEvents: 0,
    
    // ✅ QUOTEN
    sessionWinRate: 0,
    gameWinRate: 0,
    weisAverage: 0
  };
}

function getMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    'stricheDiff': 'Strichdifferenz',
    'pointsDiff': 'Punktdifferenz',
    'wins': 'Siege',
    'losses': 'Niederlagen'
  };
  return labels[metric] || metric;
}

// ===== EXPORTS =====
// Alle Types sind bereits oben exportiert
