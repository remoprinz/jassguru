# ⚠️ KRITISCHER SCHRITT: Collections auswählen

## 🔴 DAS WAR DAS PROBLEM BEIM LETZTEN MAL!

Nachdem du die `.overall_export_metadata` Datei ausgewählt hast, erscheint ein **zweiter Dialog**.

**In diesem Dialog musst du ALLE Collections auswählen!**

---

## ❌ FALSCH (beim letzten Mal gemacht):

- ✅ `groups` ausgewählt
- ❌ `players` **NICHT** ausgewählt ← **DAS WAR DAS PROBLEM!**
- ❌ Andere Collections nicht ausgewählt

**Ergebnis:**
- `groups/` wurde wiederhergestellt ✅
- `players/` wurde **NICHT** wiederhergestellt ❌
- → Korrupte Test-Daten blieben in `players/` erhalten!

---

## ✅ RICHTIG (so muss es sein):

- ✅ `groups` ausgewählt
- ✅ `players` ausgewählt ← **KRITISCH!**
- ✅ `tournaments` ausgewählt
- ✅ `activeGames` ausgewählt
- ✅ `sessions` ausgewählt
- ✅ `users` ausgewählt
- ✅ **ALLE anderen Collections** ausgewählt

**Ergebnis:**
- `groups/` wird wiederhergestellt ✅
- `players/` wird wiederhergestellt ✅
- Alle anderen Collections werden wiederhergestellt ✅
- → **Alle korrupten Test-Daten sind weg!** ✅

---

## 🎯 SO MACHST DU ES:

### Schritt 1: `.overall_export_metadata` Datei auswählen
- ✅ Du hast das schon gemacht
- ✅ Datei: `2025-10-31T15:23:00_29342.overall_export_metadata`
- ✅ Klicke "Auswählen"

### Schritt 2: **WICHTIG** - Collections auswählen (erscheint danach)

**In diesem Dialog:**

1. **Suche nach einer Checkbox "Alle auswählen"** oder **"Select All"**
   - Falls vorhanden: ✅ Aktivieren!

2. **ODER: Aktiviere manuell ALLE Checkboxen:**
   - ✅ `groups` → AN
   - ✅ `players` → **AN** ← **DAS WARST DU VERGESSEN!**
   - ✅ `tournaments` → AN
   - ✅ `activeGames` → AN
   - ✅ `sessions` → AN
   - ✅ `users` → AN
   - ✅ Alle anderen Collections → AN

3. **Prüfe nochmal:**
   - Gehe durch die Liste
   - Stelle sicher dass **ALLE** aktiviert sind
   - **Besonders `players/`** darf nicht fehlen!

4. **Klicke "Importieren" oder "Restore"**

---

## 📋 CHECKLISTE:

Bevor du den Restore startest, prüfe:

- [ ] `.overall_export_metadata` Datei ausgewählt
- [ ] `groups` Collection ausgewählt
- [ ] `players` Collection ausgewählt ← **KRITISCH!**
- [ ] `tournaments` Collection ausgewählt
- [ ] `activeGames` Collection ausgewählt
- [ ] `sessions` Collection ausgewählt
- [ ] `users` Collection ausgewählt
- [ ] Alle anderen Collections ausgewählt
- [ ] **Mindestens 6-10 Collections sollten aktiviert sein**

---

## 🆘 FALLS DER DIALOG NICHT ERSCHEINT

Wenn nach dem Auswählen der `.overall_export_metadata` Datei kein Dialog zum Auswählen der Collections erscheint:

1. **Prüfe** ob der Restore bereits läuft
2. **Stoppe** ihn falls möglich
3. **Starte neu** und achte auf den Collections-Auswahl-Dialog

---

## ✅ NACH DEM RESTORE PRÜFEN

1. **Test-Session weg?**
   - Firestore Console → `groups/{groupId}/jassGameSummaries`
   - Session `E2NR2w1QQqhkA9x6TM8E4` sollte **NICHT** existieren ✅

2. **Player Stats korrekt?**
   - Firestore Console → `players/{playerId}/globalStats.current`
   - Sollte **KEINE NaN-Werte** haben ✅
   - Sollte korrekte Werte vom 31. Oktober haben ✅

3. **Group Stats korrekt?**
   - Firestore Console → `groups/{groupId}/stats/computed`
   - Sollte korrekte Werte haben ✅

**Wenn alle 3 Punkte ✅ sind, war der Restore erfolgreich!**

