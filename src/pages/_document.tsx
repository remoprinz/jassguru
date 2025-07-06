// src/components/_document.tsx

import Document, {Html, Head, Main, NextScript} from "next/document";

class MyDocument extends Document {
  render() {
    return (
      <Html lang="de">
        <Head>
          {/* Bestehende Meta-Tags */}
                  <meta name="application-name" content="jassguru.ch" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="jassguru.ch" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#000000" />
          <meta name="format-detection" content="telephone=no" />

          {/* iOS-spezifische Icons */}
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="192x192" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="512x512" href="/apple-touch-icon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          {/* Favicon für Browser */}
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon.png" />
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
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-touch-fullscreen" content="yes" />
          <link rel="apple-touch-startup-image" href="/splash.png" />
          <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
          <meta httpEquiv="Pragma" content="no-cache" />
          <meta httpEquiv="Expires" content="0" />
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
