export const MAX_SCORE = 157;
export const DEFAULT_SIEG_SCORE = 5000;
export const DEFAULT_BERG_SCORE = 2500;

export interface GameSettings {
  siegScore: number;
  bergScore: number;
  maxRoundScore: number;
  maxScore: number;
  colors: string[];
  colorMultipliers: number[];
}

export const defaultGameSettings: GameSettings = {
  siegScore: DEFAULT_SIEG_SCORE,
  bergScore: DEFAULT_BERG_SCORE,
  maxRoundScore: MAX_SCORE,
  maxScore: MAX_SCORE,
  colors: ['Misère', 'Schälle', 'Schilte', 'Rosen', 'Guschti', 'Obenabe', 'Unenufe', 'Eichle', 'Quär', 'Slalom'],
  colorMultipliers: [1, 2, 3, 4, 4, 5, 6, 7, 7, 7],
};

export function updateGameSettings(newSettings: Partial<GameSettings>): GameSettings {
  return { ...defaultGameSettings, ...newSettings };
}

export function validateGameSettings(settings: Partial<GameSettings>): boolean {
  if (settings.siegScore !== undefined && (settings.siegScore <= 0 || settings.siegScore > 10000)) {
    return false;
  }
  if (settings.bergScore !== undefined && settings.siegScore !== undefined && 
      (settings.bergScore <= 0 || settings.bergScore >= settings.siegScore)) {
    return false;
  }
  if (settings.maxRoundScore !== undefined && (settings.maxRoundScore <= 0 || settings.maxRoundScore > 1000)) {
    return false;
  }
  if (settings.colors !== undefined && settings.colors.length !== 10) {
    return false;
  }
  if (settings.colorMultipliers !== undefined && 
      (settings.colorMultipliers.length !== 10 || 
       settings.colorMultipliers.some(m => m < 1 || m > 8))) {
    return false;
  }
  return true;
}
