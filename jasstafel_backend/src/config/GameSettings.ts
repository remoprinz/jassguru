export const BERG_SCORE = 2500;
export const SIEG_SCORE = 5000;
export const SCHNEIDER_SCORE = 2500;
export const MAX_SCORE = 157;

export enum GameMode {
  JASSGROUP = 'JASSGROUP',
  // Hier können später weitere Modi hinzugefügt werden
  // TOURNAMENT = 'TOURNAMENT',
  // SINGLE = 'SINGLE',
  // etc.
}

export interface GameSettings {
  bergScore: number;
  siegScore: number;
  schneiderScore: number;
  enableWeis: boolean;
  enableMultiplier: boolean;
  gameMode: GameMode;
}

export const defaultGameSettings: GameSettings = {
  bergScore: BERG_SCORE,
  siegScore: SIEG_SCORE,
  schneiderScore: SCHNEIDER_SCORE,
  gameMode: GameMode.JASSGROUP,
  enableWeis: true,
  enableMultiplier: true
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
  return true;
}