"use client";

import React, { useEffect, useState, useMemo } from 'react';
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
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';
import { shouldShowBrowserOnboarding } from '@/utils/devUtils';
import type { BrowserOnboardingStep } from '@/constants/onboardingContent';

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

  // 🚀 NEU: Onboarding-Logik für Browser-Nutzer
  const [isPWAInstalled] = useState(() => isPWA());
  const pathname = router.pathname;
  
  // Bestimme, ob Browser Onboarding erforderlich ist
  const isBrowserOnboardingRequired = useMemo(() => {
    // Nur für /game/new zeigen (nicht für andere Pfade)
    const isCurrentPath = pathname === '/game/new';
    if (!isCurrentPath) return false;
    
    // Verwende die gleiche Logik wie in JassKreidetafel
    const result = shouldShowBrowserOnboarding(isPWAInstalled, false);
    return result;
  }, [isPWAInstalled, pathname]);

  // Onboarding Hook
  const {
    currentStep,
    content,
    handleNext,
    handlePrevious,
    handleDismiss,
    canBeDismissed,
  } = useOnboardingFlow(isBrowserOnboardingRequired);

  // State um zu verfolgen, ob Onboarding abgeschlossen ist
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(!isBrowserOnboardingRequired);

  // Custom Dismiss Handler
  const handleOnboardingDismiss = () => {
    handleDismiss();
    setIsOnboardingComplete(true);
  };

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
      } else if (!currentGroup) {
        showNotification({ type: 'warning', message: 'Bitte wählen Sie zuerst eine Gruppe aus.' });
        router.replace('/start');
      }
      // ENTFERNT: PWA-Prüfung, da sie den korrekten OnboardingFlow in JassKreidetafel.tsx blockiert
      // Die intelligente Onboarding-Logik (Desktop=QR-Code, Mobile=Installation) ist bereits in JassKreidetafel.tsx implementiert
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

  // 🚀 NEU: Zeige Onboarding BEFORE StartScreen
  if (isBrowserOnboardingRequired && !isOnboardingComplete) {
    return (
      <MainLayout>
        <OnboardingFlow
          show={true}
          step={currentStep as BrowserOnboardingStep}
          content={content}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onDismiss={handleOnboardingDismiss}
          canBeDismissed={canBeDismissed}
          isPWA={isPWAInstalled}
          isBrowserOnboarding={isBrowserOnboardingRequired}
        />
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
