import React from 'react';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { register } from '../pwa/serviceWorkerRegistration';
import DebugLog from '../components/ui/DebugLog';
import { AppProvider } from '../contexts/AppContext';
import Head from 'next/head';
import { useWakeLock } from '../hooks/useWakeLock';

const MyApp = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();

  useEffect(() => {
    setIsClient(true);
    register();
  }, []);

  return (
    <AppProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </Head>
      <Component {...pageProps} />
      <DebugLog />
    </AppProvider>
  );
};

export default MyApp;