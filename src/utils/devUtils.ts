// Dev Environment Detection
import {useTutorialStore} from "../store/tutorialStore";

export const isDev = process.env.NODE_ENV === "development";

// Neue Konstante für Tutorial-Entwicklung
export const FORCE_TUTORIAL = true;

// NEU: Konstante für Browser-Onboarding Development
export const FORCE_BROWSER_ONBOARDING = true;

// Zentrale Dev Flags
export const DEV_FLAGS = {
  FORCE_PWA_INSTALL: isDev ? false : true,
  FORCE_TUTORIAL: true,
  FORCE_BROWSER_ONBOARDING: true, // NEU: Flag für Browser-Onboarding
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

// NEU: Helper für Browser-Onboarding
export const shouldShowBrowserOnboarding = (isPWAInstalled: boolean, isPathExcluded: boolean): boolean => {
  // Im Development-Modus: Zeige Onboarding wenn FORCE_BROWSER_ONBOARDING aktiv ist
  if (isDev && FORCE_BROWSER_ONBOARDING) {
    return !isPWAInstalled && !isPathExcluded;
  }
  
  // In Produktion: Normale Logik
  return !isPWAInstalled && !isPathExcluded;
};

// Typed exports
export type DevFlags = typeof DEV_FLAGS;
