'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    // Initialisiere die Authentifizierung
    initAuth();
  }, [initAuth]);

  return <>{children}</>;
} 