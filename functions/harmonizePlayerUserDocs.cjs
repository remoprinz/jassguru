const admin = require("firebase-admin");

// WICHTIG: Ersetzen Sie dies mit dem Pfad zu Ihrem Service-Account-Key
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function harmonizePlayerData() {
  const playersRef = db.collection("players");
  const snapshot = await playersRef.get();
  const batch = db.batch();

  if (snapshot.empty) {
    console.log("Keine Spieler-Dokumente gefunden. Überspringe Harmonisierung.");
    return;
  }

  console.log(`Analysiere ${snapshot.size} Spieler-Dokumente...`);

  snapshot.forEach((doc) => {
    const player = doc.data();
    const updatePayload = {};
    let needsUpdate = false;

    // 1. 'isGuest' hinzufügen/sicherstellen
    if (player.isGuest === undefined) {
      // Annahme: Alle bestehenden Spieler ohne das Flag sind keine Gäste.
      updatePayload.isGuest = false;
      needsUpdate = true;
      console.log(`[${doc.id}] Füge 'isGuest: false' hinzu.`);
    }

    // 2. Redundantes 'statusMessage' entfernen
    if (player.statusMessage !== undefined) {
      updatePayload.statusMessage = admin.firestore.FieldValue.delete();
      needsUpdate = true;
      console.log(`[${doc.id}] Entferne 'statusMessage'.`);
    }

    // 3. Veraltetes 'updatedAt' entfernen
    if (player.updatedAt !== undefined) {
      updatePayload.updatedAt = admin.firestore.FieldValue.delete();
      needsUpdate = true;
      console.log(`[${doc.id}] Entferne 'updatedAt'.`);
    }

    // 4. 'metadata.isOG' entfernen
    if (player.metadata && player.metadata.isOG !== undefined) {
      updatePayload["metadata.isOG"] = admin.firestore.FieldValue.delete();
      needsUpdate = true;
      console.log(`[${doc.id}] Entferne 'metadata.isOG'.`);
    }

    // 5. Veraltetes 'stats' Objekt entfernen
    if (player.stats !== undefined) {
      updatePayload.stats = admin.firestore.FieldValue.delete();
      needsUpdate = true;
      console.log(`[${doc.id}] Entferne veraltetes 'stats' Objekt.`);
    }

    if (needsUpdate) {
      batch.update(doc.ref, updatePayload);
    }
  });

  await batch.commit();
  console.log("✅ Harmonisierung der Spieler-Daten abgeschlossen.");
}

async function harmonizeUserData() {
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  const batch = db.batch();

  if (snapshot.empty) {
    console.log("Keine User-Dokumente gefunden. Überspringe Harmonisierung.");
    return;
  }

  console.log(`Analysiere ${snapshot.size} User-Dokumente...`);

  snapshot.forEach((doc) => {
    const user = doc.data();
    const updatePayload = {};
    let needsUpdate = false;

    // 1. Veraltetes 'updatedAt' entfernen
    if (user.updatedAt !== undefined) {
      updatePayload.updatedAt = admin.firestore.FieldValue.delete();
      needsUpdate = true;
      console.log(`[${doc.id}] Entferne 'updatedAt'.`);
    }

    if (needsUpdate) {
      batch.update(doc.ref, updatePayload);
    }
  });

  await batch.commit();
  console.log("✅ Harmonisierung der User-Daten abgeschlossen.");
}

/**
 * Kopiert den statusMessage von users zu players für Konsistenz
 */
async function copyStatusMessagesToPlayers() {
  console.log("\nKopiere 'statusMessage' von Users zu Players...");
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log("Keine User-Dokumente für statusMessage-Kopie gefunden.");
    return;
  }

  const batch = db.batch();

  for (const userDoc of snapshot.docs) {
    const user = userDoc.data();
    // Kopiere nur, wenn ein Spruch und eine verknüpfte Player-ID existiert
    if (user.statusMessage && user.playerId) {
      const playerRef = db.collection("players").doc(user.playerId);
      batch.update(playerRef, { statusMessage: user.statusMessage });
      console.log(`[${userDoc.id}] -> [${user.playerId}]: Kopiere statusMessage.`);
    }
  }

  await batch.commit();
  console.log("✅ 'statusMessage' wurde zu den Player-Dokumenten kopiert.");
}

async function runHarmonization() {
  console.log("Starte Datenharmonisierung (erweiterter Durchlauf)...");
  await harmonizePlayerData();
  await harmonizeUserData();
  await copyStatusMessagesToPlayers();
  console.log("🎉 Alle Daten wurden erfolgreich und vollständig harmonisiert.");
}

runHarmonization().catch(console.error); 