// src/store/jassStore.ts

import {create, StateCreator} from "zustand";
import { persist } from "zustand/middleware"; // NEU
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
  GameUpdate,
  JassColor,
  CompletedGameSummary,
  FarbeSettings,
  ScoreSettings,
  StrokeSettings
} from "../types/jass";
import {useTimerStore} from "./timerStore";
import {aggregateStricheForTeam} from "../utils/stricheCalculations";
import { calculateEventCounts } from "@/utils/jassUtils";
import { Timestamp, serverTimestamp, getFirestore, doc, setDoc, onSnapshot, Unsubscribe, getDoc, writeBatch } from "firebase/firestore";


import { firebaseApp } from "@/services/firebaseInit";
import { sanitizeDataForFirestore } from "@/utils/firestoreUtils";
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { useUIStore } from "@/store/uiStore";
import { loadCompletedGamesFromFirestore } from "@/services/gameService";



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
  completedGamesUnsubscribe: Unsubscribe | null;
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
    participantPlayerIds: string[]; // ✅ NEU: Player Document IDs
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
  finalizeGame: () => Promise<void>;
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
  subscribeToSession: (sessionId: string, groupId?: string | null) => void; // MODIFIZIERT
  clearActiveGameForSession: (sessionId: string) => void;
  syncCompletedGamesForSession: (sessionId: string) => void;
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
  completedGamesUnsubscribe: null,
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
    const { 
      playerNames, 
      initialStartingPlayer, 
      activeGameId, 
      sessionId, 
      groupId, 
      participantUids, 
      participantPlayerIds, 
      initialSettings 
    } = config;

    // 1. Bestimme die Basis-Einstellungen (Initial/UI > Default)
    const baseSettings = {
      farbeSettings: initialSettings?.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
      scoreSettings: initialSettings?.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
      strokeSettings: initialSettings?.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
    };

    // 2. Lade Gruppen-Einstellungen und überschreibe/merge mit Basis-Einstellungen
    let finalSettingsForGameStore = { ...baseSettings };

    if (groupId) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[JassStore.startJass] Schritt 3 - Gruppe ${groupId} vorhanden. Lade Gruppen-Einstellungen.`);
      }
      try {
        const db = getFirestore(firebaseApp);
        const groupDocRef = doc(db, 'groups', groupId);
        const groupSnap = await getDoc(groupDocRef);
       
        if (groupSnap.exists()) {
          const groupData = groupSnap.data();

          
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

        } else {
          console.warn(`[JassStore.startJass] Gruppe ${groupId} nicht gefunden. Basis-Einstellungen (UI/Turnier/Default) werden verwendet.`);
        }
      } catch (error) {
        console.error(`[JassStore.startJass] Fehler beim Laden der Gruppe ${groupId}:`, error);
        console.warn("[JassStore.startJass] Basis-Einstellungen (UI/Turnier/Default) bleiben nach Fehler erhalten.");
      }
    } else {

    }

    // 📝 SICHERSTELLUNG: Session existiert in Firestore, oder verwende den sessionId für lokales Spiel
    if (!sessionId) {
      console.error("[JassStore.startJass] ❌ sessionId ist undefined/null.");
      return;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[JassStore.startJass] Session: ${sessionId} | ActiveGame: ${activeGameId ?? 'none'}`);
      }
    }

    const initialGame = createGameEntry(1, initialStartingPlayer, sessionId, activeGameId, initialStartingPlayer);

    // *** VEREINFACHTE SICHERHEIT - NUR SESSIONS COLLECTION ***
    const db = getFirestore(firebaseApp);
    
    // ✅ NEU: Versuche das Session-Dokument zu lesen um korrekte startedAt zu bekommen
    let sessionStartedAt = Date.now(); // Fallback
    
    try {
      const sessionDocRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionDocRef);
      
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        if (sessionData.startedAt) {
          // Konvertiere Firestore Timestamp zu number
          if (typeof sessionData.startedAt.toMillis === 'function') {
            sessionStartedAt = sessionData.startedAt.toMillis();
          } else if (typeof sessionData.startedAt === 'number') {
            sessionStartedAt = sessionData.startedAt;
          }
          if (process.env.NODE_ENV === 'development') {
            console.log(`[JassStore.startJass] Verwendet Session startedAt: ${new Date(sessionStartedAt).toISOString()}`);
          }
        }
      }
    } catch (error) {
      console.warn("[JassStore.startJass] ⚠️ Konnte Session-Dokument nicht lesen, verwende lokalen Timestamp:", error);
    }
    
    const settingsPayload = {
      currentFarbeSettings: finalSettingsForGameStore.farbeSettings,
      currentScoreSettings: finalSettingsForGameStore.scoreSettings,
      currentStrokeSettings: finalSettingsForGameStore.strokeSettings,
      playerNames: playerNames,
      participantUids: participantUids ?? [],
      participantPlayerIds: participantPlayerIds ?? [], // ✅ NEU: Player Document IDs
      groupId: groupId ?? null,
      startedAt: serverTimestamp(),
    };

    // ERSTE SICHERHEIT: sessions Dokument (HAUPTQUELLE)
    try {
      const sessionDocRef = doc(db, 'sessions', sessionId);
      await setDoc(sessionDocRef, {
        ...settingsPayload,
        currentActiveGameId: activeGameId ?? null,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

    } catch (error) {
      console.error("[JassStore.startJass] ❌ ERSTE SICHERHEIT FEHLGESCHLAGEN:", error);
    }

    // ZWEITE SICHERHEIT: activeGame Dokument (falls vorhanden)
    if (activeGameId) {
      try {
        const activeGameDocRef = doc(db, 'activeGames', activeGameId);
        await setDoc(activeGameDocRef, {
          activeFarbeSettings: finalSettingsForGameStore.farbeSettings,
          activeScoreSettings: finalSettingsForGameStore.scoreSettings,
          activeStrokeSettings: finalSettingsForGameStore.strokeSettings,
        }, { merge: true });

      } catch (error) {
        console.error("[JassStore.startJass] ❌ ZWEITE SICHERHEIT FEHLGESCHLAGEN:", error);
      }
    }

    set({
      isJassStarted: true,
      currentSession: { 
        id: sessionId, 
        gruppeId: groupId ?? '',
        startedAt: sessionStartedAt, // ✅ KORRIGIERT: Verwende das korrekte startedAt
        playerNames,
        games: [1],
        currentScoreLimit: 5000,
        completedGamesCount: 0,
        participantUids: participantUids ?? [],
        participantPlayerIds: participantPlayerIds ?? [], // ✅ NEU: Player Document IDs
        metadata: {},
        statistics: {
          gamesPlayed: 0,
          scores: { top: 0, bottom: 0 },
          weisCount: 0,
          stricheCount: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        },
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

    gameStore.resetGame(initialStartingPlayer, activeGameId, finalSettingsForGameStore);
    useGameStore.setState({ playerNames }); 

    const timerStore = useTimerStore.getState();
    timerStore.startJassTimer();
    timerStore.activateGameTimer(1);
    
    
    // ⏱️ RACE CONDITION FIX: Kurz warten bis Session-Dokument definitiv geschrieben ist
    setTimeout(() => {
      get().subscribeToSession(sessionId, groupId); // MODIFIZIERT

    }, 100); // 100ms Delay sollte ausreichen für Firestore Eventual Consistency
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
    // console.log(`[JassStore.startNextGame] Creating game ${nextGameId} with initialStartingPlayer=${initialStartingPlayer}, newActiveGameId=${newActiveGameId || 'none'}`);
    
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

    // KORREKTUR: Hole den *aktuellsten* State direkt vor der Verwendung!
    const latestState = get();
    if (!latestState.currentSession) {
      console.error("[JassStore.startNextGame] Kritischer Fehler: Keine currentSession gefunden. Breche ab.");
      return;
    }

    const settingsForNextGame = {
      farbeSettings: latestState.currentSession.currentFarbeSettings ?? DEFAULT_FARBE_SETTINGS,
      scoreSettings: latestState.currentSession.currentScoreSettings ?? DEFAULT_SCORE_SETTINGS,
      strokeSettings: latestState.currentSession.currentStrokeSettings ?? DEFAULT_STROKE_SETTINGS,
    };

    // console.log('[JassStore.startNextGame] Übergebe folgende Settings an resetGame:', {
    //   source: latestState.currentSession.currentFarbeSettings ? 'Session' : 'Default',
    //   cardStyle: settingsForNextGame.farbeSettings.cardStyle,
    //   siegPunkte: settingsForNextGame.scoreSettings.values.sieg,
    //   schneiderStriche: settingsForNextGame.strokeSettings.schneider
    // });

    gameStore.resetGame(initialStartingPlayer, newActiveGameId, settingsForNextGame);
    useGameStore.setState({ playerNames: latestState.currentSession.playerNames });

    // NEU: Re-synchronisiere die abgeschlossenen Spiele, wenn ein neues Spiel gestartet wird.
    if (state.currentSession?.id) {
      get().syncCompletedGamesForSession(state.currentSession.id);
    }

    // console.log(`[JassStore.startNextGame] Started game ${nextGameId}. New Active Game ID: ${newActiveGameId || 'none'}`);
  },

  finalizeGame: async () => {
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
      // ✅ KRITISCHER FIX: Verwende die roundHistory aus dem currentGame im jassStore
      // Diese wurde bereits durch syncWithJassStore aktualisiert
      roundHistory: currentGame.roundHistory || [],
      currentRound: gameStore.currentRound,
      currentPlayer: gameStore.currentPlayer,

      currentHistoryIndex: gameStore.currentHistoryIndex,
      historyState: gameStore.historyState,

      isGameStarted: gameStore.isGameStarted,
      isRoundCompleted: gameStore.isRoundCompleted,
      isGameCompleted: true,

      metadata: {
        duration: typeof finalDuration === 'number' ? finalDuration : 0,
        completedAt: Date.now(),
        roundStats: currentGame.metadata?.roundStats ?? {
          weisCount: 0,
          colorStats: {} as { [K in JassColor]: number },
        },
      },
    };

    // KRITISCHE ERGÄNZUNG: Firestore-Updates für Online-Spiele
    if (currentGame.activeGameId && state.currentSession?.id) {
      // 🚨 FIX: useUIStore Aufrufe VOR try-catch um Hook-Regel-Verstoß zu vermeiden
      const uiStore = useUIStore.getState();
      
      try {
        const db = getFirestore(firebaseApp);
        
        // 🔧 PERMISSION FIX: Robust error handling for activeGame update
        try {
          // 1. ActiveGame als "completed" markieren
          const activeGameRef = doc(db, 'activeGames', currentGame.activeGameId);
          await setDoc(activeGameRef, {
            status: 'completed',
            lastUpdated: serverTimestamp(),
          }, { merge: true });

        } catch (activeGameError: any) {
          if (activeGameError.code === 'permission-denied') {
            console.warn("[JassStore.finalizeGame] ⚠️ Permission-denied beim ActiveGame Update - möglicherweise bereits gelöscht oder User nicht berechtigt. Fahre fort ohne Fehler.");
          } else if (activeGameError.code === 'not-found') {
            console.warn("[JassStore.finalizeGame] ⚠️ ActiveGame nicht gefunden - bereits gelöscht. Fahre fort ohne Fehler.");
          } else {
            console.error("[JassStore.finalizeGame] ❌ Unerwarteter Fehler beim ActiveGame Update:", activeGameError);
            throw activeGameError; // Nur bei unerwarteten Fehlern weiterwerfen
          }
        }

        // ✅ REAKTIVIERT: Client-seitiger Schreibzugriff auf jassGameSummaries
        // Firestore Rules erlauben jetzt authentifizierten Teilnehmern das Schreiben
        try {
          // 🚨 FIX: Bestimme Rosen10player für das erste Spiel der Session
          let rosen10PlayerForGame: string | null = null;
          if (currentGame && typeof currentGame.id === 'number' && currentGame.id === 1) {
            // Erstes Spiel der Session - finde den ersten Trumpf-Ansager
            // ✅ KRITISCHER FIX: Verwende updatedGame.roundHistory statt gameStore.roundHistory
            const firstJassRound = updatedGame.roundHistory.find(round => 
              round.actionType === 'jass' && 'farbe' in round && round.farbe
            );
            if (firstJassRound && 'currentPlayer' in firstJassRound) {
              const playerNumber = firstJassRound.currentPlayer;
              const playerIndex = playerNumber - 1; // PlayerNumber ist 1-basiert, Array ist 0-basiert
              const participantPlayerIds = state.currentSession?.participantPlayerIds || [];
              if (participantPlayerIds[playerIndex]) {
                rosen10PlayerForGame = participantPlayerIds[playerIndex];
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[JassStore.finalizeGame] Rosen10player für Spiel 1: Player ${playerNumber} -> ID ${rosen10PlayerForGame}`);
                }
              }
            }
          }

          const completedGameData: CompletedGameSummary = {
            gameNumber: typeof currentGame.id === 'number' ? currentGame.id : parseInt(String(currentGame.id), 10),
            activeGameId: currentGame.activeGameId,
            timestampCompleted: serverTimestamp(),
            durationMillis: typeof finalDuration === 'number' ? finalDuration : 0,
            finalScores: gameStore.scores,
            finalStriche: gameStore.striche,
            // Temporärer Dummy-Wert für eventCounts, wird danach überschrieben
            eventCounts: { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
            weisPoints: gameStore.weisPoints,
            startingPlayer: currentGame.startingPlayer,
            initialStartingPlayer: currentGame.initialStartingPlayer,
            playerNames: gameStore.playerNames,
            trumpColorsPlayed: [],
            // ✅ KRITISCHER FIX: Verwende die roundHistory aus dem updatedGame
            // Diese enthält die vollständige History und wurde nicht durch einen Reset geleert
            roundHistory: updatedGame.roundHistory,
            participantUids: state.currentSession.participantUids || [],
            groupId: state.currentSession.gruppeId || null,
            Rosen10player: rosen10PlayerForGame, // ✅ HINZUGEFÜGT
          };

          // ✅ Echte eventCounts berechnen und zuweisen
          completedGameData.eventCounts = calculateEventCounts(completedGameData);

          // CompletedGames in Gruppenstruktur schreiben
          if (state.currentSession.gruppeId) {
            const completedGameRef = doc(db, 'groups', state.currentSession.gruppeId, 'jassGameSummaries', state.currentSession.id, 'completedGames', String(currentGame.id));
            await setDoc(completedGameRef, sanitizeDataForFirestore(completedGameData));
          } else {
            const completedGameRef = doc(db, 'jassGameSummaries', state.currentSession.id, 'completedGames', String(currentGame.id));
            await setDoc(completedGameRef, sanitizeDataForFirestore(completedGameData));
          }

        } catch (summaryError: any) {
          if (summaryError.code === 'permission-denied') {
            console.warn("[JassStore.finalizeGame] ⚠️ Permission-denied beim jassGameSummaries Schreibzugriff. User möglicherweise nicht in participantUids.");
          } else {
            console.error("[JassStore.finalizeGame] ❌ Fehler beim Speichern der Game Summary:", summaryError);
          }
          // Continue with other operations even if summary fails
        }

        // 🔧 PERMISSION FIX: Robust error handling for session update
        try {
          // 3. Session currentActiveGameId auf null setzen
          const sessionRef = doc(db, 'sessions', state.currentSession.id);
          await setDoc(sessionRef, {
            currentActiveGameId: null,
            lastUpdated: serverTimestamp(),
          }, { merge: true });
          if (process.env.NODE_ENV === 'development') {
            console.log("[JassStore.finalizeGame] Session activeGameId cleared");
          }
        } catch (sessionError: any) {
          if (sessionError.code === 'permission-denied') {
            console.warn("[JassStore.finalizeGame] ⚠️ Permission-denied beim Session Update - User möglicherweise nicht berechtigt. Fahre fort ohne Fehler.");
          } else {
            console.error("[JassStore.finalizeGame] ❌ Fehler beim Session Update:", sessionError);
            throw sessionError; // Bei Session-Fehlern weiterwerfen, da kritischer
          }
        }

      } catch (error) {
        console.error("[JassStore.finalizeGame] ❌ Firestore-Update fehlgeschlagen:", error);
        
        // 🔧 PERMISSION FIX: Differentiate between critical and non-critical errors
        if (error && typeof error === 'object' && 'code' in error) {
          const firebaseError = error as any;
          if (firebaseError.code === 'permission-denied') {
            console.warn("[JassStore.finalizeGame] ⚠️ Permission-Problem erkannt. Spiel wird lokal finalisiert, aber Firestore-Sync fehlgeschlagen.");
            uiStore.showNotification({
              type: "warning",
              message: "Spiel wurde lokal abgeschlossen, aber die Online-Synchronisation schlug fehl. Ihre Daten sind trotzdem sicher.",
            });
          } else {
            // Für andere Fehler zeige ursprüngliche Fehlermeldung
            uiStore.showNotification({
              type: "error",
              message: "Fehler beim Abschließen des Spiels. Bitte versuchen Sie es erneut.",
            });
          }
        } else {
          // Unbekannter Fehler
          uiStore.showNotification({
            type: "error",
            message: "Unerwarteter Fehler beim Abschließen des Spiels.",
          });
        }
      }
    }

    // Lokaler State-Update
    set((state) => ({
      games: state.games.map((game) =>
        game.id === currentGame.id ? updatedGame : game
      ),
    }));

    timerStore.completeGame();
  },

  resetJass: () => {
    get().sessionUnsubscribe?.(); 
    set({ ...initialJassState }); 
  },

  subscribeToSession: async (sessionId: string, groupId?: string | null) => { // MODIFIZIERT
    const existingUnsubscribe = get().sessionUnsubscribe;
    if (existingUnsubscribe) {
      existingUnsubscribe();
    }
    
    const db = getFirestore(firebaseApp);
    
    // Sessions bleiben in globaler Struktur (temporäre Daten)
    const sessionDocRef = doc(db, 'sessions', sessionId);

    const unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const sessionData = docSnap.data();
        
        // KRITISCH: Wenn Session-Einstellungen vorhanden sind, aktualisiere SOFORT den gameStore
        if (sessionData.currentFarbeSettings && sessionData.currentScoreSettings && sessionData.currentStrokeSettings) {
          const gameStore = useGameStore.getState();
          
          // SOFORTIGE Aktualisierung der gameStore-Settings
          gameStore.setGameSettings({
            farbeSettings: sessionData.currentFarbeSettings,
            scoreSettings: sessionData.currentScoreSettings,
            strokeSettings: sessionData.currentStrokeSettings,
          });
          

        } else {
          // ℹ️ INFO: Session-Dokument könnte noch nicht vollständig propagiert sein
          if (process.env.NODE_ENV === 'development') {
            console.info("[jassStore] ℹ️ Session-Dokument hat noch unvollständige Settings (möglicherweise noch nicht propagiert):", {
            hasFarbeSettings: !!sessionData.currentFarbeSettings,
            hasScoreSettings: !!sessionData.currentScoreSettings,
            hasStrokeSettings: !!sessionData.currentStrokeSettings
          });
          }
        }
        
        // 🔥 KRITISCHER FIX: participantPlayerIds vor dem Update erfassen
        const currentState = get();
        const preservedParticipantPlayerIds = sessionData.participantPlayerIds ?? currentState.currentSession?.participantPlayerIds ?? [];

        // Aktualisiere den gesamten relevanten State aus dem Session-Dokument
        set(state => ({
          ...state,
          activeGameId: sessionData.currentActiveGameId ?? null, // 🔥 KRITISCHER FIX!
          jassSessionId: sessionData.id ?? state.jassSessionId,
          currentSession: { 
            ...state.currentSession, 
            ...sessionData,
            id: sessionData.id ?? state.currentSession?.id,
            // 🔥 KRITISCHER FIX: participantPlayerIds niemals verlieren!
            participantPlayerIds: preservedParticipantPlayerIds,
            // Stelle sicher, dass die Settings auch in der currentSession sind
            currentFarbeSettings: sessionData.currentFarbeSettings,
            currentScoreSettings: sessionData.currentScoreSettings,
            currentStrokeSettings: sessionData.currentStrokeSettings,
          } as JassSession
        }));


      } else {
        // ✅ Logs aufgeräumt: Session-Dokument-Warnung nur für normale Sessions (nicht Turniere)
        if (!sessionId.startsWith('tournament_')) {
          console.warn(`[jassStore] Session-Dokument ${sessionId} nicht gefunden.`);
        }
      }
    }, (error) => {
       console.error(`[jassStore] Fehler im Session-Listener für ${sessionId}:`, error);
    });
    
    set({ sessionUnsubscribe: unsubscribe });

    // Lade abgeschlossene Spiele, wenn eine Session abonniert wird.
    get().syncCompletedGamesForSession(sessionId);
  },

  syncCompletedGamesForSession: (sessionId: string) => {
    const { completedGamesUnsubscribe } = get();
    if (completedGamesUnsubscribe) {
      completedGamesUnsubscribe();
    }

    const unsubscribe = loadCompletedGamesFromFirestore(sessionId, (games) => {
      set({ onlineCompletedGames: games });
    });

    set({ completedGamesUnsubscribe: unsubscribe });
  },

  clearActiveGameForSession: (sessionId: string) => {
    set((state) => {
      if (state.currentSession && state.currentSession.id === sessionId) {
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

export const useJassStore = create<JassStore>()(
  persist(
    createJassStore,
    {
      name: 'jass-storage',
      version: 1, // NEU: Version 0 -> 1 (wegen matschBonus in currentSession.currentScoreSettings)
      migrate: (persistedState, version) => {
        if (version === 0) {
          const typedState = persistedState as any;
          if (
            typedState?.currentSession?.currentScoreSettings &&
            typeof typedState.currentSession.currentScoreSettings.matschBonus === 'undefined'
          ) {
            console.log('🔄 Migrating jassStore state v0 to v1: Adding matschBonus to currentSession');
            typedState.currentSession.currentScoreSettings.matschBonus = true;
          }
        }
        return persistedState;
      },
      partialize: (state) => ({
        games: state.games,
        currentSession: state.currentSession,
        currentGameId: state.currentGameId,
        jassSessionId: state.jassSessionId,
        isJassStarted: state.isJassStarted,
      }),
    }
  )
);
