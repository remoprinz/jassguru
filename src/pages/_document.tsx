// src/components/_document.tsx

import Document, {Html, Head, Main, NextScript} from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html lang="de">
        <Head>
          {/* Viewport für iOS Safe Areas */}
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          
          {/* Bestehende Meta-Tags */}
          <meta name="application-name" content="jassguru.ch" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="jassguru.ch" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#000000" />

          {/* iOS-spezifische Icons */}
          <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
          <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon.png?v=2" />
          
          {/* PWA Icons */}
          <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=2" />
          <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=2" />
          
          {/* Favicon für Browser */}
          <link rel="icon" href="/favicon.ico?v=2" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
          {/* Web App Manifest */}
          <link rel="manifest" href="/manifest.json" />

          {/* iOS Splash Screens */}
          <link rel="apple-touch-startup-image" href="/splash-640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" />
          <link rel="apple-touch-startup-image" href="/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
          <link rel="apple-touch-startup-image" href="/splash-1242x2208.png" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)" />
          <link rel="apple-touch-startup-image" href="/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
          <link rel="apple-touch-startup-image" href="/splash-1536x2048.png" media="(min-device-width: 768px) and (max-device-width: 1024px) and (-webkit-min-device-pixel-ratio: 2)" />
          <link rel="apple-touch-startup-image" href="/splash-1668x2224.png" media="(min-device-width: 834px) and (max-device-width: 834px) and (-webkit-min-device-pixel-ratio: 2)" />
          <link rel="apple-touch-startup-image" href="/splash-2048x2732.png" media="(min-device-width: 1024px) and (max-device-width: 1024px) and (-webkit-min-device-pixel-ratio: 2)" />

          {/* Zusätzliche Meta-Tags */}
          <meta name="description" content="Schneller, smarter, vernetzter Jassen" />
          <meta name="apple-touch-fullscreen" content="yes" />
          <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
          <meta httpEquiv="Pragma" content="no-cache" />
          <meta httpEquiv="Expires" content="0" />

          {/* Inline-Failsafe: Wenn die App in der PWA nicht binnen 2s hydriert,
              deregistriere evtl. Legacy-SWs und lade einmal mit ?no-sw=1 neu. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(() => {
  try {
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator && navigator['standalone']);

    // Erlaubt dem App-Code den Timeout abzubrechen, sobald Hydration beginnt
    window.cancelPwaLoadTimeout = function() {
      try { clearTimeout(window['__pwaHydrationTimer__']); } catch (e) {}
    };

    const url = new URL(window.location.href);
    if (url.searchParams.get('no-sw') === '1') {
      window['__NO_SW__'] = true;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); }).catch(function(){});
      }
      if ('caches' in window) {
        caches.keys().then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); }).catch(function(){});
      }
    }

    if (isStandalone) {
      // Schutz: Nicht erneut triggern, wenn bereits ein SW-Bypass aktiv ist
      if (window.location.search.includes('no-sw=1') || window.location.search.includes('updated=')) {
        return;
      }
      // Einmaliger Hydration-Fallback mit Session-Guard
      try {
        if (sessionStorage.getItem('hydrationReloaded') === '1') {
          return;
        }
      } catch (e) {}

      window['__pwaHydrationTimer__'] = setTimeout(async () => {
        try {
          // Wenn bis dahin keine Hydration passierte, härterer Reset
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
          const reloadUrl = new URL(window.location.href);
          if (!reloadUrl.searchParams.get('no-sw')) reloadUrl.searchParams.set('no-sw','1');
          try { sessionStorage.setItem('hydrationReloaded', '1'); } catch (e) {}
          window.location.replace(reloadUrl.toString());
        } catch (e) {
          window.location.reload();
        }
      }, 2000);
    }
  } catch (e) {}
})();`
            }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
