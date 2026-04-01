'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { BrowserOnboardingStep, OnboardingContent } from '../../constants/onboardingContent';
import { BROWSER_ONBOARDING } from '../../constants/onboardingContent';
import { useUIStore } from '@/store/uiStore';

/* ─── OS Detection ─── */
function detectOS(): 'iOS' | 'Android' | 'Desktop' {
  if (typeof window === 'undefined') return 'iOS';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (window.innerWidth >= 1024 && !('ontouchstart' in window || navigator.maxTouchPoints > 0))
    return 'Desktop';
  return 'iOS';
}

/* ─── Slide definition aus den Original-Constants ─── */
interface Slide {
  title: string;
  body: string;
  secondaryBody?: string;
  image?: string;
  isGuru?: boolean;
  isQR?: boolean;
  isPhoneScreenshot?: boolean;
}

function buildSlides(os: 'iOS' | 'Android' | 'Desktop'): Slide[] {
  if (os === 'Desktop') {
    const content = BROWSER_ONBOARDING.iOS;
    return [
      {
        title: content.WELCOME_SCREEN.title,
        body: content.WELCOME_SCREEN.message,
        secondaryBody: content.WELCOME_SCREEN.secondaryMessage,
        image: content.WELCOME_SCREEN.image,
        isGuru: true,
      },
      {
        title: content.INSTALL_WELCOME.desktopTitle || content.INSTALL_WELCOME.title,
        body: content.INSTALL_WELCOME.desktopMessage || content.INSTALL_WELCOME.message,
        secondaryBody: content.INSTALL_WELCOME.desktopSecondaryMessage,
        isQR: true,
      },
    ];
  }

  const content = BROWSER_ONBOARDING[os];
  const slides: Slide[] = [
    {
      title: content.WELCOME_SCREEN.title,
      body: content.WELCOME_SCREEN.message,
      secondaryBody: content.WELCOME_SCREEN.secondaryMessage,
      image: content.WELCOME_SCREEN.image,
      isGuru: true,
    },
    {
      title: content.INSTALL_WELCOME.title,
      body: content.INSTALL_WELCOME.message,
      image: content.INSTALL_WELCOME.image,
      isGuru: true,
    },
    {
      title: content.INSTALL_SHARE.title,
      body: content.INSTALL_SHARE.message,
      image: content.INSTALL_SHARE.image,
      isPhoneScreenshot: true,
    },
    {
      title: content.INSTALL_HOME.title,
      body: content.INSTALL_HOME.message,
      image: content.INSTALL_HOME.image,
      isPhoneScreenshot: true,
    },
    {
      title: content.INSTALL_FINAL.title,
      body: content.INSTALL_FINAL.message,
      image: content.INSTALL_FINAL.image,
      isPhoneScreenshot: true,
    },
  ];

  // iOS hat INSTALL_DONE
  if (os === 'iOS' && 'INSTALL_DONE' in content) {
    const done = (content as typeof BROWSER_ONBOARDING.iOS).INSTALL_DONE;
    slides.push({
      title: done.title,
      body: done.message,
      image: done.image,
      isPhoneScreenshot: true,
    });
  }

  // FINAL_HINTS
  slides.push({
    title: content.FINAL_HINTS.title,
    body: content.FINAL_HINTS.message,
    secondaryBody: 'finalMessage' in content.FINAL_HINTS ? (content.FINAL_HINTS as { finalMessage?: string }).finalMessage : undefined,
    image: 'image' in content.FINAL_HINTS ? (content.FINAL_HINTS as { image?: string }).image : '/welcome-guru.png',
    isGuru: true,
  });

  return slides;
}

const QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://jassguru.ch')}`;

/* ─── Animation Variants ─── */
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

/* ─── Props (kompatibel mit JassKreidetafel) ─── */
interface OnboardingFlowProps {
  show: boolean;
  onDismiss: () => void;
  step?: BrowserOnboardingStep;
  content?: OnboardingContent;
  onNext?: () => void;
  onPrevious?: () => void;
  canBeDismissed?: boolean;
  isPWA?: boolean;
  isBrowserOnboarding?: boolean;
}

