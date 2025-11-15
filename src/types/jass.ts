// src/types/jass.ts

import { StatisticId } from "./statistikTypes";
import { Timestamp, FieldValue } from "firebase/firestore";
// Importiere Default Settings
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings";
import { DEFAULT_FARBE_SETTINGS, FARBE_MODES } from "@/config/FarbeSettings";
import type { TeamCalculationResult } from "@/utils/teamCalculations";
import { DEFAULT_STROKE_SETTINGS } from "@/config/GameSettings"; // Importiere die Defaults

// +++ BENÖTIGTE TYPEN FÜR FirestoreGroup etc. (Wieder eingefügt) +++

// Beispielhafte Annahme für FirestoreMetadata:
export interface FirestoreMetadata {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | Timestamp
    | FieldValue
    | FirestoreMetadata;
}

// Beispielhafte Annahme für MemberInfo/GuestInfo (falls nicht schon vorhanden):
export type MemberInfo = {
  type: "member";
  uid: string;
  name: string;
  playerId?: string; // ✅ NEU: Player Document ID
};

export type GuestInfo = {
  type: "guest";
  name: string;
  email?: string | null;
  consent?: boolean;
};

// === NEU: JassSpruch Interface für strukturierte Spruch-Speicherung ===
export interface JassSpruch {
  text: string;           // Der generierte Spruch-Text
  icon: string;           // Passendes Emoji für den Spruch
  generatedAt: Timestamp; // Wann wurde der Spruch generiert
  version: 'v2';          // Version der Spruch-Generierung
  generatedBy: string;    // UserId des Nutzers, der den Spruch generiert hat
}
// === ENDE NEU ===

// +++ EINSTELLUNGS-TYPEN ZENTRAL DEFINIEREN +++

// Typ für Score-Einstellungen (Wieder eingefügt)
export type ScoreMode = "berg" | "sieg" | "schneider";
export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
  isFlipped?: boolean;
  matschBonus: boolean; // NEU: Matschbonus aktiviert/deaktiviert (Default: true)
}

// Typ für Strich-Einstellungen
export interface StrokeSettings {
  schneider: 0 | 1 | 2;
  kontermatsch: 0 | 1 | 2;
}

// === NEU: Typ für die Schlüssel exportieren ===
export type StrokeMode = keyof StrokeSettings;
// === ENDE NEU ===

// === NEU: Konstante für die Modi exportieren ===
export const STROKE_MODES: StrokeMode[] = ['schneider', 'kontermatsch'];
// === ENDE NEU ===

// +++ WEITERE BENÖTIGTE TYPEN (Wieder eingefügt/Definiert) +++

// Kartenstil-Definition
export type CardStyle = "DE" | "FR";

// === NEU: ID-Typen hinzufügen ===
export type PlayerId = string; // Eindeutige ID des Player-Dokuments
export type GroupId = string; // Eindeutige ID des Group-Dokuments
export type UserId = string; // Eindeutige ID des Firebase Auth Users (oft gleich wie in Firestore User Doc)
// === Ende NEU ===

// Basis für Firestore Dokumente
export interface FirebaseDocument {
  id: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue; 
  metadata?: FirestoreMetadata; // Annahme: FirestoreMetadata ist jetzt definiert
}

// Typ für Timer-Snapshot
export interface TimerSnapshot {
  elapsedJassTime: number;
  elapsedGameTime: number;
  elapsedRoundTime: number;
  totalPausedTime: number;
}

// Typ für Spieler-Info (Annahme: MemberInfo/GuestInfo sind jetzt definiert)
export type PlayerInfo = MemberInfo | GuestInfo | null;
export type GamePlayers = {
  1: PlayerInfo;
  2: PlayerInfo;
  3: PlayerInfo;
  4: PlayerInfo;
};

// +++ BESTEHENDE TYPEN (Rest der Datei) +++

// Basis-Typen
export type TeamPosition = "top" | "bottom";
export type PlayerNumber = 1 | 2 | 3 | 4;
export type PlayerNames = {
  1: string;
  2: string;
  3: string;
  4: string;
};

export type TeamPlayers = [PlayerNumber, PlayerNumber]; // Tuple Type für genau 2 Spieler

export interface TeamConfig {
  top: TeamPlayers;
  bottom: TeamPlayers;
}

// Standard-Konfiguration
export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  top: [2, 4], // Standard: Spieler 2 & 4 oben
  bottom: [1, 3], // Standard: Spieler 1 & 3 unten
} as const;

// Aktuelle Team-Konfiguration (wird zur Laufzeit gesetzt)
let ACTIVE_TEAM_CONFIG: TeamConfig = DEFAULT_TEAM_CONFIG;

// Setter für die Team-Konfiguration
export const setTeamConfig = (config: TeamConfig): void => {
  ACTIVE_TEAM_CONFIG = config;
};

// Getter für aktuelle Team-Konfiguration
export const getTeamConfig = (): TeamConfig => ACTIVE_TEAM_CONFIG;

// Hilfsfunktionen
export const getTeamForPlayer = (player: PlayerNumber): TeamPosition => {
  return ACTIVE_TEAM_CONFIG.top.includes(player) ? "top" : "bottom";
};

