// src/types/jass.ts

import { StatisticId } from "./statistikTypes";
import { Timestamp, FieldValue } from "firebase/firestore";
// Importiere Default Settings
import { DEFAULT_SCORE_SETTINGS } from "../config/ScoreSettings";
import { DEFAULT_FARBE_SETTINGS } from "../config/FarbeSettings";

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

interface EmojiStyle {
  backgroundColor: string;
}

export interface FarbeSettingsConfig {
  id: FarbeMode;
  name: string;
  multiplier: number;
  order: number;
  emojiStyle: {
    backgroundColor: string;
  };
  frStyle: {
    backgroundColor: string;
  };
  standardStyle: {
    backgroundColor: string;
  };
}

export interface SettingsTemplate<T> {
  values: T;
  isFlipped: boolean;
  isEnabled?: Record<string, boolean>;
}

export interface FarbeSettings extends SettingsTemplate<number[]> {
  values: number[];
  isFlipped: boolean;
}

export interface ScoreSettingsValues {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
  isFlipped: boolean;
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
  scoreSettings: ScoreSettingsValues;
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
  setScoreSettings: (settings: ScoreSettingsValues) => void;
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

export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
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

export type ScoreMode = "berg" | "sieg" | "schneider";

// Basis-Konfiguration ohne Runtime-States
export interface ScoreSettingsConfig {
  id: ScoreMode;
  name: string;
  defaultValue: number;
  maxValue: number;
  order: number;
}

// HTML2Canvas Options Type
export interface Html2CanvasOptions {
  background?: string;
  scale?: number;
  width?: number;
  height?: number;
  scrollX?: number;
  scrollY?: number;
  windowWidth?: number;
  windowHeight?: number;
  x?: number;
  y?: number;
}
// Kartenstil-Definition
export type CardStyle = "DE" | "FR";

// Beziehung zwischen den Kartensymbolen in verschiedenen Stilen
export interface CardSymbol {
  DE: string;
  FR: string;
}

// Mapping der Kartensymbole für alle Farben
export type CardStyleMappings = {
  [Color in JassColor]: CardSymbol;
};

// Neue Type für Store-Updates
export interface StoreUpdate {
  gameState?: Partial<GameState>;
  jassState?: Partial<JassState>;
}

// Tutorial-bezogene Types
export interface TutorialOverlayProps {
  onCloseMenu: () => void;
}

// Neue Basis-Types für Sprüche (nach den existierenden Types)
export interface SpruchMitIcon {
  text: string;
  icon: string;
}

// 2. Basis-Types für Spiellogik und Berechnungen
export interface StricheCount {
  normal: number;
  matsch: number;
  sieg?: number;
}

// Abgeleitet von StricheCount
export type StricheKategorie = keyof Omit<StricheCount, "sieg">;

// Hilfs-Interface für Sprüche-Sammlung
export interface Sprueche {
  [key: string]: SpruchMitIcon;
}

// 3. Basis-Parameter für Sprüche
export interface JassSpruchBaseParams {
  stricheDifference: number;
  pointDifference: number;
  winnerNames: string[];
  loserNames: string[];
  isUnentschieden: boolean;
  isStricheMode: boolean;
  type: GameEndType;
  isSchneider: boolean;
  totalMatsche: number;
}

// 4. Gemeinsame Types für Kategorisierung
export type GameEndType = "gameEnd" | "jassEnd";

// Neue Timer-bezogene Types
export interface TimerAnalytics {
  totalJassTime: number; // Gesamtdauer des Jass
  currentGameDuration: number; // Dauer des aktuellen Spiels
}

// Neue Types für das Charge-System
export type ChargeLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "super"
  | "extreme";

export interface ChargeState {
  isCharging: boolean;
  chargeStartTime: number | null;
  chargeLevel: ChargeLevel;
}

export type EffectType = "rain" | "explosion" | "cannon" | "firework";

export interface EffectParams {
  y: number;
  gravity: number;
  startVelocity: number;
  spread: number;
}

export interface EffectConfig {
  chargeLevel: ChargeLevel;
  team: TeamPosition;
  isFlipped?: boolean;
  type: "berg" | "sieg";
  effectType: EffectType;
}

// Konstanten für das Charge-System
export const CHARGE_THRESHOLDS = {
  low: 300, // 0.8 Sekunden - Minimale Schwelle für Effekt
  medium: 1000, // 1.5 Sekunden
  high: 2000, // 2.5 Sekunden
  super: 3000, // 4 Sekunden
  extreme: 5000, // 6 Sekunden
} as const;

// Type Guard für ChargeLevel
export const isValidChargeLevel = (level: string): level is ChargeLevel => {
  return ["none", "low", "medium", "high", "super", "extreme"].includes(level);
};

// Bestehende ChargeLevel Type erweitern
export type ChargeDuration = {
  duration: number;
  level: ChargeLevel;
};

// Bestehende ChargeButtonProps anpassen
export interface ChargeButtonActionProps {
  chargeDuration: {
    duration: number;
    level: ChargeLevel;
  };
  type: "berg" | "sieg";
  team: TeamPosition;
  isActivating: boolean;
}

export interface TimerSnapshot {
  elapsedJassTime: number;
  elapsedGameTime: number;
  elapsedRoundTime: number;
  totalPausedTime: number;
}

// Füge eine Hilfsfunktion für initiales GameState hinzu
export const createInitialGameState = (
  initialPlayer: PlayerNumber,
  playerNames: PlayerNames,
): GameState => ({
  currentPlayer: initialPlayer,
  startingPlayer: initialPlayer,
  initialStartingPlayer: initialPlayer,
  isGameStarted: false,
  currentRound: 1,
  weisPoints: { top: 0, bottom: 0 },
  jassPoints: { top: 0, bottom: 0 },
  scores: { top: 0, bottom: 0 },
  striche: {
    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
  },
  roundHistory: [],
  currentRoundWeis: [],
  isGameCompleted: false,
  isRoundCompleted: false,
  // Verwende die importierten Default-Settings für die Initialisierung
  scoreSettings: { ...DEFAULT_SCORE_SETTINGS },
  farbeSettings: { ...DEFAULT_FARBE_SETTINGS },
  playerNames,
  currentHistoryIndex: -1, // Korrigierter Initialwert für History Index
  historyState: createInitialHistoryState(),
  gamePlayers: null,
});

// NEU: Type Guard Funktionen hinzufügen (keine bestehenden Definitionen betroffen)
export const isJassRoundEntry = (
  entry: RoundEntry,
): entry is JassRoundEntry => {
  return entry.actionType === "jass";
};

export const isWeisRoundEntry = (
  entry: RoundEntry,
): entry is WeisRoundEntry => {
  return entry.actionType === "weis";
};

// Auth-bezogene Typen
export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  statusMessage?: string | null;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  lastActiveGroupId?: string | null;
  playerId?: string | null;
}

