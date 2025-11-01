# 🔄 FIRESTORE VOLLSTÄNDIGES RESTORE

## ⚠️ WICHTIG: Vollständiges Restore löscht ALLE aktuellen Daten!

Ein vollständiges Restore überschreibt **ALLE** Collections in Firestore:
- ✅ `groups/` (inkl. `stats/computed`, `aggregated/*`, `jassGameSummaries/*`)
- ✅ `players/` (inkl. `globalStats`, `ratingHistory/*`, `partnerStats/*`, etc.)
- ✅ `tournaments/`
- ✅ `activeGames/`
- ✅ `sessions/`
- ✅ `users/`
- ✅ Alle anderen Collections

---

## 🎯 METHODE 1: Firebase Console (Empfohlen für Anfänger)

### Schritt 1: Backup finden

1. Gehe zu [Google Cloud Console](https://console.cloud.google.com/)
2. Wähle Projekt: **jassguru**
3. Gehe zu **Firestore** → **Backups**
4. Oder: Prüfe **Cloud Storage** Bucket: `jassguru-firestore-backups/`

### Schritt 2: Restore starten

#### Option A: Über Firestore Backups Seite (EINFACHER!)

1. Gehe zu: **Firestore** → **Backups**
2. Wähle das gewünschte Backup (z.B. 31. Oktober 2025)
3. Klicke auf **Restore**
4. **WICHTIG**: Stelle sicher, dass **ALLE Collections** ausgewählt sind (nicht nur `groups/`)
5. Starte den Restore-Prozess

#### Option B: Über "Importieren" (Wenn du den Dialog schon offen hast)

1. **Klicke auf "Durchsuchen"**
2. Navigiere zu deinem Backup-Ordner:
   - Bucket: `jassguru-firestore-backups/`
   - Ordner: `2025-10-31T15:23:00_29342/` (dein Backup-Datum)
3. **WICHTIG**: Wähle die Datei die auf **`.overall_export_metadata`** endet:
   - `2025-10-31T15:23:00_29342.overall_export_metadata` ✅
   - **NICHT** den Ordner `all_namespaces/` ❌
4. Klicke "Importieren"
5. **WICHTIG**: Im nächsten Schritt **ALLE Collections** auswählen (nicht nur `groups/`)

**Dauer:** ~5-10 Minuten (abhängig von Datenmenge)

---

## 🎯 METHODE 2: gcloud CLI (Für Power-User)

### Schritt 1: Backup-Verzeichnis finden

```bash
# Liste alle Backups im Bucket
gsutil ls gs://jassguru-firestore-backups/

# Beispiel Output:
# gs://jassguru-firestore-backups/backup-2025-10-31T04-00-00/
# gs://jassguru-firestore-backups/backup-2025-11-01T04-00-00/
```

### Schritt 2: Backup-Datum wählen

**WICHTIG**: Wähle das Backup VOR der Test-Session!

```bash
# Beispiel: Backup vom 31. Oktober 2025 (vor Test-Session)
BACKUP_PATH="gs://jassguru-firestore-backups/backup-2025-10-31T04-00-00"
```

### Schritt 3: Vollständiges Restore ausführen

```bash
# Authentifiziere dich
gcloud auth login

# Setze das Projekt
gcloud config set project jassguru

# Führe vollständiges Restore aus
gcloud firestore import ${BACKUP_PATH}
```

**Parameter:**
- `--database-id` (optional): Standard ist `(default)`
- `--collection-ids` (optional): Wenn leer, werden ALLE Collections wiederhergestellt ✅

**Dauer:** ~5-10 Minuten

---

## 🎯 METHODE 3: Script (Automatisiert)

Ich kann dir ein Script erstellen, das:
1. Alle verfügbaren Backups auflistet
2. Das neueste Backup vor der Test-Session findet
3. Vollständiges Restore ausführt

Soll ich das Script erstellen?

---

## ⚠️ WICHTIGE HINWEISE

### Vor dem Restore

1. **Sichere wichtige Daten** (falls nötig)
2. **Informiere alle Benutzer** (Service ist während Restore nicht verfügbar)
3. **Wähle das richtige Backup** (vor der Test-Session!)

### Nach dem Restore

1. **Prüfe die Daten** in Firestore Console
2. **Teste die App** ob alles funktioniert
3. **Falls nötig**: Führe Backfill aus (normalerweise nicht nötig nach vollständigem Restore)

---

## 🔍 BACKUP VERFÜGBARKEIT PRÜFEN

### Über gcloud:

```bash
# Liste alle Backups
gsutil ls -r gs://jassguru-firestore-backups/

# Zeige Details eines Backups
gsutil ls -lh gs://jassguru-firestore-backups/backup-2025-10-31T04-00-00/
```

### Über Firebase Console:

1. Firestore → Backups
2. Oder: Cloud Storage → Bucket `jassguru-firestore-backups`

---

## 📅 BACKUP-ZEITPUNKT FINDEN

Deine Test-Session war am **1. November 2025**.

**Empfohlenes Backup:**
- **31. Oktober 2025** (vor der Test-Session)
- Oder: **30. Oktober 2025** (falls 31. Oktober nicht verfügbar)

**Backups werden jeden Freitag um 4:00 Uhr erstellt** (siehe `scheduledTasks.ts`)

---

## ✅ NACH DEM RESTORE

### 1. Daten prüfen

```bash
# Prüfe ob alles wiederhergestellt wurde
# Firestore Console → Prüfe:
# - groups/{groupId}/stats/computed
# - players/{playerId}/globalStats
# - groups/{groupId}/jassGameSummaries (keine Test-Session!)
```

### 2. Test-Session sollte weg sein

Die Test-Session `E2NR2w1QQqhkA9x6TM8E4` sollte **nicht mehr existieren**.

### 3. Wenn Probleme auftreten

Falls nach Restore Daten inkonsistent sind:

```bash
# Vollständiger Backfill (falls nötig)
node backfill-elo-v2.cjs --execute
npm run backfill-player-data -- --confirm
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
node backfill-groupstats.cjs
```

---

## 🚨 FEHLERBEHEBUNG

### "Backup nicht gefunden"
- Prüfe ob Backup im Bucket existiert
- Prüfe Backup-Pfad (Timestamp-Format)

### "Permission denied"
- Prüfe gcloud Authentifizierung
- Prüfe IAM-Berechtigungen für Firestore Import

### "Restore dauert zu lange"
- Normal für große Datenbanken
- Prüfe Status in Google Cloud Console

---

## 💡 EMPFEHLUNG

**Für deinen Fall (Test-Session entfernen):**

1. **Finde Backup vom 31. Oktober 2025** (oder davor)
2. **Führe vollständiges Restore aus** (alle Collections)
3. **Prüfe ob Test-Session weg ist**
4. **Fertig!** ✅

**Kein Backfill nötig**, da ALLE Daten wiederhergestellt wurden!

