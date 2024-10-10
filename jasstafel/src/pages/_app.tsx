import React from 'react';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { register } from '../pwa/serviceWorkerRegistration';
import DebugLog from '../components/ui/DebugLog';
import { AppProvider } from '../contexts/AppContext';
import Head from 'next/head';
import { useWakeLock } from '../hooks/useWakeLock';
import { useOrientation } from '../hooks/useOrientation';
import { useBrowserDetection } from '../hooks/useBrowserDetection';
import { FaInfoCircle } from 'react-icons/fa';

const MyApp = ({ Component, pageProps }: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  const { orientationMessage, dismissOrientationMessage } = useOrientation();
  const { browserMessage, dismissMessage } = useBrowserDetection(true);
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
      {isClient && (browserMessage.show || orientationMessage.show) && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 animate-fade-in pointer-events-auto">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white">
            <div className="flex flex-col items-center justify-center mb-4">
              <FaInfoCircle className="w-12 h-12 text-yellow-600 mb-2" />
            </div>
            <p className="text-lg mb-8 text-center">
              {browserMessage.show ? browserMessage.message : orientationMessage.message}
            </p>
            <button
              onClick={browserMessage.show ? dismissMessage : dismissOrientationMessage}
              className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors w-full text-lg font-semibold"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}
    </AppProvider>
  );
};

export default MyApp;