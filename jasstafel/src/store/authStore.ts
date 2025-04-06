import {create} from "zustand";
import {persist} from "zustand/middleware";
import {auth, db} from "../services/firebaseInit";
import {onAuthStateChanged, User, fetchSignInMethodsForEmail} from "firebase/auth";
import {
  loginWithEmail,
  signInWithGoogleProvider,
  logout,
  registerWithEmail,
  sendPasswordReset,
  mapUserToAuthUser,
  resendVerificationEmail,
  uploadProfilePicture as uploadProfilePictureService,
  updateUserProfile,
  updateUserDocument,
} from "../services/authService";
import {AuthStatus, AuthUser, AppMode, FirestoreGroup, FirestoreUser, FirestorePlayer} from "../types/jass";
import {useGroupStore} from "./groupStore";
import {getGroupById, getUserGroups} from "../services/groupService";
import {doc, onSnapshot, Unsubscribe, FirestoreError, getDoc} from "firebase/firestore";
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
          const user = await registerWithEmail(email, password, displayName);
          set({
            user,
            status: "authenticated",
            appMode: "online",
            isGuest: false,
          });
        } catch (error) {
          let errorMessage = "Ein unbekannter Fehler ist aufgetreten";
          if (error instanceof Error) {
             if (error.message === "AUTH/EMAIL-ALREADY-IN-USE") {
                 errorMessage = "Diese E-Mail-Adresse ist bereits registriert. Bitte melde dich an oder verwende eine andere E-Mail.";
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

        const previousStatus = get().status;

        try {
          console.log("AuthStore: Starte Profilbild-Upload für User:", user.uid);

          set((state) => ({
            ...state,
            error: null,
            uploadStatus: "loading",
          }));

          const updatedUser = await uploadProfilePictureService(file, user.uid);
          console.log("AuthStore: Upload erfolgreich, aktualisierter User:", updatedUser);

          set((state) => ({
            ...state,
            user: updatedUser,
            uploadStatus: "success",
            error: null,
          }));
        } catch (error) {
          console.error("AuthStore: Fehler beim Profilbild-Upload:", error);

          set((state) => ({
            ...state,
            uploadStatus: "error",
            error: error instanceof Error ? error.message : "Fehler beim Hochladen des Profilbilds.",
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
                  const userData = userSnap.data() as FirestoreUser;
                   if (userData?.playerId && typeof userData.playerId === 'string') { 
                      playerIdToLoad = userData.playerId;
                   }
              }

              if (!playerIdToLoad) {
                  const displayName = firebaseUser.displayName || `Spieler_${firebaseUser.uid.substring(0, 6)}`;
                  playerIdToLoad = await getPlayerIdForUser(firebaseUser.uid, displayName);
                  if (!playerIdToLoad) {
                     console.error(`AUTH_STORE: CRITICAL - Failed to obtain playerId even through fallback/create!`);
                     set({ status: "error", error: "Spielerprofil konnte nicht ermittelt werden." });
                     return;
                  }
              }

              if (playerIdToLoad) {
                  await useGroupStore.getState().loadUserGroupsByPlayerId(playerIdToLoad); 
              } else {
                  console.error("AUTH_STORE: No playerId available to load groups.");
                  set({ status: "error", error: "Spieler-ID nicht verfügbar zum Laden der Gruppen." });
                  return;
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
                  const userData = docSnap.data() as FirestoreUser;
                  const mappedUser = mapUserToAuthUser(firebaseUser, userData);
                  set({user: mappedUser, status: "authenticated"});
                  
                  const currentGroups = useGroupStore.getState().userGroups;
                  const currentGroupMap = new Map(currentGroups.map(g => [g.id, g]));
                  const currentActiveGroup = useGroupStore.getState().currentGroup;
                  if (userData.lastActiveGroupId && 
                      currentGroupMap.has(userData.lastActiveGroupId) && 
                      currentActiveGroup?.id !== userData.lastActiveGroupId) {
                       useGroupStore.getState().setCurrentGroup(currentGroupMap.get(userData.lastActiveGroupId)!);
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

