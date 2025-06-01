import { db, firebaseApp } from '@/services/firebaseInit';
import { collection, query, where, getDocs, orderBy, Timestamp, getFirestore } from 'firebase/firestore';
import type { StricheRecord, CompletedGameSummary, FirestoreGroup, PlayerId, PlayerNames, SessionSummary as GlobalSessionSummary, PlayerNumber } from '@/types/jass';
import { formatDuration } from '@/utils/timeUtils';
import { getOrtNameByPlz } from '@/utils/locationUtils';
import { DEFAULT_STROKE_SETTINGS } from '@/config/ScoreSettings'; // Importiere die Standard-Konfiguration
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings'; // Importiere die Standard-Konfiguration

// Füge diese Hilfsfunktion am Anfang der Datei nach den Imports hinzu
// Diese Funktion kann verschiedene Timestamp-Formate in ein Date-Objekt konvertieren
function getDateFromTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  // Fall 1: Es ist bereits ein Date-Objekt
  if (timestamp instanceof Date) return timestamp;
  
  // Fall 2: Firebase Timestamp-Objekt mit toDate()-Methode
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // Fall 3: Serialisiertes Timestamp-Objekt mit seconds/nanoseconds
  if (timestamp.seconds !== undefined && (timestamp.nanoseconds !== undefined || timestamp._nanoseconds !== undefined)) {
    const nanos = timestamp.nanoseconds !== undefined ? timestamp.nanoseconds : timestamp._nanoseconds;
    return new Date((timestamp.seconds || timestamp._seconds) * 1000 + nanos / 1000000);
  }
  
  // Fall 4: Timestamp als Zahl (Millisekunden seit Epoch)
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  
  // Fall 5: ISO-String
  if (typeof timestamp === 'string') {
    try {
      return new Date(timestamp);
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

// Hilfsfunktion zur Umrechnung von Millisekunden in lesbare Zeit
export function formatDurationForStats(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  
  return `${seconds}s`;
}

/**
 * Extrahiert Weispunkte für eine gegebene Teamposition aus einem Spiel.
 * Priorität: 
 * 1. Positive game.weisPoints
 * 2. Positive _savedWeisPoints aus der ersten Runde
 * 3. Summe aller weisAction-Punkte aus der roundHistory
 * Der höchste Wert aus diesen Quellen wird zurückgegeben.
 */
function extractWeisPointsFromGameData(teamPosition: 'top' | 'bottom', game: CompletedGameSummary): number {
  // Initialwerte
  let weisFromGameObject = 0;
  let weisFromSavedPoints = 0;
  let weisFromActions = 0;
  
  // 1. Versuche game.weisPoints direkt zu verwenden
  if (game.weisPoints) {
    // Konvertiere zu Zahl falls es ein String ist
    if (typeof game.weisPoints[teamPosition] === 'number') {
      weisFromGameObject = game.weisPoints[teamPosition];
    } else if (typeof game.weisPoints[teamPosition] === 'string') {
      // Konvertiere String zu Zahl
      const parsed = parseInt(game.weisPoints[teamPosition] as string, 10);
      if (!isNaN(parsed)) {
        weisFromGameObject = parsed;
      }
    }
  }
  
  // 2. Versuche _savedWeisPoints aus der ersten Runde zu extrahieren
  if (game.roundHistory && game.roundHistory.length > 0) {
    const firstRound = game.roundHistory[0] as unknown as Record<string, unknown>;
    if (firstRound._savedWeisPoints && typeof firstRound._savedWeisPoints === 'object') {
      const savedWeis = firstRound._savedWeisPoints as Record<string, unknown>;
      if (savedWeis[teamPosition] && typeof savedWeis[teamPosition] === 'number') {
        weisFromSavedPoints = savedWeis[teamPosition] as number;
      } else if (savedWeis[teamPosition] && typeof savedWeis[teamPosition] === 'string') {
        // Konvertiere String zu Zahl
        const parsed = parseInt(savedWeis[teamPosition] as string, 10);
        if (!isNaN(parsed)) {
          weisFromSavedPoints = parsed;
        }
      }
    }
  }
  
  // 3. Berechne die Summe aller weisActions in der roundHistory
  if (game.roundHistory && game.roundHistory.length > 0) {
    let roundWeisSum = 0;
    for (const round of game.roundHistory) {
      const roundCast = round as unknown as Record<string, unknown>;
      if (roundCast.weisActions && Array.isArray(roundCast.weisActions)) {
        for (const action of roundCast.weisActions) {
          if (typeof action === 'object' && action !== null && 
              'position' in action && 'points' in action && 
              action.position === teamPosition) {
            let points = 0;
            if (typeof action.points === 'number') {
              points = action.points;
            } else if (typeof action.points === 'string') {
              const parsed = parseInt(action.points, 10);
              if (!isNaN(parsed)) {
                points = parsed;
              }
            }
            roundWeisSum += points;
          }
        }
      }
    }
    weisFromActions = roundWeisSum;
  }
  
  // Nimm den höchsten Wert aus allen drei Quellen
  const maxWeis = Math.max(weisFromGameObject, weisFromSavedPoints, weisFromActions);
  
  // Debug-Logging für die gesamte Weispunkte-Extraktion
  // console.log(`[DEBUG-WEIS] Game ${game.activeGameId}: Team ${teamPosition} - weisFromGameObject: ${weisFromGameObject}, weisFromSavedPoints: ${weisFromSavedPoints}, weisFromActions: ${weisFromActions}, FINAL: ${maxWeis}`);
  
  return maxWeis;
}

// NEUE Schwellenwerte für Highlight-Qualifikation und Gewichtung
const PLAYER_GAMES_FULL_WEIGHT_THRESHOLD = 50;
const PLAYER_SESSIONS_FULL_WEIGHT_THRESHOLD = 10;
const TEAM_GAMES_FULL_WEIGHT_THRESHOLD = 30;
const TEAM_SESSIONS_FULL_WEIGHT_THRESHOLD = 5;
const MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT = 1;

// Typen für die Statistik-Ergebnisse
export interface HighlightPlayer {
  name: string;
  value: number; // Der Rohwert der Statistik (z.B. Siegquote, Matsch-Anzahl)
  eventsPlayed: number; // Anzahl der zugrundeliegenden Spiele/Partien
}

export interface HighlightTeam {
  names: string[];
  value: number; // Der Rohwert der Statistik
  eventsPlayed: number; // Anzahl der zugrundeliegenden Spiele/Partien
}

export interface GroupStatistics {
  // Gruppenübersicht
  memberCount: number;
  sessionCount: number;
  gameCount: number;
  totalPlayTime: string; 
  firstJassDate: string | null; 
  lastJassDate: string | null; 
  hauptspielortName: string | null; 
  
  // Durchschnittswerte
  avgSessionDuration: string;
  avgGameDuration: string;
  avgGamesPerSession: number;
  avgRoundsPerGame: number;
  avgMatschPerGame: number;
  avgRoundDuration: string; // NEU: Durchschnittliche Rundendauer
  
  // Trumpffarben-Statistik
  trumpfFarbenStatistik: { farbe: string; anteil: number }[]; // NEU: Verteilung der Trumpffarben
  
  // Spieler-Highlights - jetzt potenziell Arrays
  playerWithMostGames: HighlightPlayer[] | null;
  playerWithHighestStricheDiff: HighlightPlayer[] | null; // Bleibt erstmal so, da absoluter Wert
  playerWithHighestWinRateSession: HighlightPlayer[] | null;
  playerWithHighestWinRateGame: HighlightPlayer[] | null;
  playerWithHighestMatschRate: HighlightPlayer[] | null;
  playerWithMostWeisPointsAvg: HighlightPlayer[] | null;
  playerWithFastestRounds: HighlightPlayer[] | null; // NEU: Spieler mit schnellsten Runden
  playerWithSlowestRounds: HighlightPlayer[] | null; // NEU: Spieler mit langsamsten Runden
  
  // NEU: Vollständige Rangliste aller Spieler nach Rundenzeit
  playerAllRoundTimes: (HighlightPlayer & { displayValue?: string })[] | null;
  
  // Team-Highlights - jetzt potenziell Arrays
  teamWithHighestWinRateSession: HighlightTeam[] | null;
  teamWithHighestWinRateGame: HighlightTeam[] | null;
  teamWithHighestMatschRate: HighlightTeam[] | null;
  teamWithMostWeisPointsAvg: HighlightTeam[] | null;
}

// Hilfsfunktion zum Berechnen der Strich-Summe
const sumStriche = (striche: StricheRecord): number => {
  return (
    (striche.berg || 0) +
    (striche.sieg || 0) +
    (striche.matsch || 0) +
    (striche.schneider || 0) +
    (striche.kontermatsch || 0)
  );
};

// Hilfsfunktion zum Formatieren von Prozentangaben
const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

// Hilfsfunktion zur sicheren Prüfung auf Firestore Timestamp
function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return Boolean(value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function');
}

// Verbindung zum Service
import {
  fetchAllGroupSessions,
  fetchAllGamesForSession,
  fetchAllGamesForGroup,
  getGroupDetails,
  SessionSummary,
} from '@/services/sessionService';

// Hilfsfunktionen aus statisticsUtils importieren
import {
  calculateTotalStriche,
  determineWinningTeam,
} from '@/utils/statisticsUtils';
import { generatePairingId } from '@/utils/jassUtils'; // Für Team-Paarungs-IDs

// Hilfsfunktion für leere Statistiken (angepasst an neue Feldnamen und Array-Typen in Highlights)
export function createEmptyStatistics(): GroupStatistics {
  return {
    memberCount: 0,
    sessionCount: 0,
    gameCount: 0,
    totalPlayTime: '-',
    firstJassDate: null,
    lastJassDate: null,
    hauptspielortName: null,
    avgSessionDuration: '-',
    avgGameDuration: '-',
    avgGamesPerSession: 0,
    avgRoundsPerGame: 0,
    avgMatschPerGame: 0,
    avgRoundDuration: '-',
    trumpfFarbenStatistik: [],
    playerWithMostGames: null,
    playerWithHighestStricheDiff: null,
    playerWithHighestWinRateSession: null,
    playerWithHighestWinRateGame: null,
    playerWithHighestMatschRate: null,
    playerWithMostWeisPointsAvg: null,
    playerWithFastestRounds: null,
    playerWithSlowestRounds: null,
    playerAllRoundTimes: null,
    teamWithHighestWinRateSession: null,
    teamWithHighestWinRateGame: null,
    teamWithHighestMatschRate: null,
    teamWithMostWeisPointsAvg: null,
  };
}

// Hauptfunktion zum Abrufen der Gruppenstatistiken (neu implementiert)
export const fetchGroupStatistics = async (groupId: string, groupMainLocationZip: string | null | undefined): Promise<GroupStatistics | null> => {
  try {
    // 1. Daten laden
    const groupDetails: FirestoreGroup | null = await getGroupDetails(groupId);
    if (!groupDetails) {
      console.warn(`[fetchGroupStatistics] Group details not found for groupId: ${groupId}`);
      return createEmptyStatistics(); 
    }

    // Direkt hier die Logik für hauptspielortName mit dem übergebenen Parameter
    let ermittelterHauptspielortName: string | null = null;
    if (groupMainLocationZip) {
      // console.log(`[fetchGroupStatistics] Using provided mainLocationZip: ${groupMainLocationZip}`);
      const ortName = getOrtNameByPlz(groupMainLocationZip);
      ermittelterHauptspielortName = ortName || groupMainLocationZip; // Fallback auf PLZ, wenn Ort nicht gefunden
    } else {
      // console.log(`[fetchGroupStatistics] mainLocationZip was not provided or is null/undefined. Hauptspielort bleibt null.`);
    }

    const sessions: SessionSummary[] = await fetchAllGroupSessions(groupId);
    if (sessions.length === 0) {
      // console.log(`[fetchGroupStatistics] No sessions found for groupId: ${groupId}`);
      return createEmptyStatistics();
    }

    const gamesBySession: Map<string, CompletedGameSummary[]> = await fetchAllGamesForGroup(groupId);
    const allGamesFlat: CompletedGameSummary[] = Array.from(gamesBySession.values()).flat();

    // 2. Basis-Gruppenübersicht
    const memberCount = Object.keys(groupDetails.players || {}).length || groupDetails.playerIds.length;
    const sessionCount = sessions.length;
    const gameCount = allGamesFlat.length;

    let firstJassDateMs: number | null = null;
    let lastJassDateMs: number | null = null;
    if (sessionCount > 0) {
      const validSessionDates = sessions
        .map(s => s.startedAt)
        .filter(d => d !== null) as number[];
      
      if (validSessionDates.length > 0) {
        firstJassDateMs = Math.min(...validSessionDates);
        
        const validEndDates = sessions
          .map(s => s.endedAt || s.startedAt) // Fallback auf startedAt falls endedAt fehlt
          .filter(d => d !== null) as number[];
        if (validEndDates.length > 0) {
            lastJassDateMs = Math.max(...validEndDates);
        }
      }
    }
    
    let totalPlayTimeMillis = 0;
    allGamesFlat.forEach(game => {
      totalPlayTimeMillis += game.durationMillis || 0;
    });

    // 3. Durchschnittswerte
    const avgSessionDuration = sessionCount > 0 && totalPlayTimeMillis > 0 ? formatDurationForStats(totalPlayTimeMillis / sessionCount) : '-';
    const avgGameDuration = gameCount > 0 && totalPlayTimeMillis > 0 ? formatDurationForStats(totalPlayTimeMillis / gameCount) : '-';
    const avgGamesPerSession = sessionCount > 0 ? parseFloat((gameCount / sessionCount).toFixed(1)) : 0;
    
    let totalRounds = 0;
    allGamesFlat.forEach(game => {
      totalRounds += game.roundHistory?.length || 0;
    });
    const avgRoundsPerGame = gameCount > 0 ? parseFloat((totalRounds / gameCount).toFixed(1)) : 0;

    let totalMatschStiche = 0;
    allGamesFlat.forEach(game => {
      totalMatschStiche += (game.finalStriche?.top?.matsch || 0) + (game.finalStriche?.bottom?.matsch || 0);
    });
    const avgMatschPerGame = gameCount > 0 ? parseFloat((totalMatschStiche / gameCount).toFixed(2)) : 0;

    // 4. Spieler-Highlights
    const playerStatsMap = new Map<PlayerId, {
      gamesPlayed: number;
      totalStricheDiff: number;
      sessionsWon: number;
      sessionsPlayed: number;
      gamesWon: number;
      matschCount: number;
      totalWeisPoints: number;
      name: string;
      gamesPlayedInLast12Months: number;
    }>();

    // Spielernamen aus groupDetails holen
    const playerNamesMap = new Map<PlayerId, string>();
    if (groupDetails.players) {
        Object.entries(groupDetails.players).forEach(([id, playerInfo]) => {
            playerNamesMap.set(id, playerInfo.displayName);
        });
    }
    // Fallback, falls groupDetails.players leer/nicht vorhanden, aber playerIds schon
    if (playerNamesMap.size === 0 && groupDetails.playerIds && groupDetails.playerIds.length > 0) {
        groupDetails.playerIds.forEach(id => {
            if (!playerNamesMap.has(id)) { // Nur hinzufügen, falls nicht schon aus groupDetails.players vorhanden
                 // Versuche, Namen aus Sessions zu extrahieren (Fallback)
                let foundName: string | undefined;
                for (const s of sessions) {
                    if (s.participantUids && s.playerNames) {
                        const playerIndex = s.participantUids.indexOf(id);
                        if (playerIndex !== -1) {
                            const playerNum = (playerIndex + 1) as PlayerNumber;
                            if (s.playerNames[playerNum]) {
                                foundName = s.playerNames[playerNum];
                                break;
                            }
                        }
                    }
                }
                playerNamesMap.set(id, foundName || `Spieler ${id.substring(0, 4)}`);
            }
        });
    }

    // Initialisiere alle bekannten Spieler in der Map, um sicherzustellen, dass jeder Spieler berücksichtigt wird,
    // auch wenn er keine Spiele/Sessions im betrachteten Zeitraum hat.
    const allKnownPlayerIdsInGroup = new Set<PlayerId>(groupDetails.playerIds);
    // Füge auch Spieler aus `groupDetails.players` hinzu, falls diese Struktur existiert und zusätzliche IDs enthält
    if (groupDetails.players) {
      Object.keys(groupDetails.players).forEach(pid => allKnownPlayerIdsInGroup.add(pid));
    }

    allKnownPlayerIdsInGroup.forEach(playerId => {
      const playerName = playerNamesMap.get(playerId) || `Spieler ${playerId.substring(0, 4)}`;
      if (!playerStatsMap.has(playerId)) {
        playerStatsMap.set(playerId, {
          gamesPlayed: 0,
          totalStricheDiff: 0,
          sessionsWon: 0,
          sessionsPlayed: 0,
          gamesWon: 0,
          matschCount: 0,
          totalWeisPoints: 0,
          name: playerName,
          gamesPlayedInLast12Months: 0, // Initialisieren
        });
      }
    });

    // Zeitstempel für "vor 12 Monaten"
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Iteriere über alle Spiele, um Spielerstatistiken zu sammeln
    allGamesFlat.forEach(game => {
      if (!game.participantUids || !game.finalScores) {
        console.warn(`[fetchGroupStatistics] Skipping game due to missing participantUids or finalScores. Game ID (activeGameId): ${game.activeGameId}`);
        return;
      }
      
      const gameDate = getDateFromTimestamp(game.timestampCompleted);

      game.participantUids.forEach(playerId => {
        const playerDisplayName = playerNamesMap.get(playerId) || `Spieler ${playerId.substring(0, 4)}`;
        let playerStat = playerStatsMap.get(playerId);

        if (!playerStat) {
          // Dieser Fall sollte durch die Vorinitialisierung oben abgedeckt sein, aber als Fallback:
          playerStat = {
            gamesPlayed: 0,
            totalStricheDiff: 0,
            sessionsWon: 0,
            sessionsPlayed: 0,
            gamesWon: 0,
            matschCount: 0,
            totalWeisPoints: 0,
            name: playerDisplayName,
            gamesPlayedInLast12Months: 0,
          };
          playerStatsMap.set(playerId, playerStat);
        }

        playerStat.gamesPlayed += 1;

        if (gameDate && gameDate > twelveMonthsAgo) {
          playerStat.gamesPlayedInLast12Months += 1;
        }

        // Strichedifferenz (eigene Striche - gegnerische Striche)
        const playerTeam = getPlayerTeamInGame(playerId, game);
        if (playerTeam && game.finalStriche) {
            // KORREKTUR: Verwende strokeSettings aus der Gruppe oder Standardeinstellungen
            const strokeSettings = {
                kontermatsch: groupDetails.strokeSettings?.kontermatsch ?? DEFAULT_STROKE_SETTINGS.kontermatsch,
                schneider: groupDetails.strokeSettings?.schneider ?? DEFAULT_STROKE_SETTINGS.schneider
            };
            // NEU: Verwende scoreSettings.enabled aus der Gruppe oder Standardeinstellungen
            const scoreEnabledSettings = {
                berg: groupDetails.scoreSettings?.enabled?.berg ?? DEFAULT_SCORE_SETTINGS.enabled.berg,
                schneider: groupDetails.scoreSettings?.enabled?.schneider ?? DEFAULT_SCORE_SETTINGS.enabled.schneider
            };
            
            const ownStriche = calculateTotalStriche(game.finalStriche[playerTeam], strokeSettings, scoreEnabledSettings);
            const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
            const opponentStriche = calculateTotalStriche(game.finalStriche[opponentTeam], strokeSettings, scoreEnabledSettings);
            
            // Richtige Berechnung der Strichedifferenz
            const stricheDiff = ownStriche - opponentStriche;
            playerStat.totalStricheDiff += stricheDiff;
        }

        // Spiele gewonnen
        const winningTeamGame = determineWinningTeam(game.finalScores); // Nur finalScores übergeben
        if (playerTeam && winningTeamGame === playerTeam) {
          playerStat.gamesWon += 1;
        }
        
        // Matsch-Anzahl
        if (playerTeam && game.finalStriche?.[playerTeam]?.matsch) {
            playerStat.matschCount += game.finalStriche[playerTeam].matsch;
        }
        if (playerTeam && game.finalStriche?.[playerTeam]?.kontermatsch) { // Kontermatsch zählt auch als Matsch für die Statistik
            playerStat.matschCount += game.finalStriche[playerTeam].kontermatsch;
        }

        // Durchschnittliche Weispunkte (Summe wird hier gesammelt, Durchschnitt später)
        if (playerTeam) {
            playerStat.totalWeisPoints += extractWeisPointsFromGameData(playerTeam, game);
        }
      });
    });

    // Iteriere über alle Sessions, um Spielerstatistiken zu sammeln
    sessions.forEach(session => {
      session.participantUids?.forEach(playerId => {
        const stats = playerStatsMap.get(playerId);
        if (stats) {
          stats.sessionsPlayed++;
          // Gewinner der Session ermitteln
          const winningTeamSession = determineWinningTeam(session.finalScores || { top: 0, bottom: 0 });
          if (winningTeamSession && winningTeamSession !== 'draw') {
            // Bestimme Team des Spielers korrekt anhand der pairingIdentifiers
            const playerTeam = getPlayerTeamInSession(playerId, session);
            if (playerTeam === winningTeamSession) {
              stats.sessionsWon++;
            }
          }
        }
      });
    });

    // Spieler-Highlights auswerten
    const allPlayersDataForHighlights: (HighlightPlayer & {
      internalGamesPlayed: number;
      internalTotalStricheDiff: number;
      internalSessionsWon: number;
      internalSessionsPlayed: number;
      internalGamesWon: number;
      internalMatschCount: number;
      internalTotalWeisPoints: number;
    })[] = [];

    playerStatsMap.forEach((stats, playerId) => {
      if (!playerNamesMap.has(playerId)) {
        // console.log(`[DEBUG-PLAYER] Player ${playerId} not in playerNamesMap, skipping`);
        return;
      } // Nur Spieler berücksichtigen, die in der Gruppe bekannt sind (registriert)
      
      // NEUER GLOBALER AKTIVITÄTSFILTER
      if (stats.gamesPlayedInLast12Months < 2) {
        // console.log(`[DEBUG-PLAYER] Player ${stats.name} (${playerId}) skipped due to low activity: ${stats.gamesPlayedInLast12Months} games in last 12 months`);
        return;
      }

      // console.log(`[DEBUG-PLAYER] Player ${stats.name} (${playerId}): gamesPlayed: ${stats.gamesPlayed}, totalWeisPoints: ${stats.totalWeisPoints}, avg: ${stats.gamesPlayed > 0 ? stats.totalWeisPoints / stats.gamesPlayed : 0}`);

      allPlayersDataForHighlights.push({
        name: stats.name,
        value: 0, // Wird später pro Kategorie gesetzt
        eventsPlayed: 0, // Wird später pro Kategorie gesetzt
        internalGamesPlayed: stats.gamesPlayed,
        internalTotalStricheDiff: stats.totalStricheDiff, // Exakten Wert verwenden, keine Rundung!
        internalSessionsWon: stats.sessionsWon,
        internalSessionsPlayed: stats.sessionsPlayed,
        internalGamesWon: stats.gamesWon,
        internalMatschCount: stats.matschCount,
        internalTotalWeisPoints: stats.totalWeisPoints,
      });
    });
    
    // Hilfsfunktion zum Erstellen der Top-N Spielerliste für eine Kategorie
    const createPlayerTopNList = (
      dataSource: typeof allPlayersDataForHighlights,
      valueExtractor: (playerData: typeof allPlayersDataForHighlights[0]) => number, // Extrahiert den Rohwert für die Anzeige
      rankingScoreExtractor: (playerData: typeof allPlayersDataForHighlights[0]) => number, // Extrahiert den Wert für die Sortierung
      eventsPlayedExtractor: (playerData: typeof allPlayersDataForHighlights[0]) => number,
      minEventsRequired: number = MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      valueFormatter?: (value: number) => number | string, // Optional: für % oder toFixed
      additionalFilter?: (playerData: typeof allPlayersDataForHighlights[0]) => boolean
    ): HighlightPlayer[] | null => {
      const eligiblePlayersInitial = dataSource
        .filter(p => eventsPlayedExtractor(p) >= minEventsRequired);
        
      const eligiblePlayersFiltered = additionalFilter 
        ? eligiblePlayersInitial.filter(additionalFilter) 
        : eligiblePlayersInitial;

      // KORREKTUR: Extrahiere den exakten Wert ohne Manipulation
      const rankedPlayers = eligiblePlayersFiltered
        .map(p => ({
          name: p.name,
          rawValue: valueExtractor(p), // Exakter Wert ohne Rundung oder Manipulation
          rankingScore: rankingScoreExtractor(p), // Nur für Sortierung
          eventsPlayed: eventsPlayedExtractor(p),
        }))
        .sort((a, b) => b.rankingScore - a.rankingScore); // Absteigend sortieren

      // DEBUG: Log der sortierten Rangliste vor der Rückgabe
      // console.log("[DEBUG-STRICHEDIFF-SORT] Sortierte Rangliste:", 
      //   rankedPlayers.map(p => ({ name: p.name, rawValue: p.rawValue, rankingScore: p.rankingScore }))
      // );

      if (rankedPlayers.length === 0) return null;

      // KORREKTUR: Verwende exakt den extrahierten Wert (rawValue) 
      // ohne weitere Manipulation, außer durch expliziten valueFormatter
      return rankedPlayers.map(p => ({
        name: p.name,
        value: valueFormatter ? valueFormatter(p.rawValue) as number : p.rawValue,
        eventsPlayed: p.eventsPlayed,
      }));
    };

    // Berechnung der einzelnen Spieler-Highlights als Top-Listen
    const playerWithMostGamesList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => p.internalGamesPlayed,
      p => p.internalGamesPlayed,
      p => p.internalGamesPlayed,
      1 // Mindestens 1 Spiel gespielt für "Meiste Spiele"
    );

    const playerWithHighestStricheDiffList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => {
        // DEBUG: Logge die exakten Strichedifferenz-Werte
        // console.log(`[DEBUG-STRICHEDIFF-SERVICE] Spieler ${p.name}, internalTotalStricheDiff (roh): ${p.internalTotalStricheDiff}`);
        return p.internalTotalStricheDiff; // Keine Rundung - exakten Wert verwenden!
      },
      p => p.internalTotalStricheDiff, // Direkter Wert für Sortierung
      p => p.internalGamesPlayed, // Benötigt für potenziellen minEvents Filter
      1, // Mindestens 1 Spiel gespielt, damit Strichdifferenz aussagekräftig ist
      (val) => {
        // DEBUG: Logge die exakten Werte nach einem möglichen valueFormatter
        // console.log(`[DEBUG-STRICHEDIFF-SERVICE] Nach valueFormatter: ${val}`);
        return val; // Exakter Wert ohne Manipulation
      } // Kein spezieller Value Formatter, keine Rundung
    );

    const playerWithHighestWinRateSessionList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => p.internalSessionsPlayed > 0 ? p.internalSessionsWon / p.internalSessionsPlayed : 0,
      p => (p.internalSessionsPlayed > 0 ? p.internalSessionsWon / p.internalSessionsPlayed : 0) * (Math.min(p.internalSessionsPlayed, PLAYER_SESSIONS_FULL_WEIGHT_THRESHOLD) / PLAYER_SESSIONS_FULL_WEIGHT_THRESHOLD),
      p => p.internalSessionsPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT
      // valueFormatter wird in start/index.tsx für % Darstellung gehandhabt
    );

    const playerWithHighestWinRateGameList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => p.internalGamesPlayed > 0 ? p.internalGamesWon / p.internalGamesPlayed : 0,
      p => (p.internalGamesPlayed > 0 ? p.internalGamesWon / p.internalGamesPlayed : 0) * (Math.min(p.internalGamesPlayed, PLAYER_GAMES_FULL_WEIGHT_THRESHOLD) / PLAYER_GAMES_FULL_WEIGHT_THRESHOLD),
      p => p.internalGamesPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT
    );

    const playerWithHighestMatschRateList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => p.internalGamesPlayed > 0 ? p.internalMatschCount / p.internalGamesPlayed : 0,
      p => (p.internalGamesPlayed > 0 ? p.internalMatschCount / p.internalGamesPlayed : 0) * (Math.min(p.internalGamesPlayed, PLAYER_GAMES_FULL_WEIGHT_THRESHOLD) / PLAYER_GAMES_FULL_WEIGHT_THRESHOLD),
      p => p.internalGamesPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      val => parseFloat(val.toFixed(2)) // Rohwert als Dezimalzahl
    );

    const playerWithMostWeisPointsAvgList = createPlayerTopNList(
      allPlayersDataForHighlights,
      p => {
        const avg = p.internalGamesPlayed > 0 ? p.internalTotalWeisPoints / p.internalGamesPlayed : 0;
        // console.log(`[DEBUG-WEIS-AVG] Player ${p.name}: totalWeis: ${p.internalTotalWeisPoints}, games: ${p.internalGamesPlayed}, avg: ${avg}`);
        return avg;
      },
      p => (p.internalGamesPlayed > 0 ? p.internalTotalWeisPoints / p.internalGamesPlayed : 0) * (Math.min(p.internalGamesPlayed, PLAYER_GAMES_FULL_WEIGHT_THRESHOLD) / PLAYER_GAMES_FULL_WEIGHT_THRESHOLD),
      p => p.internalGamesPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      val => parseFloat(val.toFixed(1))
    );

    // 5. Team-Highlights
    const teamStatsMap = new Map<string, {
      sessionsWon: number;
      sessionsPlayed: number;
      gamesWon: number;
      gamesPlayed: number;
      matschCount: number;
      totalWeisPoints: number;
      teamPlayerNames: string[];
    }>();

    sessions.forEach(session => {
      if (session.pairingIdentifiers && typeof session.pairingIdentifiers === 'object') {
        const pairingData = session.pairingIdentifiers as any;
        
        // Beide Schreibweisen unterstützen (teamA/TeamA)
        const pairingA = pairingData.teamA || pairingData.TeamA;
        const pairingB = pairingData.teamB || pairingData.TeamB;
        
        if (pairingA && pairingB) {
            // Wenn teams vorhanden ist, verwenden wir diese zur Namensbestimmung
            if (session.teams && typeof session.teams === 'object') {
                const teamsData = session.teams as any;
                let teamANames: string[] = [];
                let teamBNames: string[] = [];
                
                if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players)) {
                    teamANames = teamsData.teamA.players.map((p: {displayName: string}) => p.displayName);
                }
                
                if (teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
                    teamBNames = teamsData.teamB.players.map((p: {displayName: string}) => p.displayName);
                }
                
                if (teamANames.length > 0 && teamBNames.length > 0) {
                    // Wenn Namen aus teams vorhanden, verwenden wir diese
                    if (!teamStatsMap.has(pairingA)) teamStatsMap.set(pairingA, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamANames });
                    if (!teamStatsMap.has(pairingB)) teamStatsMap.set(pairingB, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamBNames });
                    
                    teamStatsMap.get(pairingA)!.sessionsPlayed++;
                    teamStatsMap.get(pairingB)!.sessionsPlayed++;
                    
                    const winningTeamSession = determineWinningTeam(session.finalScores || { top: 0, bottom: 0 });
                    if (winningTeamSession === 'bottom') teamStatsMap.get(pairingA)!.sessionsWon++; 
                    else if (winningTeamSession === 'top') teamStatsMap.get(pairingB)!.sessionsWon++;
                    
                    return; // Beende, da wir Teams aus der teams-Struktur verwendet haben
                }
            }
            
            // Fallback: Extrahiere playerIds aus den Pairings und hole Namen aus der Map
            const teamAPlayerIds = pairingA.split('_');
            const teamBPlayerIds = pairingB.split('_');
            const teamANames = teamAPlayerIds.map(id => playerNamesMap.get(id) || `Spieler-${id.substring(0, 4)}`);
            const teamBNames = teamBPlayerIds.map(id => playerNamesMap.get(id) || `Spieler-${id.substring(0, 4)}`);

            if (!teamStatsMap.has(pairingA)) teamStatsMap.set(pairingA, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamANames });
            if (!teamStatsMap.has(pairingB)) teamStatsMap.set(pairingB, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamBNames });
            
            teamStatsMap.get(pairingA)!.sessionsPlayed++;
            teamStatsMap.get(pairingB)!.sessionsPlayed++;

            const winningTeamSession = determineWinningTeam(session.finalScores || { top: 0, bottom: 0 });
            if (winningTeamSession === 'bottom') teamStatsMap.get(pairingA)!.sessionsWon++; 
            else if (winningTeamSession === 'top') teamStatsMap.get(pairingB)!.sessionsWon++;
        }
      }
    });

    // Verarbeite Spiele für die Team-Statistiken
    allGamesFlat.forEach(game => {
      const gameAny = game as any;
      
      // Prüfe zuerst, ob teams vorhanden sind
      if (game.teams && typeof game.teams === 'object') {
        const teamsData = game.teams as any;
        
        // Extrahiere Teams aus der games.teams-Struktur
        if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players) && 
            teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
          
          // Wenn pairingIdentifiers vorhanden sind, verwenden wir diese als IDs
          if (gameAny.pairingIdentifiers && typeof gameAny.pairingIdentifiers === 'object') {
            const pairingData = gameAny.pairingIdentifiers;
            const pairingA = pairingData.teamA || pairingData.TeamA;
            const pairingB = pairingData.teamB || pairingData.TeamB;
            
            if (pairingA && pairingB) {
              // Namen direkt aus der teams Struktur extrahieren
              const teamANames = teamsData.teamA.players.map((p: {displayName: string}) => p.displayName);
              const teamBNames = teamsData.teamB.players.map((p: {displayName: string}) => p.displayName);
              
              // Stelle sicher, dass der Eintrag existiert oder erstelle ihn und aktualisiere/setze immer die Namen von game.teams
              let statsTeamA = teamStatsMap.get(pairingA);
              if (!statsTeamA) {
                statsTeamA = { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamANames };
                teamStatsMap.set(pairingA, statsTeamA);
              } else {
                statsTeamA.teamPlayerNames = teamANames; // Namen immer aktualisieren, wenn game.teams vorhanden ist
              }

              let statsTeamB = teamStatsMap.get(pairingB);
              if (!statsTeamB) {
                statsTeamB = { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamBNames };
                teamStatsMap.set(pairingB, statsTeamB);
              } else {
                statsTeamB.teamPlayerNames = teamBNames; // Namen immer aktualisieren, wenn game.teams vorhanden ist
              }
              
              statsTeamA.gamesPlayed++;
              statsTeamB.gamesPlayed++;
              
              const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
              if (gameWinningTeam === 'bottom') statsTeamA.gamesWon++;
              else if (gameWinningTeam === 'top') statsTeamB.gamesWon++;
              
              statsTeamA.matschCount += game.finalStriche?.bottom?.matsch || 0;
              statsTeamB.matschCount += game.finalStriche?.top?.matsch || 0;
              
              // Extrahiere und addiere Weispunkte für beide Teams
              statsTeamA.totalWeisPoints += extractWeisPointsFromGameData('bottom', game);
              statsTeamB.totalWeisPoints += extractWeisPointsFromGameData('top', game);
              
              return; // Beende, da wir Teams aus der teams-Struktur verwendet haben
            }
          }
        }
      }
      
      // Fallback: Prüfe auf pairingIdentifiers ohne teams-Struktur
      if (gameAny.pairingIdentifiers && typeof gameAny.pairingIdentifiers === 'object') {
        const pairingData = gameAny.pairingIdentifiers;
        const pairingA = pairingData.teamA || pairingData.TeamA;
        const pairingB = pairingData.teamB || pairingData.TeamB;
        
        if (pairingA && pairingB) {
          // Namen für diese Paarungen aus den IDs extrahieren
          const teamAPlayerIds = pairingA.split('_');
          const teamBPlayerIds = pairingB.split('_');
          const teamANames = teamAPlayerIds.map(id => playerNamesMap.get(id) || `Spieler-${id.substring(0, 4)}`);
          const teamBNames = teamBPlayerIds.map(id => playerNamesMap.get(id) || `Spieler-${id.substring(0, 4)}`);
          
          if (!teamStatsMap.has(pairingA)) teamStatsMap.set(pairingA, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamANames });
          if (!teamStatsMap.has(pairingB)) teamStatsMap.set(pairingB, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: teamBNames });
          
          teamStatsMap.get(pairingA)!.gamesPlayed++;
          teamStatsMap.get(pairingB)!.gamesPlayed++;
          
          const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
          if (gameWinningTeam === 'bottom') teamStatsMap.get(pairingA)!.gamesWon++;
          else if (gameWinningTeam === 'top') teamStatsMap.get(pairingB)!.gamesWon++;
          
          teamStatsMap.get(pairingA)!.matschCount += game.finalStriche?.bottom?.matsch || 0;
          teamStatsMap.get(pairingB)!.matschCount += game.finalStriche?.top?.matsch || 0;
          
          // Extrahiere und addiere Weispunkte für beide Teams im Fallback-Pfad
          teamStatsMap.get(pairingA)!.totalWeisPoints += extractWeisPointsFromGameData('bottom', game);
          teamStatsMap.get(pairingB)!.totalWeisPoints += extractWeisPointsFromGameData('top', game);
        }
      }
      
      // Letzter Fallback: Verwende participantUids-Array-Indizes
      if (game.participantUids && game.participantUids.length === 4) {
        const pairingBottom = generatePairingId(game.participantUids[0], game.participantUids[2]);
        const pairingTop = generatePairingId(game.participantUids[1], game.participantUids[3]);

        // Namen für diese Paarungen holen (kann knifflig sein, wenn sie nicht in session.teams sind)
        // Vereinfachung: Namen aus dem Spiel nehmen, falls vorhanden, sonst generisch
        const bottomNames = [playerNamesMap.get(game.participantUids[0]) || 'Sp1', playerNamesMap.get(game.participantUids[2]) || 'Sp3'];
        const topNames = [playerNamesMap.get(game.participantUids[1]) || 'Sp2', playerNamesMap.get(game.participantUids[3]) || 'Sp4'];

        if (!teamStatsMap.has(pairingBottom)) teamStatsMap.set(pairingBottom, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: bottomNames });
        if (!teamStatsMap.has(pairingTop)) teamStatsMap.set(pairingTop, { sessionsWon: 0, sessionsPlayed: 0, gamesWon: 0, gamesPlayed: 0, matschCount: 0, totalWeisPoints: 0, teamPlayerNames: topNames });

        teamStatsMap.get(pairingBottom)!.gamesPlayed++;
        teamStatsMap.get(pairingTop)!.gamesPlayed++;

        const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
        if (gameWinningTeam === 'bottom') teamStatsMap.get(pairingBottom)!.gamesWon++;
        else if (gameWinningTeam === 'top') teamStatsMap.get(pairingTop)!.gamesWon++;

        teamStatsMap.get(pairingBottom)!.matschCount += game.finalStriche?.bottom?.matsch || 0;
        teamStatsMap.get(pairingTop)!.matschCount += game.finalStriche?.top?.matsch || 0;
        
        // Extrahiere und addiere Weispunkte für beide Teams im Fallback-Pfad
        teamStatsMap.get(pairingBottom)!.totalWeisPoints += extractWeisPointsFromGameData('bottom', game);
        teamStatsMap.get(pairingTop)!.totalWeisPoints += extractWeisPointsFromGameData('top', game);
      }
    });

    // 5. Team-Highlights (ähnliche Logik für Teams)
    const allTeamsDataForHighlights: (HighlightTeam & {
      internalSessionsWon: number;
      internalSessionsPlayed: number;
      internalGamesWon: number;
      internalGamesPlayed: number;
      internalMatschCount: number;
      internalTotalWeisPoints: number;
    })[] = [];

    teamStatsMap.forEach((stats, pairingId) => {
      allTeamsDataForHighlights.push({
        names: stats.teamPlayerNames,
        value: 0, // Platzhalter
        eventsPlayed: 0, // Platzhalter
        internalSessionsWon: stats.sessionsWon,
        internalSessionsPlayed: stats.sessionsPlayed,
        internalGamesWon: stats.gamesWon,
        internalGamesPlayed: stats.gamesPlayed,
        internalMatschCount: stats.matschCount,
        internalTotalWeisPoints: stats.totalWeisPoints,
      });
    });

    // Hilfsfunktion zum Erstellen der Top-N Teamsliste für eine Kategorie
    const createTeamTopNList = (
      dataSource: typeof allTeamsDataForHighlights,
      valueExtractor: (teamData: typeof allTeamsDataForHighlights[0]) => number,
      rankingScoreExtractor: (teamData: typeof allTeamsDataForHighlights[0]) => number,
      eventsPlayedExtractor: (teamData: typeof allTeamsDataForHighlights[0]) => number,
      minEventsRequired: number = MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      valueFormatter?: (value: number) => number | string
    ): HighlightTeam[] | null => {
      const eligibleTeamsInitial = dataSource
        .filter(t => eventsPlayedExtractor(t) >= minEventsRequired);
      
      const eligibleTeamsFiltered = eligibleTeamsInitial; // Vorerst kein additionalFilter für Teams

      const rankedTeams = eligibleTeamsFiltered
        .map(t => ({
          names: t.names,
          rawValue: valueExtractor(t),
          rankingScore: rankingScoreExtractor(t),
          eventsPlayed: eventsPlayedExtractor(t),
        }))
        .sort((a, b) => b.rankingScore - a.rankingScore);

      if (rankedTeams.length === 0) return null;

      return rankedTeams.map(t => ({
        names: t.names,
        value: valueFormatter ? valueFormatter(t.rawValue) as number : t.rawValue,
        eventsPlayed: t.eventsPlayed,
      }));
    };
    
    const teamWithHighestWinRateSessionList = createTeamTopNList(
      allTeamsDataForHighlights,
      t => t.internalSessionsPlayed > 0 ? t.internalSessionsWon / t.internalSessionsPlayed : 0,
      t => (t.internalSessionsPlayed > 0 ? t.internalSessionsWon / t.internalSessionsPlayed : 0) * (Math.min(t.internalSessionsPlayed, TEAM_SESSIONS_FULL_WEIGHT_THRESHOLD) / TEAM_SESSIONS_FULL_WEIGHT_THRESHOLD),
      t => t.internalSessionsPlayed
    );

    const teamWithHighestWinRateGameList = createTeamTopNList(
      allTeamsDataForHighlights,
      t => t.internalGamesPlayed > 0 ? t.internalGamesWon / t.internalGamesPlayed : 0,
      t => (t.internalGamesPlayed > 0 ? t.internalGamesWon / t.internalGamesPlayed : 0) * (Math.min(t.internalGamesPlayed, TEAM_GAMES_FULL_WEIGHT_THRESHOLD) / TEAM_GAMES_FULL_WEIGHT_THRESHOLD),
      t => t.internalGamesPlayed
    );

    const teamWithHighestMatschRateList = createTeamTopNList(
      allTeamsDataForHighlights,
      t => t.internalGamesPlayed > 0 ? t.internalMatschCount / t.internalGamesPlayed : 0,
      t => (t.internalGamesPlayed > 0 ? t.internalMatschCount / t.internalGamesPlayed : 0) * (Math.min(t.internalGamesPlayed, TEAM_GAMES_FULL_WEIGHT_THRESHOLD) / TEAM_GAMES_FULL_WEIGHT_THRESHOLD),
      t => t.internalGamesPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      val => parseFloat(val.toFixed(2)) // Rohwert als Dezimalzahl
    );

    // NEUER CODE: Durchschnittliche Weispunkte pro Spiel für Teams
    const teamWithMostWeisPointsAvgList = createTeamTopNList(
      allTeamsDataForHighlights,
      t => t.internalGamesPlayed > 0 ? t.internalTotalWeisPoints / t.internalGamesPlayed : 0,
      t => (t.internalGamesPlayed > 0 ? t.internalTotalWeisPoints / t.internalGamesPlayed : 0) * (Math.min(t.internalGamesPlayed, TEAM_GAMES_FULL_WEIGHT_THRESHOLD) / TEAM_GAMES_FULL_WEIGHT_THRESHOLD),
      t => t.internalGamesPlayed,
      MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT,
      val => parseFloat(val.toFixed(1))
    );

    // NEU: Berechnung der Trumpffarben-Statistik
    const trumpfCounter: Record<string, number> = {};
    let totalTrumpfCount = 0;

    allGamesFlat.forEach(game => {
      // 1. Prüfe zuerst auf trumpColorsPlayed Array (höchste Priorität)
      if ((game as any).trumpColorsPlayed && Array.isArray((game as any).trumpColorsPlayed)) {
        const trumpColors = (game as any).trumpColorsPlayed as string[];
        trumpColors.forEach(color => {
          if (color) {
            trumpfCounter[color] = (trumpfCounter[color] || 0) + 1;
            totalTrumpfCount++;
          }
        });
        return; // Wenn trumpColorsPlayed vorhanden ist, nutzen wir nur diese Quelle
      }

      // 2. Fallback auf trumpfColor im Spiel
      if ((game as any).trumpfColor) {
        const trumpfColor = (game as any).trumpfColor as string;
        trumpfCounter[trumpfColor] = (trumpfCounter[trumpfColor] || 0) + 1;
        totalTrumpfCount++;
        return;
      }

      // 3. Fallback auf farbe in den Runden
      if (game.roundHistory && game.roundHistory.length > 0) {
        // Verwende Set, um jede Farbe pro Spiel nur einmal zu zählen
        const uniqueFarben = new Set<string>();
        
        game.roundHistory.forEach(round => {
          if (round.actionType === 'jass' && 'farbe' in round && round.farbe) {
            uniqueFarben.add(round.farbe);
          }
        });
        
        // Zähle die einzigartigen Farben
        uniqueFarben.forEach(farbe => {
          trumpfCounter[farbe] = (trumpfCounter[farbe] || 0) + 1;
          totalTrumpfCount++;
        });
      }
    });

    // Prozentuale Verteilung berechnen
    const trumpfFarbenStatistik = Object.entries(trumpfCounter)
      .map(([farbe, anzahl]) => ({
        farbe,
        anteil: totalTrumpfCount > 0 ? anzahl / totalTrumpfCount : 0
      }))
      .sort((a, b) => b.anteil - a.anteil); // Sortiere absteigend nach Häufigkeit

    // NEU: Verbesserte Berechnung der durchschnittlichen Rundendauer
    let totalRoundDurationMs = 0;
    let totalRoundCount = 0;

    // Spieler-Rundendauer-Tracking mit verbesserter Methodik
    const playerRoundDurations: Record<string, { totalDuration: number; roundCount: number; playerId: string; name: string }> = {};

    // Debug-Zähler für die Analyse
    let analyzedRounds = 0;
    let validRounds = 0;
    let invalidRounds = 0;

    allGamesFlat.forEach(game => {
      if (!game.roundHistory || game.roundHistory.length === 0) return;

      // Berechne die Zeit zwischen aufeinanderfolgenden Runden
      for (let i = 1; i < game.roundHistory.length; i++) {
        analyzedRounds++;
        const previousRound = game.roundHistory[i-1];
        const currentRound = game.roundHistory[i];
        
        // Methode 1: Nutze timestamp-Differenz zwischen Runden
        if (previousRound.timestamp && currentRound.timestamp) {
          const roundDuration = currentRound.timestamp - previousRound.timestamp;
          
          // Plausibilitätsprüfung: 0-10 Minuten (war 5 Minuten)
          if (roundDuration > 0 && roundDuration < 600000) {
            totalRoundDurationMs += roundDuration;
            totalRoundCount++;
            validRounds++;
            
            // Die Runde gehört zum Spieler, der sie abgeschlossen hat (currentPlayer)
            const playerIndex = currentRound.currentPlayer - 1; // Spieler sind 1-indiziert
            const playerId = game.participantUids?.[playerIndex];
            
            if (playerId) {
              const playerName = playerNamesMap.get(playerId) || `Spieler ${playerId.substring(0, 4)}`;
              
              if (!playerRoundDurations[playerId]) {
                playerRoundDurations[playerId] = {
                  totalDuration: 0,
                  roundCount: 0,
                  playerId,
                  name: playerName
                };
              }
              
              playerRoundDurations[playerId].totalDuration += roundDuration;
              playerRoundDurations[playerId].roundCount++;
            }
          } else {
            invalidRounds++;
            // console.log(`[DEBUG-ROUND-TIME] Unplausible Rundendauer: ${roundDuration}ms in Spiel ${game.activeGameId}, Runde ${i}`);
          }
        }
        
        // Methode 2: Wenn startTime und endTime in der Runde verfügbar sind
        if (currentRound.startTime && currentRound.endTime) {
          const roundDuration = currentRound.endTime - currentRound.startTime;
          
          // Plausibilitätsprüfung: 0-10 Minuten (war 5 Minuten)
          if (roundDuration > 0 && roundDuration < 600000) {
            // Diese Zeit ist bereits in der Methode 1 enthalten, nur für playerTurns verwenden
            // console.log(`[DEBUG-ROUND-TIME] Runde mit startTime/endTime gefunden: ${roundDuration}ms in Spiel ${game.activeGameId}, Runde ${i}`);
          }
          
          // Prüfe auf playerTurns und erfasse individuelle Spielerzeiten
          if (currentRound.playerTurns && currentRound.playerTurns.length > 0) {
            // console.log(`[DEBUG-ROUND-TIME] Runde mit ${currentRound.playerTurns.length} playerTurns gefunden in Spiel ${game.activeGameId}, Runde ${i}`);
            currentRound.playerTurns.forEach(turn => {
              if (turn.startTime && turn.endTime && turn.player) {
                const playerId = game.participantUids?.[turn.player - 1];
                if (!playerId) return;
                
                const turnDuration = turn.endTime - turn.startTime;
                // Plausibilitätsprüfung: 0-10 Minuten (war 5 Minuten)
                if (turnDuration <= 0 || turnDuration >= 600000) return; // Ignoriere unplausible Werte
                
                const playerName = playerNamesMap.get(playerId) || `Spieler ${playerId.substring(0, 4)}`;
                
                if (!playerRoundDurations[playerId]) {
                  playerRoundDurations[playerId] = {
                    totalDuration: 0,
                    roundCount: 0,
                    playerId,
                    name: playerName
                  };
                }
                
                playerRoundDurations[playerId].totalDuration += turnDuration;
                playerRoundDurations[playerId].roundCount++;
              }
            });
          }
        }
      }
    });

    // Logge Zusammenfassung der Analyse
    // console.log(`[DEBUG-ROUND-TIME] Rundenzeit-Analyse: ${analyzedRounds} geprüft, ${validRounds} gültig, ${invalidRounds} ungültig`);
    // console.log(`[DEBUG-ROUND-TIME] Spieler mit erfassten Rundenzeiten: ${Object.keys(playerRoundDurations).length}`);
    Object.values(playerRoundDurations).forEach(player => {
      // console.log(`[DEBUG-ROUND-TIME] Spieler ${player.name}: ${player.roundCount} Runden, Durchschnitt: ${player.totalDuration / player.roundCount}ms`);
    });

    // Berechne die durchschnittliche Rundendauer für die Gruppe
    const avgRoundDuration = totalRoundCount > 0 
      ? formatDurationForStats(totalRoundDurationMs / totalRoundCount) 
      : '-';

    // Berechne durchschnittliche Dauer pro Spieler und erstelle vollständige Rangliste
    const playerWithRoundDurationsRaw = Object.values(playerRoundDurations)
      .filter(p => p.roundCount >= MIN_EVENTS_FOR_QUOTIENT_HIGHLIGHT) // Mindestanzahl an Runden
      .map(p => ({
        id: p.playerId,
        name: p.name,
        value: p.roundCount > 0 ? p.totalDuration / p.roundCount : 0, // Durchschnittliche Dauer in ms
        displayValue: formatDurationForStats(p.roundCount > 0 ? p.totalDuration / p.roundCount : 0), // Formatierte Zeit
        eventsPlayed: p.roundCount // Hinzufügen der erforderlichen eventsPlayed-Eigenschaft
      }))
      .sort((a, b) => a.value - b.value); // Schnellste Spieler zuerst

    // Vollständige Rangliste aller Spieler
    const playerAllRoundTimes = [...playerWithRoundDurationsRaw];

    // Sortiere für schnellste Spieler (aufsteigend)
    const playerWithFastestRoundsList = [...playerWithRoundDurationsRaw]
      .slice(0, 3) // Nur die Top 3
      .map(p => ({
        id: p.id,
        name: p.name,
        value: p.value, // Behalte value als Zahl (Millisekunden)
        displayValue: p.displayValue, // Formatierte Zeit für die Anzeige
        eventsPlayed: p.eventsPlayed
      }));

    // Sortiere für langsamste Spieler (absteigend)
    const playerWithSlowestRoundsList = [...playerWithRoundDurationsRaw]
      .sort((a, b) => b.value - a.value) // Langsame Spieler zuerst
      .slice(0, 3) // Nur die Top 3
      .map(p => ({
        id: p.id,
        name: p.name,
        value: p.value, // Behalte value als Zahl (Millisekunden)
        displayValue: p.displayValue, // Formatierte Zeit für die Anzeige
        eventsPlayed: p.eventsPlayed
      }));

    return {
      memberCount,
      sessionCount,
      gameCount,
      totalPlayTime: formatDurationForStats(totalPlayTimeMillis),
      firstJassDate: firstJassDateMs ? getDateFromTimestamp(firstJassDateMs)?.toLocaleDateString('de-CH') || null : null,
      lastJassDate: lastJassDateMs ? getDateFromTimestamp(lastJassDateMs)?.toLocaleDateString('de-CH') || null : null,
      hauptspielortName: ermittelterHauptspielortName,
      avgSessionDuration,
      avgGameDuration,
      avgGamesPerSession,
      avgRoundsPerGame,
      avgMatschPerGame,
      avgRoundDuration,
      trumpfFarbenStatistik,
      playerWithMostGames: playerWithMostGamesList,
      playerWithHighestStricheDiff: playerWithHighestStricheDiffList,
      playerWithHighestWinRateSession: playerWithHighestWinRateSessionList,
      playerWithHighestWinRateGame: playerWithHighestWinRateGameList,
      playerWithHighestMatschRate: playerWithHighestMatschRateList,
      playerWithMostWeisPointsAvg: playerWithMostWeisPointsAvgList,
      playerWithFastestRounds: playerWithFastestRoundsList,
      playerWithSlowestRounds: playerWithSlowestRoundsList,
      playerAllRoundTimes: playerAllRoundTimes,
      teamWithHighestWinRateSession: teamWithHighestWinRateSessionList,
      teamWithHighestWinRateGame: teamWithHighestWinRateGameList,
      teamWithHighestMatschRate: teamWithHighestMatschRateList,
      teamWithMostWeisPointsAvg: teamWithMostWeisPointsAvgList,
    };
  } catch (error) {
    console.error('[fetchGroupStatistics] Fehler beim Abrufen der Gruppenstatistiken:', error);
    // Im Fehlerfall null oder leere Statistiken zurückgeben, je nach Anforderung
    // return null; 
    return createEmptyStatistics();
  }
}; 

