// src/types/uiStore.ts (oder src/store/uiStore.ts)

import {create, StateCreator} from "zustand";
import {persist} from "zustand/middleware";
import type {
  TeamPosition,
  PlayerNames,
  SettingsTab,
  PictogramConfig,
  ScoreMode,
  CardStyle,
  FarbeSettings,
  ScoreSettings,
  StrokeSettings,
  FarbeModeKey
} from "../types/jass";
import {StatisticId} from "../types/statistikTypes";
import {FARBE_MODES} from "../config/FarbeSettings";
import {
  SCORE_MODES,
  validateScoreValue,
} from "../config/ScoreSettings";
import {
  DEFAULT_STROKE_SETTINGS,
  validateStrokeSettings,
} from "../config/GameSettings";
import {
  DEFAULT_FARBE_SETTINGS,
  validateFarbeSettings,
} from "../config/FarbeSettings";
import {Notification, JassFinishNotificationConfig, NotificationConfig} from "../types/notification";
import type {SpruchMitIcon} from "../types/sprueche";
import {immer} from "zustand/middleware/immer";

export enum OnboardingStep {
  INSTALL = "INSTALL",
  WELCOME = "WELCOME",
  GROUP_CHOICE = "GROUP_CHOICE",
  GROUP_CREATE = "GROUP_CREATE",
  GROUP_JOIN = "GROUP_JOIN",
  GAME_START = "GAME_START",
  PROFILE = "PROFILE",
  SETTINGS = "SETTINGS",
  COMPLETE = "COMPLETE",
}

const validateMultipliers = (multipliers: number[]): boolean => {
  return multipliers.every((m) => m >= 0 && m <= 8);
};

// Storage Keys
const STORAGE_KEYS = {
  farbe: "jass-farbe-settings",
  score: "jass-score-settings",
  pictogram: "jass-pictogram-settings",
  strokes: "jass-stroke-settings",
} as const;

// Generische Save-Funktion
const saveToStorage = <T>(key: keyof typeof STORAGE_KEYS, data: T): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
  } catch (error) {
    console.error(`Fehler beim Speichern von ${key}:`, error);
  }
};

// Spezifische Save-Funktionen
const saveFarbeSettings = (settings: FarbeSettings) =>
  saveToStorage("farbe", settings);

const saveScoreSettings = (settings: ScoreSettings) =>
  saveToStorage("score", settings);

const savePictogramSettings = (settings: PictogramConfig) =>
  saveToStorage("pictogram", settings);

const saveStrokeSettings = (settings: StrokeSettings) =>
  saveToStorage("strokes", settings);

const initialPictogramSettings: PictogramConfig = {
  isEnabled: true,
  mode: "svg",
};

interface ChargeState {
  isActive: boolean;
  pressStartTime: number | null;
  chargeAmount: number;
}

const createInitialChargeState = (): ChargeState => ({
  isActive: false,
  pressStartTime: null,
  chargeAmount: 0,
});

export interface StricheDisplay {
  vertikal: number;
  horizontal: number;
}

export interface StrichStyle {
  baseStrich: {
    length: number;
    width: number;
    color: string;
    opacity: number;
  };
  diagonalStrich: {
    length: number;
    width: number;
    angle: number;
    offset: { x: number; y: number };
  };
  container: {
    spacing: number;
    groupSpacing: number;
    scale: number;
  };
}

export const defaultStrichStyle: StrichStyle = {
  baseStrich: {
    length: 20,
    width: 1.5,
    color: "rgba(255, 255, 255, 0.9)",
    opacity: 0.9,
  },
  diagonalStrich: {
    length: 28,
    width: 1.5,
    angle: 45,
    offset: {x: -1, y: 0},
  },
  container: {
    spacing: 4,
    groupSpacing: 8,
    scale: 1,
  },
};

interface UISettingsState {
  isOpen: boolean;
  activeTab: SettingsTab["id"];
  cardStyle: CardStyle;
  pictogramConfig: PictogramConfig;
}

type NotificationMessage = {
  content: string | SpruchMitIcon;
  fixedFooter?: string;
}

