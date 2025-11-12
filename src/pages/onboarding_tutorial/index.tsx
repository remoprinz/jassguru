"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';
import { isPWA } from '@/utils/browserDetection';
import { SeoHead } from '@/components/layout/SeoHead';
import type { BrowserOnboardingStep } from '@/constants/onboardingContent';

/**
 * Onboarding-Tutorial-Seite: Zeigt das Browser-Onboarding direkt an
 * 
 * Diese Seite kann geteilt werden, um anderen Nutzern das Onboarding-Tutorial zu zeigen.
 * URL: https://jassguru.ch/onboarding_tutorial
 */
const OnboardingTutorialPage: React.FC = () => {
  const router = useRouter();
  const [isPWAInstalled] = useState(() => isPWA());
  
  // Immer Browser-Onboarding zeigen (unabhängig von PWA-Status)
  const isBrowserOnboardingRequired = true;
  
  // Onboarding Hook
  const {
    currentStep,
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed,
  } = useOnboardingFlow(isBrowserOnboardingRequired);

  // Custom Dismiss Handler - navigiere zurück zur Startseite
  const handleOnboardingDismiss = () => {
    handleDismiss();
    router.push('/start');
  };

  return (
    <MainLayout>
      <SeoHead 
        title="Jassguru Onboarding Tutorial - So funktioniert's"
        description="Lerne, wie du Jassguru verwendest. Schritt-für-Schritt Anleitung für die Installation und Nutzung der Jass-App."
      />
      <OnboardingFlow
        show={true}
        step={currentStep as BrowserOnboardingStep}
        content={content}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onDismiss={handleOnboardingDismiss}
        canBeDismissed={canBeDismissed}
        isPWA={isPWAInstalled}
        isBrowserOnboarding={isBrowserOnboardingRequired}
      />
    </MainLayout>
  );
};

export default OnboardingTutorialPage;

