import { useState, useEffect } from 'react';

interface BrowserMessage {
  show: boolean;
  message: string;
}

export const useBrowserDetection = () => {
  const [browserMessage, setBrowserMessage] = useState<BrowserMessage>({
    show: false,
    message: ''
  });

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) {
      setBrowserMessage({
        show: true,
        message: 'Füge die Jasstafel zum Homebildschirm hinzu, um sie als Vollbild-App zu nutzen. Klicke unten auf das Teilen-Symbol (mit Box und Pfeilchen nach oben) und wähle dann "Zum Home-Bildschirm".'
      });
    }
  }, []);

  const dismissMessage = () => {
    setBrowserMessage({ show: false, message: '' });
  };

  return { browserMessage, dismissMessage };
};