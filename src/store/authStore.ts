import {create} from "zustand";
import {persist} from "zustand/middleware";
import {auth, db} from "../services/firebaseInit";
import {onAuthStateChanged, User, fetchSignInMethodsForEmail, createUserWithEmailAndPassword, sendEmailVerification, updateProfile} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  loginWithEmail,
  registerWithEmail,
  signInWithGoogleProvider,
  logout as serviceLogout,
  sendPasswordReset,
  mapUserToAuthUser,
  resendVerificationEmail,
  uploadProfilePicture as uploadProfilePictureService,
  updateUserProfile,
  updateUserDocument,
} from "../services/authService";
import type { AuthStatus, AuthUser, AppMode } from "@/types/auth";
export type { AuthStatus };
import type { FirestorePlayer } from "@/types/jass";
import {useGroupStore} from "./groupStore";
import {doc, onSnapshot, Unsubscribe, FirestoreError, getDoc, serverTimestamp, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { processPendingInviteToken } from '../lib/handlePendingInvite';
import { PLAYERS_COLLECTION, USERS_COLLECTION } from "@/constants/firestore";
import { getPlayerIdForUser, syncDisplayNameAcrossCollections } from "../services/playerService";
import Router from 'next/router';
import { THEME_COLORS } from '@/config/theme';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  firebaseUser: User | null;
  appMode: AppMode;
  error: string | null;
  isGuest: boolean;
  isLoggingOut: boolean;
  uploadStatus?: "idle" | "loading" | "success" | "error";
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setAppMode: (mode: AppMode) => void;
  initAuth: () => void;
  clearError: () => void;
  continueAsGuest: () => void;
  clearGuestStatus: () => void;
  isAuthenticated: () => boolean;
  resendVerificationEmail: () => Promise<void>;
  uploadProfilePicture: (file: File) => Promise<void>;
  updateProfile: (updates: { displayName?: string; statusMessage?: string; profileTheme?: string }) => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

let userDocUnsubscribe: Unsubscribe | null = null;
let playerDocUnsubscribe: Unsubscribe | null = null;
let authInitTimeout: NodeJS.Timeout | null = null;
// 🚨 CRITICAL FIX: Prevent multiple initAuth calls from React StrictMode
let authStateUnsubscribe: (() => void) | null = null;
let isInitAuthInProgress = false;

// 🔧 Migration-Lock um Endlosschleifen zu verhindern
const migrationLocks = new Map<string, boolean>();

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Zustand
      status: "idle",
      user: null,
      firebaseUser: null,
      appMode: "offline",
      error: null,
      isGuest: false,
      isLoggingOut: false,
      uploadStatus: "idle",

      // Aktionen
      login: async (email: string, password: string) => {
        try {
          set({status: "loading", error: null});
          const user = await loginWithEmail(email, password);
          set({
            user,
            status: "authenticated",
            appMode: "online",
            isGuest: false,
          });
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
          });
          throw error;
        }
      },

      loginWithGoogle: async () => {
        try {
          set({status: "loading", error: null});
          const user = await signInWithGoogleProvider();
          set({
            user,
            status: "authenticated",
            appMode: "online",
            isGuest: false,
          });
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
          });
          throw error;
        }
      },

      register: async (email: string, password: string, displayName?: string) => {
        set({status: "loading", error: null});
        try {
          // Verwende die bewährte registerWithEmail Funktion aus authService,
          // die bereits createOrUpdateFirestoreUser aufruft und alles korrekt macht
          const user = await registerWithEmail(email, password, displayName);

          // Setze den Status zurück, damit der Ladebalken verschwindet.
          // onAuthStateChanged wird den Benutzer kurz darauf als eingeloggt erkennen.
          set({ status: 'unauthenticated' });

        } catch (error) {
          console.error("AUTH_STORE: Fehler bei Registrierung:", error);
          const firebaseError = error as FirebaseError;
          let errorMessage = "Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.";

          if (firebaseError.code === 'auth/email-already-in-use') {
            errorMessage = "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an oder verwende eine andere E-Mail.";
          } else if (firebaseError.code === 'auth/weak-password') {
            errorMessage = "Das Passwort ist zu schwach. Es muss mindestens 6 Zeichen lang sein.";
          }
          
          set({ status: 'error', error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      logout: async () => {
        console.log("AUTH_STORE: Starting logout process...");
        set({ isLoggingOut: true }); // Race Condition Prevention
        
        if (userDocUnsubscribe) {
          userDocUnsubscribe();
          userDocUnsubscribe = null;
        }
        if (playerDocUnsubscribe) {
          playerDocUnsubscribe();
          playerDocUnsubscribe = null;
        }
        useGroupStore.getState().resetGroupStore();
        try {
          set({status: "loading", error: null});
          await serviceLogout();
          set({
            user: null,
            firebaseUser: null,
            status: "unauthenticated",
            appMode: "offline",
            isGuest: false,
            isLoggingOut: false, // Reset nach erfolgreichem Logout
          });
          console.log("AUTH_STORE: Logout successful, navigating to /");
          Router.push('/');
        } catch (error) {
          console.error("AUTH_STORE: Fehler beim Logout:", error);
          set({
            status: "error", 
            error: "Abmeldung fehlgeschlagen",
            isLoggingOut: false // Reset auch bei Fehler
          });
        }
      },

      resetPassword: async (email: string) => {
        try {
          set({status: "loading", error: null});
          await sendPasswordReset(email);
          set({status: get().user ? "authenticated" : "unauthenticated"});
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten",
          });
          throw error;
        }
      },

      setAppMode: (mode: AppMode) => {
        set({appMode: mode});
      },

      continueAsGuest: () => {
        console.log('[AuthStore] continueAsGuest called');
        // Wichtig: Bestehende User-Daten / Auth-Status nicht überschreiben, falls jemand
        // versehentlich auf "Gast" klickt, obwohl er eingeloggt ist.
        // Ein echter Gast hat sowieso keinen User und Status 'unauthenticated'.
        const currentStatus = get().status;
        const currentUser = get().user;

        if (currentUser && currentStatus === 'authenticated') {
          // Bereits eingeloggter User klickt auf Gast -> nichts tun, um Session nicht zu zerstören
          console.warn('[AuthStore] User is already authenticated, ignoring continueAsGuest.');
          // Optional: Hier könnte man den User zur /start Seite leiten, wenn er auf / ist.
          // Router.push('/start');
          return; 
        }

        // NEU: Game-State zurücksetzen beim Übergang in den Gastmodus
        // Dies stellt sicher, dass keine vorherigen Spieldaten den Gastmodus beeinträchtigen
        console.log('[AuthStore] Resetting game state for clean guest mode');
        try {
          // Dynamischer Import, um zirkuläre Abhängigkeiten zu vermeiden
          import('./jassStore').then(({ useJassStore }) => {
            const jassStore = useJassStore.getState();
            jassStore.resetJass();
          });
          import('./gameStore').then(({ useGameStore }) => {
            const gameStore = useGameStore.getState();
            gameStore.resetGameState({ newActiveGameId: null });
          });
          import('./timerStore').then(({ useTimerStore }) => {
            const timerStore = useTimerStore.getState();
            timerStore.resetAllTimers();
          });
        } catch (error) {
          console.warn('[AuthStore] Error resetting game state during guest mode transition:', error);
          // Nicht kritisch - Game läuft trotzdem
        }

        set({
          user: null, // Ein Gast hat keinen AuthUser
          firebaseUser: null, // Ein Gast hat keinen FirebaseUser
          status: "unauthenticated", // Gast ist per Definition nicht authentifiziert
          appMode: "offline", // Gastmodus ist immer offline in Bezug auf Backend-Auth
          isGuest: true,
          error: null,
        });
        console.log('[AuthStore] Set to Guest Mode:', get());
      },

      clearGuestStatus: () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AuthStore] clearGuestStatus called');
        }
        // Setzt nur den Gaststatus zurück und ggf. den App-Modus,
        // beeinflusst aber nicht den angemeldeten User oder Auth-Status direkt.
        set(state => {
          if (state.isGuest) { // Nur ändern, wenn wirklich Gast
            return { isGuest: false, appMode: state.appMode === 'online' ? 'online' : 'offline' };
          }
          return {}; // Keine Änderung, wenn nicht Gast
        });
                  if (process.env.NODE_ENV === 'development') {
            console.log('[AuthStore] Guest status cleared:', get());
          }
      },

      isAuthenticated: () => {
        return get().status === "authenticated" && !!get().user;
      },

      resendVerificationEmail: async () => {
        try {
          set({status: "loading", error: null});
          await resendVerificationEmail();
          set((state) => ({status: state.status === "loading" ? (state.user ? "authenticated" : "unauthenticated") : state.status}));
        } catch (error) {
          console.error("Error in store resendVerificationEmail:", error);
          set({
            status: "error",
            error: error instanceof Error ? error.message : "Fehler beim erneuten Senden der E-Mail.",
          });
          throw error;
        }
      },

      uploadProfilePicture: async (file: File) => {
        const currentUser = get().firebaseUser; // Hole den aktuellen Firebase User aus dem State
        if (!currentUser) {
          set({ uploadStatus: "error", error: "Benutzer nicht angemeldet." });
          throw new Error("Benutzer nicht angemeldet.");
        }

        set({ uploadStatus: "loading", error: null });
        try {
          // Rufe den Service auf (der bereits Auth und Firestore aktualisiert)
          const updatedUser = await uploadProfilePictureService(file, currentUser.uid);
          
          // Aktualisiere den Zustand im Store mit den neuen Benutzerdaten
          set({
            user: updatedUser, // Wichtig: Verwende die aktualisierten Daten
            uploadStatus: "success",
            error: null, // Fehler zurücksetzen
          });
        } catch (error) {
          console.error("AUTH_STORE: Fehler beim Hochladen des Profilbilds:", error);
          set({
            uploadStatus: "error",
            error: error instanceof Error ? error.message : "Profilbild konnte nicht hochgeladen werden.",
          });
          throw error; // Fehler weiterwerfen, damit die UI reagieren kann (z.B. mit toast.error)
        }
      },

      updateProfile: async (updates: { displayName?: string; statusMessage?: string; profileTheme?: string }) => {
        const currentUser = get().user; // Hole den aktuellen AuthUser aus dem State
        if (!currentUser) {
          throw new Error("Benutzer nicht angemeldet.");
        }
        set({ status: "loading", error: null }); // Zeige Ladezustand
        try {
          await updateUserProfile(updates); // Service aufrufen
          // Der onSnapshot Listener sollte den State automatisch aktualisieren,
          // aber wir können hier optimistisch updaten für schnellere UI-Reaktion:
          const updatedFields: Partial<AuthUser> = {};
          if (updates.displayName !== undefined) updatedFields.displayName = updates.displayName;
          if (updates.statusMessage !== undefined) updatedFields.statusMessage = updates.statusMessage;
          if (updates.profileTheme !== undefined) updatedFields.profileTheme = updates.profileTheme;
          
          set(state => ({
            user: state.user ? { ...state.user, ...updatedFields } : null,
            status: "authenticated", // Zurücksetzen auf authenticated, falls loading gesetzt war
            error: null,
          }));
          
        } catch (error) {
          console.error("AUTH_STORE: Fehler beim Aktualisieren des Profils:", error);
          set({
            status: "error", 
            error: error instanceof Error ? error.message : "Profil konnte nicht aktualisiert werden.",
          });
          throw error;
        }
      },

      initAuth: () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('AUTH_STORE: initAuth() called - starting authentication check');
        }
        
        // 🚨 CRITICAL FIX: Prevent double initialization from React StrictMode
        if (isInitAuthInProgress) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('AUTH_STORE: initAuth already in progress, ignoring duplicate call (React StrictMode?)');
          }
          return;
        }
        
        if (authStateUnsubscribe) {
          if (process.env.NODE_ENV === 'development') {
            console.log('AUTH_STORE: Cleaning up existing auth listener before re-initialization');
          }
          authStateUnsubscribe();
          authStateUnsubscribe = null;
        }
        
        isInitAuthInProgress = true;
        if (authInitTimeout) clearTimeout(authInitTimeout);
        set({status: "loading"});
        
        // 🚨 ENHANCED LOGGING: Log current localStorage state
        if (process.env.NODE_ENV === 'development') {
          try {
            const authStorage = localStorage.getItem('auth-storage');
            if (authStorage) {
              const parsed = JSON.parse(authStorage);
              console.log('AUTH_STORE: Found persisted auth data:', {
                hasUser: !!parsed?.state?.user,
                isGuest: parsed?.state?.isGuest,
                appMode: parsed?.state?.appMode,
                // Status ist jetzt nicht mehr persistiert!
              });
            } else {
              console.log('AUTH_STORE: No persisted auth data found - clean start');
            }
          } catch (error) {
            console.warn('AUTH_STORE: Error reading persisted auth data:', error);
          }
        }

        // 🚨 CRITICAL FIX: Verkürzter Watchdog-Timer + Emergency Recovery
        authInitTimeout = setTimeout(() => {
          if (get().status === 'loading') {
            console.error('AUTH_STORE: Watchdog-Alarm! onAuthStateChanged hat nicht innerhalb von 3s geantwortet.');
            
            // Emergency Recovery: Prüfe localStorage auf Corruption
            let emergencyRecoveryTriggered = false;
            try {
              const authStorage = localStorage.getItem('auth-storage');
              if (authStorage) {
                const parsed = JSON.parse(authStorage);
                if (parsed?.state?.status === 'authenticated') {
                  console.error('AUTH_STORE: Erkenne persistierten authenticated Status - mögliche localStorage Corruption!');
                  
                  // Zähle Failed Auth Attempts
                  const failedAttempts = parseInt(localStorage.getItem('auth-failed-attempts') || '0') + 1;
                  localStorage.setItem('auth-failed-attempts', failedAttempts.toString());
                  
                  if (failedAttempts >= 2) {
                    console.error('AUTH_STORE: 2+ failed attempts detected - Emergency localStorage cleanup!');
                    localStorage.removeItem('auth-storage');
                    localStorage.removeItem('auth-failed-attempts');
                    emergencyRecoveryTriggered = true;
                  }
                }
              }
            } catch (storageError) {
              console.error('AUTH_STORE: localStorage read error - Emergency cleanup!', storageError);
              localStorage.removeItem('auth-storage');
              emergencyRecoveryTriggered = true;
            }
            
            set({ 
              status: 'unauthenticated', 
              user: null,
              firebaseUser: null,
              isGuest: false,
              error: emergencyRecoveryTriggered 
                ? "Authentifizierung wurde zurückgesetzt. Bitte melde dich erneut an."
                : "Die Authentifizierung hat zu lange gedauert. Prüfe deine Internetverbindung und versuche es erneut."
            });
            
            // 🚨 CRITICAL FIX: Reset initialization flag bei Timeout
            isInitAuthInProgress = false;
          }
        }, 3000); // 🚨 VERKÜRZT: 3 Sekunden statt 10

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (authInitTimeout) clearTimeout(authInitTimeout); // WICHTIG: Watchdog stoppen, da der Listener erfolgreich war
          
          // 🚨 CRITICAL FIX: Mark initialization as complete
          isInitAuthInProgress = false;
          
          // 🚨 CRITICAL FIX: Reset failed attempts counter bei erfolgreicher Auth-Response
          try {
            localStorage.removeItem('auth-failed-attempts');
          } catch (storageError) {
            console.warn('AUTH_STORE: Could not reset failed attempts counter:', storageError);
          }

          if (userDocUnsubscribe) userDocUnsubscribe();
          if (playerDocUnsubscribe) playerDocUnsubscribe();
          userDocUnsubscribe = null;
          playerDocUnsubscribe = null;

          if (firebaseUser) {
            const previousStatus = get().status;
            const wasGuest = get().isGuest; // NEU: Prüfe ob vorher im Gastmodus
            
            if (process.env.NODE_ENV === 'development') {
              console.log('AUTH_STORE: Firebase user authenticated:', {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                previousStatus,
                wasGuest,
                timeSinceInitAuth: Date.now() // Rough timing
              });
            }
            
            // WICHTIG: User-State SOFORT mit Basisdaten aus Firebase Auth setzen!
            // Firestore-Listener reichert später an.
            const initialMappedUser = mapUserToAuthUser(firebaseUser, null); // Nur Auth-Daten verwenden
            set({
              status: "authenticated",
              firebaseUser: firebaseUser,
              user: initialMappedUser, // Initialen User setzen
              isGuest: false
            });

            // BUGFIX: Entferne alle hängenden Registrierungs-Notifications bei erfolgreicher Authentifizierung
            try {
              const { useUIStore } = require('../store/uiStore');
              const uiStore = useUIStore.getState();
              const registrationNotifications = uiStore.notifications.filter(n => 
                n.message.includes('Registrierung erfolgreich') || 
                n.message.includes('Prüfe deine Email') ||
                n.message.includes('Gruppen-Einladung')
              );
              registrationNotifications.forEach(notification => {
                uiStore.removeNotification(notification.id);
              });
              if (registrationNotifications.length > 0) {
                console.log(`[AuthStore] Removed ${registrationNotifications.length} hanging registration notifications`);
              }
            } catch (error) {
              console.warn('[AuthStore] Could not clear registration notifications:', error);
            } 

            // NEU: Game-State zurücksetzen bei Übergang von Gast zu authentifiziert
            if (wasGuest && (previousStatus === 'unauthenticated' || previousStatus === 'loading')) {
              console.log('[AuthStore] Detected guest-to-authenticated transition, resetting game state');
              try {
                // Dynamischer Import, um zirkuläre Abhängigkeiten zu vermeiden
                import('./jassStore').then(({ useJassStore }) => {
                  const jassStore = useJassStore.getState();
                  jassStore.resetJass();
                });
                import('./gameStore').then(({ useGameStore }) => {
                  const gameStore = useGameStore.getState();
                  gameStore.resetGameState({ newActiveGameId: null });
                });
                import('./timerStore').then(({ useTimerStore }) => {
                  const timerStore = useTimerStore.getState();
                  timerStore.resetAllTimers();
                });
              } catch (error) {
                console.warn('[AuthStore] Error resetting game state during guest-to-auth transition:', error);
                // Nicht kritisch - weitermachen
              }
            }

            let playerIdToLoad: string | null = null;

            try {
              const userRef = doc(db, USERS_COLLECTION, firebaseUser.uid);
              const userSnap = await getDoc(userRef);

              if (userSnap.exists()) {
                  const userData = userSnap.data() as Partial<FirestorePlayer>;
                   if (userData?.playerId && typeof userData.playerId === 'string') { 
                      playerIdToLoad = userData.playerId;
                   }
              }

              if (!playerIdToLoad) {
                  // 🚀 ELEGANT SOLUTION: With deterministic Player IDs, multiple calls are safe and idempotent
                  const displayName = firebaseUser.displayName || `Spieler_${firebaseUser.uid.substring(0, 6)}`;
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`AUTH_STORE: No playerId found in user doc, calling getPlayerIdForUser for ${firebaseUser.uid} with displayName: ${displayName}`);
                  }
                  playerIdToLoad = await getPlayerIdForUser(firebaseUser.uid, displayName);
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`AUTH_STORE: getPlayerIdForUser returned playerId: ${playerIdToLoad}`);
                  }
              } else {
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`AUTH_STORE: Found existing playerId in user doc: ${playerIdToLoad}`);
                  }
              }

              if (playerIdToLoad) {
                  await useGroupStore.getState().loadUserGroupsByPlayerId(playerIdToLoad); 
              } else {
              }

              if (previousStatus === 'loading' || previousStatus === 'unauthenticated') {
                // Prüfe, ob bereits eine Registrierungs-Notification aktiv ist
                const { useUIStore } = require('../store/uiStore');
                const uiStore = useUIStore.getState();
                const hasRegistrationNotification = uiStore.notifications.some(n => 
                  n.message.includes('Registrierung erfolgreich') || 
                  n.message.includes('Prüfe deine Email') ||
                  n.message.includes('Gruppen-Einladung')
                );
                
                // Unterdrücke Notification, wenn bereits eine Registrierungs-Notification aktiv ist
                const joinedGroupId = await processPendingInviteToken(hasRegistrationNotification);
                if (joinedGroupId) {
                  try {
                    await updateUserDocument(firebaseUser.uid, { lastActiveGroupId: joinedGroupId });
                  } catch (updateError) {
                    console.error(`AUTH_STORE: Fehler beim Aktualisieren der lastActiveGroupId auf ${joinedGroupId}:`, updateError);
                  }
                }
              }

              userDocUnsubscribe = onSnapshot(userRef, async (docSnap) => {
                if (docSnap.exists()) {
                  const userData = docSnap.data();
                  let migratedData = {...userData}; // Kopie für potenzielle Migration
                  let needsUpdate = false;

                  // 🔧 Migration-Lock prüfen - verhindert Endlosschleifen
                  const migrationKey = `${firebaseUser.uid}_migration`;
                  if (migrationLocks.get(migrationKey)) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`AUTH_STORE: Migration bereits aktiv für User ${firebaseUser.uid}. Überspringe.`);
                    }
                    // Nur State aktualisieren, keine Migration
                    const mappedUser = mapUserToAuthUser(firebaseUser, migratedData as Partial<FirestorePlayer>);
                    set({user: mappedUser, status: "authenticated"});
                    return;
                  }

                  // Self-Healing-Logik für veraltete Datenstrukturen
                  if (migratedData.preferences && typeof migratedData.preferences === 'object') {
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`AUTH_STORE: Veraltete "preferences" Struktur für User ${firebaseUser.uid} gefunden. Starte Migration.`);
                    }
                    if (migratedData.preferences.theme) {
                      migratedData.profileTheme = migratedData.preferences.theme;
                      // Das alte 'light' Theme gilt nicht als echtes Theme
                      if (migratedData.profileTheme === 'light') {
                        delete migratedData.profileTheme;
                      }
                    }
                    delete migratedData.preferences; // WICHTIG: Altes Objekt jetzt definitiv entfernen
                    needsUpdate = true;
                  }

                  // Sicherstellen, dass die E-Mail im Firestore-Dokument vorhanden ist
                  if (!migratedData.email && firebaseUser.email) {
                    if (process.env.NODE_ENV === 'development') {
          console.log(`AUTH_STORE: Fehlendes "email" Feld für User ${firebaseUser.uid}. Füge es hinzu.`);
        }
                    migratedData.email = firebaseUser.email;
                    needsUpdate = true;
                  }

                  // Zufälliges Farbthema zuweisen, falls keines vorhanden ist (oder 'light' war)
                  if (!migratedData.profileTheme) {
                    const availableThemes = Object.keys(THEME_COLORS);
                    const randomTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)];
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`AUTH_STORE: Kein Profilthema für User ${firebaseUser.uid} gefunden. Weise zufälliges Thema zu: ${randomTheme}`);
                    }
                    migratedData.profileTheme = randomTheme;
                    needsUpdate = true;
                  }
                  
                  // Führe das Update nur aus, wenn es nötig ist
                  if (needsUpdate) {
                    // 🔧 Migration-Lock setzen
                    migrationLocks.set(migrationKey, true);
                    
                    try {
                      await updateDoc(userRef, migratedData);
                      if (process.env.NODE_ENV === 'development') {
                        console.log(`AUTH_STORE: User-Dokument ${firebaseUser.uid} erfolgreich migriert/geheilt.`);
                      }
                    } catch (migrationError) {
                      console.error(`AUTH_STORE: Fehler bei der automatischen Datenmigration für User ${firebaseUser.uid}:`, migrationError);
                    } finally {
                      // 🔧 Migration-Lock nach 2 Sekunden entfernen
                      setTimeout(() => {
                        migrationLocks.delete(migrationKey);
                        if (process.env.NODE_ENV === 'development') {
                          console.log(`AUTH_STORE: Migration-Lock für User ${firebaseUser.uid} entfernt.`);
                        }
                      }, 2000);
                    }
                  }

                  // Mappt jetzt Firebase Auth User + Firestore Daten (mit den migrierten Daten)
                  const mappedUser = mapUserToAuthUser(firebaseUser, migratedData as Partial<FirestorePlayer>);
                  
                  // --- Player Nickname Synchronisation ---
                  if (mappedUser.playerId && mappedUser.displayName) {
                     try {
                         const playerRef = doc(db, PLAYERS_COLLECTION, mappedUser.playerId);
                         // Sicherstellen, dass der Player existiert und der Name anders ist, bevor wir schreiben (optional, aber gut für weniger Writes)
                         // const playerSnap = await getDoc(playerRef); 
                         // if (playerSnap.exists() && playerSnap.data()?.nickname !== mappedUser.displayName) {
                         //   await updateDoc(playerRef, { nickname: mappedUser.displayName });
                         // }
                         // Einfacher: Immer aktualisieren, Firestore ist effizient bei No-Op Updates.
                         await updateDoc(playerRef, { displayName: mappedUser.displayName });
                         // console.log(`AUTH_STORE: Synced player nickname for ${mappedUser.playerId} to ${mappedUser.displayName}`);
                     } catch (playerUpdateError) {
                         console.error(`AUTH_STORE: Error syncing player nickname for ${mappedUser.playerId}:`, playerUpdateError);
                         // Fehler hier ist nicht kritisch für den Auth-Fluss, nur loggen.
                     }
                  }
                  // --- ENDE Player Nickname Synchronisation ---

                  // Aktualisiert das initial gesetzte 'user'-Objekt mit den vollständigen Daten
                  set({user: mappedUser, status: "authenticated"});
                  
                  // 🚨 KRITISCHER FIX: currentGroup Wiederherstellung bei Re-Login
                  if (userData.lastActiveGroupId) {
                  const currentGroups = useGroupStore.getState().userGroups;
                  const currentGroupMap = new Map(currentGroups.map(g => [g.id, g]));
                  const currentActiveGroup = useGroupStore.getState().currentGroup;
                    
                    if (currentGroupMap.has(userData.lastActiveGroupId) && 
                      currentActiveGroup?.id !== userData.lastActiveGroupId) {
                      // Gruppe ist in userGroups vorhanden
                       useGroupStore.getState().setCurrentGroup(currentGroupMap.get(userData.lastActiveGroupId)! as any);
                    } else if (!currentGroupMap.has(userData.lastActiveGroupId)) {
                      // 🚨 NEUER FIX: Gruppe NICHT in userGroups - aus Firestore laden!
                      console.log(`[AuthStore] lastActiveGroupId ${userData.lastActiveGroupId} nicht in userGroups gefunden, lade aus Firestore...`);
                      
                      import('../services/groupService').then(({ getGroupById }) => {
                        getGroupById(userData.lastActiveGroupId!).then(group => {
                          if (group) {
                            console.log(`[AuthStore] ✅ Gruppe ${userData.lastActiveGroupId} aus Firestore geladen und als currentGroup gesetzt`);
                            useGroupStore.getState().setCurrentGroup(group as any);
                          } else {
                            console.warn(`[AuthStore] ❌ Gruppe ${userData.lastActiveGroupId} existiert nicht mehr in Firestore`);
                            // Optional: lastActiveGroupId im User-Dokument löschen
                            updateUserDocument(firebaseUser.uid, { lastActiveGroupId: null }).catch(console.error);
                          }
                        }).catch(error => {
                          console.error(`[AuthStore] Fehler beim Laden der Gruppe ${userData.lastActiveGroupId} aus Firestore:`, error);
                        });
                      }).catch(error => {
                        console.error(`[AuthStore] Fehler beim Import von groupService:`, error);
                      });
                    }
                  }
                } else {
                   // Fallback: User-Dokument nicht in Firestore gefunden.
                   // Behalte den initialen User-State (nur Auth-Daten) bei. Status bleibt 'authenticated'.
                   console.warn(`AUTH_STORE: Firestore user document not found for ${firebaseUser.uid}. Using Auth data only.`);
                   // Stelle sicher, dass der Status korrekt bleibt, falls er sich geändert hat (unwahrscheinlich)
                   set({ user: mapUserToAuthUser(firebaseUser, null), status: "authenticated" });
                }
              }, (error: FirestoreError) => {
                 console.error(`AUTH_STORE: Fehler beim User Doc Listener für ${firebaseUser.uid}:`, error);
                 set({ status: "error", error: "Fehler beim Laden der Benutzerdaten." });
              });

              if (playerIdToLoad) {
                const playerRef = doc(db, PLAYERS_COLLECTION, playerIdToLoad);
                playerDocUnsubscribe = onSnapshot(playerRef, (playerSnap) => {
                   if (playerSnap.exists()) {
                     const playerData = playerSnap.data() as FirestorePlayer;
                     const receivedGroupIds = playerData.groupIds || [];
                     const currentStoredGroups = useGroupStore.getState().userGroups;
                     const storedGroupIdsSet = new Set(currentStoredGroups.map(g => g.id));
                     const receivedGroupIdsSet = new Set(receivedGroupIds);
                     let discrepancyDetected = false;
                     for (const storedId of storedGroupIdsSet) {
                         if (!receivedGroupIdsSet.has(storedId)) {
                             discrepancyDetected = true;
                         }
                     }
                     if (!discrepancyDetected && storedGroupIdsSet.size !== receivedGroupIdsSet.size) {
                          discrepancyDetected = true;
                     }
                   }
                }, (error) => {
                  console.error(`AUTH_STORE: Fehler beim Player Doc Listener für Player ${playerIdToLoad}:`, error as FirestoreError);
                });
              } else {
              }

            } catch (error) {
              console.error("AUTH_STORE: Schwerwiegender Fehler bei der Initialisierung (playerId/Gruppenladen):", error);
              set({ status: "error", error: "Initialisierung fehlgeschlagen." });
            }

          } else {
            // User ist abgemeldet
            const wasGuest = get().isGuest;
            if (process.env.NODE_ENV === 'development') {
              console.log('AUTH_STORE: Firebase user unauthenticated (logged out or no session):', {
                wasGuest,
                previousStatus: get().status
              });
            }
            set({user: null, firebaseUser: null, status: "unauthenticated", isGuest: wasGuest});
            useGroupStore.getState().resetGroupStore();
          }
        }, (error) => {
            // NEU: Fehlerbehandlung für den onAuthStateChanged-Listener selbst
            if (authInitTimeout) clearTimeout(authInitTimeout);
            isInitAuthInProgress = false; // 🚨 Reset flag auch bei Fehler
            console.error('AUTH_STORE: Kritischer Fehler im onAuthStateChanged-Listener:', error);
            set({ status: 'error', error: 'Ein kritischer Fehler bei der Authentifizierung ist aufgetreten.' });
        });
        
        // 🚨 CRITICAL FIX: Store unsubscribe function for cleanup
        authStateUnsubscribe = unsubscribeAuth;
      },
      clearError: () => {
        set({error: null});
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ 
        appMode: state.appMode,
        isGuest: state.isGuest,
        // 🚨 CRITICAL FIX: Status NICHT mehr persistieren!
        // App startet immer mit status: "idle" und prüft dann Firebase Auth
        // Dies verhindert das Hängenbleiben bei corrupted localStorage
        // status: ENTFERNT - Kernursache des Problems!
        
        // HINT: Minimale User-Daten für bessere UX (z.B. für Profilbild-Cache)
        // Aber kein authStatus - Firebase Auth ist die einzige Wahrheitsquelle
        user: state.user ? {
          uid: state.user.uid,
          displayName: state.user.displayName,
          photoURL: state.user.photoURL,
          email: state.user.email,
          // Die anderen Felder werden durch den Firebase Auth Listener aktualisiert
        } : null,
      }),
    }
  )
);

