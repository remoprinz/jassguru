import {create} from "zustand";
import {persist} from "zustand/middleware";
import {auth, db} from "../services/firebaseInit";
import {onAuthStateChanged, User, fetchSignInMethodsForEmail, createUserWithEmailAndPassword, sendEmailVerification, updateProfile} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  loginWithEmail,
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

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  firebaseUser: User | null;
  appMode: AppMode;
  error: string | null;
  isGuest: boolean;
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
          // *** NEU: Nickname-Einzigartigkeitsprüfung ***
          if (displayName) {
            try {
              console.log(`AUTH_STORE: Prüfe Nickname-Verfügbarkeit für: ${displayName}`);
              const playersRef = collection(db, PLAYERS_COLLECTION);
              // Beachte Gross-/Kleinschreibung bei der Abfrage!
              // Wenn Gross-/Kleinschreibung egal sein soll, muss man anders vorgehen (z.B. kleingeschriebenes Feld speichern).
              const q = query(playersRef, where("displayName", "==", displayName)); 
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                console.warn(`AUTH_STORE: Nickname "${displayName}" ist bereits vergeben.`);
                throw new Error("NICKNAME_TAKEN"); // Spezifischer Fehlercode
              }
              console.log(`AUTH_STORE: Nickname "${displayName}" ist verfügbar.`);
            } catch (error: any) {
               if (error.message === "NICKNAME_TAKEN") {
                  throw error; // Spezifischen Fehler direkt weiterwerfen
               }
               console.error("AUTH_STORE: Fehler bei Nickname-Prüfung:", error);
               // Allgemeiner Fehler bei der Prüfung
               throw new Error("Fehler bei der Prüfung der Nickname-Verfügbarkeit."); 
            }
          }
          // *** ENDE NEU ***

          const signInMethods = await fetchSignInMethodsForEmail(auth, email);
          
          if (signInMethods && signInMethods.length > 0) {
            throw new Error("AUTH/EMAIL-ALREADY-IN-USE");
          }
          
          // Schritt 1: User in Firebase Auth erstellen
          const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
          const firebaseUser = newUserCredential.user;
          
          // Schritt 2: SOFORT DisplayName in Firebase Auth setzen
          if (displayName) {
             try {
               await updateProfile(firebaseUser, { displayName });
               console.log(`AUTH_STORE: Auth profile updated for ${firebaseUser.uid} with displayName: ${displayName}`);
             } catch (profileError) {
               console.error(`AUTH_STORE: Fehler beim Setzen des DisplayName für ${firebaseUser.uid}:`, profileError);
               // Optional: Fehler behandeln, aber Registrierung fortsetzen?
             }
          }
          
          // Schritt 3: User-Dokument in Firestore erstellen/minimal aktualisieren, um Cloud Function zu triggern
          // WICHTIG: Verwende setDoc mit merge:true statt updateUserDocument, um Fehler zu vermeiden
          // und schreibe nur unkritische Felder.
          const userDocRef = doc(db, USERS_COLLECTION, firebaseUser.uid); // User-Dokument-Referenz
          
          // Aktualisierter Schritt 3a: Explizit E-Mail in Firestore setzen (unbedingt nötig)
          const minimalUserData = {
            email: email, // Explizit E-Mail setzen 
            displayName: displayName || null, // Setze den bekannten Namen
            lastLogin: serverTimestamp(), // Aktualisiere Login-Zeit
            lastUpdated: serverTimestamp()
          };
          try {
            await setDoc(userDocRef, minimalUserData, { merge: true });
            console.log(`AUTH_STORE: User document created/updated with email and displayName for ${firebaseUser.uid}`);
          } catch (setDocError) {
            console.error(`AUTH_STORE: Fehler beim initialen setDoc für User ${firebaseUser.uid}:`, setDocError);
            // Dieser Fehler sollte die Registrierung nicht unbedingt blockieren, da der User in Auth existiert.
          }
          
          // Schritt 4: Player-ID sicherstellen (wird automatisch erstellt, wenn nicht vorhanden)
          const playerId = await getPlayerIdForUser(firebaseUser.uid, displayName ?? null);
          if (!playerId) {
            console.error(`AUTH_STORE: Konnte keine Player-ID für User ${firebaseUser.uid} erstellen/finden`);
          } else {
            console.log(`AUTH_STORE: Player-ID ${playerId} für User ${firebaseUser.uid} gefunden/erstellt`);
            
            // Schritt 5: NEU - Synchronisiere DisplayName und E-Mail über alle Collections
            try {
              await syncDisplayNameAcrossCollections(
                firebaseUser.uid,
                playerId,
                displayName || `Jassguru ${firebaseUser.uid.substring(0, 4)}`
              );
              console.log(`AUTH_STORE: DisplayName und E-Mail erfolgreich synchronisiert`);
            } catch (syncError) {
              console.error(`AUTH_STORE: Fehler bei der Synchronisation von DisplayName/Email:`, syncError);
              // Fehler hier nicht weiterwerfen, da der User trotzdem erstellt wurde
            }
          }
          
          // Schritt 6: Verifizierungs-E-Mail senden
          try {
              await sendEmailVerification(firebaseUser);
              console.log(`AUTH_STORE: Verification email sent to ${email}`);
          } catch (verificationError) {
              console.error(`AUTH_STORE: Fehler beim Senden der Verifizierungs-E-Mail an ${email}:`, verificationError);
          }
          
          // State sollte von onAuthStateChanged aktualisiert werden, der auf die Auth-Änderung reagiert
          console.log(`AUTH_STORE: Registration completed successfully for ${email}`);
        } catch (error) {
          let errorMessage = "Ein unbekannter Fehler ist aufgetreten";
          if (error instanceof Error) {
             if (error.message === "NICKNAME_TAKEN") { // NEU: Fehlerbehandlung für Nickname
                 errorMessage = "Dieser Jassname ist leider schon vergeben. Bitte wähle einen anderen.";
             } else if ((error as FirebaseError).code === "auth/email-already-in-use" || error.message === "AUTH/EMAIL-ALREADY-IN-USE") {
                 errorMessage = "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an oder verwende eine andere E-Mail.";
             } else if ((error as FirebaseError).code === "auth/weak-password") {
                  errorMessage = "Das Passwort ist zu schwach. Es muss mindestens 6 Zeichen lang sein.";
             } else {
                 errorMessage = error.message;
             }
          }
          console.error("AUTH_STORE: Fehler bei Registrierung:", errorMessage);
          set({
            status: "error",
            error: errorMessage,
          });
          throw error;
        }
      },

      logout: async () => {
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
          });
          console.log("AUTH_STORE: Logout successful, navigating to /");
          Router.push('/');
        } catch (error) {
          console.error("AUTH_STORE: Fehler beim Logout:", error);
          set({status: "error", error: "Abmeldung fehlgeschlagen"});
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
        console.log('[AuthStore] clearGuestStatus called');
        // Setzt nur den Gaststatus zurück und ggf. den App-Modus,
        // beeinflusst aber nicht den angemeldeten User oder Auth-Status direkt.
        set(state => {
          if (state.isGuest) { // Nur ändern, wenn wirklich Gast
            return { isGuest: false, appMode: state.appMode === 'online' ? 'online' : 'offline' };
          }
          return {}; // Keine Änderung, wenn nicht Gast
        });
        console.log('[AuthStore] Guest status cleared:', get());
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
        set({status: "loading"});
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          if (userDocUnsubscribe) userDocUnsubscribe();
          if (playerDocUnsubscribe) playerDocUnsubscribe();
          userDocUnsubscribe = null;
          playerDocUnsubscribe = null;

          if (firebaseUser) {
            const previousStatus = get().status;
            const wasGuest = get().isGuest; // NEU: Prüfe ob vorher im Gastmodus
            
            // WICHTIG: User-State SOFORT mit Basisdaten aus Firebase Auth setzen!
            // Firestore-Listener reichert später an.
            const initialMappedUser = mapUserToAuthUser(firebaseUser, null); // Nur Auth-Daten verwenden
            set({
              status: "authenticated",
              firebaseUser: firebaseUser,
              user: initialMappedUser, // Initialen User setzen
              isGuest: false
            }); 

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
                  const displayName = firebaseUser.displayName || `Spieler_${firebaseUser.uid.substring(0, 6)}`;
                  playerIdToLoad = await getPlayerIdForUser(firebaseUser.uid, displayName);
              }

              if (playerIdToLoad) {
                  await useGroupStore.getState().loadUserGroupsByPlayerId(playerIdToLoad); 
              } else {
              }

              if (previousStatus === 'loading' || previousStatus === 'unauthenticated') {
                const joinedGroupId = await processPendingInviteToken();
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
                  // Mappt jetzt Firebase Auth User + Firestore Daten
                  const mappedUser = mapUserToAuthUser(firebaseUser, userData as Partial<FirestorePlayer>);
                  
                  // --- NEU: Player Nickname Synchronisation ---
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
                  // --- ENDE NEU ---

                  // Aktualisiert das initial gesetzte 'user'-Objekt mit den vollständigen Daten
                  set({user: mappedUser, status: "authenticated"});
                  
                  const currentGroups = useGroupStore.getState().userGroups;
                  const currentGroupMap = new Map(currentGroups.map(g => [g.id, g]));
                  const currentActiveGroup = useGroupStore.getState().currentGroup;
                  if (userData.lastActiveGroupId && 
                      currentGroupMap.has(userData.lastActiveGroupId) && 
                      currentActiveGroup?.id !== userData.lastActiveGroupId) {
                       useGroupStore.getState().setCurrentGroup(currentGroupMap.get(userData.lastActiveGroupId)! as any);
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
            set({user: null, firebaseUser: null, status: "unauthenticated", isGuest: get().isGuest});
            useGroupStore.getState().resetGroupStore();
          }
        });
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
        // Status speichern, damit wir beim App-Start sehen, dass der User bereits authentifiziert war
        status: state.status === "authenticated" ? "authenticated" : state.status,
        // NICHT den kompletten User speichern, nur die Basis-Informationen
        // Dies hilft dabei, den Auth-Zustand zu erhalten, ohne sensible Daten zu speichern
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

