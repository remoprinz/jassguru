import React from 'react';
import { useState, useEffect } from 'react';
import { FaInfoCircle } from 'react-icons/fa';

interface BrowserMessage {
  show: boolean;
  message: string;
  title: string;
}

export const isIOS = () => {
  if (typeof window !== 'undefined') {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }
  return false;
};

export const isPWA = () => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }
  return false;
};

export const useBrowserDetection = (hasShownIntro: boolean) => {
  const [browserMessage, setBrowserMessage] = useState<BrowserMessage>({
    show: false,
    message: '',
    title: ''
  });

  useEffect(() => {
    const isStandalone = isPWA();

    if (!isStandalone) {
      setBrowserMessage({
        show: true,
        title: 'Installiere die Jasstafel-App',
        message: `Auf iOS: Tippe unten auf das "Teilen-Symbol" (Böxchen mit Pfeil nach oben) und wähle "Zum Home-Bildschirm".

Auf Android: Tippe oben rechts auf "Menü", dann "Zum Startbildschirm beifügen".`
      });
    }
  }, [hasShownIntro]);

  const dismissMessage = () => {
    setBrowserMessage({ show: false, message: '', title: '' });
  };

  return { browserMessage, dismissMessage };
};