// src/types/jass.ts

import { StatisticId } from './statistikTypes';
import { IconType } from 'react-icons';
import type { StrokeSettings } from '../config/GameSettings';

// Definiere die gemeinsamen Steps
export const COMMON_BROWSER_STEPS = {
  INSTALL_WELCOME: 'INSTALL_WELCOME',
  INSTALL_SHARE: 'INSTALL_SHARE',
  INSTALL_FINAL: 'INSTALL_FINAL',
  INSTALL_DONE: 'INSTALL_DONE',
  FINAL_HINTS: 'FINAL_HINTS'
} as const;

// iOS-spezifische Steps
export const IOS_BROWSER_STEPS = {
  ...COMMON_BROWSER_STEPS,
  INSTALL_HOME: 'INSTALL_HOME',
} as const;

// Android-spezifische Steps
export const ANDROID_BROWSER_STEPS = {
  ...COMMON_BROWSER_STEPS
} as const;

// Type für die Steps je nach Plattform
export type iOSBrowserStep = typeof IOS_BROWSER_STEPS[keyof typeof IOS_BROWSER_STEPS];
export type AndroidBrowserStep = typeof ANDROID_BROWSER_STEPS[keyof typeof ANDROID_BROWSER_STEPS];
export type BrowserOnboardingStep = iOSBrowserStep | AndroidBrowserStep;

export enum AppOnboardingStep {
  INTRODUCTION = 'INTRODUCTION',
  SCREEN_TIME = 'SCREEN_TIME'
}

export type OnboardingStep = BrowserOnboardingStep | AppOnboardingStep;

export type TeamPosition = 'top' | 'bottom';
export type PlayerNumber = 1 | 2 | 3 | 4;
export type PlayerNames = {
  1: string;
  2: string;
  3: string;
  4: string;
};

export type TeamPlayers = [PlayerNumber, PlayerNumber];  // Tuple Type für genau 2 Spieler

export interface TeamConfig {
  top: TeamPlayers;
  bottom: TeamPlayers;
}

// Standard-Konfiguration
export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  top: [2, 4],    // Standard: Spieler 2 & 4 oben
  bottom: [1, 3]  // Standard: Spieler 1 & 3 unten
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
  return ACTIVE_TEAM_CONFIG.top.includes(player) ? 'top' : 'bottom';
};

export const getNextPlayerInTeam = (currentPlayer: PlayerNumber): PlayerNumber => {
  const team = getTeamForPlayer(currentPlayer);
  const teamPlayers = team === 'top' ? ACTIVE_TEAM_CONFIG.top : ACTIVE_TEAM_CONFIG.bottom;
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

export type StrichTyp = 'berg' | 'sieg' | 'matsch' | 'schneider' | 'kontermatsch';

export interface StatisticProps {
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[];
  currentGameId: number;
  onSwipe?: (direction: 'left' | 'right') => void;
}

export interface StatisticModule {
  id: StatisticId;
  title: string;
  component: React.FC<StatisticProps>;
  calculateData: (state: JassState) => TeamScores;
}

export interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
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
  striche: {
    top: StricheRecord;
    bottom: StricheRecord;
  };
}

// Spezifische Typen für Weis und Jass
export interface WeisRoundEntry extends BaseRoundEntry {
  actionType: 'weis';
  isRoundFinalized: false;
  isCompleted: false;
}

export interface JassRoundEntry extends BaseRoundEntry {
  actionType: 'jass';
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
  multipliers: number[];
  isFlipped: boolean;
}

export interface ScoreSettings extends SettingsTemplate<Record<ScoreMode, number>> {
  values: Record<ScoreMode, number>;
  isFlipped: boolean;
  enabled: Record<ScoreMode, boolean>;
}

export interface PlayerStats {
  striche: number;
  points: number;
}

export interface TeamStand {
  bergActive: boolean;
  bedankenActive: boolean;
  isSigned: boolean;
  striche: StricheRecord;
  total: number;
  jassPoints: number;
  weisPoints: number;
  playerStats: {
    [key in PlayerNumber]: { 
      striche: number; 
      points: number;
      weisPoints: number;
    }
  }
}

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
  metadata?: {
    duration?: number;
    roundStats: {
      weisCount: number;
      colorStats: Record<JassColor, number>;
    };
  };
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
}

