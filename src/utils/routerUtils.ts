import { NextRouter } from 'next/router';

// Letzte Navigationszeit für Debouncing
let lastNavigationTimestamp = 0;
const ROUTER_DEBOUNCE_MS = 300; // Mindestzeit zwischen Router-Navigationen

/**
 * Führt einen Seitenwechsel mit Debouncing durch, um zu viele Aufrufe von
 * history.pushState() zu vermeiden, was zu Browser-Sicherheitsfehlern führen kann.
 * 
 * @param router Next.js Router-Objekt
 * @param path Zielpfad für die Navigation
 * @param options Optionale Router-Optionen (wie bei router.push)
 * @param force Optional: Wenn true, wird das Debouncing überspringen
 * @returns Promise, das erfüllt wird, wenn die Navigation abgeschlossen ist oder verworfen wird
 */
export const debouncedRouterPush = async (
  router: NextRouter,
  path: string,
  options?: any,
  force: boolean = false
): Promise<boolean> => {
  const now = Date.now();
  
  // Debounce-Check für normale Navigationen
  if (!force && lastNavigationTimestamp && (now - lastNavigationTimestamp) < ROUTER_DEBOUNCE_MS) {
    // console.log(`[RouterUtils] Navigation zu ${path} gedrosselt. Warte ${ROUTER_DEBOUNCE_MS - (now - lastNavigationTimestamp)}ms`);
    return false;
  }
  
  // Timestamp setzen und Navigation ausführen
  lastNavigationTimestamp = now;
  
  // Führe die eigentliche Navigation durch
  try {
    // console.log(`[RouterUtils] Navigating to ${path} (Force: ${force})`);
    await router.push(path, undefined, options);
    return true;
  } catch (error) {
    console.error(`[RouterUtils] Fehler bei Navigation zu ${path}:`, error);
    return false;
  }
};

/**
 * Führt einen Seitenwechsel mit Replace und Debouncing durch
 * 
 * @param router Next.js Router-Objekt
 * @param path Zielpfad für die Navigation
 * @param options Optionale Router-Optionen (wie bei router.replace)
 * @param force Optional: Wenn true, wird das Debouncing überspringen
 * @returns Promise, das erfüllt wird, wenn die Navigation abgeschlossen ist oder verworfen wird
 */
export const debouncedRouterReplace = async (
  router: NextRouter,
  path: string,
  options?: any,
  force: boolean = false
): Promise<boolean> => {
  const now = Date.now();
  
  // Debounce-Check für Replace-Navigationen
  if (!force && lastNavigationTimestamp && (now - lastNavigationTimestamp) < ROUTER_DEBOUNCE_MS) {
    // console.log(`[RouterUtils] Replace-Navigation zu ${path} gedrosselt. Warte ${ROUTER_DEBOUNCE_MS - (now - lastNavigationTimestamp)}ms`);
    return false;
  }
  
  // Timestamp setzen und Navigation ausführen
  lastNavigationTimestamp = now;
  
  // Führe die eigentliche Navigation durch
  try {
    // console.log(`[RouterUtils] Replacing to ${path} (Force: ${force})`);
    await router.replace(path, undefined, options);
    return true;
  } catch (error) {
    console.error(`[RouterUtils] Fehler bei Replace-Navigation zu ${path}:`, error);
    return false;
  }
}; 