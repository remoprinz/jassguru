'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Users, User } from 'lucide-react';

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
          jassguru.ch
        </h1>

        {/* HERO-TEXT: Harmonische Abstände! */}
        <h2 className="text-2xl text-gray-100 text-center font-semibold leading-snug max-w-xl pt-4 pb-4">
          {displayMode === 'pwa' ? (
            'Von Jassern für Jasser.'
          ) : (
            'Die Jasstafel, die automatisch rechnet, Statistiken führt und nie einen Punkt vergisst.'
          )}
        </h2>
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
            <p className="text-base leading-relaxed">
              Erstelle dein Profil, gründe eine Gruppe oder trete einer bei. 
              Jassen war noch nie so schnell, smart und vernetzt.
            </p>

            <div>
              <strong className="text-white block mb-3 text-base">
                Schau dir an, wie es funktioniert:
              </strong>

              <div className="space-y-3 text-base">
                <Link
                  href="/features"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <Eye className="w-5 h-5 flex-shrink-0" />
                  <span>Interaktive Feature-Tour</span>
                </Link>

                <a
                  href="https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <Users className="w-5 h-5 flex-shrink-0" />
                  <span>Jassgruppe ansehen</span>
                </a>

                <a
                  href="https://jassguru.ch/profile/b16c1120111b7d9e7d733837"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  <User className="w-5 h-5 flex-shrink-0" />
                  <span>Jassprofil ansehen</span>
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
            onClick={onGuestPlay}
            disabled={isGuestLoading}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white h-14 text-xl rounded-xl shadow-lg font-semibold transition-transform hover:scale-105"
          >
            {isGuestLoading ? (
              <>
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Jasstafel laden...
              </>
            ) : (
              <>
                <span className="hidden lg:inline">App herunterladen</span>
                <span className="lg:hidden">Als Gast spielen</span>
              </>
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
        <Link
          href="/wissen"
          className="group block text-center transition-transform hover:scale-105"
        >
          <span className="text-2xl font-semibold text-gray-200 group-hover:text-green-400 transition-colors">
            Das Schweizer Jass-Lexikon
          </span>
          <p className="text-lg text-gray-400 group-hover:text-gray-300 transition-colors mt-2">
            Regeln, Strategien & mehr →
          </p>
        </Link>
      </div>
    </motion.div>
  );
};

export default WelcomeBox;

