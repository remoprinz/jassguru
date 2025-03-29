'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import MainLayout from '@/components/layout/MainLayout';

const ProfilePage: React.FC = () => {
  const { user, status, isAuthenticated } = useAuthStore();
  const router = useRouter();

  // Nur für angemeldete Benutzer (keine Gäste)
  useEffect(() => {
    if (!isAuthenticated() || status === 'unauthenticated') {
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
        <div className="w-full max-w-md space-y-8 py-8">
          <div className="text-center">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-gray-800">
              {user?.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt="Profilbild"
                  width={96}
                  height={96}
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-blue-600 text-3xl font-bold">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
                </div>
              )}
            </div>
            <h1 className="mt-4 text-2xl font-bold">
              {user?.displayName || 'Kein Name festgelegt'}
            </h1>
            <p className="mt-2 text-gray-400">
              {user?.email || 'Keine E-Mail-Adresse'}
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <Button
              onClick={() => router.push('/profile/edit')}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled
            >
              Profil bearbeiten
            </Button>

            <Button
              onClick={() => router.push('/profile/statistics')}
              className="w-full bg-gray-700 hover:bg-gray-600"
              variant="outline"
              disabled
            >
              Meine Statistiken
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage; 