export interface JassFinishNotification {
  isOpen: boolean;
  mode: "share" | "continue";
  message: NotificationMessage;
  onShare?: () => void;
  onBack?: () => void;
  onContinue?: () => void;
}

export type NotificationType = "info" | "success" | "warning" | "error";

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export type StartScreenState = "idle" | "starting" | "complete";

// NEU: Definition für den Zustand des Page-CTAs
export interface PageCtaState {
  isVisible: boolean;
  text: string;
  onClick: (() => void) | null;
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "destructive" | "success" | "info" | "primary" | "secondary" | string; // Farbvarianten
}

export interface UIState {
  calculator: {
    isOpen: boolean;
    value: number;
    isFlipped: boolean;
  };
  startScreen: {
    transitionState: "initial" | "starting" | "complete";
    names: PlayerNames;
    isOpen: boolean;
  };
  history: {
    warning: string | null;
  };
  chargeEffects: {
    berg: Record<TeamPosition, ChargeState>;
    bedanken: Record<TeamPosition, ChargeState>;
    matsch: Record<TeamPosition, ChargeState>;
  };
  menu: {
    isOpen: boolean;
    activeButton: string | null;
    showIntroduction: boolean;
    showResetWarning: boolean;
  };
  resultatKreidetafel: {
    isOpen: boolean;
    swipePosition: TeamPosition | null;
    currentStatistic: "striche" | "jasspunkte";
    animationComplete: boolean;
  };
  settings: UISettingsState;
  farbeSettings: FarbeSettings;
  scoreSettings: ScoreSettings;
  strokeSettings: StrokeSettings;
  isGameInfoOpen: boolean;
  isHistoryWarningOpen: boolean;
  historyWarningCallback: (() => void) | null;
  lastDoubleClickPosition: TeamPosition | null;
  historyWarning: {
    show: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  };
  isPaused: boolean;
  strichStyle: StrichStyle;
  overlayPosition: TeamPosition | null;
  jassFinishNotification: {
    isOpen: boolean;
    mode: "share" | "continue";
    message?: SpruchMitIcon;
    onShare?: () => Promise<void>;
    onBack?: () => void;
    onContinue?: () => void;
  };
  onboarding: {
    currentStep: OnboardingStep;
    hasCompletedOnboarding: boolean;
    show: boolean;
    canBeDismissed: boolean;
    isPWA: boolean;
  };
  isTutorialInfoOpen: boolean;
  splitContainer: {
    isOpen: boolean;
    position: TeamPosition;
  };
  tutorialBlockedUI: {
    settingsClose: boolean;
    calculatorClose: boolean;
    gameInfoClose: boolean;
    resultatKreidetafelClose: boolean;
  };
  topSwipeAnimation: boolean;
  bottomSwipeAnimation: boolean;
  notifications: Notification[];
  isSettingsOpen: boolean;
  isCalculatorOpen: boolean;
  isMenuOpen: boolean;
  activeModal: string | null;
  isNotificationCenterOpen: boolean;
  isLoading: boolean; // Generischer Ladezustand
  startScreenState: StartScreenState;
  pageCta: PageCtaState;
  isFarbeSettingsModalOpen: boolean; // NEU: Zustand für das Farbe-Settings-Modal
}

