const admin = require("firebase-admin");

// Pfad zum Service-Account-Key
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const batchSize = 100;

// --- Hilfsfunktionen ---

const authUidToPlayerIdCache = new Map();

async function getPlayerIdFromAuthUid(authUid) {
  if (authUidToPlayerIdCache.has(authUid)) {
    return authUidToPlayerIdCache.get(authUid);
  }

  const usersRef = db.collection("users").doc(authUid);
  const userDoc = await usersRef.get();

  if (userDoc.exists && userDoc.data().playerId) {
    const playerId = userDoc.data().playerId;
    authUidToPlayerIdCache.set(authUid, playerId);
    return playerId;
  } else {
    const playerQuery = await db.collection('players').where('userId', '==', authUid).limit(1).get();
    if (!playerQuery.empty) {
        const playerId = playerQuery.docs[0].id;
        authUidToPlayerIdCache.set(authUid, playerId);
        if(userDoc.exists) {
            await userDoc.ref.update({ playerId: playerId }).catch(e => console.error(`Konnte User-Dokument ${authUid} nicht heilen`, e));
        }
        return playerId;
    }
    console.warn(`⚠️ Kein User-Dokument oder keine playerId für Auth-UID gefunden: ${authUid}`);
    return null;
  }
}

// --- NEUE, ROBUSTERE MIGRATIONSLOGIK ---

async function migrateDocuments(querySnapshot) {
  if (querySnapshot.empty) {
    return; // Nichts zu tun
  }
  
  const batches = [];
  let currentBatch = db.batch();
  let currentBatchSize = 0;
  const batchSize = 100;

  for (const doc of querySnapshot.docs) {
    const data = doc.data();
    const docIdentifier = doc.ref.path;

    if (data.participantPlayerIds) {
      console.log(`➡️  Überspringe ${docIdentifier} (bereits migriert).`);
      continue;
    }

    const uidsToProcess = data.participantUids || data.participantUidsForPasse;
    if (!uidsToProcess || !Array.isArray(uidsToProcess) || uidsToProcess.length === 0) {
      console.log(`➡️  Überspringe ${docIdentifier} (keine Teilnehmer-UIDs).`);
      continue;
    }
    
    console.log(`⚙️  Verarbeite ${docIdentifier}...`);

    const playerIds = await Promise.all(uidsToProcess.map(uid => getPlayerIdFromAuthUid(uid)));
    const validPlayerIds = playerIds.filter(id => id !== null);

    if (validPlayerIds.length !== uidsToProcess.length) {
      console.error(`❌ FEHLER bei ${docIdentifier}: Nicht alle ${uidsToProcess.length} Auth-UIDs konnten zu Player-IDs aufgelöst werden.`);
      continue; 
    }
    
    currentBatch.update(doc.ref, {
      participantPlayerIds: validPlayerIds 
    });

    currentBatchSize++;
    if (currentBatchSize >= batchSize) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentBatchSize = 0;
    }
  }
  
  if (currentBatchSize > 0) {
    batches.push(currentBatch);
  }
  
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`✅ Batch ${i + 1}/${batches.length} für Pfad ${querySnapshot.query.path} geschrieben.`);
  }
}

async function runDualIdMigration() {
  console.log("🚀 Starte Dual-ID Migration (ROBUSTE VERSION): Füge 'participantPlayerIds' hinzu...");
  
  // 1. JassGameSummaries (Top-Level)
  console.log("\n--- (1/4) Migrating jassGameSummaries (top-level) ---");
  const summariesSnapshot = await db.collection('jassGameSummaries').get();
  await migrateDocuments(summariesSnapshot);

  // 2. jassGameSummaries -> completedGames (Sub-Collections)
  console.log("\n--- (2/4) Migrating completedGames (sub-collections) ---");
  for (const summaryDoc of summariesSnapshot.docs) {
    const completedGamesSnapshot = await summaryDoc.ref.collection('completedGames').get();
    if (completedGamesSnapshot.empty) {
        console.log(`Keine completedGames in ${summaryDoc.id} gefunden.`);
        continue;
    }
    await migrateDocuments(completedGamesSnapshot);
  }

  // 3. Tournaments -> games (Sub-Collections)
  console.log("\n--- (3/4) Migrating tournament games (sub-collections) ---");
  const tournamentsSnapshot = await db.collection('tournaments').get();
  for (const tournamentDoc of tournamentsSnapshot.docs) {
    const gamesSnapshot = await tournamentDoc.ref.collection('games').get();
     if (gamesSnapshot.empty) {
        console.log(`Keine games in Turnier ${tournamentDoc.id} gefunden.`);
        continue;
    }
    await migrateDocuments(gamesSnapshot);
  }

  // 4. activeGames (Top-Level)
  console.log("\n--- (4/4) Migrating activeGames (top-level) ---");
  const activeGamesSnapshot = await db.collection('activeGames').get();
  await migrateDocuments(activeGamesSnapshot);

  console.log("\n\n🎉🎉🎉 Dual-ID Migration erfolgreich abgeschlossen! Das System ist jetzt sicher und logisch konsistent. 🎉🎉🎉");
}


runDualIdMigration().catch(console.error); 