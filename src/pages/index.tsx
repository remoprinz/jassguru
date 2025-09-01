"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import WelcomeScreen from '../components/auth/WelcomeScreen';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';

// Dynamischer Import der Seiten, um die Ladezeit der Startseite zu optimieren
const FeaturesPage = dynamic(() => import('./features'), {
  loading: () => <div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white">Features werden geladen...</div>,
  ssr: false
});
const PublicProfilePage = dynamic(() => import('./profile/[playerId]'), {
  loading: () => <div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white">Profil wird geladen...</div>,
  ssr: false
});
const PublicGroupPage = dynamic(() => import('./view/group/[groupId]'), {
  loading: () => <div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white">Gruppe wird geladen...</div>,
  ssr: false
});

const LoadingComponent = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
    <Loader2 className="h-8 w-8 text-white animate-spin" />
  </div>
);

const HomePage = () => {
  const router = useRouter(); // Hole den Standard-Router als Basis
  const [renderData, setRenderData] = useState<{
    Component: React.ComponentType | null;
    value: any; // Der Wert für den RouterContext.Provider
  }>({ Component: null, value: router });

  useEffect(() => {
    // Dieser Code wird nur im Browser ausgeführt
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(Boolean);

    let ComponentToRender: React.ComponentType | null = null;
    const newRouterState = { ...router }; // Erstelle eine Kopie des Routers zum Modifizieren

    if (path.startsWith('/features')) { // Erkennt /features und /features/
      ComponentToRender = FeaturesPage;
      newRouterState.pathname = '/features';
      newRouterState.asPath = '/features';
    } else if (path.startsWith('/profile/') && pathParts.length === 2) {
      ComponentToRender = PublicProfilePage;
      const playerId = pathParts[1];
      newRouterState.pathname = '/profile/[playerId]';
      newRouterState.query = { playerId: playerId };
      newRouterState.asPath = path;
    } else if (path.startsWith('/view/group/') && pathParts.length === 3) {
      ComponentToRender = PublicGroupPage;
      const groupId = pathParts[2];
      newRouterState.pathname = '/view/group/[groupId]';
      newRouterState.query = { groupId: groupId };
      newRouterState.asPath = path;
    } else {
      // Für alle anderen Pfade (z.B. die Startseite '/')
      ComponentToRender = WelcomeScreen;
    }
    
    setRenderData({ Component: ComponentToRender, value: newRouterState });

  }, []); // Nur einmal beim ersten Laden ausführen

  if (!renderData.Component) {
    return <LoadingComponent />;
  }

  // Stelle der zu rendernden Komponente den modifizierten Router-Kontext zur Verfügung
  return (
    <RouterContext.Provider value={renderData.value}>
      <renderData.Component />
    </RouterContext.Provider>
  );
};

export default HomePage;
