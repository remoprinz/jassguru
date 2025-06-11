// Session-Merge über Firebase Web SDK
// Dieses Skript kann direkt im Browser oder mit Node.js ausgeführt werden

console.log(`
🔧 MANUELLE SESSION-MERGE ANLEITUNG
=====================================

Da die automatische Ausführung Authentifizierungsprobleme hat, hier die manuelle Lösung:

📋 SCHRITT-FÜR-SCHRITT:

1. Öffnen Sie die Firebase Console: https://console.firebase.google.com
2. Wählen Sie Ihr Projekt "jassguru"
3. Gehen Sie zu "Firestore Database"
4. Suchen Sie die Collection (vermutlich "games", "sessions", oder "gameSessions")

🔍 FINDEN SIE IHRE SESSIONS:
- Haupt-Session ID: Ph8oDZYvcV5y3NkFBiZDu
- Session zum Merge: tPE0JJoJAYpRZO9Scefrp

📝 MANUELLE SCHRITTE:

SCHRITT 1: BACKUP ERSTELLEN
- Exportieren Sie beide Sessions (Copy/Paste in Textdateien)

SCHRITT 2: HAUPT-SESSION BEARBEITEN
- Öffnen Sie Session "Ph8oDZYvcV5y3NkFBiZDu"
- Gehen Sie zum "completedGames" Feld
- Aktuell sind dort Spiele "1" und "2"

SCHRITT 3: SPIELE AUS SESSION 2 HINZUFÜGEN
Aus Session "tPE0JJoJAYpRZO9Scefrp" kopieren Sie:
- Spiel "1" → wird zu Spiel "3" in der Haupt-Session
- Spiel "2" → wird zu Spiel "4" in der Haupt-Session

WICHTIG: Ändern Sie bei jedem kopierten Spiel:
- gameNumber: von 1 auf 3, von 2 auf 4
- sessionId: auf "Ph8oDZYvcV5y3NkFBiZDu"

SCHRITT 4: SESSION 2 LÖSCHEN
- Löschen Sie das Document "tPE0JJoJAYpRZO9Scefrp"

🎯 ERWARTETES RESULTAT:
Session Ph8oDZYvcV5y3NkFBiZDu enthält:
- Spiel 1: Bottom 5092 - Top 3402 (original)
- Spiel 2: Bottom 5269 - Top 4300 (original)  
- Spiel 3: Bottom 4308 - Top 4987 (von Session 2)
- Spiel 4: Bottom 4677 - Top 4724 (von Session 2)

💡 ALTERNATIVE - BROWSERVERSION:
Falls Sie das Skript im Browser laufen lassen möchten, können wir auch eine 
HTML-Version erstellen, die Sie direkt in der Firebase Hosting-Umgebung 
ausführen können.

Möchten Sie, dass ich eine Browser-Version erstelle oder bevorzugen Sie 
die manuelle Methode über die Firebase Console?
`);

// Falls Sie das trotzdem automatisch versuchen möchten:
const manualMergeInstructions = {
  mainSessionId: "Ph8oDZYvcV5y3NkFBiZDu",
  sessionToMergeId: "tPE0JJoJAYpRZO9Scefrp",
  
  instructions: [
    "1. Firebase Console öffnen",
    "2. Firestore Database auswählen", 
    "3. Collection finden (games/sessions/gameSessions)",
    "4. Beide Sessions lokalisieren",
    "5. Session 2 Spiele zu Session 1 kopieren",
    "6. gameNumber und sessionId anpassen",
    "7. Session 2 löschen"
  ],
  
  expectedResult: {
    "1": "Bottom 5092 - Top 3402 (original)",
    "2": "Bottom 5269 - Top 4300 (original)", 
    "3": "Bottom 4308 - Top 4987 (from session 2)",
    "4": "Bottom 4677 - Top 4724 (from session 2)"
  }
};

console.log('\n📄 Detaillierte Anweisungen wurden ausgegeben.');
console.log('Möchten Sie eine Browser-Version für die automatische Ausführung?');

module.exports = { manualMergeInstructions }; 