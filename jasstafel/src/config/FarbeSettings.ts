import type {FarbeMode, FarbeSettingsConfig} from "../types/jass";

const commonStandardStyle = {
  backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
};

export const FARBE_MODES: FarbeSettingsConfig[] = [
  {
    id: "misère",
    name: "Misère",
    multiplier: 1,
    order: 1,
    emojiStyle: {
      backgroundColor: "bg-[#f87171] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#f87171]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "eicheln",
    name: "Eicheln",
    multiplier: 7,
    order: 7,
    emojiStyle: {
      backgroundColor: "bg-[#65a30d] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#65a30d]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "rosen",
    name: "Rosen",
    multiplier: 4,
    order: 3,
    emojiStyle: {
      backgroundColor: "bg-[#fde047] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#fde047]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "schellen",
    name: "Schellen",
    multiplier: 2,
    order: 4,
    emojiStyle: {
      backgroundColor: "bg-[#fbbf24] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#fbbf24]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "schilten",
    name: "Schilten",
    multiplier: 3,
    order: 5,
    emojiStyle: {
      backgroundColor: "bg-[#64748b] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#6b7280]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "obe",
    name: "Obe",
    multiplier: 5,
    order: 6,
    emojiStyle: {
      backgroundColor: "bg-[#0891b2] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#0284c7]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "une",
    name: "Une",
    multiplier: 6,
    order: 7,
    emojiStyle: {
      backgroundColor: "bg-[#0369a1] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#854d0e]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "dreimal",
    name: "3x3",
    multiplier: 4,
    order: 8,
    emojiStyle: {
      backgroundColor: "bg-[#f0abfc] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#f0abfc]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "quer",
    name: "Quer",
    multiplier: 7,
    order: 9,
    emojiStyle: {
      backgroundColor: "bg-[#f87171] group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-[#0891b2]",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
  {
    id: "slalom",
    name: "Slalom",
    multiplier: 7,
    order: 10,
    emojiStyle: {
      backgroundColor: "bg-white group-[.has-active]:bg-gray-600/75 group-[.active]:!bg-white",
    },
    standardStyle: commonStandardStyle,
    frStyle: {
      backgroundColor: "bg-gradient-to-b from-gray-600 to-gray-700 shadow-inner border border-gray-500/30 hover:from-gray-500 hover:to-gray-600 group-[.has-active]:bg-gray-600/75 group-[.active]:!from-gray-500 group-[.active]:!to-gray-600",
    },
  },
];

export const getFarbeModeConfig = (mode: FarbeMode): FarbeSettingsConfig => {
  const config = FARBE_MODES.find((m) => m.id === mode);
  if (!config) {
    throw new Error(`Ungültige Farbe: ${mode}`);
  }
  return config;
};

export const getFarbeModeMultiplier = (mode: FarbeMode): number => {
  return getFarbeModeConfig(mode).multiplier;
};

// Neue Interface Definition
export interface FarbeSettings {
  values: number[]; // Multiplier-Werte
  isFlipped: boolean;
}

// Default Settings hinzufügen
export const DEFAULT_FARBE_SETTINGS: FarbeSettings = {
  values: FARBE_MODES.map((mode) => mode.multiplier),
  isFlipped: false,
} as const;

// Validierungsfunktion
export const validateFarbeSettings = (settings: Partial<FarbeSettings>): boolean => {
  if (settings.values) {
    return settings.values.every((value) => value >= 0 && value <= 8);
  }
  return true;
};
