/**
 * CLEANUP SCRIPT: Löscht alle Test-Daten
 * - Gruppe "Jassgurus"
 * - Player mit displayName "Jassmeister" (case-insensitive)
 * - User mit displayName "Jassmeister"
 * - Alle Registrierungen für teamschiebermeister@gmail.com
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
const TEST_EMAIL = "teamschiebermeister@gmail.com";
const TEST_GROUPNAME = "Jassgurus";
const TEST_PLAYERNAME = "jassmeister"; // lowercase für case-insensitive Vergleich

async function cleanup() {
  console.log("🧹 Starte Cleanup von Test-Daten...\n");

  try {
    // 1. LÖSCHE GRUPPE "Jassgurus"
    console.log(`📁 Suche nach Gruppe "${TEST_GROUPNAME}"...`);
    const groupsQuery = await db
      .collection("groups")
      .where("name", "==", TEST_GROUPNAME)
      .get();

    if (!groupsQuery.empty) {
      for (const groupDoc of groupsQuery.docs) {
        const groupId = groupDoc.id;
        console.log(`   ✅ Gruppe gefunden: ${groupId}`);
        
        // Lösche Members
        const membersSnap = await groupDoc.ref.collection("members").get();
        if (membersSnap.docs.length > 0) {
          const batch = db.batch();
          membersSnap.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`   ✅ ${membersSnap.docs.length} Member gelöscht`);
        }
        
        await groupDoc.ref.delete();
        console.log(`   ✅ Gruppe gelöscht\n`);
      }
    } else {
      console.log(`   ⚠️  Keine Gruppe gefunden\n`);
    }

    // 2. LÖSCHE PLAYER "Jassmeister" (case-insensitive) - DURCHSUCHE ALLE
    console.log(`👤 Suche nach Player "${TEST_PLAYERNAME}" (case-insensitive, durchsuche alle)...`);
    const allPlayers = await db.collection("players").get();
    const matchingPlayers: Array<{ id: string; data: any }> = [];

    allPlayers.forEach(doc => {
      const data = doc.data();
      const displayName = data.displayName || "";
      const lowercaseDisplayName = data.lowercaseDisplayName || displayName.toLowerCase();
      
      if (lowercaseDisplayName === TEST_PLAYERNAME || displayName.toLowerCase() === TEST_PLAYERNAME) {
        matchingPlayers.push({ id: doc.id, data });
      }
    });

    if (matchingPlayers.length > 0) {
      for (const player of matchingPlayers) {
        console.log(`   ✅ Player gefunden: ${player.id}`);
        console.log(`      DisplayName: ${player.data.displayName}`);
        console.log(`      User ID: ${player.data.userId || 'N/A'}`);
        
        await db.collection("players").doc(player.id).delete();
        console.log(`   ✅ Player gelöscht\n`);
      }
    } else {
      console.log(`   ⚠️  Kein Player gefunden\n`);
    }

    // 3. LÖSCHE USER "Jassmeister" (case-insensitive) - DURCHSUCHE ALLE
    console.log(`👤 Suche nach User "${TEST_PLAYERNAME}" (case-insensitive, durchsuche alle)...`);
    const allUsers = await db.collection("users").get();
    const matchingUsers: Array<{ id: string; data: any }> = [];

    allUsers.forEach(doc => {
      const data = doc.data();
      const displayName = data.displayName || "";
      
      if (displayName.toLowerCase() === TEST_PLAYERNAME) {
        matchingUsers.push({ id: doc.id, data });
      }
    });

    if (matchingUsers.length > 0) {
      for (const user of matchingUsers) {
        const userId = user.id;
        console.log(`   ✅ User gefunden: ${userId}`);
        console.log(`      DisplayName: ${user.data.displayName}`);
        console.log(`      Email: ${user.data.email || 'N/A'}`);
        
        // Lösche User-Dokument
        await db.collection("users").doc(userId).delete();
        console.log(`   ✅ User-Dokument gelöscht`);
        
        // Lösche Auth User
        try {
          await admin.auth().deleteUser(userId);
          console.log(`   ✅ Firebase Auth User gelöscht`);
        } catch (authError: any) {
          if (authError.code !== "auth/user-not-found") {
            console.log(`   ⚠️  Konnte Auth User nicht löschen: ${authError.message}`);
          }
        }
      }
      console.log();
    } else {
      console.log(`   ⚠️  Kein User gefunden\n`);
    }

    // 4. LÖSCHE USER via Email (falls noch vorhanden)
    console.log(`👤 Suche nach Firebase Auth User (${TEST_EMAIL})...`);
    try {
      const authUser = await admin.auth().getUserByEmail(TEST_EMAIL);
      const userId = authUser.uid;
      console.log(`   ✅ Firebase Auth User gefunden: ${userId}`);
      
      // Lösche User-Dokument (falls noch vorhanden)
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        await userDoc.ref.delete();
        console.log(`   ✅ User-Dokument gelöscht`);
      }
      
      // Lösche Auth User
      await admin.auth().deleteUser(userId);
      console.log(`   ✅ Firebase Auth User gelöscht\n`);
    } catch (authError: any) {
      if (authError.code === "auth/user-not-found") {
        console.log(`   ⚠️  Kein Firebase Auth User gefunden\n`);
      } else {
        console.log(`   ⚠️  Fehler: ${authError.message}\n`);
      }
    }

    // 5. LÖSCHE ALLE REGISTRIERUNGEN
    console.log(`📝 Suche nach Registrierungen (${TEST_EMAIL})...`);
    const registrationsQuery = await db
      .collection("jassmeisterRegistrations")
      .where("captainEmail", "==", TEST_EMAIL)
      .get();
    
    if (!registrationsQuery.empty) {
      const batch = db.batch();
      registrationsQuery.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`   ✅ ${registrationsQuery.docs.length} Registrierung(en) gelöscht\n`);
    } else {
      console.log(`   ⚠️  Keine Registrierungen gefunden\n`);
    }

    console.log("✅ Cleanup abgeschlossen!");
    console.log("\n📊 Zusammenfassung:");
    console.log(`   - Gruppen "${TEST_GROUPNAME}": ${groupsQuery.size} gelöscht`);
    console.log(`   - Player "${TEST_PLAYERNAME}": ${matchingPlayers.length} gelöscht`);
    console.log(`   - Users "${TEST_PLAYERNAME}": ${matchingUsers.length} gelöscht`);
    console.log(`   - Registrierungen: ${registrationsQuery.size} gelöscht`);
  } catch (error) {
    console.error("\n❌ Fehler:", error);
    process.exit(1);
  }
}

cleanup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unerwarteter Fehler:", error);
    process.exit(1);
  });

