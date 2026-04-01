'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FeatureBackground } from './FeatureBackground';

interface FeaturesCtaProps {
  onRegister: () => void;
}

const FeaturesCta: React.FC<FeaturesCtaProps> = ({ onRegister }) => {
  return (
    <section className="relative overflow-hidden">
      <FeatureBackground type="wood" />

      <div className="relative z-10 py-20 md:py-28 px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-white mb-4"
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 42px)',
              lineHeight: 1.25,
              letterSpacing: '-0.96px',
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
          >
            Bereit für den ersten Jassabend?
          </h2>
          <p
            className="text-white/80 max-w-lg mx-auto mb-8"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              lineHeight: 1.6,
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            Werde Mitglied beim Jassverband Schweiz und nutze alle Features.
          </p>

          <button
            onClick={onRegister}
            className="landing-cta-btn inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-white"
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontSize: '17px',
              ['--landing-cta-bg' as string]: '#16a34a',
              ['--landing-cta-bg-hover' as string]: '#15803d',
              ['--landing-cta-shadow' as string]: '0 2px 8px rgba(22, 163, 74, 0.3)',
              ['--landing-cta-shadow-hover' as string]: '0 6px 18px rgba(22, 163, 74, 0.42)',
            }}
          >
            Jetzt registrieren
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
          <p
            className="text-white/40 text-xs mt-4"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
          >
            Für Mitglieder des Jassverbands Schweiz
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesCta;