// Aktualisierte Spielerstatistik-Schnittstelle
export interface PlayerStatistics {
  // Spielerübersicht
  totalSessions: number;
  totalGames: number;
  totalPlayTime: string; // formatierte Zeit
  firstJassDate: string | null; // formatiertes Datum
  lastJassDate: string | null; // formatiertes Datum
  groupCount: number;
  
  // Spiel-Leistung
  sessionsWon: number;
  sessionsTied: number;
  sessionsLost: number;
  gamesWon: number;
  gamesLost: number;
  sessionWinRate: number; // 0-1
  gameWinRate: number; // 0-1
  
  // Durchschnittswerte
  avgPointsPerGame: number;
  avgStrichePerGame: number;
  avgWeisPointsPerGame: number;
  avgMatschPerGame: number;
  
  // Highlights
  highestPoints: { value: number; gameId: string | null; date: string | null };
  highestWeisPoints: { value: number; gameId: string | null; date: string | null };
  highestStriche: { value: number; gameId: string | null; date: string | null };
  longestSession: { value: string; sessionId: string | null; date: string | null };
  
  // Per-Group Statistiken (Map mit Gruppen-ID als Schlüssel)
  groupStats: Map<string, {
    groupName: string;
    gamesPlayed: number;
    gamesWon: number;
    gameWinRate: number;
    avgPoints: number;
  }>;
}

