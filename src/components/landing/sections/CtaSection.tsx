'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CtaSectionProps {
  onInstall: () => void;
  onLogin: () => void;
}

const CtaSection: React.FC<CtaSectionProps> = ({ onInstall, onLogin }) => {
  return (
    <section className="landing-chalkboard relative">
      <div className="landing-container landing-section relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h2
            className="font-headline text-white mb-8"
            style={{
              fontSize: 'clamp(28px, 4.5vw, 42px)',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}
          >
            Bereit für den ersten Jass?
          </h2>

          <button
            onClick={onInstall}
            className="landing-cta-btn w-full sm:w-auto px-10 py-4 text-white text-lg font-semibold rounded-full"
            style={{
              minWidth: '220px',
              ['--landing-cta-bg' as string]: '#16a34a',
              ['--landing-cta-bg-hover' as string]: '#15803d',
              ['--landing-cta-shadow' as string]: '0 2px 8px rgba(22, 163, 74, 0.3)',
              ['--landing-cta-shadow-hover' as string]: '0 6px 18px rgba(22, 163, 74, 0.42)',
            }}
          >
            App installieren
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
          <p className="mt-8 text-white/40 text-sm">
            Die Jasstafel ist kostenlos · Keine Werbung
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default CtaSection;
