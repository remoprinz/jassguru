# 🚀 FIRESTORE RESTORE - SCHNELLSTART

## ✅ Schnellste Methode (Firebase Console)

1. **Gehe zu:** https://console.cloud.google.com/firestore/backups?project=jassguru
2. **Wähle Backup:** Vor dem 1. November 2025 (z.B. 31. Oktober)
3. **Klicke "Restore"**
4. **WICHTIG:** Stelle sicher dass **ALLE Collections** ausgewählt sind!
5. **Starte Restore**
6. **Warte 5-10 Minuten**

✅ **Fertig!** Test-Daten sind weg.

---

## 📋 Über Command Line (Für Power-User)

### Schritt 1: Verfügbare Backups anzeigen

```bash
./restore-firestore.sh
```

### Schritt 2: Restore ausführen

```bash
# Beispiel: Backup vom 31. Oktober 2025
./restore-firestore.sh 2025-10-31T04-00-00
```

---

## ⚠️ WICHTIG

**Ein vollständiges Restore überschreibt ALLE Daten:**
- ✅ `groups/` (wird wiederhergestellt)
- ✅ `players/` (wird wiederhergestellt) ← **Das war das Problem beim letzten Mal!**
- ✅ Alle anderen Collections

**Nach vollständigem Restore sind Test-Daten weg!**

---

## ✅ NACH DEM RESTORE PRÜFEN

1. **Test-Session sollte weg sein:**
   - Firestore Console → `groups/{groupId}/jassGameSummaries`
   - Session `E2NR2w1QQqhkA9x6TM8E4` sollte nicht existieren

2. **Player Stats sollten korrekt sein:**
   - Firestore Console → `players/{playerId}/globalStats.current`
   - Sollte keine NaN-Werte haben

3. **Group Stats sollten korrekt sein:**
   - Firestore Console → `groups/{groupId}/stats/computed`
   - Sollte korrekte Werte haben (nicht alle 0)

---

## 🆘 FALLS PROBLEME

Wenn nach Restore Daten inkonsistent sind (sehr unwahrscheinlich):

```bash
# Vollständiger Backfill
node backfill-elo-v2.cjs --execute
npm run backfill-player-data -- --confirm
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
node backfill-groupstats.cjs
```

**Aber normalerweise ist nach vollständigem Restore kein Backfill nötig!**

