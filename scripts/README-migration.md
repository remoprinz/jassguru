# MatschBonus Field Migration

## Zweck
Dieses Skript fügt das fehlende `matschBonus: true`-Feld zu bestehenden Gruppen und Turnieren hinzu.

## Voraussetzungen
- `firebase-service-account.json` muss im Projektroot liegen
- Node.js und npm installiert
- Firebase Admin SDK

## Installation der Abhängigkeiten
```bash
npm install firebase-admin
```

## Ausführung
```bash
node scripts/migrate-matschbonus.js
```

## Was das Skript macht
1. **Scannt alle Gruppen**: Prüft `scoreSettings.matschBonus`
2. **Scannt alle Turniere**: Prüft `settings.scoreSettings.matschBonus`  
3. **Fügt fehlende Felder hinzu**: Setzt `matschBonus: true` wo es fehlt
4. **Clean Migration**: Keine Timestamps oder Metadaten werden hinzugefügt

## Sicherheit
- **Read-only Scan**: Erst scannen, dann gezielt updaten
- **Batch Operations**: Effiziente Updates
- **Fehlerbehandlung**: Stoppt bei Fehlern
- **Dry-run Modus**: Kann erweitert werden für Test-Läufe

## Nach der Migration
- Alle bestehenden Gruppen haben `scoreSettings.matschBonus: true`
- Alle bestehenden Turniere haben `settings.scoreSettings.matschBonus: true`
- Die Datenbank sieht aus, als wäre das Feld schon immer da gewesen
