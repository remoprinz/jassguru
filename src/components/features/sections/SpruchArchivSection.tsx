'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { FeatureBackground } from './FeatureBackground';
import { LandingPhoneFrame } from '@/components/landing/LandingPhoneFrame';

const SpruchArchivSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden">
      <FeatureBackground type="chalkboard" />

      <div className="relative z-10 py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Phones (links) */}
          <motion.div
            className="flex justify-center gap-4 order-2 lg:order-1"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col items-center">
              <LandingPhoneFrame>
                <Image
                  src="/assets/screenshots/8c_Spruchgenerator.webp"
                  alt="Spruchgenerator"
                  fill
                  sizes="(max-width: 768px) 42vw, 200px"
                  className="object-cover object-top"
                />
              </LandingPhoneFrame>
              <p className="text-white/50 text-xs mt-3 text-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                Spruchgenerator
              </p>
            </div>
            <div className="flex flex-col items-center">
              <LandingPhoneFrame>
                <Image
                  src="/assets/screenshots/8d_Archiv.webp"
                  alt="Spielarchiv"
                  fill
                  sizes="(max-width: 768px) 42vw, 200px"
                  className="object-cover object-top"
                />
              </LandingPhoneFrame>
              <p className="text-white/50 text-xs mt-3 text-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                Archiv
              </p>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            className="order-1 lg:order-2"
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
                fontSize: 'clamp(28px, 4vw, 38px)',
                lineHeight: 1.25,
                letterSpacing: '-0.96px',
                textShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              Sprüche und Archiv
            </h2>
            <p
              className="text-white/80 max-w-md"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 'clamp(15px, 2vw, 18px)',
                lineHeight: 1.65,
                textShadow: '0 1px 6px rgba(0,0,0,0.3)',
              }}
            >
              Der KI-Spruchgenerator kommentiert jedes Spiel wie ein Sportreporter.
              Und im Archiv findest du jedes Spiel — für immer.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SpruchArchivSection;
