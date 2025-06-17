import * as admin from "firebase-admin";

// Interfaces für die aktuelle Datenstruktur
export interface CurrentSessionData {
  participantUids: string[];
  playerNames: { [key: number]: string }; // Position zu Name Mapping
  teams: {
    teamA: {
      players: Array<{
        displayName: string;
        playerId: string;
      }>;
    };
    teamB: {
      players: Array<{
        displayName: string;
        playerId: string;
      }>;
    };
  };
  finalScores: { top: number; bottom: number };
  finalStriche: {
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number };
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number };
  };
  teamScoreMapping: { teamA: 'top' | 'bottom'; teamB: 'top' | 'bottom' };
  winnerTeamKey: 'teamA' | 'teamB' | 'draw';
  status: string;
  groupId?: string;
  createdAt?: admin.firestore.Timestamp;
  startedAt?: admin.firestore.Timestamp;
  endedAt?: admin.firestore.Timestamp;
  lastActivity?: admin.firestore.Timestamp;
  gamesPlayed?: number;
  durationSeconds?: number;
  sessionTotalWeisPoints?: { top: number; bottom: number };
  pairingIdentifiers?: {
    teamA: string;
    teamB: string;
  };
}

export interface CurrentCompletedGameData {
  gameNumber: number;
  finalScores: { top: number; bottom: number };
  finalStriche: {
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number };
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number };
  };
  participantUids: string[];
  durationMillis?: number;
  initialStartingPlayer?: number;
  activeGameId?: string;
  groupId?: string;
  // Weitere Felder können hier hinzugefügt werden
}

/**
 * Extrahiert alle Spieler-UIDs aus einer Session (Auth UIDs)
 */
export function extractPlayerUidsFromSession(sessionData: CurrentSessionData): string[] {
  if (sessionData.participantUids && Array.isArray(sessionData.participantUids)) {
    return sessionData.participantUids;
  }
  
  // Fallback: Aus Teams extrahieren
  const uids: string[] = [];
  if (sessionData.teams?.teamA?.players) {
    sessionData.teams.teamA.players.forEach(player => {
      if (player.playerId) uids.push(player.playerId);
    });
  }
  if (sessionData.teams?.teamB?.players) {
    sessionData.teams.teamB.players.forEach(player => {
      if (player.playerId) uids.push(player.playerId);
    });
  }
  
  return [...new Set(uids)]; // Duplikate entfernen
}

/**
 * Extrahiert alle Player-Doc-IDs aus einer Session (für Gruppen-Mapping)
 * ✅ KORRIGIERT: Konsistente Verwendung von Player-Doc-IDs
 */
export function extractPlayerDocIdsFromSession(sessionData: any): string[] {
  // Prüfe zuerst participantPlayerIds (neue Struktur)
  if (sessionData.participantPlayerIds && Array.isArray(sessionData.participantPlayerIds)) {
    return sessionData.participantPlayerIds;
  }
  
  // ✅ FALLBACK: Extrahiere aus teams-Struktur und mappe Auth UIDs zu Player Doc IDs
  const docIds: string[] = [];
  
  // Erstelle Mapping von Auth UIDs zu Player Doc IDs
  const uidToPlayerIdMapping = new Map<string, string>();
  if (sessionData.participantUids && sessionData.participantPlayerIds) {
    for (let i = 0; i < Math.min(sessionData.participantUids.length, sessionData.participantPlayerIds.length); i++) {
      if (sessionData.participantUids[i] && sessionData.participantPlayerIds[i]) {
        uidToPlayerIdMapping.set(sessionData.participantUids[i], sessionData.participantPlayerIds[i]);
      }
    }
  }
  
  // Extrahiere aus teams-Struktur und konvertiere Auth UIDs zu Player Doc IDs
  if (sessionData.teams?.teamA?.players) {
    sessionData.teams.teamA.players.forEach((player: any) => {
      if (player.playerId) {
        const playerDocId = uidToPlayerIdMapping.get(player.playerId);
        if (playerDocId) {
          docIds.push(playerDocId);
        }
      }
    });
  }
  if (sessionData.teams?.teamB?.players) {
    sessionData.teams.teamB.players.forEach((player: any) => {
      if (player.playerId) {
        const playerDocId = uidToPlayerIdMapping.get(player.playerId);
        if (playerDocId) {
          docIds.push(playerDocId);
        }
      }
    });
  }
  
  return [...new Set(docIds)]; // Duplikate entfernen
}

