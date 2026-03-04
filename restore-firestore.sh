#!/bin/bash

# 🔄 FIRESTORE VOLLSTÄNDIGES RESTORE SCRIPT
# 
# Dieses Script hilft beim vollständigen Restore eines Firestore Backups.
# Es listet verfügbare Backups auf und führt das Restore aus.
#
# Usage: ./restore-firestore.sh [BACKUP_DATE]
#   Beispiel: ./restore-firestore.sh 2025-10-31T04-00-00
#
# ⚠️  WICHTIG: Ein vollständiges Restore überschreibt ALLE aktuellen Daten!

set -e  # Exit on error

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ID="jassguru"
BUCKET_BASE="gs://jassguru-firestore-backups"

echo -e "${YELLOW}🔄 FIRESTORE VOLLSTÄNDIGES RESTORE${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Prüfe ob gcloud installiert ist
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ FEHLER: gcloud CLI ist nicht installiert!${NC}"
    echo "Installiere es hier: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Prüfe Authentifizierung
echo "🔐 Prüfe Authentifizierung..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️  Nicht authentifiziert. Bitte einloggen...${NC}"
    gcloud auth login
fi

# Setze Projekt
echo "📦 Setze Projekt: ${PROJECT_ID}"
gcloud config set project ${PROJECT_ID}

# Funktion: Liste verfügbare Backups
list_backups() {
    echo ""
    echo -e "${GREEN}📋 Verfügbare Backups:${NC}"
    echo "═══════════════════════════════════════════════════════════"
    
    gsutil ls ${BUCKET_BASE}/ 2>/dev/null | grep "backup-" | sort -r | while read backup_path; do
        backup_name=$(basename ${backup_path})
        backup_date=$(echo ${backup_name} | sed 's/backup-//')
        echo "  📅 ${backup_date}"
    done
    
    echo ""
}

# Funktion: Prüfe ob Backup existiert
check_backup_exists() {
    local backup_path="${BUCKET_BASE}/backup-${1}"
    if gsutil ls ${backup_path} &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Funktion: Führe Restore aus
restore_backup() {
    local backup_date=$1
    local backup_path="${BUCKET_BASE}/backup-${backup_date}"
    
    echo ""
    echo -e "${RED}⚠️  WARNUNG: Dies wird ALLE aktuellen Firestore-Daten überschreiben!${NC}"
    echo ""
    echo "Backup: ${backup_path}"
    echo ""
    read -p "Fortfahren? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}❌ Restore abgebrochen.${NC}"
        exit 0
    fi
    
    echo ""
    echo "🔄 Starte vollständiges Restore..."
    echo "   Dies kann 5-10 Minuten dauern..."
    echo ""
    
    # Führe Restore aus
    gcloud firestore import ${backup_path}
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Restore erfolgreich abgeschlossen!${NC}"
        echo ""
        echo "📝 NÄCHSTE SCHRITTE:"
        echo "   1. Prüfe Firestore Console ob alle Daten wiederhergestellt wurden"
        echo "   2. Prüfe ob Test-Session E2NR2w1QQqhkA9x6TM8E4 weg ist"
        echo "   3. Teste die App"
        echo ""
    else
        echo ""
        echo -e "${RED}❌ Restore fehlgeschlagen!${NC}"
        echo "   Prüfe Fehlermeldungen oben."
        exit 1
    fi
}

# MAIN LOGIC
if [ -z "$1" ]; then
    # Kein Backup-Datum angegeben - zeige verfügbare Backups
    list_backups
    
    echo -e "${YELLOW}💡 Verwendung:${NC}"
    echo "   ./restore-firestore.sh 2025-10-31T04-00-00"
    echo ""
    echo "   Oder wähle ein Backup aus der Liste oben."
    exit 0
fi

# Backup-Datum wurde angegeben
BACKUP_DATE=$1

# Prüfe ob Backup existiert
if ! check_backup_exists ${BACKUP_DATE}; then
    echo -e "${RED}❌ FEHLER: Backup 'backup-${BACKUP_DATE}' existiert nicht!${NC}"
    echo ""
    list_backups
    exit 1
fi

# Führe Restore aus
restore_backup ${BACKUP_DATE}

