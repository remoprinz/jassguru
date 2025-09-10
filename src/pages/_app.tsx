import React, {useEffect, useState} from "react";
import "../styles/globals.css";
import type {AppProps} from "next/app";
import { useRouter } from "next/router";
import {AppProvider} from "../contexts/AppContext";
import Head from "next/head";
import {useWakeLock} from "../hooks/useWakeLock";
import {AuthProvider} from "../providers/AuthProvider";
import {UserProvider} from "../providers/UserProvider";
import {useAuthStore} from "@/store/authStore";
import {useTournamentStore} from "@/store/tournamentStore";
import {useUIStore} from "@/store/uiStore";
import GlobalNotificationContainer from "../components/notifications/GlobalNotificationContainer";
import PwaUpdateHandler from '@/components/pwa/PwaUpdateHandler';
import {FirestoreSyncProvider} from '@/providers/FirestoreSyncProvider';
import {ClipLoader} from "react-spinners";
import {debouncedRouterPush} from '../utils/routerUtils';
import {isPublicPath} from "@/lib/utils";
import {getOfflineDB} from '../utils/indexedDBHelper';
import {initSyncEngine} from '@/services/offlineSyncEngine';
import {getAuth, onAuthStateChanged} from 'firebase/auth';
import useViewportHeight from '../hooks/useViewportHeight';
import {useBackgroundOptimization} from '../hooks/useBackgroundOptimization';
import {UpdateBanner} from '@/components/pwa/UpdateBanner';
import GlobalLoader from '@/components/layout/GlobalLoader';
import FullscreenLoader from '@/components/ui/FullscreenLoader';

// App-Watchdog in index.html verschoben für frühere Ausführung

// EMERGENCY: Robuste LoadingScreen mit Notfall-Escape
const LoadingScreen: React.FC<{ onForceLoad?: () => void }> = ({ onForceLoad }) => {
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [showEmergencyButton, setShowEmergencyButton] = useState(false);
  
  useEffect(() => {
    // Zeige Warnung nach 2 Sekunden
    const warningTimer = setTimeout(() => {
      setTimeoutWarning(true);
    }, 2000);
    
    // Zeige Notfall-Button nach 4 Sekunden (vorher 5s)
    const emergencyTimer = setTimeout(() => {
      setShowEmergencyButton(true);
    }, 4000);
    
    return () => {
      clearTimeout(warningTimer);
      clearTimeout(emergencyTimer);
    };
  }, []);
  
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-full bg-gray-900 text-white p-6">
      <ClipLoader color="#ffffff" size={40} />
      <p className="mt-4 text-lg">App wird geladen...</p>
      
      {timeoutWarning && (
        <p className="mt-2 text-sm text-gray-400 text-center max-w-xs">
          Falls die App nicht lädt, prüfe deine Internetverbindung.
        </p>
      )}
      
      {showEmergencyButton && onForceLoad && (
        <div className="mt-4 text-center">
          <button
            onClick={onForceLoad}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold transition-colors"
          >
            App trotzdem laden
          </button>
          <p className="mt-2 text-xs text-gray-500 max-w-xs">
            Notfall-Modus: Lädt die App ohne vollständige Initialisierung
          </p>
        </div>
      )}
    </div>
  );
};

