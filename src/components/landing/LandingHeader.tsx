'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface LandingHeaderProps {
  onLogin: () => void;
  onRegister: () => void;
}

/** Filz/transparent: weiss; weisse Leiste nach Scroll: dunkle Variante */
function Logo({ variant = 'color', shrunk = false }: { variant?: 'color' | 'white'; shrunk?: boolean }) {
  const src =
    variant === 'white'
      ? '/images/logos/jassguru-logo-weiss.png'
      : '/images/logos/jassguru-logo.png';

  return (
    <Image
      src={src}
      alt="JassGuru"
      width={1152}
      height={252}
      className={`transition-all duration-500 w-auto ${
        shrunk ? 'h-8 md:h-9' : 'h-9 md:h-11'
      }`}
      priority
    />
  );
}

const LandingHeader: React.FC<LandingHeaderProps> = ({ onLogin, onRegister }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileCompact, setIsMobileCompact] = useState(false);
  const [collapseProgress, setCollapseProgress] = useState(0);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const BREAKPOINT = 1024;
    const PIN_THRESHOLD_PX = 38;
    const COLLAPSE_THRESHOLD_PX = 288;
    const EXPAND_THRESHOLD_PX = 220;
    const DESKTOP_COLLAPSE_START = 90;
    const DESKTOP_COLLAPSE_END = 280;

    const handleResize = () => {
      const isDesktop = window.innerWidth >= BREAKPOINT;
      setIsDesktopViewport(isDesktop);
      setIsMobileViewport(!isDesktop);
      if (isDesktop) {
        setIsMobileCompact(false);
      }
    };

    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 50);

      if (window.innerWidth < BREAKPOINT && !mobileMenuOpen) {
        const isScrollingDown = scrollY > lastScrollYRef.current;

        if (scrollY <= PIN_THRESHOLD_PX) {
          setIsMobileCompact(false);
        } else if (scrollY >= COLLAPSE_THRESHOLD_PX && isScrollingDown) {
          setIsMobileCompact(true);
        } else if (!isScrollingDown && scrollY <= EXPAND_THRESHOLD_PX) {
          setIsMobileCompact(false);
        }
      }

      if (window.innerWidth >= BREAKPOINT) {
        const rawProgress = (scrollY - DESKTOP_COLLAPSE_START) / (DESKTOP_COLLAPSE_END - DESKTOP_COLLAPSE_START);
        const clamped = Math.max(0, Math.min(1, rawProgress));
        setCollapseProgress(clamped);
      } else {
        setCollapseProgress(0);
      }

      lastScrollYRef.current = scrollY;
    };

    handleResize();
    handleScroll();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      setIsMobileCompact(false);
    }
  }, [mobileMenuOpen]);

  const navItems = [
    { href: '/features/', label: 'Features' },
    { href: '/support/', label: 'Support' },
  ];

  const isMobileCompactMode = isMobileViewport && isMobileCompact && !mobileMenuOpen;
  const showTransparent = !scrolled;
  const logoVariant = isDesktopViewport ? 'white' : showTransparent ? 'white' : 'color';
  const desktopMainOpacity = isDesktopViewport ? Math.max(0, 1 - collapseProgress * 1.2) : 1;
  const desktopCompactOpacity = isDesktopViewport ? Math.max(0, (collapseProgress - 0.74) / 0.26) : 0;
  const isDesktopCompactVisible = isDesktopViewport && desktopCompactOpacity > 0.2;
  const desktopMainTransform = isDesktopViewport
    ? `translateY(${-(collapseProgress * 8)}px) scale(${1 - collapseProgress * 0.06})`
    : 'none';

  return (
    <header
      className="fixed z-50 transition-[top,left,right,width,background,border-radius,box-shadow,backdrop-filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={
        isMobileViewport
          ? isMobileCompactMode
            ? {
                top: '12px',
                right: '12px',
                width: '56px',
                background: 'rgba(255,255,255,0.98)',
                borderRadius: '12px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                backdropFilter: 'blur(12px)',
              }
            : scrolled
            ? {
                top: '12px',
                right: '12px',
                width: 'calc(100% - 24px)',
                background: 'rgba(255,255,255,0.98)',
                borderRadius: '12px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                backdropFilter: 'blur(12px)',
              }
            : {
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                background: 'transparent',
              }
          : { top: 0, left: 0, right: 0, background: 'transparent' }
      }
    >
      <div
        className={isMobileCompactMode ? 'px-0' : isMobileViewport && scrolled ? 'px-6' : 'px-5 md:px-7'}
        style={isMobileCompactMode || (isMobileViewport && scrolled) ? undefined : { maxWidth: '1240px', margin: '0 auto' }}
      >
        <nav
          className={`flex items-center transition-all duration-500 ${
            isMobileCompactMode
              ? 'justify-end h-14 px-1'
              : isMobileViewport && scrolled
              ? 'justify-between h-[72px] md:h-[76px]'
              : 'justify-between h-20 md:h-24'
          }`}
        >
          {!isMobileCompactMode && (
            <a
              href="/"
              className="flex items-center lg:-ml-2"
              style={
                isDesktopViewport
                  ? {
                      opacity: desktopMainOpacity,
                      transform: desktopMainTransform,
                      transformOrigin: 'left center',
                      pointerEvents: desktopMainOpacity < 0.08 ? 'none' : 'auto',
                    }
                  : undefined
              }
            >
              <Logo variant={logoVariant} shrunk={scrolled} />
            </a>
          )}

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center justify-end relative min-w-[360px] h-[56px] lg:pr-3 xl:pr-6">
            <div
              className="absolute inset-0 flex items-center justify-end gap-6 xl:gap-8 transition-[opacity,transform] duration-350"
              style={{
                opacity: desktopMainOpacity,
                transform: desktopMainTransform,
                transformOrigin: 'right center',
                pointerEvents: desktopMainOpacity < 0.08 ? 'none' : 'auto',
              }}
            >
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="transition-all duration-300"
                  style={{
                    fontFamily: "'Capita', Georgia, serif",
                    fontWeight: 700,
                    fontSize: '16px',
                    lineHeight: '1',
                  color: 'rgba(255, 255, 255, 0.95)',
                  }}
                  onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
                  }}
                >
                  {item.label}
                </a>
              ))}

              <button
                onClick={onRegister}
                className="rounded-full transition-all duration-300 transform hover:-translate-y-0.5 inline-flex items-center justify-center"
                style={{
                  fontFamily: "'Capita', Georgia, serif",
                  fontWeight: 700,
                  fontSize: '17px',
                  lineHeight: '1',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  minWidth: '188px',
                  padding: '10px 24px',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803d';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(22, 163, 74, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16a34a';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(22, 163, 74, 0.3)';
                }}
              >
                Registrieren
              </button>
            </div>
            <button
              className="absolute right-0 rounded-lg text-black transition-[opacity,transform] duration-500"
              style={{
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.98)',
                borderRadius: '12px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                backdropFilter: 'blur(12px)',
                opacity: desktopCompactOpacity,
                transform: `scale(${0.92 + desktopCompactOpacity * 0.08}) translateY(${(1 - desktopCompactOpacity) * 5}px)`,
                pointerEvents: desktopCompactOpacity > 0.2 ? 'auto' : 'none',
              }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menü öffnen"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <AnimatePresence>
              {mobileMenuOpen && isDesktopCompactVisible && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="absolute right-0 top-[68px] z-50 w-[360px] bg-white rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.16)] border border-black/5 overflow-hidden"
                >
                  <div className="py-4 space-y-1">
                    {navItems.map((item) => (
                      <a
                        key={`desktop-${item.href}`}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-4 px-6 transition-colors"
                        style={{
                          fontFamily: "'Capita', Georgia, serif",
                          fontWeight: 700,
                          fontSize: '20px',
                          color: '#000000',
                        }}
                      >
                        {item.label}
                      </a>
                    ))}

                    <div className="px-6 pt-3">
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onRegister();
                        }}
                        className="block w-full text-center rounded-full"
                        style={{
                          fontFamily: "'Capita', Georgia, serif",
                          fontWeight: 700,
                          fontSize: '18px',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          padding: '14px 24px',
                        }}
                      >
                        Registrieren
                      </button>
                    </div>

                    <div className="px-6 pt-3 border-t border-gray-200 mt-2">
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onLogin();
                        }}
                        className="block w-full text-left py-3 transition-colors text-gray-600 hover:text-black"
                        style={{
                          fontFamily: "'Capita', Georgia, serif",
                          fontWeight: 700,
                          fontSize: '16px',
                        }}
                      >
                        Anmelden
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile Hamburger */}
          <button
            className={`rounded-lg transition-all ${
              isMobileCompactMode
                ? 'text-black lg:hidden'
                : showTransparent
                ? 'text-white lg:hidden'
                : 'text-black lg:hidden'
            }`}
            style={
              isMobileCompactMode
                ? {
                    width: '56px',
                    height: '56px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.98)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                    backdropFilter: 'blur(12px)',
                  }
                : undefined
            }
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menü öffnen"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="lg:hidden bg-white rounded-b-xl shadow-lg overflow-hidden"
              style={{ maxWidth: isMobileCompactMode ? '320px' : undefined, marginLeft: isMobileCompactMode ? 'auto' : undefined }}
            >
              <div className="py-4 space-y-1">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-4 px-6 transition-colors"
                    style={{
                      fontFamily: "'Capita', Georgia, serif",
                      fontWeight: 700,
                      fontSize: '20px',
                      color: '#000000',
                    }}
                  >
                    {item.label}
                  </a>
                ))}

                <div className="px-6 pt-3">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onRegister();
                    }}
                    className="block w-full text-center rounded-full"
                    style={{
                      fontFamily: "'Capita', Georgia, serif",
                      fontWeight: 700,
                      fontSize: '18px',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      padding: '14px 24px',
                    }}
                  >
                    Registrieren
                  </button>
                </div>

                <div className="px-6 pt-3 border-t border-gray-200 mt-2">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogin();
                    }}
                    className="block w-full text-left py-3 transition-colors text-gray-600 hover:text-black"
                    style={{
                      fontFamily: "'Capita', Georgia, serif",
                      fontWeight: 700,
                      fontSize: '16px',
                    }}
                  >
                    Anmelden
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </header>
  );
};

export default LandingHeader;
