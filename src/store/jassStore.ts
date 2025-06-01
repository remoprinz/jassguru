// src/store/jassStore.ts

import {create, StateCreator} from "zustand";
import {useGameStore} from "./gameStore";
import {jassStorage} from "./jassStorage";
import {
  TeamPosition,
  PlayerNames,
  GameEntry,
  TeamStand,
  TeamScores,
  JassSession,
  GameTotals,
  StricheRecord,
  PlayerNumber,
  determineNextStartingPlayer,
  determineWinningTeam,
  GameUpdate,
  JassColor,
  ActiveGame,
  CompletedGameSummary,
  RoundEntry,
  isJassRoundEntry,
  FarbeSettings,
  ScoreSettings,
  StrokeSettings
} from "../types/jass";
import {useTimerStore} from "./timerStore";
import {aggregateStricheForTeam} from "../utils/stricheCalculations";
import { updateActiveGame } from "../services/gameService";
import { Timestamp, serverTimestamp, getFirestore, doc, setDoc, onSnapshot, Unsubscribe, getDoc } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import { sanitizeDataForFirestore } from "@/utils/firestoreUtils";
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { useUIStore } from "@/store/uiStore";

// --- 1. Interface für State --- 

export interface JassState {
  isJassStarted: boolean;
  currentSession: JassSession | null;
  currentRound: number;
  currentGameId: number;
  activeGameId: string | null;
  isJassCompleted: boolean;
  jassSessionId: string | null;
  sessionUnsubscribe: Unsubscribe | null;
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  games: GameEntry[]; // Für lokale/Gast-Spiele
  onlineCompletedGames: CompletedGameSummary[]; // NEU
  currentGameCache: GameEntry | null;
}

// --- 2. Interface für Actions --- 

export interface JassActions {
  saveSession: () => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  startJass: (config: {
    playerNames: PlayerNames;
    initialStartingPlayer: PlayerNumber;
    activeGameId?: string;
    sessionId: string;
    groupId: string | null;
    participantUids: string[];
    initialSettings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
    tournamentSettings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
  }) => Promise<void>;
  startNextGame: (initialStartingPlayer: PlayerNumber, newActiveGameId?: string) => void;
  finalizeGame: () => void;
  resetJass: () => void;
  undoNewGame: () => void;
  navigateToGame: (gameId: number) => void;
  navigateToPreviousGame: () => boolean;
  navigateToNextGame: () => boolean;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;
  calculateTotalPoints: () => { top: number; bottom: number };
  calculateTotalJassPoints: () => { top: number; bottom: number };
  getGameHistory: () => GameEntry[];
  getCurrentGame: () => GameEntry | undefined;
  getVisibleGames: () => GameEntry[];
  updateCurrentGame: (update: GameUpdate) => void;
  updateWeisPoints: (team: TeamPosition, points: number) => void;
  getTotalsUpToGame: (gameId: number) => GameTotals;
  startGame: () => void; // Beibehalten, falls verwendet
  subscribeToSession: (sessionId: string) => void;
  clearActiveGameForSession: (sessionId: string) => void;
}

// --- 3. Kombinierter Store-Typ --- 

export type JassStore = JassState & JassActions;

// --- Hilfsfunktionen VOR Initial State --- 
export const createInitialTeamStand = (): TeamStand => ({
  bergActive: false,
  bedankenActive: false,
  isSigned: false,
  striche: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
  total: 0,
  jassPoints: 0,
  weisPoints: 0,
  playerStats: {
    1: {striche: 0, points: 0, weisPoints: 0},
    2: {striche: 0, points: 0, weisPoints: 0},
    3: {striche: 0, points: 0, weisPoints: 0},
    4: {striche: 0, points: 0, weisPoints: 0},
  },
});

