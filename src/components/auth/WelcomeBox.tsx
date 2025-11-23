'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Users, User } from 'lucide-react';
import { isPWA } from '@/utils/browserDetection';

interface WelcomeBoxProps {
  displayMode: 'default' | 'invite' | 'pwa';
  isGuestLoading: boolean;
  onRegister: (e?: React.MouseEvent) => void;
  onLogin: (e?: React.MouseEvent) => void;
  onGuestPlay: () => void;
}

const WelcomeBox: React.FC<WelcomeBoxProps> = ({
  displayMode,
  isGuestLoading,
  onRegister,
  onLogin,
  onGuestPlay,
}) => {
  const router = useRouter();
  const isInBrowser = !isPWA(); // Im Browser (nicht in PWA)
  
  // Handler für "App herunterladen" Button (nur im Browser)
  const handleAppDownload = () => {
    router.push('/onboarding_tutorial');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full space-y-6"
    >
      {/* Logo & Branding - PERFEKTE TYPO-HARMONIE! */}
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="relative w-32 h-32">
          <Image
            src="/welcome-guru.png"
            alt="Jassguru Logo"
            fill={true}
            className="object-contain"
            priority
          />
        </div>

        <h1 className="text-4xl font-bold text-white text-center">
          Jassen ist der einzige Sport ohne Rangliste
        </h1>

        {/* HERO-TEXT: Harmonische Abstände! */}
        <p className="text-base text-gray-300 text-center leading-relaxed max-w-xl pt-4 pb-4">
          {displayMode === 'pwa' ? (
            'Von Jassern für Jasser.'
          ) : (
            'Jassguru ändert das. Wir erfassen deine Spiele digital und liefern Profi-Statistiken, damit du deinen Kopf frei hast fürs Kartenzählen – und endlich klar ist, wer nicht nur Schnorren, sondern auch Jassen kann.'
          )}
        </p>
      </div>

      {/* Description - FLIEßTEXT! */}
      <div className="text-gray-300 text-center space-y-4">
        {displayMode === 'pwa' ? (
          <div className="text-left space-y-3">
            <p className="text-base">
              Bereit für den nächsten Jass mit deinen Freunden? Jetzt anmelden und losjassen.
            </p>
            <p className="text-base">
              <strong className="text-white">Tipp:</strong> Alle Mitspieler können sich simultan einloggen.
            </p>
            <p className="text-base">
              <strong className="text-white">Neu hier?</strong> Als Gast spielen und die Jasstafel kennenlernen.
            </p>
          </div>
        ) : (
          <div className="text-left space-y-4">
            <div>
              <strong className="text-white block mb-3 text-base">
                Sieh selbst, was du kriegst:
              </strong>

              <div className="space-y-3 text-base">
                <a
                  href="https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <Users className="w-5 h-5 flex-shrink-0" />
                  <span>Die ewige Gruppen-Rangliste</span>
                </a>

                <a
                  href="https://jassguru.ch/profile/b16c1120111b7d9e7d733837"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <User className="w-5 h-5 flex-shrink-0" />
                  <span>Profil & Bestleistungen</span>
                </a>

                <Link
                  href="/features"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <Eye className="w-5 h-5 flex-shrink-0" />
                  <span>Die interaktive Feature-Tour</span>
                </Link>

                <a
                  href="https://chatgpt.com/g/g-69219897884881918763e35fccae748e-jassguru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <span className="text-xl">💬</span>
                  <span>Frag den Jass-Guru (ChatGPT App)</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA Buttons - GLEICHER ABSTAND WIE ZWISCHEN FLIESSTEXT UND LINKS! */}
      <div className="space-y-3">
        {displayMode === 'invite' || displayMode === 'pwa' ? (
          <Button
            onClick={onLogin}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-xl rounded-xl shadow-lg font-semibold transition-transform hover:scale-105"
          >
            Anmelden
          </Button>
        ) : (
          <Button
            onClick={onRegister}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-xl rounded-xl shadow-lg font-semibold transition-transform hover:scale-105"
          >
            Registrieren
          </Button>
        )}

        {displayMode === 'invite' ? (
          <Button
            onClick={onRegister}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 text-xl rounded-xl shadow-lg font-semibold transition-transform hover:scale-105"
          >
            Registrieren
          </Button>
        ) : (
          <Button
            onClick={isInBrowser ? handleAppDownload : onGuestPlay}
            disabled={isGuestLoading}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white h-14 text-xl rounded-xl shadow-lg font-semibold transition-transform hover:scale-105"
          >
            {isGuestLoading ? (
              <>
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Jasstafel laden...
              </>
            ) : (
              isInBrowser ? (
                "App herunterladen"
              ) : (
                "Als Gast spielen"
              )
            )}
          </Button>
        )}
      </div>

      {/* Login/Register Link - HARMONISCHER ABSTAND! */}
      <div className="pt-2 text-center text-gray-400 text-lg">
        {displayMode === 'invite' || displayMode === 'pwa' ? (
          <p>
            Noch kein Konto?{' '}
            <a
              onClick={onRegister}
              href="#"
              className="text-blue-400 hover:underline cursor-pointer font-medium"
            >
              Jetzt registrieren
            </a>
          </p>
        ) : (
          <p>
            Bereits ein Konto?{' '}
            <a
              onClick={onLogin}
              href="#"
              className="text-blue-400 hover:underline cursor-pointer font-medium"
            >
              Jetzt anmelden
            </a>
          </p>
        )}
      </div>

      {/* Divider and Link to Knowledge Hub */}
      <div className="pt-8 mt-8 border-t border-gray-700/50">
        {displayMode === 'pwa' ? (
          <Link
            href="https://jasswiki.ch/"
            target="_blank"
            rel="noopener noreferrer"
            className="group block text-center transition-transform hover:scale-105"
          >
            <span className="text-2xl font-semibold text-gray-200 group-hover:text-green-400 transition-colors">
              Jass-Wikipedia
            </span>
            <p className="text-lg text-gray-400 group-hover:text-gray-300 transition-colors mt-2">
              Regeln, Strategien & mehr →
            </p>
          </Link>
        ) : (
          <a
            href="https://jasswiki.ch"
            target="_blank"
            rel="noopener noreferrer"
            className="group block text-center transition-transform hover:scale-105"
          >
            <span className="text-2xl font-semibold text-gray-200 group-hover:text-green-400 transition-colors">
              Jass-Wikipedia
            </span>
            <p className="text-lg text-gray-400 group-hover:text-gray-300 transition-colors mt-2">
              Regeln, Strategien & mehr →
            </p>
          </a>
        )}
      </div>
    </motion.div>
  );
};

export default WelcomeBox;

