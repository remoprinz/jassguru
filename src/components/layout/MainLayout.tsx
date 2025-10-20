"use client";

import React, { useEffect } from "react";
import {usePathname} from "next/navigation";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useJassStore} from "@/store/jassStore";
import {Button} from "@/components/ui/button";
import {BottomNavigation} from "@/components/layout/BottomNavigation";
import Header from "./Header";
import GlobalNotificationContainer from "../notifications/GlobalNotificationContainer";
import { Toaster } from "sonner";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({children}) => {
  const router = usePathname();
  const {isAuthenticated, isGuest} = useAuthStore();
  const {isVisible: isCtaVisible, text: ctaText, onClick: ctaOnClick, loading: isCtaLoading, disabled: isCtaDisabled, variant: ctaVariant} = useUIStore((state) => state.pageCta);
  const setHeaderConfig = useUIStore((state) => state.setHeaderConfig);
  
  // --- NEU: Zentraler Hook für Session Subscription ---
  const jassSessionId = useJassStore((state) => state.jassSessionId);
  const subscribeToSession = useJassStore((state) => state.subscribeToSession);
  const sessionUnsubscribe = useJassStore((state) => state.sessionUnsubscribe);

  // NEU: Ref für die aktuelle Session-ID um unnötige Re-Subscriptions zu vermeiden
  const currentSessionIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    // Nur subscriben wenn sich die Session-ID tatsächlich geändert hat
    if (jassSessionId !== currentSessionIdRef.current) {
      currentSessionIdRef.current = jassSessionId;
      
    if (jassSessionId) {
      if (process.env.NODE_ENV === 'development') {
        // Debug-Logging entfernt - zu viele repetitive Logs
      }
      subscribeToSession(jassSessionId);
    } else {
      // Wenn keine Session-ID mehr da ist, alten Listener beenden
      if (sessionUnsubscribe) {
        console.log("[MainLayout EFFECT] jassSessionId is null. Unsubscribing from session listener.");
        sessionUnsubscribe();
        }
      }
    }

    // Cleanup-Funktion für den Fall, dass MainLayout unmounted wird (eher unwahrscheinlich)
    return () => {
      if (sessionUnsubscribe) {
        if (process.env.NODE_ENV === 'development') {
          // Debug-Logging entfernt - zu viele repetitive Logs
        }
        sessionUnsubscribe();
      }
    };
  }, [jassSessionId, subscribeToSession, sessionUnsubscribe]); // Alle Dependencies explizit

  // NEU: Header-Zurücksetzen bei Montage des MainLayout
  // Dies stellt sicher, dass der Header auf allen Seiten außer WelcomeScreen sichtbar ist
  useEffect(() => {
    // Prüfen, ob wir auf der Startseite/WelcomeScreen sind
    const isWelcomeScreen = router === '/';
    
    // Nur Header zurücksetzen, wenn wir NICHT auf der Startseite sind
    if (!isWelcomeScreen) {

      setHeaderConfig({
        showProfileButton: true,  // Header-Profil anzeigen
        showBackButton: false,    // Kein Zurück-Button standardmäßig
        title: ''                 // Kein Titel standardmäßig
      });
    }
  }, [router, setHeaderConfig]);

  // --- DEBUG-CHECK ENTFERNT ---
  /*
  useEffect(() => {
    console.log('[MainLayout] Component mounted. Checking Service Worker API...');
    if (typeof navigator !== 'undefined') {
      const swAvailable = 'serviceWorker' in navigator;
      console.log('[MainLayout] \'serviceWorker\' in navigator:', swAvailable);
      if (!swAvailable) {
        console.log('[MainLayout] Properties in navigator:', Object.keys(navigator));
      }
    } else {
      console.log('[MainLayout] Navigator object is not available here.');
    }
  }, []); 
  */
  // --- ENDE DEBUG-CHECK ---

  // Prüfe, ob ein Navigationselement aktiv ist
  const isActive = (path: string) => {
    if (!router) return false;
    return router === path || router.startsWith(`${path}/`);
  };

  // Dynamisches Padding basierend auf CTA Sichtbarkeit und BottomNav
  // h-24 für BottomNav = 6rem
  // Annahme: h-20 für Action Footer (inkl. Padding) = 5rem
  // Total Padding: 6rem + 5rem = 11rem => pb-44
  const showBottomNav = isAuthenticated() && !isGuest;
  const mainPaddingBottom = isCtaVisible ? "pb-44" : (showBottomNav ? "pb-24" : "pb-0");

  return (
    <div className="flex flex-col h-full bg-gray-900 max-w-3xl lg:max-w-none mx-auto">
      {/* Fixierter Header */}
      <Header />

      {/* Hauptinhalt - Scrollbar, flex-1 und dynamisches Padding */}
      <main className={`flex-1 relative overflow-y-auto ${mainPaddingBottom}`}>
        {/* Container für Padding etc. - max-w-3xl zentriert auf Desktop */}
        <div className="w-full max-w-3xl mx-auto px-2 lg:px-0">
          {children}
        </div>
      </main>

      {/* NEU: Action Footer (nur sichtbar wenn isCtaVisible true ist) */}
      {isCtaVisible && (
        // Äusserer Container: max-width, w-full, Zentrierung mit transform, fixed Positionierung
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-40 px-2 pb-4 pt-2 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent backdrop-blur-sm max-w-3xl w-full">
          {/* Innerer Container: KEIN max-width/mx-auto mehr, nur w-full */}
          <div className="w-full">
            {/* Variante mit Farbunterstützung */}
            <Button
              onClick={ctaOnClick ?? undefined}
              disabled={isCtaDisabled || isCtaLoading}
              className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg transition-colors ${
                ctaVariant === "info" ? 
                  "bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900 text-white" :
                ctaVariant === "warning" ? 
                  "bg-yellow-600 hover:bg-yellow-700 border-b-4 border-yellow-900 text-white" :
                ctaVariant === "purple" ? // NEU: Lila Variante hinzugefügt
                  "bg-purple-600 hover:bg-purple-700 border-b-4 border-purple-900 text-white" :
                  // Default Fall (grün, oder was immer Ihre Standard-CTA-Farbe ist)
                  "bg-green-600 hover:bg-green-700 border-b-4 border-green-900 text-white"
              }`}
            >
              {isCtaLoading ? "Lädt..." : ctaText}
            </Button>
            {/* Einfachere Variante ohne Farbvarianten: */}
            {/* <Button
              onClick={ctaOnClick ?? undefined}
              disabled={isCtaDisabled || isCtaLoading}
              className="w-full h-14 text-lg font-bold rounded-xl shadow-lg transition-colors border-b-4 bg-green-600 hover:bg-green-700 border-green-900"
            >
              {isCtaLoading ? 'Lädt...' : ctaText}
            </Button> */}
          </div>
        </div>
      )}

      {/* Bestehende Bottom Navigation (Höhe h-24 -> 6rem) - nur für eingeloggte User */}
      {showBottomNav && <BottomNavigation />}

      {/* Globale Benachrichtigungen (statt Toaster) */}
      <GlobalNotificationContainer />

      {/* NEU: Toaster für sonner Benachrichtigungen */}
      <Toaster position="bottom-center" richColors />

    </div>
  );
};

export default MainLayout;
