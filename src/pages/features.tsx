import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DesktopFeatureSlider from '@/components/features/DesktopFeatureSlider';

const FeaturesPage = () => {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 🚨 WATCHDOG: Automatischer Reset wenn Features-Seite zu lange hängt
  useEffect(() => {
    const watchdog = setTimeout(() => {
      console.warn('[Watchdog] Features-Seite hängt beim Laden - automatischer Reset wird eingeleitet...');
      window.location.href = '/kill-sw.html?auto=true';
    }, 25000); // 25 Sekunden Timeout (etwas länger für Bild-Downloads)
    
    return () => clearTimeout(watchdog);
  }, []);

  const handleClose = () => {
    // Navigiert zur Startseite, wenn der Slider geschlossen wird
    router.push('/');
  };

  // Während der Server-Side-Rendering Phase nichts anzeigen
  if (!isClient) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Features werden geladen...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900">
      <DesktopFeatureSlider
        isOpen={true}
        onClose={handleClose}
        initialIndex={0}
      />
    </div>
  );
};

export default FeaturesPage;
