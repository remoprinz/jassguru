// cleanupFirestore.js
// Dieses Skript bereinigt die Firestore-Datenbank:
// 1. Entfernt die Felder 'nickname' und 'email' aus der 'players'-Collection.
// 2. Stellt sicher, dass 'displayName' in 'players' korrekt gesetzt ist (aus 'nickname', falls nötig).
// 3. Synchronisiert den korrekten 'displayName' aus 'players' in die 'players'-Map der 'groups'-Collection.

// WICHTIG: Erstellen Sie ein Backup Ihrer Firestore-Datenbank, BEVOR Sie dieses Skript ausführen!

const admin = require("firebase-admin");
const path = require('path'); // Hinzugefügt für bessere Pfadauflösung

// Pfad zur Service Account Key JSON-Datei (relativ zum Skriptausführungsort)
// Das Skript liegt in /jasstafel, der Key in /jassguru.ch
const serviceAccountRelativePath = "../../jassguru-firebase-adminsdk-44hjy-458d5c3872.json"; 
const serviceAccountFullPath = path.resolve(__dirname, serviceAccountRelativePath);

const PLAYERS_COLLECTION = "players";
const GROUPS_COLLECTION = "groups";
const USERS_COLLECTION = "users"; // Wird nicht direkt benötigt, aber zur Info
const BATCH_SIZE = 400; // Firestore Batch Limit ist 500, Puffer ist sicher

try {
  // Versuche, die Service-Account-Datei zu laden
  const serviceAccount = require(serviceAccountFullPath); 
  
  // Initialisiere Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK erfolgreich initialisiert.");

} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error(`
FEHLER: Service Account Key Datei nicht gefunden unter dem erwarteten Pfad: ${serviceAccountFullPath}`);
    console.error("Bitte stellen Sie sicher, dass die Datei 'jassguru-firebase-adminsdk-44hjy-458d5c3872.json' im Verzeichnis '/Users/remo/jassguru.ch/' existiert.");
  } else if (e.message.includes("already initialized")) {
     // Dies ist kein Fehler, wenn das Skript z.B. mehrfach importiert/aufgerufen wird (unwahrscheinlich hier)
     console.info("Firebase Admin SDK bereits initialisiert.");
  } else {
    console.error("FEHLER bei der Initialisierung des Firebase Admin SDK:", e);
  }
  process.exit(1); // Beende das Skript bei einem Initialisierungsfehler
}

// Firestore Instanz holen
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const serverTimestamp = FieldValue.serverTimestamp;

/**
 * Bereinigt die 'players'-Collection: Entfernt 'nickname' & 'email', stellt 'displayName' sicher.
 * @returns {Promise<Map<string, string>>} Eine Map von playerId zu korrektem displayName.
 */