interface UIActions {
  startCharge: (team: TeamPosition, type: "berg" | "bedanken" | "matsch") => void;
  updateCharge: (team: TeamPosition, type: "berg" | "bedanken" | "matsch") => void;
  endCharge: (team: TeamPosition, type: "berg" | "bedanken" | "matsch") => void;
  resetChargeEffects: () => void;
  openCalculator: () => void;
  closeCalculator: () => void;
  setCalculatorFlipped: (flipped: boolean) => void;
  setStartScreenState: (state: "initial" | "starting" | "complete") => void;
  setStartScreenNames: (names: PlayerNames) => void;
  setMenuActiveButton: (button: string | null) => void;
  setShowIntroduction: (show: boolean) => void;
  setShowResetWarning: (show: boolean) => void;
  resetAll: () => void;
  setMenuOpen: (isOpen: boolean) => void;
  openResultatKreidetafel: (position: TeamPosition) => void;
  closeResultatKreidetafel: () => void;
  setGameInfoOpen: (isOpen: boolean) => void;
  setHistoryWarningOpen: (isOpen: boolean) => void;
  setHistoryWarningCallback: (callback: (() => void) | null) => void;
  setLastDoubleClickPosition: (position: TeamPosition | null) => void;
  showHistoryWarning: (options: {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => void;
  closeHistoryWarning: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  setKreidetafelPosition: (position: TeamPosition) => void;
  setKreidetafelStatistic: (statisticId: StatisticId) => void;
  setStrichStyle: (style: Partial<StrichStyle>) => void;
  openFarbeSettings: () => void;
  closeFarbeSettings: () => void;
  setFarbeFlipped: (isFlipped: boolean) => void;
  updateFarbeSettings: (settings: Partial<FarbeSettings>) => void;
  openScoreSettings: () => void;
  closeScoreSettings: () => void;
  updateScoreSettings: (settings: Partial<ScoreSettings>) => void;
  setScoreValue: (mode: ScoreMode, value: number) => void;
  toggleScoreEnabled: (mode: ScoreMode) => void;
  setSettingsTab: (tab: SettingsTab["id"]) => void;
  openSettings: () => void;
  closeSettings: () => void;
  cyclePictogramMode: () => void;
  setOverlayPosition: (position: TeamPosition | null) => void;
  showJassFinishNotification: (props: Omit<Partial<JassFinishNotificationConfig>, "message"> & {
    message?: SpruchMitIcon;
  }) => void;
  closeJassFinishNotification: () => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  showOnboarding: (canBeDismissed: boolean, isPWA: boolean) => void;
  hideOnboarding: () => void;
  setCardStyle: (style: CardStyle) => void;
  resetStartScreen: () => void;
  updateStrokeSettings: (settings: Partial<StrokeSettings>) => void;
  setStrokeValue: (type: keyof StrokeSettings, value: 1 | 2) => void;
  openTutorialInfo: () => void;
  closeTutorialInfo: () => void;
  closeAllOverlays: () => void;
  openMenu: () => void;
  setSplitContainer: (isOpen: boolean, position: TeamPosition) => void;
  closeGameInfo: () => void;
  setTopSwipeAnimation: (active: boolean) => void;
  setBottomSwipeAnimation: (active: boolean) => void;
  showNotification: (config: NotificationConfig) => void;
  removeNotification: (id: string) => void;
  setResultatPosition: (position: TeamPosition) => void;
  setResultatAnimationComplete: (complete: boolean) => void;
  canOpenGameInfo: () => boolean;
  setStartScreenOpen: (isOpen: boolean) => void;
  toggleMenu: () => void;
  closeMenu: () => void;
  toggleNotificationCenter: () => void;
  openNotificationCenter: () => void;
  closeNotificationCenter: () => void;
  setLoading: (loading: boolean) => void;
  setPageCta: (ctaConfig: Partial<Omit<PageCtaState, "isVisible" | "variant">> & { isVisible: true; text: string; onClick: () => void; variant?: PageCtaState["variant"] }) => void;
  resetPageCta: () => void;
  setPageCtaLoading: (isLoading: boolean) => void;
  setPageCtaDisabled: (isDisabled: boolean) => void;
  resetUI: () => void;
  openFarbeSettingsModal: () => void; // NEU: Aktion zum Öffnen des Modals
  closeFarbeSettingsModal: () => void; // NEU: Aktion zum Schliessen des Modals
  openGameInfo: () => void;
}

export type UIStore = UIState & UIActions;

type UIStoreCreator = StateCreator<UIStore>;

// Neue gemeinsame Interfaces
interface GameSettingsValues {
  farbe: number[];
  score: Record<ScoreMode, number>;
}

interface GameSettings<T> {
  values: T;
  isFlipped: boolean;
  isEnabled?: Record<string, boolean>; // Optional für Score-Settings
}

// Spezifische Load-Funktionen für jeden Settings-Typ
const loadStrokeSettings = (): StrokeSettings => {
  if (typeof window === "undefined") return DEFAULT_STROKE_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.strokes);
    if (!stored) return DEFAULT_STROKE_SETTINGS;

    const parsed = JSON.parse(stored);
    return {
      schneider: parsed.schneider ?? DEFAULT_STROKE_SETTINGS.schneider,
      kontermatsch: parsed.kontermatsch ?? DEFAULT_STROKE_SETTINGS.kontermatsch,
    };
  } catch (error) {
    console.error("Fehler beim Laden der Striche-Settings:", error);
    return DEFAULT_STROKE_SETTINGS;
  }
};

