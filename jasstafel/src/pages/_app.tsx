import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { register } from '../pwa/serviceWorkerRegistration';
import DebugLog from '../components/ui/DebugLog';
import { AppProvider } from '../contexts/AppContext';
import Head from 'next/head';

const lockOrientation = () => {
  if (typeof window !== 'undefined') {
    const lockOrientation = () => {
      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock('portrait').catch(() => {
          console.warn('Orientierungssperre nicht unterstützt');
        });
      }
    };

    const handleOrientationChange = () => {
      if (window.orientation !== undefined && window.orientation !== 0 && window.orientation !== 180) {
        alert('Bitte drehen Sie Ihr Gerät in die Portraitansicht für die beste Erfahrung.');
      }
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    lockOrientation();
    handleOrientationChange();

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }
};

const setVH = () => {
  if (typeof window !== 'undefined') {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    const safeAreaBottom = getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0px';
    if (window.getComputedStyle) {
      const safeAreaTop = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0');
      const safeAreaBottom = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');
      
      document.documentElement.style.setProperty('--safe-area-top', `${safeAreaTop}px`);
      document.documentElement.style.setProperty('--safe-area-bottom', `${safeAreaBottom}px`);
    }
  }
};

const handleOrientation = () => {
  if (typeof window !== 'undefined') {
    const orientationHandler = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (!isPortrait) {
        alert('Bitte drehen Sie Ihr Gerät in die Portraitansicht für die beste Erfahrung.');
      }
    };

    window.addEventListener('resize', orientationHandler);
    orientationHandler(); // Initial check

    return () => {
      window.removeEventListener('resize', orientationHandler);
    };
  }
};

function MyApp({ Component, pageProps }: AppProps) {
  const isDebugMode = process.env.NODE_ENV === 'development';

  useEffect(() => {
    console.log('MyApp Komponente initialisiert');
    register();
    const orientationCleanup = handleOrientation();
    const handleResize = () => {
      setVH();
    };

    window.addEventListener('resize', handleResize);
    
    setTimeout(setVH, 100);

    return () => {
      orientationCleanup && orientationCleanup();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <AppProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </Head>
      <div style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
        <Component {...pageProps} />
        {isDebugMode && <DebugLog initiallyVisible={false} />}
      </div>
    </AppProvider>
  );
}

export default MyApp;