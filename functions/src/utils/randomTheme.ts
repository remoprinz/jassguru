/**
 * Server-seitige Hilfsfunktion für zufällige Profilfarbe-Zuweisung
 */

// Verfügbare Profilfarben (aus src/config/theme.ts)
export type ThemeColor = 'green' | 'blue' | 'purple' | 'pink' | 'yellow' | 'teal' | 'orange' | 'cyan';

/**
 * Gibt eine zufällige Profilfarbe zurück (für Server-seitige Verwendung)
 * @returns Eine zufällige ThemeColor
 */
export const getRandomProfileThemeServer = (): ThemeColor => {
  const availableThemes: ThemeColor[] = ['green', 'blue', 'purple', 'pink', 'yellow', 'teal', 'orange', 'cyan'];
  
  // Für Server-seitige Verwendung: Verwende Math.random() als Fallback
  const randomIndex = Math.floor(Math.random() * availableThemes.length);
  
  return availableThemes[randomIndex];
};
