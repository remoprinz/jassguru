// Basis-Typen
export type TeamPosition = 'top' | 'bottom';

// Gemeinsame Team-bezogene Typen
export interface TeamScore {
  score: number;
  rounds: number;
  points: number;
  weisPoints: number;
  stricheCounts: Record<number, number>;
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
    top: Record<number, number>; 
    bottom: Record<number, number>; 
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
}

// Store-Typ
export interface JassStore extends JassState, JassActions {
  resetJass: () => void;
}

// Hilfsfunktionen
export const convertToDisplayStriche = (striche: StrichTyp): StricheDisplay => {
  // Vertikale Striche (berg, sieg, schneider)
  const vertikal = (striche.berg || 0) + 
                   ((striche.sieg || 0) * 2) + 
                   ((striche.schneider || 0) * 2);
  
  // Horizontale Striche (nur matsch und kontermatsch)
  const horizontal = (striche.matsch || 0) + 
                    ((striche.kontermatsch || 0) * 2);
  
  return { vertikal, horizontal };
};

// Adapter-Funktion nur für Store-Konvertierung
export const adaptGameHistoryToJassFormat = (
  gameHistoryEntry: ScoreHistoryEntry
): ScoreHistoryEntry => gameHistoryEntry;
