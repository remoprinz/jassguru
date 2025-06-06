// Default Stroke Settings (aus src/config/GameSettings.ts)
export interface StrokeSettings {
  schneider: 0 | 1 | 2;
  kontermatsch: 0 | 1 | 2;
}

export const DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 1,
  kontermatsch: 1,
} as const;


// Default Score Settings (aus src/config/ScoreSettings.ts)
// Minimal notwendige Typen, um Abhängigkeiten gering zu halten
export type ScoreMode = "sieg" | "berg" | "schneider";

export interface ScoreSettingsValues {
  sieg: number;
  berg: number;
  schneider: number;
  [key: string]: number; // Für dynamischen Zugriff
}

export interface ScoreSettingsEnabled {
  sieg: boolean;
  berg: boolean;
  schneider: boolean;
  matsch: boolean;
  kontermatsch: boolean;
  [key: string]: boolean; // Für Flexibilität, aber explizite sind besser
}

export interface ScoreSettings {
  values: ScoreSettingsValues;
  enabled: ScoreSettingsEnabled;
}

// Die SCORE_MODES Definition wird hier nicht direkt benötigt, da DEFAULT_SCORE_SETTINGS die Werte bereits enthält.
// Falls komplexere Logik aus SCORE_MODES benötigt würde, müsste man diese ebenfalls portieren.
export const DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  values: {
    sieg: 2000,
    berg: 1000,
    schneider: 1000,
  },
  enabled: {
    sieg: true,
    berg: true,
    schneider: true,
    matsch: true,
    kontermatsch: true,
    // Kontermatsch ist implizit über Striche/Punkte geregelt, nicht hier als eigener Modus
  },
};

// Minimaldefinitionen, falls von GroupData oder anderswo referenziert
export const BASE_STRICH_WERTE = {
  berg: 1,
  sieg: 2,
  matsch: 1,
} as const;

export enum GameMode {
  JASSGROUP = "JASSGROUP",
}

export interface GameSettings {
  enableWeis: boolean;
  enableMultiplier: boolean;
  gameMode: GameMode;
  strokeSettings: StrokeSettings;
}

export const defaultGameSettings: GameSettings = {
  enableWeis: true,
  enableMultiplier: true,
  gameMode: GameMode.JASSGROUP,
  strokeSettings: DEFAULT_STROKE_SETTINGS,
}; 