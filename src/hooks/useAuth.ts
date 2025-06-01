import { useState, useEffect } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { firebaseApp } from '@/services/firebaseInit';

// Interface für den Auth-Status
export interface AuthState {
  user: FirebaseUser | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook zur Verwaltung des Authentifizierungsstatus
 * Bietet Zugriff auf den aktuellen Benutzer, Ladestatus und Fehler
 */
export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    const auth = getAuth(firebaseApp);
    
    // Auth State Listener einrichten
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setAuthState({
          user,
          isLoading: false,
          error: null
        });
      },
      (error) => {
        console.error('Auth error:', error);
        setAuthState({
          user: null,
          isLoading: false,
          error
        });
      }
    );

    // Cleanup beim Unmounten
    return () => unsubscribe();
  }, []);

  return authState;
}

export default useAuth; 