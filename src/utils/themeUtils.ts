/**
 * Zentrale Theme-Utilities für konsistente Farb-Mappings
 * Basiert auf Standard Tailwind-600-Farben, konsistent mit dem App-Theme-System
 */

import type { ThemeColor } from '@/config/theme';

/**
 * Mappt Theme-Namen zu Standard Tailwind-600-Hex-Farben für Tab-Styling
 * Verwendet die gleichen Farben wie das globale Theme-System (bg-*-600)
 */
export const getTabActiveColorFromTheme = (themeKey: string): string => {
  const standardTailwind600Colors: Record<string, string> = {
    'pink': '#ec4899',     // pink-600 (Standard Tailwind)
    'green': '#059669',    // emerald-600 (Standard Tailwind) 
    'blue': '#2563eb',     // blue-600 (Standard Tailwind)
    'purple': '#9333ea',   // purple-600 (Standard Tailwind)
    'red': '#dc2626',      // red-600 (Standard Tailwind)
    'yellow': '#ca8a04',   // yellow-600 (Standard Tailwind, konsistent mit Theme)
    'indigo': '#4f46e5',   // indigo-600 (Standard Tailwind)
    'teal': '#0d9488'      // teal-600 (Standard Tailwind)
  };
  
  return standardTailwind600Colors[themeKey] || '#ca8a04'; // Fallback zu Standard-Gelb (yellow-600)
};

/**
 * Mappt Theme-Namen zu Standard Tailwind-700-Hex-Farben für Hover-Zustände
 */
export const getHoverColorFromTheme = (themeKey: string): string => {
  const standardTailwind700Colors: Record<string, string> = {
    'pink': '#db2777',     // pink-700
    'green': '#047857',    // emerald-700
    'blue': '#1d4ed8',     // blue-700
    'purple': '#7c3aed',   // purple-700
    'red': '#b91c1c',      // red-700
    'yellow': '#a16207',   // yellow-700
    'indigo': '#3730a3',   // indigo-700
    'teal': '#0f766e'      // teal-700
  };
  
  return standardTailwind700Colors[themeKey] || '#a16207'; // Fallback zu yellow-700
};

/**
 * Mappt Theme-Namen zu Standard Tailwind-Border-Farben
 */
export const getBorderColorFromTheme = (themeKey: string): string => {
  const standardTailwindBorderColors: Record<string, string> = {
    'pink': '#be185d',     // pink-700 für Border
    'green': '#047857',    // emerald-700 für Border
    'blue': '#1d4ed8',     // blue-700 für Border
    'purple': '#7c3aed',   // purple-700 für Border
    'red': '#b91c1c',      // red-700 für Border
    'yellow': '#a16207',   // yellow-700 für Border
    'indigo': '#3730a3',   // indigo-700 für Border
    'teal': '#0f766e'      // teal-700 für Border
  };
  
  return standardTailwindBorderColors[themeKey] || '#a16207'; // Fallback zu yellow-700
};

/**
 * Vollständige Farb-Palette für ein Theme
 */
export interface ThemeColorPalette {
  primary: string;    // 600er Farbe für normale Zustände
  hover: string;      // 700er Farbe für Hover-Zustände  
  border: string;     // 700er Farbe für Borders
}

/**
 * Gibt die vollständige Farb-Palette für ein Theme zurück
 */
export const getThemeColorPalette = (themeKey: string): ThemeColorPalette => ({
  primary: getTabActiveColorFromTheme(themeKey),
  hover: getHoverColorFromTheme(themeKey),
  border: getBorderColorFromTheme(themeKey),
});

/**
 * Type Guard für gültige Theme-Farben
 */
export const isValidThemeColor = (color: string): color is ThemeColor => {
  const validColors: ThemeColor[] = ['green', 'blue', 'purple', 'red', 'yellow', 'indigo', 'pink', 'teal'];
  return validColors.includes(color as ThemeColor);
}; 