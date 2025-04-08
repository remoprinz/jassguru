// Definiere ScoreSettingsConfig lokal in dieser Datei
interface ScoreSettingsConfig {
  id: ScoreMode;
  name: string;
  defaultValue: number;
  maxValue: number;
  order: number;
}

// Importiere Typen mit Alias-Pfad
import type { ScoreMode, ScoreSettings, StrokeSettings } from "@/types/jass";

// Maximale Punktzahl pro Runde (ausser Match)
export const MAX_SCORE = 157;

// Punktzahl für einen Match
export const MATSCH_SCORE = 257;

// SCORE_MODES verwendet jetzt die lokale ScoreSettingsConfig
export const SCORE_MODES: readonly ScoreSettingsConfig[] = [
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
];

// Style-Konfiguration bleibt
export const SCORE_STYLES: Record<ScoreMode, string> = {
  sieg: "bg-green-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-green-500",
  berg: "bg-blue-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-blue-500",
  schneider: "bg-yellow-500 group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-yellow-500",
} as const;

// +++ NEUE DEFAULTS (korrigiert) +++
export const DEFAULT_SCORE_SETTINGS: ScoreSettings = {
  values: SCORE_MODES.reduce((acc, mode) => {
    acc[mode.id as ScoreMode] = mode.defaultValue ?? (mode.id === 'sieg' ? 2000 : 1000);
    return acc;
  }, {} as Record<ScoreMode, number>),
  enabled: {
    sieg: true,
    berg: true,
    schneider: true,
  },
};

export const DEFAULT_STROKE_SETTINGS: StrokeSettings = {
  schneider: 1,
  kontermatsch: 1,
};
// +++ ENDE NEUE DEFAULTS +++

// Bestehende Hilfsfunktionen (unverändert lassen)
export const getScoreModeConfig = (mode: ScoreMode): ScoreSettingsConfig => {
  const config = SCORE_MODES.find((m) => m.id === mode);
  if (!config) {
    throw new Error(`Ungültiger ScoreMode: ${mode}`);
  }
  return config;
};

export const getScoreModeValue = (mode: ScoreMode, settings: ScoreSettings): number => {
  return settings.values[mode] ?? getScoreModeConfig(mode).defaultValue;
};

export const isScoreModeEnabled = (mode: ScoreMode, settings: ScoreSettings): boolean => {
  if (mode === 'sieg') return true;
  return settings.enabled[mode] ?? false;
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
