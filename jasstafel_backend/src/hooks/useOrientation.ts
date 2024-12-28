import { useState, useEffect } from 'react';

interface OrientationMessage {
  show: boolean;
  message: string;
}

export const useOrientation = () => {
  const [orientationMessage, setOrientationMessage] = useState<OrientationMessage>({
    show: false,
    message: ''
  });

  useEffect(() => {
    const handleOrientationChange = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (!isPortrait) {
        setOrientationMessage({
          show: true,
          message: 'Die Orientierungssperre ist zurzeit nicht möglich auf diesem Gerät. Drehe die Jasstafel um 90 Grad.'
        });
      } else {
        setOrientationMessage({ show: false, message: '' });
      }

      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--app-width', `${window.innerWidth}px`);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleOrientationChange);
      handleOrientationChange(); // Initial call
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleOrientationChange);
      }
    };
  }, []);

  const dismissOrientationMessage = () => {
    setOrientationMessage({ show: false, message: '' });
  };

  return { orientationMessage, dismissOrientationMessage };
};
