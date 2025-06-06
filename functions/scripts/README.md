# Session-Merge Skript

Dieses Skript führt zwei Jass-Sessions zusammen, die versehentlich getrennt erstellt wurden.

## Problem
Beim Jassen gestern ist ein Bug aufgetreten, der dazu geführt hat, dass zwei separate Sessions erstellt wurden, obwohl es eine einzige Session hätte sein sollen.

## Lösung
Das Skript `mergeSessionsScript.js` führt die beiden Sessions zusammen:
- **Haupt-Session** (`Ph8oDZYvcV5y3NkFBiZDu`) bleibt bestehen
- **Session 2** (`tPE0JJoJAYpRZO9Scefrp`) wird in die Haupt-Session integriert und dann gelöscht

## Ausführung

### Option 1: Direkt über Node.js (Empfohlen)

1. Stellen Sie sicher, dass Sie Firebase Admin SDK Credentials haben
2. Navigieren Sie zum `functions/scripts` Verzeichnis:
   ```bash
   cd functions/scripts
   ```

3. Installieren Sie die notwendigen Dependencies (falls nicht vorhanden):
   ```bash
   npm install firebase-admin
   ```

4. Führen Sie das Skript aus:
   ```bash
   node mergeSessionsScript.js
   ```

### Option 2: Über Firebase Functions

1. Deployen Sie die neue Function:
   ```bash
   cd functions
   npm run deploy
   ```

2. Rufen Sie die Function über die Firebase Console oder per CLI auf:
   ```bash
   firebase functions:call mergeSessions --data='{
     "mainSessionId": "Ph8oDZYvcV5y3NkFBiZDu",
     "sessionToMergeId": "tPE0JJoJAYpRZO9Scefrp"
   }'
   ```

## Was passiert beim Merge?

### Vorher:
- **Session 1** (`Ph8oDZYvcV5y3NkFBiZDu`):
  - Spiel 1: Bottom 5092 - Top 3402
  - Spiel 2: Bottom 5269 - Top 4300

- **Session 2** (`tPE0JJoJAYpRZO9Scefrp`):
  - Spiel 1: Bottom 4308 - Top 4987
  - Spiel 2: Bottom 4677 - Top 4724

### Nachher:
- **Session 1** (`Ph8oDZYvcV5y3NkFBiZDu`):
  - Spiel 1: Bottom 5092 - Top 3402 *(ursprünglich)*
  - Spiel 2: Bottom 5269 - Top 4300 *(ursprünglich)*
  - Spiel 3: Bottom 4308 - Top 4987 *(aus Session 2)*
  - Spiel 4: Bottom 4677 - Top 4724 *(aus Session 2)*

- **Session 2** wird komplett gelöscht

## Sicherheitsmaßnahmen

Das Skript führt folgende Validierungen durch:
- ✅ Beide Sessions müssen existieren
- ✅ Sessions müssen zur gleichen Gruppe gehören
- ✅ Warnung bei unterschiedlichen Teilnehmern (aber kein Stopp)
- ✅ Atomare Transaktion (alles oder nichts)
- ✅ Backup-Informationen werden gespeichert (`mergedSessions` Array)

## Rollback

Falls etwas schiefgeht, können Sie:
1. Die Session aus einem Firestore-Backup wiederherstellen
2. Die `mergedSessions` Information nutzen, um zu sehen, welche Sessions zusammengeführt wurden

## Support

Bei Problemen wenden Sie sich an den Entwickler oder prüfen Sie die Firebase Console Logs nach Fehlermeldungen. 