const createGameEntry = (
  id: number,
  startingPlayer: PlayerNumber,
  sessionId: string = "default",
  activeGameId?: string,
  trueInitialStartingPlayer?: PlayerNumber
): GameEntry => {
  // console.log("📝 Creating Game Entry:", {
  //   id,
  //   startingPlayer,
  //   sessionId,
  //   activeGameId,
  //   trueInitialStartingPlayer
  // });
  return ({
    id,
    activeGameId,
    timestamp: Date.now(),
    teams: {
      top: createInitialTeamStand(),
      bottom: createInitialTeamStand(),
    },
    sessionId,
    currentRound: 1,
    startingPlayer: startingPlayer,
    initialStartingPlayer: trueInitialStartingPlayer ?? startingPlayer,
    currentPlayer: startingPlayer,
    roundHistory: [],
    currentHistoryIndex: -1,
    historyState: {
      lastNavigationTimestamp: Date.now(),
    },
    isGameStarted: false,
    isRoundCompleted: false,
    isGameCompleted: false,
  });
};

const aggregateGameResult = (teams: Record<TeamPosition, TeamStand>, scores: TeamScores): Record<TeamPosition, TeamStand> => {
  const newTeams = {...teams};
  newTeams.top = {
    ...newTeams.top,
    jassPoints: newTeams.top.jassPoints + scores.top,
    weisPoints: newTeams.top.weisPoints + (scores.weisPoints?.top || 0),
    total: newTeams.top.total + scores.top + (scores.weisPoints?.top || 0),
  };
  newTeams.bottom = {
    ...newTeams.bottom,
    jassPoints: newTeams.bottom.jassPoints + scores.bottom,
    weisPoints: newTeams.bottom.weisPoints + (scores.weisPoints?.bottom || 0),
    total: newTeams.bottom.total + scores.bottom + (scores.weisPoints?.bottom || 0),
  };
  return newTeams;
};

const calculateStricheTotal = (striche: StricheRecord): number =>
  Object.values(striche).reduce((sum, count) => sum + count, 0);

// --- Initial State (Konform zu JassState) --- 

const initialPlayerNames: PlayerNames = { 1: "", 2: "", 3: "", 4: "" };

const initialSession: JassSession = {
  id: "initial",
  gruppeId: "default",
  startedAt: Date.now(),
  playerNames: initialPlayerNames,
  games: [],
  metadata: {},
  statistics: {
    gamesPlayed: 0,
    scores: { top: 0, bottom: 0 },
    weisCount: 0,
    stricheCount: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
  },
  currentScoreLimit: 2500, // Beispiel-Standardlimit
  completedGamesCount: 0   // Initial 0
};

const initialJassState: JassState = {
  isJassStarted: false,
  currentSession: initialSession,
  currentRound: 1,
  currentGameId: 1,
  activeGameId: null,
  isJassCompleted: false,
  jassSessionId: null,
  sessionUnsubscribe: null,
  teams: {
    top: createInitialTeamStand(),
    bottom: createInitialTeamStand(),
  },
  games: [], 
  onlineCompletedGames: [], 
  currentGameCache: null,
};

// --- Store Implementation --- 

