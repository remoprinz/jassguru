/**
 * Utility-Funktionen für die Win-Rate Anzeige im Bruch-Format
 * Beispiel: "66.7%" statt "4/6 = 66.7%"
 */

export interface WinRateInfo {
  wins: number;
  total: number;
  rate: number;
  displayText: string;
}

/**
 * Erstellt eine Win-Rate Anzeige nur mit Prozentsatz
 * @param wins - Anzahl Siege
 * @param total - Gesamtanzahl Spiele/Sessions
 * @returns Formatierter String im Format "Z%"
 */
export function createWinRateDisplay(wins: number, total: number): string {
  if (total === 0) return "0.0%";
  
  const rate = (wins / total * 100).toFixed(1);
  return `${rate}%`;
}

/**
 * Erstellt eine Win-Rate Anzeige für Sessions (exklusive Unentschieden)
 * @param wins - Anzahl Session-Siege
 * @param losses - Anzahl Session-Niederlagen
 * @param ties - Anzahl Unentschieden (werden ignoriert)
 * @returns Formatierter String im Format "Z%" 
 */
export function createSessionWinRateDisplay(wins: number, losses: number, ties: number = 0): string {
  const decidedSessions = wins + losses; // Unentschieden werden für Win-Rate ignoriert
  return createWinRateDisplay(wins, decidedSessions);
}

/**
 * Fallback-Funktion für Win-Rate Anzeige, wenn WinRateInfo nicht verfügbar ist
 * @param winRateInfo - Strukturierte Win-Rate Info (optional)
 * @param wins - Anzahl Siege (Fallback)
 * @param total - Gesamtanzahl (Fallback)
 * @returns Formatierter String nur mit Prozentsatz
 */
export function getWinRateDisplay(
  winRateInfo?: WinRateInfo | null,
  wins: number = 0,
  total: number = 0
): string {
  if (winRateInfo?.displayText) {
    // Extrahiere nur den Prozentsatz aus displayText falls es im alten Format "X/Y = Z%" ist
    const match = winRateInfo.displayText.match(/= ([\d.]+%)/);
    if (match) {
      return match[1];
    }
    return winRateInfo.displayText;
  }
  
  return createWinRateDisplay(wins, total);
}

/**
 * Fallback-Funktion für Session Win-Rate Anzeige
 * @param sessionWinRateInfo - Strukturierte Session Win-Rate Info (optional)
 * @param wins - Anzahl Session-Siege (Fallback)
 * @param losses - Anzahl Session-Niederlagen (Fallback)
 * @param ties - Anzahl Unentschieden (Fallback)
 * @returns Formatierter String nur mit Prozentsatz
 */
export function getSessionWinRateDisplay(
  sessionWinRateInfo?: WinRateInfo | null,
  wins: number = 0,
  losses: number = 0,
  ties: number = 0
): string {
  if (sessionWinRateInfo?.displayText) {
    // Extrahiere nur den Prozentsatz aus displayText falls es im alten Format "X/Y = Z%" ist
    const match = sessionWinRateInfo.displayText.match(/= ([\d.]+%)/);
    if (match) {
      return match[1];
    }
    return sessionWinRateInfo.displayText;
  }
  
  return createSessionWinRateDisplay(wins, losses, ties);
} 