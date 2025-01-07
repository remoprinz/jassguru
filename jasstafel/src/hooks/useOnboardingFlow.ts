import { useState, useEffect, useCallback } from 'react';
import { 
  IOS_BROWSER_STEPS,
  ANDROID_BROWSER_STEPS,
  iOSBrowserStep,
  AndroidBrowserStep,
  AppOnboardingStep,
  OnboardingContent
} from '../types/jass';
import { useUIStore } from '../store/uiStore';
import { BROWSER_ONBOARDING, APP_ONBOARDING } from '../constants/onboardingContent';
import { getDeviceOS } from '../utils/deviceUtils';

type DeviceOS = 'iOS' | 'Android';

// Type Guard für Content mit Image
const hasImage = (content: OnboardingContent): content is OnboardingContent & { image: string } => {
  return 'image' in content;
};

export const useOnboardingFlow = (isBrowserOnboarding: boolean = false) => {
  const deviceOS = getDeviceOS();
  const osKey = deviceOS === 'other' ? 'Android' : deviceOS as DeviceOS;
  
  // OS-spezifische Steps
  const STEPS = osKey === 'iOS' ? IOS_BROWSER_STEPS : ANDROID_BROWSER_STEPS;
  type CurrentStepType = typeof osKey extends 'iOS' ? iOSBrowserStep : AndroidBrowserStep;

  const [currentStep, setCurrentStep] = useState<CurrentStepType | AppOnboardingStep>(
    isBrowserOnboarding ? STEPS.INSTALL_WELCOME : AppOnboardingStep.INTRODUCTION
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

  // Content basierend auf aktuellem Step
  const content = isBrowserOnboarding 
    ? BROWSER_ONBOARDING[osKey][currentStep as keyof typeof BROWSER_ONBOARDING[typeof osKey]]
    : APP_ONBOARDING[currentStep as keyof typeof APP_ONBOARDING];

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