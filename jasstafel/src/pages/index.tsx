"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import WelcomeScreen from "@/components/auth/WelcomeScreen";
import {useAuthStore} from "@/store/authStore";
import {isPWA} from "@/utils/browserDetection";
import {useUIStore} from "@/store/uiStore";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import {useOnboardingFlow} from "@/hooks/useOnboardingFlow";
import {BrowserOnboardingStep} from "@/constants/onboardingContent";

// Einfache isDesktopDevice-Funktion für die Geräteerkennung
function isDesktopDevice(): boolean {
  if (typeof window !== "undefined") {
    // Keine Touch-Unterstützung deutet auf Desktop hin
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      return true;
    }
    // Große Bildschirme sind wahrscheinlich Desktops (>= 1024px)
    if (window.innerWidth >= 1024) {
      return true;
    }
  }
  return false;
}

export default function Home() {
  const router = useRouter();
  const {status, isGuest, initAuth} = useAuthStore();
  const [isClient, setIsClient] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Onboarding Flow Hooks
  const [isBrowserOnboarding, setIsBrowserOnboarding] = useState(true);
  const [forceOnboarding, setForceOnboarding] = useState(true);

  const {
    currentStep,
    showOnboarding,
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed,
  } = useOnboardingFlow(isBrowserOnboarding);

  // Client-Side Rendering aktivieren
  useEffect(() => {
    setIsClient(true);

    // PWA-Status überprüfen
    const pwaInstalled = isPWA();
    setIsPWAInstalled(pwaInstalled);

    // Desktop-Status überprüfen (für QR-Code)
    setIsDesktop(isDesktopDevice());

    // Onboarding nur anzeigen, wenn NICHT in PWA
    if (!pwaInstalled) {
      // Onboarding aktivieren
      useUIStore.getState().showOnboarding(true, pwaInstalled);
    }
  }, []);

  // Server-Rendering vermeiden
  if (!isClient) {
    return null;
  }

  // PWA-Installation: WelcomeScreen anzeigen
  // Browser: Direkt Onboarding-Flow starten
  if (isPWAInstalled) {
    return <WelcomeScreen />;
  } else {
    // Im Browser: Direkt den Onboarding-Flow anzeigen
    return (
      <OnboardingFlow
        show={true}
        step={currentStep as BrowserOnboardingStep}
        content={content}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onDismiss={handleDismiss}
        canBeDismissed={false}
        isPWA={isPWAInstalled}
        isBrowserOnboarding={true}
      />
    );
  }
}
