import * as admin from "firebase-admin";

// Basis-Typ für Highlight/Lowlight Einträge mit Datum und optionaler Spiel/Session ID
export interface StatHighlight {
  type: string; // z.B. "longest_win_streak_games", "highest_striche_session", "tournament_win"
  value: number | string; // Der numerische oder String-Wert des Highlights
  stringValue?: string; // Zusätzlicher String-Wert, z.B. Teamname bei Turniersieg
  date: admin.firestore.Timestamp; // Datum des Highlights als Firestore Timestamp
  relatedId?: string; // ID des zugehörigen Spiels, der Session oder des Turniers
  label: string; // Benutzerfreundliche Beschreibung des Highlights
}

// NEU: Strukturierte Win-Rate Information mit Bruch-Anzeige
export interface WinRateInfo {
  wins: number;           // Anzahl Siege
  total: number;          // Gesamtanzahl entschiedener Spiele/Sessions
  rate: number;           // Win-Rate als Dezimalzahl (0-1)
  displayText: string;    // Formatierter Text: "4/6 = 66.7%"
}

export interface StatHighlightString {
  value: string;
  date: admin.firestore.Timestamp | null;
  relatedId?: string;
}

export interface StatStreak {
  value: number;
  startDate?: admin.firestore.Timestamp | null;
  endDate?: admin.firestore.Timestamp | null;
  startSessionId?: string; // NEU: Session-ID der ersten Session der Serie
  endSessionId?: string;   // NEU: Session-ID der letzten Session der Serie
  // relatedIds?: string[]; // z.B. eine Liste von gameIds oder sessionIds
}

// NEU: Interface für aggregierte Partnerstatistiken
export interface PartnerAggregate {
  partnerId: string;
  partnerDisplayName: string; // Den Namen speichern wir zur einfacheren Anzeige, könnte aber auch dynamisch geladen werden
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  gamesPlayedWith: number; // Anzahl der einzelnen Spiele zusammen
  gamesWonWith: number;
  totalStricheDifferenceWith: number; // Summe der Strichdifferenz aus Sicht des Profil-Spielers, wenn mit diesem Partner gespielt
  totalPointsWith: number; // Summe der Punkte des Teams, wenn mit diesem Partner gespielt
  totalPointsDifferenceWith: number; // NEU: Punktdifferenz statt akkumulierte Punkte
  matschGamesWonWith: number;
  schneiderGamesWonWith: number;
  kontermatschGamesWonWith: number; // NEU: Anzahl Kontermatsch-Spiele mit diesem Partner gewonnen
  // NEU: Event-Bilanz-Felder
  matschEventsMadeWith: number; // Anzahl Matsch-Events, die das Team gemacht hat
  matschEventsReceivedWith: number; // Anzahl Matsch-Events, die das Team erhalten hat
  schneiderEventsMadeWith: number; // Anzahl Schneider-Events, die das Team gemacht hat
  schneiderEventsReceivedWith: number; // Anzahl Schneider-Events, die das Team erhalten hat
  kontermatschEventsMadeWith: number; // Anzahl Kontermatsch-Events, die das Team gemacht hat
  kontermatschEventsReceivedWith: number; // Anzahl Kontermatsch-Events, die das Team erhalten hat
  lastPlayedWithTimestamp: admin.firestore.Timestamp;
  sessionWinRate?: number; // NEU
  gameWinRate?: number; // NEU
  // === NEU: Strukturierte Win-Rate Informationen ===
  sessionWinRateInfo?: WinRateInfo; // Detaillierte Session Win-Rate mit Partner
  gameWinRateInfo?: WinRateInfo;    // Detaillierte Game Win-Rate mit Partner
  matschBilanz: number;
  schneiderBilanz: number;
  kontermatschBilanz: number;
}

