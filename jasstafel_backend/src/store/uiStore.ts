// src/types/uiStore.ts (oder src/store/uiStore.ts)

import { create, StateCreator } from 'zustand';
import type { TeamPosition, PlayerNames, SettingsTab, ScoreSettings, PictogramConfig } from '../types/jass';
import { StatisticId } from '../types/statistikTypes';
import { FARBE_MODES } from '../config/FarbeSettings';
import { defaultGameSettings } from '../config/GameSettings';
import { BERG_SCORE, SIEG_SCORE, SCHNEIDER_SCORE } from '../config/GameSettings';

interface ChargeState {
  isActive: boolean;
  pressStartTime: number | null;
  chargeAmount: number;
}

const createInitialChargeState = (): ChargeState => ({
  isActive: false,
  pressStartTime: null,
  chargeAmount: 0
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
    color: 'rgba(255, 255, 255, 0.9)',
    opacity: 0.9
  },
  diagonalStrich: {
    length: 28,
    width: 1.5,
    angle: 45,
    offset: { x: -1, y: 0 }
  },
  container: {
    spacing: 4,
    groupSpacing: 8,
    scale: 1
  }
};

export interface UIState {
  calculator: {
    isOpen: boolean;
    value: number;
    isFlipped: boolean;
  };
  gameInfo: {
    isOpen: boolean;
  };
  startScreen: {
    transitionState: 'initial' | 'starting' | 'complete';
    names: PlayerNames;
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
    currentStatistic: 'striche' | 'jasspunkte';
  };
  settings: {
    isOpen: boolean;
    activeTab: SettingsTab['id'];
    pictogramConfig: PictogramConfig;
  };
  farbeSettings: FarbeSettings;
  scoreSettings: ScoreSettings;
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
}

interface UIActions {
  startCharge: (team: TeamPosition, type: 'berg' | 'bedanken' | 'matsch') => void;
  updateCharge: (team: TeamPosition, type: 'berg' | 'bedanken' | 'matsch') => void;
  endCharge: (team: TeamPosition, type: 'berg' | 'bedanken' | 'matsch') => void;
  resetChargeEffects: () => void;
  openCalculator: () => void;
  closeCalculator: () => void;
  setCalculatorFlipped: (flipped: boolean) => void;
  setStartScreenState: (state: 'initial' | 'starting' | 'complete') => void;
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
  setFarbeMultiplier: (index: number, value: number) => void;
  setFarbeFlipped: (isFlipped: boolean) => void;
  updateFarbeSettings: (settings: Partial<FarbeSettings>) => void;
  openScoreSettings: () => void;
  closeScoreSettings: () => void;
  updateScoreSettings: (settings: Partial<ScoreSettings>) => void;
  setSettingsTab: (tab: SettingsTab['id']) => void;
  openSettings: () => void;
  closeSettings: () => void;
  cyclePictogramMode: () => void;
}

export type UIStore = UIState & UIActions;

type UIStoreCreator = StateCreator<UIStore>;

// Keys für localStorage
const FARBE_SETTINGS_KEY = 'jassguru_farbe_settings';
const SCORE_SETTINGS_KEY = 'jassguru_score_settings';
const PICTOGRAM_SETTINGS_KEY = 'jassguru_pictogram_settings';

// Interfaces
interface FarbeSettings {
  multipliers: number[];
  isFlipped: boolean;
}

interface SettingsState {
  activeTab: SettingsTab['id'];
  isOpen: boolean;
}

