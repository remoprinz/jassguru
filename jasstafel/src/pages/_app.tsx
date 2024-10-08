import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { register } from '../pwa/serviceWorkerRegistration';
import DebugLog from '../components/ui/DebugLog';
import { AppProvider } from '../contexts/AppContext';
import Head from 'next/head';
import { useWakeLock } from '../hooks/useWakeLock';
import { useOrientation } from '../hooks/useOrientation';
import { useBrowserDetection } from '../hooks/useBrowserDetection';

const MyApp = ({ Component, pageProps }: AppProps) => {
  useWakeLock();
  useOrientation();
  const { browserMessage, dismissMessage } = useBrowserDetection();

  useEffect(() => {
    register();
  }, []);

  return (
    <AppProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
      <DebugLog />
      {browserMessage.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full relative">
            <p className="text-lg mb-8">{browserMessage.message}</p>
            <button
              onClick={dismissMessage}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors absolute bottom-4 right-4"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </AppProvider>
  );
};

export default MyApp;