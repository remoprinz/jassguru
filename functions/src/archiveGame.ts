import { onDocumentCreated, FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore"; // Geändert für v2 Syntax
import * as logger from "firebase-functions/logger"; // v2 Logger
import * as admin from "firebase-admin";
// Konstanten direkt definieren, da dynamischer Import problematisch sein kann
const ACTIVE_GAMES_COLLECTION = 'activeGames';
// const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries'; // Nicht mehr direkt hier verwendet
// const JASS_SESSIONS_COLLECTION = 'jassSessions'; // Auskommentiert
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

const db = admin.firestore();

interface PlayerNames {
  [key: number]: string;
}

interface TeamConfig {
  top: [number, number];
  bottom: [number, number];
}

// Interface für RoundEntry definieren, um any zu vermeiden
interface RoundEntry {
  id: string;
  timestamp: number;
  roundId: number;
  startingPlayer: number;
  weisPoints: { top: number; bottom: number };
  jassPoints: { top: number; bottom: number };
  scores: { top: number; bottom: number };
  currentPlayer: number;
  isActive?: boolean;
  // Weitere mögliche Felder, die in RoundEntry vorkommen können
  farbe?: string;
  cardStyle?: string;
  strichInfo?: { team: string; type: string };
  weisActions?: { position: string; points: number }[];
  visualStriche?: { 
    top: { stricheCounts: Record<string, number>; restZahl: number }; 
    bottom: { stricheCounts: Record<string, number>; restZahl: number }; 
  };
  previousRoundId?: number;
  nextRoundId?: number;
  ansager?: number;
  startTime?: number;
  endTime?: number;
  playerTurns?: {
    player: number;
    startTime: number;
    endTime: number;
  }[];
  roundState?: {
    roundNumber: number;
    nextPlayer: number;
  };
  striche?: Record<string, unknown>;
  timerSnapshot?: Record<string, unknown>;
  actionType?: string;
  isRoundFinalized?: boolean;
  isCompleted?: boolean;
}

interface CompletedGameData {
  gameNumber: number;
  activeGameId: string;
  timestampCompleted: admin.firestore.Timestamp;
  durationMillis: number;
  finalScores: { top: number; bottom: number };
  finalStriche: { 
    top: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
    bottom: { berg: number; sieg: number; matsch: number; schneider: number; kontermatsch: number }; 
  };
  weisPoints: { top: number; bottom: number };
  startingPlayer: number;
  initialStartingPlayer: number;
  playerNames: PlayerNames;
  trumpColorsPlayed: string[];
  roundHistory: RoundEntry[]; // Type korrigiert
  participantUids: string[];
  groupId: string | null;
  teams?: TeamConfig; // Teams optional hinzugefügt
}

/**
 * Cloud Function (v2), die ausgelöst wird, wenn ein Dokument in
 * 'jassGameSummaries/{sessionId}/completedGames/{gameNumberString}' erstellt wird.
 * Sie löscht das zugehörige 'activeGame'-Dokument.
 */
export const archivecompletedgame = onDocumentCreated(
  {
    document: `jassGameSummaries/{sessionId}/${COMPLETED_GAMES_SUBCOLLECTION}/{gameNumberString}`,
    region: "europe-west1", // << REGION HIER GESETZT
  },
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { sessionId: string; gameNumberString: string }>): Promise<void> => {
    const { sessionId, gameNumberString } = event.params;
    const snap = event.data;

    logger.info(`[archivecompletedgame ON_CREATED] Triggered for session: ${sessionId}, game: ${gameNumberString}`);

    if (!snap) {
      logger.error(`[archivecompletedgame ON_CREATED - ${sessionId}/${gameNumberString}] Snapshot is undefined. This should not happen for onCreate.`);
      return;
    }

    const completedGameData = snap.data() as CompletedGameData | undefined;

    if (!completedGameData || !completedGameData.activeGameId) {
      logger.error(`[archivecompletedgame ON_CREATED - ${sessionId}/${gameNumberString}] Missing completed game data or activeGameId. This is crucial for finding the active game to delete.`);
      return;
    }

    const activeGameId = completedGameData.activeGameId;
    logger.info(`[archivecompletedgame ON_CREATED - ${sessionId}/${gameNumberString}] Processing activeGameId: ${activeGameId} for deletion.`);

    const activeGameRef = db.collection(ACTIVE_GAMES_COLLECTION).doc(activeGameId);
    
    try {
      await activeGameRef.delete();
      logger.info(`[archivecompletedgame ON_CREATED - ${sessionId}/${gameNumberString}] Successfully deleted active game ${activeGameId}.`);
    } catch (error) {
      logger.error(`[archivecompletedgame ON_CREATED - ${sessionId}/${gameNumberString}] Error deleting active game ${activeGameId}:`, error);
      // Hier könnte man eine Fehlerbehandlung implementieren, z.B. das fehlerhafte completedGame-Dokument markieren
      // oder den Fehler erneut werfen, um eine Wiederholung des Triggers zu ermöglichen, falls sinnvoll.
    }
  }); 