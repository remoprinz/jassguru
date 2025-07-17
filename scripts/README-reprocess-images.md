# Profilbild Re-Processing Script

Dieses Script optimiert manuell hochgeladene Profilbilder durch die normale App-Pipeline.

## Was macht das Script?

1. **Download**: Lädt bestehende Profilbilder von Firebase Storage herunter
2. **Crop**: Schneidet sie zu quadratischem Format (zentriert)  
3. **Komprimierung**: Optimiert auf 800px max, 80% JPEG Qualität, <1MB
4. **Re-Upload**: Lädt optimierte Version zurück hoch
5. **Update**: Aktualisiert Firebase Auth + Firestore Player-Dokumente

## Setup

### 1. Dependencies installieren

```bash
# Von der Projektwurzel aus:
npm install sharp node-fetch firebase-admin
```

### 2. User IDs konfigurieren

Öffnen Sie `scripts/reprocess-profile-images.mjs` und ersetzen Sie die Platzhalter:

```javascript
const USERS_TO_REPROCESS = [
  'actual-firebase-user-id-1', 
  'actual-firebase-user-id-2',
  'actual-firebase-user-id-3'
];
```

**User IDs finden:**
- Firebase Console → Authentication → Users
- Oder Firebase Console → Firestore → users Collection

### 3. Firebase Admin Setup

Das Script benötigt Firebase Admin Zugriff. Stellen Sie sicher, dass eines davon vorhanden ist:

- **Lokal**: `functions/service-account-key.json` (bereits vorhanden)
- **Cloud**: Default Application Credentials

## Ausführung

```bash
# Von der Projektwurzel aus:
node scripts/reprocess-profile-images.mjs
```

## Beispiel-Output

```
🚀 Admin-Script: Re-Prozessierung von Profilbildern
============================================================
📋 3 User(s) zur Re-Prozessierung:
   1. abc123def456
   2. xyz789uvw012  
   3. mno345pqr678

🔄 Beginne Re-Prozessierung für User: abc123def456
📥 Lade vorhandenes Bild herunter: https://storage.googleapis.com/...
📊 Original-Bildgröße: 3.45MB
✂️ Crop zu quadratischem Format...
📊 Nach Crop: 2.98MB
🗜️ Komprimiere auf 800px, 80% Qualität...
📊 Nach Komprimierung: 0.32MB
⬆️ Lade optimiertes Bild hoch: profileImages/abc123def456/profile.jpg
✅ Player-Dokument aktualisiert: player_abc123
✅ Re-Prozessierung abgeschlossen für User abc123def456
📈 Optimierung: 3.45MB → 0.32MB (90.7% kleiner)

🎉 Re-Prozessierung aller Benutzer abgeschlossen!
💡 Die Bilder sind jetzt optimiert und sollten deutlich schneller laden.
```

## Technische Details

### Optimierungen
- **Crop**: Zentrierter quadratischer Schnitt (90% JPEG Qualität)
- **Komprimierung**: Sharp mit mozjpeg, progressive JPEG
- **Größe**: Max 800x800px, max 1MB, 80% Qualität
- **Format**: Standardisiert auf `.jpg`

### Sicherheit
- Originale werden überschrieben (Backup empfohlen)
- Firebase Admin Rechte erforderlich
- Aktualisiert sowohl Auth als auch Firestore

### Fehlerbehandlung
- Fortsetzung bei einzelnen Fehlern
- Detaillierte Logs für Debugging
- Graceful Handling bei fehlenden Dokumenten

## Troubleshooting

### "Firebase Admin Initialisierung fehlgeschlagen"
- Prüfen Sie `functions/service-account-key.json`
- Oder setzen Sie `GOOGLE_APPLICATION_CREDENTIALS`

### "User hat kein Profilbild"
- Normal - User wird übersprungen
- Nur User mit bestehenden photoURL werden prozessiert

### "HTTP 403/404 beim Download"
- Profilbild-URL möglicherweise abgelaufen
- User manuell in Firebase Console prüfen

### Dependencies fehlen
```bash
npm install sharp node-fetch firebase-admin
``` 