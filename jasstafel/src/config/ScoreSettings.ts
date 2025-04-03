import type {ScoreMode, ScoreSettingsConfig} from "../types/jass";

// Basis-Konstanten
export const MAX_SCORE = 157;
export const MATSCH_SCORE = 257;

// Score Settings Interface (falls noch nicht in types/jass.ts definiert)
export interface ScoreSettings {
  values: Record<ScoreMode, number>;
  enabled: Record<ScoreMode, boolean>;
  isFlipped: boolean;
}

// Basis-Konfiguration mit strikter Typisierung
export const SCORE_MODES: ScoreSettingsConfig[] = [
  {
    id: "sieg",
    name: "Sieg",
    defaultValue: 5000,
    maxValue: 10000,
    order: 1,
  },
  {
    id: "berg",
    name: "Berg",
    defaultValue: 2500,
    maxValue: 5000,
    order: 2,
  },
  {
    id: "schneider",
    name: "Schneider",
    defaultValue: 2500,
    maxValue: 5000,
    order: 3,
  },
] as const;

// Style-Konfiguration bleibt
export const SCORE_STYLES: Record<ScoreMode, string> = {
  sieg: "bg-green-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-green-500",
  berg: "bg-blue-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-blue-500",
  schneider: "bg-yellow-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-yellow-500",
} as const;

// Default Score Settings
export const DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  values: {
    sieg: SCORE_MODES[0].defaultValue,
    berg: SCORE_MODES[1].defaultValue,
    schneider: SCORE_MODES[2].defaultValue,
  },
  enabled: {
    sieg: true,
    berg: true,
    schneider: true,
  },
  isFlipped: false,
} as const;

// Optimierte Hilfsfunktionen
export const getScoreModeConfig = (mode: ScoreMode): ScoreSettingsConfig => {
  const config = SCORE_MODES.find((m) => m.id === mode);
  if (!config) {
    throw new Error(`Ungültiger Score-Mode: ${mode}`);
  }
  return config;
};

// Validierungsfunktion
export const validateScoreValue = (mode: ScoreMode, value: number): boolean => {
  const config = getScoreModeConfig(mode);

  if (value < 0) return false;

  if (mode === "sieg") {
    return value <= config.maxValue;
  }

  // Berg und Schneider dürfen maximal die Hälfte des Siegwertes sein
  const siegConfig = getScoreModeConfig("sieg");
  const maxAllowedValue = Math.floor(siegConfig.defaultValue / 2);

  return value <= Math.min(config.maxValue, maxAllowedValue);
};
