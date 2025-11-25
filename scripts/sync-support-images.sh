#!/bin/bash
# 🔄 Synchronisiert Support-Bilder von jassguru-support nach jasstafel
# 
# Usage: ./scripts/sync-support-images.sh
# Oder: npm run sync:support-images

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JASSTAFEL_ROOT="$PROJECT_ROOT"
JASSTAFEL_SUPPORT_ROOT="$(cd "$PROJECT_ROOT/../jassguru-support" && pwd)"

echo "🔄 Synchronisiere Support-Bilder..."
echo "   Quelle: $JASSTAFEL_SUPPORT_ROOT/public/screenshots/"
echo "   Ziel:   $JASSTAFEL_ROOT/public/support-images/"

# Prüfe ob Quelle existiert
if [ ! -d "$JASSTAFEL_SUPPORT_ROOT/public/screenshots" ]; then
  echo "❌ Fehler: Quelle-Verzeichnis nicht gefunden: $JASSTAFEL_SUPPORT_ROOT/public/screenshots"
  exit 1
fi

# Erstelle Ziel-Verzeichnis falls nicht vorhanden
mkdir -p "$JASSTAFEL_ROOT/public/support-images"

# Synchronisiere Bilder (rsync mit --delete für vollständige Synchronisation)
rsync -av --delete \
  "$JASSTAFEL_SUPPORT_ROOT/public/screenshots/" \
  "$JASSTAFEL_ROOT/public/support-images/"

echo "✅ Synchronisation abgeschlossen!"
echo "📊 Prüfe Anzahl der synchronisierten Dateien..."
echo "   $(find "$JASSTAFEL_ROOT/public/support-images" -type f | wc -l | xargs) Dateien synchronisiert"