export const getNextPlayerInTeam = (
  currentPlayer: PlayerNumber,
): PlayerNumber => {
  const team = getTeamForPlayer(currentPlayer);
  const teamPlayers =
    team === "top" ? ACTIVE_TEAM_CONFIG.top : ACTIVE_TEAM_CONFIG.bottom;
  return teamPlayers[0] === currentPlayer ? teamPlayers[1] : teamPlayers[0];
};

export type JassColor =
  | "Misère"
  | "Eicheln"
  | "Rosen"
  | "Schellen"
  | "Schilten"
  | "Obe"
  | "Une"
  | "3x3"
  | "Quer"
  | "Slalom";

// === NEU: Interface für Spielzusammenfassung ===
export interface CompletedGameSummary {
  gameNumber: number;
  timestampCompleted: Timestamp | FieldValue; // Verwende FieldValue für serverTimestamp
  durationMillis: number;
  finalScores: TeamScores;
  finalStriche: { // Statt Record<TeamPosition, StricheRecord> explizit
    top: StricheRecord;
    bottom: StricheRecord;
  };
  eventCounts: EventCounts; // ✅ NEU: Explizite Event-Zähler für performante Statistiken
  weisPoints: TeamScores;
  startingPlayer: PlayerNumber;
  initialStartingPlayer: PlayerNumber; // Spieler, der das *erste* Spiel der Session begann
  playerNames: PlayerNames;
  trumpColorsPlayed: string[]; // Gespielte Farben als DB-Strings
  roundHistory: RoundEntry[]; // Detaillierte Rundenhistorie
  participantUids: string[]; // << NEU: Für Regel-Check ohne get()
  groupId: string | null;   // << NEU: Optional groupId für Kontext
  activeGameId: string; // << HINZUGEFÜGT: ID des zugehörigen activeGame Dokuments
  completedAt?: Timestamp; // NEU: Optionales Feld für den Abschlusszeitpunkt
  teams?: TeamConfig; // Behält die alte TeamConfig für Spiel-spezifische Layouts bei, falls nötig
                      // Nicht zu verwechseln mit SessionTeams für die gesamte Session
  
  // ✅ NEU: Aggregierte Daten auf Spiel-Ebene (optional für Rückwärtskompatibilität)
  totalRoundDurationMillis?: number;
  trumpfCountsByPlayer?: TrumpfCountsByPlayer;
  roundDurationsByPlayer?: RoundDurationsByPlayer;
  Rosen10player?: string | null; // ✅ NEU: Der erste Trumpf-Ansager dieses Spiels (Player Document ID)
  
  // 🎯 NEU: Felder aus jassGameSummaries (wie vom User gezeigt)
  gameResults?: Array<{
    gameNumber: number;
    topScore: number;
    bottomScore: number;
    winnerTeam: string;
  }>;
  gameWinsByTeam?: {
    top: number;
    bottom: number;
  };
  gameWinsByPlayer?: {
    [playerId: string]: {
      wins: number;
      losses: number;
    };
  };
  gamesPlayed?: number;
  durationSeconds?: number;
  winnerTeamKey?: 'top' | 'bottom' | 'draw';
  status?: 'completed' | 'active' | 'aborted';
  sessionTotalWeisPoints?: TeamScores;
  totalRounds?: number;
  aggregatedTrumpfCountsByPlayer?: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer?: RoundDurationsByPlayer;
  
  // jassSpruch Feld entfernt - Sprüche werden nicht mehr gespeichert, sondern immer fresh generiert
}
// === ENDE NEU ===

// Alle Strich-Kategorien als Union Type
export type StrichTyp =
  | "berg"
  | "sieg"
  | "matsch"
  | "schneider"
  | "kontermatsch";

// Vollständiger Record für Striche
export interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

// Update-Type für einzelne Strich-Änderungen
export interface StricheUpdate {
  readonly team: TeamPosition;
  readonly type: StrichTyp;
  readonly value: number; // Absoluter Wert!
}

// Aggregierte Striche über mehrere Spiele
export interface StricheTotals {
  top: StricheRecord;
  bottom: StricheRecord;
}

// Game-Update mit vollständigem Striche-Record
export interface GameUpdate {
  teams?: {
    top?: Partial<TeamStand>;
    bottom?: Partial<TeamStand>;
  };
  currentRound?: number;
  currentPlayer?: PlayerNumber;
  startingPlayer?: PlayerNumber;
  roundHistory?: RoundEntry[];
  isGameCompleted?: boolean;
  currentHistoryIndex?: number;
  historyState?: HistoryState;
  isGameStarted?: boolean;
  isRoundCompleted?: boolean;
  metadata?: GameMetadata;
}

export interface StatisticProps {
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[];
  currentGameId: number;
  onSwipe?: (direction: "left" | "right") => void;
}

export interface StatisticModule {
  id: StatisticId;
  title: string;
  component: React.FC<StatisticProps>;
  calculateData: (state: JassState) => TeamScores;
}

export interface TeamScores {
  top: number;
  bottom: number;
  weisPoints?: {
    top: number;
    bottom: number;
  };
}

export interface WeisAction {
  position: TeamPosition;
  points: number;
}

