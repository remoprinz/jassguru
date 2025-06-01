import { Timestamp, FieldValue } from 'firebase/firestore';
import type { PlayerNumber, RoundEntry, StricheRecord, TeamPosition, ScoreSettings, StrokeSettings, FarbeSettings, TeamScores, FirestorePlayer, PlayerNames } from './jass'; // Importiere benötigte Typen

// Einstellungen für ein Turnier
export interface TournamentSettings {
  rankingMode: 'total_points' | 'wins' | 'average_score_per_passe' | 'striche'; // Neuer Modus 'striche' hinzugefügt
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
  status: 'upcoming' | 'active' | 'completed' | 'archived'; // Status des Turniers
  createdBy: string; // User ID des Erstellers
  adminIds: string[]; // User IDs der Turnier-Admins
  participantUids: string[]; // User IDs aller Teilnehmer
  settings?: TournamentSettings; // Turnier-spezifisch
  createdAt: Timestamp | FieldValue; // Zeitstempel der Erstellung
  updatedAt: Timestamp | FieldValue; // Zeitstempel der letzten Änderung
  completedPasseCount: number; // Anzahl abgeschlossener Passen (für 6-Passen-Regel)
  completedAt?: Timestamp | FieldValue | null; // Wann wurde es abgeschlossen?
  currentActiveGameId?: string | null; // NEU: ID des aktuellen aktiven Spiels (Passe)
  lastActivity?: Timestamp | FieldValue | null; // NEU: Wann war die letzte Aktivität
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
  playerId: string;         // UID des Spielers
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
  passeNumber: number;
  startedAt?: Timestamp | FieldValue;   // Zeitstempel, wann die Passe gestartet wurde (aus activeGame.createdAt)
  completedAt: Timestamp | FieldValue;  // Zeitstempel, wann die Passe abgeschlossen wurde
  durationMillis: number;             // Dauer der Passe in Millisekunden
  startingPlayer: PlayerNumber;       // Spieler, der diese Passe begonnen hat
  participantUidsForPasse: string[];  // NEU: Flache Liste der Spieler-UIDs DIESER Passe
  playerDetails: PassePlayerDetail[]; // Detaillierte Ergebnisse pro Spieler in dieser Passe
  teamScoresPasse: TeamScores;        // Team-Gesamtpunkte (Jass + Weis) in dieser Passe
  teamStrichePasse: {                // Team-Striche in dieser Passe
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