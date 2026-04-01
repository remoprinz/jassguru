'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FeatureBackground } from './FeatureBackground';
import { LandingPhoneFrame } from '@/components/landing/LandingPhoneFrame';
import PhoneVideo from '@/components/features/PhoneVideo';

const RundenSection: React.FC = () => (
  <section className="relative overflow-hidden">
    <FeatureBackground type="wood" />
    <div className="relative z-10 py-16 md:py-24 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-x-16 lg:gap-y-4 items-center text-center lg:text-left">
        {/* Titel */}
        <motion.div className="lg:col-start-1 lg:row-start-1" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h2 className="text-white" style={{ fontFamily: "'Capita', Georgia, serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 38px)', lineHeight: 1.25, letterSpacing: '-0.96px', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            Resultat und Rundenverlauf
          </h2>
        </motion.div>

        {/* Phone */}
        <motion.div className="flex justify-center lg:col-start-2 lg:row-start-1 lg:row-span-2" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
          <LandingPhoneFrame>
            <PhoneVideo src="/assets/videos/rundenverlauf.mp4" />
          </LandingPhoneFrame>
        </motion.div>

        {/* Body */}
        <motion.div className="lg:col-start-1 lg:row-start-2" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
          <p className="text-white/80 max-w-md mx-auto lg:mx-0" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.65, textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
            Das Endergebnis ist sauber aufbereitet und archiviert.
            Am Ende entscheidest du: Noch ein Spiel anhängen oder den Jass beenden.
          </p>
        </motion.div>
      </div>
    </div>
  </section>
);

export default RundenSection;
