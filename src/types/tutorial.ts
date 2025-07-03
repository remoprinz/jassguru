// src/types/tutorial.ts
import {PersistStorage} from "zustand/middleware";
import {IconType} from "react-icons";
import type {TeamPosition} from "./jass";
import type {StorageValue} from "zustand/middleware";

export enum TUTORIAL_STEPS {
    // Basic Tutorial Flow
    WELCOME = "WELCOME",
    MENU_GESTURE = "MENU_GESTURE",
    CALCULATOR_OPEN = "CALCULATOR_OPEN",
    CALCULATOR_INPUT = "CALCULATOR_INPUT",
    GAME_INFO = "GAME_INFO",
    RESULTAT_INFO = "RESULTAT_INFO",
    BASIC_COMPLETE = "BASIC_COMPLETE",

    // Settings Flow
    SETTINGS = "SETTINGS",
    SETTINGS_INTRO = "SETTINGS_INTRO",
    SETTINGS_CARDS = "SETTINGS_CARDS",
    SETTINGS_PICTOGRAMS = "SETTINGS_PICTOGRAMS",
    SETTINGS_MULTIPLIER = "SETTINGS_MULTIPLIER",
    SETTINGS_CONFIGURE = "SETTINGS_CONFIGURE",
    SETTINGS_NAVIGATE = "SETTINGS_NAVIGATE",
    SETTINGS_SCORES = "SETTINGS_SCORES",
    SETTINGS_NAVIGATE_STROKES = "SETTINGS_NAVIGATE_STROKES",
    SETTINGS_STROKES = "SETTINGS_STROKES",
    NAVIGATE_SCORES = "NAVIGATE_SCORES",
    BINGO_SETTINGS = "BINGO_SETTINGS",

    // Game Flow
    CALCULATOR = "CALCULATOR",
    WEIS = "WEIS",
    HISTORY = "HISTORY",
    BERG_INFO = "BERG_INFO",
    GAME_CONTROL = "GAME_CONTROL",
    GAME_MONITOR = "GAME_MONITOR",
    TIPS_TRICKS = "TIPS_TRICKS",
    NEW_GAME = "NEW_GAME",
    JASS_SETTINGS = "JASS_SETTINGS",

    // Tips Tutorial Flow
    TIPS_WELCOME = "TIPS_WELCOME",
    TIPS_QUICK_CLOSE = "TIPS_QUICK_CLOSE",
    TIPS_IPHONE_WAKE = "TIPS_IPHONE_WAKE",
    TIPS_PLAYER_ORDER = "TIPS_PLAYER_ORDER"
  }

export type TutorialStepId = keyof typeof TUTORIAL_STEPS;

  interface TutorialNavigation {
    back?: {
      targetStep: TutorialStepId;
      skipSteps: boolean;
    };
    next?: {
      targetStep: TutorialStepId;
      skipSteps: boolean;
    };
  }

export interface TutorialStep {
    id: TutorialStepId;
    title?: string;
    content: string;
    target?: string;
    hideNavigation?: boolean;
    hideBackButton?: boolean;
    overlayPosition: {
      vertical: "top" | "center" | "bottom";
      horizontal: "left" | "center" | "right";
      offset?: {
        x?: number;
        y?: number;
      };
    };
    action?: {
      type: "swipe" | "click" | "doubleclick" | "longpress" | "split";
      direction?: "up" | "down" | "left" | "right";
      position?: TeamPosition;
    };
    category: TutorialCategory;
    order?: number;
    image?: string;
    icon?: IconType;
    autoProgress?: boolean;
    navigation?: TutorialNavigation;
    onEnter?: () => void;
    onExit?: () => void;
    isHelpMode?: boolean; // Optional, nur für Help-Mode Steps
  }

// Kategorien als Teil der Types
export enum TutorialCategory {
    BASIC = "basic",
    GAME = "game",
    SETTINGS = "settings",
    ADVANCED = "advanced",
    TIPS = "tips"
  }

