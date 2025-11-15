import { Timestamp, FieldValue } from 'firebase/firestore';
import type { PlayerNumber, RoundEntry, StricheRecord, TeamPosition, ScoreSettings, StrokeSettings, FarbeSettings, TeamScores, FirestorePlayer, PlayerNames } from './jass'; // Importiere benötigte Typen

// Einstellungen für ein Turnier
export interface TournamentSettings {
  rankingMode: 'total_points' | 'striche' | 'striche_difference' | 'points_difference' | 'alle_ranglisten'; // Zählart: Nach Punkten, Nach Strichen, Nach Strichdifferenz, Nach Punktedifferenz oder Alle Ranglisten
  scoreSettings: ScoreSettings; // NEU: Einstellungen für Punkte
  strokeSettings: StrokeSettings; // NEU: Einstellungen für Striche
  farbeSettings: FarbeSettings; // NEU: Einstellungen für Farben und Multiplikatoren
  minParticipants?: number | null; // GEÄNDERT
  maxParticipants?: number | null; // GEÄNDERT
  logoUrl?: string; // NEU HINZUGEFÜGT
  scheduledStartTime?: Timestamp | null; // NEU: Geplante Startzeit des Turniers
  // Zukünftige Einstellungen: z.B. maxPassen, spezielle Regeln etc.
}

// Kerninformationen einer Turnierinstanz
export interface TournamentInstance {
  id: string; // Firestore Document ID
  groupId: string; // Referenz zur Jass-Gruppe
  name: string; // z.B. "Jassreise Krakau 2025"
  description?: string; // Optional: Beschreibung des Turniers
  logoUrl?: string | null; // Optional: Logo-URL
  instanceDate?: Timestamp | null; // Optionales Datum des Turniers
  status: 'upcoming' | 'active' | 'paused' | 'completed' | 'archived'; // 🆕 Status erweitert um 'paused'
  createdBy: string; // User ID des Erstellers
  adminIds: string[]; // User IDs der Turnier-Admins
  participantUids: string[]; // User IDs aller Teilnehmer (Legacy)
  participantPlayerIds?: string[]; // ✅ NEU: Player Document IDs aller Teilnehmer
  
  // 🆕 DUALE NUMMERIERUNG & TURNIERMODUS
  tournamentMode: 'spontaneous' | 'planned';  // Spontan oder geplant
  currentRound: number;                       // Aktuelle Turnier-Runde (1, 2, 3...)
  
  settings?: TournamentSettings; // Turnier-spezifisch
  createdAt: Timestamp | FieldValue; // Zeitstempel der Erstellung
  updatedAt: Timestamp | FieldValue; // Zeitstempel der letzten Änderung
  completedPasseCount: number; // Anzahl abgeschlossener Passen (für 6-Passen-Regel)
  completedAt?: Timestamp | FieldValue | null; // Wann wurde es abgeschlossen?
  pausedAt?: Timestamp | FieldValue | null; // NEU: Wann wurde es unterbrochen?
  resumedAt?: Timestamp | FieldValue | null; // NEU: Wann wurde es fortgesetzt?
  finalizedAt?: Timestamp | FieldValue | null; // NEU: Wann wurde es finalisiert (Cloud Function abgeschlossen)?
  lastSessionId?: string | null; // NEU: ID der letzten jassGameSummaries Session
  currentActiveGameId?: string | null; // NEU: ID des aktuellen aktiven Spiels (Passe)
  lastActivity?: Timestamp | FieldValue | null; // NEU: Wann war die letzte Aktivität
  showInNavigation?: boolean; // NEU: Soll das Turnier in der Bottom-Navigation angezeigt werden? (Default: true)
  // Optional: Aggregierte Statistiken (für schnelle Ranglisten)
  playerStats?: Record<string, TournamentPlayerStats>;
  totalPasses?: number;
  winnerUid?: string;
}

