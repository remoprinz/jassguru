import { create, StateCreator } from 'zustand';
import type {
  TournamentInstance as TournamentInstanceType,
  TournamentGame,
  TournamentSettings,
  TournamentPlayerStats,
  // FirestorePlayer, // Wird lokal definiert als Workaround, falls nicht exportiert
} from '../types/tournament';
import type { PlayerNumber, ActiveGame, RoundEntry, ScoreSettings, StrokeSettings, PlayerNames, StricheRecord, GameState, GamePlayers, MemberInfo, FarbeSettings } from '../types/jass';
import {
  fetchTournamentInstancesForGroup,
  fetchTournamentInstanceDetails as fetchTournamentInstanceDetailsService,
  createTournamentInstance as createTournamentInstanceService,
  fetchTournamentGames,
  fetchTournamentParticipants,
  // startTournamentPasseService wird nicht verwendet - Store-Implementierung (startNewPasse) wird stattdessen verwendet
  completeTournamentPasse as completeTournamentPasseService,
  updateTournamentSettings as updateTournamentSettingsService,
  addParticipantToTournament as addParticipantToTournamentService,
  removeParticipantFromTournament as removeParticipantFromTournamentService,
  addTournamentAdmin as addTournamentAdminService,
  removeTournamentAdmin as removeTournamentAdminService,
  leaveTournament as leaveTournamentService,
  fetchTournamentsForUser,
  fetchPasseRounds as fetchPasseRoundsService,
  markTournamentAsCompletedService,
  updateTournamentBaseDetails as updateTournamentBaseDetailsService,
  activateTournamentService,
  pauseTournamentService,
  resumeTournamentService,
} from '../services/tournamentService';
import { Timestamp, doc, getDoc, getDocs, collection, query, where, orderBy, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/services/firebaseInit';

import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { useGameStore } from '@/store/gameStore';

// Standardeinstellungen für Turniere
const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  rankingMode: 'total_points',
  scoreSettings: DEFAULT_SCORE_SETTINGS,
  strokeSettings: DEFAULT_STROKE_SETTINGS,
  farbeSettings: DEFAULT_FARBE_SETTINGS,
  minParticipants: 4,
  maxParticipants: null,
};

const lastSetInstanceIdForDebug: string | null = null;
const lastSetInstanceUpdatedAtForDebug: number | null = null;

type TournamentStatus = 'idle' | 'loading-list' | 'loading-details' | 'loading-games' | 'loading-participants' | 'updating-settings' | 'managing-participant' | 'leaving-tournament' | 'success' | 'error' | 'loading-passe-rounds';

type DataStatus = 'idle' | 'loading' | 'success' | 'error';

// WORKAROUND: Lokale Basisdefinition für FirestorePlayer, falls nicht aus ../types/tournament exportiert
interface FirestorePlayerFromService { // Um Konflikt zu vermeiden
  id: string; // Annahme: Der Service gibt 'id' zurück, das zu 'uid' gemappt wird
  uid?: string; // Falls es doch uid ist
  displayName: string;
  photoURL?: string;
  [key: string]: any;
}
// END WORKAROUND

interface TournamentInstance extends TournamentInstanceType {
  participants?: ParticipantWithProgress[];
}

// Interface für Teilnehmer mit Fortschrittsinformationen
export interface ParticipantWithProgress {
  uid: string; // Firebase Auth UID (userId)
  playerId?: string; // Player Document ID (optional für Rückwärtskompatibilität)
  displayName: string;
  photoURL?: string;
  completedPassesCount: number;
  currentPasseNumberForPlayer: number;
  [key: string]: any;
}

interface TournamentState {
  currentTournamentInstance: TournamentInstance | null;
  userTournamentInstances: TournamentInstanceType[];
  tournamentParticipants: ParticipantWithProgress[];
  currentTournamentGames: TournamentGame[];
  activePasse: ActiveGame | null;
  tournamentPlayerStats: TournamentPlayerStats | null;
  status: TournamentStatus;
  detailsStatus: DataStatus;
  participantsStatus: DataStatus;
  gamesStatus: DataStatus;
  error: string | null;
  loadingInstanceId: string | null;

  passeRoundsCache: Record<string, RoundEntry[] | undefined>;
  passeRoundsStatus: Record<string, DataStatus | undefined>;

  userActiveTournamentId: string | null;
  userActiveTournamentStatus: DataStatus;
  userActiveTournamentError: string | null;

  currentViewingPasse: TournamentGame | null;
  passeDetailsStatus: DataStatus;

  tournamentListenerUnsubscribe: (() => void) | null;
  userTournamentsListenerUnsubscribe: (() => void) | null; // 🆕 NEU: Separater Listener für alle User-Turniere
}

interface TournamentActions {
  createTournament: (
    groupId: string,
    creatorUid: string,
    name: string,
    participantUids: string[],
    settings: TournamentSettings
  ) => Promise<string>;
  loadUserTournamentInstances: (userId: string, groupId?: string) => Promise<void>;
  setCurrentTournamentInstance: (instance: TournamentInstance | null) => void;
  fetchTournamentInstanceDetails: (instanceId: string) => Promise<void>;
  loadTournamentGames: (instanceId: string) => Promise<void>;
  loadTournamentParticipants: (instanceId: string) => Promise<void>;
  startNewPasse: (
    instanceId: string,
    players: Array<{ uid: string; playerId: string; name: string; playerNumber: PlayerNumber; completedPassesCount: number; photoURL?: string; }>,
    startingPlayer: PlayerNumber
  ) => Promise<string | null>;
  updateActivePasse: (passeData: Partial<ActiveGame>) => void;
  completePasse: (activePasseId: string, passeData: TournamentGame) => Promise<void>;
  updateTournamentSettings: (
    instanceId: string,
    settingsToUpdate: Partial<TournamentSettings>
  ) => Promise<boolean>;
  updateTournamentDetails: (
    instanceId: string,
    details: { name?: string; description?: string }
  ) => Promise<boolean>;
  removeParticipant: (instanceId: string, participantUid: string) => Promise<boolean>;
  makeParticipantAdmin: (instanceId: string, participantUid: string) => Promise<boolean>;
  removeParticipantAdmin: (instanceId: string, participantUid: string) => Promise<boolean>;
  addParticipantManual: (instanceId: string, participantUid: string) => Promise<boolean>;
  leaveTournament: (instanceId: string, userId: string) => Promise<boolean>;
  clearError: () => void;
  clearCurrentTournamentInstance: () => void;

  loadPasseRounds: (instanceId: string, passeId: string) => Promise<void>;

  addMultipleParticipants: (instanceId: string, userIds: string[]) => Promise<boolean>;

  checkUserActiveTournament: (userId: string) => Promise<boolean>;

  fetchTournamentGameById: (instanceId: string, passeId: string) => Promise<void>;

  completeTournament: (instanceId: string) => Promise<boolean>;

  resetTournamentState: () => void;

  setupTournamentListener: (instanceId: string) => void;
  clearTournamentListener: () => void;
  
