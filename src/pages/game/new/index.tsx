"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import StartScreen from '@/components/layout/StartScreen';
import GlobalLoader from '@/components/layout/GlobalLoader';
import { getGroupMembersSortedByGames } from "@/services/playerService";
import { isPWA } from '@/utils/browserDetection';
import type { FirestorePlayer } from '@/types/jass';

const NewGamePage: React.FC = () => {
  const router = useRouter();
  const { status, isGuest } = useAuthStore();
  const { currentGroup } = useGroupStore();
  const showNotification = useUIStore((state) => state.showNotification);

  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  const isAuthLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated' && !isGuest;

  // Lade Mitglieder, wenn Gruppe verfügbar ist
  useEffect(() => {
    const loadMembers = async () => {
      if (!currentGroup) {
        setMembers([]);
        setMembersLoading(false);
        return;
      }

      setMembersLoading(true);
      setMembersError(null);
      try {
        const fetchedMembers = await getGroupMembersSortedByGames(currentGroup.id);
        setMembers(fetchedMembers);
      } catch (error) {
        console.error("Fehler beim Laden der Gruppenmitglieder:", error);
        const message = error instanceof Error ? error.message : "Mitglieder konnten nicht geladen werden.";
        setMembersError(message);
        showNotification({ message, type: "error" });
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [currentGroup?.id, showNotification]);

  useEffect(() => {
    // Dieser Effect stellt sicher, dass nur eingeloggte Benutzer
    // mit einer ausgewählten Gruppe diese Seite nutzen können.
    if (!isAuthLoading) {
      if (!isAuthenticated) {
        showNotification({ type: 'error', message: 'Sie müssen angemeldet sein, um ein Spiel zu starten.' });
        router.replace('/auth/login');
      } else if (!isPWA()) {
        // 🚨 ZUSÄTZLICHE SICHERHEIT: Browser-Zugriff verhindern
        showNotification({
          type: 'warning',
          message: 'Bitte schliesse den Browser und öffne die App vom Homebildschirm aus, um die Jasstafel zu laden.',
          actions: [
            {
              label: 'Verstanden',
              onClick: () => {},
            },
          ],
          preventClose: true,
        });
        router.replace('/start');
      } else if (!currentGroup) {
        showNotification({ type: 'warning', message: 'Bitte wählen Sie zuerst eine Gruppe aus.' });
        router.replace('/start');
      }
    }
  }, [isAuthLoading, isAuthenticated, currentGroup, router, showNotification]);

  // 🔧 ZUSÄTZLICHER SCHUTZ: Falls currentGroup während des Ladens verschwindet
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && !currentGroup && !membersLoading) {
      console.warn("[NewGamePage] currentGroup wurde nach dem Laden null - navigiere zu /start");
      router.replace('/start');
    }
  }, [isAuthLoading, isAuthenticated, currentGroup, membersLoading, router]);

  // Zeige GlobalLoader während der Authentifizierung oder beim Laden der Mitglieder
  if (isAuthLoading || !isAuthenticated || !currentGroup || membersLoading) {
    const loadingMessage = isAuthLoading 
      ? "Prüfe Anmeldung..."
      : !isAuthenticated || !currentGroup
      ? "Prüfe Spiel-Kontext..."
      : "Lade Spieler...";

    return (
      <MainLayout>
        <GlobalLoader message={loadingMessage} />
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
      <StartScreen onCancel={handleCancel} members={members} />
    </MainLayout>
  );
};

export default NewGamePage;
