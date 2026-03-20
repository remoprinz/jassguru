'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Smartphone, Gamepad2, Users } from 'lucide-react';

const HILFE_CARDS = [
  {
    icon: Smartphone,
    title: 'In 30 Sekunden startklar',
    text: 'iOS oder Android — wir zeigen dir genau, wie\u2019s geht.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Gamepad2,
    title: 'Schritt für Schritt zum ersten Jass',
    text: 'Von der Gruppe bis zur ersten Punkteeingabe.',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Users,
    title: 'Einladen und losspielen',
    text: 'Deine Jassgruppe in weniger als zwei Minuten einrichten.',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
];

const HilfeSection: React.FC = () => {
  return (
    <section className="bg-white landing-section">
      <div className="landing-container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h2
              className="font-headline text-black mb-4"
              style={{
                fontSize: 'clamp(28px, 4.5vw, 42px)',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Fragen? Wir haben Antworten.
            </h2>
            <p
              className="text-[var(--jvs-foreground-muted)] max-w-2xl mx-auto"
              style={{ fontSize: 'clamp(15px, 1.8vw, 17px)', lineHeight: 1.65 }}
            >
              JassGuru kommt mit einem vollständigen Hilfe-Bereich: bebilderte
              Schritt-für-Schritt-Anleitungen, FAQ und intelligente Suche. Du
              brauchst wahrscheinlich keine Anleitung — aber es ist gut zu
              wissen, dass sie da ist.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {HILFE_CARDS.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{ y: -4, boxShadow: 'var(--jvs-shadow-card-hover)' }}
                className="bg-[var(--jvs-cream)] rounded-2xl p-6 text-center transition-shadow"
                style={{ boxShadow: 'var(--jvs-shadow-card)' }}
              >
                <div
                  className={`w-14 h-14 ${card.bgColor} rounded-xl flex items-center justify-center mx-auto mb-4`}
                >
                  <card.icon className={`w-7 h-7 ${card.color}`} />
                </div>
                <h3 className="font-headline text-black text-lg mb-2">
                  {card.title}
                </h3>
                <p className="text-[var(--jvs-foreground-muted)] text-sm leading-relaxed">
                  {card.text}
                </p>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/support"
              className="landing-cta-btn inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-full"
              style={{
                ['--landing-cta-bg' as string]: '#111111',
                ['--landing-cta-bg-hover' as string]: '#1f1f1f',
                ['--landing-cta-shadow' as string]: '0 2px 8px rgba(0, 0, 0, 0.28)',
                ['--landing-cta-shadow-hover' as string]: '0 6px 18px rgba(0, 0, 0, 0.36)',
              }}
            >
              Alle Anleitungen ansehen
              <span>→</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HilfeSection;
