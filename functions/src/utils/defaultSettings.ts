/**
 * Server-seitige Default-Einstellungen für Gruppen
 * Diese müssen mit den Frontend-Defaults übereinstimmen!
 */

export interface ScoreSettings {
  values: {
    sieg: number;
    berg: number;
    schneider: number;
  };
  enabled: {
    sieg: boolean;
    berg: boolean;
    schneider: boolean;
  };
  matschBonus: boolean;
}

export interface StrokeSettings {
  schneider: number;
  kontermatsch: number;
}

export interface FarbeSettings {
  values: {
    eicheln: number;
    rosen: number;
    schellen: number;
    schilten: number;
    obe: number;
    une: number;
    misère: number;
    dreimal: number;
    quer: number;
    slalom: number;
  };
  cardStyle: 'DE' | 'FR' | 'DE-Uni';
}

/**
 * Default Score Settings
 * MUSS mit src/config/ScoreSettings.ts übereinstimmen!
 */
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
  },
  matschBonus: true,
};

/**
 * Default Stroke Settings
 * MUSS mit src/config/GameSettings.ts übereinstimmen!
 */
export const DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 2,
  kontermatsch: 2,
};

/**
 * Default Farbe Settings
 * MUSS mit src/config/FarbeSettings.ts übereinstimmen!
 */
export const DEFAULT_FARBE_SETTINGS: FarbeSettings = {
  values: {
    eicheln: 1,
    rosen: 1,
    schellen: 2,
    schilten: 2,
    obe: 3,
    une: 3,
    misère: 0,
    dreimal: 0,
    quer: 0,
    slalom: 0,
  },
  cardStyle: 'DE',
};