export interface JassActions {
  // Initiales Starten eines Jass
  startJass: (config: {
    playerNames: PlayerNames;
    initialStartingPlayer: PlayerNumber;
  }) => void;

  // Für Folgespiele (umbenannt von startNewGame)
  startGame: () => void;

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
  updateCurrentGame: (update: {
    teams: Record<TeamPosition, TeamStand>;
    roundHistory: RoundEntry[];
    currentRound: number;
    currentPlayer: PlayerNumber;
  }) => void;

  // Nach den existierenden Types (ca. Zeile 200) hinzufügen:
  getTotalsUpToGame: (gameId: number) => GameTotals;
}
export type JassStore = JassState & JassActions;

export const convertToDisplayStriche = (striche: StricheRecord) => {
  // MATSCH und KONTERMATSCH sind horizontal
  const horizontal = (striche.matsch || 0) + 
                    (striche.kontermatsch || 0);
  
  // BERG, SIEG und SCHNEIDER sind vertikal
  const vertikal = (striche.berg || 0) + 
                   (striche.sieg || 0) + 
                   (striche.schneider || 0);
  
  return { horizontal, vertikal };
};

// Visuelle Strich-Repräsentation
export type StrichValue = 20 | 50 | 100;
export interface VisualStricheCounts {
  stricheCounts: Record<StrichValue, number>;
  restZahl: number;
}

// Neue Types für History-Navigation
export interface HistoryState {
  isNavigating: boolean;
  lastNavigationTimestamp: number | null;
}

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
  scoreSettings: {
    scores: number[];
    enabled: boolean[];
  };
  farbeSettings: {
    colors: JassColor[];
    multipliers: number[];
  };
  playerNames: PlayerNames;
  currentHistoryIndex: number;
  historyState: HistoryState;
}

// Erweitern der GameActions
export interface GameActions {
  startGame: () => void;
  startRound: () => void;
  finalizeRound: (
    farbe: JassColor, 
    topScore: number, 
    bottomScore: number,
    strichInfo?: {
      team: TeamPosition,
      type: StrichTyp
    }
  ) => void;
  updateScore: (team: TeamPosition, score: number, opponentScore: number) => void;
  addStrich: (team: TeamPosition, type: StrichTyp) => void;
  addWeisPoints: (team: TeamPosition, points: number) => void;
  undoLastWeis: () => void;
  finalizeGame: () => void;
  resetGame: () => void;
  resetGamePoints: () => void;
  setScore: (team: TeamPosition, score: number) => void;
  setPlayerNames: (names: PlayerNames) => void;
  updateScoreByStrich: (position: TeamPosition, value: number) => void;
  showHistoryWarning: (
    message: string,
    onConfirm: () => void,
    onCancel: () => void
  ) => void;
  getVisualStriche: (position: TeamPosition) => VisualStricheCounts;
  navigateHistory: (direction: 'forward' | 'backward') => void;
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
}

export type GameStore = GameState & GameActions;

// Optional: Wenn wir History-spezifische UI-States brauchen
export interface HistoryNavigationState {
  isHistoryNavigationActive: boolean;
  currentSwipePosition: TeamPosition | null;
}

export const getFinalizedRounds = (history: RoundEntry[]): RoundEntry[] => {
  return history.filter(entry => entry.isRoundFinalized);
};

// Neue Basis-Typen für die Gruppenhierarchie
export interface JassGruppe {
  id: string;
  name: string;
  createdAt: number;
  members: PlayerNames[];
  sessions: string[];  // Array von Session-IDs
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
    totalDuration: number;
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

// Erweiterung der bestehenden GameEntry
export interface GameEntry {
  id: number;
  timestamp: number;
  teams: Record<TeamPosition, TeamStand>;
  sessionId: string;
  
  // Spielzustand
  currentRound: number;
  currentPlayer: PlayerNumber;
  roundHistory: RoundEntry[];
  
