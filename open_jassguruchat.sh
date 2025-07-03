#!/bin/bash

# Skript zum Öffnen von jassguruchat in Cursor
echo "🚀 Öffne jassguruchat in Cursor..."

# Pfad zum jassguruchat Ordner
JASSGURUCHAT_PATH="/Users/remoprinz/Documents/Jassguru/jassguruchat"

# Überprüfe ob der Ordner existiert
if [ ! -d "$JASSGURUCHAT_PATH" ]; then
    echo "❌ Fehler: jassguruchat Ordner nicht gefunden!"
    echo "Erwartet: $JASSGURUCHAT_PATH"
    exit 1
fi

# Zeige Ordner-Info
echo "📁 Ordner gefunden: $JASSGURUCHAT_PATH"
echo "📊 Größe: $(du -sh "$JASSGURUCHAT_PATH" | cut -f1)"
echo "📄 Dateien: $(find "$JASSGURUCHAT_PATH" -type f | wc -l | tr -d ' ')"

# Öffne in Cursor
echo "🎯 Öffne in Cursor..."
cursor "$JASSGURUCHAT_PATH"

echo "✅ Fertig! jassguruchat sollte jetzt in Cursor geöffnet sein." 