  // 🆕 NEU: Listener für automatische Turnier-Status-Updates für alle User-Turniere
  setupUserTournamentsListener: (identifier: string, playerId?: string | null) => void;

  activateTournament: (instanceId: string) => Promise<boolean>;
  pauseTournament: (instanceId: string) => Promise<boolean>;
  resumeTournament: (instanceId: string) => Promise<boolean>;

  recordPasseCompletion: (
    tournamentId: string,
    completedPasseId: string,
    participatingPlayerUids: string[],
    finalScores: { top: number; bottom: number },
    finalStriche: { top: StricheRecord; bottom: StricheRecord }
  ) => Promise<void>;
}

const initialState: Omit<TournamentState, keyof TournamentActions> = {
  currentTournamentInstance: null,
  detailsStatus: 'idle',
  loadingInstanceId: null,
  currentTournamentGames: [],
  gamesStatus: 'idle',
  tournamentParticipants: [],
  participantsStatus: 'idle',
  userTournamentInstances: [],
  userActiveTournamentId: null,
  userActiveTournamentStatus: 'idle',
  userActiveTournamentError: null,
  activePasse: null,
  tournamentPlayerStats: null,
  status: 'idle',
  error: null,
  passeRoundsCache: {},
  passeRoundsStatus: {},
  currentViewingPasse: null,
  passeDetailsStatus: 'idle',
  tournamentListenerUnsubscribe: null,
  userTournamentsListenerUnsubscribe: null, // 🆕 NEU: Separater Listener für alle User-Turniere
};

