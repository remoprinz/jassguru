const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// --- Initialisierung der Firebase Admin SDK ---
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK erfolgreich initialisiert.");
} catch (error) {
  if (error.code !== 'app/duplicate-app') {
    console.error("Fehler bei der Initialisierung der Firebase Admin SDK:", error);
    process.exit(1);
  } else {
    console.log("Firebase Admin SDK war bereits initialisiert.");
  }
}

const db = admin.firestore();
const GROUPS_COLLECTION = 'groups';
const PLAYERS_COLLECTION = 'players';

/**
 * Migriert eine einzelne Gruppe auf die neue Datenstruktur.
 * - Entfernt das veraltete `playerIds`-Array.
 * - Stellt sicher, dass die `players`-Map die `playerDocId` als Schlüssel verwendet.
 * @param {admin.firestore.DocumentSnapshot} groupSnap Der Snapshot des zu migrierenden Gruppendokuments.
 */
async function migrateGroup(groupSnap) {
  const groupId = groupSnap.id;
  const groupData = groupSnap.data();
  let updates = {};
  let needsUpdate = false;

  console.log(`\n--- Prüfe Gruppe: ${groupData.name} (${groupId}) ---`);

  // 1. Veraltetes 'playerIds'-Array entfernen
  if (groupData.playerIds && Array.isArray(groupData.playerIds)) {
    console.log(`[${groupId}] Veraltetes 'playerIds'-Array gefunden. Wird zum Entfernen markiert.`);
    updates.playerIds = admin.firestore.FieldValue.delete();
    needsUpdate = true;
  }

  // 2. 'players'-Map-Schlüssel von authUid auf playerDocId migrieren
  const playersMap = groupData.players || {};
  const migratedPlayersMap = {};
  let mapWasMigrated = false;

  const playerAuthUids = Object.keys(playersMap);
  if (playerAuthUids.length > 0) {
    // Annahme: Wenn ein Schlüssel eine typische authUid-Länge hat (28 Zeichen), ist es wahrscheinlich eine alte Struktur.
    const potentialAuthUid = playerAuthUids.find(key => key.length === 28);
    
    if (potentialAuthUid) {
        console.log(`[${groupId}] Potenziell veraltete 'players'-Map-Struktur erkannt. Starte Migration der Schlüssel...`);
        
        for (const authUid of playerAuthUids) {
            const playerQuery = await db.collection(PLAYERS_COLLECTION).where("userId", "==", authUid).limit(1).get();
            if (!playerQuery.empty) {
                const playerDoc = playerQuery.docs[0];
                const playerDocId = playerDoc.id;
                migratedPlayersMap[playerDocId] = playersMap[authUid];
                console.log(`  - Schlüssel '${authUid}' migriert zu '${playerDocId}'.`);
            } else {
                console.warn(`  - WARNUNG: Kein Player-Dokument für authUid '${authUid}' gefunden. Dieser Eintrag kann nicht migriert werden und wird übersprungen.`);
                // Behalte den alten Eintrag, um Datenverlust zu vermeiden, oder überspringe ihn bewusst
                 migratedPlayersMap[authUid] = playersMap[authUid]; // Behalte den alten zur Sicherheit
            }
        }
        updates.players = migratedPlayersMap;
        needsUpdate = true;
        mapWasMigrated = true;
        console.log(`[${groupId}] Migration der 'players'-Map abgeschlossen.`);
    }
  }


  // 3. Update durchführen, falls notwendig
  if (needsUpdate) {
    try {
      await db.collection(GROUPS_COLLECTION).doc(groupId).update(updates);
      console.log(`✅ [${groupId}] Gruppe erfolgreich migriert.`);
    } catch (error) {
      console.error(`❌ [${groupId}] Fehler bei der Migration der Gruppe:`, error);
    }
  } else {
    console.log(`[${groupId}] Keine Migration notwendig. Datenstruktur ist bereits aktuell.`);
  }
}

/**
 * Hauptfunktion zum Starten der Migration für alle Gruppen.
 */
async function runMigration() {
  console.log("🚀 Starte Migration für alle Gruppen...");
  
  try {
    const groupsSnapshot = await db.collection(GROUPS_COLLECTION).get();
    if (groupsSnapshot.empty) {
      console.log("Keine Gruppen zum Migrieren gefunden.");
      return;
    }

    console.log(`Gefundene Gruppen: ${groupsSnapshot.size}`);
    
    // Führe Migration für jede Gruppe aus
    for (const groupDoc of groupsSnapshot.docs) {
      await migrateGroup(groupDoc);
    }

    console.log("\n🎉🎉🎉 Migration für alle Gruppen abgeschlossen! 🎉🎉🎉");
  } catch (error) {
    console.error("Ein schwerwiegender Fehler ist während der Migration aufgetreten:", error);
    process.exit(1);
  }
}

// Skript starten
runMigration(); 