// Hilfsfunktionen für Farbe-Settings
const loadStoredFarbeSettings = (): Partial<FarbeSettings> => {
  try {
    const stored = localStorage.getItem(FARBE_SETTINGS_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Fehler beim Laden der Farben-Settings:', error);
    return {};
  }
};

const saveFarbeSettings = (settings: FarbeSettings) => {
  try {
    localStorage.setItem(FARBE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Fehler beim Speichern der Farben-Settings:', error);
  }
};

// Hilfsfunktionen für Score-Settings
const loadStoredScoreSettings = (): Partial<ScoreSettings> => {
  try {
    const stored = localStorage.getItem(SCORE_SETTINGS_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Fehler beim Laden der Score-Settings:', error);
    return {};
  }
};

const saveScoreSettings = (settings: ScoreSettings) => {
  try {
    localStorage.setItem(SCORE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Fehler beim Speichern der Score-Settings:', error);
  }
};

// Neue Hilfsfunktionen für Pictogram-Settings
const loadStoredPictogramSettings = () => {
  if (typeof window === 'undefined') {
    return { isEnabled: true }; // Default-Wert für SSR
  }
  try {
    const stored = localStorage.getItem('pictogramSettings');
    return stored ? JSON.parse(stored) : { isEnabled: true };
  } catch (error) {
    console.error('Fehler beim Laden der Piktogramm-Settings:', error);
    return { isEnabled: true };
  }
};

const savePictogramSettings = (settings: PictogramConfig) => {
  try {
    localStorage.setItem(PICTOGRAM_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Fehler beim Speichern der Piktogramm-Settings:', error);
  }
};

// Validierung der Multiplier
const validateMultipliers = (multipliers: number[]): boolean => {
  if (!multipliers || multipliers.length !== FARBE_MODES.length) return false;
  return multipliers.every(m => m >= 0 && m <= 12);
};

// Initialisierung mit gespeicherten oder Standard-Werten
const initialFarbeSettings = {
  multipliers: FARBE_MODES.map(mode => mode.multiplier),
  isFlipped: false,
  ...loadStoredFarbeSettings()
};

// Zuerst eine Hilfsfunktion für die initialen Score-Settings
const getInitialScoreSettings = (): ScoreSettings => {
  // Wenn wir auf dem Server sind
  if (typeof window === 'undefined') {
    return {
      siegScore: SIEG_SCORE,
      bergScore: BERG_SCORE,
      schneiderScore: SCHNEIDER_SCORE,
      isBergEnabled: true,
      isSchneiderEnabled: true
    };
  }

  // Wenn wir auf dem Client sind, laden wir aus dem localStorage
  const stored = localStorage.getItem('scoreSettings');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Fehler beim Laden der Score-Settings:', e);
    }
  }

  // Fallback zu Default-Werten
  return {
    siegScore: SIEG_SCORE,
    bergScore: BERG_SCORE,
    schneiderScore: SCHNEIDER_SCORE,
    isBergEnabled: true,
    isSchneiderEnabled: true
  };
};

const initialScoreSettings = {
  siegScore: defaultGameSettings.siegScore,
  bergScore: defaultGameSettings.bergScore,
  schneiderScore: defaultGameSettings.schneiderScore,
  isBergEnabled: true,
  isSchneiderEnabled: true,
  ...loadStoredScoreSettings()
};

const initialPictogramSettings: PictogramConfig = {
  ...{
    isEnabled: false,
    mode: 'svg'
  },
  ...loadStoredPictogramSettings()
};

export const useUIStore = create<UIStore>((set, get) => ({
  calculator: {
    isOpen: false,
    value: 0,
    isFlipped: false
  },
  gameInfo: {
    isOpen: false
  },
  startScreen: {
    transitionState: 'initial',
    names: { 1: '', 2: '', 3: '', 4: '' }
  },
  history: {
    warning: null
  },
  chargeEffects: { 
    berg: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState()
    },
    bedanken: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState()
    },
    matsch: {
      top: createInitialChargeState(),
      bottom: createInitialChargeState()
    }
  },
  menu: {
    isOpen: false,
    activeButton: null,
    showIntroduction: false,
    showResetWarning: false
  },
  resultatKreidetafel: {
    isOpen: false,
    swipePosition: null,
    currentStatistic: 'striche'
  },
  settings: {
    isOpen: false,
    activeTab: 'farben',
    pictogramConfig: initialPictogramSettings
  },
  farbeSettings: initialFarbeSettings,
  scoreSettings: getInitialScoreSettings(),
  isGameInfoOpen: false,
  isHistoryWarningOpen: false,
  historyWarningCallback: null,
  lastDoubleClickPosition: null,
  historyWarning: {
    show: false,
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  },
  isPaused: false,
  strichStyle: defaultStrichStyle,

  startCharge: (team, type) => set((state) => ({
    chargeEffects: {
      ...state.chargeEffects,
      [type]: {
        ...state.chargeEffects[type],
        [team]: {
          isActive: true,
          pressStartTime: Date.now(),
          chargeAmount: 0
        }
      }
    }
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
              chargeAmount: Math.min(elapsed / 1000, 1)
            }
          }
        }
      }));
    }
  },

  endCharge: (team, type) => set((state) => ({
    chargeEffects: {
      ...state.chargeEffects,
      [type]: {
        ...state.chargeEffects[type],
        [team]: createInitialChargeState()
      }
    }
  })),

  resetChargeEffects: () => set(() => ({
    chargeEffects: {
      berg: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      },
      bedanken: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      },
      matsch: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      }
    }
  })),

  openCalculator: () => set((state) => ({ 
    calculator: { ...state.calculator, isOpen: true } 
  })),
  
  closeCalculator: () => set((state) => ({ 
    calculator: { ...state.calculator, isOpen: false } 
  })),
  
  setCalculatorFlipped: (flipped) => set((state) => ({ 
    calculator: { ...state.calculator, isFlipped: flipped } 
  })),
  
  setStartScreenState: (state: 'initial' | 'starting' | 'complete') => 
    set(prev => ({
      startScreen: {
        ...prev.startScreen,
        transitionState: state
      }
    })),
    
  setStartScreenNames: (names: PlayerNames) =>
    set(prev => ({
      startScreen: {
        ...prev.startScreen,
        names
      }
    })),
    
  setMenuActiveButton: (button) => set((state) => ({
    menu: { ...state.menu, activeButton: button }
  })),
  
  setShowIntroduction: (show) => set((state) => ({
    menu: { ...state.menu, showIntroduction: show }
  })),
  
  setShowResetWarning: (show) => set((state) => ({
    menu: { ...state.menu, showResetWarning: show }
  })),
  
  resetAll: () => set(() => ({
    calculator: {
      isOpen: false,
      value: 0,
      isFlipped: false
    },
    gameInfo: {
      isOpen: false
    },
    startScreen: {
      transitionState: 'initial',
      names: { 1: '', 2: '', 3: '', 4: '' }
    },
    history: {
      warning: null
    },
    chargeEffects: {
      berg: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      },
      bedanken: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      },
      matsch: {
        top: createInitialChargeState(),
        bottom: createInitialChargeState()
      }
    },
    menu: {
      isOpen: false,
      activeButton: null,
      showIntroduction: false,
      showResetWarning: false
    },
    resultatKreidetafel: {
      isOpen: false,
      swipePosition: null,
      currentStatistic: 'striche'
    },
    historyWarning: {
      show: false,
      message: '',
      onConfirm: () => {},
      onCancel: () => {}
    }
  })),

  setMenuOpen: (isOpen) => set((state) => ({
    menu: { ...state.menu, isOpen }
  })),

  openResultatKreidetafel: (position) => set({
    resultatKreidetafel: {
      isOpen: true,
      swipePosition: position,
      currentStatistic: 'striche'
    }
  }),
  closeResultatKreidetafel: () => set({
    resultatKreidetafel: {
      isOpen: false,
      swipePosition: null,
      currentStatistic: 'striche'
    }
  }),
  setGameInfoOpen: (isOpen: boolean) => set({ isGameInfoOpen: isOpen }),
  setHistoryWarningOpen: (isOpen: boolean) => set({ isHistoryWarningOpen: isOpen }),
  setHistoryWarningCallback: (callback: (() => void) | null) => 
    set({ historyWarningCallback: callback }),
  setLastDoubleClickPosition: (position) => set({ 
    lastDoubleClickPosition: position 
  }),
  showHistoryWarning: ({ message, onConfirm, onCancel }) => {
    set({
      historyWarning: {
        show: true,
        message,
        onConfirm,
        onCancel
      }
    });
  },
  closeHistoryWarning: () => set(state => ({
    historyWarning: {
      ...state.historyWarning,
      show: false
    }
  })),
  pauseGame: () => set({ isPaused: true }),
  resumeGame: () => set({ isPaused: false }),
  setKreidetafelPosition: (position) => set((state) => ({
    resultatKreidetafel: {
      ...state.resultatKreidetafel,
      swipePosition: position
    }
  })),
  setKreidetafelStatistic: (statisticId) => set((state) => ({
    resultatKreidetafel: {
      ...state.resultatKreidetafel,
      currentStatistic: statisticId
    }
  })),
  setStrichStyle: (style: Partial<StrichStyle>) => 
    set(state => ({
      strichStyle: {
        ...state.strichStyle,
        ...style
      }
    })),
  openFarbeSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: true, activeTab: 'farben' }
  })),
  closeFarbeSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: false }
  })),
  setFarbeMultiplier: (index: number, value: number) => {
    const currentSettings = get().farbeSettings;
    const newMultipliers = [...currentSettings.multipliers];
    newMultipliers[index] = value;
    if (validateMultipliers(newMultipliers)) {
      const newSettings = { ...currentSettings, multipliers: newMultipliers };
      saveFarbeSettings(newSettings);
      set({ farbeSettings: newSettings });
    }
  },
  setFarbeFlipped: (isFlipped: boolean) => {
    const currentSettings = get().farbeSettings;
    const newSettings = { ...currentSettings, isFlipped };
    saveFarbeSettings(newSettings);
    set({ farbeSettings: newSettings });
  },
  updateFarbeSettings: (settings: Partial<FarbeSettings>) => {
    const currentSettings = get().farbeSettings;
    const newSettings = { ...currentSettings, ...settings };
    saveFarbeSettings(newSettings);
    set({ farbeSettings: newSettings });
  },
  openScoreSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: true, activeTab: 'scores' }
  })),
  closeScoreSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: false }
  })),
  updateScoreSettings: (settings: Partial<ScoreSettings>) => 
    set(state => {
      const newSettings = { ...state.scoreSettings, ...settings };
      saveScoreSettings(newSettings);
      return { scoreSettings: newSettings };
    }),
  setSettingsTab: (tab: SettingsTab['id']) => set(state => ({
    settings: { ...state.settings, activeTab: tab }
  })),
  openSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: true }
  })),
  closeSettings: () => set(state => ({
    settings: { ...state.settings, isOpen: false }
  })),
  cyclePictogramMode: () => set(state => {
    const currentConfig = state.settings.pictogramConfig;
    let newConfig: PictogramConfig;

    if (!currentConfig.isEnabled) {
      // Von 'Nein' zu 'Standard'
      newConfig = { isEnabled: true, mode: 'svg' };
    } else if (currentConfig.mode === 'svg') {
      // Von 'Standard' zu 'Emojis'
      newConfig = { isEnabled: true, mode: 'emoji' };
    } else {
      // Von 'Emojis' zurück zu 'Nein'
      newConfig = { isEnabled: false, mode: 'svg' };
    }

    savePictogramSettings(newConfig);
    return {
      settings: {
        ...state.settings,
        pictogramConfig: newConfig
      }
    };
  })
}));
