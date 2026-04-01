'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FeatureBackground } from './FeatureBackground';

const STEPS = [
  { title: 'Gruppe erstellen', desc: 'Erstelle deine Jassgruppe und wähle einen Namen.', link: '/support/gruppe_erstellen' },
  { title: 'Freunde einladen', desc: 'Teile den Einladungslink per WhatsApp, E-Mail oder QR-Code.', link: '/support/gruppe_einladen' },
  { title: 'Regeln festlegen', desc: 'Kartensatz, Farben und Multiplikatoren — ganz nach euren Hausregeln.', link: '/support/gruppe_verwalten' },
  { title: 'Profil einrichten', desc: 'Name, Jasspruch und Kartenstil — dein persönliches Profil.', link: '/support/profil_bearbeiten' },
];

const ErsteSchritteSection: React.FC = () => (
  <section className="relative overflow-hidden">
    <FeatureBackground type="chalkboard" />
    <div className="relative z-10 py-16 md:py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div className="text-center mb-10" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h2 className="text-white mb-4" style={{ fontFamily: "'Capita', Georgia, serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 38px)', lineHeight: 1.25, letterSpacing: '-0.96px', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            In vier Schritten startklar
          </h2>
          <p className="text-white/70 max-w-lg mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.6, textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
            Von der Registrierung bis zum ersten Strich.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STEPS.map((step, i) => (
            <motion.div key={step.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}>
              <Link
                href={step.link}
                className="block p-5 rounded-xl transition-all duration-200 hover:scale-[1.02]"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <p className="text-white/40 text-xs mb-1" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                  Schritt {i + 1}
                </p>
                <h3 className="text-white mb-1.5" style={{ fontFamily: "'Capita', Georgia, serif", fontWeight: 700, fontSize: '17px' }}>
                  {step.title}
                </h3>
                <p className="text-white/55 text-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1.5 }}>
                  {step.desc}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div className="text-center mt-8" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}>
          <Link
            href="/support/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '15px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Alle Hilfe-Artikel anzeigen
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </div>
  </section>
);

export default ErsteSchritteSection;
