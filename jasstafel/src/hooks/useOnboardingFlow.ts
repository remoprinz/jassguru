import {useState, useEffect, useCallback} from "react";
import {
  IOS_BROWSER_STEPS,
  ANDROID_BROWSER_STEPS,
  iOSBrowserStep,
  AndroidBrowserStep,
  OnboardingContent,
  BROWSER_ONBOARDING,
  AppOnboardingStep,
} from "../constants/onboardingContent";
import {useUIStore} from "../store/uiStore";
import {getDeviceOS} from "../utils/deviceUtils";
import {FaInfoCircle} from "react-icons/fa";
import {IconType} from "react-icons";

type DeviceOS = "iOS" | "Android";

// Type Guard für Content mit Image
const hasImage = (content: OnboardingContent): content is OnboardingContent & { image: string } => {
  return "image" in content;
};

// 1. APP_ONBOARDING als Record definieren
const APP_ONBOARDING: Record<AppOnboardingStep, OnboardingContent> = {
  [AppOnboardingStep.INTRODUCTION]: {
    title: "Willkommen",
    message: "Willkommen bei Jassguru",
    icon: FaInfoCircle as IconType,
  },
  // ... weitere Schritte hinzufügen
};

export const useOnboardingFlow = (isBrowserOnboarding: boolean = false) => {
  const isDevelopment = process.env.NODE_ENV === "development";

  // --- Hooks immer aufrufen ---
  const deviceOS = getDeviceOS(); // Kein Hook, aber Teil der Logik
  const osKey = deviceOS === "other" ? "Android" : deviceOS as DeviceOS;
  const STEPS = osKey === "iOS" ? IOS_BROWSER_STEPS : ANDROID_BROWSER_STEPS;
  type CurrentStepType = typeof osKey extends "iOS" ? iOSBrowserStep : AndroidBrowserStep;

  const [currentStep, setCurrentStep] = useState<CurrentStepType | AppOnboardingStep>(
    isBrowserOnboarding ? "WELCOME_SCREEN" : AppOnboardingStep.INTRODUCTION
  );
  const [showOnboardingState, setShowOnboardingState] = useState(false); // Interner State

  // Preload-Effekt (immer ausführen)
  useEffect(() => {
    // Im Dev-Mode den Effekt überspringen, wenn nicht benötigt?
    // Oder einfach laufen lassen, da Preload nicht schadet.
    if (isBrowserOnboarding) {
      const steps = Object.values(STEPS);
      const currentIndex = steps.indexOf(currentStep as CurrentStepType);
      const nextStep = steps[currentIndex + 1];

      if (nextStep) {
        const nextContent = BROWSER_ONBOARDING[osKey][nextStep as keyof typeof BROWSER_ONBOARDING[typeof osKey]];
        if ("image" in nextContent) {
          const img = new Image();
          img.src = nextContent.image;
        }
      }
    }
  }, [currentStep, isBrowserOnboarding, osKey, STEPS]); // STEPS hinzugefügt

  // Navigation (immer definieren)
  const handleNext = useCallback(() => {
    const steps = Object.values(isBrowserOnboarding ? STEPS : AppOnboardingStep);
    const currentIndex = steps.indexOf(currentStep);
    setCurrentStep(currentIndex < steps.length - 1 ?
      steps[currentIndex + 1] :
      steps[0]
    );
  }, [isBrowserOnboarding, STEPS, currentStep]); // Abhängigkeiten hinzugefügt

  const handlePrevious = useCallback(() => {
    const steps = Object.values(isBrowserOnboarding ? STEPS : AppOnboardingStep);
    const currentIndex = steps.indexOf(currentStep);
    setCurrentStep(currentIndex > 0 ?
      steps[currentIndex - 1] :
      steps[steps.length - 1]
    );
  }, [isBrowserOnboarding, STEPS, currentStep]); // Abhängigkeiten hinzugefügt

  const handleDismiss = useCallback(() => {
    useUIStore.getState().hideOnboarding();
    setShowOnboardingState(false);
  }, []);

  // Content (immer berechnen)
  const content = isBrowserOnboarding ?
    BROWSER_ONBOARDING[osKey]?.[currentStep as keyof typeof BROWSER_ONBOARDING[typeof osKey]] :
    APP_ONBOARDING[currentStep as AppOnboardingStep] ?? {
      title: "Fehler",
      message: "Inhalt nicht gefunden",
      icon: FaInfoCircle as IconType,
    };

  if (!content && !isDevelopment) { // Fehler nur loggen, wenn nicht im Dev-Dummy-Return
    console.error(`Kein Content gefunden für Step: ${currentStep}`);
  }

  // --- Bedingter Rückgabewert ---
  // Hier steuern wir, was zurückgegeben wird, basierend auf isDevelopment
  const finalShowOnboarding = isDevelopment ? false : (isBrowserOnboarding || showOnboardingState);

  // Im Development Mode loggen wir weiterhin, aber geben kontrollierte Werte zurück
  if (isDevelopment) {
    console.log("useOnboardingFlow: Development Mode erkannt - Onboarding deaktiviert");
  }

  return {
    currentStep,
    showOnboarding: finalShowOnboarding, // Hier die Logik anwenden
    content: content || {title: "", message: ""}, // Fallback für Content
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed: true,
    isBrowserOnboarding,
  };
};