// Basis-Interface für gemeinsame Eigenschaften
export interface BaseRoundEntry {
  id: string;
  timestamp: number;
  roundId: number;
  startingPlayer: PlayerNumber;
  startingPlayerName?: string; // NEU: Name des Spielers, der diese Runde gestartet hat
  weisPoints: TeamScores;
  jassPoints: TeamScores;
  scores: TeamScores;
  weisActions: WeisAction[];
  currentPlayer: PlayerNumber;
  visualStriche: {
    top: VisualStricheCounts;
    bottom: VisualStricheCounts;
  };
  previousRoundId?: number;
  nextRoundId?: number;
  isActive?: boolean; // Flag, um aktuelle/gültige Runden zu kennzeichnen

  // Neue Tracking-Felder
  ansager?: PlayerNumber;
  startTime?: number;
  endTime?: number;
  playerTurns?: {
    player: PlayerNumber;
    startTime: number;
    endTime: number;
  }[];
  roundState: {
    roundNumber: number;
    nextPlayer: PlayerNumber;
  };
  striche: StricheState;
  timerSnapshot?: TimerSnapshot;
  actionType: "weis" | "jass";
  wasPaused?: boolean; // Flag für pausierte Runden (für Statistiken)
}

// Spezifische Typen für Weis und Jass
export interface WeisRoundEntry extends BaseRoundEntry {
  actionType: "weis";
  isRoundFinalized: false;
  isCompleted: false;
}

export interface JassRoundEntry extends BaseRoundEntry {
  actionType: "jass";
  isRoundFinalized: true;
  isCompleted: true;
  farbe: JassColor;
  cardStyle: CardStyle;
  strichInfo?: {
    team: TeamPosition;
    type: StrichTyp;
  };
}

// Der vereinigte Typ
export type RoundEntry = WeisRoundEntry | JassRoundEntry;

// NEU: Type Guard Funktion
export const isJassRoundEntry = (entry: RoundEntry): entry is JassRoundEntry => {
  return entry.actionType === 'jass';
};

export type FarbeMode =
  | "misère"
  | "eicheln"
  | "rosen"
  | "schellen"
  | "schilten"
  | "obe"
  | "une"
  | "dreimal"
  | "quer"
  | "slalom";

/**
 * Repräsentiert die eindeutigen IDs der verschiedenen Farbmodi/Trumpfarten.
 */
export type FarbeModeId = FarbeMode;
export type FarbeModeKey = FarbeModeId;

interface EmojiStyle {
  backgroundColor: string;
}

/**
 * Konfiguration für einen einzelnen Farbmodus.
 */
export interface FarbeSettingsConfig {
  id: FarbeModeKey; // Verwende den neuen Typ
  name: string;
  multiplier: number;
  order: number;
  emojiStyle?: Record<string, string>;
  standardStyle?: Record<string, string>;
  frStyle?: Record<string, string>;
}

/**
 * Typ für die Einstellungen der Farbmodi (Multiplikatoren).
 * Wird in config/FarbeSettings.ts konkretisiert.
 */
export type FarbeSettingsValues = Record<FarbeModeKey, number>;

export interface FarbeSettings {
  values: FarbeSettingsValues;
  cardStyle: CardStyle;
}

export interface SettingsTemplate<T> {
  values: T;
  isFlipped: boolean;
  isEnabled?: Record<string, boolean>;
}

export interface PlayerStats {
  striche: number;
  points: number;
}

export interface TeamStand {
  striche: StricheRecord;
  jassPoints: number;
  weisPoints: number;
  total: number;
  bergActive: boolean;
  bedankenActive: boolean;
  isSigned: boolean;
  playerStats: Record<
    PlayerNumber,
    {
      striche: number;
      points: number;
      weisPoints: number;
    }
  >;
}

// Bestehende metadata-Definition erweitern
export interface GameMetadata {
  duration?: number;
  completedAt?: number;
  roundStats: {
    weisCount: number;
    colorStats: Record<JassColor, number>;
  };
  // Weitere optionale Felder können hier hinzugefügt werden
}

// GameEntry Interface anpassen (metadata bleibt optional)
export interface GameEntry {
  id: number | string; // Kann lokal eine Zahl, online ein String sein
  gameNumber?: number; // Optional: Spielnummer innerhalb der Session
  activeGameId?: string; // ID des aktiven Firestore-Dokuments (nur wenn online & aktiv)
  timestamp: number;
  sessionId: string;
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  currentRound: number;
  startingPlayer: PlayerNumber; // Spieler, der die AKTUELLE Runde beginnt
  initialStartingPlayer: PlayerNumber; // Spieler, der das SPIEL begonnen hat
  currentPlayer: PlayerNumber; // Spieler, der als nächstes dran ist
  roundHistory: RoundEntry[]; // Korrigiert zu RoundEntry[]
  currentHistoryIndex: number;
  historyState: HistoryState;
  isGameStarted: boolean;
  isRoundCompleted: boolean;
  isGameCompleted: boolean;
  metadata?: GameMetadata; // Bleibt optional wie bisher

  // --- NEUE FELDER für Errungenschaften & Statistik ---
  gameMode?: JassColor; // Welcher Modus wurde angesagt? (Misère, Eicheln, Obe, etc.)
  trumpfColor?: JassColor; // Spezifische Trumpffarbe, falls gameMode ein Trumpfspiel ist
  startedAt?: Timestamp | FieldValue; // Zeitstempel Spielbeginn
  completedAt?: Timestamp | FieldValue; // Zeitstempel Spielende
  // --------------------------------------------------

