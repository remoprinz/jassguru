import React, { useEffect, useState } from 'react';
import Head from 'next/head';

const ClearCachePage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'clearing' | 'success' | 'error'>('loading');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const clearAllCaches = async () => {
      try {
        setStatus('clearing');
        setProgress(10);

        // 1. Service Worker Caches löschen
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          console.log(`🧹 Lösche ${cacheNames.length} Cache(s):`, cacheNames);
          
          await Promise.all(
            cacheNames.map(async (cacheName, index) => {
              console.log(`Lösche Cache: ${cacheName}`);
              await caches.delete(cacheName);
              setProgress(10 + (index + 1) * (60 / cacheNames.length));
            })
          );
        }
        setProgress(70);

        // 2. Service Worker unregistrieren
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          
          for (const registration of registrations) {
            console.log('🔧 Lösche Service Worker Registration');
            await registration.unregister();
          }
        }
        setProgress(80);

        // 3. LocalStorage/SessionStorage bereinigen
        const keysToRemove = [
          'pwa-update-available',
          'last-sw-version',
          'app-cache-version',
          'workbox-cache-version'
        ];
        
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        });
        setProgress(90);

        // 4. Cache-Version markieren
        localStorage.setItem('app-cache-version', '2.5.6');
        localStorage.setItem('last-cache-clear', new Date().toISOString());
        localStorage.setItem('cache-clear-forced', 'true');
        setProgress(100);

        setStatus('success');

        // 5. Nach 3 Sekunden zur Hauptseite weiterleiten
        setTimeout(() => {
          console.log('🔄 Weiterleitung zur Hauptseite...');
          window.location.href = '/';
        }, 3000);

      } catch (error) {
        console.error('❌ Fehler beim Cache Clear:', error);
        setStatus('error');
      }
    };

    // Nach 1 Sekunde starten
    const timer = setTimeout(clearAllCaches, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Head>
        <title>Cache wird geleert - jassguru.ch</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </Head>
      
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center shadow-xl">
          
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
              <h1 className="text-2xl font-bold mb-2">Vorbereitung...</h1>
              <p className="text-gray-300">Cache-Bereinigung wird vorbereitet</p>
            </>
          )}

          {status === 'clearing' && (
            <>
              <div className="relative h-16 w-16 mx-auto mb-4">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold">{Math.round(progress)}%</span>
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2 text-green-400">Cache wird geleert</h1>
              <p className="text-gray-300 mb-4">
                Alle alten Dateien werden entfernt...
              </p>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 mb-4">
                <svg className="h-16 w-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2 text-green-400">✅ Erfolg!</h1>
              <p className="text-gray-300 mb-4">
                Cache wurde vollständig geleert. Sie werden in 3 Sekunden zur Hauptseite weitergeleitet.
              </p>
              <p className="text-sm text-gray-400">
                jassguru.ch sollte jetzt mit der neuesten Version laden.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 mb-4">
                <svg className="h-16 w-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2 text-red-400">❌ Fehler</h1>
              <p className="text-gray-300 mb-4">
                Cache-Bereinigung fehlgeschlagen. Versuchen Sie es manuell:
              </p>
              <div className="bg-gray-700 p-4 rounded text-sm text-left">
                <p className="font-bold mb-2">Manueller Cache-Clear:</p>
                <p>1. F12 drücken</p>
                <p>2. Reload-Button rechtsklicken</p>
                <p>3. "Empty Cache and Hard Reload"</p>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium"
              >
                Zur Hauptseite
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ClearCachePage; 