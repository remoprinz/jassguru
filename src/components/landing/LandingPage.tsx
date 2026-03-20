'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import HeroSection from './sections/HeroSection';
import ErfassenSection from './sections/ErfassenSection';
import ProSection from './sections/ProSection';
import HilfeSection from './sections/HilfeSection';
import VerbandSection from './sections/VerbandSection';
import CtaSection from './sections/CtaSection';
import LandingHeader from './LandingHeader';
import LandingFooter from './LandingFooter';

const LandingPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add('landing-page');
    return () => {
      document.body.classList.remove('landing-page');
    };
  }, []);

  const handleInstall = () => {
    router.push('/onboarding_tutorial');
  };

  const handleLogin = () => {
    router.push('/auth/login');
  };

  const handleRegister = () => {
    router.push('/auth/register');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-black"
    >
      <LandingHeader onLogin={handleLogin} onRegister={handleRegister} />
      <HeroSection onInstall={handleInstall} onLogin={handleLogin} />
      <ErfassenSection />
      <ProSection />
      <HilfeSection />
      <VerbandSection />
      <CtaSection onInstall={handleInstall} onLogin={handleLogin} />
      <LandingFooter onInstall={handleInstall} onLogin={handleLogin} />
    </motion.div>
  );
};

export default LandingPage;
