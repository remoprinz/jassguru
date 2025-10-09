#!/bin/bash

# 🚀 Jasswiki Deployment Script
# Automatisches Kopieren der Wiki-Inhalte und Deployment

set -e

echo "🔨 Building Next.js..."
npm run build

echo "📦 Copying wiki content to out-wiki..."
rm -rf out-wiki
mkdir -p out-wiki

# Kopiere Wiki-Inhalte
cp -r out/wissen/* out-wiki/

# Kopiere notwendige Assets
cp -r out/_next out-wiki/
cp out/favicon.ico out-wiki/ 2>/dev/null || true
cp out/manifest.json out-wiki/ 2>/dev/null || true

# 🎯 KRITISCH: Robuste Sitemap-Logik
# Kopiere die Wiki-Sitemap (sitemap.xml und sitemap-0.xml)
if [ -f "out/sitemap.xml" ]; then
    echo "✅ Wiki-Sitemap (sitemap.xml) gefunden. Wird kopiert..."
    cp out/sitemap.xml out-wiki/
    # Kopiere auch die dazugehörigen Teile, falls es ein Index ist
    cp out/sitemap-*.xml out-wiki/ 2>/dev/null || true
else
    echo "❌ KRITISCHER FEHLER: out/sitemap.xml nicht gefunden!"
    echo "Das Deployment wird abgebrochen, um SEO-Probleme zu vermeiden."
    exit 1
fi

cp out/robots.txt out-wiki/ 2>/dev/null || true
cp out/google54b45cd6cd256a20.html out-wiki/ 2>/dev/null || true

echo "🚀 Deploying to Firebase..."
firebase deploy --only hosting:jassguru,hosting:jasswiki

echo "✅ Deployment complete!"
echo "📍 jassguru.ch - Complete app"
echo "📍 jasswiki.ch - Wiki only"
