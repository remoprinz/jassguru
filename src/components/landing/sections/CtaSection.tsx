'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface CtaSectionProps {
  onInstall: () => void;
  onLogin: () => void;
}

const CtaSection: React.FC<CtaSectionProps> = ({ onInstall, onLogin }) => {
  return (
    <section className="relative overflow-hidden">
      {/* Chalkboard-Hintergrund */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/backgrounds/chalkboard-jvs.webp"
          alt=""
          fill
          className="object-cover"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <div className="relative z-10 py-16 md:py-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2
            className="text-white mb-8"
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 42px)',
              lineHeight: 1.37,
              letterSpacing: '-0.96px',
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
          >
            Jetzt loslegen.
          </h2>

          <button
            onClick={onInstall}
            className="landing-cta-btn w-full sm:w-auto px-10 py-4 text-white font-bold rounded-full"
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

          <p className="mt-6 text-white/50 text-base">
            Bereits ein Konto?{' '}
            <button
              onClick={onLogin}
              className="text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              Anmelden
            </button>
          </p>

          {/* Trust Badge */}
          <p
            className="mt-8 text-white/50"
            style={{
              fontSize: 'clamp(13px, 1.2vw, 15px)',
              textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            Kostenlos · Ohne Werbung · In 30 Sekunden startklar
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default CtaSection;
