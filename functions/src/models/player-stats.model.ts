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

export interface StatHighlightString {
  value: string;
  date: admin.firestore.Timestamp | null;
  relatedId?: string;
}

export interface StatStreak {
  value: number;
  startDate?: admin.firestore.Timestamp | null;
  endDate?: admin.firestore.Timestamp | null;
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
  lastPlayedWithTimestamp: admin.firestore.Timestamp;
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
  lastPlayedAgainstTimestamp: admin.firestore.Timestamp;
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

export interface PlayerComputedStats {
  // === Letzte Aktivität ===
  lastUpdateTimestamp: admin.firestore.Timestamp; // Wann wurden diese Stats zuletzt berechnet
  firstJassTimestamp: admin.firestore.Timestamp | null;
  lastJassTimestamp: admin.firestore.Timestamp | null;

  // === Zählstatistiken Allgemein ===
  totalSessions: number;          // Anzahl gespielter Partien
  totalGames: number;             // Anzahl aller gespielten Spiele (Runden) über alle Sessions
  totalPlayTimeSeconds: number;   // Gesamte Spielzeit in Sekunden

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

  // NEU: Zähler für spezifische Spielereignisse (Basis für Durchschnittswerte)
  totalMatschGamesMade: number;     // Anzahl der Spiele, in denen der Spieler Matsch gemacht hat
  totalSchneiderGamesMade: number;  // Anzahl der Spiele, in denen der Spieler Schneider gemacht hat

  // NEU: Zähler für Kontermatsch-Ereignisse (Spiel-Ebene)
  totalKontermatschGamesMade: number;
  totalKontermatschGamesReceived: number;

  // NEU: Zähler für aktuelle Spiel-Streaks
  currentGameWinStreak: number;
  currentGameLossStreak: number;
  currentGameWinlessStreak: number;
  currentUndefeatedStreakGames: number; // NEU

  // NEU: Zähler für aktuelle Session-Streaks
  currentSessionWinStreak: number;
  currentSessionLossStreak: number;
  currentSessionWinlessStreak: number;
  currentUndefeatedStreakSessions: number; // NEU

  // === Durchschnittswerte pro Spiel ===
  avgPointsPerGame: number;         // Durchschnittliche Punkte pro Spiel
  avgStrichePerGame: number;        // Durchschnittliche Striche pro Spiel (positiv)
  avgMatschPerGame: number;         // Durchschnittliche Matsch-Striche pro Spiel
  avgSchneiderPerGame: number;      // Durchschnittliche Schneider-Striche pro Spiel
  avgWeisPointsPerGame: number;     // Durchschnittliche Weispunkte pro Spiel
  avgKontermatschPerGame: number;   // NEU

  // === Turnierstatistiken ===
  totalTournamentsParticipated: number; // Anzahl Teilnahmen an Turnieren
  totalTournamentGamesPlayed: number;  // Anzahl gespielter Spiele/Passen in Turnieren
  tournamentWins: number;               // Anzahl gewonnener Turniere
  bestTournamentPlacement?: TournamentPlacement | null; // Beste erreichte Turnierplatzierung
  tournamentPlacements?: TournamentPlacement[]; // Letzte X Turnierplatzierungen

  // === Highlights Spiele ===
  highestPointsGame: StatHighlight | null;          // Höchste Punktzahl in einem einzelnen Spiel
  highestStricheGame: StatHighlight | null;         // Höchste Strichzahl in einem einzelnen Spiel (positiv)
  mostMatschGame: StatHighlight | null;             // Meiste Matsch-Striche in einem Spiel
  mostSchneiderGame: StatHighlight | null;          // Meiste Schneider-Striche in einem Spiel
  mostWeisPointsGame: StatHighlight | null;         // Meiste Weispunkte in einem Spiel
  mostKontermatschMadeGame: StatHighlight | null; // NEU
  longestWinStreakGames: StatStreak | null;         // Längste Siegesserie (Spiele)
  longestUndefeatedStreakGames: StatStreak | null; // NEU: Längste Serie ohne Niederlage (Spiele)

  // === Lowlights Spiele ===
  lowestPointsGame: StatHighlight | null;           // Tiefste Punktzahl in einem einzelnen Spiel (kann negativ sein)
  highestStricheReceivedGame: StatHighlight | null; // Höchste erhaltene Strichzahl in einem Spiel
  mostMatschReceivedGame: StatHighlight | null;     // Meiste erhaltene Matsch-Striche in einem Spiel
  mostSchneiderReceivedGame: StatHighlight | null;  // Meiste erhaltene Schneider-Striche in einem Spiel
  mostWeisPointsReceivedGame: StatHighlight | null; // NEU: Meiste erhaltene Weispunkte in einem Spiel
  mostKontermatschReceivedGame: StatHighlight | null; // NEU
  longestLossStreakGames: StatStreak | null;        // Längste Niederlagenserie (Spiele)
  longestWinlessStreakGames: StatStreak | null;     // Längste Serie ohne Sieg (Spiele)
  lowestStricheGame: StatHighlight | null; // NEU: Wenigste gemachte Striche in einem Spiel
  lowestStricheReceivedGame: StatHighlight | null; // NEU: Wenigste erhaltene Striche in einem Spiel

