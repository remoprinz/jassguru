import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ch.jassguru.app',
  appName: 'JassGuru',
  webDir: 'out',
  server: {
    // App lädt direkt die Live-PWA von jassguru.ch.
    // Vorteil: Auth funktioniert (Origin = jassguru.ch, Firebase-whitelisted),
    // Web-/App-Code 1:1 identisch, Updates ohne App-Review-Cycle.
    // Nachteil: braucht Internet beim Start (offline siehe Fallback in JS).
    url: 'https://jassguru.ch',
    // iOS soll auch zu externen Schwester-Sites navigieren können (innerhalb
    // des WebViews), damit Links zu jassverband / jasswiki nicht ins App-Nirvana
    // gehen. Externer Browser für diese Links ist ein späterer Polish-Step.
    allowNavigation: [
      'jassguru.ch',
      '*.jassguru.ch',
      'jassverband.ch',
      '*.jassverband.ch',
      'jasswiki.ch',
      '*.jasswiki.ch',
    ],
  },
};

export default config;
