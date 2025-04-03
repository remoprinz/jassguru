"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import WelcomeScreen from "@/components/auth/WelcomeScreen";
import {useAuthStore} from "@/store/authStore";
import {isPWA} from "@/utils/browserDetection";

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

  // Client-Side Rendering aktivieren
  useEffect(() => {
    setIsClient(true);

    // PWA-Status überprüfen
    const pwaInstalled = isPWA();
    setIsPWAInstalled(pwaInstalled);

    // Desktop-Status überprüfen (für QR-Code)
    setIsDesktop(isDesktopDevice());
  }, []);

  // Server-Rendering vermeiden
  if (!isClient) {
    return null;
  }

  // Zeige *immer* den WelcomeScreen, wenn der Client bereit ist.
  // Die Logik, ob Onboarding Flow gezeigt wird, liegt in JassKreidetafel.
  return <WelcomeScreen />;
}
