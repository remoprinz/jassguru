/**
 * Hilfsfunktion für zufällige Profilfarbe-Zuweisung
 */

// Verfügbare Profilfarben (aus src/config/theme.ts)
export type ThemeColor = 'green' | 'blue' | 'purple' | 'pink' | 'yellow' | 'teal' | 'orange' | 'cyan';

/**
 * Gibt eine zufällige Profilfarbe zurück
 * @returns Eine zufällige ThemeColor
 */
export const getRandomProfileTheme = (): ThemeColor => {
  const availableThemes: ThemeColor[] = ['green', 'blue', 'purple', 'pink', 'yellow', 'teal', 'orange', 'cyan'];
  
  // Verwende crypto.getRandomValues für kryptographisch sichere Zufallszahlen
  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % availableThemes.length;
  
  return availableThemes[randomIndex];
};

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
