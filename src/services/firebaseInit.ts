import {initializeApp, /* getApps, getApp,*/ FirebaseApp} from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  sendPasswordResetEmail,
  User,
  Auth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {getAnalytics, isSupported, Analytics} from "firebase/analytics";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  Firestore,
  CollectionReference,
  DocumentData,
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import {getStorage, /* connectStorageEmulator,*/ FirebaseStorage} from "firebase/storage";

// Prüfen, ob wir in einer lokalen Entwicklungsumgebung sind
const isLocalEnv = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

// Firebase-Konfiguration für Next.js mit dynamischer authDomain
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // Firebase-Auth Domain immer verwenden, auch lokal - damit Authentifizierung funktioniert
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Überprüfen, ob die Firebase-Konfiguration vollständig ist
const isMissingConfig = () => {
  const missingFields = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([configKey]) => configKey);

  if (missingFields.length > 0) {
    // console.warn("Fehlende Firebase-Konfigurationsfelder:", missingFields);
    return true;
  }
  return false;
};

// Wenn die Konfiguration unvollständig ist, zeige eine deutliche Warnung
if (isMissingConfig()) {
  console.error(
    "❌ FIREBASE-KONFIGURATION FEHLT! ❌\n" +
    "Bitte stelle sicher, dass du die .env.local Datei korrekt eingerichtet hast.\n" +
    "Kopiere .env.example zu .env.local und fülle alle NEXT_PUBLIC_FIREBASE_* Werte aus.\n" +
    "Die Anwendung wird nicht korrekt funktionieren, bis dies behoben ist."
  );

  // Wir setzen keinen Fallback mehr, da dies ein Sicherheitsrisiko darstellt
  // Stattdessen wird die App im Offline-Modus laufen oder einen Fehler anzeigen
}

// CORS-Workaround für localhost
if (isLocalEnv) {
  // console.log("Lokale Entwicklungsumgebung erkannt, optimiere Konfiguration für localhost");

  // Firebase Authentifizierung im Offline-Modus deaktivieren
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_ENABLED === "false") {
    // console.log("Firebase-Authentifizierung ist in der lokalen Entwicklungsumgebung eingeschränkt.");
    // console.log("Für den Offline-Modus wird empfohlen, die lokale Entwicklungsanmeldung zu verwenden.");
    // console.log("Oder aktiviere die Firebase Auth Emulator-Suite durch Setzen von NEXT_PUBLIC_FIREBASE_EMULATOR_ENABLED=true");
  }

  // console.log("Lokale Entwicklung: authDomain auf \"localhost\" gesetzt, um CORS- und Referer-Probleme zu vermeiden.");
}

// Initialisiere Firebase nur, wenn die Konfiguration vorhanden ist
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let analytics: Analytics | null = null;

let isFirebaseInitialized = false;