// Funktion für leere Spielerstatistiken
export function createEmptyPlayerStatistics(): PlayerStatistics {
  return {
    totalSessions: 0,
    totalGames: 0,
    totalPlayTime: '-',
    firstJassDate: null,
    lastJassDate: null,
    groupCount: 0,
    
    sessionsWon: 0,
    sessionsTied: 0,
    sessionsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    sessionWinRate: 0,
    gameWinRate: 0,
    
    avgPointsPerGame: 0,
    avgStrichePerGame: 0,
    avgWeisPointsPerGame: 0,
    avgMatschPerGame: 0,
    
    highestPoints: { value: 0, gameId: null, date: null },
    highestWeisPoints: { value: 0, gameId: null, date: null },
    highestStriche: { value: 0, gameId: null, date: null },
    longestSession: { value: '-', sessionId: null, date: null },
    
    groupStats: new Map()
  };
}

// Hilfsfunktion zum Bestimmen des Teams eines Spielers in einer Session
function getPlayerTeamInSession(playerId: string, session: SessionSummary): 'top' | 'bottom' | null {
  // Prüfe zuerst, ob wir die Team-Struktur aus dem teams-Objekt lesen können - höchste Priorität
  if (session.teams && typeof session.teams === 'object') {
    const teamsData = session.teams as any;
    
    // Prüfe, ob der Spieler in Team A (bottom) ist
    if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players)) {
      if (teamsData.teamA.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom'; // Team A entspricht dem "bottom" Team
      }
    }
    
    // Prüfe, ob der Spieler in Team B (top) ist
    if (teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
      if (teamsData.teamB.players.some((p: any) => p.playerId === playerId)) {
        return 'top'; // Team B entspricht dem "top" Team
      }
    }
  }
  
  // Als nächstes pairingIdentifiers prüfen - beide Schreibweisen berücksichtigen
  if (session.pairingIdentifiers && typeof session.pairingIdentifiers === 'object') {
    const pairingData = session.pairingIdentifiers as any;
    
    // Prüfe "teamA" (klein geschrieben)
    if (pairingData.teamA && typeof pairingData.teamA === 'string') {
      const playerIds = pairingData.teamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "TeamA" (groß geschrieben)
    if (pairingData.TeamA && typeof pairingData.TeamA === 'string') {
      const playerIds = pairingData.TeamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "teamB" (klein geschrieben)
    if (pairingData.teamB && typeof pairingData.teamB === 'string') {
      const playerIds = pairingData.teamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
    
    // Prüfe "TeamB" (groß geschrieben)
    if (pairingData.TeamB && typeof pairingData.TeamB === 'string') {
      const playerIds = pairingData.TeamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
  }
  
  // Fallback auf die Position im Array
  if (!session.participantUids) return null;
  
  const playerIndex = session.participantUids.indexOf(playerId);
  if (playerIndex === -1) return null;
  
  // Konvention: Spieler 1 & 3 (Index 0 & 2) sind Team "bottom", Spieler 2 & 4 (Index 1 & 3) sind Team "top"
  return (playerIndex === 0 || playerIndex === 2) ? 'bottom' : 'top';
}

// Hilfsfunktion zum Bestimmen des Teams eines Spielers in einem Spiel - VERBESSERT
function getPlayerTeamInGame(playerId: string, game: CompletedGameSummary): 'top' | 'bottom' | null {
  // Prüfe zuerst, ob wir die Team-Struktur aus dem teams-Objekt lesen können - höchste Priorität
  if (game.teams && typeof game.teams === 'object') {
    const teamsData = game.teams as any;
    
    // Prüfe, ob der Spieler in Team A/bottom ist (alle möglichen Feldnamen berücksichtigen)
    if (teamsData.bottom?.players && Array.isArray(teamsData.bottom.players)) {
      if (teamsData.bottom.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom';
      }
    } else if (teamsData.teamA?.players && Array.isArray(teamsData.teamA.players)) {
      if (teamsData.teamA.players.some((p: any) => p.playerId === playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe, ob der Spieler in Team B/top ist (alle möglichen Feldnamen berücksichtigen)
    if (teamsData.top?.players && Array.isArray(teamsData.top.players)) {
      if (teamsData.top.players.some((p: any) => p.playerId === playerId)) {
        return 'top';
      }
    } else if (teamsData.teamB?.players && Array.isArray(teamsData.teamB.players)) {
      if (teamsData.teamB.players.some((p: any) => p.playerId === playerId)) {
        return 'top';
      }
    }
  }
  
  // Als nächstes pairingIdentifiers prüfen - beide Schreibweisen berücksichtigen
  const gameAny = game as any;
  if (gameAny.pairingIdentifiers && typeof gameAny.pairingIdentifiers === 'object') {
    const pairingData = gameAny.pairingIdentifiers;
    
    // Prüfe "teamA" (klein geschrieben) - entspricht 'bottom'
    if (pairingData.teamA && typeof pairingData.teamA === 'string') {
      const playerIds = pairingData.teamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "TeamA" (groß geschrieben) - entspricht 'bottom'
    if (pairingData.TeamA && typeof pairingData.TeamA === 'string') {
      const playerIds = pairingData.TeamA.split('_');
      if (playerIds.includes(playerId)) {
        return 'bottom';
      }
    }
    
    // Prüfe "teamB" (klein geschrieben) - entspricht 'top'
    if (pairingData.teamB && typeof pairingData.teamB === 'string') {
      const playerIds = pairingData.teamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
    
    // Prüfe "TeamB" (groß geschrieben) - entspricht 'top'
    if (pairingData.TeamB && typeof pairingData.TeamB === 'string') {
      const playerIds = pairingData.TeamB.split('_');
      if (playerIds.includes(playerId)) {
        return 'top';
      }
    }
  }
  
  // Verbesserter Fallback: Prüfe auf playerPositions oder gameSettings
  if (gameAny.playerPositions && typeof gameAny.playerPositions === 'object') {
    for (const [position, pid] of Object.entries(gameAny.playerPositions)) {
      if (pid === playerId) {
        // Konvention: Positionen 1 & 3 sind Team 'bottom', 2 & 4 sind Team 'top'
        const posNum = parseInt(position, 10);
        if (posNum === 1 || posNum === 3) return 'bottom';
        if (posNum === 2 || posNum === 4) return 'top';
      }
    }
  }
  
  // Letzter Fallback: Positionen im participantUids-Array
  if (!game.participantUids) return null;
  
  const playerIndex = game.participantUids.indexOf(playerId);
  if (playerIndex === -1) return null;
  
  // Konvention: Spieler 1 & 3 (Index 0 & 2) sind Team "bottom", Spieler 2 & 4 (Index 1 & 3) sind Team "top"
  return (playerIndex === 0 || playerIndex === 2) ? 'bottom' : 'top';
}

interface GameWithId extends CompletedGameSummary {
  id: string;
  timestamp?: number;
}

// Hauptfunktion zum Abrufen der Spielerstatistiken
export const fetchPlayerStatistics = async (playerId: string): Promise<PlayerStatistics | null> => {
  try {
    // Alle Sessions abrufen, an denen der Spieler teilgenommen hat
    const db = getFirestore(firebaseApp);
    const sessionsCollection = collection(db, 'jassSessions');
    const sessionsQuery = query(
      sessionsCollection,
      where('participantUids', 'array-contains', playerId),
      // Nur abgeschlossene Sessions berücksichtigen
      where('status', 'in', ['completed']),
      orderBy('startedAt', 'desc')
    );
    
    const sessionsSnapshot = await getDocs(sessionsQuery);
    const playerSessions: SessionSummary[] = [];
    
    sessionsSnapshot.forEach(doc => {
      const sessionData = doc.data() as SessionSummary;
      sessionData.id = doc.id;
      playerSessions.push(sessionData);
    });
    
    if (playerSessions.length === 0) {
      // console.log(`[fetchPlayerStatistics] Keine Sessions gefunden für Spieler: ${playerId}`);
      return createEmptyPlayerStatistics();
    }
    
    // Alle Spiele für diese Sessions abrufen
    const gamesBySession: Map<string, CompletedGameSummary[]> = new Map();
    const allPlayerGames: CompletedGameSummary[] = [];
    
    // Gruppiere alle Sessions nach Gruppen-ID
    const groupsMap = new Map<string, {
      groupId: string;
      groupName: string | null;
      sessions: SessionSummary[];
      games: CompletedGameSummary[];
    }>();
    
    // Initialisiere die Statistik mit leeren Werten
    const stats = createEmptyPlayerStatistics();
    
    // Setze grundlegende Werte
    stats.totalSessions = playerSessions.length;
    
    // Verarbeite alle Sessions des Spielers
    for (const session of playerSessions) {
      // Füge die Session der entsprechenden Gruppe hinzu
      const groupId = session.groupId || 'unknown';
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId,
          groupName: null, // Einfach null verwenden anstatt session.groupName
          sessions: [],
          games: []
        });
      }
      groupsMap.get(groupId)!.sessions.push(session);
      
      // Lade alle Spiele dieser Session
      const games = await fetchAllGamesForSession(session.id);
      if (games.length > 0) {
        gamesBySession.set(session.id, games);
        allPlayerGames.push(...games);
        
        // Füge die Spiele auch zur Gruppenstatistik hinzu
        groupsMap.get(groupId)!.games.push(...games);
      }
      
      // Bestimme das Team des Spielers in der Session
      const playerTeam = getPlayerTeamInSession(playerId, session);
      
      // Ergebnis der Session für den Spieler bestimmen
      if (playerTeam && session.finalScores) {
        if (session.finalScores.top === session.finalScores.bottom) {
          stats.sessionsTied++;
        } else if ((playerTeam === 'top' && session.finalScores.top > session.finalScores.bottom) ||
                   (playerTeam === 'bottom' && session.finalScores.bottom > session.finalScores.top)) {
          stats.sessionsWon++;
        } else {
          stats.sessionsLost++;
        }
      }
    }
    
    // Gruppenzählung aktualisieren
    stats.groupCount = groupsMap.size;
    
    // Zeitraum-Berechnungen
    let firstJassDateMs: number | null = null;
    let lastJassDateMs: number | null = null;
    
    const validSessionDates = playerSessions
      .map(s => s.startedAt)
      .filter(d => d !== null) as number[];
      
    if (validSessionDates.length > 0) {
      firstJassDateMs = Math.min(...validSessionDates);
      
      const validEndDates = playerSessions
        .map(s => s.endedAt || s.startedAt) // Fallback auf startedAt falls endedAt fehlt
        .filter(d => d !== null) as number[];
      if (validEndDates.length > 0) {
        lastJassDateMs = Math.max(...validEndDates);
      }
    }
    
    if (firstJassDateMs) {
      stats.firstJassDate = getDateFromTimestamp(firstJassDateMs)?.toLocaleDateString('de-CH') || null;
    }
    
    if (lastJassDateMs) {
      stats.lastJassDate = getDateFromTimestamp(lastJassDateMs)?.toLocaleDateString('de-CH') || null;
    }
    
    // Spielstatistiken berechnen
    stats.totalGames = allPlayerGames.length;
    
    // Gesamtspielzeit berechnen
    let totalPlayTimeMillis = 0;
    let maxSessionDurationMillis = 0;
    let longestSessionId: string | null = null;
    let longestSessionDate: number | null = null;
    
    // Variablen für Spiel-Höchstwerte
    let maxPoints = 0;
    let maxPointsGameId: string | null = null;
    let maxPointsDate: number | null = null;
    
    let maxWeisPoints = 0;
    let maxWeisPointsGameId: string | null = null;
    let maxWeisPointsDate: number | null = null;
    
    let maxStriche = 0;
    let maxStricheGameId: string | null = null;
    let maxStricheDate: number | null = null;
    
    playerSessions.forEach(session => {
      // Berechne Dauer der Session
      if (session.startedAt && session.endedAt) {
        const sessionDuration = session.endedAt - session.startedAt;
        totalPlayTimeMillis += sessionDuration;
        
        // Prüfe, ob dies die längste Session ist
        if (sessionDuration > maxSessionDurationMillis) {
          maxSessionDurationMillis = sessionDuration;
          longestSessionId = session.id;
          longestSessionDate = session.startedAt;
        }
      }
    });
    
    // Aktualisiere die Spielzeit-Statistiken
    stats.totalPlayTime = formatDurationForStats(totalPlayTimeMillis);
    if (maxSessionDurationMillis > 0) {
      stats.longestSession = {
        value: formatDurationForStats(maxSessionDurationMillis),
        sessionId: longestSessionId,
        date: longestSessionDate ? getDateFromTimestamp(longestSessionDate)?.toLocaleDateString('de-CH') || null : null
      };
    }
    
    // Auswertung der Spiele
    let totalPlayerPoints = 0;
    let totalPlayerStriche = 0;
    let totalPlayerWeis = 0;
    let totalPlayerMatsch = 0;
    
    allPlayerGames.forEach(game => {
      const playerTeam = getPlayerTeamInGame(playerId, game);
      if (!playerTeam) return; // Überspringe Spiele, in denen der Spieler nicht eindeutig identifiziert werden kann
      
      // Bestimme das Spielergebnis
      const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
      if (gameWinningTeam === playerTeam) {
        stats.gamesWon++;
      } else if (gameWinningTeam !== 'draw') {
        stats.gamesLost++;
      }
      
      // Sammle Punkte und Statistiken
      const teamScores = playerTeam === 'top' ? game.finalScores?.top : game.finalScores?.bottom;
      const teamStriche = playerTeam === 'top' ? game.finalStriche?.top : game.finalStriche?.bottom;
      
      // Punkte aktualisieren
      if (teamScores) {
        totalPlayerPoints += teamScores;
        
        // Höchstpunktezahl prüfen
        if (teamScores > maxPoints) {
          maxPoints = teamScores;
          maxPointsGameId = (game as GameWithId).id || null;
          maxPointsDate = (game as GameWithId).timestamp || null;
        }
      }
      
      // Striche berechnen
      if (teamStriche) {
        // KORREKTUR: Verwende die Standardwerte aus der Konfiguration
        const strokeSettings = {
          kontermatsch: DEFAULT_STROKE_SETTINGS.kontermatsch, // Standardwert aus der Konfiguration
          schneider: DEFAULT_STROKE_SETTINGS.schneider     // Standardwert aus der Konfiguration
        };
        // NEU: Verwende Standard-scoreEnabledSettings
        const scoreEnabledSettings = {
            berg: DEFAULT_SCORE_SETTINGS.enabled.berg,
            schneider: DEFAULT_SCORE_SETTINGS.enabled.schneider
        };
        
        // Berechne Striche mit den Multiplikatoren und aktivierten Regeln
        const totalStriche = calculateTotalStriche(teamStriche, strokeSettings, scoreEnabledSettings);
        totalPlayerStriche += totalStriche;
        
        // Höchste Striche prüfen
        if (totalStriche > maxStriche) {
          maxStriche = totalStriche;
          maxStricheGameId = (game as GameWithId).id || null;
          maxStricheDate = (game as GameWithId).timestamp || null;
        }
        
        // Matsch zählen
        if (teamStriche.matsch) {
          totalPlayerMatsch += teamStriche.matsch;
        }
      }
      
      // Weis-Punkte mit der zentralen Funktion extrahieren
      const gameWeisPoints = extractWeisPointsFromGameData(playerTeam, game);
      
      // Füge die Weis-Punkte zur Gesamtsumme hinzu und aktualisiere ggf. den Höchstwert
      totalPlayerWeis += gameWeisPoints;
      if (gameWeisPoints > maxWeisPoints) {
        maxWeisPoints = gameWeisPoints;
          maxWeisPointsGameId = (game as GameWithId).id || null;
          maxWeisPointsDate = (game as GameWithId).timestamp || null;
      }
    });
    
    // Durchschnittswerte berechnen
    if (stats.totalGames > 0) {
      stats.avgPointsPerGame = parseFloat((totalPlayerPoints / stats.totalGames).toFixed(1));
      stats.avgStrichePerGame = parseFloat((totalPlayerStriche / stats.totalGames).toFixed(1));
      stats.avgWeisPointsPerGame = parseFloat((totalPlayerWeis / stats.totalGames).toFixed(1));
      stats.avgMatschPerGame = parseFloat((totalPlayerMatsch / stats.totalGames).toFixed(2));
    }
    
    // Gewinnraten berechnen
    stats.sessionWinRate = stats.totalSessions > 0 ? stats.sessionsWon / stats.totalSessions : 0;
    stats.gameWinRate = stats.totalGames > 0 ? stats.gamesWon / stats.totalGames : 0;
    
    // Höchstwerte aktualisieren
    stats.highestPoints = {
      value: maxPoints,
      gameId: maxPointsGameId,
      date: maxPointsDate ? getDateFromTimestamp(maxPointsDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    stats.highestWeisPoints = {
      value: maxWeisPoints,
      gameId: maxWeisPointsGameId,
      date: maxWeisPointsDate ? getDateFromTimestamp(maxWeisPointsDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    stats.highestStriche = {
      value: maxStriche,
      gameId: maxStricheGameId,
      date: maxStricheDate ? getDateFromTimestamp(maxStricheDate)?.toLocaleDateString('de-CH') || null : null
    };
    
    // Gruppenstatistiken berechnen
    for (const [groupId, groupData] of groupsMap.entries()) {
      const groupGamesCount = groupData.games.length;
      if (groupGamesCount === 0) continue;
      
      let groupGamesWon = 0;
      let groupTotalPoints = 0;
      
      groupData.games.forEach(game => {
        const playerTeam = getPlayerTeamInGame(playerId, game);
        if (!playerTeam) return;
        
        // Zähle gewonnene Spiele
        const gameWinningTeam = determineWinningTeam(game.finalScores || { top: 0, bottom: 0 });
        if (gameWinningTeam === playerTeam) {
          groupGamesWon++;
        }
        
        // Sammle Punkte
        const teamScores = playerTeam === 'top' ? game.finalScores?.top : game.finalScores?.bottom;
        if (teamScores) {
          groupTotalPoints += teamScores;
        }
      });
      
      // Füge Gruppenstatistik hinzu
      stats.groupStats.set(groupId, {
        groupName: groupData.groupName || `Gruppe ${groupId.substring(0, 4)}`,
        gamesPlayed: groupGamesCount,
        gamesWon: groupGamesWon,
        gameWinRate: groupGamesCount > 0 ? groupGamesWon / groupGamesCount : 0,
        avgPoints: groupGamesCount > 0 ? parseFloat((groupTotalPoints / groupGamesCount).toFixed(1)) : 0
      });
    }
    
    return stats;
    
  } catch (error) {
    console.error('[fetchPlayerStatistics] Fehler beim Abrufen der Spielerstatistiken:', error);
    return createEmptyPlayerStatistics();
  }
}; 