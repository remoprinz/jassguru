import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth } from '../services/firebaseInit';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  loginWithEmail, 
  loginWithGoogle, 
  logout, 
  registerWithEmail, 
  resetPassword,
  mapUserToAuthUser,
  resendVerificationEmail,
  uploadProfilePicture as uploadProfilePictureService
} from '../services/authService';
import { AuthStatus, AuthUser, AppMode } from '../types/jass';

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
          const user = await loginWithGoogle();
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
          await resetPassword(email);
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
        if (get().isGuest) {
           console.log("AUTH_STORE: initAuth - Ist Gast, überspringe Listener.");
          return;
        }
        
        console.log("AUTH_STORE: initAuth - Registriere onAuthStateChanged Listener...");
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          console.log("AUTH_STORE: onAuthStateChanged FEUERTE!", "firebaseUser:", firebaseUser ? firebaseUser.uid : 'null');
          if (firebaseUser) {
            try {
              console.log("AUTH_STORE: onAuthStateChanged - Firebase User vorhanden, mappe und setze Status 'authenticated'");
              const authUser = mapUserToAuthUser(firebaseUser);
              set({ 
                user: authUser, 
                firebaseUser,
                status: 'authenticated', 
                appMode: 'online',
                isGuest: false,
                error: null 
              });
              console.log("AUTH_STORE: onAuthStateChanged - Zustand nach set 'authenticated':", get().status, get().user?.uid);

              // Optional: User-Dokument laden (könnte man für Debugging auskommentieren)
              // const userDoc = await getUserDocument(firebaseUser.uid);
              // if (userDoc) {
              //   console.log('AUTH_STORE: onAuthStateChanged - User document loaded:', userDoc);
              // }
            } catch (error) {
              console.error('AUTH_STORE: onAuthStateChanged - Fehler beim Verarbeiten des Firebase Users:', error);
              set({ 
                status: 'error', 
                error: error instanceof Error ? error.message : 'Fehler beim Initialisieren der Authentifizierung' 
              });
              console.log("AUTH_STORE: onAuthStateChanged - Zustand nach set 'error':", get().status);
            }
          } else {
             console.log("AUTH_STORE: onAuthStateChanged - Kein Firebase User, setze Status 'unauthenticated'");
            set({ 
              user: null, 
              firebaseUser: null,
              status: 'unauthenticated', 
              error: null 
            });
             console.log("AUTH_STORE: onAuthStateChanged - Zustand nach set 'unauthenticated':", get().status);
          }
        });
        console.log("AUTH_STORE: initAuth - Listener registriert.");
        // Unsubscribe zurückgeben, falls benötigt
        // return unsubscribe; 
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