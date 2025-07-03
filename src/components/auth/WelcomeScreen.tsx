"use client";

import React, {useEffect, useState} from "react";
import {useRouter} from "next/router";
import {motion} from "framer-motion";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useTutorialStore} from "@/store/tutorialStore";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import {Loader2} from "lucide-react";
import { isPWA } from "@/utils/browserDetection";
import { debouncedRouterPush } from "@/utils/routerUtils";
import { saveTokensFromUrl } from "@/utils/tokenStorage";

export interface WelcomeScreenProps {
  onLogin?: () => void;
  onGuestPlay?: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onLogin,
  onGuestPlay,
}) => {
  const router = useRouter();
  const {continueAsGuest, clearGuestStatus, isGuest, status, user, logout} = useAuthStore();
  const { setHeaderConfig } = useUIStore();
  const { hasCompletedTutorial, setHasCompletedTutorial } = useTutorialStore();
  const [isClient, setIsClient] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState<"default" | "invite" | "pwa" | "loading">("loading");

  useEffect(() => {
    setIsClient(true);

    setHeaderConfig({
      showProfileButton: false,
      showBackButton: false,
      title: "",
    });
  }, [setHeaderConfig]);

  // 🔧 VERBESSERTER FIX: Automatischer Logout für eingeloggte Benutzer auf WelcomeScreen
  // Verhindert Race Conditions mit Header-Logout durch Status-Prüfung
  useEffect(() => {
    if (isClient && status === 'authenticated' && user && !isGuest) {
      console.log('🔧 [WelcomeScreen] Eingelogger Benutzer erkannt - prüfe ob bereits Logout im Gange...');
      
      // WICHTIG: Verzögerung um Race Condition mit Header-Logout zu vermeiden
      const timeoutId = setTimeout(() => {
        // Erneute Status-Prüfung nach Verzögerung
        const currentState = useAuthStore.getState();
        if (currentState.status === 'authenticated' && currentState.user && !currentState.isGuest) {
          console.log('🔧 [WelcomeScreen] Status immer noch authenticated - führe automatischen Logout durch');
          
          try {
            logout();
            console.log('✅ [WelcomeScreen] Automatischer Logout erfolgreich');
          } catch (error) {
            console.error('❌ [WelcomeScreen] Fehler beim automatischen Logout:', error);
            // Fallback: Auth-Store direkt zurücksetzen
            try {
              clearGuestStatus();
            } catch (fallbackError) {
              console.error('❌ [WelcomeScreen] Auch Fallback fehlgeschlagen:', fallbackError);
            }
          }
        } else {
          console.log('🔧 [WelcomeScreen] Status bereits geändert - kein automatischer Logout nötig');
        }
      }, 200); // 200ms Verzögerung um Header-Logout Zeit zu geben

      return () => clearTimeout(timeoutId);
    }
  }, [isClient, status, user, isGuest, logout, clearGuestStatus]);

  useEffect(() => {
    if (router.isReady && isClient) {
      // 🚨 WICHTIG: Prüfe zuerst, ob User als Gast von dieser WelcomeScreen kam
      const guestFromWelcome = typeof window !== 'undefined' 
        ? sessionStorage.getItem('guestFromWelcome') 
        : null;

      // Prüfen, ob wir vom StartScreen zurückkommen (mittels referrer oder sessionStorage)
      const comingFromStartScreen = 
        typeof window !== 'undefined' && 
        (sessionStorage.getItem('comingFromStartScreen') === 'true' || 
         document.referrer.includes('/start'));
      
      // 🚨 ERWEITERTE LOGIK: Wenn vom StartScreen kommend, Flag zurücksetzen und keine Weiterleitung durchführen
      // ABER: Exception für guestFromWelcome - da darf die normale Logik weiterlaufen
      if (comingFromStartScreen && guestFromWelcome !== 'true') {
        sessionStorage.removeItem('comingFromStartScreen');
        console.log("[WelcomeScreen] Weiterleitung unterdrückt, da von StartScreen zurückkommend");
        return;
      }

      // Wenn Gast und Tutorial abgeschlossen, direkt weiterleiten
      if (isGuest && hasCompletedTutorial) {
        console.log("[WelcomeScreen] Gastmodus und Tutorial abgeschlossen, Weiterleitung zu /jass");
        debouncedRouterPush(router, "/jass", undefined, true);
        return;
      }

      const isJoinFlowViaAsPath = router.asPath.startsWith('/join?');

      if (router.query) {
        console.log("[WelcomeScreen] Prüfe URL auf Einladungstoken:", router.query);
        saveTokensFromUrl(router.query);
      }

      if (isJoinFlowViaAsPath) {
        setDisplayMode("invite");
      } else if (isPWA()) {
        setDisplayMode("pwa");
      } else {
        setDisplayMode("default");
      }
    }
  }, [router.isReady, router.asPath, router.query, isClient, isGuest, hasCompletedTutorial]);

  const handleGuestPlay = async () => {
    if (isGuestLoading) return;

    setIsGuestLoading(true);

    try {
      // 🚨 NEU: Session-Flag setzen für Browser-Zurück-Navigation
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('guestFromWelcome', 'true');
        console.log('[WelcomeScreen] Flag gesetzt: guestFromWelcome = true');
      }

      continueAsGuest();      
      if (onGuestPlay) onGuestPlay();

      await new Promise((resolve) => setTimeout(resolve, 300));
      
      console.log("[WelcomeScreen] Gastmodus aktiviert. Status:", useAuthStore.getState().status, "isGuest:", useAuthStore.getState().isGuest);

      // 🔧 FIX: Einfache Navigation zur Jass-Seite mit Fallback zur WelcomeScreen
      try {
        await debouncedRouterPush(router, "/jass", undefined, true);
      } catch (navError) {
        console.error("[WelcomeScreen] Navigation zur Jass-Seite fehlgeschlagen, bleibe auf WelcomeScreen:", navError);
        // Bei Navigationsproblemen einfach auf WelcomeScreen bleiben
        // (der User kann es erneut versuchen)
      }
    } catch (error) {
      console.error("[WelcomeScreen] Fehler beim Gastmodus:", error);
      // Bei jedem Fehler bleiben wir auf der WelcomeScreen
    } finally {
      setIsGuestLoading(false);
    }
  };

  const handleLogin = () => {
    console.log("[WelcomeScreen] handleLogin: Navigiere zur Login-Seite...");
    if (onLogin) onLogin();
    
    // Gast-Status über Store-Aktion zurücksetzen - falls möglich
    try {
      console.log("[WelcomeScreen] handleLogin: Versuche clearGuestStatus...");
      clearGuestStatus();
      console.log("[WelcomeScreen] handleLogin: clearGuestStatus aufgerufen. Neuer Status (direkt danach):", useAuthStore.getState().isGuest);
    } catch (err) {
      console.error("[WelcomeScreen] Fehler beim Zurücksetzen des Gaststatus:", err);
      // Fortfahren, auch wenn es fehlschlägt
    }
    
    // Verzögerte Navigation mit längerer Wartezeit und direktem router.push für höhere Zuverlässigkeit
    setTimeout(() => {
      try {
        const targetQuery = { ...router.query };
        // Direkt push, keine debounce oder sonstige Wrapper-Funktionen
        console.log("[WelcomeScreen] handleLogin: Direkte Navigation zu /auth/login");
        
        // Im PWA-Kontext zusätzliche Verzögerung und einfachere Navigation
        if (isPWA()) {
          // Ohne Query-Parameter, nur Basis-URL für maximale Robustheit im PWA-Kontext
          router.push("/auth/login");
        } else {
          // Mit Query-Parametern für normale Browser-Nutzung
          const loginPath = "/auth/login" + (Object.keys(targetQuery).length > 0 ? `?${new URLSearchParams(targetQuery as any).toString()}` : "");
          router.push(loginPath);
        }
      } catch (navError) {
        console.error("[WelcomeScreen] Navigation fehlgeschlagen, versuche Fallback:", navError);
        // Fallback auf absolute URL ohne Parameter
        window.location.href = "/auth/login";
      }
    }, 500); // Längere Wartezeit für Stabilisierung
  };

  const handleRegister = () => {
    console.log("[WelcomeScreen] handleRegister: Navigiere zur Registrierungs-Seite...");
    
    // Gast-Status über Store-Aktion zurücksetzen - falls möglich
    try {
      console.log("[WelcomeScreen] handleRegister: Versuche clearGuestStatus...");
      clearGuestStatus();
      console.log("[WelcomeScreen] handleRegister: clearGuestStatus aufgerufen. Neuer Status (direkt danach):", useAuthStore.getState().isGuest);
    } catch (err) {
      console.error("[WelcomeScreen] Fehler beim Zurücksetzen des Gaststatus:", err);
      // Fortfahren, auch wenn es fehlschlägt
    }
    
    // Verzögerte Navigation mit längerer Wartezeit und direktem router.push für höhere Zuverlässigkeit
    setTimeout(() => {
      try {
        const targetQuery = { ...router.query };
        console.log("[WelcomeScreen] handleRegister: Direkte Navigation zu /auth/register");
        
        // Im PWA-Kontext einfachere Navigation
        if (isPWA()) {
          // Ohne Query-Parameter für maximale Robustheit
          router.push("/auth/register");
        } else {
          // Mit Query-Parametern für normale Browser-Nutzung
          const registerPath = "/auth/register" + (Object.keys(targetQuery).length > 0 ? `?${new URLSearchParams(targetQuery as any).toString()}` : "");
          router.push(registerPath);
        }
      } catch (navError) {
        console.error("[WelcomeScreen] Navigation fehlgeschlagen, versuche Fallback:", navError);
        // Fallback auf absolute URL ohne Parameter
        window.location.href = "/auth/register";
      }
    }, 500); // Längere Wartezeit für Stabilisierung
  };

  if (!isClient || displayMode === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full absolute inset-0 bg-gray-900 overflow-y-auto">
      <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <motion.div
          initial={{opacity: 0, scale: 0.9}}
          animate={{opacity: 1, scale: 1}}
          transition={{duration: 0.3}}
          className="w-full max-w-md bg-gray-800 rounded-xl p-8 shadow-2xl space-y-8 my-4"
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative w-36 h-36 mb-4">
              <Image
                src="/welcome-guru.png"
                alt="Jass Kreidetafel"
                layout="fill"
                objectFit="contain"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold text-white text-center">
              jassguru.ch
            </h1>
            
            <h2 className="text-xl text-gray-300 text-center -mt-2 italic">
              {displayMode === "pwa" ? "Von Jassern für Jasser." : (
                <>
                  Die digitale Heimat für den<br />
                  Schweizer Jass-Sport
                </>
              )}
            </h2>

            <p className="text-gray-300 text-center">
              {displayMode === "pwa" ? (
                <div className="text-left">
                  <div className="mb-3">
                    Bereit für den nächsten Jass mit deinen Freunden? Jetzt anmelden und losjassen.
                  </div>
                  <div className="mb-4">
                    <strong className="text-white">Tipp:</strong> Alle Mitspieler können sich simultan einloggen.
                  </div>
                  <div>
                    <strong className="text-white">Neu hier?</strong> Als Gast spielen und die Jasstafel kennenlernen.
                  </div>
                </div>
              ) : (
                <div className="text-left">
                  <div className="mb-4">
                    Jassen gehört an den Tisch – die Resultate in die offizielle Bilanz. Mit der digitalen Jasstafel erfasst du jede Runde automatisch für dich, deine Freunde und bald die ganze Liga.
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <a 
                        href="https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        👉 Beispiel-Gruppe ansehen
                      </a>
                    </div>
                    <div>
                      <a 
                        href="https://jassguru.ch/profile/b16c1120111b7d9e7d733837" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        👉 Beispiel-Profil ansehen
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </p>
          </div>

          <div className="space-y-4">
            {displayMode === "invite" || displayMode === "pwa" ? (
              <Button
                onClick={handleLogin}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-xl shadow-lg"
              >
                Anmelden
              </Button>
            ) : (
              <Button
                onClick={handleRegister}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-xl shadow-lg"
              >
                Registrieren
              </Button>
            )}

            {displayMode === "invite" ? (
              <Button
                onClick={handleRegister}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 text-lg rounded-xl shadow-lg"
              >
                Registrieren
              </Button>
            ) : (
              <Button
                onClick={handleGuestPlay}
                disabled={isGuestLoading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white h-14 text-lg rounded-xl shadow-lg"
              >
                {isGuestLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Jasstafel laden...
                  </>
                ) : (
                  "Als Gast spielen"
                )}
              </Button>
            )}
          </div>

          <div className="pt-2 text-center text-gray-500 text-sm">
            {displayMode === "invite" || displayMode === "pwa" ? (
              <p>Noch kein Konto?{" "}
                <a 
                  onClick={(e) => {
                    e.preventDefault();
                    console.log("[WelcomeScreen] Link-Klick: Navigiere zur Registrierungs-Seite (Link)...");
                    
                    // Gast-Status über Store-Aktion zurücksetzen - falls möglich
                    try {
                      console.log("[WelcomeScreen] Link-Klick: Versuche clearGuestStatus...");
                      clearGuestStatus();
                      console.log("[WelcomeScreen] Link-Klick: clearGuestStatus aufgerufen. Neuer Status (direkt danach):", useAuthStore.getState().isGuest);
                    } catch (err) {
                      console.error("[WelcomeScreen] Fehler beim Zurücksetzen des Gaststatus (Link):", err);
                      // Fortfahren, auch wenn es fehlschlägt
                    }
                    
                    // Direkte Navigation mit Fehlerbehandlung
                    try {
                      if (isPWA()) {
                        // Im PWA-Kontext einfach zur Basis-URL
                        router.push("/auth/register");
                      } else {
                        // Im normalen Browser-Kontext mit Query-Parametern
                        const targetQuery = { ...router.query };
                        const registerPath = "/auth/register" + (Object.keys(targetQuery).length > 0 ? `?${new URLSearchParams(targetQuery as any).toString()}` : "");
                        router.push(registerPath);
                      }
                    } catch (navError) {
                      console.error("[WelcomeScreen] Link-Navigation fehlgeschlagen, versuche Fallback:", navError);
                      window.location.href = "/auth/register";
                    }
                  }}
                  href="#" 
                  className="text-blue-400 hover:underline cursor-pointer">
                  Jetzt registrieren
                </a>
              </p>
            ) : (
              <p>Bereits ein Konto?{" "}
                <a 
                  onClick={(e) => {
                    e.preventDefault();
                    console.log("[WelcomeScreen] Link-Klick: Navigiere zur Login-Seite (Link)...");
                    
                    // Gast-Status über Store-Aktion zurücksetzen - falls möglich
                    try {
                      console.log("[WelcomeScreen] Link-Klick: Versuche clearGuestStatus...");
                      clearGuestStatus();
                      console.log("[WelcomeScreen] Link-Klick: clearGuestStatus aufgerufen. Neuer Status (direkt danach):", useAuthStore.getState().isGuest);
                    } catch (err) {
                      console.error("[WelcomeScreen] Fehler beim Zurücksetzen des Gaststatus (Link):", err);
                      // Fortfahren, auch wenn es fehlschlägt
                    }

                    // Direkte Navigation mit Fehlerbehandlung
                    try {
                      if (isPWA()) {
                        // Im PWA-Kontext einfach zur Basis-URL
                        router.push("/auth/login");
                      } else {
                        // Im normalen Browser-Kontext mit Query-Parametern
                        const targetQuery = { ...router.query };
                        const loginPath = "/auth/login" + (Object.keys(targetQuery).length > 0 ? `?${new URLSearchParams(targetQuery as any).toString()}` : "");
                        router.push(loginPath);
                      }
                    } catch (navError) {
                      console.error("[WelcomeScreen] Link-Navigation fehlgeschlagen, versuche Fallback:", navError);
                      window.location.href = "/auth/login";
                    }
                  }}
                  href="#" 
                  className="text-blue-400 hover:underline cursor-pointer">
                  Jetzt anmelden
                </a>
              </p>
            )}
          </div>
        </motion.div>

        <div className="mb-6 text-gray-500 text-sm text-center">
          &copy; {new Date().getFullYear()} Jassguru - Alle Rechte vorbehalten
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
