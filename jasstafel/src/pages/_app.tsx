import React from 'react';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { register } from '../pwa/serviceWorkerRegistration';
import DebugLog from '../components/ui/DebugLog';
import { AppProvider } from '../contexts/AppContext';
import Head from 'next/head';
import { useWakeLock } from '../hooks/useWakeLock';
import { AuthProvider } from '../providers/AuthProvider';
import { UserProvider } from '../providers/UserProvider';
import { useAuthStore } from '@/store/authStore';
import GlobalNotificationContainer from '../components/notifications/GlobalNotificationContainer';

const MyApp = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();
  const initAuth = useAuthStore(state => state.initAuth);

  useEffect(() => {
    setIsClient(true);
    register();
    console.log("_app.tsx: useEffect - Rufe initAuth() auf");
    initAuth();
  }, [initAuth]);

  return (
    <AppProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </Head>
      <AuthProvider>
        <UserProvider>
          <Component {...pageProps} />
          <GlobalNotificationContainer />
        </UserProvider>
      </AuthProvider>
      <DebugLog />
    </AppProvider>
  );
};

export default MyApp;