// create-Funktion gibt Objekt zurück, das JassStore entspricht
const createJassStore: StateCreator<JassStore> = (set, get): JassState & JassStore => ({
  ...initialJassState,

  // --- Implementierung ALLER Actions aus JassActions --- 

  saveSession: async () => {
    const state = get();
    const gameStore = useGameStore.getState();

    // Striche für beide Teams aggregieren
    const topStriche = aggregateStricheForTeam(state.games, "top");
    const bottomStriche = aggregateStricheForTeam(state.games, "bottom");

    const session: JassSession = {
      id: `session_${Date.now()}`,
      gruppeId: "default",
      startedAt: state.games[0]?.timestamp || Date.now(),
      endedAt: Date.now(),
      playerNames: gameStore.playerNames,
      games: state.games
        .map((g) => {
          const rawId = g.id;
          const numericId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
          return typeof numericId === 'number' && !isNaN(numericId) ? numericId : null;
        })
        .filter((id): id is number => id !== null),
      currentScoreLimit: state.currentSession?.currentScoreLimit ?? 2500,
      completedGamesCount: state.games.length,
      metadata: {
        location: "Standard Location",
        notes: "",
      },
      statistics: {
        gamesPlayed: state.games.length,
        totalDuration: Date.now() - (state.games[0]?.timestamp || Date.now()),
        scores: {
          top: state.teams.top.total,
          bottom: state.teams.bottom.total,
        },
        weisCount: state.games.reduce((acc, game) =>
          acc + (game.teams.top.weisPoints + game.teams.bottom.weisPoints), 0),
        stricheCount: {
          berg: topStriche.berg + bottomStriche.berg,
          sieg: topStriche.sieg + bottomStriche.sieg,
          matsch: topStriche.matsch + bottomStriche.matsch,
          schneider: topStriche.schneider + bottomStriche.schneider,
          kontermatsch: topStriche.kontermatsch + bottomStriche.kontermatsch,
        },
      },
    };

    try {
      await jassStorage.saveSession(session);
      return session.id;
    } catch (error) {
      // console.error("Fehler beim Speichern der Session:", error);
      throw error;
    }
  },

  loadSession: async (sessionId: string) => {
    try {
      const session = await jassStorage.loadSession(sessionId);
      // TODO: State aus der Session wiederherstellen
      // Dies erfordert zusätzliche Logik, da wir die kompletten Game-Daten
      // separat speichern müssen
    } catch (error) {
      // console.error("Fehler beim Laden der Session:", error);
      throw error;
    }
  },

  startJass: async (config) => {
    console.log("[JassStore.startJass] Async starting new Jass with config:", JSON.parse(JSON.stringify(config)));
    const {
      playerNames,
      initialStartingPlayer,
      activeGameId,
      sessionId,
      groupId,
      participantUids,
      initialSettings, // Vom StartScreen übergebene Settings (basierend auf UIStore)
      tournamentSettings
    } = config;

    // 1. Bestimme die Basis-Einstellungen (Turnier > Initial/UI > Default)
    let baseSettings = {
      farbeSettings: initialSettings?.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
      scoreSettings: initialSettings?.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
      strokeSettings: initialSettings?.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
    };
    console.log("[JassStore.startJass] Schritt 1 - Basis-Settings (aus initialSettings oder Defaults):", JSON.parse(JSON.stringify(baseSettings)));

    if (tournamentSettings && tournamentSettings.farbeSettings && tournamentSettings.scoreSettings && tournamentSettings.strokeSettings) {
      console.log("[JassStore.startJass] Schritt 2 - Turnier-Settings erkannt, werden als Basis verwendet.");
      baseSettings = {
        farbeSettings: tournamentSettings.farbeSettings,
        scoreSettings: tournamentSettings.scoreSettings,
        strokeSettings: tournamentSettings.strokeSettings,
      };
    }

    // 2. Lade Gruppen-Einstellungen und überschreibe/merge mit Basis-Einstellungen
    let finalSettingsForGameStore = { ...baseSettings };

    if (groupId) {
      console.log(`[JassStore.startJass] Schritt 3 - Gruppe ${groupId} vorhanden. Lade Gruppen-Einstellungen.`);
      try {
        const db = getFirestore(firebaseApp);
        const groupDocRef = doc(db, 'groups', groupId);
        const groupSnap = await getDoc(groupDocRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.data();
          console.log("[JassStore.startJass] Gruppendaten geladen:", JSON.parse(JSON.stringify(groupData)));
          
          const groupFarbeSettings = groupData.farbeSettings as FarbeSettings | undefined;
          const groupScoreSettings = groupData.scoreSettings as ScoreSettings | undefined;
          const groupStrokeSettings = groupData.strokeSettings as StrokeSettings | undefined;

          // Merge: Gruppen-Settings überschreiben nur, was in der Gruppe explizit definiert ist.
          // Wichtig für cardStyle: Wenn Gruppe keinen hat, bleibt der von UI/Turnier.
          finalSettingsForGameStore = {
            farbeSettings: {
              ...baseSettings.farbeSettings, // Starte mit Basis (die schon UI oder Turnier sein kann)
              ...(groupFarbeSettings || {}), // Überschreibe mit Gruppenwerten, falls vorhanden
              // Stelle sicher, dass cardStyle von der Gruppe nur greift, wenn explizit gesetzt, sonst Basis beibehalten
              cardStyle: groupFarbeSettings?.cardStyle ?? baseSettings.farbeSettings.cardStyle,
            },
            scoreSettings: groupScoreSettings ?? baseSettings.scoreSettings,
            strokeSettings: groupStrokeSettings ?? baseSettings.strokeSettings,
          };
          console.log("[JassStore.startJass] Gruppen-Einstellungen gemerged. Finale Settings für gameStore:", JSON.parse(JSON.stringify(finalSettingsForGameStore)));
        } else {
          console.warn(`[JassStore.startJass] Gruppe ${groupId} nicht gefunden. Basis-Einstellungen (UI/Turnier/Default) werden verwendet.`);
        }
      } catch (error) {
        console.error(`[JassStore.startJass] Fehler beim Laden der Gruppe ${groupId}:`, error);
        console.warn("[JassStore.startJass] Basis-Einstellungen (UI/Turnier/Default) bleiben nach Fehler erhalten.");
      }
    } else {
      console.log("[JassStore.startJass] Keine groupId, verwende Basis-Settings (UI/Turnier/Default).");
    }

    const initialGame = createGameEntry(1, initialStartingPlayer, sessionId, activeGameId, initialStartingPlayer);

    set({
      isJassStarted: true,
      currentSession: { 
        id: sessionId, 
        gruppeId: groupId ?? '',
        startedAt: Date.now(),
        playerNames,
        games: [1],
        currentScoreLimit: 5000,
        completedGamesCount: 0,
        participantUids: participantUids ?? [],
        metadata: {},
        statistics: undefined,
        // Verwende die final ermittelten Einstellungen
        currentFarbeSettings: finalSettingsForGameStore.farbeSettings,
        currentScoreSettings: finalSettingsForGameStore.scoreSettings,
        currentStrokeSettings: finalSettingsForGameStore.strokeSettings,
      },
      currentRound: 1,
      currentGameId: 1,
      activeGameId: activeGameId ?? null,
      isJassCompleted: false,
      jassSessionId: sessionId,
      teams: { 
        top: createInitialTeamStand(), 
        bottom: createInitialTeamStand() 
      }, 
      games: [initialGame],
      onlineCompletedGames: [],
      currentGameCache: initialGame,
    });

    const gameStore = useGameStore.getState();
    console.log("[JassStore.startJass] Rufe gameStore.resetGame auf mit finalSettingsForGameStore:", finalSettingsForGameStore ? "Vorhanden" : "Nicht vorhanden (sollte nicht passieren)");
    if (finalSettingsForGameStore) {
      console.log("[JassStore.startJass] finalSettingsForGameStore Details:", JSON.parse(JSON.stringify(finalSettingsForGameStore)));
    }
    gameStore.resetGame(initialStartingPlayer, activeGameId, finalSettingsForGameStore);
    useGameStore.setState({ playerNames }); 

    const timerStore = useTimerStore.getState();
    timerStore.startJassTimer();
    timerStore.activateGameTimer(1);

    console.log("[JassStore.startJass] Async JassStore and GameStore initialized.");
    
    get().subscribeToSession(sessionId); 
    console.log(`[JassStore.startJass] Subscribed to session ${sessionId}`);
  },

  startNextGame: (initialStartingPlayer: PlayerNumber, newActiveGameId?: string) => {
    const state = get();
    const gameStore = useGameStore.getState();
    const timerStore = useTimerStore.getState();

    if (!state.isJassStarted || !state.currentSession) {
      console.log("[JassStore.startNextGame] Jass not started or no current session.");
      return;
    }
    const currentSession = state.currentSession;
    const sessionId = currentSession.id;
    const previousGameId = state.currentGameId;

    const nextGameId = previousGameId + 1;
    console.log(`[JassStore.startNextGame] Creating game ${nextGameId} with initialStartingPlayer=${initialStartingPlayer}, newActiveGameId=${newActiveGameId || 'none'}`);
    
    const newGameEntry = createGameEntry(
      nextGameId,
      initialStartingPlayer,
      sessionId,
      newActiveGameId,
      state.games[0]?.initialStartingPlayer ?? initialStartingPlayer
    );

    set((currentState) => {
      if (!currentState.currentSession) return {};
      const currentStats = currentState.currentSession.statistics;
      const newStatistics: JassSession['statistics'] = {
        gamesPlayed: nextGameId,
        totalDuration: currentStats?.totalDuration,
        scores: currentStats?.scores ?? { top: 0, bottom: 0 },
        weisCount: currentStats?.weisCount ?? 0,
        stricheCount: currentStats?.stricheCount ?? {
          berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0
        },
      };
      return {
        currentGameId: nextGameId,
        games: [...currentState.games, newGameEntry],
        currentSession: {
          ...currentState.currentSession,
          games: [...currentState.currentSession.games, nextGameId],
          statistics: newStatistics,
        },
        currentRound: 1,
        isJassCompleted: false,
        activeGameId: newActiveGameId ?? null,
      };
    });

    timerStore.reactivateGameTimer(nextGameId);

    // KORREKTUR: Übergebe die aktuellen Session-Einstellungen an resetGame
    const settingsForNextGame = {
      farbeSettings: state.currentSession?.currentFarbeSettings,
      scoreSettings: state.currentSession?.currentScoreSettings,
      strokeSettings: state.currentSession?.currentStrokeSettings,
    };

    gameStore.resetGame(initialStartingPlayer, newActiveGameId, settingsForNextGame);
    useGameStore.setState({ playerNames: state.currentSession.playerNames });

    console.log(`[JassStore.startNextGame] Started game ${nextGameId}. New Active Game ID: ${newActiveGameId || 'none'}`);
  },

  finalizeGame: () => {
    const state = get();
    const gameStore = useGameStore.getState();
    const currentGame = state.games.find((game) => game.id === state.currentGameId);
    if (!currentGame) return;

    const timerStore = useTimerStore.getState();
    const finalDuration = timerStore.getGameDuration(state.currentGameId);

    const updatedGame: GameEntry = {
      ...currentGame,
      teams: {
        top: {
          ...currentGame.teams.top,
          jassPoints: gameStore.scores.top,
          total: gameStore.scores.top,
          striche: {...gameStore.striche.top},
        },
        bottom: {
          ...currentGame.teams.bottom,
          jassPoints: gameStore.scores.bottom,
          total: gameStore.scores.bottom,
          striche: {...gameStore.striche.bottom},
        },
      },
      roundHistory: gameStore.roundHistory,
      currentRound: gameStore.currentRound,
      currentPlayer: gameStore.currentPlayer,

      currentHistoryIndex: gameStore.currentHistoryIndex,
      historyState: gameStore.historyState,

      isGameStarted: gameStore.isGameStarted,
      isRoundCompleted: gameStore.isRoundCompleted,
      isGameCompleted: true,

      metadata: {
        duration: finalDuration,
        completedAt: Date.now(),
        roundStats: currentGame.metadata?.roundStats ?? {
          weisCount: 0,
          colorStats: {} as { [K in JassColor]: number },
        },
      },
    };

    set((state) => ({
      games: state.games.map((game) =>
        game.id === currentGame.id ? updatedGame : game
      ),
    }));

    timerStore.completeGame();
  },

  resetJass: () => {
    console.log("Resetting Jass Store...");
    get().sessionUnsubscribe?.(); 
    console.log("Existing session subscription cancelled (if any).");
    set({ ...initialJassState }); 
  },

  subscribeToSession: (sessionId: string) => {
    const state = get();
    if (state.sessionUnsubscribe) {
      console.log("[JassStore] Unsubscribing from previous session listener.");
      state.sessionUnsubscribe();
    }

    console.log(`[JassStore] Setting up NEW snapshot listener for session: sessions/${sessionId}`);
    const db = getFirestore(firebaseApp);
    const sessionDocRef = doc(db, 'sessions', sessionId);

    const unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
      console.log(`[JassStore Session Listener] RAW snapshot received for session ${sessionId}. Exists: ${docSnap.exists()}`);
      if (docSnap.exists()) {
        const sessionData = docSnap.data() as JassSession;

        const gamesArray = Array.isArray(sessionData.games) ? sessionData.games : [];

        set(state => {
          const currentState = state ?? {}; 
          const currentSessionBase = currentState.currentSession ?? {};

          return {
            ...currentState,
            currentSession: {
              ...currentSessionBase,
              ...sessionData,
              id: docSnap.id,
              games: gamesArray, 
            },
            jassSessionId: docSnap.id,
            activeGameId: sessionData.currentActiveGameId ?? null,
            isJassStarted: true,
            isJassCompleted: sessionData.status === 'completed' || sessionData.status === 'archived'
          };
        });
      } else {
        console.warn(`[JassStore Session Listener] Session ${sessionId} not found in snapshot.`);
        
        // BEHOBEN: Prüfe, ob es sich um eine lokale Session handelt (beginnt mit "local_")
        // Für lokale Sessions NICHT den State zurücksetzen, da dies ein normaler Zustand ist
        if (sessionId.startsWith("local_")) {
          console.log(`[JassStore Session Listener] Lokale Session '${sessionId}' erkannt. Der Zustand wird beibehalten, da lokale Sessions nicht in Firestore existieren müssen.`);
          // Keine State-Änderung für lokale Sessions!
        } else {
          // Nur für ONLINE-Sessions, die in Firestore existieren sollten, den State zurücksetzen
          console.warn(`[JassStore Session Listener] Nicht-lokale Session '${sessionId}' nicht gefunden. Zustand wird zurückgesetzt.`);
          set({ currentSession: null, isJassStarted: false, isJassCompleted: true, jassSessionId: null, activeGameId: null });
        }
      }
    }, (error) => {
      console.error(`[JassStore Session Listener] Error in snapshot listener for session ${sessionId}:`, error);
    });

    set({ sessionUnsubscribe: unsubscribe });
    console.log(`[JassStore] Subscription setup COMPLETE for session ${sessionId}`);
  },

  clearActiveGameForSession: (sessionId: string) => {
    set((state) => {
      if (state.currentSession && state.currentSession.id === sessionId) {
        console.log(`[JassStore] Clearing activeGameId for session ${sessionId}`);
        return {
          ...state,
          activeGameId: null,
          currentSession: {
            ...state.currentSession,
            currentActiveGameId: null
          }
        };
      } else {
        console.warn(`[JassStore] Attempted to clear activeGameId for session ${sessionId}, but current session is different (${state.currentSession?.id}) or null.`);
        return state;
      }
    });
  },

  undoNewGame: () => {
    const state = get();
    if (state.games.length <= 1) return;

    const newGames = state.games.slice(0, -1);
    const previousGame = newGames[newGames.length - 1];
    if (!previousGame) return;

    const gameStore = useGameStore.getState();
    gameStore.resetGamePoints();
    gameStore.setScore("top", previousGame.teams.top.jassPoints);
    gameStore.setScore("bottom", previousGame.teams.bottom.jassPoints);

    const removedGame = state.games[state.games.length - 1];
    const reversedTeams = {...state.teams};

    reversedTeams.top = {
      ...reversedTeams.top,
      jassPoints: reversedTeams.top.jassPoints - removedGame.teams.top.jassPoints,
      total: reversedTeams.top.total - removedGame.teams.top.jassPoints,
    };

    reversedTeams.bottom = {
      ...reversedTeams.bottom,
      jassPoints: reversedTeams.bottom.jassPoints - removedGame.teams.bottom.jassPoints,
      total: reversedTeams.bottom.total - removedGame.teams.bottom.jassPoints,
    };

    set({
      games: newGames,
      currentGameId: typeof previousGame.id === 'string' ? parseInt(previousGame.id, 10) : previousGame.id,
      teams: reversedTeams,
    });
  },

  navigateToGame: (gameId: number) => {
    const state = get();
    const targetGame = state.games.find((game) => game.id === gameId);
    if (!targetGame) return;

    const isLatestGame = gameId === state.games.length;
    const lastHistoryIndex = (targetGame.roundHistory?.length || 0) - 1;

    const timerStore = useTimerStore.getState();
    timerStore.activateGameTimer(gameId);
    timerStore.startGameTimer();
    timerStore.startRoundTimer();

    set((state) => ({
      ...state,
      currentGameId: gameId,
      teams: targetGame.teams,
    }));

    if (targetGame.activeGameId) {
      const gameIdToLoad = targetGame.activeGameId;
      import('../services/gameService').then(({ loadRoundsFromFirestore }) => {
        loadRoundsFromFirestore(gameIdToLoad)
          .then((loadedRounds) => {
            const finalHistoryIndex = loadedRounds.length - 1;
            console.log(`[JassStore] Loaded ${loadedRounds.length} rounds from Firestore for game ${gameIdToLoad}. Setting index to ${finalHistoryIndex}`);
            
            set((state) => {
              const updatedGame = {
                ...targetGame,
                roundHistory: loadedRounds
              };
              return {
                ...state,
                games: state.games.map(game => 
                  game.id === targetGame.id ? updatedGame : game
                )
              };
            });
            
            useGameStore.setState(state => ({
              ...state,
              roundHistory: loadedRounds,
              currentHistoryIndex: finalHistoryIndex,
              historyState: {
                lastNavigationTimestamp: Date.now(),
              }
            }));
            
          })
          .catch((error) => {
            console.error(`[JassStore] Error loading rounds from Firestore for game ${gameIdToLoad}:`, error);
            useGameStore.setState(state => ({ 
              ...state,
              currentHistoryIndex: -1,
              historyState: { lastNavigationTimestamp: Date.now() }
            }));
          });
      });
      
      useGameStore.setState((state) => ({
        ...state,
        activeGameId: targetGame.activeGameId,
        isGameStarted: true, 
        isRoundCompleted: false, 
        isGameCompleted: false, 
        currentRound: targetGame.currentRound || 1,
        currentPlayer: targetGame.currentPlayer,
        scores: {
          top: targetGame.teams.top.jassPoints,
          bottom: targetGame.teams.bottom.jassPoints,
        },
        weisPoints: {
          top: targetGame.teams.top.weisPoints || 0,
          bottom: targetGame.teams.bottom.weisPoints || 0,
        },
        striche: {
          top: {...targetGame.teams.top.striche},
          bottom: {...targetGame.teams.bottom.striche},
        },
        roundHistory: [],
        currentHistoryIndex: -1,
        historyState: {
          lastNavigationTimestamp: Date.now(),
        },
        playerNames: state.playerNames
      }));

    } else {
      const localHistory = targetGame.roundHistory || [];
      const localIndex = localHistory.length - 1;
      useGameStore.setState((state) => ({
        ...state,
        activeGameId: undefined,
        isGameStarted: true, 
        isRoundCompleted: false, 
        isGameCompleted: false, 
        currentRound: targetGame.currentRound || 1,
        currentPlayer: targetGame.currentPlayer,
        scores: {
          top: targetGame.teams.top.jassPoints,
          bottom: targetGame.teams.bottom.jassPoints,
        },
        weisPoints: {
          top: targetGame.teams.top.weisPoints || 0,
          bottom: targetGame.teams.bottom.weisPoints || 0,
        },
        striche: {
          top: {...targetGame.teams.top.striche},
          bottom: {...targetGame.teams.bottom.striche},
        },
        roundHistory: localHistory, 
        currentHistoryIndex: localIndex, 
        historyState: {
          lastNavigationTimestamp: Date.now(),
        },
        playerNames: state.playerNames
      }));
    }

    console.log("🎮 Game Navigation Complete:", {
      gameId,
      timersStarted: true,
      gameStarted: true,
      roundStarted: true,
      activeGameId: targetGame.activeGameId || 'none'
    });
  },

  navigateToPreviousGame: () => {
    const state = get();
    if (state.currentGameId > 1) {
      get().navigateToGame(state.currentGameId - 1);
      return true;
    }
    return false;
  },

  navigateToNextGame: () => {
    const state = get();
    if (state.currentGameId < state.games.length) {
      const timerStore = useTimerStore.getState();
      const nextGameId = state.currentGameId + 1;

      get().navigateToGame(state.currentGameId + 1);

      timerStore.startGameTimer();
      timerStore.startRoundTimer();

      return true;
    }
    return false;
  },

  canNavigateBack: () => {
    const state = get();
    return state.currentGameId > 1;
  },

  canNavigateForward: () => {
    const state = get();
    return state.currentGameId < state.games.length;
  },

  calculateTotalPoints: () => {
    const state = get();
    return {
      top: state.teams.top.total,
      bottom: state.teams.bottom.total,
    };
  },

  calculateTotalJassPoints: () => {
    const state = get();
    return {
      top: state.teams.top.jassPoints,
      bottom: state.teams.bottom.jassPoints,
    };
  },

  getGameHistory: () => get().games,

  getCurrentGame: () => {
    const state = get();
    return state.games.find((game) => game.id === state.currentGameId);
  },

  getVisibleGames: () => {
    const state = get();
    return state.games.filter((game) => {
       const rawId = game.id;
       const gameNumericId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
       return typeof gameNumericId === 'number' && !isNaN(gameNumericId) && gameNumericId <= state.currentGameId;
    });
  },

  updateCurrentGame: (update: GameUpdate) => {
    set((state) => {
      const currentGame = state.games.find((g) => g.id === state.currentGameId);
      if (!currentGame) return state;

      const updatedTeams = update.teams ? {
        top: {
          ...currentGame.teams.top,
          ...update.teams.top,
        },
        bottom: {
          ...currentGame.teams.bottom,
          ...update.teams.bottom,
        },
      } : currentGame.teams;

      const updatedGame = {
        ...currentGame,
        ...update,
        teams: updatedTeams,
      };

      return {
        ...state,
        games: state.games.map((g) =>
          g.id === updatedGame.id ? updatedGame : g
        ),
      };
    });
  },

  updateWeisPoints: (team: TeamPosition, points: number) => {
    set((state) => {
      const newTeams = {...state.teams};
      newTeams[team].weisPoints += points;
      newTeams[team].total += points;

      return {
        teams: newTeams,
      };
    });
  },

  getTotalsUpToGame: (gameId: number): GameTotals => {
    const state = get();
    const relevantGames = state.games.filter((g) => {
      const gameNumericId = typeof g.id === 'string' ? parseInt(g.id, 10) : g.id;
      return typeof gameNumericId === 'number' && !isNaN(gameNumericId) && gameNumericId <= gameId;
    });

    const initialTotals: GameTotals = {
      striche: {
        top: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
        bottom: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
      },
      punkte: {
        top: 0,
        bottom: 0,
      },
    };

    return relevantGames.reduce((totals, game) => ({
      striche: {
        top: {
          berg: totals.striche.top.berg + game.teams.top.striche.berg,
          sieg: totals.striche.top.sieg + game.teams.top.striche.sieg,
          matsch: totals.striche.top.matsch + game.teams.top.striche.matsch,
          schneider: totals.striche.top.schneider + game.teams.top.striche.schneider,
          kontermatsch: totals.striche.top.kontermatsch + game.teams.top.striche.kontermatsch,
        },
        bottom: {
          berg: totals.striche.bottom.berg + game.teams.bottom.striche.berg,
          sieg: totals.striche.bottom.sieg + game.teams.bottom.striche.sieg,
          matsch: totals.striche.bottom.matsch + game.teams.bottom.striche.matsch,
          schneider: totals.striche.bottom.schneider + game.teams.bottom.striche.schneider,
          kontermatsch: totals.striche.bottom.kontermatsch + game.teams.bottom.striche.kontermatsch,
        },
      },
      punkte: {
        top: totals.punkte.top + game.teams.top.total,
        bottom: totals.punkte.bottom + game.teams.bottom.total,
      },
    }), initialTotals);
  },

  startGame: () => {
 console.warn("startGame Action not implemented yet.");
},
});

export const useJassStore = create(createJassStore);
