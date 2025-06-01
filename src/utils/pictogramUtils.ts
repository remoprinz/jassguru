import type {JassColor, CardStyle} from "../types/jass";
import {CARD_SYMBOL_MAPPINGS} from "../config/CardStyles";
import { toTitleCase } from "./formatUtils";

// Die Hauptfarben sind PNGs in beiden Stilen (DE und FR)
const PNG_SYMBOLS = ["Eicheln", "Rosen", "Schellen", "Schilten"];

// Emoji Maps
const DE_EMOJI_MAP: Record<JassColor, string> = {
  "Misère": "🤮",
  "Eicheln": "🌳",
  "Rosen": "🌹",
  "Schellen": "🔔",
  "Schilten": "🛡️",
  "Obe": "👇",
  "Une": "👇",
  "3x3": "3️⃣",
  "Quer": "↕️",
  "Slalom": "⛷️",
};

const FR_EMOJI_MAP: Record<JassColor, string> = {
  "Misère": "🤮",
  "Eicheln": "♠️",
  "Rosen": "♣️",
  "Schellen": "♥️",
  "Schilten": "♦️",
  "Obe": "👆",
  "Une": "👇",
  "3x3": "3️⃣",
  "Quer": "↕️",
  "Slalom": "⛷️",
};

// Cache für Bildpfade
const pictogramCache: Record<string, string> = {};

const sanitizeFileName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize("NFD") // Zerlegt Sonderzeichen
    .replace(/[\u0300-\u036f]/g, "") // Entfernt diakritische Zeichen
    .replace(/[^a-z0-9]/g, ""); // Entfernt alle nicht-alphanumerischen Zeichen
};

export const getPictogram = (color: JassColor, mode: "svg" | "emoji", style: CardStyle = "DE"): string => {
  // === Konvertiere Farbe zu Title Case für Mapping ===
  const mappedColorKey = toTitleCase(color);
  // === Ende Konvertierung ===

  const cacheKey = `${mappedColorKey}-${mode}-${style}`; // Cache-Key mit korrektem Case

  if (pictogramCache[cacheKey]) {
    return pictogramCache[cacheKey];
  }

  if (mode === "emoji") {
    const emojiMap = style === "DE" ? DE_EMOJI_MAP : FR_EMOJI_MAP;
    pictogramCache[cacheKey] = emojiMap[color as JassColor]; // Emojis verwenden evtl. den Original-Key?
    return pictogramCache[cacheKey];
  }

  // === HIER ABSICHERUNG mit mappedColorKey ===
  const symbolMapping = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]; // Zugriff mit korrektem Case

  // Prüfen, ob die Farbe und der spezifische Stil im Mapping existieren
  if (symbolMapping === undefined || symbolMapping[style] === undefined) {
      console.warn(`getPictogram: Mapping für Farbe '${mappedColorKey}' (Original: '${color}') oder Stil '${style}' nicht gefunden. Gebe leeren Pfad zurück.`);
      pictogramCache[cacheKey] = ""; 
      return "";
  }
  // === ENDE ABSICHERUNG ===

  const symbolName = sanitizeFileName(symbolMapping[style]); // Sicherer Zugriff
  
  // Dynamischer Pfad basierend auf dem Stil
  const styleFolder = style === 'FR' ? 'standardFR' : 'standardDE';
  const path = `/assets/pictograms/${styleFolder}/${symbolName}.${PNG_SYMBOLS.includes(mappedColorKey) ? "png" : "svg"}`; // Verwende mappedColorKey für PNG/SVG Check

  pictogramCache[cacheKey] = path;
  return path;
};
