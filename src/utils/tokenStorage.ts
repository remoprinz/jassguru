/**
 * Token-Storage-Utilities für das Jassguru Einladungssystem
 * Speichert und verwaltet Einladungs-Tokens im sessionStorage zur Verwendung über Auth-Flows hinweg
 */

// Konstanten für Storage-Keys
const TOURNAMENT_TOKEN_KEY = 'jassguru_tournament_invite_token';
const GROUP_TOKEN_KEY = 'jassguru_group_invite_token';

/**
 * Speichert einen Turnier-Einladungstoken im sessionStorage
 */
export const saveTournamentToken = (token: string): void => {
  try {
    if (typeof window !== 'undefined' && token) {
      sessionStorage.setItem(TOURNAMENT_TOKEN_KEY, token);
      console.log('[tokenStorage] Turniertoken gespeichert:', token);
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Speichern des Turniertokens:', e);
  }
};

/**
 * Liest einen Turnier-Einladungstoken aus dem sessionStorage
 */
export const getTournamentToken = (): string | null => {
  try {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem(TOURNAMENT_TOKEN_KEY);
      console.log('[tokenStorage] Turniertoken gelesen:', token);
      return token;
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Lesen des Turniertokens:', e);
  }
  return null;
};

/**
 * Löscht den Turnier-Einladungstoken aus dem sessionStorage
 */
export const clearTournamentToken = (): void => {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TOURNAMENT_TOKEN_KEY);
      console.log('[tokenStorage] Turniertoken gelöscht');
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Löschen des Turniertokens:', e);
  }
};

/**
 * Speichert einen Gruppen-Einladungstoken im sessionStorage
 */
export const saveGroupToken = (token: string): void => {
  try {
    if (typeof window !== 'undefined' && token) {
      sessionStorage.setItem(GROUP_TOKEN_KEY, token);
      console.log('[tokenStorage] Gruppentoken gespeichert:', token);
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Speichern des Gruppentokens:', e);
  }
};

/**
 * Liest einen Gruppen-Einladungstoken aus dem sessionStorage
 */
export const getGroupToken = (): string | null => {
  try {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem(GROUP_TOKEN_KEY);
      console.log('[tokenStorage] Gruppentoken gelesen:', token);
      return token;
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Lesen des Gruppentokens:', e);
  }
  return null;
};

/**
 * Löscht den Gruppen-Einladungstoken aus dem sessionStorage
 */
export const clearGroupToken = (): void => {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(GROUP_TOKEN_KEY);
      console.log('[tokenStorage] Gruppentoken gelöscht');
    }
  } catch (e) {
    console.error('[tokenStorage] Fehler beim Löschen des Gruppentokens:', e);
  }
};

/**
 * Überprüft, ob ein Einladungstoken (Gruppe oder Turnier) vorhanden ist
 */
export const hasInviteToken = (): boolean => {
  return !!getTournamentToken() || !!getGroupToken();
};

/**
 * Speichert Tokens aus den URL-Parametern im Storage
 */
export const saveTokensFromUrl = (urlQuery: Record<string, any>): void => {
  if (urlQuery.tournamentToken) {
    saveTournamentToken(urlQuery.tournamentToken as string);
  }
  if (urlQuery.token) {
    saveGroupToken(urlQuery.token as string);
  }
}; 