// Ergebnis eines Spielers in einer einzelnen Passe
export interface PlayerPasseResult {
  score: number; // Jass-Punkte dieser Passe
  striche: number;  // Erzielte Striche in dieser Passe (aggregiert)
  weis: number;     // Erzielte Weispunkte in dieser Passe
}

// NEU: Ergebnis eines einzelnen Spielers IN DIESER PASSE
export interface PassePlayerDetail {
  playerId: string;         // 🆕 Player Document ID (NICHT UID!) - für Stats-Kompatibilität
  playerName: string;       // Name des Spielers zum Zeitpunkt der Passe
  seat: PlayerNumber;       // Auf welcher Position (1-4) saß der Spieler
  team: TeamPosition;       // In welchem Team (top/bottom) war der Spieler
  scoreInPasse: number;     // Punkte, die dieser Spieler (bzw. sein Team) in dieser Passe erzielt hat
  stricheInPasse: StricheRecord; // Detaillierte Striche, die dieser Spieler (bzw. sein Team) in dieser Passe erzielt hat
  weisInPasse: number;      // Weispunkte, die dieser Spieler (bzw. sein Team) in dieser Passe erzielt hat
}

// Abgeschlossenes Turnierspiel (Passe) - Überarbeitet
export interface TournamentGame {
  passeId: string;                    // ID des ursprünglichen activeGame-Dokuments
  tournamentInstanceId: string;
  
  // 🆕 DUALE NUMMERIERUNG
  passeNumber: number;                // Legacy: Einfache durchlaufende Nummer (wird durch passeLabel ersetzt)
  tournamentRound: number;            // Globale Turnier-Runde (1, 2, 3...)
  passeInRound: string;               // Passe innerhalb der Runde ("A", "B", "C"...)
  passeLabel: string;                 // Kombinierte Anzeige ("1A", "1B", "2A"...)
  
  // 🆕 TURNIERMODUS
  tournamentMode: 'spontaneous' | 'planned';  // Spontan oder geplant
  
  startedAt?: Timestamp | FieldValue;   // Zeitstempel, wann die Passe gestartet wurde (aus activeGame.createdAt)
  completedAt: Timestamp | FieldValue;  // Zeitstempel, wann die Passe abgeschlossen wurde
  durationMillis: number;             // Dauer der Passe in Millisekunden
  startingPlayer: PlayerNumber;       // Spieler, der diese Passe begonnen hat
  
  // 🆕 PLAYER IDS FÜR STATS (KRITISCH!)
  participantUidsForPasse: string[];  // Firebase Auth UIDs der Spieler DIESER Passe
  participantPlayerIds: string[];     // Player Document IDs (für Stats-Kompatibilität!)
  
  playerDetails: PassePlayerDetail[]; // Detaillierte Ergebnisse pro Spieler in dieser Passe
  teamScoresPasse: TeamScores;        // Team-Gesamtpunkte (Jass + Weis) in dieser Passe
  teamStrichePasse: {                // Team-Striche in dieser Passe
    top: StricheRecord;
    bottom: StricheRecord;
  };
  
  // 🆕 EVENT COUNTS FÜR STATS (KRITISCH!)
  eventCounts?: {
    bottom: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
    top: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
  };

  // 🆕 TEAMS FÜR BACKEND-KOMPATIBILITÄT
  teams?: {
    top: {
      players: { playerId: string; displayName: string; }[];
    };
    bottom: {
      players: { playerId: string; displayName: string; }[];
    };
  };

  // 🆕 FINAL SCORES FÜR BACKEND-KOMPATIBILITÄT
  finalScores?: {
    top: number;
    bottom: number;
  };

  // 🆕 FINAL STRICHE FÜR BACKEND-KOMPATIBILITÄT
  finalStriche?: {
    top: StricheRecord;
    bottom: StricheRecord;
  };
  
