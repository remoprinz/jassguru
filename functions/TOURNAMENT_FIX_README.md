# 🎯 Tournament Document Fix

Dieses Skript korrigiert das jassGameSummaries Dokument `6eNr8fnsTO06jgCqjelt` mit den korrekten Player Document IDs.

## 🔧 Problem

Das Tournament-Dokument verwendet alte Player IDs:
- `"remo"` → `"b16c1120111b7d9e7d733837"`
- `"schmuddi"` → `"TPBwj8bP9W59n5LoGWP5"`
- `"studi"` → `"PLaDRlPBo91yu5Ij8MOT2"`
- `"frank"` → `"F1uwdthL6zu7F0cYf1jbe"`

Dies führt zu "Unbekannten Jassern" in den Gruppenstatistiken.

## 🚀 Verwendung

### 1. Dry Run (sicher, zeigt nur Vorschau)
```bash
cd functions
npm run tournament-fix
```

### 2. Ausführung (macht tatsächliche Änderungen)
```bash
cd functions  
npm run tournament-fix -- --execute
```

## 📋 Was wird korrigiert

1. **participantPlayerIds Array**: Alte IDs werden durch neue ersetzt
2. **gameResults.teams.players.playerId**: In allen 15 Spielen korrigiert
3. **Metadaten**: Migration-Timestamps werden hinzugefügt

## ✅ Nach der Korrektur

Die Gruppenstatistiken sollten keine "Unbekannten Jasser" mehr anzeigen und alle Daten korrekt berechnen.

## 🔒 Sicherheit

- Das Skript ist spezifisch für das eine problematische Dokument
- Dry-Run ist standardmäßig aktiviert
- Alle Änderungen werden detailliert geloggt
- Backup-Metadaten werden hinzugefügt 