try {
  // Initialisiere Firebase
  app = initializeApp(firebaseConfig);

  // Auth initialisieren
  auth = getAuth(app);

  // Setze Persistenz auf LOCAL, damit Benutzer über längere Zeit eingeloggt bleiben
  // Dies wird nur im Browser ausgeführt, nicht im Server-Kontext
  if (typeof window !== "undefined") {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        // console.log("Firebase Auth: Persistenz auf LOCAL gesetzt - Benutzer bleiben nun über einen längeren Zeitraum eingeloggt.");
      })
      .catch((error) => {
        console.error("Fehler beim Setzen der Persistenz:", error);
      });
  }

  // Emulator-Konfiguration
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_ENABLED === "true") {
    // console.log("Verbinde mit Firebase Auth Emulator auf localhost:9099");
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  }

  // Für die lokale Entwicklung: Zusätzliche Konfiguration für Auth
  if (isLocalEnv) {
    // DEAKTIVIERT: Auth Domain Überschreibung entfernt, damit Firebase Auth korrekt funktioniert
    // auth.config.authDomain = 'localhost';
    // console.log('Auth authDomain explizit auf "localhost" gesetzt');

    // Debug-Information
    // console.log("Verwende Firebase Auth mit Original Auth Domain für korrekte Authentifizierung");
  }

  // Firestore initialisieren
  try {
    if (typeof window !== "undefined") {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      });
      // console.log("✅ Firestore initialisiert mit Multi-Tab Offline-Persistenz und unlimitiertem Cache.");
    } else {
      // Fallback für Server-Kontext (z.B. während des Builds), wo keine Persistenz möglich ist
      db = getFirestore(app);
      // console.log("✅ Firestore initialisiert für Server-Kontext (ohne Persistenz).");
    }
  } catch (error) {
    console.error("Fehler bei der Firestore-Initialisierung:", error);
    // Fallback auf eine nicht-persistente Instanz, falls die Initialisierung fehlschlägt
    db = getFirestore(app);
  }

  // Storage initialisieren
  storage = getStorage(app);

  isFirebaseInitialized = true;

  // Analytics bedingt initialisieren (falls im Browser)
  if (typeof window !== "undefined") {
    // Prüfen, ob wir in lokaler Entwicklung sind
    if (isLocalEnv) {
      // console.log("Analytics wird in der lokalen Entwicklungsumgebung deaktiviert");
      analytics = null; // Kein Analytics in lokaler Entwicklung
    } else {
      // Nur im Browser und in Produktion Analytics initialisieren
      isSupported().then((supported) => {
        if (supported) {
          analytics = getAnalytics(app);
        }
      }).catch((error) => {
        console.error("Analytics nicht unterstützt:", error);
      });
    }
  }

  // Zusätzliche Debugging-Informationen für lokale Entwicklung
  if (isLocalEnv) {
    // console.log("Lokale Entwicklungsumgebung: Vollständige Firebase-Konfiguration:", {
    //   ...firebaseConfig,
    //   apiKey: firebaseConfig.apiKey ? "[VORHANDEN]" : "[FEHLT]", // Zeige nicht den tatsächlichen API-Key
    // });

    // Für die lokale Entwicklung ohne Emulator gibt es einige Einschränkungen
    // console.warn(
    //   "Hinweis: In der lokalen Entwicklungsumgebung wurde die Firebase-Auth " +
    //   "für die korrekte Verwendung mit localhost konfiguriert. " +
    //   "Falls weiterhin Probleme auftreten, verwende die lokale Entwicklungsanmeldung oder " +
    //   "aktiviere die Firebase Auth Emulator-Suite."
    // );
  }
} catch (error) {
  console.error("Fehler bei der Firebase-Initialisierung:", error);

  // Dummy-Objekte erstellen
  // @ts-expect-error - Firebase-App-Dummy für Offline-Mode
  app = {};
  // @ts-expect-error - Firebase-Auth-Dummy für Offline-Mode
  auth = {};
  // @ts-expect-error - Firestore-DB-Dummy für Offline-Mode
  db = {};
}

// Funktionen zum Registrieren, Anmelden und Zurücksetzen des Passworts

