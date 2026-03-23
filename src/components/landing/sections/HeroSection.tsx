'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface HeroSectionProps {
  onInstall: () => void;
  onLogin: () => void;
}

/* ── Jass-Karten ───────────────────────────────────────────── */
const DE_CARDS = Array.from({ length: 10 }, (_, i) => `/cards/de/card-${String(i + 1).padStart(2, '0')}.png`);
const FR_CARDS = Array.from({ length: 11 }, (_, i) => `/cards/fr/card-${String(i + 1).padStart(2, '0')}.png`);

function pickRandomCards() {
  const all = [...DE_CARDS, ...FR_CARDS].sort(() => Math.random() - 0.5);
  return { desktop: all.slice(0, 4), mobile: all.slice(4, 8) };
}

function randomEntry(side: 'left' | 'right') {
  const angle = Math.random() * 360;
  const rad = (angle * Math.PI) / 180;
  const dist = 70 + Math.random() * 30;
  return {
    x: `${side === 'left' ? -Math.abs(Math.cos(rad) * dist) : Math.abs(Math.cos(rad) * dist)}vw`,
    y: `${Math.sin(rad) * dist}vh`,
    rotate: (Math.random() > 0.5 ? 1 : -1) * (200 + Math.random() * 300),
  };
}

/* ── Desktop-Karten-Positionen (aus JVS Figma) ────────────── */
const DESKTOP_POSITIONS = [
  { side: 'left' as const, style: { left: 'calc(var(--hero-felt-left) + 4.9%)', top: '46.3%', width: '11%' }, rot: 15.8, delay: 0.2 },
  { side: 'left' as const, style: { left: 'calc(var(--hero-felt-left) + 11.3%)', top: '63.4%', width: '11%' }, rot: -27.35, delay: 0.35 },
  { side: 'right' as const, style: { right: 'calc(100% - (var(--hero-felt-left) + var(--hero-felt-width)) + 4.9%)', top: '48.9%', width: '11%' }, rot: -16.19, delay: 0.25 },
  { side: 'right' as const, style: { right: 'calc(100% - (var(--hero-felt-left) + var(--hero-felt-width)) + 11.3%)', top: '65%', width: '11%' }, rot: 8.34, delay: 0.4 },
];

const MOBILE_POSITIONS = [
  { side: 'left' as const, style: { left: '3%', top: '55%', width: '22%' }, rot: 12, delay: 0.3 },
  { side: 'left' as const, style: { left: '18%', top: '62%', width: '22%' }, rot: -20, delay: 0.45 },
  { side: 'right' as const, style: { right: '3%', top: '55%', width: '22%' }, rot: -14, delay: 0.35 },
  { side: 'right' as const, style: { right: '18%', top: '62%', width: '22%' }, rot: 8, delay: 0.5 },
];

