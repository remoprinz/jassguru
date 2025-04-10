import {create} from "zustand";
import {persist} from "zustand/middleware";
import {auth, db} from "../services/firebaseInit";
import {onAuthStateChanged, User, fetchSignInMethodsForEmail, createUserWithEmailAndPassword, sendEmailVerification, updateProfile} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  loginWithEmail,
  signInWithGoogleProvider,
  logout,
  sendPasswordReset,
  mapUserToAuthUser,
  resendVerificationEmail,
  uploadProfilePicture as uploadProfilePictureService,
  updateUserProfile,
  updateUserDocument,
} from "../services/authService";
import type { AuthStatus, AuthUser, AppMode } from "@/types/auth";
import type { FirestorePlayer } from "@/types/jass";
import {useGroupStore} from "./groupStore";
import {doc, onSnapshot, Unsubscribe, FirestoreError, getDoc, serverTimestamp, setDoc, updateDoc} from "firebase/firestore";
import { processPendingInviteToken } from '../lib/handlePendingInvite';
import { PLAYERS_COLLECTION, USERS_COLLECTION } from "@/constants/firestore";
import { getPlayerIdForUser } from "../services/playerService";

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
  isAuthenticated: () => boolean;
  resendVerificationEmail: () => Promise<void>;
  uploadProfilePicture: (file: File) => Promise<void>;
  updateProfile: (updates: { displayName?: string; statusMessage?: string }) => Promise<void>;
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
          const signInMethods = await fetchSignInMethodsForEmail(auth, email);
          
          if (signInMethods && signInMethods.length > 0) {
            console.warn(`AUTH_STORE: Registrierungsversuch für existierende E-Mail: ${email}. Methoden: ${signInMethods.join(", ")}`);
            throw new Error("AUTH/EMAIL-ALREADY-IN-USE");
          }
          
          console.log(`AUTH_STORE: E-Mail ${email} ist neu, fahre mit Registrierung fort.`);
          
          // Schritt 1: User in Firebase Auth erstellen
          const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
          const firebaseUser = newUserCredential.user;
          
          // Schritt 2: SOFORT DisplayName in Firebase Auth setzen
          if (displayName) {
             try {
               await updateProfile(firebaseUser, { displayName });
               console.log(`AUTH_STORE: DisplayName '${displayName}' für User ${firebaseUser.uid} gesetzt.`);
             } catch (profileError) {
               console.error(`AUTH_STORE: Fehler beim Setzen des DisplayName für ${firebaseUser.uid}:`, profileError);
               // Optional: Fehler behandeln, aber Registrierung fortsetzen?
             }
          }
          
          // Schritt 3: User-Dokument in Firestore erstellen/minimal aktualisieren, um Cloud Function zu triggern
          // WICHTIG: Verwende setDoc mit merge:true statt updateUserDocument, um Fehler zu vermeiden
          // und schreibe nur unkritische Felder.
          const userDocRef = doc(db, USERS_COLLECTION, firebaseUser.uid); // User-Dokument-Referenz
          const minimalUserData = {
            // NICHT email oder createdAt hier schreiben!
            displayName: displayName || undefined, // Setze den bekannten Namen
            lastLogin: serverTimestamp(), // Aktualisiere Login-Zeit
          };
          try {
            await setDoc(userDocRef, minimalUserData, { merge: true });
            console.log(`AUTH_STORE: Minimal user data set/merged for ${firebaseUser.uid} to trigger onCreateUserDocument.`);
          } catch (setDocError) {
            console.error(`AUTH_STORE: Fehler beim initialen setDoc für User ${firebaseUser.uid}:`, setDocError);
            // Dieser Fehler sollte die Registrierung nicht unbedingt blockieren, da der User in Auth existiert.
            // Die Cloud Function könnte ggf. trotzdem triggern oder der Player wird beim nächsten Login erstellt.
          }
          
          // Schritt 4: Verifizierungs-E-Mail senden
          try {
              await sendEmailVerification(firebaseUser);
              console.log(`Verifizierungs-E-Mail gesendet an: ${email}`);
          } catch (verificationError) {
              console.error(`AUTH_STORE: Fehler beim Senden der Verifizierungs-E-Mail an ${email}:`, verificationError);
          }
          
          // State aktualisieren (onAuthStateChanged wird wahrscheinlich übernehmen)
          // Der direkte set hier könnte zu früh sein, bevor onAuthStateChanged den User mit gesetztem Namen hat
          // Warten wir auf onAuthStateChanged, um den finalen State zu setzen.
          // set({ status: "authenticated", firebaseUser, isGuest: false, user: mapUserToAuthUser(firebaseUser, initialUserData) }); 

        } catch (error) {
          let errorMessage = "Ein unbekannter Fehler ist aufgetreten";
          if (error instanceof Error) {
             if ((error as FirebaseError).code === "auth/email-already-in-use" || error.message === "AUTH/EMAIL-ALREADY-IN-USE") {
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
          console.log("AUTH_STORE: Unsubscribing from user document listener.");
          userDocUnsubscribe();
          userDocUnsubscribe = null;
        }
        if (playerDocUnsubscribe) {
          console.log("AUTH_STORE: Unsubscribing from player document listener.");
          playerDocUnsubscribe();
          playerDocUnsubscribe = null;
        }
        useGroupStore.getState().resetGroupStore();
        try {
          set({status: "loading", error: null});
          await logout();
          set({
            user: null,
            firebaseUser: null,
            status: "unauthenticated",
            appMode: "offline",
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
        useGroupStore.getState().resetGroupStore();
        set({
          status: "unauthenticated",
          user: null,
          firebaseUser: null,
          appMode: "offline",
          isGuest: true,
          error: null,
        });
      },

      isAuthenticated: () => {
        const state = get();
        return state.status === "authenticated" || state.isGuest;
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
        console.log("AuthStore: Starte Profilbild-Upload...");
        const user = get().user;
        if (!user || !user.uid) {
          const errorMsg = "Kein Benutzer angemeldet, um Profilbild hochzuladen.";
          console.error("AuthStore: uploadProfilePicture ABORT - ", errorMsg);
          throw new Error(errorMsg);
        }

        try {
          console.log("AuthStore: Starte Profilbild-Upload für User:", user.uid);

          set((state) => ({
            ...state,
            error: null,
            uploadStatus: "loading",
          }));

          const updatedUser = await uploadProfilePictureService(file, user.uid);
          console.log("AuthStore: Upload erfolgreich, aktualisierter User:", updatedUser);

          if (updatedUser.photoURL && user.playerId) {
            try {
              const playerRef = doc(db, PLAYERS_COLLECTION, user.playerId);
              await updateDoc(playerRef, {
                photoURL: updatedUser.photoURL,
                updatedAt: serverTimestamp()
              });
              console.log(`AuthStore: Direkte Synchronisation der photoURL zum player-Dokument ${user.playerId} erfolgreich.`);
            } catch (playerUpdateError) {
              console.warn(`AuthStore: Konnte photoURL nicht direkt im player-Dokument ${user.playerId} aktualisieren:`, playerUpdateError);
            }
          } else {
             if (!user.playerId) {
               console.warn(`AuthStore: Keine playerId im User-Objekt gefunden, direkte Player-Synchronisation übersprungen.`);
             }
             if (!updatedUser.photoURL) {
                console.warn(`AuthStore: Keine photoURL im updatedUser-Objekt nach Upload, direkte Player-Synchronisation übersprungen.`);
             }
          }

          set((state) => ({
            ...state,
            user: updatedUser,
            uploadStatus: "success",
            error: null,
          }));
        } catch (error) {
          console.error("AuthStore: Fehler beim Profilbild-Upload:", error);
          // NEU: Detailliertere Fehlermeldung extrahieren
          let detailedErrorMessage = "Fehler beim Hochladen des Profilbilds.";
          if (error instanceof Error) {
            // Versuchen, spezifischere Firebase-Fehlercodes zu extrahieren
            if ('code' in error) {
              // Typüberprüfung für FirebaseError (optional, aber sicherer)
              const firebaseError = error as { code: string; message: string };
              detailedErrorMessage = `Fehler (${firebaseError.code}): ${firebaseError.message}`;
            } else {
              detailedErrorMessage = error.message;
            }
          }

          set((state) => ({
            ...state,
            uploadStatus: "error",
            // error: error instanceof Error ? error.message : "Fehler beim Hochladen des Profilbilds.", // Alte Version
            error: detailedErrorMessage, // Neue Version mit mehr Details
          }));

          throw error;
        }
      },

      updateProfile: async (updates: { displayName?: string; statusMessage?: string }) => {
        const state = get();
        if (!state.user) {
          throw new Error("Kein Benutzer angemeldet");
        }

        try {
          set({status: "loading", error: null});

          // Update in Firebase und Firestore
          await updateUserProfile(updates);

          // Update local state
          set((state) => ({
            user: state.user ? {
              ...state.user,
              ...updates,
            } : null,
            status: "authenticated",
          }));
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : "Fehler beim Aktualisieren des Profils",
          });
          throw error;
        }
      },

      initAuth: () => {
        console.log("AUTH_STORE: initAuth aufgerufen V2");
        set({status: "loading"});
        console.log("AUTH_STORE: initAuth - Registriere onAuthStateChanged Listener...");
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          console.log(`AUTH_STORE: onAuthStateChanged FEUERTE! firebaseUser: ${firebaseUser?.uid}`);

          if (userDocUnsubscribe) userDocUnsubscribe();
          if (playerDocUnsubscribe) playerDocUnsubscribe();
          userDocUnsubscribe = null;
          playerDocUnsubscribe = null;

          if (firebaseUser) {
            const previousStatus = get().status;
            set({status: "authenticated", firebaseUser: firebaseUser, isGuest: false, user: null });

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
                  console.warn("AUTH_STORE: playerId not yet available immediately after login/register. Waiting for User Snapshot listener.");
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

              console.log(`AUTH_STORE: Richte onSnapshot Listener für User Doc ein: ${firebaseUser.uid}`);
              userDocUnsubscribe = onSnapshot(userRef, async (docSnap) => {
                if (docSnap.exists()) {
                  const userData = docSnap.data();
                  const mappedUser = mapUserToAuthUser(firebaseUser, userData as Partial<FirestorePlayer>);
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
                   set({user: mapUserToAuthUser(firebaseUser, null), status: "authenticated"});
                }
              }, (error: FirestoreError) => {
                 console.error(`AUTH_STORE: Fehler beim User Doc Listener für ${firebaseUser.uid}:`, error);
                 set({ status: "error", error: "Fehler beim Laden der Benutzerdaten." });
              });

              console.log(`AUTH_STORE: Richte onSnapshot Listener für Player Doc ein: ${firebaseUser.uid}`);
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
                 console.warn("AUTH_STORE: Keine playerId vorhanden, kann Player Listener nicht einrichten.");
              }

            } catch (error) {
              console.error("AUTH_STORE: Schwerwiegender Fehler bei der Initialisierung (playerId/Gruppenladen):", error);
              set({ status: "error", error: "Initialisierung fehlgeschlagen." });
            }

          } else {
            console.log("AUTH_STORE: Kein Firebase User eingeloggt.");
            set({user: null, firebaseUser: null, status: "unauthenticated", isGuest: get().isGuest});
            useGroupStore.getState().resetGroupStore();
          }
        });
        console.log("AUTH_STORE: initAuth V2 - Listener registriert.");
      },
      clearError: () => {
        set({error: null});
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ appMode: state.appMode }),
    }
  )
);

