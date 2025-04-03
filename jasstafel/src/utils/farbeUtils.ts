import type {FarbeMode, JassColor} from "../types/jass";
import {FARBE_MODES} from "../config/FarbeSettings";

export const farbeModeToJassColor = (mode: FarbeMode): JassColor => {
  const config = FARBE_MODES.find((m) => m.id === mode);
  if (!config) {
    throw new Error(`Ungültige FarbeMode: ${mode}`);
  }

  // Typensichere Konvertierung
  return config.name as JassColor;
};

export const jassColorToFarbeMode = (color: JassColor): FarbeMode => {
  const mode = FARBE_MODES.find((m) => m.name === color);
  if (!mode) {
    throw new Error(`Ungültige JassColor: ${color}`);
  }

  return mode.id;
};
