# Deployment Guide für jassguru.ch

## 🚀 Deployment Prozess

### Automatisches Deployment

**GitHub Actions** deployed automatisch bei Push auf `main` oder `master` Branch.

### Manuelles Deployment

```bash
# Standard Deployment mit Validierung
npm run deploy

# Force Deployment ohne Validierung (nur im Notfall)
npm run deploy:force
```

## 🔍 Validierung & Health Checks

### Pre-Deployment Validierung

```bash
# Überprüft Build-Integrität vor Deployment
npm run validate
```

Überprüft:
- ✅ Existenz des `out` Verzeichnisses
- ✅ Kritische Dateien (index.html, manifest.json, sw.js)
- ✅ CSS und JS Dateien
- ✅ Build ID
- ✅ HTML Struktur

### Post-Deployment Health Check

```bash
# Überprüft ob die Live-Seite funktioniert
npm run health
```

Testet:
- ✅ Hauptseite erreichbar
- ✅ CSS Dateien werden korrekt geladen
- ✅ JavaScript Dateien funktionieren
- ✅ PWA-Ressourcen verfügbar
- ✅ Korrekte MIME-Types

### Schneller Deployment-Status Check

```bash
# Prüft MIME-Types der CSS Dateien
npm run check:deployment
```

## 🛠️ Fehlerbehebung

### Problem: MIME-Type Fehler

**Symptome:**
- "Refused to apply style... MIME type ('text/html')"
- CSS/JS wird nicht geladen

**Lösung:**
```bash
# Neues Deployment durchführen
npm run deploy
```

### Problem: Build fehlgeschlagen

**Lösung:**
```bash
# Clean Build durchführen
npm run clean
npm run build
npm run validate
```

### Problem: Deployment fehlgeschlagen

**Lösung:**
```bash
# Firebase CLI aktualisieren
npm install -g firebase-tools

# Erneut einloggen
firebase login

# Deployment wiederholen
npm run deploy
```

## 📊 Monitoring

### Regelmäßige Health Checks

Empfohlen: Health Check nach jedem Deployment und täglich ausführen.

```bash
# Manueller Health Check
npm run health

# In Cron Job (täglich um 8:00)
0 8 * * * cd /path/to/jasstafel && npm run health
```

### Deployment-Historie

Firebase Console: https://console.firebase.google.com/project/jassguru/hosting

## 🔐 Sicherheit

### GitHub Secrets erforderlich

Für automatisches Deployment müssen folgende Secrets in GitHub konfiguriert sein:

- `FIREBASE_SERVICE_ACCOUNT`: Firebase Service Account JSON
- `NEXT_PUBLIC_FIREBASE_*`: Alle Firebase Config Variablen

### Lokale Environment Variablen

`.env.local` muss alle erforderlichen Variablen enthalten.

## 📝 Best Practices

1. **Immer testen vor Deployment**
   ```bash
   npm run build
   npm run validate
   ```

2. **Health Check nach Deployment**
   ```bash
   npm run health
   ```

3. **Bei Problemen: Force Deployment vermeiden**
   - Erst Ursache finden
   - Validierung nicht überspringen

4. **Cache berücksichtigen**
   - Browser-Cache kann alte Version zeigen
   - Hard Refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

## 🚨 Notfall-Prozedur

Bei kritischen Problemen:

1. **Rollback über Firebase Console**
   - https://console.firebase.google.com/project/jassguru/hosting
   - "View all releases" → Vorherige Version aktivieren

2. **Lokales Backup deployen**
   ```bash
   git checkout [last-working-commit]
   npm run deploy:force
   ```

3. **Support kontaktieren**
   - Firebase Support für Hosting-Probleme
   - GitHub Issues für App-Bugs 