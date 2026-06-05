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
      // Google-OAuth-Redirect (für signInWithRedirect)
      'accounts.google.com',
      'apis.google.com',
      'jassguru.firebaseapp.com',
    ],
    // Wenn jassguru.ch nicht erreichbar (Flugmodus / kein Netz beim App-Start),
    // zeigt Capacitor diese lokal gebündelte HTML-Seite. Apple-Reviewer
    // testet im Flugmodus — ohne das gäb's einen weissen Screen und Reject.
    errorPath: 'offline.html',
  },
  ios: {
    // contentInset NICHT auf 'always' setzen — sonst verschiebt iOS den
    // WebView-Origin nach unten unter die Status Bar, und env(safe-area-inset-top)
    // returnt dann 0. Folge: unser CSS (.profile-public-btn-top, etc.) rechnet
    // mit 0 Inset → Buttons landen unter der Status Bar.
    // Default ('never') lässt WebView OBEN überlappen, env() liefert echten Wert,
    // unser CSS positioniert korrekt.
    contentInset: 'never',
    // Erlaubt Safari Web Inspector für Debugging im WKWebView (in Safari:
    // Develop-Menü → Simulator → JassGuru). Schadet in Prod nicht.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