  // === Highlights Partien (Sessions) ===
  highestPointsSession: StatHighlight | null;
  highestStricheSession: StatHighlight | null;
  mostMatschSession: StatHighlight | null;         // NEU: Höchste Anzahl Matsche in einer Partie
  mostWeisPointsSession: StatHighlight | null;     // NEU: Meiste Weispunkte in einer Partie
  longestWinStreakSessions: StatStreak | null;
  longestUndefeatedStreakSessions: StatStreak | null; // NEU: Längste Serie ohne Niederlage (Partien)

  // === Lowlights Partien (Sessions) ===
  lowestPointsSession: StatHighlight | null;
  highestStricheReceivedSession: StatHighlight | null;
  mostMatschReceivedSession: StatHighlight | null;           // NEU: Meiste erhaltene Matsch-Striche in einer Partie  
  mostWeisPointsReceivedSession: StatHighlight | null;       // NEU: Meiste erhaltene Weispunkte in einer Partie
  longestLossStreakSessions: StatStreak | null;
  longestWinlessStreakSessions: StatStreak | null;

  // === Zusätzliche Felder für Konsistenz mit Frontend (ggf. anpassen) ===
  // Diese Felder sind in ExtendedPlayerStats in [playerId].tsx, aber die Quelle/Berechnung muss geklärt werden.
  // Für die serverseitige Berechnung könnten einige davon redundant sein oder anders abgeleitet werden.
  // Beispiel: groupCount ist eher eine Eigenschaft des Players-Dokuments, nicht der ComputedStats.

  // avgTimePerRound?: string; // Wurde als "Gesamte Jass-Zeit" / "Anzahl Runden" interpretiert
  // sessionWinRate?: number; // Kann aus sessionWins / totalSessions berechnet werden
  // gameWinRate?: number; // Kann aus gameWins / totalGames berechnet werden

  // Hier könnten noch Felder für Partner-/Gegner-Toplisten (z.B. Top 3 Partner nach Siegen)
  // oder spezifische Zähler (wie oft mit X gespielt) hinzukommen,
  // aber das ist Teil der späteren Iteration für Partner-/Gegner-Stats.

  // NEU: Sammlung von bemerkenswerten Ereignissen/Highlights
  highlights: StatHighlight[];

  // NEU: Initialisierung für Partner- und Gegnerstatistiken
  partnerAggregates?: PartnerAggregate[];
  opponentAggregates?: OpponentAggregate[];
}

// Initialwerte für PlayerComputedStats
export const initialPlayerComputedStats: PlayerComputedStats = {
  lastUpdateTimestamp: admin.firestore.Timestamp.fromMillis(0),
  firstJassTimestamp: null,
  lastJassTimestamp: null,

  totalSessions: 0,
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
  totalMatschGamesMade: 0,
  totalSchneiderGamesMade: 0,
  totalKontermatschGamesMade: 0,
  totalKontermatschGamesReceived: 0,
  currentGameWinStreak: 0,
  currentGameLossStreak: 0,
  currentGameWinlessStreak: 0,
  currentUndefeatedStreakGames: 0, // NEU
  currentSessionWinStreak: 0,
  currentSessionLossStreak: 0,
  currentSessionWinlessStreak: 0,
  currentUndefeatedStreakSessions: 0, // NEU

  avgPointsPerGame: 0,
  avgStrichePerGame: 0,
  avgMatschPerGame: 0,
  avgSchneiderPerGame: 0,
  avgWeisPointsPerGame: 0,
  avgKontermatschPerGame: 0,

  totalTournamentsParticipated: 0,
  totalTournamentGamesPlayed: 0,
  tournamentWins: 0,
  bestTournamentPlacement: null,
  tournamentPlacements: [],

  highestPointsGame: null,
  highestStricheGame: null,
  mostMatschGame: null,
  mostSchneiderGame: null,
  mostWeisPointsGame: null,
  mostKontermatschMadeGame: null,
  longestWinStreakGames: null,
  longestUndefeatedStreakGames: null, // NEU

  lowestPointsGame: null,
  highestStricheReceivedGame: null,
  mostMatschReceivedGame: null,
  mostSchneiderReceivedGame: null,
  mostWeisPointsReceivedGame: null,
  mostKontermatschReceivedGame: null,
  longestLossStreakGames: null,
  longestWinlessStreakGames: null,
  lowestStricheGame: null,
  lowestStricheReceivedGame: null,

  highestPointsSession: null,
  highestStricheSession: null,
  mostMatschSession: null,
  mostWeisPointsSession: null,
  longestWinStreakSessions: null,
  longestUndefeatedStreakSessions: null, // NEU

  lowestPointsSession: null,
  highestStricheReceivedSession: null,
  mostMatschReceivedSession: null,
  mostWeisPointsReceivedSession: null,
  longestLossStreakSessions: null,
  longestWinlessStreakSessions: null,

  highlights: [],

  // NEU: Initialisierung für Partner- und Gegnerstatistiken
  partnerAggregates: [],
  opponentAggregates: [],
}; 