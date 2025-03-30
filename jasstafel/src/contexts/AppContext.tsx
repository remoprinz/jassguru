import React, { createContext, useContext, useState, useEffect } from 'react';

interface AppContextType {
  isPWA: boolean;
}

const AppContext = createContext<AppContextType>({ isPWA: false });

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Definiere eine typensichere Schnittstelle für navigator
    interface IosNavigator extends Navigator {
      standalone?: boolean;
    }

    const checkPWA = () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
       (window.navigator as IosNavigator).standalone === true ||
       document.referrer.includes('android-app://'));

    setIsPWA(checkPWA());
  }, []);

  return (
    <AppContext.Provider value={{ isPWA }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);