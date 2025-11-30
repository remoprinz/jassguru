"use client";

import React, {useEffect, useState, useCallback, useMemo} from "react";
import {useRouter} from "next/router";
import {motion} from "framer-motion";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useTutorialStore} from "@/store/tutorialStore";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import {Loader2, Eye, BookOpen, HelpCircle} from "lucide-react";
import { isPWA } from "@/utils/browserDetection";
import { debouncedRouterPush } from "@/utils/routerUtils";
import { saveTokensFromUrl } from "@/utils/tokenStorage";
import { welcomeLogger, logCriticalError } from "@/utils/logger";
import { LegalFooter } from '@/components/layout/LegalFooter';
import ScreenshotSlider from '@/components/auth/ScreenshotSlider';
import ScreenshotPreview from '@/components/auth/ScreenshotPreview';
import WelcomeBox from '@/components/auth/WelcomeBox';

export interface WelcomeScreenProps {
  onLogin?: () => void;
  onGuestPlay?: () => void;
}

// 🚀 OPTIMIERUNG: Custom Hook für WelcomeScreen-Logik
const useWelcomeScreenLogic = () => {
  const router = useRouter();
  const {continueAsGuest, clearGuestStatus, isGuest, status, user, logout} = useAuthStore();
  const { setHeaderConfig } = useUIStore();
  const { hasCompletedTutorial } = useTutorialStore();
  
  const [isClient, setIsClient] = useState(false);
  const [displayMode, setDisplayMode] = useState<"default" | "invite" | "pwa" | "loading">("loading");
  const [isScreenshotSliderOpen, setIsScreenshotSliderOpen] = useState(false);

  // 🔧 MEMOIZED: Display Mode Calculation
  const calculatedDisplayMode = useMemo(() => {
    if (!isClient || !router.isReady) return "loading";
    
    const isJoinFlow = router.asPath.startsWith('/join?');
    if (isJoinFlow) return "invite";
    if (isPWA()) return "pwa";
    return "default";
  }, [isClient, router.isReady, router.asPath]);

  // 🔧 OPTIMIERT: Einmalige Initialisierung
  useEffect(() => {
    setIsClient(true);
    setHeaderConfig({
      showProfileButton: false,
      showBackButton: false,
      title: "",
    });

    // localStorage-Cleanup nur einmal beim Mount
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        if (parsed?.state?.status === 'authenticated' || parsed?.state?.status === 'loading') {
          welcomeLogger.warn('Erkenne problematischen persistierten Auth-Status. Bereinige localStorage.');
          localStorage.removeItem('auth-storage');
          clearGuestStatus();
        }
      }
    } catch (error) {
      logCriticalError('WelcomeScreen', error, 'localStorage corruption detected. Emergency cleanup.');
      localStorage.removeItem('auth-storage');
      localStorage.removeItem('auth-failed-attempts');
    }
  }, []); // Nur beim Mount - keine weiteren Dependencies

  // 🔧 OPTIMIERT: Auth-Status Handler - nur bei relevanten Änderungen
  useEffect(() => {
    // 🚨 KORRIGIERT: Leite eingeloggte Benutzer zur App weiter, anstatt sie auszuloggen.
    if (isClient && status === 'authenticated' && user && !isGuest) {
      // Eingeloggter Benutzer erkannt
      router.push('/start');
    }
  }, [isClient, status, user, isGuest, router]); // router als Abhängigkeit hinzugefügt

  // 🔧 OPTIMIERT: Router & DisplayMode Handler
  useEffect(() => {
    if (!router.isReady || !isClient) return;

    // Token-Verarbeitung
    if (router.query && Object.keys(router.query).length > 0) {
      welcomeLogger.debug("Prüfe URL auf Einladungstoken:", router.query);
      saveTokensFromUrl(router.query);
    }

    // Navigation-Logik für Gäste
    const handleGuestNavigation = () => {
      const guestFromWelcome = sessionStorage.getItem('guestFromWelcome');
      const comingFromStartScreen = sessionStorage.getItem('comingFromStartScreen') === 'true' || 
                                   document.referrer.includes('/start');
      
      if (comingFromStartScreen && guestFromWelcome !== 'true') {
        sessionStorage.removeItem('comingFromStartScreen');
        // Weiterleitung unterdrückt
        return false; // Keine Weiterleitung
      }

      if (isGuest && hasCompletedTutorial) {
        welcomeLogger.navigation("Gastmodus und Tutorial abgeschlossen, Weiterleitung zu /jass");
        debouncedRouterPush(router, "/jass", undefined, true);
        return true; // Navigation durchgeführt
      }

      return false;
    };

    // Führe Navigation aus
    const hasNavigated = handleGuestNavigation();
    
    // DisplayMode nur setzen wenn keine Navigation stattfand
    if (!hasNavigated) {
      setDisplayMode(calculatedDisplayMode);
    }
  }, [router.isReady, router.query, isClient, isGuest, hasCompletedTutorial, calculatedDisplayMode]);

  return {
    isClient,
    displayMode,
    clearGuestStatus,
    continueAsGuest,
    isScreenshotSliderOpen,
    setIsScreenshotSliderOpen
  };
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onLogin,
  onGuestPlay,
}) => {
  const router = useRouter();
  
  // 🚀 OPTIMIERT: Verwende den Custom Hook
  const { isClient, displayMode, clearGuestStatus, continueAsGuest, isScreenshotSliderOpen, setIsScreenshotSliderOpen } = useWelcomeScreenLogic();
  
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  // 🚀 OPTIMIERT: Memoized Gast-Handler
  const handleGuestPlay = useCallback(async () => {
    if (isGuestLoading) return;

    setIsGuestLoading(true);

    try {
      // Session-Flag setzen für Browser-Navigation
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('guestFromWelcome', 'true');
        welcomeLogger.debug('Flag gesetzt: guestFromWelcome = true');
      }

      continueAsGuest();      
      if (onGuestPlay) onGuestPlay();

      await new Promise((resolve) => setTimeout(resolve, 300));
      
      welcomeLogger.authEvent("Gastmodus aktiviert");

      // Navigation zur Jass-Seite
      try {
        await debouncedRouterPush(router, "/jass", undefined, true);
      } catch (navError) {
        welcomeLogger.error("Navigation zur Jass-Seite fehlgeschlagen:", navError);
      }
    } catch (error) {
      welcomeLogger.error("Fehler beim Gastmodus:", error);
    } finally {
      setIsGuestLoading(false);
    }
  }, [isGuestLoading, continueAsGuest, onGuestPlay, router]);

  // 🚀 OPTIMIERT: Memoized Navigation-Handler
  const handleLogin = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    welcomeLogger.navigation("Navigiere zur Login-Seite...");
    if (onLogin) onLogin();
    
    try {
      clearGuestStatus();
      welcomeLogger.debug("clearGuestStatus aufgerufen");
    } catch (err) {
      welcomeLogger.error("Fehler beim Zurücksetzen des Gaststatus:", err);
    }
    
    // Optimierte Navigation ohne setTimeout
    try {
      const targetQuery = { ...router.query };
      const hasQuery = Object.keys(targetQuery).length > 0;
      
      if (isPWA()) {
        router.push("/auth/login");
      } else {
        const loginPath = hasQuery 
          ? `/auth/login?${new URLSearchParams(targetQuery as any).toString()}`
          : "/auth/login";
        router.push(loginPath);
      }
    } catch (navError) {
      welcomeLogger.error("Navigation fehlgeschlagen, versuche Fallback:", navError);
      window.location.href = "/auth/login";
    }
  }, [onLogin, clearGuestStatus, router]);

  const handleRegister = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    welcomeLogger.navigation("Navigiere zur Registrierungs-Seite...");
    
    try {
      clearGuestStatus();
      welcomeLogger.debug("clearGuestStatus aufgerufen");
    } catch (err) {
      welcomeLogger.error("Fehler beim Zurücksetzen des Gaststatus:", err);
    }
    
    // Optimierte Navigation ohne setTimeout
    try {
      const targetQuery = { ...router.query };
      const hasQuery = Object.keys(targetQuery).length > 0;
      
      if (isPWA()) {
        router.push("/auth/register");
      } else {
        const registerPath = hasQuery 
          ? `/auth/register?${new URLSearchParams(targetQuery as any).toString()}`
          : "/auth/register";
        router.push(registerPath);
      }
    } catch (navError) {
      welcomeLogger.error("Navigation fehlgeschlagen, versuche Fallback:", navError);
      window.location.href = "/auth/register";
    }
  }, [clearGuestStatus, router]);

  if (!isClient || displayMode === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full absolute inset-0 overflow-y-auto isolate">
      <div className="fixed inset-0 bg-gray-900 -z-10" />
      {/* 📱 MOBILE VERSION - BLEIBT UNVERÄNDERT! */}
      <div className="lg:hidden flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <motion.div
          initial={{opacity: 0, scale: 0.9}}
          animate={{opacity: 1, scale: 1}}
          transition={{duration: 0.3}}
          className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-2xl space-y-6 my-2"
        >
          <div className="flex flex-col space-y-3">
            <div className="flex justify-center">
              <div className="relative w-24 h-24 mb-2">
                <Image
                  src="/welcome-guru.png"
                  alt="Jass Kreidetafel"
                  fill={true}
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white text-center">
              {displayMode === "pwa" ? "Von Jassern für Jasser" : "Jassen ist der einzige Sport ohne Rangliste"}
            </h1>
            
            <p className="text-base text-gray-300 text-center -mt-2 leading-relaxed">
              {displayMode === "pwa" ? null : (
                <>
                  Jassguru ändert das. Wir erfassen die Spiele von deiner Jassgruppe digital und liefern Profi-Statistiken — damit endlich klar wird, wer nicht nur schnorren, sondern auch jassen kann.
                </>
              )}
            </p>

            <div className="text-gray-300 text-left w-full pl-1">
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
                    <strong className="text-white">Sieh selbst, was dich erwartet:</strong>
                  </div>
                  
                  <div className="space-y-0.5">
                    <div>
                      <a 
                        href="https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors py-0"
                      >
                        <span>👉</span>
                        <span>Die ewige Gruppen-Rangliste</span>
                      </a>
                    </div>
                    <div>
                      <a 
                        href="https://jassguru.ch/profile/b16c1120111b7d9e7d733837" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors py-0"
                      >
                        <span>🙍‍♂️</span>
                        <span>Profil & Bestleistungen</span>
                      </a>
                    </div>
                    <div>
                      <a 
                        href="https://jassguru.ch/view/tournament/6RdW4o4PRv0UzsZWysex/" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors py-0"
                      >
                        <span>🏆</span>
                        <span>Turniere & Verläufe</span>
                      </a>
                    </div>
                    <div>
                      <Link href="/features" className="flex items-center space-x-1.5 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors py-0">
                        <span>👁️</span>
                        <span>Die interaktive Feature-Tour</span>
                      </Link>
                    </div>
                    <div>
                      <a 
                        href="https://chatgpt.com/g/g-69219897884881918763e35fccae748e-jassguru" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors py-0"
                      >
                        <span>💬</span>
                        <span>Frag den Jass-Guru (ChatGPT)</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
                onClick={!isPWA() ? () => router.push('/onboarding_tutorial') : handleGuestPlay}
                disabled={isGuestLoading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white h-14 text-lg rounded-xl shadow-lg"
              >
                {isGuestLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Jasstafel laden...
                  </>
                ) : (
                  !isPWA() ? "App herunterladen" : "Als Gast spielen"
                )}
              </Button>
            )}
          </div>

          <div className="pt-2 text-center text-gray-500 text-sm">
            {displayMode === "invite" || displayMode === "pwa" ? (
              <p>Noch kein Konto?{" "}
                                <a 
                  onClick={handleRegister}
                  href="#"
                  className="text-blue-400 hover:underline cursor-pointer">
                  Jetzt registrieren
                </a>
              </p>
            ) : (
              <p>Bereits ein Konto?{" "}
                                <a 
                  onClick={handleLogin}
                  href="#"
                  className="text-blue-400 hover:underline cursor-pointer">
                  Jetzt anmelden
                </a>
              </p>
            )}
          </div>
          
          {/* Service-Bereich: JassWiki & Support */}
          <div className="pt-6 mt-6 border-t border-gray-700/50">
            <div className="grid grid-cols-2 gap-3">
              {/* Link 1: JassWiki */}
              <a
                href="https://jasswiki.ch/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center text-center p-3 rounded-xl hover:bg-gray-700/50 transition-all"
              >
                <BookOpen className="w-6 h-6 text-green-500 mb-1.5 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-200 group-hover:text-green-400 transition-colors">
                  Jass-Wiki
                </span>
                <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors mt-0.5">
                  Alles rund ums Jassen:<br />Regeln, Varianten & Taktiken
                </span>
              </a>

              {/* Link 2: Hilfe & Support */}
              <Link
                href="/support"
                className="group flex flex-col items-center text-center p-3 rounded-xl hover:bg-gray-700/50 transition-all"
              >
                <HelpCircle className="w-6 h-6 text-blue-500 mb-1.5 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-200 group-hover:text-blue-400 transition-colors">
                  Hilfe & Support
                </span>
                <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors mt-0.5">
                  Alles zur Jassguru App:<br />FAQ, Anleitungen & Support
                </span>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* LEGAL FOOTER */}
        <div className="mb-6">
          <LegalFooter />
        </div>
      </div>

      {/* 💻 DESKTOP VERSION - 40/60 SPLIT LAYOUT (OPTIMAL!) */}
      <div className="hidden lg:grid lg:grid-cols-[40%_60%] min-h-screen">
        {/* LEFT: Screenshot Preview (40%) */}
        <div className="bg-gray-900 flex items-start justify-center p-8 pt-16">
          <ScreenshotPreview />
        </div>

        {/* RIGHT: Welcome Content (60% - KOMPAKT & ZENTRIERT!) */}
        <div className="bg-gray-800 flex items-center justify-center px-16 py-12">
          <div className="max-w-xl w-full space-y-6">
            <WelcomeBox
              displayMode={displayMode}
              isGuestLoading={isGuestLoading}
              onRegister={handleRegister}
              onLogin={handleLogin}
              onGuestPlay={handleGuestPlay}
            />

            {/* LEGAL FOOTER - Desktop */}
            <div className="flex justify-center">
              <LegalFooter />
            </div>
          </div>
        </div>
      </div>

      {/* SCREENSHOT SLIDER */}
      <ScreenshotSlider
        isOpen={isScreenshotSliderOpen}
        onClose={() => setIsScreenshotSliderOpen(false)}
        initialIndex={0}
      />
    </div>
  );
};

export default WelcomeScreen;