async function cleanupPlayersCollection() {
  console.log(`
--- Starte Bereinigung der '${PLAYERS_COLLECTION}' Collection ---`);
  const playersRef = db.collection(PLAYERS_COLLECTION);
  const snapshot = await playersRef.get();

  if (snapshot.empty) {
    console.log(`Collection '${PLAYERS_COLLECTION}' ist leer. Nichts zu tun.`);
    return new Map(); // Leere Map zurückgeben
  }

  let batch = db.batch();
  let operationsInBatch = 0;
  let totalPlayersUpdated = 0;
  const playerDisplayNames = new Map(); // Map<playerId, displayName> für Schritt 2

  console.log(`Gefunden: ${snapshot.size} Dokumente in '${PLAYERS_COLLECTION}'. Verarbeite in Batches von ${BATCH_SIZE}...`);

  for (const docSnap of snapshot.docs) {
    const playerId = docSnap.id;
    const data = docSnap.data();
    const updateData = {};
    let needsUpdate = false;

    // 1. Logik für 'nickname' und 'displayName'
    if (data.nickname !== undefined && data.displayName === undefined) {
      // Fall: Nur 'nickname' existiert -> umbenennen
      console.log(`  [Player ${playerId}] Aktion: Benenne 'nickname' ("${data.nickname}") zu 'displayName' um.`);
      updateData.displayName = data.nickname;
      updateData.nickname = FieldValue.delete(); 
      needsUpdate = true;
    } else if (data.nickname !== undefined && data.displayName !== undefined) {
       // Fall: Beide existieren -> 'nickname' löschen
       console.log(`  [Player ${playerId}] Aktion: Lösche redundantes 'nickname'. 'displayName' ("${data.displayName}") bleibt.`);
       updateData.nickname = FieldValue.delete(); 
       needsUpdate = true;
    } else if (data.nickname === undefined && data.displayName === undefined) {
        // Fall: Keines existiert -> WARNUNG
        console.warn(`  [Player ${playerId}] WARNUNG: Weder 'nickname' noch 'displayName' gefunden!`);
    }
    // Fall: Nur displayName existiert -> Alles ok, keine Aktion bei Nickname nötig.

    // 2. Logik für 'email'
    if (data.email !== undefined) {
      console.log(`  [Player ${playerId}] Aktion: Lösche Feld 'email'.`);
      updateData.email = FieldValue.delete();
      needsUpdate = true;
    }

    // Speichere den finalen displayName für den nächsten Schritt
    // Nimm den Wert aus updateData (falls umbenannt) oder den bestehenden Wert.
    const finalDisplayName = updateData.displayName || data.displayName; 
    if (finalDisplayName) {
      playerDisplayNames.set(playerId, finalDisplayName);
    } else {
       // Wenn kein Name ermittelt werden konnte (siehe Warnung oben), setze einen Platzhalter in die Map
       console.warn(`  [Player ${playerId}] WARNUNG: Setze temporären Platzhalter-Namen für Gruppen-Sync.`);
       playerDisplayNames.set(playerId, `Spieler ${playerId.substring(0,6)}`); 
    }

    // Update zum Batch hinzufügen, wenn nötig
    if (needsUpdate) {
      updateData.updatedAt = serverTimestamp(); // Zeitstempel für die Aktualisierung
      batch.update(docSnap.ref, updateData);
      operationsInBatch++;
      totalPlayersUpdated++;

      // Batch ausführen, wenn er voll ist
      if (operationsInBatch >= BATCH_SIZE) {
        console.log(`  --> Schreibe Batch mit ${operationsInBatch} Player-Updates...`);
        await batch.commit();
        console.log("  <-- Batch erfolgreich geschrieben.");
        batch = db.batch(); // Neuen Batch für die nächsten Operationen starten
        operationsInBatch = 0;
      }
    }
  }

  // Letzten verbleibenden Batch schreiben
  if (operationsInBatch > 0) {
    console.log(`  --> Schreibe letzten Batch mit ${operationsInBatch} Player-Updates...`);
    await batch.commit();
    console.log("  <-- Letzter Batch erfolgreich geschrieben.");
  }

  console.log(`--- Bereinigung der '${PLAYERS_COLLECTION}' Collection abgeschlossen. ${totalPlayersUpdated} Dokumente aktualisiert. ---`);
  return playerDisplayNames; 
}

/**
 * Synchronisiert die korrekten DisplayNames in die 'players'-Map der 'groups'-Collection.
 * @param {Map<string, string>} playerDisplayNames - Map von playerId zu korrektem displayName.
 * @returns {Promise<number>} Anzahl der aktualisierten Gruppen-Dokumente.
 */