// NEU: Interface für aggregierte Gegnerstatistiken
export interface OpponentAggregate {
  opponentId: string;
  opponentDisplayName: string; // Den Namen speichern wir zur einfacheren Anzeige
  sessionsPlayedAgainst: number; // Anzahl Partien, in denen dieser Spieler ein Gegner war
  sessionsWonAgainst: number;    // Anzahl Partien, die der Profil-Spieler GEGEN diesen Gegner gewonnen hat
  gamesPlayedAgainst: number;    // Anzahl Spiele, in denen dieser Spieler ein Gegner war
  gamesWonAgainst: number;       // Anzahl Spiele, die der Profil-Spieler GEGEN diesen Gegner gewonnen hat
  totalStricheDifferenceAgainst: number; // Summe der Strichdifferenz aus Sicht des Profil-Spielers GEGEN diesen Gegner
  totalPointsScoredWhenOpponent: number; // Summe der Punkte des Profil-Spielers, wenn dieser Gegner im anderen Team war
  totalPointsDifferenceAgainst: number; // NEU: Punktdifferenz gegen diesen Gegner
  matschGamesWonAgainstOpponentTeam: number; // Anzahl Matsch-Spiele, die das Team des Profil-Spielers GEGEN das Team dieses Gegners gewonnen hat
  schneiderGamesWonAgainstOpponentTeam: number; // Anzahl Schneider-Spiele analog
  kontermatschGamesWonAgainstOpponentTeam: number; // NEU: Anzahl Kontermatsch-Spiele gegen diesen Gegner gewonnen
  // NEU: Event-Bilanz-Felder
  matschEventsMadeAgainst: number; // Anzahl Matsch-Events, die das Team gegen diesen Gegner gemacht hat
  matschEventsReceivedAgainst: number; // Anzahl Matsch-Events, die das Team gegen diesen Gegner erhalten hat
  schneiderEventsMadeAgainst: number; // Anzahl Schneider-Events, die das Team gegen diesen Gegner gemacht hat
  schneiderEventsReceivedAgainst: number; // Anzahl Schneider-Events, die das Team gegen diesen Gegner erhalten hat
  kontermatschEventsMadeAgainst: number; // Anzahl Kontermatsch-Events, die das Team gegen diesen Gegner gemacht hat
  kontermatschEventsReceivedAgainst: number; // Anzahl Kontermatsch-Events, die das Team gegen diesen Gegner erhalten hat
  lastPlayedAgainstTimestamp: admin.firestore.Timestamp;
  sessionWinRate?: number; // NEU
  gameWinRate?: number; // NEU
  // === NEU: Strukturierte Win-Rate Informationen ===
  sessionWinRateInfo?: WinRateInfo; // Detaillierte Session Win-Rate gegen Gegner
  gameWinRateInfo?: WinRateInfo;    // Detaillierte Game Win-Rate gegen Gegner
  matschBilanz: number;
  schneiderBilanz: number;
  kontermatschBilanz: number;
}

export interface TournamentPlacement {
  tournamentId: string;
  tournamentName: string;
  rank: number;
  totalParticipants: number; // Beibehaltung für generelle Kompatibilität, aber für neue Logik siehe totalRankedEntities
  totalRankedEntities?: number; // NEU: Genaue Anzahl der im Ranking berücksichtigten Entitäten
  date: admin.firestore.Timestamp;
  teamName?: string; // Optional, falls es ein Team-Turnier war

  // NEU: Sammlung von bemerkenswerten Ereignissen/Highlights
  highlights: StatHighlight[];

  // NEU: Aggregierte Statistiken für Partner und Gegner
  partnerAggregates?: PartnerAggregate[];
  opponentAggregates?: OpponentAggregate[];
}

// ✅ NEU: Exportiert für die Verwendung im Calculator
export interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

export interface PlayerComputedStats {
  // === Letzte Aktivität ===
  lastUpdateTimestamp: admin.firestore.Timestamp; // Wann wurden diese Stats zuletzt berechnet
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;
  playerName: string | null; // NEU: Spielername für Firebase-Suche

  // === Zählstatistiken Allgemein ===
  totalSessions: number;          // Anzahl gespielter Partien
  totalTournaments: number;       // ✅ NEU: Anzahl gespielter Turniere (separate Zählung)
  totalGames: number;             // Anzahl aller gespielten Spiele (Runden) über alle Sessions UND Turniere
  totalPlayTimeSeconds: number;   // Gesamte Spielzeit in Sekunden (Sessions + Turniere)

  // === Zählstatistiken Partien (Sessions) ===
  sessionWins: number;
  sessionTies: number;
  sessionLosses: number;

  // === Zählstatistiken Spiele (Runden) ===
  gameWins: number;
  gameLosses: number;
  // Unentschiedene Spiele gibt es im Jass typischerweise nicht auf Stufe einzelner Spiele,
  // sondern nur auf Stufe Partien.

  // === Ergebnisbasierte Statistiken ===
  totalStricheMade: number;         // Summe aller gemachten Striche (positiv)
  totalStricheReceived: number;     // Summe aller erhaltenen Striche (negativ)
  totalStricheDifference: number;   // totalStricheMade - totalStricheReceived

  totalPointsMade: number;          // Summe aller gemachten Punkte
  totalPointsReceived: number;      // Summe aller erhaltenen Punkte
  totalPointsDifference: number;    // totalPointsMade - totalPointsReceived

