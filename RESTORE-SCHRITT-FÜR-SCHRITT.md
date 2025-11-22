# 🔄 RESTORE SCHRITT-FÜR-SCHRITT ANLEITUNG

## 📸 Du bist hier (Import-Dialog)

Du siehst den Dialog **"Zu importierende Datei auswählen"**.

---

## ✅ SO GEHT ES WEITER:

### Schritt 1: Richtige Datei auswählen

1. **Klicke auf "Durchsuchen"** (rechts neben dem Eingabefeld)

2. **Navigiere zum Backup-Ordner:**
   - Öffne: `jassguru-firestore-backups/`
   - Öffne: `2025-10-31T15:23:00_29342/` (dein Backup-Ordner)

3. **Wähle die Datei mit `.overall_export_metadata`:**
   - ✅ `2025-10-31T15:23:00_29342.overall_export_metadata`
   - ❌ **NICHT** den Ordner `all_namespaces/`
   - ❌ **NICHT** den Backup-Ordner selbst

4. **Die Fehlermeldung sollte verschwinden** und "Importieren" wird aktiv.

---

### Schritt 2: Import starten

1. **Klicke auf "Importieren"** (blauer Button unten)

2. **Warte** bis der nächste Dialog erscheint (Collections auswählen)

---

### Schritt 3: ⚠️ KRITISCH - ALLE Collections auswählen!

**DIESER SCHRITT IST DAS WICHTIGSTE!** 

Im nächsten Dialog (nach dem Auswählen der `.overall_export_metadata` Datei) musst du **ALLE Collections** auswählen:

#### ❌ FALSCH (war beim letzten Mal das Problem):

- ✅ `groups` ausgewählt
- ❌ `players` **NICHT** ausgewählt ← **DAS WAR DAS PROBLEM!**
- ❌ Andere Collections nicht ausgewählt

**Ergebnis:** `players/` wurde nicht wiederhergestellt, korrupte Test-Daten blieben!

#### ✅ RICHTIG (so muss es sein):

- ✅ `groups` → **AN**
- ✅ `players` → **AN** ← **KRITISCH - DAS WARST DU VERGESSEN!**
- ✅ `tournaments` → **AN**
- ✅ `activeGames` → **AN**
- ✅ `sessions` → **AN**
- ✅ `users` → **AN**
- ✅ **ALLE anderen Collections** → **AN**

**Wie:**
1. Suche nach Checkbox **"Alle auswählen"** → ✅ Aktivieren
2. **ODER:** Aktiviere **ALLE Checkboxen manuell**
3. **Prüfe nochmal:** Gehe durch die Liste, stelle sicher dass **ALLE** aktiviert sind
4. **Besonders wichtig:** `players/` muss aktiviert sein!

**Ergebnis:** Alle Collections werden wiederhergestellt, alle korrupten Test-Daten sind weg! ✅

---

### Schritt 4: Restore bestätigen

1. **Prüfe** dass alle Collections ausgewählt sind
2. **Bestätige** dass aktuelle Daten überschrieben werden
3. **Starte** das Restore

---

### Schritt 5: Warten

- **Dauer:** 5-10 Minuten
- Du kannst den Status in der Console beobachten
- **Warte** bis "Erfolgreich" angezeigt wird

---

## ✅ NACH DEM RESTORE PRÜFEN

1. **Test-Session sollte weg sein:**
   - Firestore Console → `groups/{groupId}/jassGameSummaries`
   - Session `E2NR2w1QQqhkA9x6TM8E4` sollte **NICHT** existieren

2. **Player Stats sollten korrekt sein:**
   - Firestore Console → `players/{playerId}/globalStats.current`
   - Sollte **KEINE NaN-Werte** haben

3. **Group Stats sollten korrekt sein:**
   - Firestore Console → `groups/{groupId}/stats/computed`
   - Sollte korrekte Werte haben (nicht alle 0)

---

## 🆘 FALLS DU DICH VERTAN HAST

Wenn du im Schritt 3 **nur `groups/`** ausgewählt hast:

1. **Stoppe** den laufenden Import (falls möglich)
2. **Starte nochmal** und wähle diesmal **ALLE Collections**

Oder führe nach dem Restore einen Backfill aus (aber normalerweise ist das nicht nötig bei vollständigem Restore).

---

## 💡 ALTERNATIVE: Firestore Backups Seite

**Noch einfacher:** Gehe direkt zu:
https://console.cloud.google.com/firestore/backups?project=jassguru

Dort kannst du Backups direkt auswählen und restoren, ohne manuell die `.overall_export_metadata` Datei suchen zu müssen.

