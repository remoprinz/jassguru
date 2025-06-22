# 🎯 MANUELLE GRUPPENSTATISTIK-TESTS

## Schritt 1: Cloud Function über Google Cloud Console testen

1. **Öffnen Sie die Google Cloud Console:**
   - Gehen Sie zu: https://console.cloud.google.com/functions/list?project=jassguru
   - Wählen Sie die Funktion `updateGroupStats`

2. **Testen Sie die Funktion:**
   - Klicken Sie auf "TESTEN"
   - Geben Sie folgende Test-Daten ein:
   ```json
   {
     "groupId": "IHRE_GRUPPEN_ID_HIER"
   }
   ```

3. **Führen Sie den Test aus:**
   - Klicken Sie auf "FUNKTION TESTEN"
   - Überprüfen Sie die Logs auf Erfolg/Fehler

## Schritt 2: Statistiken in Firestore überprüfen

1. **Öffnen Sie die Firestore Console:**
   - Gehen Sie zu: https://console.firebase.google.com/project/jassguru/firestore/data
   - Navigieren Sie zur Collection `groupComputedStats`

2. **Prüfen Sie das Dokument Ihrer Gruppe:**
   - Öffnen Sie das Dokument mit Ihrer Gruppen-ID
   - Überprüfen Sie alle 38 Statistik-Felder:

### ✅ BASIC STATISTICS (15 Felder):
- `groupId` - Gruppen-ID
- `memberCount` - Anzahl Mitglieder
- `sessionCount` - Anzahl Sessions
- `gameCount` - Anzahl Spiele
- `avgRoundsPerGame` - Durchschnittliche Runden pro Spiel
- `avgRoundDurationSeconds` - Durchschnittliche Rundendauer
- `avgMatschPerGame` - Durchschnittliche Matsch pro Spiel
- `totalPlayTimeSeconds` - Gesamte Spielzeit
- `avgSessionDurationSeconds` - Durchschnittliche Session-Dauer
- `avgGameDurationSeconds` - Durchschnittliche Spiel-Dauer
- `avgGamesPerSession` - Durchschnittliche Spiele pro Session
- `firstJassTimestamp` - Erster Jass Zeitstempel
- `lastJassTimestamp` - Letzter Jass Zeitstempel
- `hauptspielortName` - Hauptspielort Name
- `lastUpdateTimestamp` - Letztes Update

### 👥 PLAYER STATISTICS (12 Felder):
- `playerWithMostGames` - Array mit Spielern (meiste Spiele)
- `playerWithHighestStricheDiff` - Array mit Spielern (höchste Striche-Diff)
- `playerWithHighestPointsDiff` - Array mit Spielern (höchste Punkte-Diff)
- `playerWithHighestWinRateSession` - Array mit Spielern (höchste Session-Gewinnrate)
- `playerWithHighestWinRateGame` - Array mit Spielern (höchste Spiel-Gewinnrate)
- `playerWithHighestMatschRate` - Array mit Spielern (höchste Matsch-Rate)
- `playerWithHighestSchneiderRate` - Array mit Spielern (höchste Schneider-Rate)
- `playerWithHighestKontermatschRate` - Array mit Spielern (höchste Kontermatsch-Rate)
- `playerWithMostWeisPointsAvg` - Array mit Spielern (meiste Weis-Punkte)
- `playerWithFastestRounds` - Array mit Spielern (schnellste Runden)
- `playerWithSlowestRounds` - Array mit Spielern (langsamste Runden)
- `playerAllRoundTimes` - Object mit allen Spieler-Rundenzeiten

### 👥 TEAM STATISTICS (9 Felder):
- `teamWithHighestWinRateSession` - Array mit Teams (höchste Session-Gewinnrate)
- `teamWithHighestWinRateGame` - Array mit Teams (höchste Spiel-Gewinnrate)
- `teamWithHighestPointsDiff` - Array mit Teams (höchste Punkte-Diff)
- `teamWithHighestStricheDiff` - Array mit Teams (höchste Striche-Diff)
- `teamWithHighestMatschRate` - Array mit Teams (höchste Matsch-Rate)
- `teamWithHighestSchneiderRate` - Array mit Teams (höchste Schneider-Rate)
- `teamWithHighestKontermatschRate` - Array mit Teams (höchste Kontermatsch-Rate)
- `teamWithMostWeisPointsAvg` - Array mit Teams (meiste Weis-Punkte)
- `teamWithFastestRounds` - Array mit Teams (schnellste Runden)

