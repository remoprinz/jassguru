// Basis-Typen
export type TeamPosition = 'top' | 'bottom';

// Gemeinsame Team-bezogene Typen
export interface TeamScore {
  score: number;
  rounds: number;
  points: number;
  weisPoints: number;
  stricheCounts: Record<string, number>;
  restZahl: number;
  striche: StrichTyp;
}

// Weis-Aktion (nur einmal definiert)
export interface WeisAction {
  points: number;
  position: TeamPosition;
}

// Vereinheitlichter History-Eintrag
export interface ScoreHistoryEntry {
  topScore: number;
  bottomScore: number;
  topRounds: number;
  bottomRounds: number;
  totalPoints: {
    top: number;
    bottom: number;
  };
  weisPoints: {
    top: number;
    bottom: number;
  };
  currentPlayer: number;
  currentRound: number;
  farbe?: string;
  stricheCounts: { 
    top: Record<string, number>; 
    bottom: Record<string, number>; 
  };
  restZahlen: { 
    top: number; 
    bottom: number; 
  };
  weisActions: WeisAction[];
  isRoundCompleted: boolean;
}

// Strich-Typen mit ihrer Bedeutung
export interface StrichTyp {
  berg: number;      // 1 vertikaler Strich
  sieg: number;      // 2 vertikale Striche
  matsch: number;    // 1 horizontaler Strich
  schneider: number; // 2 vertikale Striche
  kontermatsch: number; // 2 horizontale Striche
}

// Striche-Anzeige für die UI
export interface StricheDisplay {
  vertikal: number;   // Kombiniert berg + sieg + schneider
  horizontal: number; // Kombiniert matsch + kontermatsch
}

// Team-Status
export interface TeamState {
  bergActive: boolean;
  bedankenActive: boolean;
}

// Erweiterter Team-Status mit Strichen
export interface TeamStand extends TeamState {
  striche: StrichTyp;
  total: number;
  isSigned: boolean;
  playerStats: {
    [playerId: number]: {
      striche: number;
      points: number;
    };
  };
  jassPoints: number;
}

// Neuer Typ für Matsch-Ergebnis
export interface MatschResult {
  isKontermatsch: boolean;
  chargeAmount: number;
}

// Jass-Aktionen mit korrigiertem Rückgabetyp
export interface JassActions {
  startBergCharge: (team: TeamPosition) => void;
  stopBergCharge: (team: TeamPosition) => void;
  startBedankenCharge: (team: TeamPosition) => void;
  stopBedankenCharge: (team: TeamPosition) => void;
  hasBergForTeam: (team: TeamPosition) => boolean;
  hasBedankenForTeam: (team: TeamPosition) => boolean;
  addStrich: (team: TeamPosition, type: keyof StrichTyp) => void;
  startMatschCharge: (team: TeamPosition) => void;
  stopMatschCharge: (team: TeamPosition) => void;
  startNewGame: () => void;
  finalizeGame: () => void;
  calculateTotalPoints: () => { top: number; bottom: number };
  calculateTotalJassPoints: () => { top: number; bottom: number };
  getGameHistory: () => GameEntry[];
  getCurrentGame: () => GameEntry | undefined;
}

// Gesamter Jass-Zustand
export interface JassState {
  bergChargeAmount: number;
  bedankenChargeAmount: number;
  bergPressStartTime: number | null;
  bedankenPressStartTime: number | null;
  bergChargeInterval: NodeJS.Timeout | null;
  bedankenChargeInterval: NodeJS.Timeout | null;
  rosenSpieler?: TeamPosition;
  teams: Record<TeamPosition, TeamStand>;
  currentRound: number;
  isJassCompleted: boolean;
  matschChargeAmount: number;
  matschChargeInterval: NodeJS.Timeout | null;
  matschPressStartTime: number | null;
  games: GameEntry[];
  currentGameId: number;
  currentGameCache: {
    stricheCounts: GameStore['stricheCounts'];
    scores: {
      top: number;
      bottom: number;
    };
    teams: Teams;
  } | null;
}

// Store-Typ
export interface JassStore extends JassState, JassActions {
  resetJass: () => void;
  undoNewGame: () => void;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;
  navigateToGame: (gameId: number) => void;
  navigateToPreviousGame: () => boolean;
  navigateToNextGame: () => boolean;
  getVisibleGames: () => GameEntry[];
  saveCurrentGameToCache: () => void;
  restoreCurrentGameFromCache: () => void;
  getState: () => JassState;
  setState: (partial: Partial<JassState>) => void;
  subscribe: (listener: (state: JassState) => void) => () => void;
}

// Strich-Werte für die Berechnung
export const STRICH_WERTE = {
  berg: 1,          // 1 Punkt für Berg
  sieg: 2,          // 2 Punkte für Sieg/Bedanken
  matsch: 1,        // 1 Punkt für Matsch
  schneider: 2,     // 2 Punkte für Schneider
  kontermatsch: 2   // 2 Punkte für Kontermatsch (nicht 3!)
} as const;

// Hilfsfunktionen
export const convertToDisplayStriche = (striche: StrichTyp): StricheDisplay => {
  // Vertikale Striche (berg, sieg, schneider)
  const vertikal = (striche.berg || 0) + 
                   ((striche.sieg || 0) * 2) + 
                   (striche.schneider || 0);
  
  // Horizontale Striche (nur matsch und kontermatsch)
  const horizontal = (striche.matsch || 0) + 
                    ((striche.kontermatsch || 0) * 2);
  
  return { vertikal, horizontal };
};

// Adapter-Funktion nur für Store-Konvertierung
export const adaptGameHistoryToJassFormat = (
  gameHistoryEntry: ScoreHistoryEntry
): ScoreHistoryEntry => gameHistoryEntry;

// Neues Interface für ein einzelnes Spiel
export interface GameEntry {
  id: number;
  timestamp: number;
  isActive?: boolean;
  teams: {
    [key in TeamPosition]: TeamStand;
  };
  milestones: {
    bergTimestamp?: number;
    matchTimestamp?: number;
    schneiderTimestamp?: number;
  };
}

// Teams-Type für Store-Zugriffe
export interface Teams {
  top: TeamStand;
  bottom: TeamStand;
}

// Store-Selector Types
export type JassSelector<T> = (state: JassStore) => T;
export type TeamSelector = JassSelector<Teams>;

// GameStore Interface aktualisieren
export interface GameStore {
  topScore: number;
  bottomScore: number;
  stricheCounts: {
    top: Record<string, number>;
    bottom: Record<string, number>;
  };
  restZahlen: {
    top: number;
    bottom: number;
  };
}

// JassStore Interface erweitern
export interface JassState {
  games: GameEntry[];
  currentGameId: number;
  teams: Teams;
  // ... andere State-Properties
}

export interface JassStore extends JassState {
  // Actions
  resetJass: () => void;
  finalizeGame: () => void;
  startNewGame: () => void;
  navigateToNextGame: () => boolean;
  navigateToPreviousGame: () => boolean;
  calculateTotalPoints: () => { top: number; bottom: number };
  calculateTotalJassPoints: () => { top: number; bottom: number };
  // ... andere Actions
}

export interface StoreSelector<T> {
  (state: T): Partial<T>;
}

export interface StrichCount {
  type: keyof typeof STRICH_WERTE;
  count: number;
}

export interface TeamStricheCounts {
  top: StrichCount[];
  bottom: StrichCount[];
}

