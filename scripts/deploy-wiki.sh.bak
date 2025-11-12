#!/bin/bash

# 🚀 Jasswiki Deployment Script
# Automatisches Kopieren der Wiki-Inhalte und Deployment

set -e

echo "🔨 Building Next.js..."
npm run build

echo "📦 Copying wiki content to out-wiki..."
rm -rf out-wiki
mkdir -p out-wiki

# Kopiere Wiki-Inhalte MIT dem /wissen/ Präfix (primäre Struktur)
cp -r out/wissen out-wiki/wissen

# 🎯 KRITISCH: Kopiere AUCH in die alten Pfade für Legacy-URLs
# Dies stellt sicher, dass alte Google-URLs FUNKTIONIEREN
echo "📋 Creating legacy URL structure for backwards compatibility..."
cp -r out/wissen/jassapps out-wiki/jassapps
cp -r out/wissen/begriffe out-wiki/begriffe
cp -r out/wissen/varianten out-wiki/varianten
cp -r out/wissen/regeln out-wiki/regeln
cp -r out/wissen/schieber out-wiki/schieber
cp -r out/wissen/geschichte out-wiki/geschichte
cp -r out/wissen/grundlagen-kultur out-wiki/grundlagen-kultur
cp -r out/wissen/weis-regeln out-wiki/weis-regeln 2>/dev/null || true
cp -r out/wissen/referenzen out-wiki/referenzen 2>/dev/null || true
cp -r out/wissen/quellen out-wiki/quellen 2>/dev/null || true
cp -r out/wissen/quellenverzeichnis out-wiki/quellenverzeichnis 2>/dev/null || true

# 🔄 Füge JavaScript-Redirect zu allen Legacy-Seiten hinzu
echo "🔄 Adding JavaScript redirects to legacy pages..."
find out-wiki/jassapps out-wiki/begriffe out-wiki/varianten out-wiki/regeln out-wiki/schieber out-wiki/geschichte out-wiki/grundlagen-kultur -name "*.html" 2>/dev/null | while read file; do
    # Füge Redirect-Script vor </head> ein
    sed -i '' 's|</head>|<script>if(!window.location.pathname.startsWith("/wissen/")){const newPath="/wissen"+window.location.pathname;window.location.replace(newPath);}</script></head>|g' "$file"
done

echo "✅ Legacy structure created with auto-redirects"

# Erstelle Root-Index mit Redirect zu /wissen/
cat > out-wiki/index.html << 'EOF'
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jass-Wiki - Alle offiziellen Jassregeln der Schweiz</title>
    <meta name="description" content="Das umfassende Jass-Wiki mit allen offiziellen Regeln, Strategien und Wissen zum Schweizer Kartenspiel Jass.">
    <link rel="canonical" href="https://jasswiki.ch/wissen/">
    <meta http-equiv="refresh" content="0;url=/wissen/">
    <script>window.location.replace('/wissen/');</script>
</head>
<body>
    <p>Weiterleitung zum <a href="/wissen/">Jass-Wiki</a>...</p>
</body>
</html>
EOF

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