/**
 * ✅ NEU: Mapping zwischen Auth UIDs und Player Document IDs
 */
function createUidToPlayerDocIdMapping(sessionData: any): Map<string, string> {
  const mapping = new Map<string, string>();
  
  if (sessionData.participantUids && sessionData.participantPlayerIds) {
    const uids = sessionData.participantUids;
    const playerIds = sessionData.participantPlayerIds;
    
    for (let i = 0; i < Math.min(uids.length, playerIds.length); i++) {
      if (uids[i] && playerIds[i]) {
        mapping.set(uids[i], playerIds[i]);
      }
    }
  }
  
  return mapping;
}

/**
 * ✅ KORRIGIERT: Bestimmt, zu welchem Team ein Player Doc ID gehört
 */
export function getPlayerTeamAssignment(playerId: string, sessionData: CurrentSessionData): 'teamA' | 'teamB' | null {
  // Erstelle Mapping von Auth UIDs zu Player Doc IDs
  const uidToPlayerIdMapping = createUidToPlayerDocIdMapping(sessionData);
  
  if (sessionData.teams?.teamA?.players) {
    for (const player of sessionData.teams.teamA.players) {
      if (player.playerId) {
        // Konvertiere Auth UID zu Player Doc ID und vergleiche
        const playerDocId = uidToPlayerIdMapping.get(player.playerId);
        if (playerDocId === playerId) {
        return 'teamA';
        }
      }
    }
  }
  
  if (sessionData.teams?.teamB?.players) {
    for (const player of sessionData.teams.teamB.players) {
      if (player.playerId) {
        // Konvertiere Auth UID zu Player Doc ID und vergleiche
        const playerDocId = uidToPlayerIdMapping.get(player.playerId);
        if (playerDocId === playerId) {
        return 'teamB';
        }
      }
    }
  }
  
  return null;
}

/**
 * Konvertiert Team-Keys zu Score-Positionen basierend auf teamScoreMapping
 */
export function mapTeamToScorePosition(teamKey: 'teamA' | 'teamB', sessionData: CurrentSessionData): 'top' | 'bottom' | null {
  if (!sessionData.teamScoreMapping) {
    // Fallback: teamA = bottom, teamB = top (häufigste Konfiguration)
    return teamKey === 'teamA' ? 'bottom' : 'top';
  }
  
  return sessionData.teamScoreMapping[teamKey] || null;
}

/**
 * Berechnet die Team-Scores basierend auf der teamScoreMapping
 */
export function getTeamScores(sessionData: CurrentSessionData): { teamA: number; teamB: number } {
  const teamAPosition = mapTeamToScorePosition('teamA', sessionData);
  const teamBPosition = mapTeamToScorePosition('teamB', sessionData);
  
  const teamAScore = teamAPosition ? (sessionData.finalScores[teamAPosition] || 0) : 0;
  const teamBScore = teamBPosition ? (sessionData.finalScores[teamBPosition] || 0) : 0;
  
  return { teamA: teamAScore, teamB: teamBScore };
}

/**
 * Berechnet den Striche-Wert aus einem Striche-Record
 */
