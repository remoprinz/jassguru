import type { JassSpruchParams } from './jass';

export interface SpruchMitIcon {
  text: string;
  icon: string;
}

export type SpruchGenerator = (params: JassSpruchParams) => SpruchMitIcon | null;

// === BESTEHENDE SPRÜCHE TYPEN ===
export interface GameEndSprueche {
  comeback: SpruchGenerator[];
  führungswechsel: SpruchGenerator[];
  aufholjagd_nötig: SpruchGenerator[];
  führung_ausgebaut: SpruchGenerator[];
  knapp_gesamt: SpruchGenerator[];
  dominierend: SpruchGenerator[];
  ehrenpunkte: SpruchGenerator[];
  matsch: SpruchGenerator[];
  schneider: SpruchGenerator[];
}

export interface JassEndSprueche {
  unentschieden: SpruchGenerator[];
  comeback: SpruchGenerator[];
  hauchdünn: SpruchGenerator[];
  knapp: SpruchGenerator[];
  deutlich: SpruchGenerator[];
  hoch: SpruchGenerator[];
  sehr_hoch: SpruchGenerator[];
  vernichtend: SpruchGenerator[];
  matsch: SpruchGenerator[];
  schneider: SpruchGenerator[];
}

export interface KombinierterSpruch {
  hauptSpruch: SpruchMitIcon;
  zusatzSpruch?: SpruchMitIcon;
  zeitSpruch?: SpruchMitIcon;
}

export interface SpruchKombinationsRegeln {
  maxSprueche: {
    [K in GameEndErgebnisKategorie | 'default']: number;
  };
  erlaubteKombinationen: {
    [K in GameEndErgebnisKategorie]?: GameEndErgebnisKategorie[];
  };
  zeitKombinierbar: {
    [K in GameEndErgebnisKategorie | 'default']: boolean;
  };
}

export type GameEndKategorie = keyof GameEndSprueche;
export type JassEndKategorie = keyof JassEndSprueche;

export type SpieltempoKategorie =
  | 'blitz_schnell'
  | 'schnell'
  | 'normal'
  | 'gemütlich'
  | 'marathon';

export interface JassEndSpielInfo {
  gesamtPunkte: {
    team1: number;
    team2: number;
  };
  matchCount: {
    team1: number;
    team2: number;
  };
  führungsWechsel: number;
  spielDauer: string;
}

export interface ErweiterterKombinierterSpruch {
  hauptSpruch: SpruchMitIcon;
  resultatDetails?: SpruchMitIcon;
  spielstatistik?: SpruchMitIcon;
  zeitSpruch?: SpruchMitIcon;
  matchDetails?: SpruchMitIcon;
}

export type ZeitSprueche = {
  gameEnd: Record<SpieltempoKategorie, SpruchGenerator[]>;
  jassEnd: Record<SpieltempoKategorie, SpruchGenerator[]>;
};

export type BedankenChargeLevel = 'none' | 'low' | 'medium' | 'high' | 'super' | 'extreme';

export interface BedankenSpruch {
  text: string;
  buttons: {
    cancel: string;
    confirm: string;
  };
}

export type BedankenSprueche = Record<BedankenChargeLevel, BedankenSpruch[]>; 

// === NEXT-LEVEL SPRÜCHEGENERATOR TYPES ===

/**
 * Statistische Erkenntnis aus groupComputedStats
 */
export interface StatInsight {
  category: 'matsch' | 'schneider' | 'winrate' | 'speed' | 'veteran' | 'team' | 'session';
  subcategory?: string; // z.B. 'fastest', 'slowest', 'best', 'worst'
  relevanceScore: number; // 0-100
  playerName?: string;
  teamNames?: string[];
  data: {
    value: number | string;
    displayValue?: string;
    eventsPlayed?: number;
    context?: any;
  };
  contextType: 'player' | 'team' | 'session';
  isPositive: boolean; // true = gut für Spieler, false = schlecht
  isSurprising: boolean; // true = überraschend (z.B. schlechter Spieler gewinnt)
}

/**
 * Template für Spruch-Generierung
 */
export interface ContextTemplate {
  category: string;
  subcategory?: string;
  condition: (insight: StatInsight, sessionData: any) => boolean;
  templates: ContextTemplateFunction[];
  tones: ('witzig' | 'statistisch' | 'dramatisch' | 'motivierend' | 'spöttisch')[];
  minRelevance: number; // Mindest-Relevanz-Score
}

export type ContextTemplateFunction = (insight: StatInsight, tone: string) => string;

/**
 * Generierter Kontext-Spruch
 */
export interface GeneratedContext {
  text: string;
  category: string;
  relevanceScore: number;
  insight: StatInsight;
  tone: string;
}

/**
 * Kompositions-Regeln für Smart Compositor
 */
export interface CompositionRules {
  maxContexts: number; // 5-8 statt nur 3
  minRelevanceScore: number; // Mindest-Score für Aufnahme
  diversityBonus: number; // Bonus für verschiedene Kategorien
  surpriseBonus: number; // Bonus für überraschende Insights
  categoryPriority: Map<string, number>; // Kategorie-Prioritäten
  redundancyThreshold: number; // Ähnlichkeits-Schwelle für Duplikate
}

/**
 * Session-Statistiken für Vergleiche
 */
export interface SessionStats {
  gamesPlayed: number;
  duration: number; // in Sekunden
  totalMatsche: number;
  avgMatschPerGame: number;
  participantCount: number;
  uniquePairings: number;
}

/**
 * Spieler-Performance für diese Session
 */
export interface SessionPlayerPerformance {
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  matschemade: number;
  matscheReceived: number;
  schneiderMade: number;
  schneiderReceived: number;
  avgRoundDuration?: number;
  isWinner: boolean;
  isLoser: boolean;
} 