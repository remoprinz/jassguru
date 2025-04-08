// src/types/jass.ts

import { StatisticId } from "./statistikTypes";
import { Timestamp, FieldValue } from "firebase/firestore";
// Importiere Default Settings
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings";
import { DEFAULT_FARBE_SETTINGS } from "@/config/FarbeSettings";
import type { TeamCalculationResult } from "@/utils/teamCalculations";
import { FARBE_MODES } from '@/config/FarbeSettings';

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
};

export type GuestInfo = {
  type: "guest";
  name: string;
  email?: string | null;
  consent?: boolean;
};

// +++ EINSTELLUNGS-TYPEN ZENTRAL DEFINIEREN +++

// Typ für Score-Einstellungen (Wieder eingefügt)
export type ScoreMode = "berg" | "sieg" | "schneider";
export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
  isFlipped?: boolean;
}

// Typ für Strich-Einstellungen
export interface StrokeSettings {
  schneider: 1 | 2;
  kontermatsch: 1 | 2;
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
export type FarbeModeKey = FarbeModeId | 'obeabe' | 'uneufe';

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
  id: number;
  timestamp: number;
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  sessionId: string;
  currentRound: number;
  startingPlayer: PlayerNumber;
  initialStartingPlayer: PlayerNumber;
  currentPlayer: PlayerNumber;
  roundHistory: RoundEntry[];
  currentHistoryIndex: number;
  historyState: HistoryState;
  isGameStarted: boolean;
  isRoundCompleted: boolean;
  isGameCompleted: boolean;
  metadata?: GameMetadata; // Bleibt optional wie bisher
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
}

export type JassStore = JassState & JassActions;

export const convertToDisplayStriche = (striche: StricheRecord) => {
  // MATSCH und KONTERMATSCH sind horizontal
  const horizontal = (striche.matsch || 0) + (striche.kontermatsch || 0);

  // BERG, SIEG und SCHNEIDER sind vertikal
  const vertikal =
    (striche.berg || 0) + (striche.sieg || 0) + (striche.schneider || 0);

  return { horizontal, vertikal };
};

// Visuelle Strich-Repräsentation
export type StrichValue = 20 | 50 | 100;
export interface VisualStricheCounts {
  stricheCounts: Record<StrichValue, number>;
  restZahl: number;
}

// Interface Definition
export interface HistoryState {
  isNavigating: boolean;
  lastNavigationTimestamp: number; // Kein null mehr erlaubt
}

// Hilfsfunktion für die Initialisierung
export const createInitialHistoryState = (): HistoryState => ({
  isNavigating: false,
  lastNavigationTimestamp: Date.now(), // Initialer Timestamp statt null
});

// Neue Type-Definition für die Striche-Struktur
export type StricheState = {
  top: StricheRecord;
  bottom: StricheRecord;
};

// Erweitern des GameState
export interface GameState {
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
  resetGame: (nextStarter: PlayerNumber) => void;
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
  startedAt: number;
  endedAt?: number;
  playerNames: PlayerNames;
  games: number[];
  metadata: {
    location?: string;
    notes?: string;
  };
  statistics?: {
    gamesPlayed: number;
    totalDuration?: number;
    scores: TeamScores;
    weisCount: number;
    stricheCount: Record<StrichTyp, number>;
  };
}