  playerTotalWeisMade: number;        // NEU: Summe aller Weispunkte des Spielers

  // ✅ NEU: Bilanz-Felder für absolute Zahlen (analog zu Group-Statistiken)
  totalMatschEventsMade: number;
  totalMatschEventsReceived: number;
  matschBilanz: number;             // ✅ NEU: totalMatschEventsMade - totalMatschEventsReceived
  
  totalSchneiderEventsMade: number;
  totalSchneiderEventsReceived: number;
  schneiderBilanz: number;          // ✅ NEU: totalSchneiderEventsMade - totalSchneiderEventsReceived
  
  totalKontermatschEventsMade: number;
  totalKontermatschEventsReceived: number;
  kontermatschBilanz: number;       // ✅ NEU: totalKontermatschEventsMade - totalKontermatschEventsReceived

  // NEU: Zähler für aktuelle Spiel-Streaks
  currentGameWinStreak: number;
  currentGameLossStreak: number;
  currentGameWinlessStreak: number;
  currentUndefeatedStreakGames: number;

  // NEU: Zähler für aktuelle Session-Streaks
  currentSessionWinStreak: number;
  currentSessionLossStreak: number;
  currentSessionWinlessStreak: number;
  currentUndefeatedStreakSessions: number;

  // === Durchschnittswerte pro Spiel ===
  avgPointsPerGame: number;         // Durchschnittliche Punkte pro Spiel
  avgStrichePerGame: number;        // Durchschnittliche Striche pro Spiel (positiv)
  avgMatschPerGame: number;         // Durchschnittliche Matsch-Striche pro Spiel
  avgSchneiderPerGame: number;      // Durchschnittliche Schneider-Striche pro Spiel
  avgWeisPointsPerGame: number;     // Durchschnittliche Weispunkte pro Spiel
  avgKontermatschPerGame: number;   // NEU
  avgRoundDurationMilliseconds: number; // ✅ NEU: Durchschnittliche Rundendauer in Millisekunden

  // === Turnierstatistiken ===
  totalTournamentsParticipated: number; // Anzahl Teilnahmen an Turnieren
  totalTournamentGamesPlayed: number;  // Anzahl gespielter Spiele/Passen in Turnieren
  tournamentWins: number;               // Anzahl gewonnener Turniere
  bestTournamentPlacement?: TournamentPlacement | null; // Beste erreichte Turnierplatzierung
  tournamentPlacements?: TournamentPlacement[]; // Letzte X Turnierplatzierungen

  // === Highlights & Lowlights - NUR NOCH AUF SESSION-EBENE ===
  longestWinStreakGames: StatStreak | null;
  longestUndefeatedStreakGames: StatStreak | null;
  longestLossStreakGames: StatStreak | null;
  longestWinlessStreakGames: StatStreak | null;
  
  highestPointsSession: StatHighlight | null;
  highestStricheSession: StatHighlight | null;
  mostMatschSession: StatHighlight | null;
  mostSchneiderSession: StatHighlight | null; // NEU
  mostKontermatschSession: StatHighlight | null; // NEU
  mostWeisPointsSession: StatHighlight | null;
  longestWinStreakSessions: StatStreak | null;
  longestUndefeatedStreakSessions: StatStreak | null;

  lowestPointsSession: StatHighlight | null;
  highestStricheReceivedSession: StatHighlight | null;
  mostMatschReceivedSession: StatHighlight | null;
  mostSchneiderReceivedSession: StatHighlight | null; // NEU
  mostKontermatschReceivedSession: StatHighlight | null; // NEU
  mostWeisPointsReceivedSession: StatHighlight | null;
  longestLossStreakSessions: StatStreak | null;
  longestWinlessStreakSessions: StatStreak | null;

  // === NEU: Zusätzliche Highlight-Felder für Differenzen ===
  highestPointsDifferenceSession: StatHighlight | null;
  lowestPointsDifferenceSession: StatHighlight | null;
  highestMatschDifferenceSession: StatHighlight | null;
  lowestMatschDifferenceSession: StatHighlight | null;
  highestStricheDifferenceSession: StatHighlight | null;
  lowestStricheDifferenceSession: StatHighlight | null;

  // === Win-Rates (KRITISCH: Unentschieden werden ausgeschlossen) ===
  sessionWinRate: number; // sessionWins / (sessionWins + sessionLosses)
  gameWinRate: number;    // gameWins / totalGames

  // === NEU: Strukturierte Win-Rate Informationen mit Bruch-Anzeige ===
  sessionWinRateInfo: WinRateInfo; // Detaillierte Session Win-Rate mit "X/Y = Z%" Format
  gameWinRateInfo: WinRateInfo;    // Detaillierte Game Win-Rate mit "X/Y = Z%" Format