  // Einstellungen, die für diese Passe galten (Kopie aus activeGame)
  activeScoreSettings: ScoreSettings;
  activeStrokeSettings: StrokeSettings;
  activeFarbeSettings: FarbeSettings;

  // Optional: Detaillierte Rundenhistorie dieser Passe
  roundHistory?: RoundEntry[]; // Kopie der Runden aus activeGame/{passeId}/rounds
}

// Aktives, laufendes Turnierspiel (Passe)
// HINWEIS: Wir verwenden stattdessen das erweiterte `ActiveGame` aus `types/jass.ts`
// export interface ActiveTournamentGame { ... }

// Aggregierte Statistiken eines Spielers über das gesamte Turnier
export interface TournamentPlayerStats {
  totalScore: number;
  totalStriche: number;
  totalWeis: number;
  passenPlayed: number;
  // Weitere Statistiken: z.B. höchstes Passe-Ergebnis, Match-Quote etc.
}

// --- HIERHER VERSCHOBEN --- 
// Struktur eines Teilnehmers (kombiniert FirestorePlayer mit Turnier-spezifischen Daten)
// HINWEIS: FirestorePlayer sollte aus types/jass.ts importiert werden!
// export interface TournamentParticipant extends FirestorePlayer { ... }

// Wir brauchen keinen eigenen Typ hier, da wir FirestorePlayer aus jass.ts verwenden. 

export type PlayerToPseudoIdMapping = Record<string, string>; // userId -> pseudoId

export type PlayerIdToNameMapping = Record<string, string>; // userId -> displayName

export interface TournamentSetting {
  // ... existing code ...
}

export interface TournamentStoreState {
  // Details einer einzelnen Turnierinstanz
  currentTournamentInstance: TournamentInstance | null;
  detailsStatus: 'idle' | 'loading' | 'success' | 'error';
  loadingInstanceId: string | null; // ID des Turniers, das gerade geladen wird

  // Liste der Spiele/Passen für die aktuelle Turnierinstanz (Übersicht)
  currentTournamentGames: TournamentGame[];
  gamesStatus: 'idle' | 'loading' | 'success' | 'error';

  // Teilnehmer der aktuellen Turnierinstanz
  currentTournamentParticipants: FirestorePlayer[]; // FirestorePlayer verwenden
  participantsStatus: 'idle' | 'loading' | 'success' | 'error';

  // NEU: Zustand für die Anzeige einer einzelnen Passe
  currentViewingPasse: TournamentGame | null;
  passeDetailsStatus: 'idle' | 'loading' | 'success' | 'error';

  // Liste aller Turniere, an denen der Benutzer teilnimmt (für /tournaments Seite)
  // ... existing code ...
}

export interface TournamentActions {
  fetchTournamentInstanceDetails: (instanceId: string) => Promise<void>;
  createTournamentInstance: (data: Omit<TournamentInstance, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status' | 'completedPasseCount' | 'activeGameId'>, createdBy: string) => Promise<string | null>;
  updateTournamentInstance: (instanceId: string, data: Partial<TournamentInstance>) => Promise<void>;
  deleteTournamentInstance: (instanceId: string) => Promise<void>;
  loadUserTournaments: (userId: string) => Promise<void>;
  loadTournamentGames: (instanceId: string) => Promise<void>;
  // NEU: Funktion zum Laden der Runden einer spezifischen Passe (für Rundenhistorie im Viewer)
  loadPasseRounds: (instanceId: string, passeId: string) => Promise<RoundEntry[]>; 
  // NEU: Funktion zum Laden einer einzelnen Passe für die Detailansicht
  fetchTournamentGameById: (instanceId: string, passeId: string) => Promise<void>;
  startTournamentPasse: (tournamentId: string, playerNames: PlayerNames, teams: { top: PlayerNumber[], bottom: PlayerNumber[] }, currentPasseNumber: number, participantUids: string[]) => Promise<string | null>;
  // ... andere Actions ...
} 