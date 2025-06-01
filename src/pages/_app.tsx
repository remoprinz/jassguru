import React, {useEffect, useState} from "react";
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
import { register as registerServiceWorker } from '@/pwa/serviceWorkerRegistration';
import { FirestoreSyncProvider } from '@/providers/FirestoreSyncProvider'; // Neu importieren
import { ClipLoader } from "react-spinners"; // Import für einen Spinner
import { debouncedRouterPush } from '../utils/routerUtils';
import { resetFirestoreCache } from '@/services/firebaseInit'; // NEU: Cache-Reset-Funktion importieren

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
    // Service Worker Registrierung mit Verzögerung wieder aktivieren -> AUSKOMMENTIERT
    /*
    const timerId = setTimeout(() => {
        // console.log('_app.tsx: useEffect - BEFORE calling register() (delayed)');
        registerServiceWorker(); 
        // console.log('_app.tsx: useEffect - AFTER calling register() (delayed)');
    }, 100);
    */
    
    // console.log('_app.tsx: useEffect - Calling initAuth()');
    initAuth();
    
    // Entferne den Cache-Reset, der die App blockiert
    // resetFirestoreCache().catch(error => {
    //   console.error('[_app.tsx] Fehler beim Zurücksetzen des Firestore-Cache:', error);
    // });

    // return () => clearTimeout(timerId); // Cleanup für Timer nicht mehr nötig
    
  }, [initAuth]);

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

  // --- NEUER useEffect für Weiterleitung (Überarbeitet) --- 
  useEffect(() => {
    // Nur ausführen, wenn der Router bereit ist und der Auth-Status nicht mehr lädt
    if (!router.isReady || authStatus === 'loading' || authStatus === 'idle') {
      // console.log(\'[_app Effect] Skipping general navigation: Router not ready or auth loading/idle.\');
      return;
    }

    const currentPath = router.pathname;
    const isAuthenticatedUser = authStatus === 'authenticated'; // Geändert von isAuthenticated zu isAuthenticatedUser für Klarheit
    const isGuestUser = useAuthStore.getState().isGuest; // Aktuellen Gaststatus holen

    // Pfade definieren
    const authPaths = ['/auth/login', '/auth/register'];
    const publicPaths = ['/', ...authPaths, '/jass', '/join', '/impressum', '/datenschutz', '/view/group', '/view/session', '/view/tournament'];
    const authenticatedStartPath = '/start';
    const unauthenticatedLandingPath = '/';

    // Minimale Debug-Ausgaben beibehalten oder über isDebugMode steuern
    const isDebugMode = process.env.NODE_ENV === 'development' && false; 
    if (isDebugMode) {
      console.log(`[DEBUG APP] Navigationscheck: Pfad=${currentPath}, AuthStatus=${authStatus}, isAuthenticatedUser=${isAuthenticatedUser}, isGuestUser=${isGuestUser}`);
      console.log(`[DEBUG APP] Auth Objekt:`, {
        status: useAuthStore.getState().status,
        user: useAuthStore.getState().user ? "Benutzer vorhanden" : "Kein Benutzer",
        isGuest: useAuthStore.getState().isGuest
      });
    }
    

    // --- Logik für eingeloggte Benutzer (NICHT Gäste) ---
    if (isAuthenticatedUser && !isGuestUser) {
      if (authPaths.some(p => currentPath.startsWith(p)) || currentPath === unauthenticatedLandingPath) {
        if (isDebugMode) console.log(`[_app Effect] Authentifizierter Benutzer auf Auth/Landing-Seite (${currentPath}). Leite weiter zu ${authenticatedStartPath}...`);
        setTimeout(() => {
          debouncedRouterPush(router, authenticatedStartPath, undefined, true);
        }, 100);
      } else {
        // if (isDebugMode) console.log(`[_app Effect] Authentifizierter Benutzer auf erlaubtem Pfad (${currentPath}). Keine Weiterleitung nötig.`);
      }
    }
    // --- Logik für NICHT eingeloggte Benutzer (KEINE Gäste) ---
    else if (!isAuthenticatedUser && !isGuestUser) {
      const isProtectedRoute = !publicPaths.some(p => currentPath.startsWith(p));
      // if (isDebugMode) console.log(`[DEBUG _app] Path: ${currentPath}, isProtectedRoute: ${isProtectedRoute}, authStatus: ${authStatus}, isGuest: ${isGuestUser}, publicPaths: ${JSON.stringify(publicPaths)}`);
      if (isProtectedRoute) {
        if (isDebugMode) console.log(`[DEBUG _app] REDIRECTING user from ${currentPath} to ${unauthenticatedLandingPath}`);
        debouncedRouterPush(router, unauthenticatedLandingPath, undefined, true);
      } else {
        // if (isDebugMode) console.log(`[_app Effect] Unauthenticated user on public path (${currentPath}). No redirect needed.`);
      }
    }
    // --- Logik für Gäste --- 
    else if (isGuestUser) {
        const isProtectedNonAuthRoute = !publicPaths.some(p => currentPath.startsWith(p)) && 
                                       !authPaths.some(p => currentPath.startsWith(p));
        
        if (isProtectedNonAuthRoute) {
            if (isDebugMode) console.log(`[_app Effect] Guest user on protected route (${currentPath}). Redirecting to landing...`);
            debouncedRouterPush(router, unauthenticatedLandingPath, undefined, true);
        } else {
            // if (isDebugMode) console.log(`[_app Effect] Guest user on allowed path (${currentPath}). No redirect needed.`);
        }
    }

  }, [authStatus, router.isReady, router.pathname]); // router-Objekt aus Abhängigkeiten entfernt, nur router.pathname und router.isReady

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
            {authStatus === 'loading' || authStatus === 'idle' ? (
              <LoadingScreen />
            ) : (
              <Component {...pageProps} />
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
