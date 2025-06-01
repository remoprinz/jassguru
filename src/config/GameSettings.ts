export enum GameMode {
  JASSGROUP = "JASSGROUP",
}

// Basis-Strich-Werte
export const BASE_STRICH_WERTE = {
  berg: 1,
  sieg: 2,
  matsch: 1,
} as const;

// Stroke-Settings Types - ERWEITERT um 0 für Tournament-Kompatibilität
export interface StrokeSettings {
  schneider: 0 | 1 | 2;
  kontermatsch: 0 | 1 | 2;
}

// Default Stroke Settings
export const DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 1,
  kontermatsch: 1,
} as const;

// Wirklich NUR die Basis-Game-Settings
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

// Alle Strich-Werte in einem Objekt (ersetzt STRICH_WERTE aus jass.ts)
export const STRICH_WERTE = {
  berg: BASE_STRICH_WERTE.berg,
  sieg: BASE_STRICH_WERTE.sieg,
  matsch: BASE_STRICH_WERTE.matsch,
  schneider: DEFAULT_STROKE_SETTINGS.schneider,
  kontermatsch: DEFAULT_STROKE_SETTINGS.kontermatsch,
} as const;

// Hilfsfunktion zur Validierung der Stroke-Settings
export const validateStrokeSettings = (settings: Partial<StrokeSettings>): boolean => {
  if (settings.schneider !== undefined && ![0, 1, 2].includes(settings.schneider)) {
    return false;
  }
  if (settings.kontermatsch !== undefined && ![0, 1, 2].includes(settings.kontermatsch)) {
    return false;
  }
  return true;
};
