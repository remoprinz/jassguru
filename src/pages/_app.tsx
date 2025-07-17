import React, {useEffect, useState, useMemo} from "react";
import "../styles/globals.css";
import type {AppProps} from "next/app";
import { useRouter } from "next/router";
// 🧟‍♂️ ZOMBIE KILLER CODE ENTFERNT
import {AppProvider} from "../contexts/AppContext";
import Head from "next/head";
import {useWakeLock} from "../hooks/useWakeLock";
import {AuthProvider} from "../providers/AuthProvider";
import {UserProvider} from "../providers/UserProvider";
import {useAuthStore} from "@/store/authStore";
import {useTournamentStore} from "@/store/tournamentStore"; // NEU: TournamentStore importieren
import {useUIStore} from "@/store/uiStore"; // NEU: UIStore importieren
import GlobalNotificationContainer from "../components/notifications/GlobalNotificationContainer";
import PwaUpdateHandler from '@/components/pwa/PwaUpdateHandler'; // 🎯 PWA-Handler wieder aktiviert
import { FirestoreSyncProvider } from '@/providers/FirestoreSyncProvider'; // Neu importieren
import { ClipLoader } from "react-spinners"; // Import für einen Spinner
import { debouncedRouterPush } from '../utils/routerUtils';
import { isPublicPath } from "@/lib/utils"; // 🚨 NEU: Importiere die zentrale Funktion
import { handleIndexedDBCorruption, isIndexedDBCorruptionError, getOfflineDB } from '../utils/indexedDBHelper';
import { initSyncEngine } from '@/services/offlineSyncEngine';
import { offlineSyncService } from '@/services/offlineSyncService';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth'; // NEU
// 🧟‍♂️ NOTFALL-CACHE-CLEAR ENTFERNT

// 🚨 IMPROVED: Hilfskomponente für die Ladeanzeige mit besserer UX
const LoadingScreen: React.FC = () => {
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  
  useEffect(() => {
    // Zeige Warnung nach 2 Sekunden
    const warningTimer = setTimeout(() => {
      setTimeoutWarning(true);
    }, 2000);
    
    return () => clearTimeout(warningTimer);
  }, []);
  
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-full bg-gray-900 text-white">
      <ClipLoader color="#ffffff" size={40} />
      <p className="mt-4 text-lg">App wird geladen...</p>
      {timeoutWarning && (
        <p className="mt-2 text-sm text-gray-400 text-center max-w-xs">
          Falls die App nicht lädt, prüfe deine Internetverbindung oder lade die Seite neu.
        </p>
      )}
    </div>
  );
};