// Online-Offline Modus
export type AppMode = "offline" | "online";

// Kombinierter User-Context
export interface UserContext {
  authUser: AuthUser | null;
  player: FirestorePlayer | null;
  isLoading: boolean;
  error: string | null;
}

// FirestoreMetadata als generischer Typ für Metadaten
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

// Firestore User Document Structure
export interface FirestoreUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  playerId?: string | null;
  lastActiveGroupId?: string | null;
  statusMessage?: string | null;
  preferences?: {
    theme: string;
    notifications: boolean;
  };
  createdAt?: FieldValue;
  lastLogin?: FieldValue;
  lastUpdated?: FieldValue;
}

export interface FirestorePlayer {
  id: string;
  nickname: string;
  userId: string | null;
  isGuest: boolean;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  groupIds: string[];
  stats: {
    gamesPlayed: number;
    wins: number;
    totalScore: number;
  };
  metadata?: FirestoreMetadata;
}

export interface FirestoreGroup {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  createdAt: Timestamp | FieldValue;
  createdBy: string;
  adminIds: string[];
  playerIds: string[];
  metadata?: FirestoreMetadata;
}

export interface FirestoreTeam {
  id: string;
  player1Id: string;
  player2Id: string;
  groupId: string;
  createdAt: Timestamp | FieldValue;
  metadata?: FirestoreMetadata;
}

export interface FirestoreGame {
  id: string;
  sessionId: string;
  groupId: string;
  team1Id: string;
  team2Id: string;
  startTime: Timestamp | FieldValue;
  endTime: (Timestamp | FieldValue) | null;
  startingPlayer: PlayerNumber;
  currentRound: number;
  isCompleted: boolean;
  scores: {
    team1: {
      striche: StricheRecord;
      jassPoints: number;
      weisPoints: number;
    };
    team2: {
      striche: StricheRecord;
      jassPoints: number;
      weisPoints: number;
    };
  };
  metadata?: FirestoreMetadata;
}

interface NotificationAction {
  label: string;
  onClick: () => void;
  className?: string; // Optionale className-Eigenschaft hinzufügen
}

// Typdefinitionen für Jass-Gruppen
export interface JassGroup {
  id: string;
  name: string;
  description?: string;
  statusMessage?: string; // Optionaler Gruppen-Jasspruch/Status hinzugefügt
  logoUrl?: string | null;
  adminIds: string[];
  playerIds: string[];
  createdAt: FieldValue | Timestamp;
  // Weitere gruppenspezifische Felder...
}

// +++ NEUE TYPEN für Spieler-Info (Mitglied/Gast) +++
export type MemberInfo = {
  type: "member";
  uid: string;
  name: string;
};

export type GuestInfo = {
  type: "guest";
  name: string;
  email?: string | null; // Optional, für spätere Einladung
  consent?: boolean; // Optional, für Einwilligung zur E-Mail-Speicherung
};

export type PlayerInfo = MemberInfo | GuestInfo | null;

export type GamePlayers = {
  1: PlayerInfo;
  2: PlayerInfo;
  3: PlayerInfo;
  4: PlayerInfo;
};
// +++ ENDE NEUE TYPEN +++
