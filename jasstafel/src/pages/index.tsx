'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import WelcomeScreen from '@/components/auth/WelcomeScreen';
import { useAuthStore } from '@/store/authStore';

export default function Home() {
  const router = useRouter();
  const { status, isGuest, initAuth } = useAuthStore();
  const [isClient, setIsClient] = useState(false);

  // Client-Side Rendering aktivieren
  useEffect(() => {
    setIsClient(true);
    initAuth();
  }, [initAuth]);

  // Die automatische Weiterleitung zu /start wurde entfernt
  // Stattdessen wird nun immer die WelcomeScreen-Komponente angezeigt

  // Server-Rendering vermeiden
  if (!isClient) {
    return null;
  }

  return <WelcomeScreen />;
}