// Kategorie-Titel Mapping
export const TUTORIAL_CATEGORIES: Record<TutorialCategory, string> = {
  [TutorialCategory.BASIC]: "Grundlegende Bedienung",
  [TutorialCategory.GAME]: "Spielablauf",
  [TutorialCategory.SETTINGS]: "Einstellungen",
  [TutorialCategory.ADVANCED]: "Erweiterte Funktionen",
  [TutorialCategory.TIPS]: "Tipps & Tricks",
};

// Definieren wir den Typ für den persistierten Teil des States
export type PersistedTutorialState = {
    hasCompletedTutorial: boolean;
    completedCategories: TutorialCategory[];
  };

// Custom Storage Type für Development
export const createDevStorage = (): PersistStorage<PersistedTutorialState> => ({
  getItem: (name: string): Promise<StorageValue<PersistedTutorialState> | null> => {
    const devOverrides = {
      hasCompletedTutorial: localStorage.getItem("dev-tutorial-override"),
      completedCategories: localStorage.getItem("dev-tutorial-categories"),
    };

    if (!devOverrides.hasCompletedTutorial) return Promise.resolve(null);

    // Erstelle das korrekte Format für StorageValue
    const storageData: StorageValue<PersistedTutorialState> = {
      state: {
        hasCompletedTutorial: devOverrides.hasCompletedTutorial === "true",
        completedCategories: devOverrides.completedCategories ?
          JSON.parse(devOverrides.completedCategories) :
          [],
      },
      version: 0, // Version ist optional, aber oft nützlich für Migrations-Logik
    };

    return Promise.resolve(storageData);
  },

  setItem: (name: string, value: StorageValue<PersistedTutorialState>): Promise<void> =>
    Promise.resolve(),

  removeItem: (name: string): Promise<void> =>
    Promise.resolve(),
});

export interface TutorialUIBlocking {
    settingsClose: boolean;
    calculatorClose: boolean;
    gameInfoClose: boolean;
    resultatKreidetafelClose: boolean;
  }

export interface TutorialState {
    isActive: boolean;
    currentStepIndex: number;
    hasCompletedTutorial: boolean;
    hasSeenTutorialThisSession: boolean;
    steps: TutorialStep[];
    tutorialUIBlocking: TutorialUIBlocking;
    completedCategories: TutorialCategory[];
    isHelpMode: boolean;
    activeEvents: Set<TutorialEventName>;
    lastNextStepTime?: number;
  }

export interface TutorialActions {
    startTutorial: (stepId?: TutorialStepId, options?: { isHelpMode?: boolean }) => void;
    endTutorial: (neverShowAgain: boolean) => void;
    nextStep: () => void;
    previousStep: () => void;
    getCurrentStep: () => TutorialStep | null;
    resetTutorial: () => void;
    setTutorialUIBlocking: (blocking: Partial<TutorialUIBlocking>) => void;
    markCategoryAsCompleted: (category: TutorialCategory) => void;
    isCategoryCompleted: (category: TutorialCategory) => boolean;
    setActive: (active: boolean) => void;
    exitHelpStep: () => void;
    cleanupStepEvents: () => void;
    registerEvent: (eventName: TutorialEventName) => void;
    setHasCompletedTutorial: (completed: boolean) => void;
}

export type TutorialStore = TutorialState & TutorialActions;

// Event Types für Tutorial Events
export interface TutorialSplitContainerEventDetail {
    action: "open" | "close";
    teamPosition: TeamPosition; // Nutzt den existierenden TeamPosition type
    stepId: TutorialStepId;
  }

// Direkte Verwendung des CustomEvent-Typs statt eines leeren Interfaces
export type TutorialSplitContainerEvent = CustomEvent<TutorialSplitContainerEventDetail>;

export type TutorialEventName =
    | "calculatorOpen"
    | "gameInfoOpen"
    | "settingsOpen"
    | "resultatKreidetafelOpen";

export const TUTORIAL_EVENTS: TutorialEventName[] = [
  "calculatorOpen",
  "gameInfoOpen",
  "settingsOpen",
  "resultatKreidetafelOpen",
];

  declare global {
    interface WindowEventMap {
      "calculatorOpen": CustomEvent<void>;
      "gameInfoOpen": CustomEvent<void>;
      "settingsOpen": CustomEvent<void>;
    }
  }