  // NEU: Sammlung von bemerkenswerten Ereignissen/Highlights
  highlights: StatHighlight[];

  // NEU: Trumpffarben-Statistik
  trumpfStatistik: { [key: string]: number };
  totalTrumpfCount: number;

  // ❌ ENTFERNT: Initialisierung für Partner- und Gegnerstatistiken (redundant, Frontend liest aus Subcollections)
  // partnerAggregates?: PartnerAggregate[];
  // opponentAggregate?: OpponentAggregate[];
}

// Initialwerte für PlayerComputedStats
export const initialPlayerComputedStats: PlayerComputedStats = {
  lastUpdateTimestamp: admin.firestore.Timestamp.fromMillis(0),
  firstJassTimestamp: null,
  lastJassTimestamp: null,
  playerName: null, // NEU: Spielername für Firebase-Suche

  totalSessions: 0,
  totalTournaments: 0,
  totalGames: 0,
  totalPlayTimeSeconds: 0,

  sessionWins: 0,
  sessionTies: 0,
  sessionLosses: 0,

  gameWins: 0,
  gameLosses: 0,

  totalStricheMade: 0,
  totalStricheReceived: 0,
  totalStricheDifference: 0,

  totalPointsMade: 0,
  totalPointsReceived: 0,
  totalPointsDifference: 0,
  
  playerTotalWeisMade: 0,
  totalMatschEventsMade: 0,
  totalMatschEventsReceived: 0,
  matschBilanz: 0,
  totalSchneiderEventsMade: 0,
  totalSchneiderEventsReceived: 0,
  schneiderBilanz: 0,
  totalKontermatschEventsMade: 0,
  totalKontermatschEventsReceived: 0,
  kontermatschBilanz: 0,
  currentGameWinStreak: 0,
  currentGameLossStreak: 0,
  currentGameWinlessStreak: 0,
  currentUndefeatedStreakGames: 0,
  currentSessionWinStreak: 0,
  currentSessionLossStreak: 0,
  currentSessionWinlessStreak: 0,
  currentUndefeatedStreakSessions: 0,

  avgPointsPerGame: 0,
  avgStrichePerGame: 0,
  avgMatschPerGame: 0,
  avgSchneiderPerGame: 0,
  avgWeisPointsPerGame: 0,
  avgKontermatschPerGame: 0,
  avgRoundDurationMilliseconds: 0,

  totalTournamentsParticipated: 0,
  totalTournamentGamesPlayed: 0,
  tournamentWins: 0,
  bestTournamentPlacement: null,
  tournamentPlacements: [],

  longestWinStreakGames: null,
  longestUndefeatedStreakGames: null,
  longestLossStreakGames: null,
  longestWinlessStreakGames: null,

  highestPointsSession: null,
  highestStricheSession: null,
  mostMatschSession: null,
  mostSchneiderSession: null,
  mostKontermatschSession: null,
  mostWeisPointsSession: null,
  longestWinStreakSessions: null,
  longestUndefeatedStreakSessions: null,

  lowestPointsSession: null,
  highestStricheReceivedSession: null,
  mostMatschReceivedSession: null,
  mostSchneiderReceivedSession: null,
  mostKontermatschReceivedSession: null,
  mostWeisPointsReceivedSession: null,
  longestLossStreakSessions: null,
  longestWinlessStreakSessions: null,

  highlights: [],

  // NEU: Initialisierung für Trumpffarben
  trumpfStatistik: {},
  totalTrumpfCount: 0,

  // ❌ ENTFERNT: Initialisierung für Partner- und Gegnerstatistiken (redundant, Frontend liest aus Subcollections)
  // partnerAggregates: [],
  // opponentAggregates: [],

  // === Win-Rates (KRITISCH: Unentschieden werden ausgeschlossen) ===
  sessionWinRate: 0,
  gameWinRate: 0,

  // === NEU: Strukturierte Win-Rate Informationen mit Bruch-Anzeige ===
  sessionWinRateInfo: { wins: 0, total: 0, rate: 0, displayText: "" },
  gameWinRateInfo: { wins: 0, total: 0, rate: 0, displayText: "" },

  // === NEU: Zusätzliche Highlight-Felder für Differenzen ===
  highestPointsDifferenceSession: null,
  lowestPointsDifferenceSession: null,
  highestMatschDifferenceSession: null,
  lowestMatschDifferenceSession: null,
  highestStricheDifferenceSession: null,
  lowestStricheDifferenceSession: null,
}; 