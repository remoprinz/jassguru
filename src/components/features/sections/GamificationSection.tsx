'use client';

import React, { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { FeatureBackground } from './FeatureBackground';

/* Konfetti-Trigger — werden bei jedem Intervall-Tick gefeuert */
function fireMatsch() {
  const colors = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#800080'];
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  angles.forEach((angle) => {
    confetti({
      particleCount: 15,
      angle,
      spread: 35,
      origin: { x: 0.5, y: 0.55 },
      colors,
      gravity: 1.2,
      scalar: 0.8,
      ticks: 200,
    });
  });
}

function fireBerg() {
  const colors = ['#FFD700', '#FFA500', '#FF8C00'];
  let count = 0;
  const interval = setInterval(() => {
    confetti({
      particleCount: 25,
      origin: { x: Math.random() * 0.6 + 0.2, y: -0.1 },
      spread: 140,
      gravity: 1.8,
      startVelocity: 10,
      decay: 0.96,
      colors,
      ticks: 300,
    });
    count++;
    if (count > 8) clearInterval(interval);
  }, 60);
}

function fireBedanken() {
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
  confetti({
    particleCount: 10,
    angle: 90,
    spread: 15,
    origin: { x: 0.5, y: 0.7 },
    startVelocity: 45,
    gravity: 1.5,
    colors,
    ticks: 100,
  });
  setTimeout(() => {
    confetti({
      particleCount: 80,
      angle: 90,
      spread: 360,
      origin: { x: 0.5, y: 0.3 },
      startVelocity: 30,
      gravity: 0.8,
      colors,
      ticks: 200,
      scalar: 1.1,
    });
  }, 350);
}

const EFFECTS = [
  { label: 'Maaaatsch!', fire: fireMatsch },
  { label: 'Berg!', fire: fireBerg },
  { label: 'Bedanken!', fire: fireBedanken },
] as const;

const GamificationSection: React.FC = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFiring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startFiring = useCallback((fire: () => void) => {
    stopFiring(); // vorherige Session aufräumen
    fire(); // sofort feuern
    intervalRef.current = setInterval(() => {
      fire();
    }, 400); // alle 400ms nochmal
    // Max. 5 Sekunden, dann automatisch stoppen
    timeoutRef.current = setTimeout(() => {
      stopFiring();
    }, 5000);
  }, [stopFiring]);

  return (
    <section className="relative overflow-hidden">
      <FeatureBackground type="chalkboard" />

      <div className="relative z-10 py-16 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
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
              Jassen wird zum Erlebnis.
            </h2>
            <p
              className="text-white/80 max-w-xl mx-auto mb-10"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 'clamp(15px, 2vw, 18px)',
                lineHeight: 1.65,
                textShadow: '0 1px 6px rgba(0,0,0,0.3)',
              }}
            >
              Matsch, Berg und Bedanken — jeder Moment wird gefeiert.
              Probier es aus:
            </p>
          </motion.div>

          {/* Interaktive Buttons — nebeneinander, ohne Beschreibungen */}
          <motion.div
            className="grid grid-cols-3 gap-3 sm:gap-4 max-w-lg mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {EFFECTS.map((effect) => (
              <button
                key={effect.label}
                onMouseDown={() => startFiring(effect.fire)}
                onMouseUp={stopFiring}
                onMouseLeave={stopFiring}
                onTouchStart={() => startFiring(effect.fire)}
                onTouchEnd={stopFiring}
                className="group flex items-center justify-center px-3 sm:px-6 py-4 sm:py-5 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 select-none"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <span
                  className="text-white font-bold"
                  style={{
                    fontFamily: "'Capita', Georgia, serif",
                    fontSize: 'clamp(15px, 2.5vw, 22px)',
                  }}
                >
                  {effect.label}
                </span>
              </button>
            ))}
          </motion.div>

          <motion.p
            className="text-white/40 text-sm mt-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Halte gedrückt für mehr Effekte.
          </motion.p>
        </div>
      </div>
    </section>
  );
};

export default GamificationSection;
