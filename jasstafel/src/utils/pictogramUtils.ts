import type { JassColor, CardStyle } from '../types/jass';
import { CARD_SYMBOL_MAPPINGS } from '../config/CardStyles';

// Die Hauptfarben sind PNGs in beiden Stilen (DE und FR)
const PNG_SYMBOLS = ['Eicheln', 'Rosen', 'Schellen', 'Schilten'];

// Emoji Maps
const DE_EMOJI_MAP: Record<JassColor, string> = {
  'Misère': '🤮',
  'Eicheln': '🌳',
  'Rosen': '🌹',
  'Schellen': '🔔',
  'Schilten': '🛡️',
  'Obe': '👇',
  'Une': '👇',
  '3x3': '3️⃣',
  'Quer': '↕️',
  'Slalom': '⛷️'
};

const FR_EMOJI_MAP: Record<JassColor, string> = {
  'Misère': '🤮',
  'Eicheln': '♠️',
  'Rosen': '♣️',
  'Schellen': '♥️',
  'Schilten': '♦️',
  'Obe': '👆',
  'Une': '👇',
  '3x3': '3️⃣',
  'Quer': '↕️',
  'Slalom': '⛷️'
};

// Cache für Bildpfade
const pictogramCache: Record<string, string> = {};

const sanitizeFileName = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')                 // Zerlegt Sonderzeichen
    .replace(/[\u0300-\u036f]/g, '') // Entfernt diakritische Zeichen
    .replace(/[^a-z0-9]/g, '');      // Entfernt alle nicht-alphanumerischen Zeichen
};

export const getPictogram = (color: JassColor, mode: 'svg' | 'emoji', style: CardStyle = 'DE'): string => {
  const cacheKey = `${color}-${mode}-${style}`;
  
  if (pictogramCache[cacheKey]) {
    return pictogramCache[cacheKey];
  }

  if (mode === 'emoji') {
    const emojiMap = style === 'DE' ? DE_EMOJI_MAP : FR_EMOJI_MAP;
    pictogramCache[cacheKey] = emojiMap[color];
    return pictogramCache[cacheKey];
  }

  const symbolName = sanitizeFileName(CARD_SYMBOL_MAPPINGS[color][style]);
  const path = `/assets/pictograms/standardDE/${symbolName}.${PNG_SYMBOLS.includes(color) ? 'png' : 'svg'}`;
  
  pictogramCache[cacheKey] = path;
  return path;
};