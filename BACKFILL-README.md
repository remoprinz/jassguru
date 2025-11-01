# 🔄 BACKFILL GUIDE - JASSTAFEL

## 📋 ÜBERSICHT

Nach einem Firestore Restore oder Datenbereinigung müssen alle abgeleiteten Daten neu berechnet werden.
Dieser Guide zeigt die **EXAKTE** Reihenfolge und Verwendung aller Backfill-Scripts.

---

## ⚠️ WICHTIG: REIHENFOLGE BEACHTEN!

Die Scripts **MÜSSEN** in dieser Reihenfolge ausgeführt werden, da sie aufeinander aufbauen!

---

## 🎯 VOLLSTÄNDIGER BACKFILL

### **Schritt 1: Elo/Rating History** (MUSS ZUERST SEIN!)

```bash
node backfill-elo-v2.cjs --execute
```

**Berechnet:**
- `players/{id}/ratingHistory/*` (nur 'game' Events)
- `players/{id}/globalRating`
- `groups/{groupId}/jassGameSummaries/{sessionId}/playerFinalRatings`
- `groups/{groupId}/aggregated/chartData_elo`

**Warum zuerst?** Partner/Opponent Stats verwenden `lastSessionDelta` aus Elo-Berechnung!

**Dauer:** ~5-7 Minuten

---

### **Schritt 2: Player Data** (Global Stats, Basic Partner/Opponent, Scores History)

```bash
npm run backfill-player-data -- --confirm
```

**Berechnet:**
- `players/{id}/globalStats.current` (vollständig)
- `players/{id}/scoresHistory/*` (Session-Snapshots)
- `players/{id}/partnerStats/*` (NUR BASIC: gamesPlayed, wins, losses, winRate)
- `players/{id}/opponentStats/*` (NUR BASIC: gamesPlayed, wins, losses, winRate)

**Dauer:** ~3-5 Minuten

---

### **Schritt 3: Partner/Opponent Stats** (VOLLSTÄNDIG mit allen Feldern)

```bash
node functions/scripts/backfillPartnerOpponentStatsFINAL.cjs
```

**Berechnet:**
- `players/{id}/partnerStats/{partnerId}` (18 Felder: Striche, Punkte, Events, Weis, Trumpf, Rundenzeiten)
- `players/{id}/opponentStats/{opponentId}` (18 Felder: Striche, Punkte, Events, Weis, Trumpf, Rundenzeiten)

**Besonderheit:** Unterstützt Tournament Sessions (pro Spiel Partner/Gegner bestimmen!)

**Dauer:** ~2-3 Minuten

---

### **Schritt 4: Group Stats**

```bash
node backfill-groupstats.cjs
```

**Berechnet:**
- `groups/{groupId}/stats/computed`

**Dauer:** ~1-2 Minuten

---

### **Schritt 5: Chart Data** (OPTIONAL - für Performance)

```bash
node functions/scripts/backfillChartData.cjs
```

**Berechnet:**
- `groups/{groupId}/aggregated/chartData_striche`
- `groups/{groupId}/aggregated/chartData_points`
- `groups/{groupId}/aggregated/chartData_matsch`
- `groups/{groupId}/aggregated/chartData_schneider`
- `groups/{groupId}/aggregated/chartData_kontermatsch`

**Hinweis:** Charts können auch live berechnet werden, dieses Script cached sie für bessere Performance.

**Dauer:** ~1-2 Minuten

---

## ⏱️ GESAMTDAUER

**~15-20 Minuten** für den vollständigen Backfill aller Daten.

---

## 🧹 DATENBEREINIGUNG VOR BACKFILL

### 1. Alte globalStats ohne .current löschen

```bash
# Zuerst mit --dry-run testen
node functions/scripts/cleanup-old-globalStats.cjs --dry-run

# Dann wirklich löschen
node functions/scripts/cleanup-old-globalStats.cjs --execute
```

**Löscht:** Alle `globalStats.*` Felder außer `globalStats.current` (enthalten NaN-Werte)

---

### 2. session_end Events aus ratingHistory löschen

```bash
# Zuerst mit --dry-run testen
node functions/scripts/delete-session-end-events.cjs --dry-run

# Dann wirklich löschen
node functions/scripts/delete-session-end-events.cjs --execute
```

**Löscht:** Alle `ratingHistory` Einträge mit `eventType: 'session_end'` (Charts nutzen nur 'game' Events)

---

### 3. Session-spezifische Löschung

Wenn nur Daten einer spezifischen Session gelöscht werden sollen (z.B. nach Restore):

```bash
# Zuerst mit --dry-run testen
node functions/scripts/delete-session-derived-data.cjs <SESSION_ID> --dry-run

# Dann wirklich löschen
node functions/scripts/delete-session-derived-data.cjs <SESSION_ID>
```

**Löscht:**
- `players/{id}/ratingHistory/*` für diese Session
- `players/{id}/scoresHistory/*` für diese Session

**Danach:** Führe die 5 Backfill-Schritte aus um Daten neu zu berechnen.

---

## ✅ VALIDIERUNG

Nach dem Backfill prüfen:

1. **Elo/Rating:** Prüfe `players/{id}/globalRating` und `ratingHistory`
2. **Global Stats:** Prüfe `players/{id}/globalStats.current`
3. **Partner Stats:** Prüfe `players/{id}/partnerStats/{partnerId}`
4. **Group Stats:** Prüfe `groups/{groupId}/stats/computed`
5. **Charts:** Öffne Frontend und prüfe ob Charts korrekt angezeigt werden

---

## 📝 NOTIZEN

- **Tournament Support:** Alle Scripts unterstützen Tournament Sessions
- **Dry-Run:** `backfillPlayerDataFromSummaries.ts` unterstützt `--dry-run` Mode
- **Logging:** Alle Scripts loggen ihren Fortschritt ausführlich
- **Fehlerbehandlung:** Scripts fahren bei Fehlern fort und loggen Probleme

---

## 🚨 TROUBLESHOOTING

### "Firebase Admin nicht initialisiert"
```bash
# Prüfe ob serviceAccountKey.json existiert
ls -la serviceAccountKey.json
```

### "Keine Sessions gefunden"
```bash
# Prüfe ob jassGameSummaries existieren
# Firestore Console → groups/{groupId}/jassGameSummaries
```

### "Timeout Error"
```bash
# Bei großen Datenmengen: Scripts laufen einzeln aus
# Warte bis Script fertig ist, dann nächstes starten
```

---

## 📞 SUPPORT

Bei Problemen:
1. Prüfe Console-Logs der Scripts
2. Verifiziere Firestore-Daten manuell
3. Führe Scripts einzeln mit Dry-Run aus

