export const USERS_COLLECTION = "users";
export const GROUPS_COLLECTION = "groups";
export const PLAYERS_COLLECTION = "players";

// Füge hier bei Bedarf weitere Firestore Collection-Namen hinzu

export const FIRESTORE_COLLECTIONS = {
  ACTIVE_GAMES: 'activeGames',
  GROUPS: 'groups',
  PLAYERS: 'players',
  USERS: 'users',
  // --- NEU: Pfad für archivierte Spiele ---
  ARCHIVED_GAMES: (groupId: string) => `groups/${groupId}/games`,
  // ---------------------------------------
} as const;