const HeroSection: React.FC<HeroSectionProps> = ({ onInstall, onLogin }) => {
  const [mounted, setMounted] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const f1 = requestAnimationFrame(() => {
      setMounted(true);
      requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(f1);
  }, []);

  const cards = useMemo(() => {
    if (!mounted) return null;
    const { desktop, mobile } = pickRandomCards();
    return {
      desktop: desktop.map((src, i) => ({ src, entry: randomEntry(DESKTOP_POSITIONS[i].side) })),
      mobile: mobile.map((src, i) => ({ src, entry: randomEntry(MOBILE_POSITIONS[i].side) })),
    };
  }, [mounted]);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height: '100vh', minHeight: '520px' }}
    >
      {/* FILZ — full bleed */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/backgrounds/felt-figma.webp"
          alt="Jassteppich"
          fill
          className="object-cover"
          priority
          quality={75}
        />
      </div>

      {/* HOLZRAHMEN — äusserer Container mit Holztextur */}
      <div
        className="absolute z-[1] overflow-hidden"
        style={{
          left: 'var(--hero-felt-left)',
          top: 'var(--hero-felt-top)',
          width: 'var(--hero-felt-width)',
          height: 'var(--hero-felt-height)',
          borderRadius: 'var(--hero-felt-radius)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Holztextur als Rahmen-Hintergrund */}
        <Image
          src="/images/backgrounds/holztisch.webp"
          alt=""
          fill
          priority
          className="object-cover"
          aria-hidden="true"
        />

        {/* Holz-Inset-Shadow für 3D-Tiefe */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            borderRadius: 'inherit',
            boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.4), inset 0 -2px 8px rgba(0,0,0,0.2), inset 4px 0 12px rgba(0,0,0,0.15), inset -4px 0 12px rgba(0,0,0,0.15)',
          }}
        />

        {/* KREIDETAFEL — innerer Bereich */}
        <div
          className="absolute z-[2] overflow-hidden"
          style={{
            inset: 'clamp(18px, 3.5vw, 44px)',
            borderRadius: 'clamp(4px, 0.8vw, 10px)',
          }}
        >
          <Image
            src="/images/backgrounds/chalkboard-jvs.webp"
            alt="Kreidetafel"
            fill
            priority
            className="object-cover"
          />
          {/* Kreide-Inset-Shadow */}
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            style={{
              borderRadius: 'inherit',
              boxShadow: 'inset 0 3px 12px rgba(0,0,0,0.6), inset 0 -2px 6px rgba(0,0,0,0.3), inset 3px 0 8px rgba(0,0,0,0.2), inset -3px 0 8px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      </div>

      {/* ── DESKTOP KARTEN ─────────────────────────────────────── */}
      {cards?.desktop.map((card, i) => (
        <motion.div
          key={`d-${i}`}
          className="absolute z-10 hidden lg:block"
          style={DESKTOP_POSITIONS[i].style}
          initial={{ opacity: 0, ...card.entry }}
          animate={animate ? { opacity: 1, x: 0, y: 0, rotate: DESKTOP_POSITIONS[i].rot } : undefined}
          transition={{ duration: 0.7, delay: DESKTOP_POSITIONS[i].delay, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Image
            src={card.src}
            alt="Jasskarte"
            width={159}
            height={250}
            className="w-full h-auto"
            style={{ borderRadius: '14px', filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.4))' }}
          />
        </motion.div>
      ))}

      {/* ── MOBILE KARTEN ──────────────────────────────────────── */}
      {cards?.mobile.map((card, i) => (
        <motion.div
          key={`m-${i}`}
          className="absolute z-10 lg:hidden"
          style={MOBILE_POSITIONS[i].style}
          initial={{ opacity: 0, ...card.entry }}
          animate={animate ? { opacity: 1, x: 0, y: 0, rotate: MOBILE_POSITIONS[i].rot } : undefined}
          transition={{ duration: 0.7, delay: MOBILE_POSITIONS[i].delay, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Image
            src={card.src}
            alt="Jasskarte"
            width={159}
            height={250}
            className="w-full h-auto"
            style={{ borderRadius: '6px', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }}
          />
        </motion.div>
      ))}

      {/* ── Figur → H1 → Sub → CTA (eine Spalte, kein Überlappen) ─ */}
      <div
        className="absolute z-20 left-0 right-0 flex flex-col items-center gap-4 sm:gap-5 md:gap-6 lg:gap-5 px-4 pointer-events-none [&_.hero-cta-stack]:pointer-events-auto"
        style={{ top: 'var(--hero-stack-top)' }}
      >
        <motion.div
          className="flex shrink-0 justify-center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          <Image
            src="/welcome-guru.png"
            alt="JassGuru"
            width={160}
            height={160}
            className="object-contain drop-shadow-lg h-auto w-auto max-h-[20vh] sm:max-h-[22vh] md:max-h-[24vh] lg:max-h-[26vh]"
            style={{ maxWidth: 'var(--hero-logo-max-width)' }}
          />
        </motion.div>

        <motion.div
          className="flex w-full justify-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
        >
          <h1
            style={{
              textAlign: 'center',
              maxWidth: 'var(--hero-title-max-width)',
              width: '90%',
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'var(--hero-title-size)',
              lineHeight: 'var(--hero-title-line-height)',
              letterSpacing: '-0.96px',
              color: '#ffffff',
              textShadow: '0 2px 20px rgba(0,0,0,0.3)',
            }}
          >
            Die offizielle Jass-App{'\n'}der Schweiz
          </h1>
        </motion.div>

        <motion.div
          className="flex w-full justify-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p
            style={{
              textAlign: 'center',
              maxWidth: 'var(--hero-subtitle-max-width)',
              width: 'var(--hero-subtitle-width)',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 400,
              fontSize: 'var(--hero-subtitle-size)',
              lineHeight: 1.45,
              color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 8px rgba(0,0,0,0.2)',
            }}
          >
            Jasstafel, Rangliste, Profil und Turniere — alles was deine
            Jassgruppe braucht.
          </p>
        </motion.div>

        <motion.div
          className="hero-cta-stack flex w-full flex-col items-center gap-5"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
        >
          <button
            onClick={onInstall}
            className="landing-cta-btn px-8 py-4 text-white font-bold rounded-full whitespace-nowrap"
            style={{
              fontSize: '17px',
              ['--landing-cta-bg' as string]: '#16a34a',
              ['--landing-cta-bg-hover' as string]: '#15803d',
              ['--landing-cta-shadow' as string]: '0 2px 8px rgba(22, 163, 74, 0.3)',
              ['--landing-cta-shadow-hover' as string]: '0 6px 18px rgba(22, 163, 74, 0.42)',
            }}
          >
            App installieren
            <svg className="w-5 h-5 ml-2 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
          <button
            onClick={onLogin}
            className="text-white/60 hover:text-white text-sm transition-colors underline underline-offset-2"
          >
            Bereits ein Konto? Anmelden
          </button>
        </motion.div>
      </div>

      {/* ── SCROLL INDICATOR ───────────────────────────────────── */}
      <motion.div
        className="absolute z-20 left-1/2 -translate-x-1/2 cursor-pointer"
        style={{ bottom: '4%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 8, 0] }}
        transition={{ delay: 1.5, duration: 2, repeat: Infinity }}
        onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
      >
        <img
          src="/images/icons/pfeil_unten_weiss.svg"
          alt=""
          width={24}
          height={28}
          className="opacity-80"
          aria-hidden="true"
        />
      </motion.div>
    </section>
  );
};

export default HeroSection;
