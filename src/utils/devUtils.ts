// Dev Environment Detection
import {useTutorialStore} from "../store/tutorialStore";

export const isDev = process.env.NODE_ENV === "development";

// Neue Konstante für Tutorial-Entwicklung
export const FORCE_TUTORIAL = true;

// NEU: Konstante für Browser-Onboarding Development (im Dev-Modus deaktiviert für direkten Zugang)
export const FORCE_BROWSER_ONBOARDING = false;

// Zentrale Dev Flags
export const DEV_FLAGS = {
  FORCE_PWA_INSTALL: isDev ? false : true,
  FORCE_TUTORIAL: true,
  FORCE_BROWSER_ONBOARDING: false, // NEU: Flag für Browser-Onboarding (Dev-Modus: direkter Zugang)
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
  // Zusätzlicher Check: OnboardingFlow niemals auf View-Pfaden zeigen
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/view/')) {
      return false; // Niemals OnboardingFlow auf öffentlichen View-Pfaden
    }
  }
  
  // Im Development-Modus: Zeige Onboarding nur wenn FORCE_BROWSER_ONBOARDING aktiv ist
  if (isDev) {
    if (FORCE_BROWSER_ONBOARDING) {
      return !isPWAInstalled && !isPathExcluded;
    } else {
      return false; // Kein Onboarding im Dev-Modus wenn FORCE_BROWSER_ONBOARDING = false
    }
  }
  
  // In Produktion: Normale Logik
  return !isPWAInstalled && !isPathExcluded;
};

// Typed exports
export type DevFlags = typeof DEV_FLAGS;
