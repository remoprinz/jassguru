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
          message: 'Die Orientierungssperre ist zurzeit nicht möglich auf diesem Gerät. Drehen Sie die Jasstafel um 90 Grad.'

        });
      } else {
        setOrientationMessage({ show: false, message: '' });
      }

      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--app-width', `${window.innerWidth}px`);
    };

    window.addEventListener('resize', handleOrientationChange);
    handleOrientationChange(); // Initial call

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  const dismissMessage = () => {
    setOrientationMessage({ show: false, message: '' });
  };

  return { orientationMessage, dismissMessage };
};
