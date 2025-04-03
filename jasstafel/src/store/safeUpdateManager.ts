import {useGameStore} from "./gameStore";
import {useJassStore} from "./jassStore";
import {useTimerStore} from "./timerStore";
import type {
  GameState,
  GameUpdate,
  JassStore,
} from "../types/jass";

interface UpdateOptions {
  updateJassStore?: boolean;
  updateTimerStore?: boolean;
  backupToFirebase?: boolean;
}

type StoreUpdater = (state: GameState) => Partial<GameState>;

// Memoization für Store-Zugriffe
const createStoreCache = () => {
  let gameStore: GameState | null = null;
  let jassStore: JassStore | null = null; // JassStore statt JassState

  return {
    getGameStore: () => {
      if (!gameStore) gameStore = useGameStore.getState();
      return gameStore;
    },
    getJassStore: () => {
      if (!jassStore) jassStore = useJassStore.getState();
      return jassStore;
    },
    invalidate: () => {
      gameStore = null;
      jassStore = null;
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
    const gameStateUpdate = updater(gameStore);

    // GameStore Update
    useGameStore.setState(gameStateUpdate);

    // JassStore Update
    if (updateJassStore) {
      const jassStore = storeCache.getJassStore();
      const optimizedUpdates = createOptimizedUpdates(gameStateUpdate);
      jassStore.updateCurrentGame(optimizedUpdates);
    }

    // Timer Update
    if (updateTimerStore) {
      const timerStore = useTimerStore.getState();
      timerStore.resetRoundTimer();
      timerStore.startRoundTimer();
    }

    // Firebase Backup
    if (backupToFirebase) {
      const jassStore = storeCache.getJassStore();
      await jassStore.saveSession();
    }

    // Cache invalidieren
    storeCache.invalidate();
  },
};

export default safeUpdateManager;
