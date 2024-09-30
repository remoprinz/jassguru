// src/pages/_app.tsx

import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { register } from '../serviceWorkerRegistration';

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

const isInStandaloneMode = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   (window.navigator as any).standalone === true ||
   document.referrer.includes('android-app://'));

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered with scope:', registration.scope);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    console.log('App initialized');
    console.log('Window location:', window.location.href);
    console.log('Document readyState:', document.readyState);
    console.log('Manifest link element:', document.querySelector('link[rel="manifest"]'));

    // Bestehende Logs...

    // Überprüfen Sie den Status des Service Workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        console.log('Service Worker Registrations:', registrations);
      });
    }

    // Überprüfen Sie, ob die Manifest-Datei geladen wurde
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      fetch(manifestLink.getAttribute('href') || '')
        .then(response => response.json())
        .then(data => console.log('Manifest content:', data))
        .catch(error => console.error('Error loading manifest:', error));
    } else {
      console.log('Manifest link element not found');
    }

    // Überprüfen Sie den Netzwerkstatus der Manifest-Datei
    fetch('/manifest.json')
      .then(response => {
        console.log('Manifest network status:', response.status, response.statusText);
        return response.json();
      })
      .then(data => console.log('Manifest content from network:', data))
      .catch(error => console.error('Error fetching manifest from network:', error));

    // Bestehender Code...
    console.log('Window:', window);
    console.log('Navigator:', navigator);
    console.log('Display mode:', window.matchMedia('(display-mode: standalone)').matches);
    console.log('Navigator standalone:', (window.navigator as any).standalone);
    console.log('Is in standalone mode:', isInStandaloneMode());

    console.log('Service Worker supported:', 'serviceWorker' in navigator);
    console.log('Window.matchMedia supported:', 'matchMedia' in window);
    if ('matchMedia' in window) {
      console.log('Standalone mode query result:', window.matchMedia('(display-mode: standalone)').matches);
    }

    // Verwenden Sie die importierte register-Funktion
    register();

    if (isInStandaloneMode()) {
      console.log('Anwendung läuft als PWA');
    } else {
      console.log('Anwendung läuft im Browser-Modus');
    }

    console.log('window.navigator.standalone:', window.navigator.standalone);
    console.log('document.referrer:', document.referrer);
    console.log('window.matchMedia(\'(display-mode: standalone)\').matches:', window.matchMedia('(display-mode: standalone)').matches);

    console.log('PWA display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser');
    console.log('PWA launch platform:', navigator.platform);
    console.log('PWA launch user agent:', navigator.userAgent);

    registerServiceWorker();
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;