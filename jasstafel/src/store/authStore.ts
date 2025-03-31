import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth } from '../services/firebaseInit';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  loginWithEmail, 
  signInWithGoogleProvider,
  logout, 
  registerWithEmail, 
  sendPasswordReset,
  mapUserToAuthUser,
  resendVerificationEmail,
  uploadProfilePicture as uploadProfilePictureService
} from '../services/authService';
import { AuthStatus, AuthUser, AppMode, FirestoreGroup, FirestoreUser } from '../types/jass';
import { useGroupStore } from './groupStore';
import { getGroupById } from '../services/groupService';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../services/firebaseInit';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  firebaseUser: User | null;
  appMode: AppMode;
  error: string | null;
  isGuest: boolean;
  uploadStatus?: 'idle' | 'loading' | 'success' | 'error';
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
}

type AuthStore = AuthState & AuthActions;

let userDocUnsubscribe: Unsubscribe | null = null;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Zustand
      status: 'idle',
      user: null,
      firebaseUser: null,
      appMode: 'offline',
      error: null,
      isGuest: false,
      uploadStatus: 'idle',

      // Aktionen
      login: async (email: string, password: string) => {
        try {
          set({ status: 'loading', error: null });
          const user = await loginWithEmail(email, password);
          set({ 
            user, 
            status: 'authenticated', 
            appMode: 'online',
            isGuest: false
          });
        } catch (error) {
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
          });
          throw error;
        }
      },

      loginWithGoogle: async () => {
        try {
          set({ status: 'loading', error: null });
          const user = await signInWithGoogleProvider();
          set({ 
            user, 
            status: 'authenticated', 
            appMode: 'online',
            isGuest: false
          });
        } catch (error) {
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
          });
          throw error;
        }
      },

      register: async (email: string, password: string, displayName?: string) => {
        try {
          set({ status: 'loading', error: null });
          const user = await registerWithEmail(email, password, displayName);
          set({ 
            user, 
            status: 'authenticated', 
            appMode: 'online',
            isGuest: false
          });
        } catch (error) {
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
          });
          throw error;
        }
      },

      logout: async () => {
        useGroupStore.getState().resetGroupStore();
        try {
          set({ status: 'loading', error: null });
          await logout();
          set({ 
            user: null, 
            firebaseUser: null,
            status: 'unauthenticated', 
            appMode: 'offline',
            isGuest: false
          });
        } catch (error) {
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
          });
          throw error;
        }
      },

      resetPassword: async (email: string) => {
        try {
          set({ status: 'loading', error: null });
          await sendPasswordReset(email);
          set({ status: get().user ? 'authenticated' : 'unauthenticated' });
        } catch (error) {
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
          });
          throw error;
        }
      },

      setAppMode: (mode: AppMode) => {
        set({ appMode: mode });
      },

      continueAsGuest: () => {
        useGroupStore.getState().resetGroupStore();
        set({
          status: 'unauthenticated',
          user: null,
          firebaseUser: null,
          appMode: 'offline',
          isGuest: true,
          error: null
        });
      },

      isAuthenticated: () => {
        const state = get();
        return state.status === 'authenticated' || state.isGuest;
      },

      resendVerificationEmail: async () => {
        try {
          set({ status: 'loading', error: null });
          await resendVerificationEmail();
          set(state => ({ status: state.status === 'loading' ? (state.user ? 'authenticated' : 'unauthenticated') : state.status }));
        } catch (error) {
          console.error('Error in store resendVerificationEmail:', error);
          set({ 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Fehler beim erneuten Senden der E-Mail.' 
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
          
          set(state => ({ 
            ...state, 
            error: null,
            uploadStatus: 'loading'
          }));
          
          const updatedUser = await uploadProfilePictureService(file, user.uid);
          console.log("AuthStore: Upload erfolgreich, aktualisierter User:", updatedUser);
          
          set(state => ({
            ...state,
            user: updatedUser,
            uploadStatus: 'success',
            error: null
          }));

        } catch (error) {
          console.error('AuthStore: Fehler beim Profilbild-Upload:', error);
          
          set(state => ({ 
            ...state,
            uploadStatus: 'error',
            error: error instanceof Error ? error.message : 'Fehler beim Hochladen des Profilbilds.'
          }));
          
          throw error;
        }
      },

      initAuth: () => {
        console.log("AUTH_STORE: initAuth aufgerufen");
        const { setCurrentGroup, setError, resetGroupStore, loadUserGroups } = useGroupStore.getState();
        
        if (userDocUnsubscribe) {
          console.log("AUTH_STORE: Melde bestehenden User Doc Listener ab.");
          userDocUnsubscribe();
          userDocUnsubscribe = null;
        }

        console.log("AUTH_STORE: initAuth - Registriere onAuthStateChanged Listener...");
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          console.log("AUTH_STORE: onAuthStateChanged FEUERTE!", "firebaseUser:", firebaseUser ? firebaseUser.uid : 'null');

          if (userDocUnsubscribe) {
            console.log("AUTH_STORE: (onAuthStateChanged) Melde bestehenden User Doc Listener ab.");
            userDocUnsubscribe();
            userDocUnsubscribe = null;
          }

          if (firebaseUser) {
            try {
              console.log("AUTH_STORE: Richte onSnapshot Listener für User Doc ein:", firebaseUser.uid);
              const userDocRef = doc(db, 'users', firebaseUser.uid);

              userDocUnsubscribe = onSnapshot(userDocRef, async (userDocSnap) => {
                console.log("AUTH_STORE: User Doc Snapshot empfangen.", userDocSnap.exists() ? "Dokument existiert." : "Dokument existiert NICHT.");
                if (!firebaseUser) {
                  console.warn("AUTH_STORE: User Doc Snapshot empfangen, aber Firebase User ist null. Breche ab.");
                  return;
                }

                const userDocData = userDocSnap.data();
                console.log("AUTH_STORE: Snapshot - Gelesene lastActiveGroupId:", userDocData?.lastActiveGroupId);

                const firestoreLastActiveGroupId = userDocData ? userDocData['lastActiveGroupId'] : null;
                console.log("AUTH_STORE: Snapshot - Explizit gelesene lastActiveGroupId:", firestoreLastActiveGroupId);
                
                let finalGroupId = null;
                if (userDocSnap.exists() && userDocData && typeof userDocData === 'object' && 'lastActiveGroupId' in userDocData) {
                  finalGroupId = userDocData.lastActiveGroupId ?? null;
                }
                console.log("AUTH_STORE: Snapshot - Final ermittelte GroupId:", finalGroupId);

                const firestoreDataForMapping: Partial<FirestoreUser> | null = userDocData 
                  ? { ...userDocData, lastActiveGroupId: finalGroupId }
                  : null;

                const latestAuthUser = mapUserToAuthUser(firebaseUser, firestoreDataForMapping);

                set({
                  user: latestAuthUser,
                  firebaseUser,
                  status: 'authenticated',
                  appMode: 'online',
                  isGuest: false,
                  error: null
                });
                console.log("AUTH_STORE: Zustand nach Snapshot aktualisiert. LastActiveGroupId im State:", get().user?.lastActiveGroupId);

                const activeGroupId = finalGroupId;
                console.log("AUTH_STORE: Snapshot - Versuche Gruppe zu setzen basierend auf ID:", activeGroupId);

                const currentGroupIdInStore = useGroupStore.getState().currentGroup?.id;

                if (activeGroupId) {
                  if (activeGroupId === currentGroupIdInStore) {
                    console.log("AUTH_STORE: Snapshot - Aktive Gruppe (", activeGroupId, ") ist bereits im Store gesetzt. Überspringe Update.");
                    return;
                  }
                  try {
                    const group = await getGroupById(activeGroupId);
                    if (group) {
                      console.log("AUTH_STORE: Snapshot - Gruppe gefunden:", group.name);
                      await loadUserGroups(latestAuthUser.uid);
                      const userGroups = useGroupStore.getState().userGroups;
                      if (userGroups.some((g: FirestoreGroup) => g.id === activeGroupId)) {
                        console.log("AUTH_STORE: Snapshot - Setze Gruppe:", group.name);
                        await setCurrentGroup(group);
                      } else {
                        console.warn("AUTH_STORE: Snapshot - Gruppe (", activeGroupId, ") nicht in User-Liste. Setze auf null.");
                        await setCurrentGroup(null);
                      }
                    } else {
                      console.warn("AUTH_STORE: Snapshot - Gruppe mit ID (", activeGroupId, ") nicht gefunden. Setze auf null.");
                      await setCurrentGroup(null);
                    }
                  } catch (groupError) {
                    console.error("AUTH_STORE: Snapshot - Fehler beim Holen/Setzen der Gruppe:", groupError);
                    setError("Fehler beim Laden der aktiven Gruppe.");
                    await setCurrentGroup(null);
                  }
                } else {
                  if (currentGroupIdInStore !== null) {
                    console.log("AUTH_STORE: Snapshot - Keine lastActiveGroupId, aber Gruppe im Store. Setze auf null.");
                    await setCurrentGroup(null);
                  } else {
                    console.log("AUTH_STORE: Snapshot - Keine lastActiveGroupId und keine Gruppe im Store. Keine Aktion nötig.");
                  }
                }
              }, (error) => {
                console.error("AUTH_STORE: Fehler im onSnapshot Listener für User Doc:", error);
                setError("Fehler beim Überwachen der Benutzerdaten.");
              });

            } catch (error) {
              console.error('AUTH_STORE: Fehler beim Verarbeiten von onAuthStateChanged:', error);
              setError(error instanceof Error ? error.message : 'Fehler beim Initialisieren des Auth-Status.');
              set({ status: 'error', error: error instanceof Error ? error.message : 'Auth-Init Fehler' });
            }
          } else {
            console.log("AUTH_STORE: onAuthStateChanged - Kein Firebase User, setze Status 'unauthenticated'");
            set({
              user: null,
              firebaseUser: null,
              status: 'unauthenticated',
              error: null
            });
            resetGroupStore();
            console.log("AUTH_STORE: onAuthStateChanged - Zustand nach set 'unauthenticated':", get().status);
          }
        });

        console.log("AUTH_STORE: initAuth - Listener registriert.");
      },

      clearError: () => {
        set({ error: null });
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        appMode: state.appMode,
        isGuest: state.isGuest
      })
    }
  )
); 