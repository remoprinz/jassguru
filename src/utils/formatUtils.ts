/**
 * Formatierungshilfsfunktionen für die Jassguru-App
 */

import { Timestamp } from "firebase/firestore";
import type { SpieltempoKategorie } from "../types/sprueche";

/**
 * Konvertiert einen String in Title Case (erster Buchstabe jedes Wortes groß)
 */
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Erstellt einen CSS-Klassen-String aus mehreren Konditionen
 */
export function classNames(...classes: (string | undefined | boolean | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatMillisecondsToHumanReadable(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatDate(timestamp: { seconds: number; nanoseconds: number } | Date): string {
  if (!timestamp) return "-";
  
  let date: Date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (timestamp && typeof timestamp.seconds === 'number') {
    date = new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
  } else {
    return "-";
  }
  
  return date.toLocaleDateString('de-CH');
}

/**
 * Formatiert eine Dauer in Sekunden zu einer menschenlesbaren Form
 * mit automatischer Einheitenwahl (s, m, h, d)
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (remainingHours > 0) {
    return `${days}d ${remainingHours}h`;
  }
  return `${days}d`;
}

/**
 * Formatiert Millisekunden zu einer menschenlesbaren Form
 * mit automatischer Einheitenwahl
 */
export function formatMillisecondsDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return formatDuration(seconds);
}

/**
 * Formatiert ein Highlight-Datum (einzelnes Datum)
 */
export function formatHighlightDate(timestamp: { seconds: number; nanoseconds: number } | Date | null | undefined): string {
  if (!timestamp) return "-";
  return formatDate(timestamp);
}

/**
 * Formatiert einen Streak-Datumsbereich (Start - Ende oder einzelnes Datum)
 */
export function formatStreakDateRange(
  startDate: { seconds: number; nanoseconds: number } | Date | null | undefined,
  endDate: { seconds: number; nanoseconds: number } | Date | null | undefined
): string {
  if (!startDate && !endDate) return "-";
  
  const start = startDate ? formatDate(startDate) : null;
  const end = endDate ? formatDate(endDate) : null;
  
  // Wenn beide Daten gleich sind oder nur ein Datum vorhanden ist
  if (start === end || !start || !end) {
    return start || end || "-";
  }
  
  // Datumsbereich
  return `${start} - ${end}`;
}

/**
 * Bestimmt die Session-ID für Navigation basierend auf Highlight-Typ
 * - Einzelne Highlights: relatedId (Session-ID)
 * - Serien: startSessionId oder endSessionId (je nach Präferenz)
 */
export function getNavigationSessionId(
  relatedId?: string,
  startSessionId?: string,
  endSessionId?: string,
  preferEnd: boolean = false
): string | null {
  // Einzelnes Highlight
  if (relatedId) {
    return relatedId;
  }
  
  // Serie: Bevorzuge Ende oder Anfang
  if (preferEnd && endSessionId) {
    return endSessionId;
  }
  
  return startSessionId || endSessionId || null;
}

/**
 * Kategorisiert die Spielzeit in Tempo-Kategorien
 * Realistische Werte für Jass-Sessions:
 * - blitz_schnell: < 30 min (Express-Jass)
 * - schnell: 30-75 min (Flotter Jass)
 * - normal: 75-150 min (Normaler Jass, 1.5-2.5h)
 * - gemütlich: 150-240 min (Gemütlicher Jass, 2.5-4h)
 * - marathon: > 240 min (Echter Marathon, >4h)
 */
export function getSpieltempoKategorie(durationSeconds: number): SpieltempoKategorie {
  const durationMinutes = durationSeconds / 60;
  
  if (durationMinutes < 30) {
    return 'blitz_schnell';
  } else if (durationMinutes < 75) {
    return 'schnell';
  } else if (durationMinutes < 150) {
    return 'normal';
  } else if (durationMinutes < 240) {
    return 'gemütlich';
  } else {
    return 'marathon';
  }
}

/**
 * Kürzt Spielernamen für Charts ab
 * Wenn zwei Namen (Vorname & Nachname): Vorname + erster Buchstabe des Nachnamens + Punkt
 * Beispiel: "Andy Weiss" → "Andy W."
 * Wenn nur ein Name oder mehr als zwei Namen: Original bleibt unverändert
 */
export function abbreviatePlayerName(name: string): string {
  if (!name) return '';
  
  // Split bei Leerzeichen
  const parts = name.trim().split(/\s+/);
  
  // Wenn genau zwei Teile → Vorname + erster Buchstabe Nachname + Punkt
  if (parts.length === 2) {
    const firstName = parts[0];
    const lastNameInitial = parts[1].charAt(0).toUpperCase();
    return `${firstName} ${lastNameInitial}.`;
  }
  
  // Alle anderen Fälle: Original zurückgeben
  return name;
}