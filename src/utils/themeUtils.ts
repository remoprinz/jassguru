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
    'yellow': '#ca8a04',   // yellow-600 (Standard Tailwind, konsistent mit Theme)
    'teal': '#0d9488',     // teal-600 (Standard Tailwind)
    'orange': '#ea580c',   // orange-600 (Standard Tailwind)
    'cyan': '#0891b2',     // cyan-600 (Standard Tailwind)
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
    'yellow': '#a16207',   // yellow-700
    'teal': '#0f766e',     // teal-700
    'orange': '#c2410c',   // orange-700
    'cyan': '#0e7490',     // cyan-700
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
    'yellow': '#a16207',   // yellow-700 für Border
    'teal': '#0f766e',     // teal-700 für Border
    'orange': '#c2410c',   // orange-700 für Border
    'cyan': '#0e7490',     // cyan-700 für Border
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
  const validColors: ThemeColor[] = ['green', 'blue', 'purple', 'pink', 'yellow', 'teal', 'orange', 'cyan'];
  return validColors.includes(color as ThemeColor);
};

/**
 * Hilfsfunktion für zufällige Theme-Farbe
 */
export const getRandomThemeColor = (): ThemeColor => {
  const validColors: ThemeColor[] = ['green', 'blue', 'purple', 'pink', 'yellow', 'teal', 'orange', 'cyan'];
  const randomIndex = Math.floor(Math.random() * validColors.length);
  return validColors[randomIndex];
}; 