  // NEU: Optionale Settings für den Viewer hinzufügen
  scoreSettings?: ScoreSettings;
  strokeSettings?: StrokeSettings;
  // TODO: cardStyle und farbeSettings könnten hier auch sinnvoll sein, falls der Viewer sie benötigt
}

// Jass State: Aggregierter Zustand über mehrere Spiele
export interface JassState {
  isJassStarted: boolean;
  currentSession: JassSession | null;
  currentRound: number;
  isJassCompleted: boolean;
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[];
  currentGameId: number;
  getCurrentGame: () => GameEntry | undefined;
  updateCurrentGame: (update: GameUpdate) => void;
}

export interface JassActions {
  // Initiales Starten eines Jass
  startJass: (config: {
    playerNames: PlayerNames;
    initialStartingPlayer: PlayerNumber;
    activeGameId?: string; // Hinzugefügt
  }) => void;

  // Für Folgespiele (umbenannt von startNewGame)
  startGame: (
    gamePlayers: GamePlayers,
    initialStartingPlayer: PlayerNumber,
  ) => void;

  // Game Management
  finalizeGame: () => void;
  resetJass: () => void;
  undoNewGame: () => void;

  // Navigation
  navigateToGame: (gameId: number) => void;
  navigateToPreviousGame: () => boolean;
  navigateToNextGame: () => boolean;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;

  // Calculations
  calculateTotalPoints: () => TeamScores;
  calculateTotalJassPoints: () => TeamScores;

  // Historie/Cache
  getGameHistory: () => GameEntry[];
  getCurrentGame: () => GameEntry | undefined;
  getVisibleGames: () => GameEntry[];

  // Store API
  getState: () => JassState;
  setState: (partial: Partial<JassState>) => void;
  subscribe: (listener: (state: JassState) => void) => () => void;

  // Session Management
  saveSession: () => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;

  // Point Management
  updateWeisPoints: (position: TeamPosition, points: number) => void;

  // Neue Action hinzufügen
  getTotalsUpToGame: (gameId: number) => GameTotals;

  // HIER die neue Action hinzufügen:
  startNextGame: (initialStartingPlayer: PlayerNumber) => void;
  // NEU: Methode zum Zurücksetzen der aktiven Spiel-ID für eine Session
  clearActiveGameForSession: (sessionId: string) => void;
}

export type JassStore = JassState & JassActions;

// Funktion anpassen: strokeSettings als Argument hinzufügen
export const convertToDisplayStriche = (
  striche: StricheRecord,
  strokeSettings: StrokeSettings = DEFAULT_STROKE_SETTINGS,
  scoreSettings: ScoreSettings = DEFAULT_SCORE_SETTINGS
) => {
  // MATSCH ist immer horizontal (Wert 1)
  const matschHorizontal = striche.matsch || 0;
  // KONTERMATSCH ist horizontal. Der Wert in striche.kontermatsch ist bereits der Endwert.
  const kontermatschHorizontal = striche.kontermatsch || 0; // KORREKTUR: Wert direkt übernehmen

  // BERG ist immer vertikal (Wert 1)
  const bergVertikal = striche.berg || 0;
  // SIEG ist auch immer vertikal, ABER mit Wert 1 (nicht 2!)
  const siegVertikal = striche.sieg || 0; // KORRIGIERT: Keine Multiplikation mit 2
  // SCHNEIDER ist vertikal, Wert aus Settings (1 oder 2)
  const schneiderVertikal = striche.schneider || 0; // <- Korrigierte Zeile

  // Gesamte horizontale und vertikale Striche berechnen
  const horizontal = matschHorizontal + kontermatschHorizontal;
  const vertikal = bergVertikal + siegVertikal + schneiderVertikal;
  
  const result = { horizontal, vertikal };
  return result;
};

// Visuelle Strich-Repräsentation
export type StrichValue = 20 | 50 | 100;
export interface VisualStricheCounts {
  stricheCounts: Record<StrichValue, number>;
  restZahl: number;
}

// Interface Definition
export interface HistoryState {
  lastNavigationTimestamp: number; // Kein null mehr erlaubt
  weisCache?: WeisAction[] | null; // Cache für Weis-Aktionen bei Navigation
}

// Hilfsfunktion für die Initialisierung
export const createInitialHistoryState = (): HistoryState => ({
  lastNavigationTimestamp: Date.now(), // Initialer Timestamp statt null
  weisCache: null, // Initialisiere weisCache als null
});

// Neue Type-Definition für die Striche-Struktur
export type StricheState = {
  top: StricheRecord;
  bottom: StricheRecord;
};

// Erweitern des GameState
export interface GameState {
  activeGameId?: string; // ID des Firestore-Dokuments, falls vorhanden
  currentPlayer: PlayerNumber;
  startingPlayer: PlayerNumber;
  initialStartingPlayer: PlayerNumber;
  isGameStarted: boolean;
  currentRound: number;
  weisPoints: TeamScores;
  jassPoints: TeamScores;
  scores: TeamScores;
  striche: Record<TeamPosition, StricheRecord>;
  roundHistory: RoundEntry[];
  currentRoundWeis: WeisAction[];
  isGameCompleted: boolean;
  isRoundCompleted: boolean;
  farbeSettings: FarbeSettings;
  scoreSettings: ScoreSettings;
  playerNames: PlayerNames;
  gamePlayers: GamePlayers | null;
  currentHistoryIndex: number;
  historyState: HistoryState;
  strokeSettings: StrokeSettings;
  // NEU: Aktuelle Spielfarbe der Runde
  farbe?: JassColor;
}

