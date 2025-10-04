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
  // const isDevelopment = process.env.NODE_ENV === "development";

  // --- Hooks immer aufrufen ---
  const deviceOS = getDeviceOS();
  // Schweiz: Mehr iPhone-Nutzer → iOS als Default für Desktop/other
  const osKey = deviceOS === "other" ? "iOS" : deviceOS as DeviceOS;
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

  if (!content) { // Logge den Fehler immer, wenn kein Content da ist (sollte nicht passieren)
    console.error(`Kein Content gefunden für Step: ${currentStep}`);
  }

  return {
    currentStep,
    content: content || {title: "", message: ""},
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed: true,
    isBrowserOnboarding,
  };
};
