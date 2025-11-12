"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useTournamentStore } from '@/store/tournamentStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { TournamentSelector } from '@/components/tournament/TournamentSelector';
import JoinByInviteUI from "@/components/ui/JoinByInviteUI";
import { extractAndValidateToken } from "@/utils/tokenUtils";

const TournamentsPage: React.FC = () => {
  const router = useRouter();
  const { user, status: authStatus, isAuthenticated } = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const setHeaderConfig = useUIStore((state) => state.setHeaderConfig);

  const {
    userTournamentInstances,
    status: tournamentStatus,
    error: tournamentError,
    loadUserTournamentInstances,
    setCurrentTournamentInstance,
    leaveTournament,
  } = useTournamentStore();

  const [leavingTournamentId, setLeavingTournamentId] = useState<string | null>(null);
  const [isProcessingInvite, setIsProcessingInvite] = useState<boolean>(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated' && !isAuthenticated()) {
      router.push('/');
    }
  }, [authStatus, isAuthenticated, router]);

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      // 🔧 FIX: Verwende playerId statt uid für Turnier-Queries
      const playerId = user.playerId || user.uid;
      loadUserTournamentInstances(playerId);
    }
  }, [authStatus, user, loadUserTournamentInstances]);

  useEffect(() => {
    setHeaderConfig({
      title: null,
      showBackButton: false,
      backButtonAction: () => router.push('/profile'),
      showProfileButton: true,
    });

    setPageCta({
      isVisible: true,
      text: 'Neues Turnier erstellen',
      onClick: () => router.push('/tournaments/new'),
      variant: 'purple',
    });

    return () => {
      resetPageCta();
      setHeaderConfig(null);
    };
  }, [router, setPageCta, resetPageCta, setHeaderConfig]);

  const handleTournamentSelect = (instanceId: string) => {
    const selectedInstance = userTournamentInstances.find(inst => inst.id === instanceId);
    if (selectedInstance) {
      setCurrentTournamentInstance(selectedInstance);
      router.push(`/view/tournament/${instanceId}`);
    } else {
      console.error(`Tournament instance ${instanceId} not found in store.`);
    }
  };

  const handleLeaveTournament = async (instanceId: string, tournamentName: string) => {
    if (!user) return;
    setLeavingTournamentId(instanceId);
    try {
      const success = await leaveTournament(instanceId, user.uid);
      if (success) {
        showNotification({ message: `Du hast das Turnier "${tournamentName}" verlassen.`, type: "success" });
      } else {
        const currentError = useTournamentStore.getState().error;
        showNotification({ message: currentError || "Austreten fehlgeschlagen.", type: "error" });
      }
    } catch (error) {
       showNotification({ message: "Ein Fehler ist aufgetreten.", type: "error" });
    }
    setLeavingTournamentId(null);
  };

  const handleProcessInviteInput = useCallback(async (inputValue: string) => {
    if (!showNotification || !router) {
        console.error("showNotification oder router nicht initialisiert in handleProcessInviteInput (TournamentsPage)");
        return;
    }
    setIsProcessingInvite(true);

    const result = extractAndValidateToken(inputValue, "tournament");

    if (result.token) {
      if (result.type === 'tournament') {
        console.log(`[TournamentsPage] Navigiere zu /join mit Turniertoken: ${result.token}`);
        router.push(`/join?tournamentToken=${result.token}`);
      } else {
        showNotification({
          message: result.error || "Ungültiger Turniercode.",
          type: "error",
        });
      }
    } else { // Kein Token extrahiert, nur Fehler
      showNotification({
        message: result.error || "Eingabe konnte nicht verarbeitet werden.",
        type: "error",
      });
    }
    setIsProcessingInvite(false);
  }, [router, showNotification]);

  const isLoadingList = authStatus === 'loading' || tournamentStatus === 'loading-list';
  const isActionLoading = tournamentStatus === 'leaving-tournament';

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        <Button
          variant="ghost"
          onClick={() => router.push('/profile')}
          className="absolute top-5 left-4 text-white hover:bg-gray-700 p-2 sm:p-3 z-20"
          aria-label="Zurück zum Profil"
        >
          <ArrowLeft size={24} />
        </Button>

        <h1 className="text-2xl font-bold text-white text-center mb-6 mt-16 sm:mt-12">Meine Turniere</h1>

        <div className="w-full max-w-md space-y-6 pt-6 pb-24">
          {!isLoadingList && !tournamentError && userTournamentInstances.length > 0 && (
            <div className="mb-6">
              <label htmlFor="tournament-select" className="block text-sm font-medium text-gray-400 mb-1">
                Aktives Turnier auswählen:
              </label>
              <TournamentSelector />
            </div>
          )}

          {isLoadingList && (
            <div className="flex justify-center items-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-3 text-gray-400">Lade Turniere...</span>
            </div>
          )}

          {tournamentError && !isLoadingList && (
            <div className="text-red-400 text-center p-4 bg-red-900/30 rounded-md">
              Fehler beim Laden: {tournamentError}
            </div>
          )}

          {!isLoadingList && !tournamentError && (
            <div className="space-y-4">
              {userTournamentInstances.length > 0 ? (
                 <div className="space-y-3">
                   {userTournamentInstances
                     .filter(instance => instance.status === 'active') // Nur aktive Turniere anzeigen
                     .map((instance) => {
                     const isLeavingThis = leavingTournamentId === instance.id;
                     const canLeave = instance.status === 'active';

                     return (
                       <div key={instance.id} className="flex items-center gap-2">
                         <Button
                           variant="default"
                           className="flex-grow justify-start text-left h-auto py-3 px-4 bg-gray-800 border-gray-700 hover:bg-gray-700 text-white"
                           onClick={() => handleTournamentSelect(instance.id)}
                         >
                           <div className="flex flex-col">
                             <span className="font-medium">{instance.name}</span>
                             {instance.instanceDate && (
                               <span className="text-xs text-gray-400">
                                 {instance.instanceDate instanceof Date 
                                    ? instance.instanceDate.toLocaleDateString('de-CH') 
                                    : new Date((instance.instanceDate as any)?.seconds * 1000).toLocaleDateString('de-CH')}
                               </span>
                             )}
                             <span className={`text-xs mt-1 ${instance.status === 'active' ? 'text-green-400' : 'text-gray-500'}`}>
                                Status: {instance.status}
                             </span>
                           </div>
                         </Button>
                         {canLeave && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="destructive" 
                                  size="icon" 
                                  className="w-10 h-10 flex-shrink-0 bg-red-800/50 hover:bg-red-700/60 border-red-700/80"
                                  disabled={isLeavingThis || isActionLoading} 
                                  title="Turnier verlassen"
                                >
                                  {isLeavingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-gray-800 border-gray-700 text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-yellow-400"/> Turnier verlassen?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-gray-400 pt-2">
                                    Möchtest du das Turnier "{instance.name}" wirklich verlassen? Du kannst später wieder beitreten, wenn du erneut eingeladen wirst.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-gray-600 hover:bg-gray-700 text-white bg-gray-800">Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleLeaveTournament(instance.id, instance.name)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    disabled={isLeavingThis || isActionLoading}
                                  >
                                    Ja, verlassen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                       </div>
                     );
                   })}
                 </div>
               ) : (
                 <p className="text-center text-gray-500 py-6">Du nimmst an keinen Turnieren teil.</p>
               )}
            </div>
          )}
          
          <JoinByInviteUI 
            inviteType="tournament" 
            onProcessInput={handleProcessInviteInput} 
            isLoading={isProcessingInvite} 
            showNotification={showNotification}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default TournamentsPage; 