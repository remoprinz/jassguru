import React, {useEffect, useState, useMemo} from "react";
import "../styles/globals.css";
import type {AppProps} from "next/app";
import { useRouter } from "next/router";
// import {register} from "../pwa/serviceWorkerRegistration"; // Alten Import ggf. aufräumen
import DebugLog from "../components/ui/DebugLog";
import {AppProvider} from "../contexts/AppContext";
import Head from "next/head";
import {useWakeLock} from "../hooks/useWakeLock";
import {AuthProvider} from "../providers/AuthProvider";
import {UserProvider} from "../providers/UserProvider";
import {useAuthStore} from "@/store/authStore";
import {useTournamentStore} from "@/store/tournamentStore"; // NEU: TournamentStore importieren
import {useUIStore} from "@/store/uiStore"; // NEU: UIStore importieren
import GlobalNotificationContainer from "../components/notifications/GlobalNotificationContainer";
import PwaUpdateHandler from '@/components/pwa/PwaUpdateHandler'; // Wieder einkommentieren
import { FirestoreSyncProvider } from '@/providers/FirestoreSyncProvider'; // Neu importieren
import { ClipLoader } from "react-spinners"; // Import für einen Spinner
import { debouncedRouterPush } from '../utils/routerUtils';
import { isPublicPath } from "@/lib/utils"; // 🚨 NEU: Importiere die zentrale Funktion
import { handleIndexedDBCorruption, isIndexedDBCorruptionError } from '../utils/indexedDBHelper';
import { setupEmergencyFunctions } from '../utils/emergencyReset';

// Hilfskomponente für die Ladeanzeige
const LoadingScreen: React.FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center min-h-full bg-gray-900 text-white">
    <ClipLoader color="#ffffff" size={40} />
    <p className="mt-4 text-lg">Authentifizierung wird geprüft...</p>
  </div>
);

