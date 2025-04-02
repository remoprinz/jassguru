'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export interface WelcomeScreenProps {
  onLogin?: () => void;
  onGuestPlay?: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
  onLogin, 
  onGuestPlay 
}) => {
  const router = useRouter();
  const { continueAsGuest } = useAuthStore();
  const [isClient, setIsClient] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  // Erst Rendering im Browser erlauben
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Die automatische Weiterleitung zu /start wurde entfernt
  // Stattdessen bleiben wir auf der Willkommensseite

  const handleGuestPlay = async () => {
    // Wenn bereits ein Ladevorgang läuft, nichts weiter tun
    if (isGuestLoading) return;
    
    // Ladeindikator setzen
    setIsGuestLoading(true);
    
    try {
      // Als Gast anmelden
      continueAsGuest();
      if (onGuestPlay) onGuestPlay();
      
      // Kurze Verzögerung für Animation und Verarbeitung
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Direkt zur Jass-Kreidetafel navigieren
      await router.push('/jass');
    } catch (error) {
      console.error('Fehler beim Navigieren zur Jass-Seite:', error);
    } finally {
      // Ladeindikator zurücksetzen (für den Fall, dass wir zum Screen zurückkehren)
      setIsGuestLoading(false);
    }
  };

  const handleLogin = () => {
    if (onLogin) onLogin();
    router.push('/auth/login');
  };

  if (!isClient) {
    return null; // Server-seitiges Rendering vermeiden
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-gray-800 rounded-xl p-8 shadow-2xl space-y-8"
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative w-36 h-36 mb-4">
            <Image
              src="/welcome-guru.png"
              alt="Jass Kreidetafel"
              layout="fill"
              objectFit="contain"
              priority
            />
          </div>
          
          <h1 className="text-3xl font-bold text-white text-center">
            Willkommen bei Jassguru
          </h1>
          
          <p className="text-gray-400 text-center">
          Melde dich an, um Gruppenstatistiken zu erfassen und weitere Funktionen zu nutzen. Oder spiele einfach als Gast.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleLogin}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-xl shadow-lg"
          >
            Anmelden
          </Button>
          
          <Button
            onClick={handleGuestPlay}
            disabled={isGuestLoading}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white h-14 text-lg rounded-xl shadow-lg"
          >
            {isGuestLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 
                Lade Spiel...
              </>
            ) : (
              "Als Gast spielen"
            )}
          </Button>
        </div>

        <div className="pt-4 text-center text-gray-500 text-sm">
          <p>Noch kein Konto?{' '}
            <Link href="/auth/register" className="text-blue-400 hover:underline">
              Jetzt registrieren
            </Link>
          </p>
        </div>
      </motion.div>
      
      <div className="mt-6 text-gray-500 text-sm text-center">
        &copy; {new Date().getFullYear()} jassguru.ch - Alle Rechte vorbehalten
      </div>
    </div>
  );
};

export default WelcomeScreen; 