export function calculateStricheValue(stricheRecord: { berg?: number; sieg?: number; matsch?: number; schneider?: number; kontermatsch?: number } | undefined): number {
  if (!stricheRecord) return 0;
  
  return (stricheRecord.berg || 0) +
         (stricheRecord.sieg || 0) +
         (stricheRecord.matsch || 0) +
         (stricheRecord.schneider || 0) +
         (stricheRecord.kontermatsch || 0);
}

/**
 * Berechnet die Team-Striche basierend auf der teamScoreMapping
 */
export function getTeamStriche(sessionData: CurrentSessionData): { teamA: number; teamB: number } {
  const teamAPosition = mapTeamToScorePosition('teamA', sessionData);
  const teamBPosition = mapTeamToScorePosition('teamB', sessionData);
  
  const teamAStriche = teamAPosition ? calculateStricheValue(sessionData.finalStriche[teamAPosition]) : 0;
  const teamBStriche = teamBPosition ? calculateStricheValue(sessionData.finalStriche[teamBPosition]) : 0;
  
  return { teamA: teamAStriche, teamB: teamBStriche };
}

/**
 * ✅ KORRIGIERT: Bestimmt das Spielergebnis für einen Player Doc ID in einer Session
 */
export function getPlayerSessionOutcome(playerId: string, sessionData: CurrentSessionData): {
  result: 'win' | 'loss' | 'tie';
  playerTeamKey: 'teamA' | 'teamB' | null;
  pointsMade: number;
  pointsReceived: number;
  stricheMade: number;
  stricheReceived: number;
} {
  // ✅ KORRIGIERT: Verwende Player Doc ID für Team-Zuordnung
  const playerTeamKey = getPlayerTeamAssignment(playerId, sessionData);
  
  if (!playerTeamKey) {
    return {
      result: 'tie',
      playerTeamKey: null,
      pointsMade: 0,
      pointsReceived: 0,
      stricheMade: 0,
      stricheReceived: 0,
    };
  }
  
  const teamScores = getTeamScores(sessionData);
  const teamStriche = getTeamStriche(sessionData);
  
  const playerTeamScore = teamScores[playerTeamKey];
  const opponentTeamKey = playerTeamKey === 'teamA' ? 'teamB' : 'teamA';
  const opponentTeamScore = teamScores[opponentTeamKey];
  
  const playerTeamStriche = teamStriche[playerTeamKey];
  const opponentTeamStriche = teamStriche[opponentTeamKey];
  
  let result: 'win' | 'loss' | 'tie';
  if (sessionData.winnerTeamKey === playerTeamKey) {
    result = 'win';
  } else if (sessionData.winnerTeamKey === opponentTeamKey) {
    result = 'loss';
  } else {
    result = 'tie';
  }
  
  return {
    result,
    playerTeamKey,
    pointsMade: playerTeamScore,
    pointsReceived: opponentTeamScore,
    stricheMade: playerTeamStriche,
    stricheReceived: opponentTeamStriche,
  };
}

/**
 * ✅ KORRIGIERT: Bestimmt das Spielergebnis für einen Player Doc ID in einem einzelnen Spiel
 * Verwendet die Session-Daten für Team-Zuordnung und Mapping
 */
