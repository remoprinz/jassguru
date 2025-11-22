/**
 * FIND & DELETE SCRIPT: Findet und löscht ALLE "Jassmeister" Einträge
 * Sucht in Players und Users (case-insensitive)
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
const SEARCH_NAME = "jassmeister"; // lowercase für Vergleich

async function findAndDelete() {
  console.log(`🔍 Suche nach ALLEN "Jassmeister" Einträgen (case-insensitive)...\n`);

  try {
    // 1. SUCHE ALLE PLAYERS
    console.log("👤 Suche nach Players...");
    const allPlayers = await db.collection("players").get();
    const matchingPlayers: Array<{ id: string; data: any }> = [];

    allPlayers.forEach(doc => {
      const data = doc.data();
      const displayName = data.displayName || "";
      const lowercaseDisplayName = data.lowercaseDisplayName || displayName.toLowerCase();
      
      if (lowercaseDisplayName === SEARCH_NAME || displayName.toLowerCase() === SEARCH_NAME) {
        matchingPlayers.push({ id: doc.id, data });
      }
    });

    console.log(`   ✅ ${matchingPlayers.length} Player gefunden`);
    for (const player of matchingPlayers) {
      console.log(`      - Player ID: ${player.id}, Name: "${player.data.displayName}", User ID: ${player.data.userId || 'N/A'}`);
    }

    // 2. SUCHE ALLE USERS
    console.log("\n👤 Suche nach Users...");
    const allUsers = await db.collection("users").get();
    const matchingUsers: Array<{ id: string; data: any }> = [];

    allUsers.forEach(doc => {
      const data = doc.data();
      const displayName = data.displayName || "";
      
      if (displayName.toLowerCase() === SEARCH_NAME) {
        matchingUsers.push({ id: doc.id, data });
      }
    });

    console.log(`   ✅ ${matchingUsers.length} User-Dokumente gefunden`);
    for (const user of matchingUsers) {
      console.log(`      - User ID: ${user.id}, Name: "${user.data.displayName}", Email: ${user.data.email || 'N/A'}`);
    }

    // 3. LÖSCHE ALLE GEFUNDENEN PLAYERS
    console.log("\n🗑️  Starte Löschung...\n");
    
    if (matchingPlayers.length > 0) {
      console.log("📝 Lösche Players...");
      for (const player of matchingPlayers) {
        await db.collection("players").doc(player.id).delete();
        console.log(`   ✅ Player gelöscht: ${player.id}`);
        
        // Wenn Player eine userId hat, prüfe ob User auch gelöscht werden muss
        if (player.data.userId) {
          try {
            const userDoc = await db.collection("users").doc(player.data.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              if (userData?.displayName?.toLowerCase() === SEARCH_NAME) {
                console.log(`   ⚠️  User ${player.data.userId} wird auch gelöscht (verknüpft mit Player)`);
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    // 4. LÖSCHE ALLE GEFUNDENEN USERS (inkl. Auth)
    if (matchingUsers.length > 0) {
      console.log("\n📝 Lösche Users...");
      for (const user of matchingUsers) {
        const userId = user.id;
        
        // Lösche User-Dokument
        await db.collection("users").doc(userId).delete();
        console.log(`   ✅ User-Dokument gelöscht: ${userId}`);
        
        // Lösche Firebase Auth User (falls vorhanden)
        try {
          const authUser = await admin.auth().getUser(userId);
          await admin.auth().deleteUser(userId);
          console.log(`   ✅ Firebase Auth User gelöscht: ${userId} (Email: ${authUser.email || 'N/A'})`);
        } catch (authError: any) {
          if (authError.code === "auth/user-not-found") {
            console.log(`   ⚠️  Firebase Auth User nicht gefunden: ${userId}`);
          } else {
            console.log(`   ⚠️  Konnte Auth User nicht löschen: ${authError.message}`);
          }
        }
      }
    }

    // 5. ZUSAMMENFASSUNG
    console.log("\n✅ Löschung abgeschlossen!");
    console.log("\n📊 Zusammenfassung:");
    console.log(`   - Players gelöscht: ${matchingPlayers.length}`);
    console.log(`   - Users gelöscht: ${matchingUsers.length}`);
    
    if (matchingPlayers.length === 0 && matchingUsers.length === 0) {
      console.log("\n   ℹ️  Keine 'Jassmeister' Einträge gefunden!");
    }

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

