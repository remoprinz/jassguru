import {useGameStore, type GameStore} from "./gameStore";
import {useJassStore} from "./jassStore";
import {useTimerStore} from "./timerStore";
import type {
  GameState,
  GameUpdate,
  JassStore,
  JassState,
} from "../types/jass";

interface UpdateOptions {
  updateJassStore?: boolean;
  updateTimerStore?: boolean;
  backupToFirebase?: boolean;
}

// Aktualisierter Typ - verwenden wir GameStore statt GameState
type StoreUpdater = (state: GameStore) => Partial<GameState>;

// Memoization für Store-Zugriffe
const createStoreCache = () => {
  // Verwenden wir GameStore statt GameState
  let gameStore: GameStore | null = null;
  let jassStateCache: JassState | null = null;

  return {
    getGameStore: () => {
      if (!gameStore) gameStore = useGameStore.getState();
      return gameStore;
    },
    getJassState: () => {
      if (!jassStateCache) jassStateCache = useJassStore.getState();
      return jassStateCache;
    },
    invalidate: () => {
      gameStore = null;
      jassStateCache = null;
    },
  };
};

const storeCache = createStoreCache();

const createOptimizedUpdates = (
  gameStateUpdate: Partial<GameState>
): GameUpdate => {
  const updates: GameUpdate = {};

  // Teams-Update
  if ("scores" in gameStateUpdate || "striche" in gameStateUpdate) {
    updates.teams = {
      top: {
        total: gameStateUpdate.scores?.top,
        striche: gameStateUpdate.striche?.top,
      },
      bottom: {
        total: gameStateUpdate.scores?.bottom,
        striche: gameStateUpdate.striche?.bottom,
      },
    };
  }

  // Direkte Updates
  if ("roundHistory" in gameStateUpdate) updates.roundHistory = gameStateUpdate.roundHistory;
  if ("currentRound" in gameStateUpdate) updates.currentRound = gameStateUpdate.currentRound;
  if ("currentPlayer" in gameStateUpdate) updates.currentPlayer = gameStateUpdate.currentPlayer;
  if ("currentHistoryIndex" in gameStateUpdate) updates.currentHistoryIndex = gameStateUpdate.currentHistoryIndex;
  if ("historyState" in gameStateUpdate) updates.historyState = gameStateUpdate.historyState;
  if ("isGameStarted" in gameStateUpdate) updates.isGameStarted = gameStateUpdate.isGameStarted;
  if ("isRoundCompleted" in gameStateUpdate) updates.isRoundCompleted = gameStateUpdate.isRoundCompleted;
  if ("isGameCompleted" in gameStateUpdate) updates.isGameCompleted = gameStateUpdate.isGameCompleted;

  return updates;
};

const safeUpdateManager = {
  update: async (updater: StoreUpdater, options: UpdateOptions = {}) => {
    const {
      updateJassStore = true,
      updateTimerStore = false,
      backupToFirebase = false,
    } = options;

    const gameStore = storeCache.getGameStore();
    if (!gameStore) {
      console.error("safeUpdateManager: gameStore ist null!");
      return;
    }
    
    const gameStateUpdate = updater(gameStore);

    // GameStore Update
    useGameStore.setState(gameStateUpdate);

    // JassStore Update
    if (updateJassStore) {
      const jassStoreActions = useJassStore.getState();
      const optimizedUpdates = createOptimizedUpdates(gameStateUpdate);
      if (jassStoreActions.updateCurrentGame) {
        jassStoreActions.updateCurrentGame(optimizedUpdates);
      } else {
        console.error("safeUpdateManager: jassStoreActions.updateCurrentGame ist nicht definiert!");
      }
    }

    // Timer Update
    if (updateTimerStore) {
      const timerStore = useTimerStore.getState();
      timerStore.resetRoundTimer();
      timerStore.startRoundTimer();
    }

    // Firebase Backup
    if (backupToFirebase) {
      const jassStoreActions = useJassStore.getState();
      if (jassStoreActions.saveSession) {
        await jassStoreActions.saveSession();
      } else {
        console.error("safeUpdateManager: jassStoreActions.saveSession ist nicht definiert!");
      }
    }

    // Cache invalidieren
    storeCache.invalidate();
  },
};

export default safeUpdateManager;