async function syncDisplayNamesToGroups(playerDisplayNames) {
  console.log(`
--- Starte Synchronisation der DisplayNames zur '${GROUPS_COLLECTION}' Collection ---`);
  if (!playerDisplayNames || playerDisplayNames.size === 0) {
      console.log("Keine Player-Daten (DisplayNames) aus dem vorherigen Schritt vorhanden. Überspringe Gruppen-Synchronisation.");
      return 0;
  }

  const groupsRef = db.collection(GROUPS_COLLECTION);
  const snapshot = await groupsRef.get();

  if (snapshot.empty) {
    console.log(`Collection '${GROUPS_COLLECTION}' ist leer. Nichts zu tun.`);
    return 0;
  }

  let batch = db.batch();
  let operationsInBatch = 0;
  let totalGroupsUpdated = 0;

  console.log(`Gefunden: ${snapshot.size} Dokumente in '${GROUPS_COLLECTION}'. Verarbeite in Batches von ${BATCH_SIZE}...`);

  for (const groupDocSnap of snapshot.docs) {
    const groupId = groupDocSnap.id;
    const groupData = groupDocSnap.data();
    const groupUpdateData = {};
    let needsUpdate = false;

    // Das 'players'-Feld enthält die Map { playerId: { displayName, joinedAt, ... } }
    const groupPlayersMap = groupData.players || {}; 
    // Das 'playerIds'-Feld ist das Array der IDs
    const playerIdsInGroupArray = groupData.playerIds || []; 

    // Gehe durch die Spieler-IDs, die laut Array Mitglieder sein sollten
    for (const playerId of playerIdsInGroupArray) {
        const correctDisplayName = playerDisplayNames.get(playerId); // Korrekten Namen aus der Map holen

        // Wenn wir keinen Namen aus der Map haben (sollte nicht passieren dank Platzhalter oben, aber sicher ist sicher)
        if (!correctDisplayName) {
            console.warn(`    [Group ${groupId}] WARNUNG: Kein korrekter DisplayName für Player ${playerId} in der Map gefunden. Überspringe diesen Spieler.`);
            continue; 
        }

        const playerEntryInGroupMap = groupPlayersMap[playerId]; // Eintrag in der Gruppen-Map holen

        // Fall 1: Spieler ist im Array UND in der Map, aber der Name ist falsch
        if (playerEntryInGroupMap && playerEntryInGroupMap.displayName !== correctDisplayName) {
            console.log(`    [Group ${groupId}] Korrigiere Namen für Player ${playerId}: "${playerEntryInGroupMap.displayName}" -> "${correctDisplayName}"`);
            // Pfad zum Feld innerhalb der Map definieren
            const updatePath = `players.${playerId}.displayName`; 
            groupUpdateData[updatePath] = correctDisplayName; // Update vorbereiten
            needsUpdate = true;
        } 
        // Fall 2: Spieler ist im Array, aber NICHT in der Map
        else if (!playerEntryInGroupMap) {
             // Hier erstellen wir KEINEN Eintrag, um fehlende Daten (joinedAt) zu vermeiden.
             console.log(`    [Group ${groupId}] Info: Player ${playerId} ist in 'playerIds', fehlt aber in 'players'-Map. (Keine Aktion zum Erstellen)`);
        }
        // Fall 3: Spieler ist im Array und in der Map und Name stimmt -> Alles ok.
    }

    // Update für die Gruppe zum Batch hinzufügen, wenn nötig
    if (needsUpdate) {
      groupUpdateData.updatedAt = serverTimestamp(); // Zeitstempel für die Aktualisierung
      batch.update(groupDocSnap.ref, groupUpdateData);
      operationsInBatch++;
      totalGroupsUpdated++;

      // Batch ausführen, wenn er voll ist
      if (operationsInBatch >= BATCH_SIZE) {
        console.log(`  --> Schreibe Batch mit ${operationsInBatch} Gruppen-Updates...`);
        await batch.commit();
        console.log("  <-- Batch erfolgreich geschrieben.");
        batch = db.batch();
        operationsInBatch = 0;
      }
    }
  }

  // Letzten verbleibenden Batch schreiben
  if (operationsInBatch > 0) {
    console.log(`  --> Schreibe letzten Batch mit ${operationsInBatch} Gruppen-Updates...`);
    await batch.commit();
    console.log("  <-- Letzter Batch erfolgreich geschrieben.");
  }

  console.log(`--- Synchronisation der DisplayNames zur '${GROUPS_COLLECTION}' Collection abgeschlossen. ${totalGroupsUpdated} Dokumente aktualisiert. ---`);
  return totalGroupsUpdated;
}

/**
 * Hauptfunktion zum Ausführen der Bereinigungsschritte.
 */
async function runCleanup() {
  console.log("===========================================");
  console.log("Starte Firestore Bereinigungsskript...");
  console.log("===========================================");
  try {
    // Schritt 1: Backup erstellen (ERINNERUNG!)
    console.warn("\nWARNUNG: Stellen Sie sicher, dass Sie ein Backup Ihrer Firestore-Datenbank erstellt haben!");
    console.log("Das Skript wird in 5 Sekunden fortgesetzt...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // Kurze Pause

    // Schritt 2: Players Collection bereinigen und DisplayNames sammeln
    const playerDisplayNames = await cleanupPlayersCollection();

    // Schritt 3: DisplayNames in Groups Collection synchronisieren
    await syncDisplayNamesToGroups(playerDisplayNames);

    // Einfachere Log-Ausgabe, um potenzielle Syntaxprobleme zu vermeiden
    console.log(""); // Leerzeile davor
    console.log("*******************************************");
    console.log("Firestore Bereinigungsskript beendet.");
    console.log("*******************************************");

  } catch (error) {
    console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("FEHLER während der Firestore Bereinigung:");
    console.error(error);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1); // Beende mit Fehlercode
  }
}

// Skript ausführen
runCleanup(); 