const MyApp = ({Component, pageProps}: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();
  const initAuth = useAuthStore((state) => state.initAuth);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user); // NEU: User-Objekt holen
  const isGuest = useAuthStore((state) => state.isGuest);
  const isAuthenticated = useAuthStore.getState().isAuthenticated();
  const [showDebugLog, setShowDebugLog] = useState(false);
  const releaseWakeLock = useWakeLock();
  const [isAppLoaded, setIsAppLoaded] = useState(false);
  const router = useRouter();

  // NEU: States und Actions aus dem tournamentStore holen
  const checkUserActiveTournament = useTournamentStore((state) => state.checkUserActiveTournament);
  const userActiveTournamentId = useTournamentStore((state) => state.userActiveTournamentId);
  const userActiveTournamentStatus = useTournamentStore((state) => state.userActiveTournamentStatus);

  // NEU: States und Actions aus dem uiStore für Redirect-Flag holen
  const hasBeenRedirected = useUIStore((state) => state.hasBeenRedirectedToActiveTournament);
  const setHasBeenRedirected = useUIStore((state) => state.setHasBeenRedirectedToActiveTournament);

  // console.log(`_app.tsx: Rendering Component: ${Component.displayName || Component.name || 'Unknown'}, Pathname: ${pageProps.router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '')}`);

  // --- NEUER CHECK IM RENDER-KONTEXT ---
  if (typeof window !== 'undefined') {
    // console.log('[_app.tsx Render] Checking Service Worker API...');
    const swAvailable = 'serviceWorker' in navigator;
    // console.log('[_app.tsx Render] \'serviceWorker\' in navigator:', swAvailable);
    if (!swAvailable) {
      // console.log('[_app.tsx Render] Properties in navigator:', Object.keys(navigator));
    }
  }
  // --- ENDE CHECK ---

  useEffect(() => {
    setIsClient(true);
    
    // 🚨 KRITISCH: Globaler IndexedDB Corruption Handler
    const handleGlobalError = (event: ErrorEvent) => {
      if (isIndexedDBCorruptionError(event.error)) {
        console.error('🚨 [App] IndexedDB Korruption erkannt:', event.error);
        event.preventDefault(); // Stoppe Standard-Fehlerbehandlung
        handleIndexedDBCorruption();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIndexedDBCorruptionError(event.reason)) {
        console.error('🚨 [App] IndexedDB Korruption in Promise erkannt:', event.reason);
        event.preventDefault();
        handleIndexedDBCorruption();
      }
    };

    // Globale Error Handler registrieren
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // 🚨 NEU: Session-Flag-Cleanup für Robustheit
    if (typeof window !== 'undefined') {
      // Bereinige verwaiste Session-Flags beim App-Start
      const cleanupKeys = ['guestFromWelcome'];
      cleanupKeys.forEach(key => {
        if (sessionStorage.getItem(key)) {
          console.log(`[_app] Bereinige verwaistes Session-Flag: ${key}`);
          sessionStorage.removeItem(key);
        }
      });
    }
    
    // Emergency-Funktionen für Konsole verfügbar machen
    setupEmergencyFunctions();
    
    // console.log('_app.tsx: useEffect - Calling initAuth()');
    initAuth();
    
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [initAuth]);

  // NEU: Effekt zum Setzen des App-Ladezustands - MUSS VOR WEITERLEITUNG KOMMEN!
  useEffect(() => {
    // ✅ KORRIGIERT: Öffentliche Seiten können sofort gerendert werden
    if (router.isReady) {
      const currentPath = router.pathname;
      const isCurrentPagePublic = isPublicPath(currentPath);
      
      // Öffentliche Seiten können sofort gerendert werden
      if (isCurrentPagePublic) {
        setIsAppLoaded(true);
        return;
      }
      // Private Seiten müssen warten, bis Auth-Status definitiv ist
      else if (authStatus !== 'loading' && authStatus !== 'idle') {
        setIsAppLoaded(true);
      }
    }
  }, [router.isReady, router.pathname, authStatus, isAppLoaded]);

  useEffect(() => {
    // Doppelklick auf den oberen Rand für Debug-Konsole
    const handleDoubleClick = (e: MouseEvent) => {
      if (e.clientY < 50) {
        setShowDebugLog(!showDebugLog);
      }
    };

    document.addEventListener("dblclick", handleDoubleClick);
    return () => document.removeEventListener("dblclick", handleDoubleClick);
  }, [showDebugLog]);

  // --- WEITERLEITUNG useEffect (Überarbeitet) - MUSS NACH isAppLoaded KOMMEN!--- 
  useEffect(() => {
    // Nur ausführen, wenn der Router bereit ist
    if (!router.isReady) {
      return;
    }

    const currentPath = router.pathname;
    const isCurrentlyPublic = isPublicPath(currentPath);

    // 🚨 KRITISCH: Wenn die Seite öffentlich ist, darf unter keinen Umständen eine Weiterleitung stattfinden.
    // Dies ist die wichtigste Regel und hat Vorrang vor allem anderen.
    if (isCurrentlyPublic) {
      return;
    }

    // Wenn die Seite nicht öffentlich ist, warten wir auf einen definitiven Auth-Status.
    if (authStatus === 'loading' || authStatus === 'idle') {
      return;
    }

    // Ab hier wissen wir: Die Seite ist GESCHÜTZT und der Auth-Status ist DEFINITIV.
    const isAuthenticatedUser = authStatus === 'authenticated';
    const isGuestUser = useAuthStore.getState().isGuest;
    const authenticatedStartPath = '/start';
    const unauthenticatedLandingPath = '/';

    // Fall 1: Eingeloggter Benutzer auf einer geschützten Seite.
    // Er sollte hier sein, es sei denn, er ist auf einer Auth-Seite gelandet (sollte nicht passieren).
    if (isAuthenticatedUser && !isGuestUser) {
      if (currentPath.startsWith('/auth')) {
        debouncedRouterPush(router, authenticatedStartPath, undefined, true);
      }
      return; // Ansonsten alles ok.
    }

    // Fall 2: Nicht eingeloggter Benutzer oder Gast auf einer geschützten Seite.
    // In beiden Fällen muss er zum Landing-Screen weitergeleitet werden.
    if (!isAuthenticatedUser || isGuestUser) {
      // 🚨 NEUE CONTEXT-BEWUSSTE LOGIK: Unterscheide Browser vs. PWA Navigation
      const guestFromWelcome = typeof window !== 'undefined' 
        ? sessionStorage.getItem('guestFromWelcome') 
        : null;
      
      if (guestFromWelcome === 'true') {
        // Browser-Nutzer: Gast von WelcomeScreen → Zurück zu /
        console.log('[_app] Context erkannt: guestFromWelcome=true, navigiere zu /');
        sessionStorage.removeItem('guestFromWelcome'); // Flag bereinigen
      debouncedRouterPush(router, unauthenticatedLandingPath, undefined, true);
      } else {
        // PWA-Nutzer oder andere: Context-basierte Weiterleitung
        const isPWAContext = typeof window !== 'undefined' && 
          (window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://'));
        
        const targetPath = isPWAContext ? '/auth/login' : unauthenticatedLandingPath;
        console.log(`[_app] ${isPWAContext ? 'PWA' : 'Browser'}-Context erkannt, navigiere zu ${targetPath}`);
        debouncedRouterPush(router, targetPath, undefined, true);
      }
    }
    
  }, [authStatus, router.isReady, router.pathname]);

  // NEU: Logik zur Unterscheidung öffentlicher/privater Seiten für das Rendering
  const isPublicPage = useMemo(() => {
    // 🚨 KORREKTUR: Verwende die zentrale Funktion
    return isPublicPath(router.pathname);
  }, [router.pathname]);

  // NEU: useEffect zur Prüfung auf aktives Turnier für den eingeloggten Benutzer
  useEffect(() => {
    if (!router.isReady || authStatus !== 'authenticated') {
      if (hasBeenRedirected) {
        setHasBeenRedirected(false);
      }
      return;
    }

    const user = useAuthStore.getState().user;
    if (!user) {
      // console.error('[_app Effect] Unexpected: authStatus is authenticated but no user found.');
      return;
    }
    
    setHasBeenRedirected(false);
    checkUserActiveTournament(user.uid);
  }, [authStatus, router.isReady, checkUserActiveTournament, setHasBeenRedirected]); // user entfernt, da es implizit durch authStatus abgedeckt ist, hasBeenRedirected entfernt

  // NEU: useEffect für die Weiterleitung zum aktiven Turnier
  useEffect(() => {
    const isDebugMode = process.env.NODE_ENV === 'development' && false;
    if (router.isReady && authStatus === 'authenticated' && userActiveTournamentStatus === 'success' && userActiveTournamentId && !hasBeenRedirected) {
      const targetPath = `/view/tournament/${userActiveTournamentId}`;
      const currentPath = router.pathname;

      const protectedPaths = [
        targetPath, 
        '/jass', 
        '/game', 
        '/tournaments/[instanceId]/settings', 
        '/view/session', 
        '/view/group' 
      ];

      const isProtectedPath = protectedPaths.some(p => {
        if (p.includes('[instanceId]')) { 
          const baseProtectedPath = p.substring(0, p.indexOf('['));
          return currentPath.startsWith(baseProtectedPath);
        }
        return currentPath.startsWith(p);
      });
      
      if (isDebugMode && !isProtectedPath) {
        // console.log(`[_app Effect Tournament Redirect] Current path: ${currentPath}, Target: ${targetPath}, IsProtected: ${isProtectedPath}`);
      }

      if (!isProtectedPath) {
        const timerId = setTimeout(() => {
          if (isDebugMode) console.log(`[_app Effect] Active tournament ${userActiveTournamentId} found. Redirecting from ${currentPath} to ${targetPath} (delayed)...`);
          debouncedRouterPush(router, targetPath, undefined, true); 
          setHasBeenRedirected(true); 
        }, 0);
        return () => clearTimeout(timerId);
      } else {
        // if (isDebugMode) console.log(`[_app Effect] Active tournament ${userActiveTournamentId} found, but current path ${currentPath} is protected or target. No redirect.`);
      }
    }
    if (router.isReady && userActiveTournamentStatus === 'success' && !userActiveTournamentId && hasBeenRedirected) {
        // if (isDebugMode) console.log('[_app Effect] Active tournament ended and user was previously redirected. Resetting redirect flag.');
        setHasBeenRedirected(false);
    }
  }, [userActiveTournamentId, userActiveTournamentStatus, router.isReady, router.pathname, hasBeenRedirected, setHasBeenRedirected, authStatus]); // router-Objekt entfernt

  // --- Immer die Haupt-App-Struktur rendern --- 
  return (
    <AppProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <title>Jassguru - Die Jass-Community in deiner Tasche</title>
        <meta name="description" content="Schneller, smarter, vernetzter Jassen" />
        <meta property="og:title" content="Jassguru - Die Jass-Community in deiner Tasche" />
        <meta property="og:description" content="Schneller, smarter, vernetzter Jassen" />
        <meta property="og:url" content="https://jassguru.ch" />
        <meta property="og:image" content="https://jassguru.ch/apple-touch-icon.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Jassguru - Die Jass-Community in deiner Tasche" />
        <meta name="twitter:description" content="Schneller, smarter, vernetzter Jassen" />
        <meta name="twitter:image" content="https://jassguru.ch/apple-touch-icon.png" />
      </Head>
      <AuthProvider>
        <UserProvider>
          <FirestoreSyncProvider>
            {/* --- HIER: Bedingtes Rendern von Seite oder Ladeanzeige --- */}
            {isAppLoaded ? (
              <Component {...pageProps} />
            ) : (
              <LoadingScreen />
            )}
            {/* --- Ende bedingtes Rendern --- */}
            
            <GlobalNotificationContainer />
            <PwaUpdateHandler /> 
          </FirestoreSyncProvider>
        </UserProvider>
      </AuthProvider>
      <DebugLog initiallyVisible={false} />
    </AppProvider>
  );
};

export default MyApp;