const registerWithEmailAndPassword = async (email: string, password: string): Promise<User> => {
  try {
    if (!isFirebaseInitialized) {
      throw new Error("Firebase Auth ist nicht initialisiert oder im Offline-Modus.");
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error("Error during registration:", error);
    throw error;
  }
};

const resetPassword = async (email: string): Promise<void> => {
  try {
    if (!isFirebaseInitialized) {
      throw new Error("Firebase Auth ist nicht initialisiert oder im Offline-Modus.");
    }

    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error resetting password:", error);
    throw error;
  }
};

const signInWithGoogle = async (): Promise<User> => {
  try {
    if (!isFirebaseInitialized) {
      throw new Error("Firebase Auth ist nicht initialisiert oder im Offline-Modus.");
    }

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

// Interface für Collections
interface Collections {
  users: CollectionReference<DocumentData> | null;
  players: CollectionReference<DocumentData> | null;
  groups: CollectionReference<DocumentData> | null;
  games: CollectionReference<DocumentData> | null;
  teams: CollectionReference<DocumentData> | null;
}

// Collection-Referenzen für Firestore
let collections: Collections = {
  users: null,
  players: null,
  groups: null,
  games: null,
  teams: null,
};

if (isFirebaseInitialized) {
  try {
    collections = {
      users: collection(db, "users"),
      players: collection(db, "players"),
      groups: collection(db, "groups"),
      games: collection(db, "games"),
      teams: collection(db, "teams"),
    };
  } catch (error) {
    console.error("Fehler beim Initialisieren der Firestore-Collections:", error);
  }
}

export {
  auth,
  analytics,
  app,
  db,
  storage,
  registerWithEmailAndPassword,
  signInWithEmailAndPassword,
  resetPassword,
  signInWithGoogle,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  sendPasswordResetEmail,
  getAuth,
  // Firestore exports
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
};

export const firebaseApp = app;
export {collections};

// Prüft, ob wir im lokalen Entwicklungsmodus sind
export const isLocalDevelopment = () => {
  return isLocalEnv;
};

// Prüft, ob wir im Offline-Modus arbeiten sollten (lokale Entwicklung oder explizite Konfiguration)
export const isOfflineMode = () => {
  // Nur aktivieren, wenn explizit angefordert
  return process.env.NEXT_PUBLIC_FIREBASE_PREFER_OFFLINE === "true";
  // Original: return isLocalDevelopment() && process.env.NEXT_PUBLIC_FIREBASE_PREFER_OFFLINE === 'true';
};

// Prüft, ob lokale Authentifizierung verwendet werden soll
export const useLocalAuth = () => {
  // Lokale Authentifizierung explizit aktivieren
  return isLocalDevelopment() && process.env.NEXT_PUBLIC_FIREBASE_USE_LOCAL_AUTH === "true";
};

// Flag zur Prüfung, ob Firebase korrekt initialisiert wurde
export const isFirebaseReady = isFirebaseInitialized;

// NEUE FUNKTION: Cache zurücksetzen
/**
 * Versucht, den Firestore-Cache zurückzusetzen, indem nur das Netzwerk kurz neu verbunden wird.
 * Diese sanftere Methode sollte weniger Konflikte verursachen als ein komplettes Deaktivieren.
 */
export const resetFirestoreCache = async (): Promise<void> => {
  if (!isFirebaseInitialized) {
    console.warn("[Firebase] resetFirestoreCache: Firebase ist nicht initialisiert.");
    return;
  }

  try {
    const { enableNetwork } = await import('firebase/firestore');
    
    console.log("[Firebase] Starte sanfte Cache-Aktualisierung...");
    
    // Netzwerkverbindung neu herstellen, ohne vorher zu deaktivieren
    await enableNetwork(db);
    console.log("[Firebase] Netzwerkverbindung aktualisiert.");
    
    // Benachrichtigung anzeigen, wenn UIStore verfügbar ist
    try {
      const { useUIStore } = require('../store/uiStore');
      if (useUIStore && typeof useUIStore.getState === 'function') {
        useUIStore.getState().showNotification({
          type: "info",
          message: "Daten wurden synchronisiert.",
          duration: 3000
        });
      }
    } catch (notificationError) {
      // UIStore möglicherweise noch nicht initialisiert, ignorieren
    }
    
    return;
  } catch (error) {
    console.error("[Firebase] Fehler bei der Firestore-Cache-Aktualisierung:", error);
    
    // Benachrichtigung über den Fehler anzeigen
    try {
      const { useUIStore } = require('../store/uiStore');
      if (useUIStore && typeof useUIStore.getState === 'function') {
        useUIStore.getState().showNotification({
          type: "error",
          message: "Fehler bei der Datensynchronisation. Bitte App neu laden.",
          duration: 5000
        });
      }
    } catch (notificationError) {
      // UIStore möglicherweise noch nicht initialisiert, ignorieren
    }
  }
};
