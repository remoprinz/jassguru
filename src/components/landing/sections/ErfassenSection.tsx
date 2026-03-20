'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

/* ── Phone Frame ── */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-[min(42vw,240px)] overflow-hidden"
      style={{
        aspectRatio: '390 / 844',
        borderRadius: 'clamp(16px, 4vw, 32px)',
        border: 'clamp(3px, 0.6vw, 5px) solid #2a2a2a',
        backgroundColor: '#111',
        boxShadow:
          '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      {children}
    </div>
  );
}

const ErfassenSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Holztisch-Hintergrund */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/backgrounds/holztisch.webp"
          alt=""
          fill
          className="object-cover"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/25" />
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
          <h2
            className="text-white mb-4"
            style={{
              fontFamily: "'Capita', Georgia, serif",
              fontWeight: 700,
              fontSize: 'clamp(28px, 4.5vw, 42px)',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              textShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
          >
            Mehr Zeit für den nächsten Stich.
          </h2>
          <p
            className="text-white/75 max-w-lg mx-auto"
            style={{
              fontSize: 'clamp(15px, 1.8vw, 17px)',
              lineHeight: 1.65,
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            Schnell schreiben, einfach korrigieren — die digitale Tafel, die für
            dich mitdenkt.
          </p>
        </motion.div>

        {/* Zwei Phones nebeneinander */}
        <div className="grid grid-cols-2 gap-4 sm:gap-8 lg:gap-12 max-w-2xl mx-auto mb-10">
          {/* Phone 1: Kreidetafel */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0 }}
          >
            <PhoneFrame>
              <Image
                src="/assets/screenshots/3_Jasstafel.PNG"
                alt="Digitale Kreidetafel mit Z-Linie"
                fill
                className="object-cover object-center"
                unoptimized
              />
            </PhoneFrame>
            <p
              className="text-white/60 text-sm mt-3 sm:mt-4 text-center"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            >
              Kreidetafel
            </p>
          </motion.div>

          {/* Phone 2: Rechner */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <PhoneFrame>
              <Image
                src="/assets/screenshots/5_Kalkulator.PNG"
                alt="Punkterechner"
                fill
                className="object-cover object-top"
                unoptimized
              />
            </PhoneFrame>
            <p
              className="text-white/60 text-sm mt-3 sm:mt-4 text-center"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            >
              Rechner
            </p>
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
            href="/features/"
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
            Features anschauen
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
        </motion.div>
      </div>
    </section>
  );
};

export default ErfassenSection;
