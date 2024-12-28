import type { JassColor } from '../types/jass';

// Die vier Hauptfarben sind PNGs, alle anderen SVGs
const PNG_SYMBOLS = ['Eicheln', 'Rosen', 'Schellen', 'Schilten'];

const EMOJI_MAP: Record<JassColor, string> = {
  'Misère': '🤮',
  'Eicheln': '🌳',
  'Rosen': '🌹',
  'Schellen': '🔔',
  'Schilten': '🛡️',
  'Obe': '👇',
  'Une': '👆',
  '3x3': '3️⃣',
  'Quer': '↕️',
  'Slalom': '⛷️'
};

export const getPictogram = (color: JassColor, mode: 'svg' | 'emoji'): string => {
  if (mode === 'emoji') {
    return EMOJI_MAP[color] || color;
  }

  const fileNameMap: Record<JassColor, string> = {
    'Misère': 'misere',
    'Eicheln': 'eicheln',
    'Rosen': 'rosen',
    'Schellen': 'schellen',
    'Schilten': 'schilten',
    'Obe': 'obe',
    'Une': 'une',
    '3x3': 'dreimal',
    'Quer': 'quer',
    'Slalom': 'slalom'
  };

  const fileName = fileNameMap[color];
  if (!fileName) {
    throw new Error(`Ungültige Farbe: ${color}`);
  }

  // Die vier Hauptfarben sind PNGs, alle anderen SVGs
  return `/assets/pictograms/standardDE/${fileName}.${PNG_SYMBOLS.includes(color) ? 'png' : 'svg'}`;
};