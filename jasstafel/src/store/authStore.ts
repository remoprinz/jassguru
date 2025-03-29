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
  getUserDocument,
  mapUserToAuthUser,
  resendVerificationEmail
} from '../services/authService';
import { AuthStatus, AuthUser, AppMode } from '../types/jass';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  firebaseUser: User | null;
  appMode: AppMode;
  error: string | null;
  isGuest: boolean;
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

      initAuth: () => {
        if (get().isGuest) {
          return;
        }
        
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            try {
              const authUser = mapUserToAuthUser(firebaseUser);
              set({ 
                user: authUser, 
                firebaseUser,
                status: 'authenticated', 
                appMode: 'online',
                isGuest: false,
                error: null 
              });

              const userDoc = await getUserDocument(firebaseUser.uid);
              if (userDoc) {
                console.log('User document loaded:', userDoc);
              }
            } catch (error) {
              console.error('Error initializing auth:', error);
              set({ 
                status: 'error', 
                error: error instanceof Error ? error.message : 'Fehler beim Initialisieren der Authentifizierung' 
              });
            }
          } else {
            set({ 
              user: null, 
              firebaseUser: null,
              status: 'unauthenticated', 
              error: null 
            });
          }
        });
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