/* ─── Main Component ─── */
export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ show, onDismiss }) => {
  const [[page, direction], setPage] = useState([0, 0]);
  const [os, setOS] = useState<'iOS' | 'Android' | 'Desktop'>('iOS');

  useEffect(() => {
    setOS(detectOS());
  }, []);

  const slides = useMemo(() => buildSlides(os), [os]);

  const totalSlides = slides.length;
  const currentSlide = slides[page] || slides[0];
  const isFirstSlide = page === 0;
  const isLastSlide = page === totalSlides - 1;

  const paginate = useCallback(
    (newDirection: number) => {
      const next = page + newDirection;
      if (next >= 0 && next < totalSlides) {
        setPage([next, newDirection]);
      } else if (next >= totalSlides) {
        useUIStore.getState().showNotification({
          message: 'Hat die Installation geklappt?',
          type: 'info',
          preventClose: true,
          actions: [
            {
              label: 'Nein, nochmal zeigen',
              onClick: () => setPage([0, -1]),
            },
            {
              label: 'Ja, weiter!',
              onClick: () => onDismiss(),
              className: 'bg-green-600 hover:bg-green-700 text-white',
            },
          ],
        });
      }
    },
    [page, totalSlides, onDismiss],
  );

  const goToSlide = useCallback(
    (index: number) => {
      setPage([index, index > page ? 1 : -1]);
    },
    [page],
  );

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const swipe = Math.abs(info.offset.x) * info.velocity.x;
      if (swipe < -4000) paginate(1);
      else if (swipe > 4000) paginate(-1);
    },
    [paginate],
  );

  // Preload next slide image
  useEffect(() => {
    const next = slides[page + 1];
    if (next?.image) {
      const img = new window.Image();
      img.src = next.image;
    }
  }, [page, slides]);

  if (!show) return null;
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/view/')) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-[100dvh] flex flex-col relative"
        >
          {/* Background — wie Feature-Sections */}
          <div className="absolute inset-0">
            <img
              src="/images/backgrounds/chalkboard-jvs.webp"
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>

          {/* Content Area */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden px-6 py-10">
            <AnimatePresence custom={direction} mode="wait">
              <motion.div
                key={page}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragEnd={handleDragEnd}
                className="flex flex-col items-center text-center w-full max-w-lg select-none"
              >
                {/* Titel — IMMER Capita, IMMER oben */}
                <h2
                  className="text-white mb-5"
                  style={{
                    fontFamily: "'Capita', Georgia, serif",
                    fontWeight: 700,
                    fontSize: 'clamp(28px, 6vw, 42px)',
                    lineHeight: 1.2,
                    letterSpacing: '-0.96px',
                    textShadow: '0 2px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  {currentSlide.title}
                </h2>

                {/* Guru Image (Welcome/Intro/Final) */}
                {currentSlide.isGuru && currentSlide.image && (
                  <img
                    src={currentSlide.image}
                    alt="Jass Guru"
                    className="w-auto max-h-[30vh] object-contain mb-5"
                    draggable={false}
                  />
                )}

                {/* QR Code (Desktop) */}
                {currentSlide.isQR && (
                  <img
                    src={QR_CODE_URL}
                    alt="QR-Code für jassguru.ch"
                    className="w-48 h-48 bg-white p-3 rounded-xl mb-5"
                    draggable={false}
                  />
                )}

                {/* Screenshot — eigener Rand als Device-Rahmen, gross dargestellt */}
                {currentSlide.isPhoneScreenshot && currentSlide.image && (
                  <div className="mb-5 flex justify-center">
                    <img
                      src={currentSlide.image}
                      alt={currentSlide.title}
                      className="w-auto max-h-[50vh] max-w-[85vw] object-contain"
                      style={{
                        borderRadius: 'clamp(16px, 4vw, 32px)',
                        border: 'clamp(3px, 0.6vw, 5px) solid #1e1e1e',
                        boxShadow: '0 22px 52px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
                      }}
                      draggable={false}
                    />
                  </div>
                )}

                {/* Body — IMMER Inter, unter dem Bild */}
                <p
                  className="text-white/80 max-w-md mx-auto"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 'clamp(17px, 3.5vw, 22px)',
                    lineHeight: 1.6,
                    textShadow: '0 1px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {currentSlide.body}
                </p>

                {/* Secondary Body */}
                {currentSlide.secondaryBody && (
                  <p
                    className="text-white/60 max-w-md mx-auto mt-3"
                    style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 'clamp(16px, 3vw, 20px)',
                      lineHeight: 1.5,
                      fontStyle: 'italic',
                      textShadow: '0 1px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    {currentSlide.secondaryBody}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Navigation */}
          <div
            className="relative z-10 px-6"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 2rem)' }}
          >
            {/* Dot Indicators */}
            <div className="flex justify-center gap-2 mb-5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToSlide(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === page
                      ? 'w-7 h-2.5 bg-white'
                      : 'w-2.5 h-2.5 bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Schritt ${i + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 max-w-md mx-auto">
              {!isFirstSlide && (
                <button
                  onClick={() => paginate(-1)}
                  className="flex-1 py-3.5 rounded-full text-white font-semibold transition-all duration-200 active:scale-95"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '16px',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  Zurück
                </button>
              )}
              <button
                onClick={() => paginate(1)}
                className={`flex-1 py-3.5 rounded-full text-white font-semibold transition-all duration-200 active:scale-95 ${
                  isFirstSlide ? 'w-full' : ''
                }`}
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '16px',
                  background: isLastSlide
                    ? 'linear-gradient(135deg, #16a34a, #15803d)'
                    : 'linear-gradient(135deg, #ca8a04, #a16207)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}
              >
                {isLastSlide ? 'Los gehts!' : 'Weiter'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingFlow;