// Erweiterte Statistik-Typen
export interface SessionStatistics {
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

// Neue Funktion hinzufügen (bestehender Code bleibt unverändert)
export const determineNextStartingPlayer = (
  previousGame: GameEntry | null,
  lastRoundPlayer: PlayerNumber, // Geändert von initialStartingPlayer
): PlayerNumber => {
  // Beginn des neuen Funktionskörpers

  // Helper function for modulo-based player rotation (1 -> 2 -> 3 -> 4 -> 1)
  const getNextPlayerClockwise = (player: PlayerNumber): PlayerNumber => {
    return ((player % 4) + 1) as PlayerNumber;
  };

  // Parameter 'lastRoundPlayer' ist der Spieler, dessen Zug es am Ende des Spiels war
  console.log(
    `🏁 [V3] Starting Player Determination based on previous game ending with player ${lastRoundPlayer}'s turn.`,
  );

  // 1. Bestimme den Spieler, der nach dem letzten Spieler dran WÄRE
  const playerWhoWouldBeNext = getNextPlayerClockwise(lastRoundPlayer);
  console.log(
    `🏁 [V3] Player ${playerWhoWouldBeNext} would be next in clockwise order.`,
  );

  // 2. Prüfen, ob es ein vorheriges Spiel gibt und wer 'bedankt' hat (Sieg-Strich)
  if (previousGame) {
    let winningTeam: TeamPosition | undefined;
    if (previousGame.teams.top.striche.sieg > 0) {
      winningTeam = "top";
    } else if (previousGame.teams.bottom.striche.sieg > 0) {
      winningTeam = "bottom";
    }

    if (!winningTeam) {
      // Sollte nicht passieren. Fallback: Nächster Spieler beginnt.
      console.warn(
        `🏁 [V3] Starting Player Determination: Could not determine winning team from previous game (ID: ${previousGame.id}). Defaulting to next player: ${playerWhoWouldBeNext}.`,
      );
      return playerWhoWouldBeNext;
    }

    console.log(
      `🏁 [V3] Previous game winner (based on 'sieg' strich): Team ${winningTeam}.`,
    );

    // 3. Team des Spielers ermitteln, der als nächstes dran wäre
    const teamOfPlayerWhoWouldBeNext = getTeamForPlayer(playerWhoWouldBeNext);
    console.log(
      `🏁 [V3] Team of player ${playerWhoWouldBeNext} (who would be next) is ${teamOfPlayerWhoWouldBeNext}.`,
    );

    // 4. Kernlogik: Gehört der nächste Spieler zum Gewinnerteam?
    if (teamOfPlayerWhoWouldBeNext === winningTeam) {
      // JA -> Ausnahme! Überspringe diesen Spieler. Der Spieler DANACH startet.
      const nextStarter = getNextPlayerClockwise(playerWhoWouldBeNext);
      console.log(
        `✨ [V3] Player ${playerWhoWouldBeNext} is on winning team. Skipping. Next player ${nextStarter} starts.`,
      );
      return nextStarter;
    } else {
      // NEIN -> Regel: Der Spieler, der als nächstes dran wäre, startet.
      console.log(
        `✨ [V3] Player ${playerWhoWouldBeNext} is on losing team. They start.`,
      );
      return playerWhoWouldBeNext;
    }
  } else {
    // Fallback, falls kein vorheriges Spiel übergeben wurde
    console.warn(
      `🏁 [V3] Starting Player Determination: No previous game data provided. Defaulting to next player: ${playerWhoWouldBeNext}.`,
    );
    return playerWhoWouldBeNext;
  }
}; // Ende des neuen Funktionskörpers

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
  nickname: string;
  userId: string | null; // Verknüpfung zum Auth User
  email?: string | null; // <-- HIER FEHLTE EMAIL
  displayName?: string | null; // <-- HIER FEHLTE DISPLAYNAME
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
}

// +++ FirestoreGroup ZENTRAL DEFINIEREN (KORREKT EINGEFÜGT) +++
export interface FirestoreGroup extends FirebaseDocument {
  name: string;
  description: string | null;
  logoUrl: string | null;
  createdBy: string; // User ID of creator
  adminIds: string[]; // User IDs
  playerIds: string[]; // Player IDs
  isPublic: boolean;
  
  // Einstellungen als optionale Felder mit Partial für Flexibilität
  farbeSettings?: Partial<FarbeSettings>;
  scoreSettings?: Partial<ScoreSettings>;
  strokeSettings?: Partial<StrokeSettings>;
  
  // Optional: Zusätzliche Felder aus der alten group.ts Definition (falls benötigt)
  players?: { // Beispielhaft hinzugefügt, falls benötigt
    [key: string]: {
      displayName: string;
      email: string;
      joinedAt: Timestamp;
    };
  };
  gameCount?: number;
  // ... weitere Felder aus group.ts bei Bedarf ...
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
