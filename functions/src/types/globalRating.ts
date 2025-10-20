import { Timestamp } from 'firebase-admin/firestore';

/**
 * Globales Elo-Rating für einen Spieler über alle Gruppen hinweg
 */
export interface GlobalPlayerRating {
  /** Eindeutige Spieler-ID */
  playerId: string;
  
  /** Aktuelles globales Elo-Rating */
  currentRating: number;
  
  /** Gesamtanzahl gespielter Spiele über alle Gruppen */
  totalGamesPlayed: number;
  
  /** Letzte Aktualisierung (Timestamp) */
  lastUpdated: Timestamp;
  
  /** Letzte Gruppe, in der der Spieler aktiv war */
  lastGroupId: string;
  
  /** Letztes Event, das das Rating beeinflusst hat */
  lastEventId: string;
  
  /** Peak-Rating über alle Gruppen */
  peakRating: number;
  
  /** Datum des Peak-Ratings */
  peakRatingDate: Timestamp;
  
  /** Niedrigstes Rating über alle Gruppen */
  lowestRating: number;
  
  /** Datum des niedrigsten Ratings */
  lowestRatingDate: Timestamp;
  
  /** Letzte Rating-Änderung */
  lastDelta: number;
}

/**
 * Zeitfilter für History-Abfragen
 */
export interface TimeFilter {
  /** Start-Datum (inklusive) */
  startDate?: Date;
  
  /** End-Datum (inklusive) */
  endDate?: Date;
  
  /** Anzahl der letzten Tage */
  lastDays?: number;
  
  /** Anzahl der letzten Monate */
  lastMonths?: number;
  
  /** Anzahl der letzten Jahre */
  lastYears?: number;
}
