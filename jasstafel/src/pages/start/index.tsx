'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Header from '@/components/layout/Header';

const StartPage: React.FC = () => {
  const { user, status, isAuthenticated, logout, isGuest } = useAuthStore();
  const router = useRouter();

  // Redirect to home only if explicitly unauthenticated
  useEffect(() => {
    // Nur umleiten, wenn der Status explizit 'unauthenticated' ist
    if (status === 'unauthenticated') {
      console.log("StartPage: Auth status is 'unauthenticated', redirecting to /"); // Zusätzliches Logging
      router.push('/');
    }
    // Abhängigkeit von isAuthenticated kann entfernt werden, da wir nur auf 'unauthenticated' prüfen
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
    <div className="flex min-h-screen flex-col bg-gray-900">
      <Header />
      
      <main className="flex flex-1 flex-col items-center p-4 text-white">
        <div className="mt-6 mb-8 flex w-full max-w-md flex-col items-center">
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
      </main>
    </div>
  );
};

export default StartPage; 