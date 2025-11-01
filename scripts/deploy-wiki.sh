#!/bin/bash
# 🚀 Jasswiki Deployment Script (v2 - Flat Structure)
# Baut die Seite und kopiert die Wiki-Inhalte direkt in das Root-Verzeichnis.

set -e

echo "🔨 Building Next.js..."
npm run build

echo "📦 Creating new flat structure in out-wiki..."
rm -rf out-wiki
mkdir -p out-wiki

# 🎯 KRITISCH: Kopiere den Inhalt von /wissen direkt ins Root-Verzeichnis
echo "📚 Copying wiki content to root..."
cp -r out/wissen/* out-wiki/

# Kopiere notwendige Assets
echo "🖼️ Copying assets (_next, sitemap, etc.)..."
cp -r out/_next out-wiki/
cp out/favicon.ico out-wiki/ 2>/dev/null || true
cp out/manifest.json out-wiki/ 2>/dev/null || true

# Sitemap-Logik
if [ -f "out/sitemap.xml" ]; then
    echo "✅ Wiki-Sitemap (sitemap.xml) found and copied."
    cp out/sitemap.xml out-wiki/
    cp out/sitemap-*.xml out-wiki/ 2>/dev/null || true
else
    echo "❌ CRITICAL ERROR: out/sitemap.xml not found!"
    exit 1
fi

cp out/robots.txt out-wiki/ 2>/dev/null || true
cp out/google54b45cd6cd256a20.html out-wiki/ 2>/dev/null || true

echo "🚀 Deploying to Firebase..."
firebase deploy --only hosting:jasswiki

echo "✅ Deployment complete!"
echo "📍 jasswiki.ch - Wiki is live with the new flat structure."