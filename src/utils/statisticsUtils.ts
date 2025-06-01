import { Timestamp } from 'firebase/firestore';
import type { StricheRecord, TeamPosition } from '@/types/jass';
import { formatDuration } from '@/utils/timeUtils'; // Annahme: formatDuration existiert hier

/**
 * Hilfsfunktion zur benutzerfreundlichen Anzeige von Zeitdauern für Statistiken.
 * @param durationMs Dauer in Millisekunden.
 * @returns Formatierte Zeit als String.
 */
export function formatDurationForStats(durationMs: number): string {
  if (!durationMs || durationMs <= 0) {
    return '-';
  }

  // Formatieren in hh:mm oder mm:ss Format
  const formattedTime = formatDuration(durationMs); // Nutzt die bestehende timeUtils Funktion

  if (formattedTime.length > 5) { // z.B. "01:30:00" -> "1 Std. 30 Min."
    const parts = formattedTime.split(':');
    if (parts.length === 3) { // hh:mm:ss
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (hours > 0) {
            return `${hours} Std. ${minutes} Min.`;
        }
        return `${minutes} Min. ${parseInt(parts[2], 10)} Sek.`; // mm:ss wenn Stunden 0 sind
    }
    // Falls parts.length === 2, z.B. "30:00" -> mm:ss (von formatDuration)
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return `${minutes} Min. ${seconds} Sek.`;

  } else if (formattedTime.includes(':')) { // mm:ss Format, z.B. "05:30"
    const [minutes, seconds] = formattedTime.split(':');
    const numMinutes = parseInt(minutes, 10);
    const numSeconds = parseInt(seconds, 10);
    if (numMinutes === 0 && numSeconds > 0) {
      return `${numSeconds} Sek.`;
    }
    if (numMinutes > 0 && numSeconds === 0) {
        return `${numMinutes} Min.`;
    }
    if (numMinutes > 0 && numSeconds > 0) {
        return `${numMinutes} Min. ${numSeconds} Sek.`;
    }
    return '-'; // Sollte nicht passieren mit gültigem Input
  }
  return '-'; // Fallback
}

/**
 * Prüft, ob ein Wert ein Firestore Timestamp ist.
 * @param value Der zu prüfende Wert.
 * @returns True, wenn es ein Timestamp ist, sonst false.
 */
export const isFirestoreTimestamp = (value: any): value is Timestamp => {
  return value &&
    typeof value === 'object' &&
    value !== null && // expliziter Null-Check
    typeof (value as Timestamp).toDate === 'function';
};

/**
 * Berechnet die Summe aller Stricharten.
 * @param striche Ein StricheRecord-Objekt oder undefined.
 * @param strokeSettings Optional: Die Strich-Einstellungen mit Multiplikatoren.
 * @param scoreEnabledSettings Optional: Einstellungen, welche Punktwertungen (z.B. Berg, Schneider) aktiviert sind.
 * @returns Die Gesamtanzahl der Striche.
 */
export const calculateTotalStriche = (
  striche: StricheRecord | undefined,
  strokeSettings?: { kontermatsch?: number; schneider?: number },
  scoreEnabledSettings?: { berg?: boolean; schneider?: boolean }
): number => {
  if (!striche) {
    return 0;
  }

  const bergEnabled = scoreEnabledSettings?.berg ?? true;
  const schneiderEnabled = scoreEnabledSettings?.schneider ?? true;

  let total = 0;

  if (bergEnabled && typeof striche.berg === 'number') {
    total += striche.berg;
  }
  if (typeof striche.sieg === 'number') {
    total += striche.sieg;
  }
  if (typeof striche.matsch === 'number') {
    total += striche.matsch;
  }
  if (schneiderEnabled && typeof striche.schneider === 'number') {
    total += striche.schneider;
  }
  if (typeof striche.kontermatsch === 'number') {
    total += striche.kontermatsch;
  }
  return total;
};

/**
 * Formatiert einen numerischen Wert als Prozentsatz-String.
 * @param value Der Wert (z.B. 0.25 für 25%).
 * @param decimals Anzahl der Dezimalstellen (Standard 1).
 * @returns Formatierter Prozentstring (z.B. "25.0%").
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  if (isNaN(value) || !isFinite(value)) {
    return '-';
  }
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Ruft einen Spielernamen sicher aus einer Map ab oder gibt einen Fallback-Namen zurück.
 * @param playerId ID des Spielers.
 * @param playerNamesMap Map von Spieler-IDs zu Namen.
 * @param fallbackPrefix Präfix für den Fallback-Namen (Standard 'Spieler').
 * @returns Den Spielernamen oder einen Fallback-Namen.
 */
export const getPlayerName = (
  playerId: string,
  playerNamesMap: Map<string, string>,
  fallbackPrefix: string = 'Spieler'
): string => {
  return playerNamesMap.get(playerId) || `${fallbackPrefix} (ID: ${playerId.substring(0, 6)}...)`;
};

/**
 * Ermittelt das Gewinnerteam basierend auf den Endpunkteständen.
 * @param finalScores Objekt mit top und bottom Scores.
 * @returns 'top', 'bottom', 'draw' oder null, falls Scores ungültig sind.
 */
export const determineWinningTeam = (finalScores: { top: number; bottom: number }): 'top' | 'bottom' | 'draw' | null => {
  if (typeof finalScores?.top !== 'number' || typeof finalScores?.bottom !== 'number' || isNaN(finalScores.top) || isNaN(finalScores.bottom)) {
    return null; // Ungültige oder fehlende Scores
  }
  if (finalScores.top > finalScores.bottom) {
    return 'top';
  }
  if (finalScores.bottom > finalScores.top) {
    return 'bottom';
  }
  return 'draw';
}; 