  // Optionale Metadaten
  metadata?: {
    duration?: number;
    roundStats: {
      weisCount: number;
      colorStats: Record<JassColor, number>;
    };
  };
}

// Type Guard Funktion als normale Export-Funktion (nicht als type)
export function isJassRoundEntry(entry: RoundEntry): entry is JassRoundEntry {
  return entry.actionType === 'jass';
}

// Nach den existierenden Types (ca. Zeile 200) hinzufügen:
export interface GameTotals {
  striche: {
    top: number;
    bottom: number;
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
  const next = ((current % 4) + 1);
  return isValidPlayerNumber(next) ? next : 1;
};

// Neue Funktion hinzufügen (bestehender Code bleibt unverändert)
export const determineNextStartingPlayer = (
    currentGame: GameEntry | null,
    initialStartingPlayer: PlayerNumber
): PlayerNumber => {
    if (!currentGame) {
        return initialStartingPlayer;
    }

    // 1. Prüfen, welches Team gewonnen hat
    const winningTeam = currentGame.teams.top.striche.sieg > 0 ? 'top' : 
                       currentGame.teams.bottom.striche.sieg > 0 ? 'bottom' : 
                       null;

    if (!winningTeam) {
        return initialStartingPlayer;
    }

    // 2. Das Verliererteam identifizieren
    const losingTeam = winningTeam === 'top' ? 'bottom' : 'top';
    
    // 3. Den aktuellen Spieler prüfen
    const teamConfig = getTeamConfig();
    const losingTeamPlayers = teamConfig[losingTeam];
    const currentPlayer = currentGame.currentPlayer;

    // ✅ NEUE LOGIK: Wenn der aktuelle Spieler im Verliererteam ist,
    // darf er direkt das nächste Spiel starten
    if (losingTeamPlayers.includes(currentPlayer)) {
        return currentPlayer;
    }

    // Sonst: Den nächsten Spieler aus dem Verliererteam finden
    let nextPlayer = getNextPlayer(currentPlayer);
    while (!losingTeamPlayers.includes(nextPlayer)) {
        nextPlayer = getNextPlayer(nextPlayer);
    }

    return nextPlayer;
};

// Startspieler-Management Types
export interface StartingPlayerState {
  currentPlayer: PlayerNumber;    // Aktueller Spieler in dieser Runde
  startingPlayer: PlayerNumber;   // Startspieler dieses Spiels
  initialStartingPlayer: PlayerNumber;  // Allererster Startspieler des Jass
}

// Type Guard für Startspieler
export const isValidStartingPlayer = (
  player: unknown
): player is PlayerNumber => {
  return isValidPlayerNumber(Number(player));
};

// Hilfsfunktion für initiale Startspieler-Werte
export const createInitialStartingPlayerState = (
  initialPlayer: PlayerNumber
): StartingPlayerState => {
  if (!isValidStartingPlayer(initialPlayer)) {
    throw new Error('Ungültiger Startspieler');
  }
  
  return {
    currentPlayer: initialPlayer,
    startingPlayer: initialPlayer,
    initialStartingPlayer: initialPlayer
  };
};

export interface SettingsTab {
  id: 'farben' | 'scores' | 'strokes';
  title: string;
}

export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
}

// Neue Types für Piktogramm-Settings
export interface PictogramConfig {
  isEnabled: boolean;
  mode: 'svg' | 'emoji';
}

// Erweitern der bestehenden Settings-Interfaces
export interface SettingsState {
  isOpen: boolean;
  activeTab: SettingsTab['id'];
  pictogramConfig: PictogramConfig;
}

export type ScoreMode = 'berg' | 'sieg' | 'schneider';

// Basis-Konfiguration ohne Runtime-States
export interface ScoreSettingsConfig {
  id: ScoreMode;
  name: string;
  defaultValue: number;
  maxValue: number;
  order: number;
}

// Separate Interface für Runtime-Settings
export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
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

// Neue Types für den Onboarding Flow
export interface OnboardingContent {
  title: string;
  icon: IconType;
  message?: string;
  list?: string[];
  image?: string;  // Optional, da nicht jeder Step ein Bild hat
}
export interface OnboardingState {
  currentStep: OnboardingStep;
  showOnboarding: boolean;
  content: OnboardingContent;
  canBeDismissed: boolean;
}

export interface OnboardingActions {
  handleNext: () => void;
  handlePrevious: () => void;
  handleDismiss: () => void;
}

export type OnboardingFlow = OnboardingState & OnboardingActions;

// Kartenstil-Definition
export type CardStyle = 'DE' | 'FR';

// Beziehung zwischen den Kartensymbolen in verschiedenen Stilen
export interface CardSymbol {
  DE: string;
  FR: string;
}

// Mapping der Kartensymbole für alle Farben
export type CardStyleMappings = {
  [Color in JassColor]: CardSymbol;
};