// Erweitern der GameActions
export interface GameActions {
  startGame: (
    gamePlayers: GamePlayers,
    initialStartingPlayer: PlayerNumber,
  ) => void;
  startRound: () => void;
  finalizeRound: (
    farbe: JassColor,
    topScore: number,
    bottomScore: number,
    strichInfo?: {
      team: TeamPosition;
      type: StrichTyp;
    },
  ) => void;
  updateScore: (
    team: TeamPosition,
    score: number,
    opponentScore: number,
  ) => void;
  addStrich: (team: TeamPosition, type: StrichTyp) => void;
  addWeisPoints: (team: TeamPosition, points: number) => void;
  undoLastWeis: () => void;
  finalizeGame: () => void;
  resetGame: (nextStarter: PlayerNumber, newActiveGameId?: string) => void;
  resetGamePoints: () => void;
  setScore: (team: TeamPosition, score: number) => void;
  setPlayerNames: (names: PlayerNames) => void;
  updateScoreByStrich: (position: TeamPosition, value: number) => void;
  showHistoryWarning: (
    message: string,
    onConfirm: () => void,
    onCancel: () => void,
  ) => void;
  getVisualStriche: (position: TeamPosition) => VisualStricheCounts;
  navigateHistory: (direction: "forward" | "backward") => void;
  canNavigateForward: () => boolean;
  canNavigateBackward: () => boolean;
  syncHistoryState: (entry: RoundEntry) => void;
  validateHistoryAction: () => boolean;
  jumpToLatest: () => void;
  logGameHistory: () => void;
  isBergActive: (team: TeamPosition) => boolean;
  isSiegActive: (team: TeamPosition) => boolean;

  // Berg und Sieg Aktionen
  addBerg: (team: TeamPosition) => void;
  addSieg: (team: TeamPosition) => void;
  addSchneider: (team: TeamPosition) => void;

  // Neue Aktion für Striche-Total
  getTotalStriche: (team: TeamPosition) => number;
  addMatsch: (team: TeamPosition) => void;
  addKontermatsch: (team: TeamPosition) => void;
  resetGameState: (playerNumber?: PlayerNumber) => void;
  rebuildStateFromHistory: (index: number) => void;
  setPlayers: (newPlayers: PlayerNames) => void;
  setScoreSettings: (settings: ScoreSettings) => void;
  setFarbeSettings: (settings: FarbeSettings) => void;
  getPlayerName: (playerNumber: PlayerNumber) => string;
}

export type GameStore = GameState & GameActions;

// Optional: Wenn wir History-spezifische UI-States brauchen
export interface HistoryNavigationState {
  isHistoryNavigationActive: boolean;
  currentSwipePosition: TeamPosition | null;
}

export const getFinalizedRounds = (history: RoundEntry[]): RoundEntry[] => {
  return history.filter((entry) => entry.isRoundFinalized);
};

// Neue Basis-Typen für die Gruppenhierarchie
export interface JassGruppe {
  id: string;
  name: string;
  createdAt: number;
  members: PlayerNames[];
  sessions: string[]; // Array von Session-IDs
  metadata: {
    location?: string;
    notes?: string;
    lastActive?: number;
  };
}

export interface JassSession {
  id: string;
  gruppeId: string;
  startedAt: number | Timestamp | FieldValue;
  endedAt?: number | Timestamp | FieldValue;
  playerNames: PlayerNames;
  games: (number | string)[];
  metadata: Record<string, any>;
  statistics: JassSessionStatistics;
  currentScoreLimit: number;
  completedGamesCount: number;
  isTournamentSession?: boolean;
  tournamentInstanceId?: string;
  participantUids?: string[];
  participantPlayerIds?: string[]; // ✅ Player Document IDs
  currentFarbeSettings?: FarbeSettings;
  currentScoreSettings?: ScoreSettings;
  currentStrokeSettings?: StrokeSettings;
  teams?: SessionTeams; // ✅ top/bottom structure
  sessionTotalWeisPoints?: TeamScores;
  status?: 'active' | 'completed' | 'completed_empty' | 'aborted';
  groupId?: string;
  finalScores?: TeamScores;
  finalStriche?: { top: StricheRecord; bottom: StricheRecord };
  winnerTeamKey?: 'top' | 'bottom' | 'draw';
  gamesPlayed?: number;
  durationSeconds?: number;
  eventCounts?: EventCounts; // ✅ Bereits vorhanden
  notes?: string[];
  pairingIdentifiers?: { top: string; bottom: string };
  
  // ✅ NEU: Der erste Trumpf-Ansager der Session  
  Rosen10player?: string | null;
  
  // ✅ NEU: Session-Level Aggregationen (optional für Rückwärtskompatibilität)
  totalRounds?: number;
  aggregatedTrumpfCountsByPlayer?: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer?: RoundDurationsByPlayer;
}

export interface JassSessionStatistics {
  gamesPlayed: number;
  totalDuration?: number;
  scores: {
    top: number;
    bottom: number;
  };
  mostPlayedColor?: JassColor;
  weisCount: number;
  stricheCount: Record<StrichTyp, number>;
}

