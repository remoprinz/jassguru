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
  rankingMode: 'striche', // ✅ DEFAULT: Rangliste nach Strichen
  scoreSettings: DEFAULT_SCORE_SETTINGS, // Sieg: 2000, Berg: 1000, Schneider: 1000
  strokeSettings: DEFAULT_STROKE_SETTINGS, // Schneider: 2, Kontermatsch: 2
  farbeSettings: DEFAULT_FARBE_SETTINGS, // Eichel: 1x, Rosen: 1x, Schellen: 2x, Schilten: 2x, Obe: 3x, Une: 3x, Rest: 0x
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
  participantsListenerUnsubscribe: (() => void) | null; // 🆕 NEU: Real-time Listener für Participants
  gamesListenerUnsubscribe: (() => void) | null; // 🆕 NEU: Real-time Listener für Tournament Games
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
  
  // 🆕 NEU: Real-time Listener für Tournament Participants
  setupParticipantsListener: (instanceId: string) => void;
  clearParticipantsListener: () => void;
  
  // 🆕 NEU: Real-time Listener für Tournament Games
  setupGamesListener: (instanceId: string) => void;
  clearGamesListener: () => void;

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
  participantsListenerUnsubscribe: null, // 🆕 NEU: Real-time Listener für Participants
  gamesListenerUnsubscribe: null, // 🆕 NEU: Real-time Listener für Tournament Games
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
    
    if (players.some(p => typeof p.completedPassesCount !== 'number')) {
      const errorMsg = "Fehler: completedPassesCount fehlt für einen oder mehrere Spieler.";
      console.error("[TournamentStore] startNewPasse: ", errorMsg, players);
      set({ status: 'error', error: errorMsg });
      return null;
    }
    
    // ✅ RICHTIGE LOGIK: Finde die nächste spielbare Passe basierend auf 4er-Reihen
    
    const validPassesCounts = players.map(p => {
      const count = p.completedPassesCount;
      return typeof count === 'number' && !isNaN(count) ? count : 0;
    });
    
    const minCompletedCount = Math.min(...validPassesCounts);
    let passeTournamentNumber = minCompletedCount + 1;
    
    // ✅ KRITISCH: Prüfe, ob diese Passe noch spielbar ist
    const gamesColRef = collection(db, 'tournaments', instanceId, 'games');
    const existingGamesSnap = await getDocs(gamesColRef);
    
    const activeGamesRef = collection(db, 'activeGames');
    const activeGamesQuery = query(
      activeGamesRef,
      where('tournamentInstanceId', '==', instanceId),
      where('status', '==', 'live')
    );
    const activeGamesSnap = await getDocs(activeGamesQuery);
    
    // Schleife: Finde die erste spielbare Passe
    let foundPlayablePasse = false;
    const MAX_ITERATIONS = 100; // Sicherheit gegen Endlosschleife
    let iterations = 0;
    
    // Hole die Gesamtzahl der Turnierteilnehmer
    const totalParticipants = get().currentTournamentInstance?.participantUids?.length || players.length;
    
    while (!foundPlayablePasse && iterations < MAX_ITERATIONS) {
      iterations++;
      
      // Zähle, wie viele EINZIGARTIGE Spieler diese Passe bereits spielen/gespielt haben
      const uidsInThisPasse = new Set<string>();
      
      // Abgeschlossene Games
      existingGamesSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.passeNumber === passeTournamentNumber || data.tournamentRound === passeTournamentNumber) {
          const participants = data.participantUidsForPasse || data.participantUids || [];
          participants.forEach((uid: string) => uidsInThisPasse.add(uid));
        }
      });
      
      // Aktive Games
      activeGamesSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.currentGameNumber === passeTournamentNumber || data.passeTournamentNumber === passeTournamentNumber) {
          const participants = data.participantUids || [];
          participants.forEach((uid: string) => uidsInThisPasse.add(uid));
        }
      });
      
      const playersInThisPasse = uidsInThisPasse.size;
      
      // ✅ 4er-REIHEN-LOGIK: Berechne maximale Kapazität für diese Passe
      const maxTische = Math.floor(totalParticipants / 4);
      const maxPlayersForThisPasse = maxTische * 4;
      
      // Prüfe: Ist noch Platz für einen weiteren 4er-Tisch?
      if (playersInThisPasse < maxPlayersForThisPasse) {
        foundPlayablePasse = true;
      } else {
        // Diese Passe ist voll → Springe zur nächsten
        passeTournamentNumber++;
      }
    }
    
    if (iterations >= MAX_ITERATIONS) {
      console.error("[TournamentStore] CRITICAL: Could not find playable passe after 100 iterations!");
      passeTournamentNumber = minCompletedCount + 1; // Fallback
    }
    
    // KRITISCHER DEBUG: Prüfe ob passeTournamentNumber NaN ist
    if (isNaN(passeTournamentNumber)) {
      console.error("[TournamentStore] CRITICAL: passeTournamentNumber is NaN!");
      console.error("- players:", players);
      console.error("- validPassesCounts:", validPassesCounts);
      console.error("- passeTournamentNumber:", passeTournamentNumber);
    }
    
    // 🎯 KRITISCHE SERVER-VALIDIERUNG: Prüfe ob alle Spieler wirklich verfügbar sind
    // Dies verhindert Race Conditions und Client-seitige Manipulation
    const invalidPlayers: string[] = [];
    
    // Sammle alle UIDs in aktiven Passen dieser Passe-Nummer
    const uidsInActivePassesThisNumber = new Set<string>();
    activeGamesSnap.docs.forEach(doc => {
      const data = doc.data();
      const activePasseNumber = data.currentGameNumber || data.passeTournamentNumber;
      if (activePasseNumber === passeTournamentNumber) {
        const participantUids = data.participantUids || [];
        participantUids.forEach((uid: string) => uidsInActivePassesThisNumber.add(uid));
      }
    });
    
    // Prüfe jeden Spieler
    for (const player of players) {
      const completedCount = player.completedPassesCount || 0;
      
      // Validierung 1: Hat dieser Spieler die Passe bereits gespielt?
      if (completedCount >= passeTournamentNumber) {
        invalidPlayers.push(`${player.name} (${player.uid}): Hat Passe ${passeTournamentNumber} bereits gespielt (${completedCount} abgeschlossen)`);
      }
      
      // Validierung 2: Ist dieser Spieler in einer aktiven Passe dieser Nummer?
      if (uidsInActivePassesThisNumber.has(player.uid)) {
        invalidPlayers.push(`${player.name} (${player.uid}): Spielt bereits eine aktive Passe für Passe-Nummer ${passeTournamentNumber}`);
      }
    }
    
    // Falls Validierung fehlschlägt: Lehne ab mit detaillierter Fehlermeldung
    if (invalidPlayers.length > 0) {
      const errorMsg = `Server-Validierung fehlgeschlagen: Nicht alle Spieler sind für Passe ${passeTournamentNumber} verfügbar:\n${invalidPlayers.join('\n')}`;
      console.error("[TournamentStore] startNewPasse validation failed:", errorMsg);
      set({ status: 'error', error: errorMsg });
      return null;
    }
    
    console.log(`[TournamentStore] ✅ Server-Validierung erfolgreich: Alle ${players.length} Spieler verfügbar für Passe ${passeTournamentNumber}`);
    
    // ✅ KRITISCH: Berechne passeInRound BEIM START, damit andere Spieler sofort "Passe 2B" sehen!
    const { getNextPasseLetterInRound } = await import('@/services/tournamentService');
    const passeInRound = await getNextPasseLetterInRound(instanceId, passeTournamentNumber);

    const numericStartingPlayer = Number(startingPlayer) as PlayerNumber;
    const playersWithNumericPositions = players.map(p => ({
      ...p,
      playerNumber: Number(p.playerNumber) as PlayerNumber
    }));

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

    // TeamConfig aus den Spieler-Nummern ableiten
    const DEFAULT_TEAM_CONFIG = {
      top: [2, 4] as [PlayerNumber, PlayerNumber],
      bottom: [1, 3] as [PlayerNumber, PlayerNumber]
    };

    const activeGameDocData: Omit<ActiveGame, 'activeGameId'> & { roundHistory: RoundEntry[]; passeTournamentNumber: number; passeInRound: string; weisPoints: { top: number; bottom: number }; jassPoints: { top: number; bottom: number }; currentRoundWeis: any[]; isGameStarted: boolean; isRoundCompleted: boolean; isGameCompleted: boolean; scoreSettings: ScoreSettings; strokeSettings: StrokeSettings; farbeSettings: FarbeSettings } = {
      // Hinzufügen der fehlenden Pflichtfelder
      groupId: null, // Für Turnierpassen kann groupId null sein 
      sessionId: `tournament_${instanceId}_passe_${passeTournamentNumber}`, // Eindeutige Session-ID für die Passe
      currentGameNumber: passeTournamentNumber, // Passe-Nummer als Spielnummer
      passeInRound: passeInRound, // ✅ KRITISCH: Buchstabe (A, B, C...) - wird BEIM START gesetzt!
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
    const participantsUnsubscribe = get().participantsListenerUnsubscribe;
    const gamesUnsubscribe = get().gamesListenerUnsubscribe;
    
    if (unsubscribe) {
      // ✅ Logs aufgeräumt: Listener-Log entfernt
      unsubscribe();
    }
    if (participantsUnsubscribe) {
      participantsUnsubscribe();
    }
    if (gamesUnsubscribe) {
      gamesUnsubscribe();
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
      participantsListenerUnsubscribe: null,
      gamesListenerUnsubscribe: null,
      // ⚠️ WICHTIG: userTournamentsListenerUnsubscribe NICHT löschen - bleibt für automatische Updates aktiv!
    });
  },

  loadPasseRounds: async (instanceId, passeId) => {
    const currentStatus = get().passeRoundsStatus[passeId];
    if (currentStatus === 'loading' || currentStatus === 'success') {
      return;
    }
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
      
      // ✅ NEU: Aktualisiere userTournamentInstances für BottomNavigation
      set({ userTournamentInstances: verifiedTournaments });
      
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
    set({ passeDetailsStatus: 'loading', error: null });
    try {
      const gameDocRef = doc(db, 'tournaments', instanceId, 'games', passeId);
      const docSnap = await getDoc(gameDocRef);

      if (docSnap.exists()) {
        const passeData = { ...docSnap.data(), passeId: docSnap.id } as TournamentGame;
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
              JSON.stringify(currentTournament.participants) !== JSON.stringify(newData.participants) ||
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
              
              // 🎯 NEU: Update auch tournamentParticipants wenn vorhanden
              if (newData.participants && Array.isArray(newData.participants)) {
                const participantsWithProgress = newData.participants.map((p: any) => ({
                  ...p,
                  completedPassesCount: p.completedPassesCount || 0,
                  currentPasseNumberForPlayer: (p.completedPassesCount || 0) + 1
                })) as ParticipantWithProgress[];
                
                set({ tournamentParticipants: participantsWithProgress });
              }
              
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
            
            // 🎯 NEU: Initial auch participants setzen
            if (newData.participants && Array.isArray(newData.participants)) {
              const participantsWithProgress = newData.participants.map((p: any) => ({
                ...p,
                completedPassesCount: p.completedPassesCount || 0,
                currentPasseNumberForPlayer: (p.completedPassesCount || 0) + 1
              })) as ParticipantWithProgress[];
              
              set({ tournamentParticipants: participantsWithProgress });
            }
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
      unsubscribe();
      set({ tournamentListenerUnsubscribe: null });
    }
  },

  // 🆕 NEU: Real-time Listener für Tournament Participants (completedPassesCount)
  setupParticipantsListener: (instanceId) => {
    const currentUnsubscribe = get().participantsListenerUnsubscribe;
    if (currentUnsubscribe && get().currentTournamentInstance?.id === instanceId) {
      // Listener bereits aktiv für diese Instanz
      return;
    }

    if (currentUnsubscribe) {
      currentUnsubscribe();
    }

    console.log(`[TournamentStore] 🎧 Setting up participants listener for tournament ${instanceId}`);
    // ✅ FIX: Lausche auf Tournament-Dokument, nicht auf Subcollection!
    // Participants sind im Tournament-Dokument als Array gespeichert
    const tournamentDocRef = doc(db, 'tournaments', instanceId);
    
    let isFirstSnapshot = true; // Flag für initialen Snapshot
    
    const unsubscribe = onSnapshot(
      tournamentDocRef,
      async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            console.log(`[TournamentStore] ⚠️ Tournament ${instanceId} does not exist`);
            return;
          }

          const tournamentData = snapshot.data();
          const participantUids = tournamentData?.participantUids || [];
          
          console.log(`[TournamentStore] 🎧 Tournament updated: ${participantUids.length} participantUids`);
          
          // Beim ersten Snapshot IMMER laden, danach nur bei Änderungen
          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            console.log(`[TournamentStore] 🔄 Initial load of participants...`);
            await get().loadTournamentParticipants(instanceId);
          } else {
            // Bei späteren Snapshots: Nur neu laden wenn sich die UID-Liste geändert hat
            const currentTournament = get().currentTournamentInstance;
            const currentUids = currentTournament?.participantUids || [];
            
            if (JSON.stringify(currentUids.sort()) !== JSON.stringify([...participantUids].sort())) {
              console.log(`[TournamentStore] 🔄 Participant list changed, reloading...`);
              await get().loadTournamentParticipants(instanceId);
            }
          }
        } catch (error) {
          console.error('[TournamentStore] Error processing tournament snapshot:', error);
          set({ participantsStatus: 'error', error: 'Fehler beim Laden der Teilnehmer' });
        }
      },
      (error) => {
        console.error('[TournamentStore] Error in tournament listener:', error);
        set({ participantsStatus: 'error', error: 'Fehler beim Überwachen des Turniers' });
      }
    );
    
    set({ participantsListenerUnsubscribe: unsubscribe });
  },
  
  clearParticipantsListener: () => {
    const unsubscribe = get().participantsListenerUnsubscribe;
    if (unsubscribe) {
      console.log('[TournamentStore] 🔇 Clearing participants listener');
      unsubscribe();
      set({ participantsListenerUnsubscribe: null });
    }
  },
  
  // 🆕 NEU: Real-time Listener für Tournament Games (abgeschlossen + aktiv)
  setupGamesListener: (instanceId) => {
    const currentUnsubscribe = get().gamesListenerUnsubscribe;
    if (currentUnsubscribe && get().currentTournamentInstance?.id === instanceId) {
      // Listener bereits aktiv für diese Instanz
      return;
    }

    if (currentUnsubscribe) {
      currentUnsubscribe();
    }

    console.log(`[TournamentStore] 🎧 Setting up games listener for tournament ${instanceId}`);
    
    // ✅ State für BEIDE Listener
    let completedGames: TournamentGame[] = [];
    let activeGames: TournamentGame[] = [];
    
    // Helper: Kombiniere und sortiere alle Spiele
    const updateCombinedGames = () => {
      const allGames = [...completedGames, ...activeGames];
      
      // Sortiere nach completedAt (neueste zuerst), aktive Spiele zuerst (completedAt = 0)
      allGames.sort((a, b) => {
        const timeA = (a.completedAt && typeof a.completedAt === 'object' && 'toMillis' in a.completedAt) 
          ? (a.completedAt as Timestamp).toMillis() 
          : 0;
        const timeB = (b.completedAt && typeof b.completedAt === 'object' && 'toMillis' in b.completedAt) 
          ? (b.completedAt as Timestamp).toMillis() 
          : 0;
        
        // Aktive Spiele (0) vor abgeschlossenen (>0)
        if (timeA === 0 && timeB > 0) return -1;
        if (timeB === 0 && timeA > 0) return 1;
        
        return timeB - timeA;
      });
      
      console.log(`[TournamentStore] 🎧 Combined games: ${completedGames.length} completed + ${activeGames.length} active = ${allGames.length} total`);
      
      set({ 
        currentTournamentGames: allGames, 
        gamesStatus: 'success' 
      });
    };
    
    // 1️⃣ Listener für ABGESCHLOSSENE Spiele (tournaments/{id}/games)
    const completedGamesRef = collection(db, 'tournaments', instanceId, 'games');
    const unsubscribeCompleted = onSnapshot(
      completedGamesRef,
      (snapshot) => {
        try {
          completedGames = snapshot.docs.map(doc => ({
            passeId: doc.id,
            ...doc.data()
          })) as TournamentGame[];
          
          updateCombinedGames();
        } catch (error) {
          console.error('[TournamentStore] Error processing completed games:', error);
          set({ gamesStatus: 'error', error: 'Fehler beim Laden der abgeschlossenen Spiele' });
        }
      },
      (error) => {
        console.error('[TournamentStore] Error in completed games listener:', error);
        set({ gamesStatus: 'error', error: 'Fehler beim Überwachen der abgeschlossenen Spiele' });
      }
    );
    
    // 2️⃣ Listener für AKTIVE Spiele (activeGames where tournamentInstanceId == instanceId)
    const activeGamesRef = query(
      collection(db, 'activeGames'),
      where('tournamentInstanceId', '==', instanceId)
    );
    const unsubscribeActive = onSnapshot(
      activeGamesRef,
      (snapshot) => {
        try {
          activeGames = snapshot.docs.map(doc => {
            const data = doc.data();
            // ✅ Mapping von ActiveGame zu TournamentGame (mit allen erforderlichen Feldern)
            return {
              passeId: doc.id,
              tournamentInstanceId: data.tournamentInstanceId || instanceId,
              passeNumber: data.passeTournamentNumber || data.currentGameNumber || 0,
              tournamentRound: Math.ceil((data.passeTournamentNumber || data.currentGameNumber || 1)),
              passeInRound: data.passeInRound || 'A',
              passeLabel: `${data.passeTournamentNumber || data.currentGameNumber || 1}${data.passeInRound || 'A'}`,
              tournamentMode: 'spontaneous' as const,
              startedAt: data.createdAt || data.gameStartTime,
              completedAt: undefined as any, // Aktive Spiele haben kein completedAt (wird als 0 behandelt beim Sortieren)
              durationMillis: 0,
              startingPlayer: data.startingPlayer || data.initialStartingPlayer || 1,
              participantUidsForPasse: data.participantUids || [],
              participantPlayerIds: data.participantPlayerIds || [],
              playerDetails: [], // Wird erst beim Abschluss gefüllt
              teamScoresPasse: data.scores || { top: 0, bottom: 0 },
              teamStrichePasse: data.striche || { 
                top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
                bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
              },
              teams: data.teams,
              finalScores: data.scores,
              finalStriche: data.striche,
              activeScoreSettings: data.scoreSettings || data.activeScoreSettings || DEFAULT_SCORE_SETTINGS,
              activeStrokeSettings: data.strokeSettings || data.activeStrokeSettings || DEFAULT_STROKE_SETTINGS,
              activeFarbeSettings: data.farbeSettings || data.activeFarbeSettings || DEFAULT_FARBE_SETTINGS,
              // Zusätzliche Felder aus ActiveGame (status ist nicht Teil von TournamentGame, wird durch completedAt erkannt)
              playerNames: data.playerNames,
            } as TournamentGame;
          });
          
          updateCombinedGames();
        } catch (error) {
          console.error('[TournamentStore] Error processing active games:', error);
          set({ gamesStatus: 'error', error: 'Fehler beim Laden der aktiven Spiele' });
        }
      },
      (error) => {
        console.error('[TournamentStore] Error in active games listener:', error);
        set({ gamesStatus: 'error', error: 'Fehler beim Überwachen der aktiven Spiele' });
      }
    );
    
    // ✅ Kombinierter Unsubscribe
    const combinedUnsubscribe = () => {
      unsubscribeCompleted();
      unsubscribeActive();
    };
    
    set({ gamesListenerUnsubscribe: combinedUnsubscribe });
  },
  
  clearGamesListener: () => {
    const unsubscribe = get().gamesListenerUnsubscribe;
    if (unsubscribe) {
      console.log('[TournamentStore] 🔇 Clearing games listener');
      unsubscribe();
      set({ gamesListenerUnsubscribe: null });
    }
  },

  resetTournamentState: () => {
    // Cleanup alle Listener
    const unsubscribe = get().tournamentListenerUnsubscribe;
    const userTournamentsUnsubscribe = get().userTournamentsListenerUnsubscribe;
    const participantsUnsubscribe = get().participantsListenerUnsubscribe;
    const gamesUnsubscribe = get().gamesListenerUnsubscribe;
    
    if (unsubscribe) {
      unsubscribe();
    }
    if (userTournamentsUnsubscribe) {
      userTournamentsUnsubscribe();
    }
    if (participantsUnsubscribe) {
      participantsUnsubscribe();
    }
    if (gamesUnsubscribe) {
      gamesUnsubscribe();
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