### 🃏 TRUMPF STATISTICS (2 Felder):
- `trumpfStatistik` - Object mit Trumpf-Verteilung
- `totalTrumpfCount` - Gesamte Anzahl Trumpf-Runden

## Schritt 3: Logs überprüfen

1. **Cloud Function Logs:**
   - Gehen Sie zu: https://console.cloud.google.com/functions/details/europe-west1/updateGroupStats?project=jassguru&tab=logs
   - Überprüfen Sie die neuesten Logs auf:
     - ✅ Erfolgreiche Ausführung
     - ❌ Fehler oder Warnungen
     - 📊 Berechnete Statistiken

2. **Wichtige Log-Nachrichten:**
   ```
   [updateGroupComputedStatsAfterSession] Attempt 1/3 for group: GRUPPE_ID
   [updateGroupComputedStatsAfterSession] Step 1: Calculating statistics for GRUPPE_ID
   [updateGroupComputedStatsAfterSession] Step 2: Validating calculated statistics
   [updateGroupComputedStatsAfterSession] Step 3: Saving statistics to Firestore
   [updateGroupComputedStatsAfterSession] Successfully updated group stats for GRUPPE_ID
   ```

## Schritt 4: Probleme identifizieren

### 🚨 Kritische Probleme:
- **Fehlende Basis-Statistiken:** sessionCount, gameCount, memberCount = 0
- **Leere Player-Arrays:** Alle playerWith... Felder sind leer
- **Fehlende Trumpf-Daten:** trumpfStatistik ist leer

### ⚠️ Häufige Probleme:
- **Falsche Team-Zuordnungen:** Teams werden nicht korrekt erkannt
- **Fehlende Spiel-Daten:** roundHistory oder finalScores fehlen
- **Ungültige Zeitstempel:** Datum-Felder sind null

### 🔧 Lösungsansätze:
1. **Datenvalidierung:** Prüfen Sie die Rohdaten in `jassGameSummaries`
2. **Team-Mapping:** Überprüfen Sie die `teams` Struktur in Sessions
3. **Spiel-Vollständigkeit:** Stellen Sie sicher, dass alle Spiele `completedGames` haben

## Schritt 5: Detaillierte Analyse

Für eine detaillierte Analyse können Sie folgende Queries in der Firestore Console ausführen:

### Sessions einer Gruppe:
```
Collection: jassGameSummaries
Filter: groupId == "IHRE_GRUPPEN_ID"
Filter: status == "completed"
```

### Spiele einer Session:
```
Collection: jassGameSummaries/SESSION_ID/completedGames
```

### Aktuelle Statistiken:
```
Collection: groupComputedStats
Document: IHRE_GRUPPEN_ID
```

## 🎯 Erfolgs-Kriterien

Eine erfolgreiche Statistik-Berechnung sollte folgende Kriterien erfüllen:

1. **✅ Alle 38 Felder sind definiert** (nicht undefined)
2. **✅ Basis-Statistiken haben realistische Werte** (> 0)
3. **✅ Player-Arrays enthalten mindestens 1 Spieler** (bei aktiven Gruppen)
4. **✅ Team-Arrays enthalten mindestens 1 Team** (bei aktiven Gruppen)
5. **✅ Trumpf-Statistiken sind vollständig** (alle Farben erfasst)
6. **✅ Zeitstempel sind aktuell** (lastUpdateTimestamp ist recent)

## 📞 Support

Bei Problemen:
1. Überprüfen Sie die Cloud Function Logs
2. Validieren Sie die Rohdaten in Firestore
3. Führen Sie die Funktion erneut aus
4. Kontaktieren Sie das Entwicklungsteam mit spezifischen Fehlermeldungen 