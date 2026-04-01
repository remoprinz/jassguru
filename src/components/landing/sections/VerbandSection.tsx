'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const VerbandSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Felt-Hintergrund (gleich wie Hero) */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/backgrounds/felt-figma.webp"
          alt=""
          fill
          className="object-cover"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div className="relative z-10 py-16 md:py-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
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
            Vom Jassverband Schweiz.
          </h2>
          <p
            className="text-white/80 max-w-2xl mx-auto mb-10"
            style={{
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              lineHeight: 1.6,
              textShadow: '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            JassGuru ist das offizielle digitale Werkzeug des Jassverbands —
            entwickelt für Jassgruppen in der ganzen Schweiz.
          </p>

          {/* JVS Logo */}
          <motion.a
            href="https://jassverband.ch"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Image
              src="/images/logos/jvs-logo-farbig-weiss-kurz.svg"
              alt="Jassverband Schweiz"
              width={190}
              height={82}
              className="w-auto h-auto max-w-[120px] sm:max-w-[140px] mx-auto opacity-90"
            />
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
};

export default VerbandSection;
