'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import MainLayout from '@/components/layout/MainLayout';

const NewGamePage: React.FC = () => {
  const { isAuthenticated, status } = useAuthStore();
  const router = useRouter();

  // Redirect to home if not authenticated and not loading
  useEffect(() => {
    if (!isAuthenticated() && status !== 'loading') {
      router.push('/');
    }
  }, [isAuthenticated, status, router]);

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
        <div className="mt-10 w-full max-w-md">
          <h1 className="mb-6 text-center text-3xl font-bold">Neues Spiel</h1>
          
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
            <p className="text-center mb-4">
              Hier können Sie bald ein neues Jass-Spiel starten und alle Spieloptionen konfigurieren.
            </p>
            
            <p className="text-gray-400 text-sm mb-4 text-center">
              Diese Funktion wird in Kürze verfügbar sein.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default NewGamePage; 