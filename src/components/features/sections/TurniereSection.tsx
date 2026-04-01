'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { FeatureBackground } from './FeatureBackground';
import { LandingPhoneFrame } from '@/components/landing/LandingPhoneFrame';

const TurniereSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden">
      <FeatureBackground type="chalkboard" />

      <div className="relative z-10 py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-x-16 lg:gap-y-4 items-center text-center lg:text-left">
          {/* Titel */}
          <motion.div
            className="lg:col-start-1 lg:row-start-1"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2
              className="text-white"
              style={{
                fontFamily: "'Capita', Georgia, serif",
                fontWeight: 700,
                fontSize: 'clamp(28px, 4vw, 38px)',
                lineHeight: 1.25,
                letterSpacing: '-0.96px',
                textShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              Turniere.
            </h2>
          </motion.div>

          {/* Phone */}
          <motion.div
            className="flex justify-center lg:col-start-2 lg:row-start-1 lg:row-span-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <LandingPhoneFrame>
              <Image
                src="/assets/screenshots/turnieransicht.webp"
                alt="Turnierübersicht"
                fill
                sizes="(max-width: 768px) 42vw, 240px"
                className="object-cover object-top"
              />
            </LandingPhoneFrame>
          </motion.div>

          {/* Link */}
          <motion.div
            className="lg:col-start-1 lg:row-start-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <a
              href="https://jassguru.ch/view/tournament/6RdW4o4PRv0UzsZWysex/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '15px',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Live-Beispiel: Turnierübersicht
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </motion.div>

          {/* Body */}
          <motion.div
            className="lg:col-start-1 lg:row-start-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <p
              className="text-white/80 max-w-md mx-auto lg:mx-0"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 'clamp(15px, 2vw, 18px)',
                lineHeight: 1.65,
                textShadow: '0 1px 6px rgba(0,0,0,0.3)',
              }}
            >
              Turniere haben ihre eigene Seite. Ranglisten werden live aktualisiert
              und Ergebnisse sind bis auf jede einzelne Passe abrufbar.
              Teile das Turnier per Link — jeder kann zuschauen.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TurniereSection;