// Nach den existierenden Types (ca. Zeile 200) hinzufügen:
export interface GameTotals {
  striche: {
    top: StricheRecord;
    bottom: StricheRecord;
  };
  punkte: {
    top: number;
    bottom: number;
  };
}

// Startspieler-bezogene Types
export interface StartingPlayerConfig {
  player: PlayerNumber;
  team: TeamPosition;
}

// Hilfsfunktion zur Validierung von PlayerNumber
export const isValidPlayerNumber = (num: number): num is PlayerNumber => {
  return num >= 1 && num <= 4;
};

// Startspieler-Rotation mit Type Guard
export const getNextPlayer = (current: PlayerNumber): PlayerNumber => {
  const next = (current % 4) + 1;
  return isValidPlayerNumber(next) ? next : 1;
};

// Hilfsfunktionen für determineNextStartingPlayer
export const determineWinningTeam = (game: GameEntry): TeamPosition | undefined => {
  if (game.teams.top.striche.sieg > 0) {
    return "top";
  } else if (game.teams.bottom.striche.sieg > 0) {
    return "bottom";
  }
  return undefined;
};

export const isPlayerInTeam = (player: PlayerNumber, team: TeamPosition): boolean => {
  return (
    (team === "top" && (player === 2 || player === 4)) ||
    (team === "bottom" && (player === 1 || player === 3))
  );
};

export const determineNextStartingPlayer = (
  lastGame: GameEntry | null,
  lastRoundFinishingPlayer: PlayerNumber
): PlayerNumber => {
  // Wenn kein vorheriges Spiel, einfach zum nächsten Spieler in der Reihenfolge
  if (!lastGame) {
    return getNextPlayer(lastRoundFinishingPlayer);
  }

  // Bestimme den nächsten Spieler in der Standardreihenfolge
  let nextPlayer = getNextPlayer(lastRoundFinishingPlayer);

  // Bestimme das Gewinnerteam
  const gewinnerTeam = determineWinningTeam(lastGame);
  
  // Wenn es ein Gewinnerteam gibt und der nächste Spieler diesem Team angehört,
  // überspringe ihn (gehe zum übernächsten Spieler)
  if (gewinnerTeam && isPlayerInTeam(nextPlayer, gewinnerTeam)) {
    nextPlayer = getNextPlayer(nextPlayer);
  }
  
  // Debugging-Log zur besseren Nachvollziehbarkeit
  // console.log(`[determineNextStartingPlayer] Last player: ${lastRoundFinishingPlayer}, Winner team: ${gewinnerTeam || 'none'}, Next player: ${nextPlayer}`);

  return nextPlayer;
};

// Startspieler-Management Types
export interface StartingPlayerState {
  currentPlayer: PlayerNumber; // Aktueller Spieler in dieser Runde
  startingPlayer: PlayerNumber; // Startspieler dieses Spiels
  initialStartingPlayer: PlayerNumber; // Allererster Startspieler des Jass
}

// Type Guard für Startspieler
export const isValidStartingPlayer = (
  player: unknown,
): player is PlayerNumber => {
  return isValidPlayerNumber(Number(player));
};

// Hilfsfunktion für initiale Startspieler-Werte
export const createInitialStartingPlayerState = (
  initialPlayer: PlayerNumber,
): StartingPlayerState => {
  if (!isValidStartingPlayer(initialPlayer)) {
    throw new Error("Ungültiger Startspieler");
  }

  return {
    currentPlayer: initialPlayer,
    startingPlayer: initialPlayer,
    initialStartingPlayer: initialPlayer,
  };
};

export interface SettingsTab {
  id: "farben" | "scores" | "strokes";
  title: string;
}

// Neue Types für Piktogramm-Settings
export interface PictogramConfig {
  isEnabled: boolean;
  mode: "svg" | "emoji";
}

// Erweitern der bestehenden Settings-Interfaces
export interface SettingsState {
  isOpen: boolean;
  activeTab: SettingsTab["id"];
  pictogramConfig: PictogramConfig;
}

// +++ FirestorePlayer ZENTRAL DEFINIEREN +++
export interface FirestorePlayer extends FirebaseDocument { // Stelle sicher, dass 'export' davor steht
  userId: string | null; // Verknüpfung zum Auth User
  displayName: string; // <-- Jetzt nicht mehr optional und das primäre Feld
  isGuest: boolean;
  groupIds: string[];
  stats?: { // stats ist optional
    gamesPlayed: number;
    wins: number;
    totalScore: number;
  };
  // --- Hinzugefügte Felder basierend auf authService.ts Fehlern ---
  lastActiveGroupId?: string | null; // Optional, kann null sein
  statusMessage?: string | null;   // Optional, kann null sein
  playerId?: string | null;      // Optional, Verknüpfung zum Spieler-Profil (falls separates Dokument)
  profileTheme?: string | null;  // NEU: Profilfarbe/Theme für die UI
  preferences?: {              // Optionales Objekt für Einstellungen
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
    // Weitere Präferenzen hier...
  };
  photoURL?: string | null; // Hinzugefügt, da in createOrUpdateFirestoreUser verwendet
  lastLogin?: FieldValue | Timestamp; // Hinzugefügt, da in createOrUpdateFirestoreUser verwendet
  // Optional: lastUpdated, wenn es konsistent verwendet wird
  lastUpdated?: FieldValue | Timestamp;
  // --------------------------------------------------------------
  gameCount?: number; // Hinzugefügt für die Anzahl der Spiele in der Gruppe
}