// Initialer Zustand direkt aus der Default-Konstante
const initialFarbeSettings: FarbeSettings = DEFAULT_FARBE_SETTINGS;

const initialScoreSettings: ScoreSettings = {
  values: Object.fromEntries(
    SCORE_MODES.map((mode) => [mode.id, mode.defaultValue])
  ) as Record<ScoreMode, number>,
  isFlipped: false,
  enabled: Object.fromEntries(
    SCORE_MODES.map((mode) => [mode.id, true])
  ) as Record<ScoreMode, boolean>,
};

const initialState: UIState = {
  calculator: {
    isOpen: false,
    value: 0,
    isFlipped: false,
  },
  startScreen: {
    transitionState: "initial",
    names: {1: "", 2: "", 3: "", 4: ""},
    isOpen: true,
  },
  history: {
    warning: null,
  },
  chargeEffects: {
    berg: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState(),
    },
    bedanken: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState(),
    },
    matsch: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState(),
    },
  },
  menu: {
    isOpen: false,
    activeButton: null,
    showIntroduction: false,
    showResetWarning: false,
  },
  resultatKreidetafel: {
    isOpen: false,
    swipePosition: null,
    currentStatistic: "striche",
    animationComplete: true,
  },
  settings: {
    isOpen: false,
    activeTab: "farben",
    cardStyle: "DE",
    pictogramConfig: {
      isEnabled: true,
      mode: "svg",
    },
  },
  farbeSettings: initialFarbeSettings,
  scoreSettings: initialScoreSettings,
  strokeSettings: DEFAULT_STROKE_SETTINGS,
  isGameInfoOpen: false,
  isHistoryWarningOpen: false,
  historyWarningCallback: null,
  lastDoubleClickPosition: null,
  historyWarning: {
    show: false,
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  },
  isPaused: false,
  strichStyle: defaultStrichStyle,
  overlayPosition: null,
  jassFinishNotification: {
    isOpen: false,
    mode: "share",
    message: undefined,
    onShare: async () => {},
    onBack: () => {},
    onContinue: () => {},
  },
  onboarding: {
    currentStep: OnboardingStep.INSTALL,
    hasCompletedOnboarding: true,
    show: false,
    canBeDismissed: true,
    isPWA: false,
  },
  isTutorialInfoOpen: false,
  splitContainer: {
    isOpen: false,
    position: "bottom",
  },
  tutorialBlockedUI: {
    settingsClose: false,
    calculatorClose: false,
    gameInfoClose: false,
    resultatKreidetafelClose: false,
  },
  topSwipeAnimation: false,
  bottomSwipeAnimation: false,
  notifications: [],
  isSettingsOpen: false,
  isCalculatorOpen: false,
  isMenuOpen: false,
  activeModal: null,
  isNotificationCenterOpen: false,
  isLoading: false,
  startScreenState: "idle" as StartScreenState,
  pageCta: {
    isVisible: false,
    text: "",
    onClick: null,
    loading: false,
    disabled: false,
    variant: "default",
  } as PageCtaState,
  isFarbeSettingsModalOpen: false, // NEU: Initialwert
};

// Load-Funktionen für jeden Settings-Typ
const loadFarbeSettings = (): FarbeSettings => {
  if (typeof window === "undefined") return DEFAULT_FARBE_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.farbe);
    if (!stored) return DEFAULT_FARBE_SETTINGS;

    const parsed = JSON.parse(stored);
    return {
      values: parsed.values ?? DEFAULT_FARBE_SETTINGS.values,
      cardStyle: parsed.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle,
    };
  } catch (error) {
    console.error("Fehler beim Laden der Farbe-Settings:", error);
    return DEFAULT_FARBE_SETTINGS;
  }
};

