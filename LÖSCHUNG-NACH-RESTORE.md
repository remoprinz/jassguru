# 🗑️ TEST-SESSION LÖSCHEN NACH RESTORE

## ✅ Du hast den Restore gemacht - aber Test-Daten sind noch da?

**Das ist normal!** Der Firestore Import ist ein **"Upsert"** - das bedeutet:

- ✅ **Existierende Dokumente** werden überschrieben (wenn sie im Backup sind)
- ❌ **Neue Dokumente** (nach dem Backup erstellt) werden **NICHT gelöscht**

Deine Test-Session wurde **nach** dem Backup erstellt, deshalb bleibt sie erhalten!

---

## 🔧 LÖSUNG: Test-Session manuell löschen

### Option 1: Intelligentes Löschen (Empfohlen - KEIN Backfill nötig!)

```bash
# Schritt 1: Lösche Test-Session und abgeleitete Daten
node functions/scripts/delete-test-session-complete.cjs --dry-run
node functions/scripts/delete-test-session-complete.cjs

# Schritt 2: Lösche nur NEUE partnerStats/opponentStats (ohne Backfill!)
node functions/scripts/delete-new-partner-opponent-stats.cjs --dry-run
node functions/scripts/delete-new-partner-opponent-stats.cjs
```

**Das Script löscht:**
- ✅ Die Test-Session selbst
- ✅ `ratingHistory` / `scoresHistory` Einträge für diese Session
- ✅ NaN-Werte aus `globalStats`
- ✅ **Nur NEUE** `partnerStats/opponentStats` (die nur in Test-Session entstanden)

**Ergebnis:**
- ✅ Alte Stats bleiben (aus Backup)
- ✅ Neue Stats weg (nur in Test-Session)
- ✅ **KEIN vollständiges Backfill nötig!** ⚡

**Falls Stats auch in anderen Sessions vorkommen:**
```bash
# Nur falls das Script "braucht Backfill" anzeigt
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
```

---

### Option 2: Mit vollständigem Backfill (falls Option 1 nicht reicht)

```bash
# Schritt 1: Lösche Test-Session
node functions/scripts/delete-test-session-complete.cjs

# Schritt 2: Vollständiges Partner/Opponent Stats Backfill
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs

# Optional: Weitere Backfills
npm run backfill-player-data -- --confirm
node backfill-groupstats.cjs
```

---

### Option 2: Manuell in Firestore Console

1. **Gehe zu Firestore Console**
2. **Lösche die Session:**
   - `groups/{groupId}/jassGameSummaries/E2NR2w1QQqhkA9x6TM8E4`

3. **Lösche abgeleitete Daten** (für jeden betroffenen Spieler):
   - `players/{playerId}/ratingHistory/*` (alle mit `sessionId == "E2NR2w1QQqhkA9x6TM8E4"`)
   - `players/{playerId}/scoresHistory/*` (alle mit `sessionId == "E2NR2w1QQqhkA9x6TM8E4"`)

4. **Bereinige globalStats** (falls NaN-Werte vorhanden):
   - Lösche alle `globalStats.*` Felder außer `globalStats.current`

5. **Führe Backfill aus** (siehe oben)

---

## 🎯 ZUSAMMENFASSUNG

**Nach einem Firestore Restore:**

1. ✅ **Restore durchführen** (wie du gemacht hast)
2. ✅ **Test-Session löschen** (mit Script oder manuell)
3. ✅ **Backfill ausführen** (um Stats neu zu berechnen)

**Ergebnis:** Alle Daten sind wieder sauber, Test-Session ist weg! ✅

---

## 📋 CHECKLISTE NACH LÖSCHUNG

- [ ] Test-Session `E2NR2w1QQqhkA9x6TM8E4` existiert nicht mehr
- [ ] Keine `ratingHistory` Einträge für diese Session mehr vorhanden
- [ ] Keine `scoresHistory` Einträge für diese Session mehr vorhanden
- [ ] `globalStats.current` hat keine NaN-Werte mehr
- [ ] Backfill wurde ausgeführt

---

## 🆘 FALLS PROBLEME

Wenn nach Löschung und Backfill noch Probleme bestehen:

```bash
# Vollständiger Cleanup + Backfill
node functions/scripts/cleanup-old-globalStats.cjs --execute
node functions/scripts/delete-session-end-events.cjs --execute
node backfill-elo-v2.cjs --execute
npm run backfill-player-data -- --confirm
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
node backfill-groupstats.cjs
```

