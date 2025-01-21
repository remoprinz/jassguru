import { useState, useEffect, useCallback } from 'react';
import { 
  IOS_BROWSER_STEPS,
  ANDROID_BROWSER_STEPS,
  iOSBrowserStep,
  AndroidBrowserStep,
  OnboardingContent,
  BROWSER_ONBOARDING,
  AppOnboardingStep
} from '../constants/onboardingContent';
import { useUIStore } from '../store/uiStore';
import { getDeviceOS } from '../utils/deviceUtils';
import { FaInfoCircle } from 'react-icons/fa';
import { IconType } from 'react-icons';

type DeviceOS = 'iOS' | 'Android';

// Type Guard für Content mit Image
const hasImage = (content: OnboardingContent): content is OnboardingContent & { image: string } => {
  return 'image' in content;
};

// 1. APP_ONBOARDING als Record definieren
const APP_ONBOARDING: Record<AppOnboardingStep, OnboardingContent> = {
  [AppOnboardingStep.INTRODUCTION]: {
    title: "Willkommen",
    message: "Willkommen bei Jassguru",
    icon: FaInfoCircle as IconType
  }
  // ... weitere Schritte hinzufügen
};

export const useOnboardingFlow = (isBrowserOnboarding: boolean = false) => {
  const deviceOS = getDeviceOS();
  const osKey = deviceOS === 'other' ? 'Android' : deviceOS as DeviceOS;
  
  // OS-spezifische Steps
  const STEPS = osKey === 'iOS' ? IOS_BROWSER_STEPS : ANDROID_BROWSER_STEPS;
  type CurrentStepType = typeof osKey extends 'iOS' ? iOSBrowserStep : AndroidBrowserStep;

  const [currentStep, setCurrentStep] = useState<CurrentStepType | AppOnboardingStep>(
    isBrowserOnboarding ? 'WELCOME_SCREEN' : AppOnboardingStep.INTRODUCTION
  );

  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Preload das nächste Bild
  useEffect(() => {
    if (isBrowserOnboarding) {
      const steps = Object.values(STEPS);
      const currentIndex = steps.indexOf(currentStep as CurrentStepType);
      const nextStep = steps[currentIndex + 1];
      
      if (nextStep) {
        const nextContent = BROWSER_ONBOARDING[osKey][nextStep as keyof typeof BROWSER_ONBOARDING[typeof osKey]];
        if ('image' in nextContent) {
          const img = new Image();
          img.src = nextContent.image;
        }
      }
    }
  }, [currentStep, isBrowserOnboarding, osKey]);

  // Navigation
  const handleNext = () => {
    const steps = Object.values(isBrowserOnboarding ? STEPS : AppOnboardingStep);
    const currentIndex = steps.indexOf(currentStep);
    setCurrentStep(currentIndex < steps.length - 1 
      ? steps[currentIndex + 1] 
      : steps[0]
    );
  };

  const handlePrevious = () => {
    const steps = Object.values(isBrowserOnboarding ? STEPS : AppOnboardingStep);
    const currentIndex = steps.indexOf(currentStep);
    setCurrentStep(currentIndex > 0 
      ? steps[currentIndex - 1] 
      : steps[steps.length - 1]
    );
  };

  const handleDismiss = useCallback(() => {
    useUIStore.getState().hideOnboarding();
    setShowOnboarding(false);
  }, []);

  // 2. Sichere Content-Zuweisung mit Nullish Coalescing
  const content = isBrowserOnboarding 
    ? BROWSER_ONBOARDING[osKey]?.[currentStep as keyof typeof BROWSER_ONBOARDING[typeof osKey]] 
    : APP_ONBOARDING[currentStep as AppOnboardingStep] ?? {
        title: "Fehler",
        message: "Inhalt nicht gefunden",
        icon: FaInfoCircle as IconType
      };

  // 3. Optional: Validierung hinzufügen
  if (!content) {
    console.error(`Kein Content gefunden für Step: ${currentStep}`);
  }

  return {
    currentStep,
    showOnboarding: isBrowserOnboarding || showOnboarding,
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed: true,
    isBrowserOnboarding
  };
}; 