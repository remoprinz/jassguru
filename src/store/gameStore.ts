// src/store/gameStore.ts

import {create} from "zustand";
import {useJassStore} from "./jassStore";
import {calculateStricheCounts} from "../game/scoreCalculations";
import {
  RoundEntry,
  isJassRoundEntry,
  getNextPlayer,
  type GamePlayers,
  type GameState as GameStateOriginal, // Original umbenennen
  type ScoreSettings,

  TeamPosition,
  PlayerNumber,
  PlayerNames,
  TeamScores,
  StrichTyp,
  StricheRecord,
  JassColor,
  // GameStore, // Alte GameStore-Typ wird unten neu definiert
  WeisRoundEntry,
  JassRoundEntry,
  CardStyle,
  WeisAction,
  StricheState,
  HistoryState,
  FarbeSettings,
  StrokeSettings,
  createInitialHistoryState,
  GameUpdate,
 ActiveGame, RoundDataFirebase } from "../types/jass";
import {useUIStore} from "./uiStore";
import {HISTORY_WARNING_MESSAGE} from "../components/notifications/HistoryWarnings";
import {useTimerStore} from "./timerStore";
import {STRICH_WERTE, DEFAULT_STROKE_SETTINGS} from "../config/GameSettings";
import {CARD_SYMBOL_MAPPINGS} from "../config/CardStyles";
import {DEFAULT_FARBE_SETTINGS} from "../config/FarbeSettings";
import {DEFAULT_SCORE_SETTINGS} from "../config/ScoreSettings";
import {useGroupStore} from "./groupStore";
import { useTournamentStore } from './tournamentStore'; // NEU
import { firebaseApp } from '@/services/firebaseInit';
import { getFirestore, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { updateActiveGame } from "../services/gameService";
import { sanitizeDataForFirestore } from '@/utils/firestoreUtils';
import { devtools } from 'zustand/middleware';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { v4 as uuidv4 } from 'uuid';

// NEU: GameState erweitern, um null für activeGameId zu erlauben
export type GameState = Omit<GameStateOriginal, 'activeGameId'> & {
  activeGameId: string | null | undefined;
};

// Define the global API type
interface FirestoreSyncApi {
  markLocalUpdate: (() => void) | null;
}

// Extend the Window interface
declare global {
  interface Window {
    __FIRESTORE_SYNC_API__?: FirestoreSyncApi;
  }
}

// Definiere den GameStore Typ neu, um die neue Signatur von finalizeRound zu berücksichtigen
// Diese Definition ersetzt die vorherige GameStore Typ-Importierung oder -Definition.
export type GameStore = GameState & {
  startGame: (gamePlayers: GamePlayers | null, initialStartingPlayer: PlayerNumber) => void;
  startRound: () => void;
  finalizeRound: (
    punkte: { top: number; bottom: number },
    strichInfo?: { type: 'matsch' | 'kontermatsch'; team: TeamPosition }
  ) => void;
  updateScore: (team: TeamPosition, score: number, opponentScore: number) => void;
  addStrich: (team: TeamPosition, type: StrichTyp) => void;
  addWeisPoints: (team: TeamPosition, points: number) => void;
  undoLastWeis: () => void;
  finalizeGame: () => void;
  resetGame: (
    nextStarter: PlayerNumber,
    newActiveGameId?: string,
    initialSettings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
  ) => void;
  resetGamePoints: () => void;
  setScore: (team: TeamPosition, score: number) => void;
  setPlayerNames: (names: PlayerNames) => void;
  updateScoreByStrich: (position: TeamPosition, points: number) => void;
  getVisualStriche: (position: TeamPosition) => { stricheCounts: Record<string, number>; restZahl: number };
  navigateHistory: (direction: "forward" | "backward") => void;
  canNavigateForward: () => boolean;
  canNavigateBackward: () => boolean;
  jumpToLatest: () => void;
  syncHistoryState: (entry: RoundEntry) => void;
  logGameHistory: () => Array<object>;
  restoreRoundState: (entry: RoundEntry) => void;
  isBergActive: (team: TeamPosition) => boolean;
  isSiegActive: (team: TeamPosition) => boolean;
  addBerg: (team: TeamPosition) => void;
  addSieg: (team: TeamPosition) => void;
  addSchneider: (team: TeamPosition) => void;
  addMatsch: (team: TeamPosition) => void;
  getTotalStriche: (team: TeamPosition) => number;
  completeRound: () => void;
  addKontermatsch: (team: TeamPosition) => void;
  getPlayerName: (playerNumber: PlayerNumber) => string;
  resetGameState: (options?: { 
    newActiveGameId?: string | null | undefined; 
    nextStarter?: PlayerNumber;
    settings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
  }) => void;
  rebuildStateFromHistory: (index: number) => void;
  setPlayers: (newPlayers: PlayerNames) => void;
  setGameSettings: (settings: { 
    farbeSettings?: FarbeSettings, 
    scoreSettings?: ScoreSettings, 
    strokeSettings?: StrokeSettings 
  }) => void;
  showHistoryWarning: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  validateHistoryAction: () => boolean;
  // NEU: Funktion zum Setzen der aktuellen Spielfarbe
  setFarbe: (farbe: JassColor | undefined) => void;
};


const db = getFirestore(firebaseApp);

// Hilfsfunktion für die Farbenübersetzung (vereinfacht)
const getDBFarbe = (farbe: JassColor, cardStyle: CardStyle): string => {
  return CARD_SYMBOL_MAPPINGS[farbe][cardStyle];
};

// Hilfsfunktion für Farbe (am Anfang der Datei, nach den Imports)
const getFarbe = (entry: RoundEntry): JassColor | undefined => {
  return isJassRoundEntry(entry) ? entry.farbe : undefined;
};

// Explizite Typ-Initialisierungen
const initialTeamScores: TeamScores = {top: 0, bottom: 0};

const initialStricheRecord: StricheRecord = {
  berg: 0,
  sieg: 0,
  matsch: 0,
  schneider: 0,
  kontermatsch: 0,
};

// Explizite Verwendung von StrichTyp
const validStrichTypes: StrichTyp[] = ["berg", "sieg", "matsch", "schneider", "kontermatsch"];


const initialPlayerNames: PlayerNames = {
  1: "",
  2: "",
  3: "",
  4: "",
};

const calculateTotalScores = (weis: TeamScores, jass: TeamScores): TeamScores => ({
  top: weis.top + jass.top,
  bottom: weis.bottom + jass.bottom,
  weisPoints: weis,
});

// HIER den Rückgabetyp explizit als GameState definieren
const createInitialStateLocal = (
  initialPlayer: PlayerNumber,
  initialSettings?: {
    farbeSettings?: FarbeSettings;
    scoreSettings?: ScoreSettings;
    strokeSettings?: StrokeSettings;
  }
): GameState => ({
  activeGameId: undefined,
  currentPlayer: initialPlayer,
  startingPlayer: initialPlayer,
  initialStartingPlayer: initialPlayer,
  isGameStarted: false,
  currentRound: 1,
  weisPoints: {top: 0, bottom: 0},
  jassPoints: {top: 0, bottom: 0},
  scores: {top: 0, bottom: 0},
  striche: {
    top: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
    bottom: {berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0},
  },
  roundHistory: [],
  currentRoundWeis: [],
  isGameCompleted: false,
  isRoundCompleted: false,
  // Verwende übergebene Einstellungen oder Defaults
  scoreSettings: initialSettings?.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
  farbeSettings: initialSettings?.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
  strokeSettings: initialSettings?.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
  playerNames: initialPlayerNames, // initialPlayerNames ist eine globale Konstante hier
  gamePlayers: null,
  currentHistoryIndex: -1,
  historyState: createInitialHistoryState(),
  // NEU: Aktuelle Spielfarbe hinzufügen
  farbe: undefined,
});

// Hilfsfunktionen für die History
const createRoundEntry = (
  state: GameState,
  get: () => GameStore,
  type: "weis" | "jass",
  startingPlayerOfRound: PlayerNumber,
  options?: {
    farbe?: JassColor;
    strichInfo?: { team: TeamPosition; type: StrichTyp };
    strichType?: StrichTyp;
    cardStyle?: CardStyle
  }
): RoundEntry => {
  const {settings} = useUIStore.getState();
  const cardStyle = options?.cardStyle || settings.cardStyle;
  const nowMillis = Date.now(); // NEU: Zeitstempel holen

  // NEU: Spielername extrahieren über etablierte Hierarchie
  const startingPlayerName = state.gamePlayers?.[startingPlayerOfRound]?.name || 
                            state.playerNames[startingPlayerOfRound] || 
                            `Spieler ${startingPlayerOfRound}`;

  // Berechne previousRoundId basierend auf der logischen Vorgänger-Runde
  let previousRoundIdValue: number | undefined = undefined;
  
  // Wenn wir eine history haben und nicht in Runde 1 sind
  if (state.roundHistory.length > 0) {
    if (state.currentHistoryIndex >= 0) {
      // Verwende die aktuelle Position in der History als Vorgänger
      previousRoundIdValue = state.roundHistory[state.currentHistoryIndex]?.roundId;
    }
  }

  // NEU: Informationen für Zeitmessung extrahieren
  const prevRound = state.roundHistory[state.currentHistoryIndex];
  const prevRoundTimestamp = prevRound ? prevRound.timestamp : undefined;
  
  // NEU: Spieler-Turn für den aktuellen Spieler erstellen
  const playerTurns: Array<{player: PlayerNumber; startTime: number; endTime: number}> = [];
  if (state.currentPlayer) {
    playerTurns.push({
      player: state.currentPlayer,
      startTime: prevRoundTimestamp || (nowMillis - 5000), // Fallback: 5 Sekunden vorher
      endTime: nowMillis
    });
  }

  const baseEntry: any = {
    id: `${nowMillis}-${Math.random().toString(36).substr(2, 9)}`, // ID könnte auch Timestamp nutzen
    timestamp: nowMillis, // Nur Millisekunden speichern
    roundId: nowMillis, // NEU: ID ist jetzt der Timestamp
    startingPlayer: startingPlayerOfRound,
    startingPlayerName: startingPlayerName, // NEU: Spielername hinzufügen
    weisPoints: {...state.weisPoints},
    jassPoints: {...state.jassPoints},
    scores: {...state.scores},
    // --- FIX: Fallback für undefined currentRoundWeis ---
    weisActions: [...(state.currentRoundWeis ?? [])], // Füge ?? [] hinzu
    // --- ENDE FIX ---
    currentPlayer: state.currentPlayer,
    isActive: true,
    visualStriche: {
      top: get().getVisualStriche("top"),
      bottom: get().getVisualStriche("bottom"),
    },
    previousRoundId: previousRoundIdValue,
    nextRoundId: undefined,
    roundState: {
      // Die tatsächliche Rundennummer im Spiel, unabhängig von roundId 
      roundNumber: state.currentRound,
      nextPlayer: state.currentPlayer,
    },
    striche: {
      top: {...state.striche.top},
      bottom: {...state.striche.bottom},
    },
    // NEU: Zeiterfassung
    startTime: prevRoundTimestamp || (nowMillis - 5000), // Fallback: 5 Sekunden vorher
    endTime: nowMillis,
    playerTurns: playerTurns
  };

  if (type === "weis") {
    return {
      ...baseEntry,
      actionType: "weis",
      isRoundFinalized: false,
      isCompleted: false,
    } as WeisRoundEntry;
  }

  // Bei Jass-Runden die übersetzte Farbe verwenden und strichInfo prüfen
  const jassEntryData: any = {
    ...baseEntry,
    actionType: "jass",
    isRoundFinalized: true,
    isCompleted: true,
    farbe: options?.farbe,
    cardStyle: cardStyle
  };

  // Füge strichInfo hinzu, wenn in Optionen vorhanden
  if (options?.strichInfo) {
    jassEntryData.strichInfo = options.strichInfo;
  } 
  // Alternativ: strichType direkt verwenden, wenn vorhanden
  else if (options?.strichType) {
    jassEntryData.strichType = options.strichType;
  }

  return jassEntryData as JassRoundEntry;
};

const validateScore = (score: number): number => Math.max(0, score);

// Konstanten für die Navigation
const NAVIGATION_COOLDOWN = 300; // 300ms Cooldown zwischen Navigationen

// Typ für die Navigationsrichtung
type NavigationDirection = "forward" | "backward";

// Hilfsfunktion für die Navigation
const calculateNewIndex = (
  currentIndex: number,
  direction: NavigationDirection,
  historyLength: number
): number => {
  const newIndex = direction === "forward" ?
    currentIndex + 1 :
    currentIndex - 1;

  // Boundary check
  return Math.min(Math.max(0, newIndex), historyLength - 1);
};

// Neue Hilfsfunktion für History-Management
const truncateFutureAndAddEntry = (state: GameState, newEntry: RoundEntry): Partial<GameState> => {
  const currentIndex = state.currentHistoryIndex;
  const newHistory = state.roundHistory.slice(0, currentIndex + 1);
  const updatedHistory = [...newHistory, newEntry];

  // NEU: Wenn wir Einträge abschneiden und im Online-Modus sind
  const removedEntries = state.roundHistory.slice(currentIndex + 1);
  if (removedEntries.length > 0 && state.activeGameId) {
    // KORREKTUR: Deaktiviere nur die tatsächlich entfernten Einträge
    const roundIdsToDeactivate = removedEntries.map(entry => entry.roundId).filter(id => id !== undefined) as number[];
    
    if (roundIdsToDeactivate.length > 0) {
      console.log(`[truncateFutureAndAddEntry] ${roundIdsToDeactivate.length} Einträge (IDs: ${roundIdsToDeactivate.join(', ')}) werden in Firestore als inaktiv markiert`);
      setTimeout(() => {
        // KORREKTUR: Verwende markRoundsAsInactive statt markAllFollowingRoundsAsInactive
        import('../services/gameService').then(({ markRoundsAsInactive }) => {
          markRoundsAsInactive(state.activeGameId!, roundIdsToDeactivate)
          .catch(error => console.error("[GameStore] Fehler beim Deaktivieren der überschriebenen Runden:", error));
      });
      }, 0);
    } else {
        console.log("[truncateFutureAndAddEntry] Keine gültigen roundIds zum Deaktivieren gefunden.");
    }
  }

  // Begrenze die Größe der lokalen Historie
  if (updatedHistory.length > MAX_HISTORY_SIZE) {
    updatedHistory.splice(0, updatedHistory.length - MAX_HISTORY_SIZE);
  }

  // KORREKTUR: Gebe das Ergebnis zurück
  return {
    roundHistory: updatedHistory,
    currentHistoryIndex: updatedHistory.length - 1,
  };
};

// Neue Helper-Funktion für einheitliches Logging
const logRoundDetails = (
  state: GameState,
  farbe: JassColor | undefined,
  score: number,
  opponentScore: number,
  strichType?: StrichTyp,
  team?: TeamPosition
) => {
  // Aktuelle Runde direkt aus dem Store
  const currentRoundId = state.currentRound;

  // Aktueller Spieler direkt aus dem Store
  const currentPlayer = state.currentPlayer;

  // Punkte dieser Runde
  const currentRoundPoints = {
    top: team === "top" ? score : opponentScore,
    bottom: team === "bottom" ? score : opponentScore,
  };

  console.group("🎲 Runden-Details:");
  console.log({
    // Runde aus dem Store (NICHT erhöhen!)
    nummer: `Runde ${currentRoundId}`,

    // Spieler aus dem Store
    spieler: state.playerNames[currentPlayer] || `Spieler ${currentPlayer}`,

    // Farbe und Strich-Typ
    ...(farbe && {farbe}),
    ...(strichType && {strichTyp: strichType}),
    ...(team && {team}),

    // Punkte-Details
    punkte: {
      dieseRunde: currentRoundPoints,
      weis: {
        top: state.weisPoints.top,
        bottom: state.weisPoints.bottom,
        aktuelleRunde: state.currentRoundWeis,
      },
      total: state.jassPoints,
    },

    // Aktuelle Weis-Aktionen
    weis: state.currentRoundWeis,

    // Aktueller Striche-Stand
    striche: state.striche,
  });

  // History-Log mit allen Details
  console.log("Gesamter Spielverlauf:", state.roundHistory.map((entry) => ({
    roundId: entry.roundId,
    farbe: isJassRoundEntry(entry) ? entry.farbe : undefined,
    strichInfo: isJassRoundEntry(entry) ? entry.strichInfo : undefined,
    timestamp: new Date(entry.timestamp).toLocaleString("de-CH"),
    currentPlayer: entry.currentPlayer,
    points: {
      top: entry.jassPoints.top,
      bottom: entry.jassPoints.bottom,
    },
    weisPoints: {
      top: entry.weisPoints.top,
      bottom: entry.weisPoints.bottom,
    },
    totalPoints: {
      top: entry.scores.top,
      bottom: entry.scores.bottom,
    },
  })));

  console.groupEnd();
};

// Hilfsfunktion für die Konvertierung (NEU)
const convertVisualToStriche = (
  visualStriche: {
    top: { stricheCounts: Record<string, number>; restZahl: number };
    bottom: { stricheCounts: Record<string, number>; restZahl: number };
  }
): Record<TeamPosition, StricheRecord> => {
  // Wir müssen die tatsächlichen Striche aus dem visualStriche-Objekt extrahieren
  return {
    top: {
      berg: visualStriche.top.stricheCounts["berg"] || 0,
      sieg: visualStriche.top.stricheCounts["sieg"] || 0,
      matsch: visualStriche.top.stricheCounts["matsch"] || 0,
      schneider: visualStriche.top.stricheCounts["schneider"] || 0,
      kontermatsch: visualStriche.top.stricheCounts["kontermatsch"] || 0,
    },
    bottom: {
      berg: visualStriche.bottom.stricheCounts["berg"] || 0,
      sieg: visualStriche.bottom.stricheCounts["sieg"] || 0,
      matsch: visualStriche.bottom.stricheCounts["matsch"] || 0,
      schneider: visualStriche.bottom.stricheCounts["schneider"] || 0,
      kontermatsch: visualStriche.bottom.stricheCounts["kontermatsch"] || 0,
    },
  };
};

// Neue Hilfsfunktion für bessere Lesbarkeit
const isLatestState = (index: number, history: RoundEntry[]): boolean => {
  return index === history.length;
};

// Neue Hilfsfunktion für die Extraktion des States aus einem Entry
const extractStateFromEntry = (entry: RoundEntry | null, initialStateProvider: () => GameState): Partial<GameState> => {
  if (!entry) {
    // Fallback auf den initialen Zustand des Spiels
    const initialState = initialStateProvider();
    return {
      currentRound: 1,
      currentPlayer: initialState.initialStartingPlayer,
      weisPoints: { top: 0, bottom: 0 },
      jassPoints: { top: 0, bottom: 0 },
      scores: { top: 0, bottom: 0 },
      striche: {
        top: { ...initialStricheRecord },
        bottom: { ...initialStricheRecord },
      },
      currentRoundWeis: [],
      isRoundCompleted: false,
    };
  }

  return {
  currentRound: entry.roundState.roundNumber,
    currentPlayer: entry.roundState.nextPlayer,
    // NEU: Auch den startingPlayer aus dem Eintrag wiederherstellen
    startingPlayer: entry.startingPlayer, 
    weisPoints: entry.weisPoints ?? { top: 0, bottom: 0 },
    jassPoints: entry.jassPoints ?? { top: 0, bottom: 0 },
    scores: entry.scores,
    striche: entry.striche,
    currentRoundWeis: entry.weisActions ?? [],
    isRoundCompleted: entry.isCompleted, // Vereinfacht: isCompleted ist auf beiden Typen vorhanden
  };
};

// Neue Hilfsfunktionen für bessere Lesbarkeit
const getActiveStrichTeam = (
  state: GameState,
  type: StrichTyp // NEU: Verwenden wir den StrichTyp aus jass.ts
) => {
  if (state.striche.top[type] > 0) return "top";
  if (state.striche.bottom[type] > 0) return "bottom";
  return undefined;
};

// Neue Hilfsfunktion für die Berechnung der Gesamtstriche
const calculateTotalStriche = (striche: StricheRecord): number => {
  return Object.values(striche).reduce((sum, count) => sum + count, 0);
};

// Hilfsfunktion für die Synchronisation mit dem JassStore
const syncWithJassStore = (stateOfCompletedRound: GameState) => { // Parameter renamed for clarity
  const jassStore = useJassStore.getState();
  const currentGame = jassStore.getCurrentGame();
  if (!currentGame) return;

  // Calculate the Weis points from THIS specific completed round
  const roundWeisPoints = stateOfCompletedRound.weisPoints; // This is currentRoundWeisSum

  jassStore.updateCurrentGame({
    teams: {
      top: {
        ...currentGame.teams.top,
        striche: stateOfCompletedRound.striche.top,
        jassPoints: stateOfCompletedRound.scores.top, // This is total score up to this round
        // Accumulate Weis points
        weisPoints: (currentGame.teams.top.weisPoints || 0) + (roundWeisPoints?.top || 0),
        total: stateOfCompletedRound.scores.top,
      },
      bottom: {
        ...currentGame.teams.bottom,
        striche: stateOfCompletedRound.striche.bottom,
        jassPoints: stateOfCompletedRound.scores.bottom, // Total score up to this round
        // Accumulate Weis points
        weisPoints: (currentGame.teams.bottom.weisPoints || 0) + (roundWeisPoints?.bottom || 0),
        total: stateOfCompletedRound.scores.bottom,
      },
    },
    roundHistory: stateOfCompletedRound.roundHistory, // The full history up to and including this round
    currentRound: stateOfCompletedRound.currentRound + 1, // Next round number for jassStore context
    currentPlayer: stateOfCompletedRound.currentPlayer, // Next player for jassStore context
  });
};

// === NEU: Konstante definieren ===
const MAX_HISTORY_SIZE = 50;
// === ENDE NEU ===

export const useGameStore = create<GameStore>()(devtools(
  (set, get) => ({
    // Initial State
  ...createInitialStateLocal(1), 
    gamePlayers: null,
    playerNames: {1: "Spieler 1", 2: "Spieler 2", 3: "Spieler 3", 4: "Spieler 4"},
    scoreSettings: DEFAULT_SCORE_SETTINGS,
    farbeSettings: DEFAULT_FARBE_SETTINGS,
    strokeSettings: DEFAULT_STROKE_SETTINGS,
    activeGameId: undefined,
    // nextRoundFirestoreId: 1, // ENTFERNT

    // Actions
    startGame: (gamePlayers, initialStartingPlayer) => {
      console.log("🚀 [GameStore] startGame called (wird ggf. durch resetGame abgelöst)", { initialStartingPlayer, gamePlayers, activeGameId: get().activeGameId });
      // Diese Funktion wird ggf. seltener direkt genutzt, wenn resetGame die Hauptinitialisierung übernimmt.
      // Für den Moment belassen wir sie, aber stellen sicher, dass sie die Settings korrekt handhabt oder resetGame nutzt.
      set((state) => {
        const newState = {
          ...createInitialStateLocal(initialStartingPlayer, {
            // Hier könnten die aktuellen state.scoreSettings etc. übergeben werden, wenn sie beibehalten werden sollen
            // oder man verlässt sich darauf, dass resetGame von außen mit spezifischen Settings gerufen wird.
            scoreSettings: state.scoreSettings,
            farbeSettings: state.farbeSettings,
            strokeSettings: state.strokeSettings,
          }),
          playerNames: state.playerNames, 
          gamePlayers: gamePlayers,
          activeGameId: state.activeGameId, 
          isGameStarted: true, 
        };
        const syncApi = window.__FIRESTORE_SYNC_API__;
        if (syncApi?.markLocalUpdate) syncApi.markLocalUpdate();
        return newState;
      });
      useTimerStore.getState().startGameTimer();
  },

  startRound: () => {
    const state = get();
    const timerStore = useTimerStore.getState();

    // Wenn es die erste Runde ist, starten wir den Spiel-Timer
    if (state.currentRound === 1) {
      timerStore.startGameTimer();
    }

    // Neuen Timer für diese Runde starten
    timerStore.startRoundTimer();

    set(() => ({
      isRoundCompleted: false,
      farbe: undefined,
      currentRoundWeis: [],
      weisPoints: { top: 0, bottom: 0 }, // NEU: Weispunkte beim Rundenstart zurücksetzen
    }));
  },

  finalizeRound: (
    punkte: { top: number; bottom: number },
    strichInfo?: { type: 'matsch' | 'kontermatsch'; team: TeamPosition }
  ) => {
    const timerStore = useTimerStore.getState();
    const initialActiveGameId = get().activeGameId; // Hole ID vor dem 'set'

    const settingsFromUIStore = useUIStore.getState().settings; // Expliziter Name für Klarheit
    const isFinalizingLatest = get().validateHistoryAction();

    timerStore.resetRoundTimer();
    timerStore.startRoundTimer();

    let finalState: GameState | null = null;
    let savedRoundEntryForFirestore: RoundEntry | null = null;
    let stateForJassStoreSyncInternal: GameState | null = null; // Variable für den Sync-State

    set((state) => {
      // << NEUES LOGGING 2: Zustand VOR Modifikation im set-Block >> // LOG ENTFERNT
      // console.log(`[GameStore finalizeRound DEBUG 2 - VOR Modifikation im set]`, { /* ... */ }); // LOG ENTFERNT
      // << ENDE LOGGING 2 >> // LOG ENTFERNT

      // console.log("[GameStore] finalizeRound: Zustand VOR Update (innerhalb set):", JSON.parse(JSON.stringify(state))); // LOG ENTFERNT
      
      // --- KORREKTUR: activeStrokeSettings und activeScoreSettings verwenden ---
      const { currentGroup } = useGroupStore.getState();
      const uiStoreDirectSettings = useUIStore.getState(); // Für den Fall, dass groupStore nicht vollständig ist
      
      const activeStrokeSettings = state.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
      const activeScoreSettings = state.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
      // --- ENDE KORREKTUR ---
      
      // const {activeGameId} = state; // DIESE ZEILE NICHT MEHR VERWENDEN für die ID dieser Runde
      
      const actualStarterOfFinalizedRound = state.currentPlayer; 
      // console.log(`[GameStore] finalizeRound: actualStarterOfFinalizedRound=${actualStarterOfFinalizedRound}`); // LOG ENTFERNT
      
      const entryBeforeFinalize = state.currentHistoryIndex >= 0 ? state.roundHistory[state.currentHistoryIndex] : null;
      const previousScores = entryBeforeFinalize ? entryBeforeFinalize.scores : { top: 0, bottom: 0 };
      const roundNumberForEntry = state.currentRound + 1;
      // console.log(`[GameStore] finalizeRound: roundNumberForEntry=${roundNumberForEntry}`); // LOG ENTFERNT

      const currentRoundJassPoints = punkte;

      const currentRoundWeisSum = (state.currentRoundWeis ?? []).reduce((acc, weis) => {
        acc[weis.position] = (acc[weis.position] || 0) + weis.points;
        return acc;
      }, {top: 0, bottom: 0});
      
      const newStriche = {...state.striche};
      let finalStrichInfoForEntryScoped: { team: TeamPosition; type: StrichTyp } | undefined = undefined; // Scoped Variable
      
      if (strichInfo) {
        const { team: strichTeam, type: strichTypeFromInput } = strichInfo;
        
        // KORRIGIERTE LOGIK: Die Entscheidung zwischen Matsch/Kontermatsch wird bereits im Calculator 
        // basierend auf currentPlayer und Team-Zuordnung getroffen. Hier übernehmen wir nur noch das Ergebnis.
        const actualStrichType: StrichTyp = strichTypeFromInput;
        
        finalStrichInfoForEntryScoped = { team: strichTeam, type: actualStrichType };
        
        // --- KORREKTUR: Verwende die korrekten Stroke-Settings für die Anzahl Striche ---
        if (actualStrichType === 'matsch') {
            // Matsch ist immer 1 Strich (fest definiert)
            newStriche[strichTeam] = {
                ...newStriche[strichTeam],
                matsch: newStriche[strichTeam].matsch + 1,
            };
        } else if (actualStrichType === 'kontermatsch') {
            // Kontermatsch: Verwende den Wert aus den aktiven Stroke-Settings
            // Hole die aktiven Stroke-Settings (gleiche Logik wie in addKontermatsch)
            const { currentGroup } = useGroupStore.getState();
            const uiStoreSettings = useUIStore.getState();
            const activeStrokeSettings = (currentGroup && currentGroup.strokeSettings !== null && currentGroup.strokeSettings !== undefined) 
                                           ? currentGroup.strokeSettings 
                                           : uiStoreSettings.strokeSettings;
            
            console.log("[GameStore.finalizeRound] Kontermatsch mit Stroke-Settings:", {
                team: strichTeam,
                kontermatschValue: activeStrokeSettings.kontermatsch,
                currentValue: newStriche[strichTeam].kontermatsch,
                newTotal: newStriche[strichTeam].kontermatsch + activeStrokeSettings.kontermatsch,
                source: currentGroup ? 'group' : 'uiStore'
            });
            
            newStriche[strichTeam] = {
                ...newStriche[strichTeam],
                kontermatsch: newStriche[strichTeam].kontermatsch + activeStrokeSettings.kontermatsch, // ADDIERE zu bestehenden Strichen
            };
        } else if (actualStrichType === 'schneider') {
            // Schneider: Verwende den Wert aus den aktiven Stroke-Settings
            // Hole die aktiven Stroke-Settings (gleiche Logik wie in addSchneider)
            const { currentGroup } = useGroupStore.getState();
            const uiStoreSettings = useUIStore.getState();
            const activeStrokeSettings = (currentGroup && currentGroup.strokeSettings !== null && currentGroup.strokeSettings !== undefined) 
                                           ? currentGroup.strokeSettings 
                                           : uiStoreSettings.strokeSettings;
            
            console.log("[GameStore.finalizeRound] Schneider mit Stroke-Settings:", {
                team: strichTeam,
                schneiderValue: activeStrokeSettings.schneider,
                currentValue: newStriche[strichTeam].schneider,
                newTotal: newStriche[strichTeam].schneider + activeStrokeSettings.schneider,
                source: currentGroup ? 'group' : 'uiStore'
            });
            
            newStriche[strichTeam] = {
                ...newStriche[strichTeam],
                schneider: newStriche[strichTeam].schneider + activeStrokeSettings.schneider, // ADDIERE zu bestehenden Strichen
            };
        }
      }

      const newTotalScores: TeamScores = {
        top: previousScores.top + currentRoundJassPoints.top + currentRoundWeisSum.top,
        bottom: previousScores.bottom + currentRoundJassPoints.bottom + currentRoundWeisSum.bottom,
      };

      const nextStartingPlayer = getNextPlayer(actualStarterOfFinalizedRound); 
      const nextCurrentPlayer = nextStartingPlayer;
      // const nextRoundNumber = roundNumberForEntry + 1; // RUNDENNUMMER WIRD IN stateForEntryCreation.currentRound GESETZT
      
      const stateForEntryCreation: GameState = {
        ...state,
        scores: newTotalScores, 
        striche: newStriche, // Die aktualisierten Striche
        weisPoints: currentRoundWeisSum, // Summe der Weis für diese Runde
        currentRoundWeis: state.currentRoundWeis, // Die einzelnen Weis-Aktionen für den Entry
        currentRound: roundNumberForEntry, // Die logische Nummer dieser abgeschlossenen Runde
        currentPlayer: nextCurrentPlayer, // Der Spieler, der die NÄCHSTE Runde beginnt
        jassPoints: currentRoundJassPoints, // Nur Jass-Punkte dieser Runde
        roundHistory: state.roundHistory || [],
        currentHistoryIndex: state.currentHistoryIndex ?? -1,
        historyState: state.historyState || createInitialHistoryState(),
        // strokeSettings etc. bleiben vom state
        // Wichtig: die restlichen Properties wie playerNames, gamePlayers, activeGameId etc.
        // werden von ...state übernommen und sollten hier korrekt sein.
        playerNames: state.playerNames,
        gamePlayers: state.gamePlayers,
        activeGameId: state.activeGameId, // initialActiveGameId ist hier eventuell besser, wenn state.activeGameId nicht zuverlässig ist
        initialStartingPlayer: state.initialStartingPlayer,
        isGameStarted: state.isGameStarted,
        isGameCompleted: state.isGameCompleted,
        scoreSettings: state.scoreSettings,
        farbeSettings: state.farbeSettings,
        strokeSettings: state.strokeSettings,
      };
      
      const newEntry = createRoundEntry(
          stateForEntryCreation,
          get,
          "jass", 
          actualStarterOfFinalizedRound, // Wer hat DIESE Runde gestartet
          {
              farbe: state.farbe,
              strichInfo: finalStrichInfoForEntryScoped,
              cardStyle: settingsFromUIStore.cardStyle, // UI Store für CardStyle
          }
      );
      // console.log("[GameStore] finalizeRound: newEntry erstellt:", JSON.parse(JSON.stringify(newEntry))); // LOG ENTFERNT

      const historyUpdate = truncateFutureAndAddEntry(state, newEntry);
      // console.log("[GameStore] finalizeRound: historyUpdate Ergebnis:", { newHistoryLength: historyUpdate.roundHistory?.length, newIndex: historyUpdate.currentHistoryIndex }); // LOG ENTFERNT

      // Erzeuge den State, wie er am Ende der gerade abgeschlossenen Runde war
      // Dieser State wird für die Synchronisation mit jassStore verwendet.
      const stateAtEndOfCompletedRound: GameState = {
          ...state, // Basis ist der State VOR dieser Runde
          scores: newTotalScores, // Gesamtscores INKLUSIVE dieser Runde
          striche: newStriche, // Gesamtstriche INKLUSIVE dieser Runde
          weisPoints: currentRoundWeisSum, // Weispunkte DIESER Runde
          currentRoundWeis: state.currentRoundWeis, // Weisaktionen DIESER Runde (für den History-Eintrag)
          isRoundCompleted: true, // Diese Runde ist abgeschlossen
          currentRound: roundNumberForEntry, // Die Nummer der gerade abgeschlossenen Runde
          currentPlayer: nextCurrentPlayer, // Der Spieler, der die nächste Runde beginnen würde
          startingPlayer: actualStarterOfFinalizedRound, // Wer hat DIESE Runde gestartet
          jassPoints: currentRoundJassPoints, // Jasspunkte DIESER Runde
          // History Update enthält bereits den newEntry für diese Runde
          roundHistory: historyUpdate.roundHistory!, 
          currentHistoryIndex: historyUpdate.currentHistoryIndex!,
          historyState: state.historyState || createInitialHistoryState(),
          // Wichtig: Restliche Felder aus stateForEntryCreation übernehmen, um Konsistenz zu wahren
          playerNames: stateForEntryCreation.playerNames,
          gamePlayers: stateForEntryCreation.gamePlayers,
          activeGameId: initialActiveGameId, // Sicherstellen, dass die korrekte ID verwendet wird
          initialStartingPlayer: stateForEntryCreation.initialStartingPlayer,
          isGameStarted: stateForEntryCreation.isGameStarted,
          isGameCompleted: stateForEntryCreation.isGameCompleted, // Bleibt erstmal false, bis das Spiel ganz fertig ist
          scoreSettings: stateForEntryCreation.scoreSettings,
          farbeSettings: stateForEntryCreation.farbeSettings,
          strokeSettings: stateForEntryCreation.strokeSettings,
      };
      stateForJassStoreSyncInternal = stateAtEndOfCompletedRound; // Speichere diesen State für außerhalb

      finalState = { // Dies ist der State für die *nächste* lokale gameStore Runde
          ...state, // Basis ist der State VOR dieser Runde
          scores: newTotalScores,
          striche: newStriche,
          weisPoints: { top: 0, bottom: 0 }, // Reset für NÄCHSTE Runde
          currentRoundWeis: [],             // Reset für NÄCHSTE Runde
          isRoundCompleted: true, // Die gerade gespielte Runde ist abgeschlossen
          currentRound: roundNumberForEntry + 1, // Nächste Rundennummer
          currentPlayer: nextCurrentPlayer, 
          startingPlayer: nextStartingPlayer, 
          ...historyUpdate, // Enthält newEntry in roundHistory
      } as GameState;

      savedRoundEntryForFirestore = newEntry;
      // console.log("[GameStore] finalizeRound: Zustand NACH Update (innerhalb set):", JSON.parse(JSON.stringify(finalState))); // LOG ENTFERNT

      // << NEUES LOGGING 3: Zustand NACH Modifikation im set-Block, VOR return >> // LOG ENTFERNT
      // console.log(`[GameStore finalizeRound DEBUG 3 - NACH Modifikation im set, VOR return finalState]`, { /* ... */ }); // LOG ENTFERNT
      // << ENDE LOGGING 3 >> // LOG ENTFERNT

      return finalState;
    }); 

    // Firestore Updates NACH set()
    const finalStateFromSet = get(); // finalStateFromSet ist jetzt der State für die nächste Runde

    // Den zuvor gespeicherten stateForJassStoreSyncInternal verwenden
    if (stateForJassStoreSyncInternal) {
      syncWithJassStore(stateForJassStoreSyncInternal); 
        } else {
      // Fallback, sollte nicht passieren, wenn stateForJassStoreSyncInternal immer gesetzt wird
      console.warn("[GameStore.finalizeRound] stateForJassStoreSyncInternal war nicht gesetzt. Sync mit potenziell falschem State.");
    syncWithJassStore(finalStateFromSet); 
    }
    
    // NEU: Firestore-Update für das Hauptdokument activeGames/{gameId}
    if (initialActiveGameId) {
      setTimeout(() => {
        // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
        if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
          window.__FIRESTORE_SYNC_API__.markLocalUpdate();
        }
        
        const currentState = get(); // Hole den aktuellen State nach allen Updates
        const updateData: Partial<ActiveGame> = {
          scores: currentState.scores,
          weisPoints: currentState.weisPoints,
          currentRound: currentState.currentRound,
          currentPlayer: currentState.currentPlayer,
          startingPlayer: currentState.startingPlayer,
          striche: currentState.striche,
          isRoundCompleted: currentState.isRoundCompleted,
          currentJassPoints: currentState.jassPoints,
          currentRoundWeis: currentState.currentRoundWeis,
          lastUpdated: serverTimestamp(),
        };
        
        const cleanedUpdateData = sanitizeDataForFirestore(updateData);
        if (process.env.NODE_ENV === 'development') {
        console.log("[GameStore.finalizeRound] Updating Firestore main document with:", cleanedUpdateData);
      }
        
        updateActiveGame(initialActiveGameId, cleanedUpdateData)
          .catch(error => console.error("[GameStore.finalizeRound] Firestore update failed:", error));
        
        // Speichere auch den Rundeneintrag
        if (savedRoundEntryForFirestore) {
          import('../services/gameService').then(({ saveRoundToFirestore }) => {
            // Zusätzliche Null-Prüfung innerhalb des async Callbacks
            if (savedRoundEntryForFirestore) {
              saveRoundToFirestore(initialActiveGameId, savedRoundEntryForFirestore)
                .catch(error => console.error("[GameStore.finalizeRound] Round save failed:", error));
            }
          });
        }
      }, 0);
    }
    
    timerStore.resetRoundTimer();
    timerStore.startRoundTimer();
    // console.log("[GameStore] finalizeRound abgeschlossen."); // LOG ENTFERNT
  }, // Hier endet die finalizeRound Methode korrekt

  updateScore: (team, score, opponentScore) => {
    set((state) => {
      const newScores = {...state.scores};
      const oppositeTeam: TeamPosition = team === "top" ? "bottom" : "top";
      newScores[team] = validateScore(score);
      newScores[oppositeTeam] = validateScore(opponentScore);
      return {scores: newScores};
    });
  },

  addStrich: (team: TeamPosition, type: StrichTyp) => {
    set((state) => {
      // Neues Striche-Objekt mit allen Kategorien
      const newStriche = {
        ...state.striche[team],
        [type]: state.striche[team][type] + 1,
      };

      // Sofortige Synchronisation mit JassStore
      const jassStore = useJassStore.getState();
      jassStore.updateCurrentGame({
        teams: {
          [team]: {
            striche: newStriche, // Übergebe kompletten StricheRecord
          },
        },
      });

      // Debug-Logging
      console.log("🎲 Strich hinzugefügt:", {
        team,
        type,
        newValue: newStriche[type],
        allStriche: newStriche,
      });

      return {
        ...state,
        striche: {
          ...state.striche,
          [team]: newStriche,
        },
      };
    });
  },

  addWeisPoints: (team: TeamPosition, points: number) => {
    // Hole den aktuellsten State *direkt hier*, um Timing-Probleme nach History-Manipulation zu vermeiden
    const state = get(); 
    
    // Prüfe, ob wir uns in der Vergangenheit befinden
    if (state.currentHistoryIndex < state.roundHistory.length - 1) {
      const {showHistoryWarning} = useUIStore.getState();
      showHistoryWarning({
        // Korrigierter Text
        message: "Weis wirklich korrigieren? Spätere Einträge werden überschrieben.", 
        onConfirm: () => {
          // --- START Kernlogik (History überschreiben) ---
          console.log("[GameStore.addWeisPoints] Executing action after history warning confirmation (overwrite)");
          let finalState: GameState | null = null;
          set((currentState) => {
            // 1. Weis-Punkte und Aktion aktualisieren
            const newWeisPoints = {...currentState.weisPoints};
            newWeisPoints[team] = (newWeisPoints[team] || 0) + points;
            const newWeisAction = {position: team, points};
            // BUGFIX: Stelle sicher, dass currentRoundWeis immer ein Array ist
            const newCurrentRoundWeis = [...(currentState.currentRoundWeis || []), newWeisAction];

            // 2. History-Eintrag erstellen (vom Typ "weis")
            const stateForEntryCreation = {
                ...currentState, 
                weisPoints: newWeisPoints, 
                currentRoundWeis: newCurrentRoundWeis, 
            };
            console.log("[addWeisPoints - Overwrite] State being saved in WeisRoundEntry:", {
                weisPoints: stateForEntryCreation.weisPoints,
                scores: stateForEntryCreation.scores,
                currentRoundWeisCount: stateForEntryCreation.currentRoundWeis.length
            });
            const newEntry = createRoundEntry(
              stateForEntryCreation,
              get,
              "weis",
              currentState.startingPlayer 
            );

            // 3. History aktualisieren (Zukunft abschneiden + neuen Entry hinzufügen)
            const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);

            finalState = {
              ...currentState, 
              weisPoints: newWeisPoints, 
              currentRoundWeis: newCurrentRoundWeis, 
              ...historyUpdate, 
            };
            console.log("[GameStore.addWeisPoints] History overwritten. New state:", {
                currentIndex: finalState.currentHistoryIndex,
                historyLength: finalState.roundHistory.length,
                weisPoints: finalState.weisPoints[team],
                currentRoundWeisCount: finalState.currentRoundWeis.length,
            });
            return finalState;
          });
          // --- ENDE Kernlogik ---
          
          // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
          // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));
          
          // *** ENTFERNT: KEIN Firestore-Update für Weis ***
        },
        onCancel: () => get().jumpToLatest(),
        type: 'error' 
      });
      return; 
    }

    // --- Normale Ausführung (wenn am Ende der History) ---
    if (process.env.NODE_ENV === 'development') {
      console.log("[GameStore.addWeisPoints] No history warning needed, proceeding.");
    }
    let finalState: GameState | null = null;
    set((currentState) => {
        // 1. Weis-Punkte und Aktion aktualisieren
        const newWeisPoints = {...currentState.weisPoints};
        newWeisPoints[team] = (newWeisPoints[team] || 0) + points;
        const newWeisAction = {position: team, points};
        // BUGFIX: Stelle sicher, dass currentRoundWeis immer ein Array ist
        const newCurrentRoundWeis = [...(currentState.currentRoundWeis || []), newWeisAction];

        // 2. History-Eintrag erstellen
        const stateForEntryCreation = {
            ...currentState,
            weisPoints: newWeisPoints,
            currentRoundWeis: newCurrentRoundWeis,
        };
        if (process.env.NODE_ENV === 'development') {
          console.log("[addWeisPoints - Normal] State being saved in WeisRoundEntry:", {
              weisPoints: stateForEntryCreation.weisPoints,
              scores: stateForEntryCreation.scores,
              currentRoundWeisCount: stateForEntryCreation.currentRoundWeis.length
          });
        }
        const newEntry = createRoundEntry(
          stateForEntryCreation,
          get,
          "weis",
          currentState.startingPlayer
        );

        // 3. History aktualisieren
        const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);

        finalState = {
          ...currentState,
          weisPoints: newWeisPoints,
          currentRoundWeis: newCurrentRoundWeis,
          ...historyUpdate,
        };
        if (process.env.NODE_ENV === 'development') {
          console.log("[GameStore.addWeisPoints] Normal Weis added:", {
              currentIndex: finalState.currentHistoryIndex,
              historyLength: finalState.roundHistory.length,
              weisPoints: finalState.weisPoints[team],
              currentRoundWeisCount: finalState.currentRoundWeis.length,
          });
        }
        return finalState;
    });

    // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
    // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));

    // *** ENTFERNT: KEIN Firestore-Update für Weis ***
  },

  undoLastWeis: () => {
    let finalState: GameState | null = null;
    set((state) => {
      // Entferne den letzten Weis-Eintrag
      const newCurrentRoundWeis = state.currentRoundWeis.slice(0, -1);
      
      // Berechne die weisPoints neu basierend auf den verbleibenden Einträgen
      const recalculatedWeisPoints = {top: 0, bottom: 0};
      newCurrentRoundWeis.forEach(weis => {
        recalculatedWeisPoints[weis.position] += weis.points;
      });
      
      finalState = {
        ...state,
        currentRoundWeis: newCurrentRoundWeis,
        weisPoints: recalculatedWeisPoints // Aktualisiere auch weisPoints!
      };
      return finalState;
    });
  },

  finalizeGame: () => {
    set(() => ({
      isGameCompleted: true,
    }));
  },

  resetGame: (
    nextStarter: PlayerNumber,
    newActiveGameId?: string,
    initialSettings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
  ) => { 
    if (process.env.NODE_ENV === 'development') {
      console.log(`[gameStore] resetGame aufgerufen. Nächster Starter: ${nextStarter}, Neue Game ID: ${newActiveGameId}`);
    }
    
    // --- NEU: Kontextabhängige Settings ermitteln ---
    const { currentTournamentInstance } = useTournamentStore.getState();
    const { currentGroup } = useGroupStore.getState();
    const uiSettings = useUIStore.getState();

    let correctSettings: { scoreSettings: ScoreSettings, strokeSettings: StrokeSettings, farbeSettings: FarbeSettings, source: string };

    if (currentTournamentInstance?.settings) {
      correctSettings = {
        scoreSettings: currentTournamentInstance.settings.scoreSettings || DEFAULT_SCORE_SETTINGS,
        strokeSettings: currentTournamentInstance.settings.strokeSettings || DEFAULT_STROKE_SETTINGS,
        farbeSettings: currentTournamentInstance.settings.farbeSettings || DEFAULT_FARBE_SETTINGS,
        source: 'tournament'
      };
    } else if (currentGroup) {
      correctSettings = {
        scoreSettings: currentGroup.scoreSettings || DEFAULT_SCORE_SETTINGS,
        strokeSettings: currentGroup.strokeSettings || DEFAULT_STROKE_SETTINGS,
        farbeSettings: currentGroup.farbeSettings || DEFAULT_FARBE_SETTINGS,
        source: 'group'
      };
    } else {
      correctSettings = {
        scoreSettings: uiSettings.scoreSettings,
        strokeSettings: uiSettings.strokeSettings,
        farbeSettings: uiSettings.farbeSettings,
        source: 'uiStore'
      };
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[gameStore] resetGame verwendet Settings aus Quelle: '${correctSettings.source}'`);
    }
    // --- ENDE NEUE LOGIK ---

    set((prevState) => {
      const playerNamesToKeep = prevState.playerNames;
      const gamePlayersToKeep = prevState.gamePlayers;
      
      const baseInitialState = createInitialStateLocal(nextStarter);
      
      const resetState: GameState = {
        ...baseInitialState,
        // --- NEU: korrekte, kontextabhängige Settings setzen ---
        scoreSettings: correctSettings.scoreSettings,
        strokeSettings: correctSettings.strokeSettings,
        farbeSettings: correctSettings.farbeSettings,
        // --- Beibehaltene Werte ---
        playerNames: playerNamesToKeep, 
        gamePlayers: gamePlayersToKeep,
        activeGameId: newActiveGameId, 
        // --- Harter Reset für den Spielverlauf ---
        roundHistory: [], 
        currentHistoryIndex: -1,
        isGameStarted: !!newActiveGameId, 
      };
      
      return resetState;
    });
  },

  resetGamePoints: () => {
    set(() => ({
      scores: {top: 0, bottom: 0},
    }));
  },

  setScore: (team, score) => {
    set((state) => {
      const newScores = {...state.scores};
      newScores[team] = validateScore(score);
      return {scores: newScores};
    });
  },

  setPlayerNames: (names) => {
    set(() => ({playerNames: names}));
  },

  updateScoreByStrich: (position: TeamPosition, points: number) => {
    const state = get();
    
    // KORREKTUR: History-Check und Warnung direkt hier, Kernlogik im onConfirm
    if (state.currentHistoryIndex < state.roundHistory.length - 1) {
        const {showHistoryWarning} = useUIStore.getState();
        console.log("[GameStore.updateScoreByStrich] History warning triggered.");
        
        showHistoryWarning({
            message: HISTORY_WARNING_MESSAGE,
            onConfirm: () => {
              // === START Kernlogik zum Überschreiben der History ===
              console.log("[GameStore.updateScoreByStrich] Executing action after history warning confirmation (overwrite)");
              let finalState: GameState | null = null;
              set((currentState) => {
                // currentState ist jetzt der KORREKTE historische Zustand
                const newScores = {...currentState.scores};
                newScores[position] += points;
                
                const newEntry = createRoundEntry(
                  {...currentState, scores: newScores }, // KORREKT: state mit neuen scores übergeben
                  get,
                  "jass",
                  currentState.startingPlayer
                );
                
                const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
                
                finalState = {
                  ...currentState,
                  scores: newScores,
                  ...historyUpdate,
                };
                
                console.log("[GameStore.updateScoreByStrich] History overwritten. New state:", { 
                  currentIndex: finalState.currentHistoryIndex,
                  historyLength: finalState.roundHistory.length,
                  scores: finalState.scores[position]
                });
                
                // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
                // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));
                
                return finalState;
              });
              
              // Firestore Update (analog zu addWeisPoints)
              setTimeout(() => {
                // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
                if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
                   window.__FIRESTORE_SYNC_API__.markLocalUpdate();
                } else {
                   console.warn("[GameStore.updateScoreByStrich.onConfirm] markLocalUpdate API not available!");
                }
                const stateForFirestore = get();
                const activeGameId = stateForFirestore.activeGameId;
                if (activeGameId) {
                  // Update scores im Hauptdokument (angenommen, das ist gewünscht)
                  const updateData: Partial<ActiveGame> = {
                    scores: stateForFirestore.scores, 
                  };
                  // Bereinige die Daten vor dem Update
                  const cleanedUpdateData = sanitizeDataForFirestore(updateData);
                  // console.log("[GameStore.updateScoreByStrich.onConfirm] Bereinigte Daten für Firestore-Update:", cleanedUpdateData);
                  updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error);
                  
                  // Speichere den neuen Rundeneintrag
                  if (stateForFirestore.roundHistory.length > 0) {
                    const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
                    import('../services/gameService').then(({ saveRoundToFirestore }) => {
                      saveRoundToFirestore(activeGameId, lastEntry).catch(console.error);
                    });
                  }
                }
              }, 0);
              // === ENDE Kernlogik ===
            },
            onCancel: () => get().jumpToLatest(),
            type: 'error'
        });
        return; // Beende die Funktion hier
    }
    
    // --- Normale Ausführung, wenn keine History-Warnung nötig ist --- 
    console.log("[GameStore.updateScoreByStrich] No history warning needed, proceeding with normal state update.");
    let finalState: GameState | null = null;
    set((currentState) => {
      const newScores = {...currentState.scores};
      newScores[position] += points;
      
      const newEntry = createRoundEntry(
        {...currentState, scores: newScores}, // KORREKT: state mit neuen scores übergeben
        get,
        "jass",
        currentState.startingPlayer
      );
      
      const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
      
      finalState = {
        ...currentState,
        scores: newScores,
        ...historyUpdate,
      };
      
      console.log("[GameStore.updateScoreByStrich] Normal score updated by strich:", { 
        currentIndex: finalState.currentHistoryIndex,
        historyLength: finalState.roundHistory.length,
        scores: finalState.scores[position]
      });
      
      // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
      // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));

      return finalState;
    });

    // Firestore Update (analog zu addWeisPoints)
    setTimeout(() => {
      // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
      if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
         window.__FIRESTORE_SYNC_API__.markLocalUpdate();
      } else {
         console.warn("[GameStore.updateScoreByStrich] markLocalUpdate API not available!");
      }
      const stateForFirestore = get();
      const activeGameId = stateForFirestore.activeGameId;
      if (activeGameId) {
        const updateData: Partial<ActiveGame> = {
          scores: stateForFirestore.scores, 
        };
        // Bereinige die Daten vor dem Update
        const cleanedUpdateData = sanitizeDataForFirestore(updateData);
        // console.log("[GameStore.updateScoreByStrich] Bereinigte Daten für Firestore-Update:", cleanedUpdateData);
        updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error);
        
        if (stateForFirestore.roundHistory.length > 0) {
          const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
          import('../services/gameService').then(({ saveRoundToFirestore }) => {
            saveRoundToFirestore(activeGameId, lastEntry).catch(console.error);
          });
        }
      }
    }, 0);
  },

  getVisualStriche: (position: TeamPosition) => {
    const state = get();
    const score = state.scores[position];
    const {striche, restZahl} = calculateStricheCounts(score);

    return {
      stricheCounts: {
        20: striche["20"],
        50: striche["50"],
        100: striche["100"],
      },
      restZahl,
    };
  },

  // Neue History-Navigation Actions
  navigateHistory: (direction: NavigationDirection) => {
      const state = get(); // Hole den aktuellen Zustand
      const now = Date.now();

      let currentIndex = state.currentHistoryIndex;
      let newIndex = -1; // Initialisierung
      let targetEntry: RoundEntry | null = null;
      let attempts = 0;
      const maxAttempts = state.roundHistory.length + 1; // Sicherheitsschleife

      // Iteriere, um den nächsten *aktiven* Eintrag zu finden
      do {
          attempts++;
          currentIndex = direction === "forward" ? currentIndex + 1 : currentIndex - 1;

          // Index-Grenzen prüfen
          if (currentIndex < -1 || currentIndex >= state.roundHistory.length) {
              console.warn(`[navigateHistory] Index out of bounds: ${currentIndex}, Länge: ${state.roundHistory.length}. Stopping navigation.`);
              useUIStore.setState({ isNavigatingHistory: false });
              return; // Zustand nicht ändern, Navigation stoppen
          }

          // Ziel-Eintrag holen (kann null sein für Index -1)
          targetEntry = currentIndex >= 0 ? state.roundHistory[currentIndex] : null;

          // Prüfe, ob der Eintrag aktiv ist (oder ob wir am Anfang sind: index -1)
          if (currentIndex === -1 || (targetEntry && (targetEntry.isActive === undefined || targetEntry.isActive === true))) {
              newIndex = currentIndex; // Gültigen Index gefunden
              break; // Schleife verlassen
          } else {
              console.log(`[navigateHistory] Skipping inactive entry at index: ${currentIndex}`);
          }

      } while (attempts < maxAttempts);

      if (newIndex === -1 && attempts >= maxAttempts) {
         console.error("[navigateHistory] Max attempts reached, could not find active entry. Stopping.");
         useUIStore.setState({ isNavigatingHistory: false });
         return; // Sicherheitshalber stoppen
      }
      
      // === Sofortige lokale State-Aktualisierung ===
      const stateUpdateBasedOnTarget = extractStateFromEntry(targetEntry, () => state);

      set({
        ...stateUpdateBasedOnTarget, // Wende den rekonstruierten Zustand an
        currentHistoryIndex: newIndex, // Setze den gefundenen, gültigen Index
        // --- Aktive Weis IMMER bei Navigation zurücksetzen ---
        weisPoints: { top: 0, bottom: 0 },
        currentRoundWeis: [],
      });
      console.log(`[navigateHistory] Local state updated for index ${newIndex}. Target round: ${targetEntry?.roundState.roundNumber ?? 'Initial'}`);
      
      // === UIStore Flag direkt hier zurücksetzen ===
      useUIStore.setState({ isNavigatingHistory: false });
      console.log("[navigateHistory] Local navigation complete. UIStore Flag isNavigatingHistory SET to FALSE.");
  },

  canNavigateForward: () => {
    const state = get();
    return state.currentHistoryIndex < state.roundHistory.length - 1;
  },

  canNavigateBackward: () => {
    const state = get();
    return state.currentHistoryIndex > -1;
  },

  jumpToLatest: () => {
    set((state) => {
      const lastIndex = state.roundHistory.length - 1;
      if (lastIndex === state.currentHistoryIndex) {
         // Schon am neuesten Stand, keine Aktion nötig bezüglich des alten isNavigating Flags.
         // Die UIStore Flag wird separat behandelt.
         return state;
      }

      const latestEntry = state.roundHistory[lastIndex];
      if (!latestEntry) return state; // Sicherheitshalber

      let restoredState = {
        ...state,
        currentRound: latestEntry.roundState.roundNumber,
        currentPlayer: latestEntry.roundState.nextPlayer,
        weisPoints: latestEntry.weisPoints,
        jassPoints: latestEntry.jassPoints,
        scores: latestEntry.scores,
        striche: latestEntry.striche,
        currentRoundWeis: latestEntry.weisActions,
        currentHistoryIndex: lastIndex,
        historyState: {
          // isNavigating: false, // ENTFERNT! Wird nicht mehr lokal verwaltet
          lastNavigationTimestamp: Date.now(),
          weisCache: null
        },
        isRoundCompleted: latestEntry.isCompleted,
      };

      // NEU: Wenn der letzte Eintrag eine abgeschlossene Jass-Runde ist,
      // setze die temporären Weis-Zähler im *aktiven* State zurück.
      if (latestEntry.actionType === 'jass') {
        restoredState = {
          ...restoredState,
          weisPoints: { top: 0, bottom: 0 },
          currentRoundWeis: [],
        };
        console.log("[jumpToLatest] Resetting weisPoints/currentRoundWeis for restored Jass entry.");
      }
      
      // Timer wiederherstellen/reaktivieren
      const timerStore = useTimerStore.getState();
      const jassStore = useJassStore.getState();
      timerStore.reactivateGameTimer(jassStore.currentGameId);

      // HIER syncWithJassStore aufrufen, da wir einen finalen Zustand erreicht haben
      syncWithJassStore(restoredState);
      return restoredState;
    });
  },

  syncHistoryState: (entry: RoundEntry) => {
    set((state) => ({
      ...state,
      roundHistory: [...state.roundHistory, entry],
      currentHistoryIndex: state.roundHistory.length,
      historyState: {
        isNavigating: false,
        lastNavigationTimestamp: Date.now(),
      },
    }));
  },

  logGameHistory: () => {
    const state = get();
    const gameHistory = state.roundHistory
      .filter((entry) => entry.isRoundFinalized)
      .map((entry) => ({
        roundId: entry.roundId,
        farbe: entry.actionType === "jass" ? entry.farbe : undefined,
        strichInfo: entry.actionType === "jass" ? entry.strichInfo : undefined,
        timestamp: new Date(entry.timestamp).toLocaleString("de-CH"),
        points: {
          top: entry.jassPoints.top,
          bottom: entry.jassPoints.bottom,
        },
        weisPoints: {
          top: entry.weisPoints.top,
          bottom: entry.weisPoints.bottom,
        },
        totalPoints: {
          top: entry.scores.top,
          bottom: entry.scores.bottom,
        },
      }));

    return gameHistory;
  },

  restoreRoundState: (entry: RoundEntry) => {
    set((state) => ({
      ...state,
      currentRound: entry.roundState.roundNumber,
      currentPlayer: entry.roundState.nextPlayer,
    }));
  },

  // Neue Funktionen hinzufügen
  isBergActive: (team: TeamPosition) => {
    const state = get();
    return state.striche[team].berg > 0;
  },

  isSiegActive: (team: TeamPosition) => {
    const state = get();
    return state.striche[team].sieg > 0;
  },

  addBerg: (team: TeamPosition) => {
    let finalState: GameState | null = null;
    set((state) => {
      const {scoreSettings} = useUIStore.getState();

      if (!scoreSettings?.enabled?.berg) return state;

      const activeTeam = getActiveStrichTeam(state, "berg");
      const newStriche = {...state.striche};

      if (activeTeam === team) {
        newStriche[team].berg = 0;
      } else if (!activeTeam) {
        const otherTeam = team === "top" ? "bottom" : "top";
        newStriche[team].berg = 1;
        newStriche[otherTeam].berg = 0;
      }

      const newState = {
        ...state,
        striche: newStriche,
      };

      syncWithJassStore(newState);
      finalState = newState;
      return newState;
    });

    // NEU: Firestore Update hinzufügen
    // Hole den aktuellen State NACH dem set() Aufruf
    const currentStateAfterSet = get();
    if (currentStateAfterSet.activeGameId) {
      // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
      if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
         window.__FIRESTORE_SYNC_API__.markLocalUpdate();
      } else {
         console.warn("[GameStore.addBerg] markLocalUpdate API not available!");
      }

      const activeGameId = currentStateAfterSet.activeGameId;
      const dataToUpdate: Partial<ActiveGame> = {
        striche: currentStateAfterSet.striche, 
        lastUpdated: serverTimestamp(),
      };
      // Bereinige die Daten vor dem Update
      const cleanedDataToUpdate = sanitizeDataForFirestore(dataToUpdate);
      // console.log("[GameStore.addBerg] Bereinigte Daten für Firestore-Update:", cleanedDataToUpdate);
      updateActiveGame(activeGameId, cleanedDataToUpdate)
        .catch(error => console.error("[GameStore.addBerg] Firestore update failed.", error));
    } else if (finalState) { // Fallback, falls activeGameId im currentStateAfterSet fehlt, aber im alten finalState (sollte nicht passieren)
        console.warn("[GameStore.addBerg] activeGameId fehlte im State nach get(), verwende alten finalState für Log, falls vorhanden. Firestore-Update übersprungen.", { oldFinalState: finalState });
    }
  },

  addSieg: (team: TeamPosition) => {
    let stricheChanged = false; // Flag bleibt

    set((state) => {
      // Hole die KORREKTEN, KONTEXTABHÄNGIGEN Einstellungen - ROBUSTER
      const { currentGroup } = useGroupStore.getState();
      const uiStoreSettings = useUIStore.getState();

      // Priorisiere Gruppen-Settings, WENN sie DEFINIERT sind, sonst Fallback auf UI Store
      const activeScoreSettings = (currentGroup && currentGroup.scoreSettings !== null && currentGroup.scoreSettings !== undefined) 
                                  ? currentGroup.scoreSettings 
                                  : uiStoreSettings.scoreSettings;
      const activeStrokeSettings = (currentGroup && currentGroup.strokeSettings !== null && currentGroup.strokeSettings !== undefined) 
                                   ? currentGroup.strokeSettings 
                                   : uiStoreSettings.strokeSettings;

      const activeTeam = getActiveStrichTeam(state, "sieg");

      // Wenn Berg aktiviert ist, prüfen ob ein Berg existiert (verwende activeScoreSettings)
      const bergCheck = activeScoreSettings.enabled.berg ?
        (state.striche.top.berg > 0 || state.striche.bottom.berg > 0) :
        true;

      // Basisstruktur für die Striche
      const baseStriche = {
        ...state.striche,
      };

      // Wenn das Team bereits Sieg hat -> komplett entfernen
      if (activeTeam === team) {
        baseStriche[team] = {
          ...baseStriche[team],
          sieg: 0,
          schneider: 0, // Auch Schneider entfernen, wenn Sieg entfernt wird
        };

        const newState = {striche: baseStriche};
        syncWithJassStore({...state, ...newState});
        stricheChanged = true;
        return newState;
      }

      // Sieg kann gesetzt werden wenn:
      // - Berg deaktiviert ist ODER
      // - Berg aktiviert ist UND existiert
      if (!activeTeam && bergCheck) {
        const otherTeam = team === "top" ? "bottom" : "top";

        // KORREKTUR: Setze Sieg für aktives Team auf 2 (Sieg zählt 2 Striche)
        baseStriche[team] = {
          ...baseStriche[team],
          sieg: 2, // Korrigiert: 2 für den Sieg (war vorher 1)
        };

        // Entferne Sieg und Schneider vom anderen Team
        baseStriche[otherTeam] = {
          ...baseStriche[otherTeam],
          sieg: 0,
          schneider: 0,
        };

        // Automatische Schneider-Prüfung (verwende activeScoreSettings)
        if (activeScoreSettings.enabled.schneider) {
          const otherTeamPoints = state.scores[otherTeam];
          if (otherTeamPoints < activeScoreSettings.values.schneider) {
            // === WIEDERHERSTELLUNG: Verwende Wert aus activeStrokeSettings ===
            baseStriche[team].schneider = activeStrokeSettings.schneider; // Der Wert aus den Settings wird direkt übernommen
          } else {
            // Explizit auf 0 setzen, falls Bedingung nicht mehr gilt
            baseStriche[team].schneider = 0;
          }
        } else {
           // Explizit auf 0 setzen, falls Schneider deaktiviert ist
           baseStriche[team].schneider = 0;
        }

        const newState = {striche: baseStriche};
        syncWithJassStore({...state, ...newState});
        stricheChanged = true;
        return newState;
      }

      // Direkt prüfen, ob sich die Striche ändern würden
      const originalStricheJSON = JSON.stringify(state.striche);
      const newStricheJSON = JSON.stringify(baseStriche);
      const changed = originalStricheJSON !== newStricheJSON;

      if (!changed) {
      return {}; // Keine Änderung
      }

      // Wenn sich etwas ändert:
      stricheChanged = true; // Setze das Flag für das Firestore-Update außerhalb
      const finalState = {
        ...state,
        striche: baseStriche // Wende die neuen Striche an
      };
      syncWithJassStore(finalState); // Synchronisiere mit dem neuen State
      return finalState; // Gib den neuen State zurück
    });

    // Firestore Update nur ausführen, wenn sich die Striche geändert haben UND wir eine activeGameId haben
    if (stricheChanged) {
      // Hole den aktuellsten State NACH dem set(), um sicherzustellen, dass activeGameId aktuell ist
      const currentState = get(); 
      if (currentState.activeGameId) {
        // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
        if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
           window.__FIRESTORE_SYNC_API__.markLocalUpdate();
        } else {
           console.warn("[GameStore.addSieg] markLocalUpdate API not available!");
        }

        const activeGameId = currentState.activeGameId;
        const dataToUpdate: Partial<ActiveGame> = {
          striche: currentState.striche, // Verwende die Striche aus dem aktuellen State
          lastUpdated: serverTimestamp(),
        };
        // Bereinige die Daten vor dem Update
        const cleanedDataToUpdate = sanitizeDataForFirestore(dataToUpdate);
        // console.log("[GameStore.addSieg] Bereinigte Daten für Firestore-Update:", cleanedDataToUpdate);
        updateActiveGame(activeGameId, cleanedDataToUpdate)
          .catch(error => console.error("[GameStore.addSieg] Firestore update failed.", error));
      } else {
        console.warn("[GameStore.addSieg] Striche changed but activeGameId missing, skipping Firestore update.");
      }
    }
  },

  addSchneider: (team: TeamPosition) => {
    let finalState: GameState | null = null;
    set((state) => {
      // Hole die KORREKTEN, KONTEXTABHÄNGIGEN Einstellungen
      const { currentGroup } = useGroupStore.getState();
      const uiStoreSettings = useUIStore.getState();
      const activeScoreSettings = currentGroup?.scoreSettings ?? uiStoreSettings.scoreSettings;
      const activeStrokeSettings = currentGroup?.strokeSettings ?? uiStoreSettings.strokeSettings;

      // Debug-Logging
      console.log("🎲 Settings beim Schneider:", {
        activeScoreSettings,
        activeStrokeSettings,
        team,
        currentStriche: state.striche[team],
      });

      // 1. Prüfen ob das Team SIEG hat (striche.sieg ist jetzt 1 oder 0)
      const hasSieg = state.striche[team].sieg === 1;
      if (!hasSieg) {
         console.log("Kein Sieg vorhanden, Schneider nicht hinzugefügt.");
         return state; // Keine Änderung, wenn kein Sieg
      }

      // 2. Gegnerteam bestimmen und Punkte prüfen
      const otherTeam = team === "top" ? "bottom" : "top";
      const otherTeamPoints = state.scores[otherTeam];

      // Verwende die aktiven Score-Settings für den Schwellenwert und Aktivierung
      const isSchneider = activeScoreSettings.enabled.schneider &&
        otherTeamPoints < activeScoreSettings.values.schneider;

      console.log("Schneider Prüfung:", { isSchneider, otherTeamPoints, limit: activeScoreSettings.values.schneider, enabled: activeScoreSettings.enabled.schneider });

      // === KORREKTUR: Verwende den Wert aus den aktiven Stroke-Settings ===
      const newSchneiderValue = isSchneider ? activeStrokeSettings.schneider : 0;

      // Nur updaten, wenn sich der Wert ändert
      if (state.striche[team].schneider === newSchneiderValue) {
          console.log("Schneider-Status unverändert.");
          return state;
      }

      // 3. SCHNEIDER-Striche setzen/entfernen
      const newState = {
        ...state,
        striche: {
          ...state.striche,
          [team]: {
            ...state.striche[team],
            schneider: newSchneiderValue, // Setze korrekten Wert (1 oder 2)
          },
          [otherTeam]: {
            ...state.striche[otherTeam],
            schneider: 0, // Schneider immer beim Gegner entfernen
          },
        },
      };

      // Synchronisiere mit JassStore
      syncWithJassStore(newState);
      finalState = newState;
      return finalState;
    });
  },

  addMatsch: (team: TeamPosition) => {
    const state = get();
    
    // KORREKTUR: History-Check und Warnung direkt hier, Kernlogik im onConfirm
    if (state.currentHistoryIndex < state.roundHistory.length - 1) {
      const {showHistoryWarning} = useUIStore.getState();
      console.log("[GameStore.addMatsch] History warning triggered.");
      
      showHistoryWarning({
        message: "Möchten Sie wirklich einen Matsch in der Vergangenheit hinzufügen?",
        onConfirm: () => {
          // === START Kernlogik zum Überschreiben der History ===
          console.log("[GameStore.addMatsch] Executing action after history warning confirmation (overwrite)");
          let finalState: GameState | null = null;
          set((currentState) => {
            const newStriche = {
              ...currentState.striche,
              [team]: {
                ...currentState.striche[team],
                matsch: currentState.striche[team].matsch + 1,
              },
            };
            
            const newEntry = createRoundEntry(
              {...currentState, striche: newStriche},
              get,
              "jass",
              currentState.startingPlayer,
              { strichInfo: { team: team, type: "matsch" } }
            );
            
            const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
            
            finalState = {
              ...currentState,
              striche: newStriche,
              ...historyUpdate,
            };
            
            console.log("[GameStore.addMatsch] History overwritten. New state:", { 
              currentIndex: finalState.currentHistoryIndex,
              historyLength: finalState.roundHistory.length,
              striche: finalState.striche[team].matsch
            });
            
            // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
            // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));
            
            return finalState;
          });
          
          // Firestore Update (analog)
          setTimeout(() => {
            // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
            if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
               window.__FIRESTORE_SYNC_API__.markLocalUpdate();
            } else {
               console.warn("[GameStore.addMatsch.onConfirm] markLocalUpdate API not available!");
            }
            const stateForFirestore = get();
            const activeGameId = stateForFirestore.activeGameId;
            if (activeGameId) {
              const updateData: Partial<ActiveGame> = {
                striche: stateForFirestore.striche, 
              };
              // Bereinige die Daten vor dem Update
              const cleanedUpdateData = sanitizeDataForFirestore(updateData);
              // console.log("[GameStore.addMatsch.onConfirm] Bereinigte Daten für Firestore-Update:", cleanedUpdateData);
              updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error);
              
              if (stateForFirestore.roundHistory.length > 0) {
                const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
                import('../services/gameService').then(({ saveRoundToFirestore }) => {
                  saveRoundToFirestore(activeGameId, lastEntry).catch(console.error);
                });
              }
            }
          }, 0);
          // === ENDE Kernlogik ===
        },
        onCancel: () => get().jumpToLatest(),
      });
      return; // Beende die Funktion hier
    }
    
    // --- Normale Ausführung --- 
    console.log("[GameStore.addMatsch] No history warning needed, proceeding.");
    let finalState: GameState | null = null;
    set((currentState) => {
      const newStriche = {
        ...currentState.striche,
        [team]: {
          ...currentState.striche[team],
          matsch: currentState.striche[team].matsch + 1,
        },
      };

      const newEntry = createRoundEntry(
        {...currentState, striche: newStriche},
        get,
        "jass",
        currentState.startingPlayer,
        { strichInfo: { team: team, type: "matsch" } }
      );

      const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
      
      finalState = {
        ...currentState,
        striche: newStriche,
        ...historyUpdate,
      };
      
      console.log("[GameStore.addMatsch] Normal Matsch added:", { 
        currentIndex: finalState.currentHistoryIndex,
        historyLength: finalState.roundHistory.length,
        striche: finalState.striche[team].matsch
      });
      
      // NEU: Inkrementiere Firestore ID Zähler NACH erfolgreichem Hinzufügen - ENTFERNT
      // set(state => ({ nextRoundFirestoreId: state.nextRoundFirestoreId + 1 }));

      return finalState;
    });
    
    // Firestore Update (analog)
    setTimeout(() => {
      // MARK LOCAL UPDATE *BEFORE* WRITING TO FIRESTORE
      if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
         window.__FIRESTORE_SYNC_API__.markLocalUpdate();
      } else {
         console.warn("[GameStore.addMatsch] markLocalUpdate API not available!");
      }
      const stateForFirestore = get();
      const activeGameId = stateForFirestore.activeGameId;
      if (activeGameId) {
        const updateData: Partial<ActiveGame> = {
          striche: stateForFirestore.striche, 
        };
        // Bereinige die Daten vor dem Update
        const cleanedUpdateData = sanitizeDataForFirestore(updateData);
        // console.log("[GameStore.addMatsch] Bereinigte Daten für Firestore-Update:", cleanedUpdateData);
        updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error);
        
        if (stateForFirestore.roundHistory.length > 0) {
          const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
          import('../services/gameService').then(({ saveRoundToFirestore }) => {
            saveRoundToFirestore(activeGameId, lastEntry).catch(console.error);
          });
        }
      }
    }, 0);
  },

  // Neue Getter-Methode für die Gesamtstriche
  getTotalStriche: (team: TeamPosition): number => {
    const state = get();
    const {scoreSettings} = useUIStore.getState();
    const striche = state.striche[team];

    let total = 0;

    // Berg nur wenn aktiviert
    if (scoreSettings?.enabled?.berg) {
      total += striche.berg;
    }

    // Sieg immer
    total += striche.sieg;

    // Schneider nur wenn aktiviert
    if (scoreSettings?.enabled?.schneider) {
      total += striche.schneider;
    }

    // Matsch und Kontermatsch immer
    total += striche.matsch;
    total += striche.kontermatsch;

    return total;
  },

  completeRound: () => {
    const timerStore = useTimerStore.getState();

    set((state) => ({
      ...state,
      isRoundCompleted: true,
      currentRound: state.currentRound + 1,
    }));

    // Timer auf null setzen
    timerStore.resetRoundTimer();
  },

  // Neue Methode für Kontermatsch
  addKontermatsch: (team: TeamPosition) => {
    const state = get();
    
    // KORREKTUR: History-Check und Warnung direkt hier, Kernlogik im onConfirm
    if (state.currentHistoryIndex < state.roundHistory.length - 1) {
      const {showHistoryWarning} = useUIStore.getState();
      // console.log("[GameStore.addKontermatsch] History warning triggered.");
      
      showHistoryWarning({
        message: "Möchten Sie wirklich einen Kontermatsch in der Vergangenheit hinzufügen?",
        onConfirm: () => {
          // === START Kernlogik zum Überschreiben der History ===
          // console.log("[GameStore.addKontermatsch] Executing action after history warning confirmation (overwrite)");
          let finalState: GameState | null = null;
          set((currentState) => {
            // Hole die StrokeSettings
            const { currentGroup } = useGroupStore.getState();
            const uiStoreSettings = useUIStore.getState();
            const activeStrokeSettings = (currentGroup && currentGroup.strokeSettings !== null && currentGroup.strokeSettings !== undefined) 
                                           ? currentGroup.strokeSettings 
                                           : uiStoreSettings.strokeSettings;

            // *** NEUES LOGGING (Overwrite Path) ***
            // console.log("[GameStore.addKontermatsch] Settings Check (overwrite path):", {
            //   team,
            //   strichValue: activeStrokeSettings.kontermatsch,
            //   activeStrokeSettings: state.strokeSettings,
            //   kontermatschValue: state.strokeSettings.kontermatsch
            // });
            // *** ENDE NEUES LOGGING ***

            // Striche-Objekt erstellen mit korrektem kontermatsch-Wert 
            const newStriche = {
              ...currentState.striche,
              [team]: {
                ...currentState.striche[team],
                kontermatsch: activeStrokeSettings.kontermatsch,
              },
            };
            
            // WICHTIG: Wir erstellen ein neues State-Objekt, das die neuen Striche enthält
            const updatedState = {
              ...currentState,
              striche: newStriche
            };
            
            // Dann übergeben wir das aktualisierte State-Objekt an createRoundEntry
            const newEntry = createRoundEntry(
              updatedState, // HIER ist die Änderung! Wir verwenden den aktualisierten State
              get,
              "jass",
              currentState.startingPlayer,
              { 
                strichInfo: { 
                  team: team, 
                  type: "kontermatsch"
                }
              }
            );
            
            // DEBUG: Überprüfen der Werte im erstellten RoundEntry
            // if (newEntry.actionType === "jass") {
            //   console.log(`[GameStore.addKontermatsch] RoundEntry erstellt mit kontermatsch-Wert: ${newEntry.striche[team].kontermatsch}`);
            // } else {
            //   console.log(`[GameStore.addKontermatsch] RoundEntry erstellt (Typ: ${newEntry.actionType}), keine Striche geloggt.`);
            // }

            const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
            
            finalState = {
              ...currentState,
              striche: newStriche,
              ...historyUpdate,
            };
            
            // console.log("[GameStore.addKontermatsch] History overwritten. New state:", { 
            //   currentIndex: finalState.currentHistoryIndex,
            //   historyLength: finalState.roundHistory.length,
            //   stricheTeam: finalState.striche[team].kontermatsch
            // });
            
            return finalState;
          });
          
          // Firestore Update (analog)
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
               window.__FIRESTORE_SYNC_API__.markLocalUpdate();
            } else {
               console.warn("[GameStore.addKontermatsch.onConfirm] markLocalUpdate API not available!");
            }
            const stateForFirestore = get();
            const activeGameId = stateForFirestore.activeGameId;
            if (activeGameId) {
              const updateData: Partial<ActiveGame> = { // KORREKTE DEKLARATION
                striche: stateForFirestore.striche, 
                lastUpdated: serverTimestamp(),
              };
              const cleanedUpdateData = sanitizeDataForFirestore(updateData);
              updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error);
              
              if (stateForFirestore.roundHistory.length > 0) {
                const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
                
                // DEBUG: Überprüfen, ob der RoundEntry die korrekten Werte enthält
                // if (lastEntry.actionType === "jass") {
                //   console.log(`[GameStore.addKontermatsch.onConfirm] LastEntry für Firestore mit kontermatsch-Wert: ${lastEntry.striche[team].kontermatsch}`);
                // } else {
                //   console.log(`[GameStore.addKontermatsch.onConfirm] LastEntry für Firestore (Typ: ${lastEntry.actionType}), keine Striche geloggt.`);
                // }
                
                import('../services/gameService').then(({ saveRoundToFirestore }) => {
                  saveRoundToFirestore(activeGameId, lastEntry).catch(console.error); 
                });
              }
            }
          }, 0);
          // === ENDE Kernlogik ===
        },
        onCancel: () => get().jumpToLatest(),
      });
      return; 
    }
    
    // --- Normale Ausführung --- 
    // console.log("[GameStore.addKontermatsch] No history warning needed, proceeding.");
    let finalState: GameState | null = null;
    set((currentState) => {
      const { currentGroup } = useGroupStore.getState();
      const uiStoreSettings = useUIStore.getState();
      const activeStrokeSettings = (currentGroup && currentGroup.strokeSettings !== null && currentGroup.strokeSettings !== undefined) 
                                     ? currentGroup.strokeSettings 
                                     : uiStoreSettings.strokeSettings;

      // *** NEUES LOGGING (Normal Path) ***
      // console.log("[GameStore.addKontermatsch] Settings Check (normal path):", {
      //   team,
      //   strichValue: activeStrokeSettings.kontermatsch,
      //   activeStrokeSettings: state.strokeSettings,
      //   kontermatschValue: state.strokeSettings.kontermatsch
      // });
      // *** ENDE NEUES LOGGING ***

      // Striche-Objekt erstellen mit korrektem kontermatsch-Wert 
      const newStriche = {
        ...currentState.striche,
        [team]: {
          ...currentState.striche[team],
          kontermatsch: activeStrokeSettings.kontermatsch,
        },
      };
      
      // WICHTIG: Wir erstellen ein neues State-Objekt, das die neuen Striche enthält
      const updatedState = {
        ...currentState,
        striche: newStriche
      };
      
      // Dann übergeben wir das aktualisierte State-Objekt an createRoundEntry
      const newEntry = createRoundEntry(
        updatedState, // HIER ist die Änderung! Wir verwenden den aktualisierten State
        get,
        "jass",
        currentState.startingPlayer,
        { 
          strichInfo: { 
            team: team, 
            type: "kontermatsch"
          }
        }
      );
      
      // DEBUG: Überprüfen der Werte im erstellten RoundEntry
      // if (newEntry.actionType === "jass") {
      //   console.log(`[GameStore.addKontermatsch] RoundEntry erstellt mit kontermatsch-Wert: ${newEntry.striche[team].kontermatsch}`);
      // } else {
      //   console.log(`[GameStore.addKontermatsch] RoundEntry erstellt (Typ: ${newEntry.actionType}), keine Striche geloggt.`);
      // }

      const historyUpdate = truncateFutureAndAddEntry(currentState, newEntry);
      
      finalState = {
        ...currentState,
        striche: newStriche,
        ...historyUpdate,
      };
      
      // console.log("[GameStore.addKontermatsch] Normal Kontermatsch added:", { 
      //   currentIndex: finalState.currentHistoryIndex,
      //   historyLength: finalState.roundHistory.length,
      //   stricheTeam: finalState.striche[team].kontermatsch
      // });
      
      return finalState;
    });
    
    // Firestore Update (analog)
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.__FIRESTORE_SYNC_API__?.markLocalUpdate) {
         window.__FIRESTORE_SYNC_API__.markLocalUpdate();
      } else {
         console.warn("[GameStore.addKontermatsch] markLocalUpdate API not available!");
      }
      const stateForFirestore = get();
      const activeGameId = stateForFirestore.activeGameId;
      if (activeGameId) {
        const updateData: Partial<ActiveGame> = { // KORREKTE DEKLARATION
          striche: stateForFirestore.striche, 
          lastUpdated: serverTimestamp(),
        };
        const cleanedUpdateData = sanitizeDataForFirestore(updateData);
        updateActiveGame(activeGameId, cleanedUpdateData).catch(console.error); 
        
        if (stateForFirestore.roundHistory.length > 0) {
          const lastEntry = stateForFirestore.roundHistory[stateForFirestore.roundHistory.length - 1];
          
          // DEBUG: Überprüfen, ob der RoundEntry die korrekten Werte enthält
          // if (lastEntry.actionType === "jass") {
          //   console.log(`[GameStore.addKontermatsch] LastEntry für Firestore mit kontermatsch-Wert: ${lastEntry.striche[team].kontermatsch}`);
          // } else {
          //   console.log(`[GameStore.addKontermatsch] LastEntry für Firestore (Typ: ${lastEntry.actionType}), keine Striche geloggt.`);
          // }
          
          import('../services/gameService').then(({ saveRoundToFirestore }) => {
            saveRoundToFirestore(activeGameId, lastEntry).catch(console.error); 
          });
        }
      }
    }, 0);
  },

  getPlayerName: (playerNumber: PlayerNumber): string => {
    const state = get();
    return state.gamePlayers?.[playerNumber]?.name || state.playerNames[playerNumber] || `Spieler ${playerNumber}`;
  },

  resetGameState: (options?: { 
    newActiveGameId?: string | null | undefined; 
    nextStarter?: PlayerNumber;
    settings?: {
      farbeSettings?: FarbeSettings;
      scoreSettings?: ScoreSettings;
      strokeSettings?: StrokeSettings;
    }
  }) => {
    set((prevState: GameState): GameState => { // Ändere von Partial<GameState> zu GameState
      const initialPlayer = options?.nextStarter || prevState.initialStartingPlayer || 1;

      // Einstellungen aus Optionen oder prevState oder Defaults
      const newFarbeSettings = options?.settings?.farbeSettings ?? prevState.farbeSettings ?? DEFAULT_FARBE_SETTINGS;
      const newScoreSettings = options?.settings?.scoreSettings ?? prevState.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
      const newStrokeSettings = options?.settings?.strokeSettings ?? prevState.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
      
      const settingsForInitialState = {
        farbeSettings: newFarbeSettings,
        scoreSettings: newScoreSettings,
        strokeSettings: newStrokeSettings,
      };

      const baseResetState = createInitialStateLocal(initialPlayer, settingsForInitialState);

      // PlayerNames und gamePlayers aus dem prevState übernehmen, falls vorhanden und gültig
      const playerNamesToKeep = prevState.playerNames && Object.values(prevState.playerNames).some(name => name !== "") 
                                ? prevState.playerNames 
                                : initialPlayerNames; // Fallback auf Default, wenn prevState leer
      const gamePlayersToKeep = prevState.gamePlayers || null;


      let newActiveGameIdToSet: string | null | undefined;
      let newIsGameStarted: boolean = false;

      if (options && options.hasOwnProperty('newActiveGameId')) {
        if (options.newActiveGameId === null) {
          newActiveGameIdToSet = null;
          newIsGameStarted = false;
        } else if (typeof options.newActiveGameId === 'string') {
          newActiveGameIdToSet = options.newActiveGameId;
          newIsGameStarted = true;
        } else { 
          newActiveGameIdToSet = undefined;
          newIsGameStarted = false;
        }
      } else { 
        // Wenn keine newActiveGameId in options, behalte die aus prevState, wenn vorhanden, sonst undefined
        newActiveGameIdToSet = prevState.activeGameId; 
        newIsGameStarted = !!prevState.activeGameId;
      }
      
      const newState: GameState = { // Ändere von Partial<GameState> zu GameState
        ...baseResetState, // Startet mit Defaults für die meisten Dinge
        gamePlayers: gamePlayersToKeep, 
        activeGameId: newActiveGameIdToSet,
        isGameStarted: newIsGameStarted,
        // Explizit die ermittelten Einstellungen setzen
        farbeSettings: newFarbeSettings,
        scoreSettings: newScoreSettings,
        strokeSettings: newStrokeSettings,
        roundHistory: [], 
        currentHistoryIndex: -1,
        // Explizit sicherstellen, dass scores definiert ist
        scores: baseResetState.scores || { top: 0, bottom: 0 },
        // Explizit sicherstellen, dass striche definiert ist
        striche: baseResetState.striche || {
          top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
          bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
        },
        // Explizit sicherstellen, dass playerNames definiert ist
        playerNames: playerNamesToKeep || baseResetState.playerNames || {
          1: "Spieler 1",
          2: "Spieler 2", 
          3: "Spieler 3",
          4: "Spieler 4"
        },
        // Explizit sicherstellen, dass currentPlayer definiert ist
        currentPlayer: baseResetState.currentPlayer || 1,
      };

      console.log(`[GameStore] resetGameState durchgeführt. activeGameId: ${newState.activeGameId}, isGameStarted: ${newState.isGameStarted}, playerNames: ${JSON.stringify(newState.playerNames).substring(0, 50)}...`,
      "Farbe CardStyle:", newState.farbeSettings?.cardStyle,
      "Score Sieg:", newState.scoreSettings?.values.sieg,
      "Stroke Schneider:", newState.strokeSettings?.schneider
      );
      return newState; // Stellen sicher, dass der neue State zurückgegeben wird
    });
  },

  rebuildStateFromHistory: (index: number) => {
    set((state) => {
      if (index < -1 || index >= state.roundHistory.length) {
        console.error(`[rebuildStateFromHistory] Ungültiger Index: ${index}`);
        return state; // Keine Änderung bei ungültigem Index
      }

      const targetEntry = index === -1 ? null : state.roundHistory[index];
      const newState = extractStateFromEntry(targetEntry, () => state);

      return {
        ...state,
        ...newState,
        currentHistoryIndex: index,
        historyState: {
          // KORREKTUR: Entferne isNavigating auch hier
          lastNavigationTimestamp: state.historyState.lastNavigationTimestamp, // Behalte den letzten Timestamp?
          weisCache: null
          // isNavigating: false, // Sicherstellen, dass diese Zeile entfernt ist
        }
      };
    });
  },

  setPlayers: (newPlayers: PlayerNames) => set({ playerNames: newPlayers }),

  setGameSettings: (settings) => {
    set((state) => {
      const { farbeSettings, scoreSettings, strokeSettings } = state;

      // Eine einfache Vergleichsfunktion, um zu prüfen, ob sich Objekte geändert haben.
      const haveSettingsChanged = (
        current: any,
        next: any
      ) => JSON.stringify(current) !== JSON.stringify(next);

      const newFarbeSettings = settings.farbeSettings || farbeSettings;
      const newScoreSettings = settings.scoreSettings || scoreSettings;
      const newStrokeSettings = settings.strokeSettings || strokeSettings;

      const changed =
        haveSettingsChanged(farbeSettings, newFarbeSettings) ||
        haveSettingsChanged(scoreSettings, newScoreSettings) ||
        haveSettingsChanged(strokeSettings, newStrokeSettings);

      if (!changed) {
        if (process.env.NODE_ENV === 'development') {
          console.log("[GameStore setGameSettings] No changes detected. Skipping update.");
        }
        return state; // Keine Änderungen, gib den aktuellen State zurück
      }

      if (process.env.NODE_ENV === 'development') {
        console.log("[GameStore setGameSettings] Settings have changed. Applying update.");
      }
      return {
        ...state,
        farbeSettings: newFarbeSettings,
        scoreSettings: newScoreSettings,
        strokeSettings: newStrokeSettings,
      };
    });
  },

  showHistoryWarning: (
    message: string,
    onConfirm: () => void,
    onCancel: () => void = () => get().jumpToLatest()
  ) => {
    const state = get();
    // Die Prüfung hier ist redundant, da sie schon in den aufrufenden Methoden stattfindet,
    // aber zur Sicherheit lassen wir sie drin.
    if (state.currentHistoryIndex < state.roundHistory.length - 1) {
      const uiStore = useUIStore.getState();
      uiStore.showHistoryWarning({
        message,
        onConfirm,
        onCancel,
        type: 'error' // Setze Typ auf 'error' für rotes Icon
      });
    } else {
      // Sollte eigentlich nie passieren, wenn von den Aktionen aufgerufen
      console.warn("[GameStore.showHistoryWarning] Called unexpectedly when already at the latest state.");
      onConfirm(); 
    }
  },

  validateHistoryAction: () => {
    const state = get();
    // Gibt true zurück, wenn die Aktion erlaubt ist (d.h. wir sind am aktuellen Ende der History)
    return state.currentHistoryIndex >= state.roundHistory.length - 1;
  },
  // NEU: Funktion zum Setzen der aktuellen Spielfarbe
  setFarbe: (farbe: JassColor | undefined) => {
    set((state) => {
      const newState = { ...state, farbe };
      return newState;
    });
  },
  })
, { name: "gameStore" }));