// +++ FirestoreGroup ZENTRAL DEFINIEREN (KORREKT EINGEFÜGT) +++
export interface FirestoreGroup extends FirebaseDocument {
  name: string;
  description?: string;
  logoUrl?: string;
  playerIds: string[];
  memberPlayerIds?: string[]; // ✅ NEU: Explizite Mitgliederliste (Player IDs)
  memberUids?: string[]; // ✅ NEU: Explizite Mitgliederliste (User IDs)
  adminIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isPublic?: boolean;
  mainLocationZip?: string; // Hinzugefügt für Hauptspielort PLZ
  scoreSettings?: ScoreSettings;
  strokeSettings?: StrokeSettings;
  farbeSettings?: FarbeSettings; 
  cardStyle?: CardStyle; // Hinzugefügt für Kartentyp-Einstellung
  createdBy?: string;
  // Hinzufügen eines Feldes für Spielerobjekte, falls benötigt
  players?: { [playerId: string]: { displayName: string; photoURL?: string; joinedAt?: Timestamp } };
  gameCount?: number; // Hinzugefügt für die Anzahl der Spiele in der Gruppe
  theme?: string; // NEU: Theme für Gruppen-Styling
  lastActivity?: FieldValue;
}

export type ChargeLevel = "none" | "low" | "medium" | "high" | "super" | "extreme";

export interface ChargeButtonActionProps {
  chargeDuration: {
    duration: number;
    level: ChargeLevel;
  };
  type: "berg" | "sieg";
  team: TeamPosition;
  isActivating: boolean;
}

// +++ NEUE DEFINITIONEN FÜR EFFEKTE +++

export type EffectType = "rain" | "explosion" | "cannon" | "firework"; // Zurück verschoben und exportiert

export interface EffectConfig {
  chargeLevel: ChargeLevel;
  team: TeamPosition;
  isFlipped?: boolean;
  effectType: EffectType; // Typ hinzugefügt
}

export const CHARGE_THRESHOLDS: Record<ChargeLevel, number> = {
  none: 0,
  low: 500,      // Beispielwerte, bitte prüfen!
  medium: 1500,
  high: 3000,
  super: 5000,
  extreme: 8000,
} as const;

// NEU: EffectParams hinzufügen und exportieren
export interface EffectParams {
  y: number;
  gravity: number;
  startVelocity: number;
  spread: number;
}

// NEU: GameEndType definieren und exportieren
export type GameEndType = "gameEnd" | "jassEnd";

// TimerAnalytics exportieren - Korrigierte, einfache Struktur!
export interface TimerAnalytics { 
  totalJassTime: number;
  currentGameDuration: number; // Nur diese beiden Felder werden zurückgegeben
}

// NEU: CardStyleMappings definieren und exportieren
export type CardStyleMappings = {
  readonly [key in JassColor]: {
    readonly DE: string;
    readonly FR: string;
  };
};

// NEU: JassSpruchParams exportieren (Definition existiert wahrscheinlich schon)
export interface JassSpruchParams extends Pick<TeamCalculationResult,
  "stricheDifference" |
  "pointDifference" |
  "winnerNames" |
  "loserNames" |
  "totalMatsche" |
  "gameStats" |
  "gesamtStand" |
  "previousGesamtStand"
> {
  isUnentschieden: boolean;
  isStricheMode: boolean;
  type: GameEndType;
  timerAnalytics: TimerAnalytics;
  isSchneider: boolean;
  matchCount: {
    team1: number;
    team2: number;
  };
}

export interface ActiveGame {
  groupId: string | null; // << NEU: groupId ist jetzt optional (null für Gastspiele)
  sessionId: string; // << NEU: Eindeutige ID der übergeordneten Jass-Session
  tournamentInstanceId?: string; // NEU: Optional, für Turnier-Passen
  currentGameNumber: number; // Spielnummer (oder Passe-Nummer im Turnier)
  passeTournamentNumber?: number; // ✅ KRITISCH: Passe-Nummer im Turnier (determiniert beim Start!)
  passeInRound?: string; // ✅ KRITISCH: Buchstabe (A, B, C...) - determiniert beim Start!
  participantUids: string[]; // ✅ Für Backend-Kompatibilität
  participantPlayerIds?: string[]; // ✅ NEU: Player Document IDs für moderne Verarbeitung
  status: 'live' | 'completed' | 'aborted';
  playerNames: PlayerNames;
  teams: {
    top: PlayerNumber[]; // IDs der Spieler im Top-Team
    bottom: PlayerNumber[]; // IDs der Spieler im Bottom-Team
  };
  scores: TeamScores; // Gesamtpunktzahl (Jass + Weis)
  striche: {
    top: StricheRecord;
    bottom: StricheRecord;
  };
  weisPoints: TeamScores; // Nur Weispunkte
  currentRoundWeis?: {position: TeamPosition, points: number}[]; // Weis-Aktionen der aktuellen Runde
  currentPlayer: PlayerNumber;
  currentRound: number;
  startingPlayer: PlayerNumber;
  initialStartingPlayer: PlayerNumber;
  currentJassPoints?: TeamScores; // Jass-Punkte der aktuellen Runde
  isRoundCompleted?: boolean;     // Status der aktuellen Runde
  gamePlayers?: GamePlayers | null; // Strukturierte Spielerdaten
  gameStartTime?: Timestamp | FieldValue; // NEU: Startzeit des Spiels (1. Runde)
  jassStartTime?: Timestamp | FieldValue; // NEU: Startzeit der gesamten Partie (1. Spiel)
  createdAt: Timestamp | FieldValue;
  lastUpdated: Timestamp | FieldValue;
  activeGameId?: string;
  // NEU: Hinzufügen der aktiven Einstellungen zum Typ
  activeScoreSettings?: ScoreSettings;
  activeStrokeSettings?: StrokeSettings;
  activeFarbeSettings?: FarbeSettings;
}

