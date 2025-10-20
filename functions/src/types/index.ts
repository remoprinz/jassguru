import { GlobalPlayerRating, TimeFilter } from './globalRating';
import { PlayerStats, PlayerHistoryEntry } from './playerStats';
import { TeamStats, TeamHistoryEntry } from './teamStats';

/**
 * Index-Datei für alle TypeScript-Interfaces
 * Exportiert alle Typen für einfache Imports
 */

export {
  GlobalPlayerRating,
  TimeFilter,
  PlayerStats,
  PlayerHistoryEntry,
  TeamStats,
  TeamHistoryEntry
};

/**
 * Utility-Typen für häufige Operationen
 */

/** Event-Typen für History-Einträge */
export type EventType = 'session_end' | 'tournament_game' | 'tournament_end';

/** Team-Positionen */
export type TeamPosition = 'top' | 'bottom';

/** Spieler-Rollen */
export type PlayerRole = 'player' | 'admin' | 'spectator';

/** Gruppen-Status */
export type GroupStatus = 'active' | 'inactive' | 'archived';

/** Turnier-Status */
export type TournamentStatus = 'draft' | 'active' | 'completed' | 'cancelled';

/**
 * Erweiterte Utility-Funktionen für Typen
 */

/** Validiert ob ein Event-Typ gültig ist */
export function isValidEventType(eventType: string): eventType is EventType {
  return ['session_end', 'tournament_game', 'tournament_end'].includes(eventType);
}

/** Validiert ob eine Team-Position gültig ist */
export function isValidTeamPosition(position: string): position is TeamPosition {
  return ['top', 'bottom'].includes(position);
}

/** Erstellt eine Team-ID aus zwei Spieler-IDs */
export function createTeamId(playerId1: string, playerId2: string): string {
  return [playerId1, playerId2].sort().join('_');
}

/** Extrahiert Spieler-IDs aus einer Team-ID */
export function extractPlayerIdsFromTeamId(teamId: string): string[] {
  return teamId.split('_');
}

/** Validiert ob eine Team-ID gültig ist */
export function isValidTeamId(teamId: string): boolean {
  const parts = teamId.split('_');
  return parts.length === 2 && parts.every(part => part.length > 0);
}

/**
 * Type Guards für Runtime-Validierung
 */

/** Type Guard für PlayerHistoryEntry */
export function isPlayerHistoryEntry(obj: any): obj is PlayerHistoryEntry {
  return (
    obj &&
    typeof obj.playerId === 'string' &&
    typeof obj.groupId === 'string' &&
    typeof obj.eventType === 'string' &&
    typeof obj.eventId === 'string' &&
    typeof obj.rating === 'number' &&
    typeof obj.gamesPlayed === 'number' &&
    obj.delta &&
    obj.cumulative &&
    obj.soloStats
  );
}

/** Type Guard für TeamHistoryEntry */
export function isTeamHistoryEntry(obj: any): obj is TeamHistoryEntry {
  return (
    obj &&
    typeof obj.teamId === 'string' &&
    Array.isArray(obj.playerIds) &&
    obj.playerIds.length === 2 &&
    typeof obj.groupId === 'string' &&
    typeof obj.eventId === 'string' &&
    typeof obj.eventType === 'string' &&
    obj.teamStats &&
    obj.delta
  );
}

/** Type Guard für GlobalPlayerRating */
export function isGlobalPlayerRating(obj: any): obj is GlobalPlayerRating {
  return (
    obj &&
    typeof obj.playerId === 'string' &&
    typeof obj.currentRating === 'number' &&
    typeof obj.totalGamesPlayed === 'number' &&
    typeof obj.lastGroupId === 'string' &&
    typeof obj.lastEventId === 'string'
  );
}

/** Type Guard für TeamStats */
export function isTeamStats(obj: any): obj is TeamStats {
  return (
    obj &&
    typeof obj.teamId === 'string' &&
    Array.isArray(obj.playerIds) &&
    obj.playerIds.length === 2 &&
    typeof obj.groupId === 'string' &&
    typeof obj.gamesPlayedAsTeam === 'number' &&
    typeof obj.winsAsTeam === 'number' &&
    typeof obj.lossesAsTeam === 'number'
  );
}
