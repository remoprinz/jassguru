'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import MainLayout from '@/components/layout/MainLayout';

const ContinueGamePage: React.FC = () => {
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
          <h1 className="mb-6 text-center text-3xl font-bold">Spiel fortsetzen</h1>
          
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
            <p className="text-center mb-4">
              Hier können Sie Ihre gespeicherten Spiele fortsetzen.
            </p>
            
            <div className="flex flex-col items-center justify-center bg-gray-700 rounded-lg p-4 mb-4">
              <p className="text-gray-400 text-center">
                Keine gespeicherten Spiele gefunden.
              </p>
            </div>
            
            <p className="text-gray-400 text-sm text-center">
              In Zukunft werden Sie hier Ihre letzten Spielstände sehen können.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ContinueGamePage; 