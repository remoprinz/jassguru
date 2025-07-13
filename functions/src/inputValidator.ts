import { HttpsError } from "firebase-functions/v2/https";

/**
 * Zentrale Input-Validierungsfunktionen für Cloud Functions
 */

export function validateSessionId(sessionId: any): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError("invalid-argument", "Session ID muss ein String sein.");
  }
  
  if (sessionId.length < 10 || sessionId.length > 50) {
    throw new HttpsError("invalid-argument", "Session ID hat ungültige Länge.");
  }
  
  // Prüfe auf gefährliche Zeichen
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Session ID enthält ungültige Zeichen.");
  }
  
  return sessionId;
}

export function validateGroupId(groupId: any): string {
  if (!groupId || typeof groupId !== 'string') {
    throw new HttpsError("invalid-argument", "Group ID muss ein String sein.");
  }
  
  if (groupId.length < 10 || groupId.length > 50) {
    throw new HttpsError("invalid-argument", "Group ID hat ungültige Länge.");
  }
  
  // Prüfe auf gefährliche Zeichen
  if (!/^[a-zA-Z0-9_-]+$/.test(groupId)) {
    throw new HttpsError("invalid-argument", "Group ID enthält ungültige Zeichen.");
  }
  
  return groupId;
}

export function validatePlayerId(playerId: any): string {
  if (!playerId || typeof playerId !== 'string') {
    throw new HttpsError("invalid-argument", "Player ID muss ein String sein.");
  }
  
  if (playerId.length < 10 || playerId.length > 50) {
    throw new HttpsError("invalid-argument", "Player ID hat ungültige Länge.");
  }
  
  // Prüfe auf gefährliche Zeichen
  if (!/^[a-zA-Z0-9_-]+$/.test(playerId)) {
    throw new HttpsError("invalid-argument", "Player ID enthält ungültige Zeichen.");
  }
  
  return playerId;
}

export function validateTournamentId(tournamentId: any): string {
  if (!tournamentId || typeof tournamentId !== 'string') {
    throw new HttpsError("invalid-argument", "Tournament ID muss ein String sein.");
  }
  
  if (tournamentId.length < 10 || tournamentId.length > 50) {
    throw new HttpsError("invalid-argument", "Tournament ID hat ungültige Länge.");
  }
  
  // Prüfe auf gefährliche Zeichen
  if (!/^[a-zA-Z0-9_-]+$/.test(tournamentId)) {
    throw new HttpsError("invalid-argument", "Tournament ID enthält ungültige Zeichen.");
  }
  
  return tournamentId;
}

export function validateGameNumber(gameNumber: any): number {
  if (typeof gameNumber !== 'number' || !Number.isInteger(gameNumber)) {
    throw new HttpsError("invalid-argument", "Game Number muss eine ganze Zahl sein.");
  }
  
  if (gameNumber < 1 || gameNumber > 1000) {
    throw new HttpsError("invalid-argument", "Game Number muss zwischen 1 und 1000 liegen.");
  }
  
  return gameNumber;
}

export function validatePlayerIds(playerIds: any): string[] {
  if (!Array.isArray(playerIds)) {
    throw new HttpsError("invalid-argument", "Player IDs müssen ein Array sein.");
  }
  
  if (playerIds.length !== 4) {
    throw new HttpsError("invalid-argument", "Genau 4 Player IDs erforderlich.");
  }
  
  return playerIds.map(id => validatePlayerId(id));
}

export function sanitizeString(input: any, maxLength = 100): string {
  if (typeof input !== 'string') {
    throw new HttpsError("invalid-argument", "Input muss ein String sein.");
  }
  
  // Entferne gefährliche Zeichen
  const sanitized = input
    .replace(/[<>"'&]/g, '') // HTML-Zeichen entfernen
    .replace(/\s+/g, ' ') // Mehrfache Leerzeichen normalisieren
    .trim();
  
  if (sanitized.length > maxLength) {
    throw new HttpsError("invalid-argument", `String zu lang (max ${maxLength} Zeichen).`);
  }
  
  return sanitized;
}

/**
 * Validiert Email-Adressen
 */
export function validateEmail(email: any): string {
  if (!email || typeof email !== 'string') {
    throw new HttpsError("invalid-argument", "Email muss ein String sein.");
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new HttpsError("invalid-argument", "Ungültige Email-Adresse.");
  }
  
  if (email.length > 254) {
    throw new HttpsError("invalid-argument", "Email-Adresse zu lang.");
  }
  
  return email.toLowerCase();
}

/**
 * Validiert Timestamps
 */
export function validateTimestamp(timestamp: any): number {
  if (typeof timestamp !== 'number') {
    throw new HttpsError("invalid-argument", "Timestamp muss eine Zahl sein.");
  }
  
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);
  
  if (timestamp < oneYearAgo || timestamp > oneYearFromNow) {
    throw new HttpsError("invalid-argument", "Timestamp liegt außerhalb des gültigen Bereichs.");
  }
  
  return timestamp;
} 