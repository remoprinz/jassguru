import React from 'react';
import { useState, useEffect } from 'react';
import { FaInfoCircle } from 'react-icons/fa';

interface BrowserMessage {
  show: boolean;
  message: string;
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
    message: ''
  });

  useEffect(() => {
    if (!hasShownIntro) {
      return;
    }

    const isStandalone = isPWA();
    const hasShownIOSMessage = localStorage.getItem('hasShownIOSMessage') === 'true';
    const appOpenCount = parseInt(localStorage.getItem('appOpenCount') || '0', 10);

    if (!isStandalone) {
      setBrowserMessage({
        show: true,
        message: 'Nutze die Jasstafel als Vollbild-App. Klicke dazu unten auf das "Teilen-Symbol" (Böxchen mit Pfeil nach oben) und wähle "Zum Home-Bilschirm". Android: Oben rechts "Menü", dann "Zum Startbildschirm beifügen".'
      });
    } else if (isIOS() && !hasShownIOSMessage && appOpenCount > 1) {
      setBrowserMessage({
        show: true,
        message: 'Zurzeit ist es auf einem iOS-Gerät nicht möglich, den Bildschirm wach zu halten. Stelle zum Jassen die "Automatische Sperre" auf fünf Minuten unter "Einstellungen > Bildschirm & Helligkeit".'
      });
      localStorage.setItem('hasShownIOSMessage', 'true');
    }

    localStorage.setItem('appOpenCount', (appOpenCount + 1).toString());
  }, [hasShownIntro]);

  const dismissMessage = () => {
    setBrowserMessage({ show: false, message: '' });
  };

  return { browserMessage, dismissMessage };
};