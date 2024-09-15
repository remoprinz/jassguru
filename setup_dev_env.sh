#!/bin/bash

# Hauptverzeichnis definieren
BASE_DIR="/Users/remo/jassguru.ch/Jassguru"
BACKEND_DIR="$BASE_DIR/backend"

echo "------------------"
echo "Setup Dev Umgebung"
echo "------------------"

# Überprüfen, ob das Verzeichnis der virtuellen Umgebung existiert
if [ ! -d "$BACKEND_DIR/myenv" ]; then
    echo "Fehler: Das Verzeichnis der virtuellen Umgebung wurde nicht gefunden."
    exit 1
fi

# Aktivieren der virtuellen Umgebung
echo "Aktiviere virtuelle Umgebung..."
source $BACKEND_DIR/myenv/bin/activate

# Überprüfung, ob die virtuelle Umgebung aktiviert wurde
if [[ "$VIRTUAL_ENV" != "$BACKEND_DIR/myenv" ]]; then
    echo "Fehler: Die virtuelle Umgebung konnte nicht aktiviert werden."
    exit 1
fi

# Sicherstellen, dass der PYTHONPATH korrekt gesetzt ist
echo "Setze PYTHONPATH..."
export PYTHONPATH=$PYTHONPATH:$BACKEND_DIR

# Überprüfung, ob PYTHONPATH korrekt gesetzt wurde
if [[ "$PYTHONPATH" != *"$BACKEND_DIR"* ]]; then
    echo "Fehler: PYTHONPATH wurde nicht korrekt gesetzt."
    exit 1
fi

echo "Setup abgeschlossen!"
