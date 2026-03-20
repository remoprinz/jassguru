'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface LandingFooterProps {
  onInstall: () => void;
  onLogin: () => void;
}

const LandingFooter: React.FC<LandingFooterProps> = ({ onInstall, onLogin }) => {
  return (
    <footer className="bg-black border-t border-white/10">
      <div className="landing-container py-16">
        {/* 3-Spalten Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
          {/* Spalte 1: Ökosystem */}
          <div>
            <h4 className="font-headline text-white text-sm uppercase tracking-wider mb-4">
              Ökosystem
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://jassverband.ch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Jassverband Schweiz
                </a>
              </li>
              <li>
                <a
                  href="https://jasswiki.ch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  JassWiki
                </a>
              </li>
              <li>
                <a
                  href="https://jassverband.ch/de/schweizermeisterschaft"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Schweizermeisterschaft
                </a>
              </li>
            </ul>
          </div>

          {/* Spalte 2: App */}
          <div>
            <h4 className="font-headline text-white text-sm uppercase tracking-wider mb-4">
              App
            </h4>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={onInstall}
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  App installieren
                </button>
              </li>
              <li>
                <button
                  onClick={onLogin}
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Anmelden
                </button>
              </li>
              <li>
                <Link
                  href="/support"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Hilfe & Anleitungen
                </Link>
              </li>
            </ul>
          </div>

          {/* Spalte 3: Rechtliches */}
          <div>
            <h4 className="font-headline text-white text-sm uppercase tracking-wider mb-4">
              Rechtliches
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/impressum"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Impressum
                </Link>
              </li>
              <li>
                <Link
                  href="/datenschutz"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link
                  href="/agb"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  AGB
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Lebendige Traditionen */}
        <div className="border-t border-white/10 pt-8 flex flex-col items-center gap-4">
          <a
            href="https://www.lebendige-traditionen.ch/tradition/de/home/traditionen/jassen.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity w-full max-w-[160px]"
            aria-label="Lebendige Traditionen der Schweiz"
          >
            <Image
              src="/logo_lebendige_traditionen_weiss.png"
              alt="Jass ist als Lebendige Tradition anerkannt"
              width={320}
              height={160}
              className="w-full h-auto opacity-60"
            />
          </a>
          <p className="text-white/30 text-xs text-center">
            JassGuru — Ein Produkt des Jassverband Schweiz
          </p>
          <p className="text-white/20 text-xs">
            &copy; {new Date().getFullYear()} jassguru.ch — Alle Rechte
            vorbehalten
          </p>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
