'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Header from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MainLayout from '@/components/layout/MainLayout';
import { GroupSelector } from '@/components/group/GroupSelector';
import { Users, Settings, UserPlus } from 'lucide-react';

const StartPage: React.FC = () => {
  const { user, status } = useAuthStore();
  const { currentGroup, userGroups, status: groupStatus } = useGroupStore();
  const isGameInProgress = useGameStore(state => state.isGameStarted && !state.isGameCompleted);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated' && process.env.NODE_ENV === 'production') {
      console.log("StartPage: Auth status is 'unauthenticated' in production, redirecting to /");
      router.push('/');
    } else if (status === 'unauthenticated') {
        console.log("StartPage: Auth status is 'unauthenticated' in non-production environment, redirect skipped.");
    }
  }, [status, router]);

  const handleGameAction = () => {
    router.push('/jass');
  };

  // Helper Variable für Admin-Check
  const isAdmin = currentGroup && user && currentGroup.adminIds.includes(user.uid);

  if (status === 'loading' || groupStatus === 'loading') {
    return (
      <MainLayout>
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
          <span className="ml-3 text-white">Laden...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header />
      <div className="flex flex-1 flex-col items-center p-4 pb-24 text-white">
        <div className="flex w-full max-w-md flex-col items-center">
          {currentGroup ? (
            <>
              <div className="mt-2 mb-4 flex flex-col items-center">
                <Avatar className="h-32 w-32 mb-4 border-2 border-gray-700">
                  <AvatarImage src={currentGroup.logoUrl ?? undefined} alt={currentGroup.name ?? 'Gruppe'} className="object-cover" />
                  <AvatarFallback className="bg-gray-700 text-gray-200 text-5xl font-bold">
                    {currentGroup.name?.charAt(0).toUpperCase() || 'G'}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm text-gray-400 mb-1">Aktive Gruppe:</p>
                <h1 className="text-3xl font-bold text-center text-white mb-4">{currentGroup.name}</h1>
              </div>
              <div className="flex justify-center space-x-4 mb-6 w-full">
                  <Button variant="outline" size="icon" className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-white" onClick={() => alert('Einladen - TODO')}>
                      <UserPlus className="h-5 w-5" />
                  </Button>
                   <Button variant="outline" size="icon" className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-white" onClick={() => alert('Mitglieder - TODO')}>
                       <Users className="h-5 w-5" />
                   </Button>
                   {isAdmin && (
                       <Button variant="outline" size="icon" className="bg-gray-700 border-gray-600 hover:bg-gray-700 text-white" onClick={() => alert('Einstellungen - TODO')}>
                           <Settings className="h-5 w-5" />
                       </Button>
                   )}
              </div>

              {/* Statistikbereich beginnt jetzt direkt nach den Buttons */}
              {/* max-h-[35vh] begrenzt die Höhe, overflow-y-auto fügt Scrollbar bei Bedarf hinzu */}
              <div className="w-full bg-gray-800/50 rounded-lg p-4 mb-8 max-h-[35vh] overflow-y-auto">
                {/* px-2 für inneren horizontalen Abstand */} 
                <div className="space-y-2 text-sm px-2 pb-2">
                  {/* Zählungen (reduziert & neu sortiert) */}
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Mitglieder:</span>
                    <span className="text-gray-100">{currentGroup?.playerIds?.length ?? 0}</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Jasse:</span>
                    <span className="text-gray-100">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Spiele:</span>
                    <span className="text-gray-100">0</span>
                  </div>
                 
                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600" />
                  </div>

                  {/* Durchschnitte (reduziert) */}
                   <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Ø Matsche / Spiel:</span>
                    <span className="text-gray-100">-</span>
                  </div>

                  {/* Divider */}
                  <div className="pt-2 pb-1">
                    <hr className="border-gray-600" />
                  </div>

                  {/* Eckdaten */}
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Erster Jass:</span>
                    <span className="text-gray-100">-</span> 
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Letzter Jass:</span>
                    <span className="text-gray-100">-</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="font-medium text-gray-300">Ort:</span>
                    <span className="text-gray-100">-</span>
                  </div>
                </div>
              </div>
            </>
          ) : userGroups.length > 0 ? (
            <div className="flex flex-col items-center text-center mt-8">
               <Image 
                src="/welcome-guru.png"
                alt="Jassguru Maskottchen"
                width={120} 
                height={120} 
                className="mb-4"
              />
              <h2 className="text-xl font-semibold mb-2">Gruppe auswählen</h2>
              <p className="text-gray-400 mb-4">Wähle eine Gruppe aus, um zu starten, oder erstelle eine neue.</p>
              <div className="w-full mb-4">
                 <GroupSelector />
              </div>
              <Button 
                onClick={() => router.push('/groups/new')}
                className="w-full bg-yellow-600 hover:bg-yellow-700"
              >
                Neue Gruppe erstellen
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center mt-8">
               <Image 
                src="/welcome-guru.png"
                alt="Jassguru Maskottchen"
                width={120} 
                height={120} 
                className="mb-4"
              />
              <h1 className="text-2xl font-bold mb-2">
                Willkommen, {user?.displayName || 'Jasser'}!
              </h1>
              <p className="text-gray-400 mb-6">Du bist noch keiner Jassgruppe beigetreten. Erstelle jetzt deine erste Gruppe!</p>
              <Button 
                onClick={() => router.push('/groups/new')}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-lg py-3"
              >
                Neue Gruppe erstellen
              </Button>
            </div>
          )}
        </div>
        {currentGroup && (
            <div className="fixed bottom-24 left-0 right-0 px-4 pb-6 z-20">
              <div className="w-full max-w-md mx-auto">
                 <Button 
                   onClick={handleGameAction}
                   className={`w-full h-14 text-lg rounded-xl shadow-lg ${isGameInProgress ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                 >
                   {isGameInProgress ? 'Jass fortsetzen' : 'Neuen Jass starten'}
                 </Button>
              </div>
            </div>
        )}
      </div>
    </MainLayout>
  );
};

export default StartPage; 