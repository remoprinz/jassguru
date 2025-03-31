'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Header from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MainLayout from '@/components/layout/MainLayout';

const StartPage: React.FC = () => {
  const { user, status, logout, isGuest } = useAuthStore();
  const currentGroup = useGroupStore(state => state.currentGroup);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated' && process.env.NODE_ENV === 'production') {
      console.log("StartPage: Auth status is 'unauthenticated' in production, redirecting to /");
      router.push('/');
    } else if (status === 'unauthenticated') {
        console.log("StartPage: Auth status is 'unauthenticated' in non-production environment, redirect skipped.");
    }
  }, [status, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleNewGame = () => {
    router.push('/jass');
  };

  const handleContinueGame = () => {
    router.push('/game/continue');
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
          <span className="ml-2">Laden...</span>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <Header />
      <div className="flex flex-1 flex-col items-center p-4 text-white">
        <div className="mt-6 mb-8 flex w-full max-w-md flex-col items-center">
          {currentGroup ? (
            <div className="mt-2 mb-10 flex flex-col items-center">
              <Avatar className="h-32 w-32 mb-4 border-2 border-gray-700">
                <AvatarImage src={currentGroup.logoUrl ?? undefined} alt={currentGroup.name ?? 'Gruppe'} className="object-cover" />
                <AvatarFallback className="bg-gray-700 text-gray-200 text-5xl font-bold">
                  {currentGroup.name?.charAt(0).toUpperCase() || 'G'}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm text-gray-400 mb-1">Aktive Gruppe:</p>
              <h1 className="text-3xl font-bold text-center text-white mb-6">{currentGroup.name}</h1>
            </div>
          ) : (
            <div className="mb-6 flex flex-col items-center">
              <Image 
                src="/welcome-guru.png"
                alt="Jassguru Maskottchen"
                width={120} 
                height={120} 
                className="mb-4"
              />
              <h1 className="text-center text-3xl font-bold">
                Willkommen{user?.displayName ? `, ${user.displayName}` : isGuest ? ', Gast' : ''}!
              </h1>
            </div>
          )}

          <div className="w-full space-y-4">
            <Button 
              onClick={handleNewGame}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Neues Spiel starten
            </Button>
            
            <Button 
              onClick={() => router.push('/groups/new')}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              Neue Gruppe erstellen (Test)
            </Button>

            {!isGuest && (
              <Button 
                onClick={() => router.push('/profile')}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Mein Profil
              </Button>
            )}
            
            <Button 
              onClick={handleLogout}
              className="w-full bg-gray-600 hover:bg-gray-700"
              variant="outline"
            >
              Abmelden
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default StartPage; 