'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Network, Landmark } from 'lucide-react';

const TRUST_ELEMENTS = [
  {
    icon: Building2,
    title: 'Offiziell vom Verband',
    text: 'Entwickelt und betrieben vom Jassverband Schweiz',
  },
  {
    icon: Network,
    title: 'Vernetztes Ökosystem',
    text: 'Verbunden mit JassWiki, Schweizermeisterschaft und Community',
  },
  {
    icon: Landmark,
    title: 'Jass als Kulturgut',
    text: 'Digitale Werkzeuge für eine lebendige Tradition',
  },
];

const LINKS = [
  { href: 'https://jassverband.ch', label: 'jassverband.ch' },
  { href: 'https://jasswiki.ch', label: 'jasswiki.ch' },
  {
    href: 'https://jassverband.ch/de/schweizermeisterschaft',
    label: 'Schweizermeisterschaft',
  },
];

const VerbandSection: React.FC = () => {
  return (
    <section className="landing-felt relative">
      <div className="landing-container landing-section relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h2
              className="font-headline text-white mb-6"
              style={{
                fontSize: 'clamp(28px, 4.5vw, 42px)',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Teil des Jassverband Schweiz
            </h2>
            <p
              className="text-white/70 max-w-2xl mx-auto"
              style={{ fontSize: 'clamp(15px, 1.8vw, 17px)', lineHeight: 1.65 }}
            >
              Der Jassverband Schweiz pflegt und modernisiert den Jass als
              Schweizer Kulturgut. JassGuru ist das digitale Herzstück: die App,
              mit der Jassgruppen in der ganzen Schweiz ihre Partien erfassen,
              sich vergleichen und Teil einer nationalen Jass-Community werden.
            </p>
          </div>

          {/* Trust Elements */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {TRUST_ELEMENTS.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-6 text-center"
              >
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-white/80" />
                </div>
                <h3 className="font-headline text-white text-lg mb-2">
                  {item.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {item.text}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white text-sm font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white/60 transition-colors"
              >
                {link.label} →
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default VerbandSection;
