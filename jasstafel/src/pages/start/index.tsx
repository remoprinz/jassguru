'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import MainLayout from '@/components/layout/MainLayout';

const StartPage: React.FC = () => {
  const { user, status, isAuthenticated, logout, isGuest } = useAuthStore();
  const router = useRouter();

  // Redirect to home if not authenticated and not a guest (and not loading)
  useEffect(() => {
    if (!isAuthenticated() && status !== 'loading') {
      router.push('/');
    }
  }, [isAuthenticated, status, router]);

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
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white">
        <div className="mt-10 mb-8 flex w-full max-w-md flex-col items-center">
          <div className="mb-6 flex flex-col items-center">
            <Image 
              src="/icon-192x192.png" 
              alt="Jass Tafel" 
              width={120} 
              height={120} 
              className="mb-4"
            />
            <h1 className="text-center text-3xl font-bold">
              Willkommen{user?.displayName ? `, ${user.displayName}` : isGuest ? ', Gast' : ''}!
            </h1>
          </div>

          <div className="w-full space-y-4">
            <Button 
              onClick={handleNewGame}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Neues Spiel starten
            </Button>
            
            <Button 
              onClick={handleContinueGame}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Spiel fortsetzen
            </Button>

            {!isGuest && (
              <Button 
                onClick={() => router.push('/profile')}
                className="w-full bg-purple-600 hover:bg-purple-700"
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