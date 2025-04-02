'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Textarea from '../../components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

const EditProfilePage: React.FC = () => {
  const { user, status, isAuthenticated, updateProfile } = useAuthStore();
  const showNotification = useUIStore(state => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect wenn nicht eingeloggt
  useEffect(() => {
    if (status === 'authenticated' || status === 'unauthenticated') {
      if (!isAuthenticated()) {
        router.push('/');
      }
    }
  }, [status, isAuthenticated, router]);

  // Form-Daten aktualisieren wenn User-Daten geladen werden
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setStatusMessage(user.statusMessage || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await updateProfile({ displayName, statusMessage });
      
      showNotification({
        message: 'Profil erfolgreich aktualisiert.',
        type: 'success'
      });
      
      router.push('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
      setIsSubmitting(false);
    }
  };

  // CTA Button Setup
  useEffect(() => {
    setPageCta({
      isVisible: true,
      text: 'Speichern',
      onClick: () => {
        const form = document.getElementById('profile-form') as HTMLFormElement;
        form?.requestSubmit();
      },
      loading: isSubmitting,
      disabled: isSubmitting,
      variant: 'default',
    });

    return () => {
      resetPageCta();
    };
  }, [setPageCta, resetPageCta, isSubmitting]);

  // Zeige Ladescreen während Auth-Status geprüft wird
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
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Back Button */}
        <Link href="/profile" passHref legacyBehavior>
          <Button
            variant="ghost"
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zum Profil"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="w-full max-w-md space-y-6 py-16">
          <h1 className="text-center text-2xl font-bold text-white">
            Profil bearbeiten
          </h1>

          {error && (
            <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" id="profile-form">
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium text-gray-200">
                Name
              </label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Dein Name"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="statusMessage" className="text-sm font-medium text-gray-200">
                Jasspruch
              </label>
              <Textarea
                id="statusMessage"
                value={statusMessage}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStatusMessage(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                placeholder="Dein persönlicher Jasspruch (optional)"
                maxLength={150}
              />
              <p className="text-xs text-gray-400">
                Der Jasspruch wird in deinem Profil angezeigt. Maximal 150 Zeichen.
              </p>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default EditProfilePage; 