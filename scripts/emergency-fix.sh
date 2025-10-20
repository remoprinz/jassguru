#!/bin/bash
# Emergency Fix für Service Worker Mismatch
# Dieses Script behebt das akute Problem

echo "🚨 NOTFALL-FIX: Service Worker Mismatch beheben..."

# 1. Alte Service Worker im Root löschen
echo "🧹 Lösche alte Service Worker im Root..."
rm -f sw.js workbox-*.js fallback-*.js*

# 2. Alte Builds bereinigen
echo "🧹 Bereinige out/ Verzeichnis..."
rm -rf out/

# 3. Public bereinigen
echo "🧹 Bereinige public/ Verzeichnis..."
rm -f public/sw*.js public/workbox-*.js public/fallback-*.js*

# 4. Clean Build durchführen
echo "🔨 Führe sauberen Build durch..."
npm run clean
npm run build

# 5. Validierung
echo "✅ Validiere Build..."
npm run validate

echo "🎉 Notfall-Fix abgeschlossen! Jetzt deployen mit: npm run deploy"