export const useUIStore = create<UIState & UIActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      // Neue Methode speziell für StartScreen Reset
      resetStartScreen: () => set((state) => ({
        ...state, // Alle anderen Settings (Farbe etc.) bleiben erhalten
        startScreen: {
          transitionState: "initial",
          names: {1: "", 2: "", 3: "", 4: ""},
          isOpen: true,
        },
      })),

      startCharge: (team, type) => set((state) => ({
        chargeEffects: {
          ...state.chargeEffects,
          [type]: {
            ...state.chargeEffects[type],
            [team]: {
              isActive: true,
              pressStartTime: Date.now(),
              chargeAmount: 0,
            },
          },
        },
      })),

      updateCharge: (team, type) => {
        const state = get();
        const effect = state.chargeEffects[type][team];
        if (effect.isActive && effect.pressStartTime) {
          const elapsed = Date.now() - effect.pressStartTime;
          set((state) => ({
            chargeEffects: {
              ...state.chargeEffects,
              [type]: {
                ...state.chargeEffects[type],
                [team]: {
                  ...effect,
                  chargeAmount: Math.min(elapsed / 1000, 1),
                },
              },
            },
          }));
        }
      },

      endCharge: (team, type) => set((state) => ({
        chargeEffects: {
          ...state.chargeEffects,
          [type]: {
            ...state.chargeEffects[type],
            [team]: createInitialChargeState(),
          },
        },
      })),

      resetChargeEffects: () => set(() => ({
        chargeEffects: {
          berg: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
          bedanken: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
          matsch: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
        },
      })),

      openCalculator: () => {
        const state = get();
        if (state.tutorialBlockedUI.calculatorClose) return;
        if (state.isMenuOpen) {
          set({ isMenuOpen: false });
        }
        set({ calculator: { ...state.calculator, isOpen: true } });
      },

      closeCalculator: () => set((state) => ({
        calculator: { ...state.calculator, isOpen: false },
      })),

      setCalculatorFlipped: (flipped) => set((state) => ({
        calculator: { ...state.calculator, isFlipped: flipped },
      })),

      setStartScreenState: (state: "initial" | "starting" | "complete") => set((prevState) => ({
        startScreen: {
          ...prevState.startScreen,
          transitionState: state,
          isOpen: state !== "complete", // Schließen wenn 'complete'
        },
      })),

      setStartScreenNames: (names: PlayerNames) =>
        set((prev) => ({
          startScreen: {
            ...prev.startScreen,
            names,
          },
        })),

      setMenuActiveButton: (button) => set((state) => ({
        menu: { ...state.menu, activeButton: button },
      })),

      setShowIntroduction: (show) => set((state) => ({
        menu: { ...state.menu, showIntroduction: show },
      })),

      setShowResetWarning: (show) => set((state) => ({
        menu: { ...state.menu, showResetWarning: show },
      })),

      resetAll: () => set(() => ({
        calculator: {
          isOpen: false,
          value: 0,
          isFlipped: false,
        },
        startScreen: {
          transitionState: "initial",
          names: {1: "", 2: "", 3: "", 4: ""},
          isOpen: true,
        },
        history: {
          warning: null,
        },
        chargeEffects: {
          berg: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
          bedanken: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
          matsch: {
            top: createInitialChargeState(),
            bottom: createInitialChargeState(),
          },
        },
        menu: {
          isOpen: false,
          activeButton: null,
          showIntroduction: false,
          showResetWarning: false,
        },
        resultatKreidetafel: {
          isOpen: false,
          swipePosition: null,
          currentStatistic: "striche",
          animationComplete: true,
        },
        historyWarning: {
          show: false,
          message: "",
          onConfirm: () => {},
          onCancel: () => {},
        },
        isMenuOpen: false,
      })),

      setMenuOpen: (isOpen: boolean) => set((state) => {
        if (isOpen && state.calculator.isOpen) {
          return {
            menu: { ...state.menu, isOpen },
            calculator: { ...state.calculator, isOpen: false },
            overlayPosition: isOpen ? state.overlayPosition : null,
          };
        }
        return {
          menu: { ...state.menu, isOpen },
          overlayPosition: isOpen ? state.overlayPosition : null,
        };
      }),

      openResultatKreidetafel: (position) => set({
        resultatKreidetafel: {
          isOpen: true,
          swipePosition: position,
          currentStatistic: "striche",
          animationComplete: false,
        },
        overlayPosition: position,
      }),
      closeResultatKreidetafel: () => set({
        resultatKreidetafel: {
          isOpen: false,
          swipePosition: null,
          currentStatistic: "striche",
          animationComplete: true,
        },
      }),
      setGameInfoOpen: (isOpen: boolean) => set({isGameInfoOpen: isOpen}),
      setHistoryWarningOpen: (isOpen: boolean) => set({isHistoryWarningOpen: isOpen}),
      setHistoryWarningCallback: (callback: (() => void) | null) =>
        set({historyWarningCallback: callback}),
      setLastDoubleClickPosition: (position) => set({
        lastDoubleClickPosition: position,
      }),
      showHistoryWarning: ({message, onConfirm, onCancel}) => {
        set({
          historyWarning: {
            show: true,
            message,
            onConfirm,
            onCancel,
          },
        });
      },
      closeHistoryWarning: () => set((state) => ({
        historyWarning: {
          ...state.historyWarning,
          show: false,
        },
      })),
      pauseGame: () => set({isPaused: true}),
      resumeGame: () => set({isPaused: false}),
      setKreidetafelPosition: (position) => set((state) => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          swipePosition: position,
        },
      })),
      setKreidetafelStatistic: (statisticId) => set((state) => ({
        resultatKreidetafel: {
          ...state.resultatKreidetafel,
          currentStatistic: statisticId,
        },
      })),
      setStrichStyle: (style: Partial<StrichStyle>) =>
        set((state) => ({
          strichStyle: {
            ...state.strichStyle,
            ...style,
          },
        })),
      openFarbeSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: true, activeTab: "farben" },
      })),
      closeFarbeSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: false },
      })),
      setFarbeFlipped: (isFlipped: boolean) => {
        const currentSettings = get().farbeSettings;
        const newSettings = {...currentSettings, isFlipped};
        saveFarbeSettings(newSettings);
        set({farbeSettings: newSettings});
      },
      updateFarbeSettings: (settings: Partial<FarbeSettings>) =>
        set((state) => {
          const newSettings = {
            ...state.farbeSettings,
            ...settings,
          };
          if (validateFarbeSettings(newSettings)) {
            saveToStorage("farbe", newSettings);
            return {farbeSettings: newSettings};
          }
          return state;
        }),
      openScoreSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: true, activeTab: "scores" },
      })),
      closeScoreSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: false },
      })),
      updateScoreSettings: (settings: Partial<ScoreSettings>) =>
        set((state) => ({
          scoreSettings: {
            ...state.scoreSettings,
            ...settings,
          },
        })),
      setScoreValue: (mode: ScoreMode, value: number) => {
        if (!validateScoreValue(mode, value)) return;

        set((state) => {
          const newSettings = {
            ...state.scoreSettings,
            values: {
              ...state.scoreSettings.values,
              [mode]: value,
            },
          };
          return {scoreSettings: newSettings};
        });
      },
      toggleScoreEnabled: (mode: ScoreMode) =>
        set((state) => ({
          scoreSettings: {
            ...state.scoreSettings,
            enabled: {
              ...state.scoreSettings.enabled,
              [mode]: !state.scoreSettings.enabled[mode],
            },
          },
        })),
      setSettingsTab: (tab: SettingsTab["id"]) => set((state) => ({
        settings: { ...state.settings, activeTab: tab },
      })),
      openSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: true },
      })),
      closeSettings: () => set((state) => ({
        settings: { ...state.settings, isOpen: false },
      })),
      cyclePictogramMode: () => set((state) => {
        const currentConfig = state.settings.pictogramConfig;
        let newConfig: PictogramConfig;

        if (!currentConfig.isEnabled) {
          // Von 'Nein' zu 'Standard'
          newConfig = {isEnabled: true, mode: "svg"};
        } else if (currentConfig.mode === "svg") {
          // Von 'Standard' zu 'Emojis'
          newConfig = {isEnabled: true, mode: "emoji"};
        } else {
          // Von 'Emojis' zurück zu 'Nein'
          newConfig = {isEnabled: false, mode: "svg"};
        }

        savePictogramSettings(newConfig);
        return {
          settings: {
            ...state.settings,
            pictogramConfig: newConfig,
          },
        };
      }),
      updateScoreValue: (mode: ScoreMode, value: number) =>
        set((state) => {
          if (!validateScoreValue(mode, value)) return state;

          const newValues = {...state.scoreSettings.values};
          newValues[mode] = value;

          // Automatische Anpassung von Berg/Schneider bei Sieg-Änderung
          if (mode === "sieg") {
            const halfValue = Math.floor(value / 2);
            newValues.berg = Math.min(newValues.berg, halfValue);
            newValues.schneider = Math.min(newValues.schneider, halfValue);
          }

          const newSettings = {
            ...state.scoreSettings,
            values: newValues,
          };

          saveScoreSettings(newSettings);
          return {scoreSettings: newSettings};
        }),
      updateSettings: (
        type: "farbe" | "score",
        settings: Partial<FarbeSettings | ScoreSettings>
      ) => {
        set((state) => {
          const currentSettings = type === "farbe" ?
            state.farbeSettings :
            state.scoreSettings;

          const newSettings = {
            ...currentSettings,
            ...settings,
          };

          saveToStorage(type, newSettings);

          return {
            [`${type}Settings`]: newSettings,
          };
        });
      },
      setOverlayPosition: (position) => set({overlayPosition: position}),
      showJassFinishNotification: (props: Omit<Partial<JassFinishNotificationConfig>, "message"> & {
        message?: SpruchMitIcon;
      }) => set({
        jassFinishNotification: {
          mode: "share",
          message: {text: "", icon: "♥️"},
          ...props,
          isOpen: true,
        },
      }),
      closeJassFinishNotification: () => set({
        jassFinishNotification: {
          isOpen: false,
          mode: "share",
          message: {text: "", icon: "♥️"},
        },
      }),
      setOnboardingStep: (step: OnboardingStep) =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            currentStep: step,
          },
        })),
      completeOnboarding: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            hasCompletedOnboarding: true,
          },
        })),
      showOnboarding: (canBeDismissed: boolean = false, isPWA: boolean = false) =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            show: true,
            canBeDismissed,
            isPWA,
          },
        })),
      hideOnboarding: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            show: false,
            hasCompletedOnboarding: true,
          },
        })),
      setCardStyle: (style: CardStyle) => set((state) => ({
        settings: {
          ...state.settings,
          cardStyle: style,
        },
      })),
      updateStrokeSettings: (settings: Partial<StrokeSettings>) => {
        if (!validateStrokeSettings(settings)) return;

        set((state) => ({
          strokeSettings: {
            ...state.strokeSettings,
            ...settings,
          },
        }));
      },
      setStrokeValue: (type: keyof StrokeSettings, value: 1 | 2) => {
        if (!validateStrokeSettings({[type]: value})) return;

        set((state) => ({
          strokeSettings: {
            ...state.strokeSettings,
            [type]: value,
          },
        }));
      },
      openTutorialInfo: () => set({isTutorialInfoOpen: true}),
      closeTutorialInfo: () => set({isTutorialInfoOpen: false}),
      closeAllOverlays: () => set((state) => ({
        ...state,
        menu: {
          ...state.menu,
          isOpen: false,
        },
        isGameInfoOpen: false,
      })),
      openMenu: () => set((state) => {
        if (state.calculator.isOpen) {
          return {
            ...state,
            isMenuOpen: true,
            calculator: { ...state.calculator, isOpen: false },
          };
        }
        return {
          ...state,
          isMenuOpen: true,
        };
      }),
      setSplitContainer: (isOpen: boolean, position: TeamPosition) =>
        set((state) => ({
          splitContainer: {
            isOpen,
            position,
          },
        })),
      closeGameInfo: () => set({isGameInfoOpen: false}),
      tutorialBlockedUI: {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false,
      },
      openGameInfo: () => set({isGameInfoOpen: true}),
      setTopSwipeAnimation: (active) => set({topSwipeAnimation: active}),
      setBottomSwipeAnimation: (active) => set({bottomSwipeAnimation: active}),
      showNotification: (config: NotificationConfig) => {
        const newNotification: Notification = {
          ...config,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };

        set((state) => {
          if (!state.notifications.some((n: Notification) => n.id === newNotification.id)) {
            state.notifications.push(newNotification);
          }
        });

        if ("duration" in newNotification &&
            typeof newNotification.duration === "number" &&
            newNotification.duration > 0 &&
            (!("actions" in newNotification) || !newNotification.actions || newNotification.actions.length === 0)) {
          setTimeout(() => {
            get().removeNotification(newNotification.id);
          }, newNotification.duration);
        }
      },
      removeNotification: (id: string) => {
        set((state) => {
          state.notifications = state.notifications.filter((n: Notification) => n.id !== id);
        });
      },
      setResultatPosition: (position: TeamPosition) =>
        set((state) => ({
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            swipePosition: position,
          },
        })),
      setResultatAnimationComplete: (complete: boolean) =>
        set((state) => ({
          resultatKreidetafel: {
            ...state.resultatKreidetafel,
            animationComplete: complete,
          },
        })),
      canOpenGameInfo: () => {
        const state = get();
        return !(
          state.startScreen.isOpen ||
          state.settings.isOpen ||
          state.calculator.isOpen ||
          state.menu.isOpen ||
          state.resultatKreidetafel.isOpen ||
          state.jassFinishNotification.isOpen ||
          state.isTutorialInfoOpen ||
          state.splitContainer.isOpen
        );
      },
      setStartScreenOpen: (isOpen: boolean) => set((prevState) => ({
        startScreen: {
          ...prevState.startScreen,
          isOpen,
        },
      })),
      toggleMenu: () => set((state) => {
        const newMenuState = !state.isMenuOpen;
        if (newMenuState && state.calculator.isOpen) {
          return {
            isMenuOpen: newMenuState,
            calculator: { ...state.calculator, isOpen: false },
          };
        }
        return {
          isMenuOpen: newMenuState,
        };
      }),
      closeMenu: () => set({isMenuOpen: false}),
      toggleNotificationCenter: () => set((state) => {
        state.isNotificationCenterOpen = !state.isNotificationCenterOpen;
      }),
      openNotificationCenter: () => set({isNotificationCenterOpen: true}),
      closeNotificationCenter: () => set({isNotificationCenterOpen: false}),
      setLoading: (loading: boolean) => set({isLoading: loading}),
      setPageCta: (ctaConfig) =>
        set((state) => {
          if (ctaConfig.isVisible && ctaConfig.text && ctaConfig.onClick) {
            state.pageCta = {
              isVisible: true,
              text: ctaConfig.text,
              onClick: ctaConfig.onClick,
              loading: ctaConfig.loading ?? false,
              disabled: ctaConfig.disabled ?? false,
              variant: ctaConfig.variant ?? "default",
            };
          } else {
            console.warn("setPageCta received invalid configuration:", ctaConfig);
            state.pageCta = {...initialState.pageCta};
          }
        }),
      resetPageCta: () =>
        set((state) => {
          state.pageCta = {...initialState.pageCta};
        }),
      setPageCtaLoading: (isLoading) =>
        set((state) => {
          if (state.pageCta.isVisible) {
            state.pageCta.loading = isLoading;
          }
        }),
      setPageCtaDisabled: (isDisabled) =>
        set((state) => {
          if (state.pageCta.isVisible) {
            state.pageCta.disabled = isDisabled;
          }
        }),
      resetUI: () => set(initialState),
      openFarbeSettingsModal: () => set({ isFarbeSettingsModalOpen: true }),
      closeFarbeSettingsModal: () => set({ isFarbeSettingsModalOpen: false }),
    })),
    {
      name: "jass-ui-storage",
      partialize: (state) => ({
        farbeSettings: state.farbeSettings,
        scoreSettings: state.scoreSettings,
        strokeSettings: state.strokeSettings,
        settings: {
          ...state.settings,
          cardStyle: state.settings.cardStyle,
          pictogramConfig: state.settings.pictogramConfig,
        },
      }),
    }
  )
);
// Hydration manuell durchführen
if (typeof window !== "undefined") {
  useUIStore.persist.rehydrate();
}