export interface RoundDataFirebase {
  roundNumber: number;
  timestamp: Timestamp;
  topPoints: number; // Nur Jasspunkte dieser Runde
  bottomPoints: number; // Nur Jasspunkte dieser Runde
  weisTop: number; // Nur Weispunkte dieser Runde
  weisBottom: number; // Nur Weispunkte dieser Runde
  gespielteFarbe: JassColor | undefined; // Gespielte Farbe/Modus
  startingPlayer: PlayerNumber; // Wer hat diese Runde begonnen
}

// NEU: Typen für detaillierte Team-Informationen in der Session-Zusammenfassung
export interface SessionTeamPlayer {
  playerId: string;
  displayName: string;
}

export interface SessionTeamDetails {
  players: SessionTeamPlayer[];
  name?: string; // Optionaler, individueller Teamname für diese Session
}

export interface SessionTeams {
  top: SessionTeamDetails;    // ✅ GEÄNDERT: Konsistente Benennung mit dem Rest der App
  bottom: SessionTeamDetails; // ✅ GEÄNDERT: Konsistente Benennung mit dem Rest der App
}
// ENDE NEUE Typen für detaillierte Team-Informationen

export interface CompletedGameSummary {
  // ... existing CompletedGameSummary fields ...
  activeGameId: string; // Sicherstellen, dass dies immer gesetzt wird
  teams?: TeamConfig; // Behält die alte TeamConfig für Spiel-spezifische Layouts bei, falls nötig
                      // Nicht zu verwechseln mit SessionTeams für die gesamte Session
  
  // jassSpruch Feld entfernt - Sprüche werden nicht mehr gespeichert, sondern immer fresh generiert
}

export interface JassSession {
  // ... existing JassSession fields ...
  playerNames: PlayerNames;
  // teams?: TeamConfig; // Dieses Feld könnte veraltet sein oder eine andere Bedeutung haben
                       // Wir führen SessionTeams für die explizite Teamdefinition der Session ein
}

// Erweitere die Struktur, die für den Payload der finalizeSessionSummary Cloud Function verwendet wird
// (Name anpassen, falls im Client anders genannt, z.B. InitialSessionClientData)
export interface FinalizeSessionCallableData {
  sessionId: string;
  expectedGameNumber: number;
  initialSessionData?: {
    participantUids: string[];
    playerNames: PlayerNames;
    gruppeId: string | null;
    startedAt?: number | Timestamp; // Timestamp aus firebase/firestore
    // NEU: Detaillierte Team-Zusammensetzung für die gesamte Session
    teams?: SessionTeams | null;
    // NEU: Eindeutige Bezeichner für die Paarungen in dieser Session
    pairingIdentifiers?: {
      top: string;    // ✅ GEÄNDERT: Konsistente Benennung
      bottom: string; // ✅ GEÄNDERT: Konsistente Benennung
    } | null;
  };
}

export interface SessionSummary {
  // ... existing SessionSummary fields ...
  playerNames: PlayerNames; // Behält die Zuordnung Position -> Name
  teams?: SessionTeams | null; // NEU: Detaillierte Team-Zusammensetzung für die gesamte Session
  pairingIdentifiers?: { // NEU: Eindeutige Paarungs-IDs
    top: string;    // ✅ GEÄNDERT: Konsistente Benennung
    bottom: string; // ✅ GEÄNDERT: Konsistente Benennung
  } | null;
  eventCounts?: EventCounts; // ✅ NEU: Aggregierte Event-Zähler
  // Optional: Sicherstellen, dass alle Felder aus Firestore hier abgebildet sind
  // z.B. sessionId, createdAt, endedAt, finalScores, finalStriche, gamesPlayed, groupId, lastActivity, participantUids, status
}

// Es ist wichtig, dass InitialSessionData im Client (Payload für CF)
// und InitialSessionData in der CF (Empfangsstruktur) konsistent sind
// bezüglich der neuen Felder teams und pairingIdentifiers.

// === NEU: Event Count Record für Spiel-Events ===
export interface EventCountRecord {
  sieg: number;        // Nur 1 team kann das haben
  berg: number;        // Nur 1 team kann das haben
  matsch: number;      // Jedes team kann x haben
  kontermatsch: number; // Jedes team kann x haben
  schneider: number;   // Nur gewinnerteam kann das haben
}

export interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}
// === ENDE NEU ===

// Neue Typdefinitionen für die Datenoptimierung
export interface TrumpfCountsByPlayer {
  [playerId: string]: {
    [farbe: string]: number;
  };
}

export interface RoundDurationsByPlayer {
  [playerId: string]: {
    totalDuration: number;
    roundCount: number;
  };
}
