"use client";

import React from "react";
import {usePathname} from "next/navigation";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {Button} from "@/components/ui/button";
import {BottomNavigation} from "@/components/layout/BottomNavigation";
import Header from "./Header";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({children}) => {
  const router = usePathname();
  const {isAuthenticated, isGuest} = useAuthStore();
  const {isVisible: isCtaVisible, text: ctaText, onClick: ctaOnClick, loading: isCtaLoading, disabled: isCtaDisabled, variant: ctaVariant} = useUIStore((state) => state.pageCta);

  // Prüfe, ob ein Navigationselement aktiv ist
  const isActive = (path: string) => {
    return router === path || router.startsWith(`${path}/`);
  };

  // Dynamisches Padding basierend auf CTA Sichtbarkeit
  // h-24 für BottomNav = 6rem
  // Annahme: h-20 für Action Footer (inkl. Padding) = 5rem
  // Total Padding: 6rem + 5rem = 11rem => pb-44
  const mainPaddingBottom = isCtaVisible ? "pb-44" : "pb-24";

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden max-w-3xl mx-auto">
      {/* Fixierter Header */}
      <Header />

      {/* Hauptinhalt - Scrollbar, flex-1 und dynamisches Padding */}
      <main className={`flex-1 relative overflow-y-auto ${mainPaddingBottom}`}>
        {/* Container für Padding etc. - KEINE max-width mehr hier */}
        <div className="w-full px-4">
          {children}
        </div>
      </main>

      {/* NEU: Action Footer (nur sichtbar wenn isCtaVisible true ist) */}
      {isCtaVisible && (
        // Äusserer Container: max-width, w-full, Zentrierung mit transform, fixed Positionierung
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-40 px-4 pb-4 pt-2 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent backdrop-blur-sm max-w-3xl w-full">
          {/* Innerer Container: KEIN max-width/mx-auto mehr, nur w-full */}
          <div className="w-full">
            {/* Variante mit Farbunterstützung */}
            <Button
              onClick={ctaOnClick ?? undefined}
              disabled={isCtaDisabled || isCtaLoading}
              className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg transition-colors ${
                ctaVariant === "info" ? // Blau
                  "bg-blue-600 hover:bg-blue-700 border-b-4 border-blue-900" : // Blau MIT 3D
                  ctaVariant === "warning" ? // Gelb
                    "bg-yellow-600 hover:bg-yellow-700 border-b-4 border-yellow-900" : // Gelb MIT 3D
                    "bg-green-600 hover:bg-green-700 border-b-4 border-green-900" // Grün (Default) MIT 3D
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

      {/* Bestehende Bottom Navigation (Höhe h-24 -> 6rem) */}
      <BottomNavigation />

      {/* Alte <nav> Struktur entfernt */}

    </div>
  );
};

export default MainLayout;
