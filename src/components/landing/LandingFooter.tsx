'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface LandingFooterProps {
  onInstall: () => void;
  onLogin: () => void;
}

const headingStyle = {
  fontFamily: "'Capita', Georgia, serif",
  fontWeight: 700 as const,
  fontSize: '16px',
  color: 'rgba(255, 255, 255, 0.95)',
};

const linkStyle = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 400 as const,
  fontSize: '15px',
  color: 'rgba(255, 255, 255, 0.6)',
};

const fineStyle = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 400 as const,
  fontSize: '13px',
  color: 'rgba(255, 255, 255, 0.35)',
};

const LandingFooter: React.FC<LandingFooterProps> = ({ onInstall, onLogin }) => {
  return (
    <footer className="bg-black overflow-hidden">
      {/* Mobile Layout */}
      <div className="lg:hidden px-6 py-12">
        <div className="flex flex-col items-start gap-10">
          {/* Logo */}
          <Image
            src="/images/logos/jassguru-logo-weiss.png"
            alt="JassGuru"
            width={1152}
            height={252}
            className="h-10 w-auto"
          />

          {/* Grid */}
          <div className="grid w-full grid-cols-2 gap-8">
            {/* Ökosystem */}
            <div>
              <h4 className="mb-4" style={headingStyle}>Ökosystem</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="https://jassverband.ch" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Jassverband Schweiz
                  </a>
                </li>
                <li>
                  <a href="https://jasswiki.ch" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    JassWiki
                  </a>
                </li>
                <li>
                  <a href="https://jassverband.ch/de/schweizermeisterschaft" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Schweizermeisterschaft
                  </a>
                </li>
              </ul>
              <p className="mt-6" style={fineStyle}>
                &copy; {new Date().getFullYear()} jassguru.ch
              </p>
            </div>

            {/* App + Rechtliches */}
            <div>
              <h4 className="mb-4" style={headingStyle}>App</h4>
              <ul className="space-y-2.5">
                <li>
                  <button onClick={onInstall} className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    App installieren
                  </button>
                </li>
                <li>
                  <button onClick={onLogin} className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Anmelden
                  </button>
                </li>
                <li>
                  <Link href="/support" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Hilfe & Anleitungen
                  </Link>
                </li>
              </ul>
              <div className="mt-6">
                <h4 className="mb-4" style={headingStyle}>Rechtliches</h4>
                <ul className="space-y-2.5">
                  <li>
                    <Link href="/impressum" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                      Impressum
                    </Link>
                  </li>
                  <li>
                    <Link href="/datenschutz" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                      Datenschutz
                    </Link>
                  </li>
                  <li>
                    <Link href="/agb" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                      AGB
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:block relative" style={{ height: '390px' }}>
        <div className="max-w-[1152px] mx-auto px-20 h-full relative">
          {/* Logo — oben links */}
          <div className="absolute" style={{ top: '64px', left: '80px' }}>
            <Image
              src="/images/logos/jassguru-logo-weiss.png"
              alt="JassGuru"
              width={1152}
              height={252}
              className="h-11 w-auto"
            />
          </div>

          {/* Spalten — rechtsbündig */}
          <div className="flex justify-end" style={{ paddingTop: '64px', gap: '120px' }}>
            {/* Ökosystem */}
            <div className="flex flex-col" style={{ width: '180px', height: '260px' }}>
              <h4 className="mb-4" style={headingStyle}>Ökosystem</h4>
              <ul className="space-y-2">
                <li>
                  <a href="https://jassverband.ch" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Jassverband Schweiz
                  </a>
                </li>
                <li>
                  <a href="https://jasswiki.ch" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    JassWiki
                  </a>
                </li>
                <li>
                  <a href="https://jassverband.ch/de/schweizermeisterschaft" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Schweizermeisterschaft
                  </a>
                </li>
              </ul>
              <p className="mt-auto pt-8" style={fineStyle}>
                &copy; {new Date().getFullYear()} jassguru.ch
              </p>
            </div>

            {/* App */}
            <div style={{ width: '160px' }}>
              <h4 className="mb-4" style={headingStyle}>App</h4>
              <ul className="space-y-2">
                <li>
                  <button onClick={onInstall} className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    App installieren
                  </button>
                </li>
                <li>
                  <button onClick={onLogin} className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Anmelden
                  </button>
                </li>
                <li>
                  <Link href="/support" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Hilfe & Anleitungen
                  </Link>
                </li>
              </ul>
            </div>

            {/* Rechtliches */}
            <div style={{ width: '140px' }}>
              <h4 className="mb-4" style={headingStyle}>Rechtliches</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/impressum" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Impressum
                  </Link>
                </li>
                <li>
                  <Link href="/datenschutz" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    Datenschutz
                  </Link>
                </li>
                <li>
                  <Link href="/agb" className="transition-colors duration-200 hover:text-white" style={linkStyle}>
                    AGB
                  </Link>
                </li>
              </ul>
              <div className="mt-6">
                <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 400, fontSize: '14px', lineHeight: '1.7', color: 'rgba(255,255,255,0.4)' }}>
                  Hirslanderstrasse 34<br />8032 Zürich
                </p>
                <a href="mailto:info@jassverband.ch" className="inline-block mt-2 transition-colors duration-200 hover:text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 400, fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
                  info@jassverband.ch
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
