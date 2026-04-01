"use client";

import React from 'react';
import { useRouter } from 'next/router';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { SeoHead } from '@/components/layout/SeoHead';

/**
 * Onboarding-Tutorial-Seite: Fullscreen PWA-Installationsanleitung
 * URL: https://jassguru.ch/onboarding_tutorial
 */
const OnboardingTutorialPage: React.FC = () => {
  const router = useRouter();

  const handleDismiss = () => {
    router.push('/start');
  };

  return (
    <>
      <SeoHead
        title="Jassguru Onboarding Tutorial - So funktioniert's"
        description="Lerne, wie du Jassguru verwendest. Schritt-für-Schritt Anleitung für die Installation und Nutzung der Jass-App."
      />
      <OnboardingFlow show={true} onDismiss={handleDismiss} />
    </>
  );
};

export default OnboardingTutorialPage;
