import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DesktopFeatureSlider from '@/components/features/DesktopFeatureSlider';

const FeaturesPage = () => {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // 🛡️ KRITISCH: Globalen PWA-Watchdog abbrechen
    // Verhindert fälschliche Weiterleitung zur Recovery-Seite
    if (typeof window !== 'undefined' && typeof window.cancelPwaLoadTimeout === 'function') {
      window.cancelPwaLoadTimeout();
    }
  }, []);


  const handleClose = () => {
    // Navigiert zur Startseite, wenn der Slider geschlossen wird
    router.push('/');
  };

  // Während der Server-Side-Rendering Phase nichts anzeigen
  if (!isClient) {
    return (
      <div className="fixed inset-0 chalkboard-bg flex items-center justify-center">
        <div className="text-white text-xl">Features werden geladen...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 chalkboard-bg">
      <DesktopFeatureSlider
        isOpen={true}
        onClose={handleClose}
        initialIndex={0}
      />
    </div>
  );
};

export default FeaturesPage;