const MyApp = ({Component, pageProps}: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();
  // 🚨 KRITISCH: Setze --vh Variable global für alle Seiten
  useViewportHeight();
  // 🚀 NEU: Background Image Optimization für bessere Performance
  useBackgroundOptimization();
  
  // Client-seitige Initialisierung: Watchdog aus index.html entfernen
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.cancelPwaLoadTimeout === 'function') {
      window.cancelPwaLoadTimeout();
    }
  }, []);

  // 🚨 HINWEIS: Die Service Worker Registrierung wird nun vollständig vom
  // <PwaUpdateHandler /> und dem Service selbst gemanagt.
  // Der Codeblock hier wird entfernt, um Redundanz zu vermeiden und
  // die Logik an einem zentralen Ort zu bündeln.

  const setAuthUser = useAuthStore((state) => state.setAuthUser);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  const status = useAuthStore((state) => state.status);
  const isGuest = useAuthStore((state) => state.isGuest);
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


  // 🚨 ROBUST: App-Loading-Logic mit Service-Berücksichtigung und Timeout
  useEffect(() => {
    if (!router.isReady) return;

    let loadingTimer: NodeJS.Timeout;
    let hasLoaded = false;

    const markAsLoaded = () => {
      if (!hasLoaded) {
        hasLoaded = true;
        setIsAppLoaded(true);
        if (loadingTimer) clearTimeout(loadingTimer);
      }
    };

    // Sofort laden wenn:
    // 1. Öffentliche Seite (keine Auth nötig)
    // 2. Auth bereits abgeschlossen
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : router.asPath;
    const isPublicPage = isPublicPath(currentPath);
    
    if (isPublicPage || status === 'authenticated' || status === 'unauthenticated') {
      markAsLoaded();
    } else {
      // Warte auf Auth, aber maximal 7 Sekunden (vorher 3s)
      loadingTimer = setTimeout(() => {
        console.warn('[App] Loading timeout reached, forcing app load');
        markAsLoaded();
      }, 7000);
    }

    return () => {
      if (loadingTimer) clearTimeout(loadingTimer);
    };
  }, [router.isReady, status]);

  // --- VEREINFACHTES ROUTING ---
  useEffect(() => {
    if (!router.isReady || !isAppLoaded || status === 'loading' || status === 'idle') {
      return;
    }

    // 🎯 FINAL FIX: Lese immer den echten Pfad aus dem Browser
    // Dies stellt sicher, dass der Auth-Guard die gleiche Info hat wie der SPA-Router in index.tsx
    const currentPath = window.location.pathname;

    // Prüfe, ob die Seite öffentlich ist. Wenn ja, darf der Auth-Guard NICHTS tun.
    if (isPublicPath(currentPath)) {

      return;
    }

    // Nur wenn die Seite NICHT öffentlich ist, prüfen wir auf Authentifizierung.
    const isAuthenticatedUser = status === 'authenticated' && !isGuest;
    const isGuestUser = status === 'unauthenticated' && isGuest;

    if (!isAuthenticatedUser && !isGuestUser) {
      console.log(`[_app.tsx] Private Seite ${currentPath} - Weiterleitung zu / wegen Auth-Status: ${status}, isGuest: ${isGuest}`);
      debouncedRouterPush(router, '/', undefined, true);
    }
  }, [router.isReady, isAppLoaded, status, isGuest]); // router.pathname wird nicht mehr benötigt


  // NEU: useEffect zur Prüfung auf aktives Turnier für den eingeloggten Benutzer
  useEffect(() => {
    // Nur für authentifizierte Benutzer und wenn App geladen ist
    if (!router.isReady || !isAppLoaded || status !== 'authenticated') {
      return;
    }

    const user = useAuthStore.getState().user;
    if (!user) {
      return;
    }
    
    checkUserActiveTournament(user.uid);
  }, [status, router.isReady, isAppLoaded, checkUserActiveTournament]);

  // NEU: useEffect für die Weiterleitung zum aktiven Turnier
  useEffect(() => {
    // Nur wenn alles bereit ist und wir einen definitiven Tournament-Status haben
    if (!router.isReady || !isAppLoaded || status !== 'authenticated' || 
        userActiveTournamentStatus !== 'success' || !userActiveTournamentId || hasBeenRedirected) {
      return;
    }

    const targetPath = `/view/tournament/${userActiveTournamentId}`;
    const currentPath = router.pathname;

      // Vereinfachte Protected-Path-Prüfung - NEU: Öffentliche View-Pfade ausschließen
  const isAlreadyOnTournamentPath = currentPath.startsWith('/view/tournament/') ||
                                    currentPath.startsWith('/jass') ||
                                    currentPath.startsWith('/game') ||
                                    isPublicPath(currentPath); // NEU: Alle öffentlichen Pfade ausschließen
    
    if (!isAlreadyOnTournamentPath) {
      debouncedRouterPush(router, targetPath, undefined, true); 
      setHasBeenRedirected(true); 
    }
  }, [userActiveTournamentId, userActiveTournamentStatus, router.isReady, isAppLoaded, 
      router.pathname, hasBeenRedirected, setHasBeenRedirected, status]);

  // NEU: Sync-Engine Initialisierung
  useEffect(() => {
    let syncEngine: any = null;
    
    const initializeOfflineSync = async () => {
      try {
        // Warte bis IndexedDB initialisiert ist
        await getOfflineDB();
        // IndexedDB initialisiert, starte Offline Sync Engine
        syncEngine = initSyncEngine();
        // Offline Sync Service erfolgreich initialisiert
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

  // Initialisiere Offline Sync Service (Service wird automatisch durch Import initialisiert)

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
              <LoadingScreen onForceLoad={() => setIsAppLoaded(true)} />
            )}
            {/* --- Ende bedingtes Rendern --- */}
            
            <GlobalNotificationContainer />
            <PwaUpdateHandler /> {/* 🎯 PWA-Updates nur im PWA-Modus */}
            <UpdateBanner /> {/* ✨ NEU: Permanenter Update-Banner */}
            {/* 🚀 NEU: Globaler Loader für "Neues Spiel" und andere Operationen */}
            {useUIStore(state => state.isLoading) && (
              <GlobalLoader message="Nächstes Spiel wird vorbereitet..." color="white" />
            )}
            {/* 🚀 NEU: Globaler FullscreenLoader für Session-Finalisierung */}
            {useUIStore(state => state.isFinalizingSession) && (
              <FullscreenLoader text="Daten und Statistiken werden aktualisiert..." />
            )}
          </FirestoreSyncProvider>
        </UserProvider>
      </AuthProvider>
    </AppProvider>
  );
};

export default MyApp;
