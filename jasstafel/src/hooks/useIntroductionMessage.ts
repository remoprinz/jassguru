import { useState, useEffect } from 'react';
import { isPWA } from './useBrowserDetection';

export const useIntroductionMessage = () => {
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [hasShownIntro, setHasShownIntro] = useState(false);

  useEffect(() => {
    if (!isPWA()) {
      setShowMessage(false);
      return;
    }

    const storedHasShownIntro = localStorage.getItem('hasShownIntro') === 'true';

    if (!storedHasShownIntro) {
      setMessage('Willkommen zu Jassguru');
      setShowMessage(true);
    } else {
      setHasShownIntro(true);
    }
  }, []);

  const dismissMessage = () => {
    setShowMessage(false);
    setHasShownIntro(true);
    localStorage.setItem('hasShownIntro', 'true');
  };

  return { showMessage, message, dismissMessage, hasShownIntro };
};