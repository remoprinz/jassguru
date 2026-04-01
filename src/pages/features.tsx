import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import FeaturesHero from '@/components/features/sections/FeaturesHero';
import JasstafelSection from '@/components/features/sections/JasstafelSection';
import KalkulatorSection from '@/components/features/sections/KalkulatorSection';
import GameInfoSection from '@/components/features/sections/GameInfoSection';
import MenuSection from '@/components/features/sections/MenuSection';
import GamificationSection from '@/components/features/sections/GamificationSection';
import RundenSection from '@/components/features/sections/RundenSection';
import RanglisteSection from '@/components/features/sections/RanglisteSection';
import ProfilEloSection from '@/components/features/sections/ProfilEloSection';
import TurniereSection from '@/components/features/sections/TurniereSection';
import ArchivSection from '@/components/features/sections/ArchivSection';
import SpieldetailSection from '@/components/features/sections/SpieldetailSection';
import MultiDeviceSection from '@/components/features/sections/MultiDeviceSection';
import ErsteSchritteSection from '@/components/features/sections/ErsteSchritteSection';
import FeaturesCta from '@/components/features/sections/FeaturesCta';

const FeaturesPage = () => {
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add('landing-page');
    if (typeof window !== 'undefined' && typeof window.cancelPwaLoadTimeout === 'function') {
      window.cancelPwaLoadTimeout();
    }
    return () => document.body.classList.remove('landing-page');
  }, []);

  const handleInstall = () => router.push('/onboarding_tutorial');
  const handleLogin = () => router.push('/auth/login');
  const handleRegister = () => router.push('/auth/register');

  return (
    <>
      <Head>
        <title>Features — JassGuru | Jasstafel, Rangliste, Elo-Profil, Turniere</title>
        <meta name="description" content="Entdecke alle Features von JassGuru: Digitale Jasstafel, Kalkulator, Elo-Rating, Ranglisten, Turniere und mehr — die offizielle Jass-App der Schweiz." />
        <meta property="og:title" content="Features — JassGuru" />
        <meta property="og:description" content="Digitale Jasstafel, Elo-Rating, Ranglisten, Turniere — alles was deine Jassgruppe braucht." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://jassguru.ch/features/" />
      </Head>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="min-h-screen bg-black"
      >
        <LandingHeader onLogin={handleLogin} onRegister={handleRegister} />
        <FeaturesHero onCta={handleRegister} />
        {/* Bedienung */}
        <JasstafelSection />       {/* Kreide */}
        <KalkulatorSection />      {/* Holz */}
        <GameInfoSection />        {/* Kreide */}
        <MenuSection />            {/* Holz */}
        {/* Erlebnis */}
        <GamificationSection />    {/* Kreide */}
        <RundenSection />          {/* Holz */}
        {/* Statistik & Community */}
        <RanglisteSection />       {/* Kreide — weil nach Holz */}
        <ProfilEloSection />       {/* Holz — weil nach Kreide */}
        <TurniereSection />        {/* Kreide */}
        <ArchivSection />          {/* Holz */}
        <SpieldetailSection />     {/* Kreide */}
        <MultiDeviceSection />     {/* Holz */}
        {/* Abschluss */}
        <ErsteSchritteSection />   {/* Kreide */}
        <FeaturesCta onRegister={handleRegister} />
        <LandingFooter onInstall={handleInstall} onLogin={handleLogin} />
      </motion.div>
    </>
  );
};

export default FeaturesPage;
