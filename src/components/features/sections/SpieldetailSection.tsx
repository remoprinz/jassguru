'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { FeatureBackground } from './FeatureBackground';
import { LandingPhoneFrame } from '@/components/landing/LandingPhoneFrame';

const SpieldetailSection: React.FC = () => (
  <section className="relative overflow-hidden">
    <FeatureBackground type="chalkboard" />
    <div className="relative z-10 py-16 md:py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div className="text-center mb-10 md:mb-14" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h2 className="text-white mb-4" style={{ fontFamily: "'Capita', Georgia, serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 38px)', lineHeight: 1.25, letterSpacing: '-0.96px', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            Jede Runde nachvollziehbar
          </h2>
          <p className="text-white/80 max-w-2xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.65, textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
            Jedes Spiel ist bis auf jede einzelne Runde dokumentiert — Trumpf, Punkte, Wer hat geschoben?
            Alles gespeichert, alles abrufbar.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 sm:gap-8 lg:gap-12 max-w-2xl mx-auto">
          <motion.div className="flex flex-col items-center" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0 }}>
            <LandingPhoneFrame>
              <Image src="/assets/screenshots/spieluebersicht_striche.webp" alt="Spielübersicht mit Strichen" fill sizes="(max-width: 768px) 42vw, 240px" className="object-cover object-top" />
            </LandingPhoneFrame>
            <p className="text-white/50 text-xs mt-3 text-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Striche und Ergebnis
            </p>
          </motion.div>
          <motion.div className="flex flex-col items-center" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
            <LandingPhoneFrame>
              <Image src="/assets/screenshots/rundenuebersicht_fullscreen.webp" alt="Rundenübersicht" fill sizes="(max-width: 768px) 42vw, 240px" className="object-cover object-top" />
            </LandingPhoneFrame>
            <p className="text-white/50 text-xs mt-3 text-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Rundendetail
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  </section>
);

export default SpieldetailSection;
