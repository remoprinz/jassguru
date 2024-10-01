// src/pages/_app.tsx

import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { register } from '../serviceWorkerRegistration';
import DebugLog from '../components/DebugLog';

const isInStandaloneMode = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   (window.navigator as any).standalone === true ||
   document.referrer.includes('android-app://'));

function MyApp({ Component, pageProps }: AppProps) {
  const isDebugMode = process.env.NODE_ENV === 'development';

  useEffect(() => {
    console.log('App initialized');
    register();

    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    const lockOrientation = () => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {
          console.log('Orientation lock not supported');
        });
      }
    };

    setVH();
    lockOrientation();
    window.addEventListener('resize', setVH);

    return () => window.removeEventListener('resize', setVH);
  }, []);

  return (
    <div style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
      <Component {...pageProps} />
      {isDebugMode && <DebugLog initiallyVisible={false} />}
    </div>
  );
}

export default MyApp;