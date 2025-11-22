/**
 * PERMANENTES SCRIPT: Löscht Test-Registrierungen
 * Findet und löscht User/Player/Gruppe für eine gegebene Email
 * 
 * Usage: npx ts-node --project tsconfig.json scripts/delete-test-registration.ts [email]
 * Default: teamschiebermeister@gmail.com
 */

import * as admin from "firebase-admin";
import * as path from "path";

const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "jassguru"
  });
  console.log("✅ Firebase Admin initialisiert");
} catch (e: any) {
  if (e.code === "app/already-initialized") {
    console.log("Firebase Admin bereits initialisiert.");
  } else {
    console.error("Fehler:", e.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const TEST_EMAIL = process.argv[2] || "teamschiebermeister@gmail.com";

async function findAndDelete() {
  console.log("🔍 Suche nach Test-Daten für", TEST_EMAIL, "\n");

  try {
    // 1. Finde User via Email
    console.log("👤 Suche nach Firebase Auth User...");
    let userId: string | null = null;
    try {
      const authUser = await admin.auth().getUserByEmail(TEST_EMAIL);
      userId = authUser.uid;
      console.log(`✅ User gefunden: ${userId}`);
    } catch (authError: any) {
      if (authError.code === "auth/user-not-found") {
        console.log("⚠️  Kein Firebase Auth User gefunden");
      }
    }

    // 2. Finde User-Dokument
    let playerId: string | null = null;
    let groupId: string | null = null;
    
    if (userId) {
      console.log("\n📄 Suche nach User-Dokument...");
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        playerId = userData?.playerId || null;
        groupId = userData?.lastActiveGroupId || null;
        console.log(`✅ User-Dokument gefunden`);
        if (playerId) console.log(`   Player ID: ${playerId}`);
        if (groupId) console.log(`   Group ID: ${groupId}`);
      }
    }

    // 3. Finde Player direkt (falls nicht im User-Doc)
    if (!playerId && userId) {
      console.log("\n👤 Suche nach Player via userId...");
      const playersQuery = await db
        .collection("players")
        .where("userId", "==", userId)
        .limit(1)
        .get();
      if (!playersQuery.empty) {
        playerId = playersQuery.docs[0].id;
        console.log(`✅ Player gefunden: ${playerId}`);
      }
    }

    // 4. Finde Gruppe via Player (falls nicht im User-Doc)
    if (!groupId && playerId) {
      console.log("\n📁 Suche nach Gruppe via Player...");
      const playerDoc = await db.collection("players").doc(playerId).get();
      if (playerDoc.exists) {
        const groupIds = playerDoc.data()?.groupIds || [];
        if (groupIds.length > 0) {
          groupId = groupIds[0]; // Nimm die erste Gruppe
          console.log(`✅ Gruppe gefunden: ${groupId}`);
        }
      }
    }

    // 5. LÖSCHE ALLES
    console.log("\n🗑️  Starte Löschung...\n");

    if (groupId) {
      console.log(`📁 Lösche Gruppe: ${groupId}...`);
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();
      if (groupSnap.exists) {
        const membersSnap = await groupRef.collection("members").get();
        if (membersSnap.docs.length > 0) {
          const batch = db.batch();
          membersSnap.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`   ✅ ${membersSnap.docs.length} Member gelöscht`);
        }
        await groupRef.delete();
        console.log(`   ✅ Gruppe gelöscht`);
      }
    }

    if (playerId) {
      console.log(`\n👤 Lösche Player: ${playerId}...`);
      await db.collection("players").doc(playerId).delete();
      console.log(`   ✅ Player gelöscht`);
    }

    if (userId) {
      console.log(`\n📄 Lösche User-Dokument: ${userId}...`);
      await db.collection("users").doc(userId).delete();
      console.log(`   ✅ User-Dokument gelöscht`);

      console.log(`\n🔐 Lösche Firebase Auth User...`);
      await admin.auth().deleteUser(userId);
      console.log(`   ✅ Firebase Auth User gelöscht`);
    }

    // 6. Lösche alle Registrierungen
    console.log(`\n📝 Lösche alle Registrierungen für ${TEST_EMAIL}...`);
    const registrationsQuery = await db
      .collection("jassmeisterRegistrations")
      .where("captainEmail", "==", TEST_EMAIL)
      .get();
    
    if (!registrationsQuery.empty) {
      const batch = db.batch();
      registrationsQuery.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`   ✅ ${registrationsQuery.docs.length} Registrierung(en) gelöscht`);
    } else {
      console.log(`   ⚠️  Keine Registrierungen gefunden`);
    }

    console.log("\n✅ Fertig!");
  } catch (error) {
    console.error("\n❌ Fehler:", error);
    process.exit(1);
  }
}

findAndDelete()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unerwarteter Fehler:", error);
    process.exit(1);
  });

