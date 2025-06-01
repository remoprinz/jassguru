/**
 * Formatierungshilfsfunktionen für die Jassguru-App
 */

/**
 * Konvertiert einen String in Title Case (erster Buchstabe jedes Wortes groß)
 */
export const toTitleCase = (str: string): string => {
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
};

/**
 * Erstellt einen CSS-Klassen-String aus mehreren Konditionen
 */
export function classNames(...classes: (string | undefined | boolean | null)[]) {
  return classes.filter(Boolean).join(' ');
} 