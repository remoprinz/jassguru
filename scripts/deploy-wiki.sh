#!/bin/bash
# 🚀 Jasswiki Deployment Script (v4 - Final & Clean)
# Baut NUR das Wiki und deployt es direkt.

set -e

echo "🔨 Building Next.js for Wiki..."
# Wir setzen eine Variable, um in der Zukunft ggf. zwischen App- und Wiki-Builds zu unterscheiden
# Aktuell wird durch die Seitenstruktur nur das Wiki gebaut.
NEXT_PUBLIC_BUILD_MODE=wiki npm run build

# 🔥 FIX: Die out/index.html ist die Jassguru-App-Homepage, nicht die Wiki-Homepage.
# Wir kopieren die Wiki-Homepage (out/wissen/index.html) nach out/index.html
echo "🔧 Replacing root index.html with Wiki homepage..."

if [ ! -f "out/wissen/index.html" ]; then
  echo "❌ ERROR: out/wissen/index.html does not exist!"
  exit 1
fi

# Kopiere die Wiki-Homepage an die Root
cp out/wissen/index.html out/index.html

# Aktualisiere die internen Links von /wissen/* zu /* in der Root-Homepage
# (damit Links auf der jasswiki.ch Root funktionieren)
sed -i '' 's|href="/wissen/|href="/|g' out/index.html
sed -i '' 's|href="/wissen"|href="/"|g' out/index.html

echo "✅ Wiki homepage copied to root index.html"

# Firebase erwartet 'out-wiki', nicht 'out'
echo "📦 Copying 'out' to 'out-wiki' for Firebase deployment..."
rm -rf out-wiki
cp -r out out-wiki

# Das `out-wiki` Verzeichnis enthält jetzt die saubere Wiki-Struktur.
echo "🚀 Deploying 'out-wiki' directory to Firebase..."
firebase deploy --only hosting:jasswiki

echo "✅ Deployment complete!"
echo "📍 jasswiki.ch is live with the new, clean structure."