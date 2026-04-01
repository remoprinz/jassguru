'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { LandingPhoneFrame } from '@/components/landing/LandingPhoneFrame';

const ProSection: React.FC = () => {
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
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div className="relative z-10 py-16 md:py-24 px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 md:mb-14"
        >
          <p
            className="text-white/60 uppercase tracking-widest mb-3"
            style={{
              fontSize: 'clamp(12px, 1.2vw, 14px)',
              letterSpacing: '0.15em',
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            JassGuru <span style={{ color: '#facc15' }}>Pro</span>
          </p>
          <h2
            className="text-white mb-4"
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'clamp(32px, 5vw, 42px)',
              lineHeight: 1.37,
              letterSpacing: '-0.96px',
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
          >
            Wie gut jasst du wirklich?
          </h2>
          <p
            className="text-white/80 max-w-2xl mx-auto"
            style={{
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              lineHeight: 1.6,
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            Elo-Rating, ewige Rangliste und dein persönliches Jass-Profil — exklusiv für Mitglieder.
          </p>
        </motion.div>

        {/* Zwei Phones nebeneinander */}
        <div className="grid grid-cols-2 gap-4 sm:gap-8 lg:gap-12 max-w-2xl mx-auto mb-10">
          {/* Phone 1: Rangliste */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0 }}
          >
            <LandingPhoneFrame>
              <Image
                src="/assets/screenshots/gruppenview.webp"
                alt="Ewige Gruppen-Rangliste"
                fill
                sizes="(max-width: 768px) 42vw, 240px"
                className="object-cover object-top"
              />
            </LandingPhoneFrame>
            <div className="mt-3 sm:mt-4 text-center">
              <p
                className="text-white/90 text-base sm:text-lg font-semibold"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
              >
                Live-Beispiel:
              </p>
              <a
                href="https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-white text-sm sm:text-base underline underline-offset-2 hover:text-white/85 transition-colors"
              >
                Gruppenansicht
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          </motion.div>

          {/* Phone 2: Profil */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <LandingPhoneFrame>
              <Image
                src="/assets/screenshots/profilview.webp"
                alt="Spielerprofil mit Elo-Rating"
                fill
                sizes="(max-width: 768px) 42vw, 240px"
                className="object-cover object-top"
              />
            </LandingPhoneFrame>
            <div className="mt-3 sm:mt-4 text-center">
              <p
                className="text-white/90 text-base sm:text-lg font-semibold"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
              >
                Live-Beispiel:
              </p>
              <a
                href="https://jassguru.ch/profile/b16c1120111b7d9e7d733837"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-white text-sm sm:text-base underline underline-offset-2 hover:text-white/85 transition-colors"
              >
                Spielerprofil
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Link
            href="/auth/register"
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
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
          <p
            className="text-white/40 text-xs mt-4"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
          >
            Für Mitglieder des Jassverbands Schweiz
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default ProSection;
