"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import StartScreen from '@/components/layout/StartScreen';
import { Loader2 } from 'lucide-react';

const NewGamePage: React.FC = () => {
  const router = useRouter();
  const { status, isGuest } = useAuthStore();
  const { currentGroup } = useGroupStore();
  const showNotification = useUIStore((state) => state.showNotification);

  const isAuthLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated' && !isGuest;

  useEffect(() => {
    // Dieser Effect stellt sicher, dass nur eingeloggte Benutzer
    // mit einer ausgewählten Gruppe diese Seite nutzen können.
    if (!isAuthLoading) {
      if (!isAuthenticated) {
        showNotification({ type: 'error', message: 'Sie müssen angemeldet sein, um ein Spiel zu starten.' });
        router.replace('/auth/login');
      } else if (!currentGroup) {
        showNotification({ type: 'warning', message: 'Bitte wählen Sie zuerst eine Gruppe aus.' });
        router.replace('/start');
      }
    }
  }, [isAuthLoading, isAuthenticated, currentGroup, router, showNotification]);

  // Zeigt einen Lade-Spinner, während die Authentifizierung geprüft wird.
  if (isAuthLoading || !isAuthenticated || !currentGroup) {
    return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)]">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="mt-2 text-white">Prüfe Spiel-Kontext...</p>
        </div>
      </MainLayout>
    );
  }

  // Die "Abbrechen"-Aktion wird hier definiert und an StartScreen übergeben,
  // um sicher zur Startseite zurückzunavigieren.
  const handleCancel = () => {
    router.push('/start');
  };

  return (
    <MainLayout>
      <StartScreen onCancel={handleCancel} />
    </MainLayout>
  );
};

export default NewGamePage;