export const useTournamentStore = create<TournamentState & TournamentActions>((set, get) => ({
  ...initialState,

  createTournament: async (groupId, creatorUid, name, participantUids, settings) => {
    set({ status: 'loading-list', error: null });
    try {
      const completeSettings: TournamentSettings = {
        rankingMode: settings.rankingMode, 
        scoreSettings: settings.scoreSettings ?? DEFAULT_SCORE_SETTINGS, 
        strokeSettings: settings.strokeSettings ?? DEFAULT_STROKE_SETTINGS, 
        farbeSettings: settings.farbeSettings ?? DEFAULT_FARBE_SETTINGS, 
        minParticipants: settings.minParticipants ?? 4,
        maxParticipants: settings.maxParticipants ?? null,
      };

      const newInstanceId = await createTournamentInstanceService(
        groupId,
        creatorUid,
        name,
        participantUids,
        completeSettings,
        'upcoming'
      );
      await get().loadUserTournamentInstances(creatorUid);
      set({ status: 'success', currentTournamentInstance: null });
      return newInstanceId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Erstellen des Turniers.';
      console.error('[TournamentStore] Error creating tournament:', error);
      set({ status: 'error', error: message });
      throw error;
    }
  },

  loadUserTournamentInstances: async (userIdOrPlayerId, groupId) => {
    set({ status: 'loading-list', error: null });
    try {
      if (groupId) {
          const instances = await fetchTournamentInstancesForGroup(groupId);
          set({ userTournamentInstances: instances, status: 'success' });
      } else {
          // 🔧 FIX: Konvertiere UID zu playerId falls nötig
          let playerId = userIdOrPlayerId;
          
          // Versuche zu bestimmen, ob es eine UID ist (prüfe ob Player-Dokument mit dieser ID als userId existiert)
          try {
            const { getDoc, doc } = await import('firebase/firestore');
            const { db } = await import('@/services/firebaseInit');
            const playerDocRef = doc(db, 'players', userIdOrPlayerId);
            const playerDoc = await getDoc(playerDocRef);
            
            if (!playerDoc.exists()) {
              // Kein Player-Dokument mit dieser ID gefunden - könnte eine UID sein
              // Versuche Player-Dokument mit dieser userId zu finden
              const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
              const playersRef = collection(db, 'players');
              const q = query(playersRef, where('userId', '==', userIdOrPlayerId), limit(1));
              const snapshot = await getDocs(q);
              
              if (!snapshot.empty) {
                playerId = snapshot.docs[0].id;
              }
            }
          } catch (conversionError) {
            console.warn('[TournamentStore] Error converting UID to playerId:', conversionError);
            // Fahre mit der original ID fort
          }
          
          const instances = await fetchTournamentsForUser(playerId);
          set({ userTournamentInstances: instances, status: 'success' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden der Turnier-Instanzen.';
      console.error('[TournamentStore] Error loading tournament instances:', error);
      set({ status: 'error', error: message });
    }
  },

  setCurrentTournamentInstance: (instance) => {
    set({ currentTournamentInstance: instance as TournamentInstance | null });
    if (instance) {
        set({ currentTournamentGames: [], tournamentParticipants: [], passeRoundsCache: {}, passeRoundsStatus: {} });
    }
  },

  fetchTournamentInstanceDetails: async (instanceId) => {
    const state = get();

    if ((state.currentTournamentInstance?.id === instanceId && state.detailsStatus === 'success') || 
        (state.detailsStatus === 'loading' && state.loadingInstanceId === instanceId)) {
      if (state.currentTournamentInstance?.id === instanceId && !state.tournamentListenerUnsubscribe) {
        get().setupTournamentListener(instanceId);
      }
      return;
    }
    
    // ✅ Logs aufgeräumt: Nur bei echten Problemen loggen
    if (state.currentTournamentInstance?.id !== instanceId || !state.currentTournamentInstance) {
      set({
        currentTournamentGames: [],
        gamesStatus: 'idle',
        tournamentParticipants: [],
        participantsStatus: 'idle',
        passeRoundsCache: {},
        passeRoundsStatus: {},
        currentViewingPasse: null,
        passeDetailsStatus: 'idle',
      });
    }

    set({ detailsStatus: 'loading', loadingInstanceId: instanceId, error: null });

    try {
      const instanceFromService = await fetchTournamentInstanceDetailsService(instanceId);
      if (instanceFromService) {
        // Stelle sicher, dass die Einstellungen vollständig und korrekt sind
        const normalizedSettings: TournamentSettings = {
          ...DEFAULT_TOURNAMENT_SETTINGS,
          ...(instanceFromService.settings || {}),
        };

        // Stelle sicher, dass die verschachtelten Einstellungsobjekte vollständig sind
        normalizedSettings.scoreSettings = {
          ...DEFAULT_SCORE_SETTINGS,
          ...(instanceFromService.settings?.scoreSettings || {})
        };
        normalizedSettings.strokeSettings = {
          ...DEFAULT_STROKE_SETTINGS,
          ...(instanceFromService.settings?.strokeSettings || {})
        };
        normalizedSettings.farbeSettings = {
          ...DEFAULT_FARBE_SETTINGS,
          ...(instanceFromService.settings?.farbeSettings || {})
        };

        // Stelle sicher, dass die inneren Strukturen vollständig sind
        if (normalizedSettings.farbeSettings && typeof normalizedSettings.farbeSettings === 'object') {
          normalizedSettings.farbeSettings.values = {
            ...DEFAULT_FARBE_SETTINGS.values,
            ...(normalizedSettings.farbeSettings.values || {})
          };
        }

        // Erstelle die normalisierte Instanz
        const normalizedInstance: TournamentInstance = {
          ...instanceFromService,
          settings: normalizedSettings
        };

        // ✅ Logs aufgeräumt: Settings-Log entfernt
        
        if (get().loadingInstanceId === instanceId) {
          set({ 
            currentTournamentInstance: normalizedInstance, 
            status: 'success', 
            detailsStatus: 'success', 
            loadingInstanceId: null 
          });
          
          get().setupTournamentListener(instanceId);
        }
      } else {
        if (get().loadingInstanceId === instanceId) {
          console.warn(`[TournamentStore] Tournament instance ${instanceId} not found by service or access denied.`);
          set({ status: 'error', detailsStatus: 'error', error: 'Turnier nicht gefunden oder Zugriff verweigert.', currentTournamentInstance: null, loadingInstanceId: null });
        }
      }
    } catch (error) {
      console.error(`[TournamentStore] Error in fetchTournamentInstanceDetails for ${instanceId}:`, error);
      if (get().loadingInstanceId === instanceId) {
        set({ status: 'error', detailsStatus: 'error', error: error instanceof Error ? error.message : 'Fehler beim Laden der Turnier-Details.', currentTournamentInstance: null, loadingInstanceId: null });
      }
    }
  },

  loadTournamentGames: async (instanceId) => {
    if (get().gamesStatus === 'loading') {
      // ✅ Logs aufgeräumt: Redundant fetch-Log entfernt
      return;
    }
    
    set({ status: 'loading-games', gamesStatus: 'loading', error: null });
    try {
      const games = await fetchTournamentGames(instanceId);
      set({ currentTournamentGames: games, status: 'success', gamesStatus: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden der Turnier-Spiele.';
      console.error(`[TournamentStore] Error loading tournament games for ${instanceId}:`, error);
      set({ status: 'error', gamesStatus: 'error', error: message });
    }
  },

  loadTournamentParticipants: async (instanceId) => {
    if (get().participantsStatus === 'loading') {
      // ✅ Logs aufgeräumt: Redundant fetch-Log entfernt
      return;
    }
  
    set({ status: 'loading-participants', participantsStatus: 'loading', error: null });
    try {
      const participantsFromService = await fetchTournamentParticipants(instanceId);
      const participantsWithProgress = participantsFromService.map(p_service => {
        // KORREKTUR: Direkte Verwendung von ParticipantWithProgress aus dem Service
        // Der Service gibt bereits ParticipantWithProgress[] zurück, keine weitere Konvertierung nötig
        return p_service as ParticipantWithProgress;
      });
      
      set({ tournamentParticipants: participantsWithProgress, status: 'success', participantsStatus: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden der Teilnehmer.';
      console.error(`[TournamentStore] Error loading participants for ${instanceId}:`, error);
      set({ status: 'error', participantsStatus: 'error', error: message });
    }
  },

  startNewPasse: async (instanceId, players, startingPlayer) => {
    set({ status: 'loading-games', error: null });
    const currentTournament = get().currentTournamentInstance;

    if (!currentTournament || !currentTournament.settings) {
      const errorMsg = "Turnierdetails oder -einstellungen nicht geladen, um Passe zu starten.";
      set({ status: 'error', error: errorMsg });
      console.error("[TournamentStore] startNewPasse: ", errorMsg);
      return null;
    }

    const { 
      scoreSettings: tournamentScoreSettings, 
      strokeSettings: tournamentStrokeSettings, 
      farbeSettings: tournamentFarbeSettings 
    } = currentTournament.settings;

    const finalScoreSettings = tournamentScoreSettings ?? DEFAULT_SCORE_SETTINGS;
    const finalStrokeSettings = tournamentStrokeSettings ?? DEFAULT_STROKE_SETTINGS;
    const finalFarbeSettings = tournamentFarbeSettings ?? DEFAULT_FARBE_SETTINGS;
    
    console.log("[TournamentStore] Turniereinstellungen für Passe-Start (direkt aus currentTournament.settings):", {
      scoreSettingsValid: !!finalScoreSettings,
      strokeSettingsValid: !!finalStrokeSettings,
      farbeSettingsValid: !!finalFarbeSettings,
      cardStyle: finalFarbeSettings.cardStyle,
      siegPunkte: finalScoreSettings.values.sieg,
      schneiderStriche: finalStrokeSettings.schneider
    });

    if (players.some(p => typeof p.completedPassesCount !== 'number')) {
      const errorMsg = "Fehler: completedPassesCount fehlt für einen oder mehrere Spieler.";
      console.error("[TournamentStore] startNewPasse: ", errorMsg, players);
      set({ status: 'error', error: errorMsg });
      return null;
    }
    // EINFACHE LÖSUNG: Die Passe-Nummer für diese Gruppe ist das Minimum + 1
    // Das funktioniert für alle Szenarien (8, 12, 16, 20, 83 Spieler, etc.)
    // Spieler mit 0 Passen → Passe 1
    // Spieler mit 1 Passe → Passe 2
    // Wenn Spieler unterschiedliche Anzahl haben → Die kleinste + 1
    
    // KRITISCHER FIX: Sicherstellen, dass alle completedPassesCount Zahlen sind
    const validPassesCounts = players.map(p => {
      const count = p.completedPassesCount;
      return typeof count === 'number' && !isNaN(count) ? count : 0;
    });
    
    const passeTournamentNumber = 1 + Math.min(...validPassesCounts);
    
    // DEBUGGING: Log die Berechnung
    console.log("[TournamentStore] Passe Number Calculation:");
    console.log("- players:", players.map(p => ({ uid: p.uid, name: p.name, completedPassesCount: p.completedPassesCount })));
    console.log("- validPassesCounts:", validPassesCounts);
    console.log("- passeTournamentNumber:", passeTournamentNumber);
    
    // KRITISCHER DEBUG: Prüfe ob passeTournamentNumber NaN ist
    if (isNaN(passeTournamentNumber)) {
      console.error("[TournamentStore] CRITICAL: passeTournamentNumber is NaN!");
      console.error("- players:", players);
      console.error("- validPassesCounts:", validPassesCounts);
    }

    const numericStartingPlayer = Number(startingPlayer) as PlayerNumber;
    const playersWithNumericPositions = players.map(p => ({
      ...p,
      playerNumber: Number(p.playerNumber) as PlayerNumber
    }));

    // ✅ LOGGING: Welche Spielerdaten kommen in startNewPasse an?
    console.log("[TournamentStore] startNewPasse - Übergebene Spieler (Input):");
    players.forEach(p => console.log(`  - UID: ${p.uid}, PlayerID: ${p.playerId}, Name: ${p.name}, PlayerNum: ${p.playerNumber}, completedPasses: ${p.completedPassesCount}` ) );

    const playerNamesForGame: PlayerNames = playersWithNumericPositions.reduce((acc, p) => {
      acc[p.playerNumber] = p.name;
      return acc;
    }, {} as PlayerNames);
    
    // ✅ FIX: Verwende Player IDs statt UIDs für gamePlayersForGame
    const gamePlayersForGame: GamePlayers = playersWithNumericPositions.reduce((acc, p) => {
      // ✅ FIX: Verwende playerId statt uid für MemberInfo
      acc[p.playerNumber] = { 
        type: 'member', 
        uid: p.uid, 
        playerId: p.playerId, // ✅ Player ID hinzugefügt
        name: p.name, 
        photoURL: p.photoURL || null 
      } as MemberInfo & { playerId: string };
      return acc;
    }, {} as GamePlayers);

    // ✅ LOGGING: Welche Player IDs landen in gamePlayersForGame?
    console.log("[TournamentStore] startNewPasse - gamePlayersForGame erstellt:");
    Object.entries(gamePlayersForGame).forEach(([num, player]) => {
      const memberPlayer = player as MemberInfo & { playerId: string };
      console.log(`  - Player ${num}: UID: ${memberPlayer.uid}, PlayerID: ${memberPlayer.playerId}, Name: ${memberPlayer.name}`);
    });

    // TeamConfig aus den Spieler-Nummern ableiten
    const DEFAULT_TEAM_CONFIG = {
      top: [2, 4] as [PlayerNumber, PlayerNumber],
      bottom: [1, 3] as [PlayerNumber, PlayerNumber]
    };

    // Debugging-Informationen für die Entwicklung
    console.log("[TournamentStore] Turniereinstellungen bei Passe-Start:", {
      scoreSettings: finalScoreSettings ? "vorhanden" : "fehlend",
      strokeSettings: finalStrokeSettings ? "vorhanden" : "fehlend",
      farbeSettings: finalFarbeSettings ? "vorhanden" : "fehlend",
      cardStyle: finalFarbeSettings?.cardStyle
    });

    const activeGameDocData: Omit<ActiveGame, 'activeGameId'> & { roundHistory: RoundEntry[]; passeTournamentNumber: number; weisPoints: { top: number; bottom: number }; jassPoints: { top: number; bottom: number }; currentRoundWeis: any[]; isGameStarted: boolean; isRoundCompleted: boolean; isGameCompleted: boolean; scoreSettings: ScoreSettings; strokeSettings: StrokeSettings; farbeSettings: FarbeSettings } = {
      // Hinzufügen der fehlenden Pflichtfelder
      groupId: null, // Für Turnierpassen kann groupId null sein 
      sessionId: `tournament_${instanceId}_passe_${passeTournamentNumber}`, // Eindeutige Session-ID für die Passe
      currentGameNumber: passeTournamentNumber, // Passe-Nummer als Spielnummer
      teams: {
        top: DEFAULT_TEAM_CONFIG.top,
        bottom: DEFAULT_TEAM_CONFIG.bottom
      },
      lastUpdated: serverTimestamp() as Timestamp,
      // Bestehende Felder beibehalten
      tournamentInstanceId: instanceId,
      participantUids: players.map(p => p.uid), // ✅ Für Backend-Kompatibilität
      participantPlayerIds: players.map(p => p.playerId), // ✅ NEU: Player IDs für moderne Verarbeitung
      playerNames: playerNamesForGame,
      gamePlayers: gamePlayersForGame,
      startingPlayer: numericStartingPlayer,
      initialStartingPlayer: numericStartingPlayer,
      currentPlayer: numericStartingPlayer,
      currentRound: 1,
      scores: { top: 0, bottom: 0 },
      striche: { 
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      },
      roundHistory: [],
      status: 'live',
      createdAt: serverTimestamp() as Timestamp,
      passeTournamentNumber: passeTournamentNumber,
      weisPoints: { top: 0, bottom: 0 },
      jassPoints: { top: 0, bottom: 0 },
      currentRoundWeis: [],
      isGameStarted: true,
      isRoundCompleted: false,
      isGameCompleted: false,
      // Verwende die final ermittelten und geprüften Einstellungen des Turniers
      scoreSettings: finalScoreSettings,
      strokeSettings: finalStrokeSettings,
      farbeSettings: finalFarbeSettings,
    };
    
    const activeGamesColRef = collection(db, 'activeGames');
    const newPasseDocRef = await addDoc(activeGamesColRef, activeGameDocData);
    const newPasseId = newPasseDocRef.id;

    const tournamentDocRef = doc(db, 'tournaments', instanceId);
    try {
      await runTransaction(db, async (transaction) => {
        const tournamentSnap = await transaction.get(tournamentDocRef);
        if (!tournamentSnap.exists()) {
          throw "Tournament document does not exist!";
        }
        const tournamentData = tournamentSnap.data() as TournamentInstance;
        const currentParticipants = (tournamentData.participants || []) as ParticipantWithProgress[];
        
        const updatedParticipants = currentParticipants.map(participant => {
          if (players.some(p => p.uid === participant.uid)) {
            return {
              ...participant,
              currentPasseNumberForPlayer: passeTournamentNumber,
            };
          }
          return participant;
        });
        transaction.update(tournamentDocRef, { participants: updatedParticipants });
      });
    } catch (transactionError) {
      console.error("[TournamentStore] Transaction failed to update participant passe numbers: ", transactionError);
      await deleteDoc(newPasseDocRef);
      set({ status: 'error', error: "Fehler beim Aktualisieren der Teilnehmerdaten für die Passe." });
      throw transactionError;
    }
    
    // Erstelle das vollständige ActiveGame-Objekt für den Store, falls benötigt
    const completeActivePasseDataForStore: ActiveGame = {
      ...activeGameDocData, // Dies enthält bereits die korrekten Einstellungen
      activeGameId: newPasseId,
      createdAt: Timestamp.now(), // Verwende einen clientseitigen Timestamp für den Store-State
      lastUpdated: Timestamp.now(), // dito
      // gameStartTime und jassStartTime sind im activeGameDocData als serverTimestamp()
      // hier könnten wir sie auch als Timestamp.now() für den lokalen Store setzen, falls nötig
      // oder sie bleiben serverTimestamp() und werden erst nach dem Lesen aus Firestore konkret
    };

    // Rufe gameStore.resetGame auf, um den gameStore mit der neuen Passe und ihren spezifischen Einstellungen zu initialisieren
    useGameStore.getState().resetGame(
      numericStartingPlayer,      
      newPasseId,                 
      {                           // Die spezifischen Jass-Einstellungen für diese Turnierpasse
        farbeSettings: finalFarbeSettings,
        scoreSettings: finalScoreSettings,
        strokeSettings: finalStrokeSettings,
      }
    );
    console.log(`[TournamentStore] gameStore.resetGame für Passe ${newPasseId} mit Turniereinstellungen aufgerufen.`);

    // Setze die gerade gestartete Passe als activePasse im tournamentStore
    set({ activePasse: completeActivePasseDataForStore, status: 'success' });
    
    // Die onPasseStarted Callback wird in TournamentStartScreen aufgerufen, um die Navigation zu triggern
    return newPasseId;
  },

  updateActivePasse: (passeData) => {
    set(state => ({
      activePasse: state.activePasse ? { ...state.activePasse, ...passeData } : null
    }));
  },

  completePasse: async (activePasseId, passeData) => {
    set({ status: 'loading-games', error: null });
    try {
      await completeTournamentPasseService(activePasseId, passeData);
      if (passeData.tournamentInstanceId) {
        await get().loadTournamentGames(passeData.tournamentInstanceId);
      }
      set({ activePasse: null, status: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Abschliessen der Passe.';
      console.error('[TournamentStore] Error completing passe:', error);
      set({ status: 'error', error: message });
    }
  },

  updateTournamentSettings: async (instanceId, settingsToUpdate) => {
    const oldStatus = get().status;
    set({ status: 'updating-settings', error: null });

    try {
      // Bevor wir updaten, die aktuellen Einstellungen holen
      const currentTournament = get().currentTournamentInstance;
      
      if (!currentTournament || currentTournament.id !== instanceId) {
        // Sicherstellen, dass wir die aktuellsten Daten haben
        await get().fetchTournamentInstanceDetails(instanceId);
      }

      const refreshedTournament = get().currentTournamentInstance;
      if (!refreshedTournament || refreshedTournament.id !== instanceId) {
        console.error(`[TournamentStore] Konnte Turnierdetails nicht abrufen für Update: ${instanceId}`);
        set({ status: 'error', error: 'Turnierdetails konnten nicht abgerufen werden.' });
        return false;
      }

      // Aktuelle Einstellungen als Basis nehmen oder Default falls nicht vorhanden
      const currentSettings = refreshedTournament.settings || DEFAULT_TOURNAMENT_SETTINGS;

      // Normalisierte Settings für das Update erstellen
      const updatedSettings: TournamentSettings = {
        ...currentSettings,
        ...settingsToUpdate
      };

      // Normalisieren der verschachtelten Einstellungen, falls sie aktualisiert werden
      if (settingsToUpdate.scoreSettings) {
        updatedSettings.scoreSettings = {
          ...DEFAULT_SCORE_SETTINGS,
          ...(currentSettings.scoreSettings || {}),
          ...settingsToUpdate.scoreSettings
        };
      }

      if (settingsToUpdate.strokeSettings) {
        updatedSettings.strokeSettings = {
          ...DEFAULT_STROKE_SETTINGS,
          ...(currentSettings.strokeSettings || {}),
          ...settingsToUpdate.strokeSettings
        };
      }

      if (settingsToUpdate.farbeSettings) {
        updatedSettings.farbeSettings = {
          ...DEFAULT_FARBE_SETTINGS,
          ...(currentSettings.farbeSettings || {}),
          ...settingsToUpdate.farbeSettings
        };
        
        // Wenn farbeSettings.values aktualisiert wird, muss das vollständig sein
        if (settingsToUpdate.farbeSettings.values) {
          updatedSettings.farbeSettings.values = {
            ...DEFAULT_FARBE_SETTINGS.values,
            ...(currentSettings.farbeSettings?.values || {}),
            ...settingsToUpdate.farbeSettings.values
          };
        }
      }

      // Debug-Log
      console.log('[TournamentStore] Aktualisierte Turniereinstellungen:', {
        hat_settings: !!updatedSettings,
        hat_farbeSettings: !!updatedSettings.farbeSettings,
        cardStyle: updatedSettings.farbeSettings?.cardStyle
      });

      // Service-Aufruf mit den vollständigen normalisierten Einstellungen
      await updateTournamentSettingsService(instanceId, updatedSettings);
      await get().fetchTournamentInstanceDetails(instanceId);
      if (get().detailsStatus === 'error') {
        return false;
      }
      set({ status: 'success' });
      return true; 
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Turnier-Einstellungen.';
      console.error(`[TournamentStore] Error updating tournament settings for ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false; 
    }
  },

  updateTournamentDetails: async (instanceId, details) => {
    const oldStatus = get().status;
    set({ status: 'updating-settings', error: null });
    try {
      await updateTournamentBaseDetailsService(instanceId, details);
      await get().fetchTournamentInstanceDetails(instanceId);
      if (get().detailsStatus === 'error') {
        set({ status: oldStatus });
        return false; 
      }
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Turnierdetails (Name/Beschreibung).';
      console.error(`[TournamentStore] Error updating tournament base details for ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false; 
    }
  },

  removeParticipant: async (instanceId, participantUid) => {
    set({ status: 'managing-participant', error: null });
    try {
      await removeParticipantFromTournamentService(instanceId, participantUid);
      await get().fetchTournamentInstanceDetails(instanceId);
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Entfernen des Teilnehmers.';
      console.error(`[TournamentStore] Error removing participant ${participantUid} from ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  makeParticipantAdmin: async (instanceId, participantUid) => {
    set({ status: 'managing-participant', error: null });
    try {
      await addTournamentAdminService(instanceId, participantUid);
      await get().fetchTournamentInstanceDetails(instanceId);
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Ernennen zum Admin.';
      console.error(`[TournamentStore] Error making participant ${participantUid} admin in ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  removeParticipantAdmin: async (instanceId, participantUid) => {
    set({ status: 'managing-participant', error: null });
    try {
      await removeTournamentAdminService(instanceId, participantUid);
      await get().fetchTournamentInstanceDetails(instanceId);
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Entfernen des Admin-Status.';
      console.error(`[TournamentStore] Error removing admin status for ${participantUid} in ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  addParticipantManual: async (instanceId, participantUid) => {
    set({ status: 'managing-participant', error: null });
    try {
      await addParticipantToTournamentService(instanceId, participantUid);
      await get().fetchTournamentInstanceDetails(instanceId);
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Hinzufügen des Teilnehmers.';
      console.error(`[TournamentStore] Error adding participant ${participantUid} to ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  leaveTournament: async (instanceId, userId) => {
    set({ status: 'leaving-tournament', error: null });
    try {
      await leaveTournamentService(instanceId, userId);
      await get().loadUserTournamentInstances(userId);
      if (get().currentTournamentInstance?.id === instanceId) {
        set({ currentTournamentInstance: null });
      }
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Verlassen des Turniers.';
      console.error(`[TournamentStore] Error leaving tournament ${instanceId} for user ${userId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  clearError: () => {
    set({ error: null, status: get().currentTournamentInstance ? 'success' : 'idle' });
  },

  clearCurrentTournamentInstance: () => {
    // ✅ Logs aufgeräumt: Clearing-Log entfernt
    
    const unsubscribe = get().tournamentListenerUnsubscribe;
    if (unsubscribe) {
      // ✅ Logs aufgeräumt: Listener-Log entfernt
      unsubscribe();
    }
    
    set({
      currentTournamentInstance: null,
      currentTournamentGames: [],
      tournamentParticipants: [],
      activePasse: null,
      detailsStatus: 'idle',
      participantsStatus: 'idle',
      gamesStatus: 'idle',
      passeRoundsCache: {},
      passeRoundsStatus: {},
      error: null,
      status: 'idle',
      loadingInstanceId: null,
      currentViewingPasse: null,
      passeDetailsStatus: 'idle',
      tournamentListenerUnsubscribe: null,
      // ⚠️ WICHTIG: userTournamentsListenerUnsubscribe NICHT löschen - bleibt für automatische Updates aktiv!
    });
  },

  loadPasseRounds: async (instanceId, passeId) => {
    const currentStatus = get().passeRoundsStatus[passeId];
    if (currentStatus === 'loading' || currentStatus === 'success') {
      return;
    }
    console.log(`[TournamentStore] Fetching rounds for passe: ${passeId} in instance: ${instanceId}`);
    set(state => ({
      passeRoundsStatus: { ...state.passeRoundsStatus, [passeId]: 'loading' },
      status: 'loading-passe-rounds',
      error: null
    }));
    try {
      const rounds = await fetchPasseRoundsService(instanceId, passeId);
      set(state => ({
        passeRoundsCache: { ...state.passeRoundsCache, [passeId]: rounds },
        passeRoundsStatus: { ...state.passeRoundsStatus, [passeId]: 'success' },
        status: 'success'
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : `Fehler beim Laden der Runden für Passe ${passeId}.`;
      console.error(`[TournamentStore] Error loading rounds for passe ${passeId}:`, error);
      set(state => ({
        passeRoundsStatus: { ...state.passeRoundsStatus, [passeId]: 'error' },
        status: 'error',
        error: message
      }));
    }
  },

  addMultipleParticipants: async (instanceId, userIds) => {
    set({ status: 'managing-participant', error: null });
    try {
      let allSuccessful = true;
      for (const userId of userIds) {
        try {
          await addParticipantToTournamentService(instanceId, userId);
        } catch (e) {
          allSuccessful = false;
          console.error(`[TournamentStore] Error adding participant ${userId} in batch:`, e);
        }
      }

      if (allSuccessful) {
        await get().loadTournamentParticipants(instanceId);
        set({ status: 'success' });
        return true;
      } else {
        await get().loadTournamentParticipants(instanceId);
        set({ status: 'error', error: 'Nicht alle Teilnehmer konnten hinzugefügt werden.' });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Hinzufügen der Teilnehmer.';
      set({ status: 'error', error: message });
      return false;
    }
  },

  // 🆕 NEU: Listener für automatische Turnier-Status-Updates
  setupUserTournamentsListener: async (identifier: string, providedPlayerId?: string | null) => {
    if (!identifier) return;
    
    // Cleanup bestehenden Listener
    const existingListener = get().userTournamentsListenerUnsubscribe;
    if (existingListener) {
      existingListener();
    }
    
    // ✅ ELEGANT: Verwende providedPlayerId wenn verfügbar, sonst versuche Konvertierung
    let playerId = providedPlayerId || identifier;
    let userId = identifier; // Für Fallback auf participantUids
    
    // Nur konvertieren wenn playerId nicht bereits vorhanden
    if (!providedPlayerId) {
      try {
        const { getDoc, doc, collection: firestoreCollection, query: firestoreQuery, where: firestoreWhere, getDocs, limit: firestoreLimit } = await import('firebase/firestore');
        const { db } = await import('@/services/firebaseInit');
        
        // Prüfe ob identifier bereits eine playerId ist
        const playerDocRef = doc(db, 'players', identifier);
        const playerDoc = await getDoc(playerDocRef);
        
        if (!playerDoc.exists()) {
          // Könnte eine UID sein, versuche playerId zu finden
          const playersRef = firestoreCollection(db, 'players');
          const q = firestoreQuery(playersRef, firestoreWhere('userId', '==', identifier), firestoreLimit(1));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            playerId = snapshot.docs[0].id;
            userId = identifier; // Behalte UID für participantUids Query
          }
        } else {
          // identifier ist bereits eine playerId
          playerId = identifier;
          // Versuche userId aus Player-Dokument zu holen
          const playerData = playerDoc.data();
          if (playerData?.userId) {
            userId = playerData.userId;
          }
        }
      } catch (error) {
        console.warn('[TournamentStore] Error getting playerId for listener:', error);
      }
    } else {
      // playerId wurde bereits übergeben, versuche userId zu finden
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/services/firebaseInit');
        const playerDocRef = doc(db, 'players', playerId);
        const playerDoc = await getDoc(playerDocRef);
        if (playerDoc.exists()) {
          const playerData = playerDoc.data();
          if (playerData?.userId) {
            userId = playerData.userId;
          }
        }
      } catch (error) {
        // Ignoriere Fehler, userId bleibt identifier
      }
    }
    
    // ✅ ELEGANTE VERIFIZIERUNG: Importiere zentrale Funktion vor dem Listener
    const { isUserTournamentParticipant } = await import('@/services/tournamentService');
    
    // ✅ ELEGANT: Query mit participantPlayerIds (moderne Turniere) UND participantUids (alte Turniere)
    // Firestore unterstützt keine OR-Queries, daher kombinieren wir beide Queries
    const tournamentsQueryByPlayerId = query(
      collection(db, 'tournaments'),
      where('participantPlayerIds', 'array-contains', playerId)
    );
    
    // ✅ ELEGANT: Query mit participantUids nur wenn userId !== playerId (für alte Turniere)
    const tournamentsQueryByUid = userId !== playerId ? query(
      collection(db, 'tournaments'),
      where('participantUids', 'array-contains', userId)
    ) : null;
    
    // ✅ Kombiniere Ergebnisse beider Queries
    const allTournamentsMap = new Map<string, TournamentInstanceType>();
    
    const processTournaments = () => {
      const allTournaments = Array.from(allTournamentsMap.values());
      
      // ✅ Nutze zentrale Verifizierungs-Funktion
      const verifiedTournaments = allTournaments.filter(t => {
        const isRealParticipant = isUserTournamentParticipant(t, userId, playerId);
        
        if (!isRealParticipant) {
          console.warn(`[TournamentStore] ⚠️ User ${userId} found in query but NOT in actual participants for tournament ${t.id}. Skipping.`);
        }
        
        return isRealParticipant;
      });
      
      const activeTournaments = verifiedTournaments.filter(t => t.status === 'active');
      
      if (activeTournaments.length > 0) {
        // Neuestes aktives Turnier nehmen
        const latestActive = activeTournaments.sort((a, b) => {
          const aTime = a.createdAt ? (typeof a.createdAt === 'object' && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : 0) : 0;
          const bTime = b.createdAt ? (typeof b.createdAt === 'object' && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : 0) : 0;
          return bTime - aTime;
        })[0];
        
        const currentActiveId = get().userActiveTournamentId;
        
        // ✅ AUTOMATISCH: Setze userActiveTournamentId wenn Turnier aktiv wird
        if (currentActiveId !== latestActive.id) {
          console.log(`[TournamentStore] 🎯 Active tournament detected: ${latestActive.id} (${latestActive.name})`);
          set({
            userActiveTournamentId: latestActive.id,
            userActiveTournamentStatus: 'success',
            userActiveTournamentError: null
          });
          
          // ✅ ELEGANT: Automatisch checkUserActiveTournament aufrufen für vollständige Aktualisierung
          get().checkUserActiveTournament(userId).catch(err => {
            console.error(`[TournamentStore] Error in checkUserActiveTournament after listener update:`, err);
          });
        }
      } else {
        // Kein aktives Turnier mehr
        if (get().userActiveTournamentId) {
          console.log(`[TournamentStore] No active tournament found, clearing userActiveTournamentId`);
          set({
            userActiveTournamentId: null,
            userActiveTournamentStatus: 'success',
            userActiveTournamentError: null
          });
        }
      }
    };
    
    // Listener für participantPlayerIds (moderne Turniere)
    const unsubscribeByPlayerId = onSnapshot(
      tournamentsQueryByPlayerId,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          allTournamentsMap.set(doc.id, { id: doc.id, ...doc.data() } as TournamentInstanceType);
        });
        processTournaments();
      },
      (error) => {
        console.error(`[TournamentStore] Error in user tournaments listener (by playerId):`, error);
        set({
          userActiveTournamentStatus: 'error',
          userActiveTournamentError: 'Fehler beim Empfangen von Turnier-Updates.'
        });
      }
    );
    
    // Listener für participantUids (alte Turniere) - nur wenn userId !== playerId
    const unsubscribeByUid = tournamentsQueryByUid ? onSnapshot(
      tournamentsQueryByUid,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          allTournamentsMap.set(doc.id, { id: doc.id, ...doc.data() } as TournamentInstanceType);
        });
        processTournaments();
      },
      (error) => {
        console.error(`[TournamentStore] Error in user tournaments listener (by uid):`, error);
      }
    ) : null;
    
    // Kombinierter Unsubscribe
    const unsubscribe = () => {
      unsubscribeByPlayerId();
      if (unsubscribeByUid) unsubscribeByUid();
    };
    
    set({ userTournamentsListenerUnsubscribe: unsubscribe });
  },

  checkUserActiveTournament: async (userId) => {
    if (get().userActiveTournamentStatus === 'loading') {
      return false;
    }
    set({
      userActiveTournamentStatus: 'loading',
      userActiveTournamentError: null,
    });

    try {
      const { fetchActiveTournamentForUser } = await import('../services/tournamentService');
      const activeTournament = await fetchActiveTournamentForUser(userId);

      if (activeTournament) {
        set({
          userActiveTournamentId: activeTournament.id,
          userActiveTournamentStatus: 'success',
        });
        return true;
      } else {
        set({
          userActiveTournamentId: null,
          userActiveTournamentStatus: 'success',
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Prüfen des aktiven Turniers.';
      console.error('[TournamentStore] Error in checkUserActiveTournament:', error);
      set({
        userActiveTournamentId: null,
        userActiveTournamentStatus: 'error',
        userActiveTournamentError: message,
      });
      return false;
    }
  },

  fetchTournamentGameById: async (instanceId, passeId) => {
    console.log(`[TournamentStore] Fetching details for passe ${passeId} in tournament ${instanceId}`);
    set({ passeDetailsStatus: 'loading', error: null });
    try {
      const gameDocRef = doc(db, 'tournaments', instanceId, 'games', passeId);
      const docSnap = await getDoc(gameDocRef);

      if (docSnap.exists()) {
        const passeData = { ...docSnap.data(), passeId: docSnap.id } as TournamentGame;
        console.log(`[TournamentStore] Passe ${passeId} found.`);
        set({ currentViewingPasse: passeData, passeDetailsStatus: 'success' });
      } else {
        console.warn(`[TournamentStore] Passe ${passeId} not found in tournament ${instanceId}.`);
        set({ currentViewingPasse: null, passeDetailsStatus: 'error', error: 'Passe nicht gefunden.' });
      }
    } catch (err: any) {
      console.error(`[TournamentStore] Error fetching passe ${passeId}:`, err);
      set({ 
        currentViewingPasse: null, 
        passeDetailsStatus: 'error', 
        error: err.message || 'Fehler beim Laden der Passen-Details.' 
      });
    }
  },

  completeTournament: async (instanceId) => {
    set({ status: 'updating-settings', error: null });
    try {
      await markTournamentAsCompletedService(instanceId);

      const currentInstance = get().currentTournamentInstance;
      if (currentInstance && currentInstance.id === instanceId) {
        set({
          currentTournamentInstance: {
            ...currentInstance,
            status: 'completed',
            completedAt: Timestamp.now(), 
          },
          status: 'success',
        });
      } else {
        await get().fetchTournamentInstanceDetails(instanceId);
        set({ status: 'success' });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Abschliessen des Turniers.';
      console.error('[TournamentStore] Error completing tournament:', error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  setupTournamentListener: (instanceId) => {
    const currentUnsubscribe = get().tournamentListenerUnsubscribe;
    if (currentUnsubscribe && get().currentTournamentInstance?.id === instanceId) {
      // ✅ Logs aufgeräumt: Listener-Setup-Log entfernt
      return;
    }

    if (currentUnsubscribe) {
      currentUnsubscribe();
    }

    // ✅ Logs aufgeräumt: Listener-Setup-Log entfernt
    const tournamentDocRef = doc(db, 'tournaments', instanceId);
    
    const unsubscribe = onSnapshot(
      tournamentDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const firestoreData = docSnap.data();
          
          // Stelle sicher, dass Einstellungen immer vollständig sind
          const normalizedSettings: TournamentSettings = {
            ...DEFAULT_TOURNAMENT_SETTINGS,
            ...(firestoreData.settings || {}),
            scoreSettings: {
              ...DEFAULT_SCORE_SETTINGS, 
              ...(firestoreData.settings?.scoreSettings || {})
            },
            strokeSettings: {
              ...DEFAULT_STROKE_SETTINGS,
              ...(firestoreData.settings?.strokeSettings || {})
            },
            farbeSettings: {
              ...DEFAULT_FARBE_SETTINGS,
              ...(firestoreData.settings?.farbeSettings || {})
            }
          };
          
          // Vollständige Daten mit normalisierten Einstellungen
          const newData = { 
            id: docSnap.id, 
            ...firestoreData,
            settings: normalizedSettings
          } as TournamentInstance;
          
          const currentTournament = get().currentTournamentInstance;
          if (currentTournament?.id === instanceId) {
            const hasRelevantChanges = 
              currentTournament.completedPasseCount !== newData.completedPasseCount ||
              currentTournament.status !== newData.status ||
              JSON.stringify(currentTournament.participantUids) !== JSON.stringify(newData.participantUids) ||
              // ✅ HINZUGEFÜGT: Logo und Beschreibung für Real-time Updates
              currentTournament.logoUrl !== newData.logoUrl ||
              currentTournament.description !== newData.description ||
              currentTournament.name !== newData.name ||
              // Tiefergehender Vergleich der Einstellungen (inkl. logoUrl in settings)
              JSON.stringify(currentTournament.settings?.rankingMode) !== JSON.stringify(newData.settings?.rankingMode) ||
              JSON.stringify(currentTournament.settings?.scoreSettings) !== JSON.stringify(newData.settings?.scoreSettings) ||
              JSON.stringify(currentTournament.settings?.strokeSettings) !== JSON.stringify(newData.settings?.strokeSettings) ||
              JSON.stringify(currentTournament.settings?.farbeSettings) !== JSON.stringify(newData.settings?.farbeSettings) ||
              currentTournament.settings?.logoUrl !== newData.settings?.logoUrl;

            if (hasRelevantChanges) {
              // ✅ Logs aufgeräumt: Changes-Log entfernt
              set({
                currentTournamentInstance: newData,
                detailsStatus: 'success',
              });
              
              if (currentTournament.completedPasseCount !== newData.completedPasseCount) {
                // ✅ Logs aufgeräumt: PasseCount-Log entfernt
                get().loadTournamentGames(instanceId);
              }
            } else {
              // ✅ Logs aufgeräumt: No-Changes-Log entfernt
            }
          } else {
            set({
              currentTournamentInstance: newData,
              detailsStatus: 'success',
            });
          }
        } else {
          console.warn(`[TournamentStore] Tournament ${instanceId} was deleted or is no longer accessible.`);
          set({
            currentTournamentInstance: null,
            detailsStatus: 'error',
            error: 'Turnier wurde gelöscht oder ist nicht mehr zugänglich.'
          });
        }
      },
      (error) => {
        console.error(`[TournamentStore] Error in tournament real-time listener for ${instanceId}:`, error);
        set({
          detailsStatus: 'error',
          error: 'Fehler beim Empfangen von Turnier-Updates.'
        });
      }
    );
    
    set({ tournamentListenerUnsubscribe: unsubscribe });
  },
  
  clearTournamentListener: () => {
    const unsubscribe = get().tournamentListenerUnsubscribe;
    if (unsubscribe) {
      console.log('[TournamentStore] Clearing tournament real-time listener');
      unsubscribe();
      set({ tournamentListenerUnsubscribe: null });
    }
  },

  resetTournamentState: () => {
    // Cleanup beide Listener
    const unsubscribe = get().tournamentListenerUnsubscribe;
    const userTournamentsUnsubscribe = get().userTournamentsListenerUnsubscribe;
    
    if (unsubscribe) {
      console.log("[TournamentStore] Removing tournament listener during reset.");
      unsubscribe();
    }
    if (userTournamentsUnsubscribe) {
      console.log("[TournamentStore] Removing user tournaments listener during reset.");
      userTournamentsUnsubscribe();
    }
    
    set(initialState);
  },

  activateTournament: async (instanceId: string) => {
    set({ status: 'updating-settings', error: null });
    try {
      await activateTournamentService(instanceId);

      await get().fetchTournamentInstanceDetails(instanceId);
      
      if (get().detailsStatus === 'error') {
        return false;
      }
      
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Aktivieren des Turniers.';
      console.error(`[TournamentStore] Error activating tournament ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  pauseTournament: async (instanceId: string) => {
    set({ status: 'updating-settings', error: null });
    try {
      await pauseTournamentService(instanceId);

      await get().fetchTournamentInstanceDetails(instanceId);
      
      if (get().detailsStatus === 'error') {
        return false;
      }
      
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Unterbrechen des Turniers.';
      console.error(`[TournamentStore] Error pausing tournament ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  resumeTournament: async (instanceId: string) => {
    set({ status: 'updating-settings', error: null });
    try {
      await resumeTournamentService(instanceId);

      await get().fetchTournamentInstanceDetails(instanceId);
      
      if (get().detailsStatus === 'error') {
        return false;
      }
      
      set({ status: 'success' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Fortsetzen des Turniers.';
      console.error(`[TournamentStore] Error resuming tournament ${instanceId}:`, error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  recordPasseCompletion: async (tournamentId, completedPasseId, participatingPlayerUids, finalScores, finalStriche) => {
    set({ status: 'loading-games', error: null });
    console.log(`[TournamentStore] Recording completion for passe ${completedPasseId} in tournament ${tournamentId}`);

    try {
      const tournamentDocRef = doc(db, 'tournaments', tournamentId);
      const passeDocRef = doc(db, 'activeGames', completedPasseId);

      await runTransaction(db, async (transaction) => {
        const tournamentSnap = await transaction.get(tournamentDocRef);
        if (!tournamentSnap.exists()) {
          throw new Error(`Tournament ${tournamentId} not found.`);
        }
        const tournamentData = tournamentSnap.data() as TournamentInstance;
        const currentParticipants = (tournamentData.participants || []) as ParticipantWithProgress[];

        const updatedParticipants = currentParticipants.map(participant => {
          if (participatingPlayerUids.includes(participant.uid)) {
            const newCompletedPassesCount = (participant.completedPassesCount || 0) + 1;
            return {
              ...participant,
              completedPassesCount: newCompletedPassesCount,
              currentPasseNumberForPlayer: newCompletedPassesCount + 1,
            };
          }
          return participant;
        });

        transaction.update(tournamentDocRef, { participants: updatedParticipants });

        transaction.update(passeDocRef, {
          status: 'completed',
          completedAt: serverTimestamp(),
          scores: finalScores,
          striche: finalStriche,
        });
      });

      const updatedInstance = get().currentTournamentInstance;
      if (updatedInstance && updatedInstance.id === tournamentId) {
        const finalParticipants = (updatedInstance.participants || []).map(participant => {
          if (participatingPlayerUids.includes(participant.uid)) {
            const newCompletedPassesCount = (participant.completedPassesCount || 0) + 1;
            return {
              ...participant,
              completedPassesCount: newCompletedPassesCount,
              currentPasseNumberForPlayer: newCompletedPassesCount + 1,
            };
          }
          return participant;
        });
        set({
          currentTournamentInstance: { ...updatedInstance, participants: finalParticipants },
          status: 'success'
        });
      }
      if (get().activePasse?.activeGameId === completedPasseId) {
        set({ activePasse: null });
      }
      await get().loadTournamentGames(tournamentId);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Abschliessen der Passe im Turnier.';
      console.error(`[TournamentStore] Error in recordPasseCompletion for passe ${completedPasseId}:`, error);
      set({ status: 'error', error: message });
      throw error;
    }
  },
}));

export const selectCurrentTournamentInstance = (state: TournamentState) => state.currentTournamentInstance;
export const selectTournamentParticipants = (state: TournamentState) => state.tournamentParticipants;
export const selectCompletedTournamentGames = (state: TournamentState) => state.currentTournamentGames;
export const selectActiveTournamentPasse = (state: TournamentState) => state.activePasse;
export const selectTournamentStatus = (state: TournamentState) => state.status;
export const selectDetailsStatus = (state: TournamentState) => state.detailsStatus;
export const selectParticipantsStatus = (state: TournamentState) => state.participantsStatus;
export const selectGamesStatus = (state: TournamentState) => state.gamesStatus;
export const selectLoadingInstanceId = (state: TournamentState) => state.loadingInstanceId;
export const selectTournamentError = (state: TournamentState) => state.error;

export const selectPasseRoundsFromCache = (passeId: string) => (state: TournamentState) => state.passeRoundsCache[passeId];
export const selectPasseRoundsStatus = (passeId: string) => (state: TournamentState) => state.passeRoundsStatus[passeId] || 'idle';

export const selectIsTournamentLoading = (state: TournamentState) => 
    state.status === 'loading-details' || 
    state.status === 'loading-games' || 
    state.status === 'loading-list' || 
    state.status === 'loading-participants' ||
    state.status === 'updating-settings'; 