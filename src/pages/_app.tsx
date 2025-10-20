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
import { SeoHead } from "@/components/layout/SeoHead";
import { fixChromeScaling, detectBrowserScaling } from '../utils/browserFix';
import { CanonicalLink } from '@/components/seo/CanonicalLink';

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
    
    // 🔧 Browser-spezifische Fixes (Chrome-Skalierung)
    fixChromeScaling();
    
    // Debug: Browser-Info loggen
    const browserInfo = detectBrowserScaling();
    if (browserInfo) {
      // Browser erkannt
    }
    
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
      // 🛡️ BULLETPROOF: Warte auf Auth, aber maximal 4 Sekunden für bessere UX
      loadingTimer = setTimeout(() => {
        // console.warn('[App] Loading timeout reached, forcing app load');
        markAsLoaded();
      }, 4000);
    }

    return () => {
      if (loadingTimer) clearTimeout(loadingTimer);
    };
  }, [router.isReady, status]);

  // 🚨 ABSOLUTER FAILSAFE: Erzwinge nach 5s ein Rendering, selbst wenn router.isReady nie true wird
  useEffect(() => {
    if (isAppLoaded) return;
    const hardFallback = setTimeout(() => {
      setIsAppLoaded(true);
    }, 5000);
    return () => clearTimeout(hardFallback);
  }, [isAppLoaded]);

  // 🛡️ BULLETPROOF: Stabilisierter Auth-Guard mit Entprellung
  useEffect(() => {
    // Nur bei stabilen Auth-Status-Werten ausführen
    const stableStatuses = ['authenticated', 'unauthenticated'];
    if (!router.isReady || !isAppLoaded || !stableStatuses.includes(status)) {
      return;
    }

    // 🛡️ Entprellung: Kurz warten, um Race Conditions zu vermeiden
    const guardTimer = setTimeout(() => {
      const currentPath = window.location.pathname;

      // Prüfe, ob die Seite öffentlich ist
      if (isPublicPath(currentPath)) {
        return;
      }

      // Nur bei privaten Seiten Auth prüfen
      const isAuthenticatedUser = status === 'authenticated' && !isGuest;
      const isGuestUser = status === 'unauthenticated' && isGuest;

      if (!isAuthenticatedUser && !isGuestUser) {
        // console.log(`[Auth-Guard] Private Seite ${currentPath} - Redirect zu / (Status: ${status}, Gast: ${isGuest})`);
        debouncedRouterPush(router, '/', undefined, true);
      }
    }, 100); // 100ms Entprellung

    return () => clearTimeout(guardTimer);
  }, [router.isReady, isAppLoaded, status, isGuest]);


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

  // 🛡️ BULLETPROOF: Nicht-blockierende Sync-Engine Initialisierung
  useEffect(() => {
    let syncEngine: any = null;
    
    const initializeOfflineSync = async () => {
      try {
        // 🛡️ BULLETPROOF: IndexedDB mit Timeout-Protection
        await Promise.race([
          getOfflineDB(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('IndexedDB timeout')), 2000)
          )
        ]);
        
        syncEngine = initSyncEngine();
        // console.log('[App] ✅ Offline Sync Engine initialisiert');
      } catch (error) {
        console.warn('[App] ⚠️ Offline Sync nicht verfügbar (nicht kritisch):', error);
        // App funktioniert weiter ohne Offline-Sync
      }
    };

    // Nur initialisieren, wenn wir im Browser sind - nicht-blockierend
    if (typeof window !== 'undefined') {
      // Starte Initialisierung im Hintergrund, blockiere aber nicht die App
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
        // console.log('[App] 🧪 Offline test helper loaded. Use testOfflineSync() in console to run tests.');
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
      </Head>
      <CanonicalLink />
      <SeoHead />
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