const MyApp = ({Component, pageProps}: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();
  // const initAuth = useAuthStore((state) => state.initAuth); // ALT
  const setAuthUser = useAuthStore((state) => state.setAuthUser); // NEU
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated); // NEU
  const status = useAuthStore((state) => state.status); // NEU: Status direkt abonnieren
  const user = useAuthStore((state) => state.user); // NEU: User-Objekt holen
  const isGuest = useAuthStore((state) => state.isGuest);
  const isAuthenticated = useAuthStore.getState().isAuthenticated();
  // Debug-Log State entfernt
  const [isAppLoaded, setIsAppLoaded] = useState(false);
  const router = useRouter();

  // NEU: States und Actions aus dem tournamentStore holen
  const checkUserActiveTournament = useTournamentStore((state) => state.checkUserActiveTournament);
  const userActiveTournamentId = useTournamentStore((state) => state.userActiveTournamentId);
  const userActiveTournamentStatus = useTournamentStore((state) => state.userActiveTournamentStatus);

  // NEU: States und Actions aus dem uiStore für Redirect-Flag holen
  const hasBeenRedirected = useUIStore((state) => state.hasBeenRedirectedToActiveTournament);
  const setHasBeenRedirected = useUIStore((state) => state.setHasBeenRedirectedToActiveTournament);

  // Client-seitige Initialisierung & stabiler Auth-Listener
  useEffect(() => {
    setIsClient(true);
    
    // 🚨 NEU: Robuster, globaler onAuthStateChanged Listener
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setAuthUser(firebaseUser);
      } else {
        setUnauthenticated();
      }
    });

    // Cleanup-Funktion, die beim Unmount der App aufgerufen wird
    return () => unsubscribe();
    
  }, [setAuthUser, setUnauthenticated]);


  // 🚨 IMPROVED: App-Loading-Logic mit Auth-Timeout-Handling
  useEffect(() => {
    if (router.isReady) {
      const currentPath = router.pathname;
      const isCurrentPagePublic = isPublicPath(currentPath);
      
      // Öffentliche Seiten können sofort gerendert werden
      if (isCurrentPagePublic) {
        setIsAppLoaded(true);
        return;
      }
      
      // Private Seiten: Warte auf definitiven Auth-Status ODER Timeout
      if (status !== 'loading' && status !== 'idle') {
        setIsAppLoaded(true);
      } else {
        // 🚨 CRITICAL FIX: Auth-Timeout für hängende Loading-States
        const authTimeoutId = setTimeout(() => {
          if ((status === 'loading' || status === 'idle') && !isAppLoaded) {
            console.warn('_app.tsx: Auth-Status Timeout! Fallback zu WelcomeScreen.');
            // Forciere App-Loading und leite zur WelcomeScreen weiter
            setIsAppLoaded(true);
            if (!isCurrentPagePublic) {
              debouncedRouterPush(router, '/', undefined, true);
            }
          }
        }, 4000); // 4s Timeout (etwas länger als authStore Watchdog)
        
        return () => clearTimeout(authTimeoutId);
      }
    }
  }, [router.isReady, router.pathname, status, isAppLoaded]);

  // Debug-Log Doppelklick Handler entfernt

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

    // 🚨 IMPROVED: Robustere Auth-Status Behandlung
    if (status === 'loading' || status === 'idle') {
      // Zusätzlicher Timeout-Schutz: Falls App länger als 5s im loading/idle hängt
      const routingTimeoutId = setTimeout(() => {
        if ((status === 'loading' || status === 'idle')) {
          console.warn('_app.tsx: Routing-Timeout! Forciere Weiterleitung zu WelcomeScreen.');
          debouncedRouterPush(router, '/', undefined, true);
        }
      }, 5000);
      
      // Cleanup timeout when component unmounts or authStatus changes
      return () => clearTimeout(routingTimeoutId);
    }

    // Ab hier wissen wir: Die Seite ist GESCHÜTZT und der Auth-Status ist DEFINITIV.
    const isAuthenticatedUser = status === 'authenticated';
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
    
  }, [status, router.isReady, router.pathname]);

  // NEU: Logik zur Unterscheidung öffentlicher/privater Seiten für das Rendering
  const isPublicPage = useMemo(() => {
    // 🚨 KORREKTUR: Verwende die zentrale Funktion
    return isPublicPath(router.pathname);
  }, [router.pathname]);

  // NEU: useEffect zur Prüfung auf aktives Turnier für den eingeloggten Benutzer
  useEffect(() => {
    if (!router.isReady || status !== 'authenticated') {
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
  }, [status, router.isReady, checkUserActiveTournament, setHasBeenRedirected]); // user entfernt, da es implizit durch authStatus abgedeckt ist, hasBeenRedirected entfernt

  // NEU: useEffect für die Weiterleitung zum aktiven Turnier
  useEffect(() => {
    if (router.isReady && status === 'authenticated' && userActiveTournamentStatus === 'success' && userActiveTournamentId && !hasBeenRedirected) {
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
      
      if (!isProtectedPath) {
        const timerId = setTimeout(() => {
          debouncedRouterPush(router, targetPath, undefined, true); 
          setHasBeenRedirected(true); 
        }, 0);
        return () => clearTimeout(timerId);
      }
    }
    if (router.isReady && userActiveTournamentStatus === 'success' && !userActiveTournamentId && hasBeenRedirected) {
        setHasBeenRedirected(false);
    }
  }, [userActiveTournamentId, userActiveTournamentStatus, router.isReady, router.pathname, hasBeenRedirected, setHasBeenRedirected, status]);

  // NEU: Sync-Engine Initialisierung
  useEffect(() => {
    let syncEngine: any = null;
    
    const initializeOfflineSync = async () => {
      try {
        // Warte bis IndexedDB initialisiert ist
        await getOfflineDB();
        console.log('[App] IndexedDB initialisiert, starte Offline Sync Engine');
        
        // Jetzt erst den Sync Engine starten
        syncEngine = initSyncEngine();
        console.log('[App] Offline Sync Service initialisiert');
      } catch (error) {
        console.error('[App] Fehler bei der Initialisierung des Offline Sync:', error);
      }
    };

    // Nur initialisieren, wenn wir im Browser sind
    if (typeof window !== 'undefined') {
      initializeOfflineSync();
    }

    // Cleanup
    return () => {
      if (syncEngine) {
        syncEngine.stop();
      }
    };
  }, []); // Nur einmal beim Mount ausführen

  // 🧪 Offline test helper (nur in Development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      import('@/utils/offlineTestHelper').then(() => {
        console.log('[App] 🧪 Offline test helper loaded. Use testOfflineSync() in console to run tests.');
      });
    }
  }, []);

  // Initialisiere Offline Sync Service
  useEffect(() => {
    // Service wird automatisch durch Import initialisiert
    console.log('[App] Offline Sync Service initialisiert');
  }, []);

  // --- Immer die Haupt-App-Struktur rendern --- 
  return (
    <AppProvider>
      <Head>
        {/* Essential Meta Tags */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />

        {/* SEO & Branding Meta Tags */}
        <title>Jassguru.ch - Die Jass-Community in deiner Tasche</title>
        <meta name="description" content="Schneller, smarter, vernetzter Jassen. Deine digitale Jasstafel für Ranglisten, Statistiken und Turniere. Werde Teil der Jass-Community!" />
        <meta name="keywords" content="Jassen, Jass, Jass-Community, Jasstafel, Jasszähler, Rangliste, Statistik, Tabelle, Turnier, Schieber, Coiffeur, Differenzler, Schweizer Jass" />
        <link rel="canonical" href="https://www.jassguru.ch" />

        {/* Open Graph / Facebook Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.jassguru.ch/" />
        <meta property="og:title" content="Jassguru.ch - Die Jass-Community in deiner Tasche" />
        <meta property="og:description" content="Schneller, smarter, vernetzter Jassen. Deine digitale Jasstafel für Ranglisten, Statistiken und Turniere." />
        <meta property="og:image" content="https://www.jassguru.ch/apple-touch-icon.png" />

        {/* Twitter Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Jassguru.ch - Die Jass-Community in deiner Tasche" />
        <meta name="twitter:description" content="Schneller, smarter, vernetzter Jassen mit digitalen Ranglisten und Statistiken." />
        <meta name="twitter:image" content="https://www.jassguru.ch/apple-touch-icon.png" />
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
            <PwaUpdateHandler /> {/* 🎯 PWA-Updates nur im PWA-Modus */}
          </FirestoreSyncProvider>
        </UserProvider>
      </AuthProvider>
              {/* Debug-Log Komponente entfernt */}
    </AppProvider>
  );
};

export default MyApp;
