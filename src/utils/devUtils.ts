// Dev Environment Detection
import {useTutorialStore} from "../store/tutorialStore";

export const isDev = process.env.NODE_ENV === "development";

// Neue Konstante für Tutorial-Entwicklung
export const FORCE_TUTORIAL = false;

// Zentrale Dev Flags
export const DEV_FLAGS = {
  FORCE_PWA_INSTALL: isDev ? false : true,
  FORCE_TUTORIAL: false,
  SKIP_BROWSER_CHECK: isDev ? true : false,
} as const;

// Typed Helper Functions
export const shouldShowTutorial = () => {
  if (isDev && FORCE_TUTORIAL) {
    return true; // Im Dev-Mode mit FORCE_TUTORIAL immer true
  }

  // Normale Logik für Produktion
  const tutorialStore = useTutorialStore.getState();
  return !tutorialStore.hasCompletedTutorial;
};

export const shouldForcePWAInstall = (): boolean => {
  return !isDev && DEV_FLAGS.FORCE_PWA_INSTALL;
};

// Typed exports
export type DevFlags = typeof DEV_FLAGS;
