#!/bin/bash

# Hauptverzeichnis definieren
BASE_DIR="/Users/remo/jassguru.ch/Jassguru"

# Aktivieren der virtuellen Umgebung
source $BASE_DIR/backend/myenv/bin/activate

# Sicherstellen, dass der PYTHONPATH korrekt gesetzt ist
export PYTHONPATH=$PYTHONPATH:$BASE_DIR

# Setzen der Umgebungsvariablen
export FLASK_ENV=development
export FIREBASE_ADMIN_SDK_PATH="/Users/remo/jassguru.ch/jassguru-firebase-adminsdk-44hjy-458d5c3872.json"
export FLASK_APP="jassapp.py"
export DATABASE_URL="sqlite:////Users/remo/jassguru.ch/Jassguru/backend/instance/jassapp.db"

# Aktualisieren der Python-Pakete
pip install --upgrade -r $BASE_DIR/backend/requirements.txt

# Speichern der aktuellen Paketversionen
pip freeze > $BASE_DIR/backend/requirements.txt

# Starten des Backends
cd $BASE_DIR/backend
python jassapp.py