export function getPlayerGameOutcome(playerId: string, gameData: CurrentCompletedGameData, sessionData: CurrentSessionData): {
  result: 'win' | 'loss' | 'unknown';
  playerTeamKey: 'teamA' | 'teamB' | null;
  scorePosition: 'top' | 'bottom' | null;
  pointsMade: number;
  pointsReceived: number;
  stricheMade: number;
  stricheReceived: number;
  weisMade: number; // Placeholder für zukünftige Weis-Implementierung
} {
  // ✅ KORRIGIERT: Verwende Player Doc ID für Team-Zuordnung
  const playerTeamKey = getPlayerTeamAssignment(playerId, sessionData);
  
  if (!playerTeamKey) {
    return {
      result: 'unknown',
      playerTeamKey: null,
      scorePosition: null,
      pointsMade: 0,
      pointsReceived: 0,
      stricheMade: 0,
      stricheReceived: 0,
      weisMade: 0,
    };
  }
  
  const scorePosition = mapTeamToScorePosition(playerTeamKey, sessionData);
  const opponentTeamKey = playerTeamKey === 'teamA' ? 'teamB' : 'teamA';
  const opponentScorePosition = mapTeamToScorePosition(opponentTeamKey, sessionData);
  
  if (!scorePosition || !opponentScorePosition) {
    return {
      result: 'unknown',
      playerTeamKey,
      scorePosition,
      pointsMade: 0,
      pointsReceived: 0,
      stricheMade: 0,
      stricheReceived: 0,
      weisMade: 0,
    };
  }
  
  const pointsMade = gameData.finalScores[scorePosition] || 0;
  const pointsReceived = gameData.finalScores[opponentScorePosition] || 0;
  
  const stricheMade = calculateStricheValue(gameData.finalStriche[scorePosition]);
  const stricheReceived = calculateStricheValue(gameData.finalStriche[opponentScorePosition]);
  
  // KORRIGIERT: Gewinner wird durch Sieg-Striche bestimmt, nicht durch Punkte!
  // sieg > 0 bedeutet "hat gewonnen", der Wert ist die Strich-Punkte, nicht die Anzahl Siege
  const playerHasSieg = (gameData.finalStriche[scorePosition]?.sieg || 0) > 0;
  const opponentHasSieg = (gameData.finalStriche[opponentScorePosition]?.sieg || 0) > 0;
  
  let result: 'win' | 'loss' | 'unknown';
  if (playerHasSieg && !opponentHasSieg) {
    result = 'win';
  } else if (opponentHasSieg && !playerHasSieg) {
    result = 'loss';
  } else if (playerHasSieg && opponentHasSieg) {
    // Beide haben Sieg-Striche - sollte theoretisch nicht passieren, aber falls doch: Punkte entscheiden
    if (pointsMade > pointsReceived) {
      result = 'win';
    } else if (pointsReceived > pointsMade) {
      result = 'loss';
    } else {
      result = 'unknown';
    }
  } else {
    // Keiner hat Sieg-Striche - Punkte entscheiden
    if (pointsMade > pointsReceived) {
      result = 'win';
    } else if (pointsReceived > pointsMade) {
      result = 'loss';
    } else {
      result = 'unknown'; // Echtes Unentschieden
    }
  }
  
  return {
    result,
    playerTeamKey,
    scorePosition,
    pointsMade,
    pointsReceived,
    stricheMade,
    stricheReceived,
    weisMade: 0, // TODO: Implementierung wenn Weis-Daten verfügbar sind
  };
}

/**
 * Validiert, ob eine Session-Datenstruktur vollständig ist
 */
export function validateSessionData(sessionData: any): sessionData is CurrentSessionData {
  return (
    sessionData &&
    Array.isArray(sessionData.participantUids) &&
    sessionData.teams &&
    sessionData.teams.teamA &&
    sessionData.teams.teamB &&
    Array.isArray(sessionData.teams.teamA.players) &&
    Array.isArray(sessionData.teams.teamB.players) &&
    sessionData.finalScores &&
    typeof sessionData.finalScores.top === 'number' &&
    typeof sessionData.finalScores.bottom === 'number'
  );
}

/**
 * Validiert, ob ein CompletedGame vollständig ist
 */
export function validateCompletedGameData(gameData: any): gameData is CurrentCompletedGameData {
  return (
    gameData &&
    typeof gameData.gameNumber === 'number' &&
    gameData.finalScores &&
    typeof gameData.finalScores.top === 'number' &&
    typeof gameData.finalScores.bottom === 'number' &&
    gameData.finalStriche &&
    gameData.finalStriche.top &&
    gameData.finalStriche.bottom &&
    Array.isArray(gameData.participantUids)
  );
} 