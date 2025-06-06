    // migrateGroups.js
    // Dieses Skript läuft in der lokalen Umgebung mit Firebase Admin SDK
    const admin = require('firebase-admin');

    // Initialisierung mit Application Default Credentials oder der lokalen Firebase-Konfiguration
    // Falls Sie eine spezifische Service Account Key Datei haben, können Sie den Pfad hier angeben:
    const serviceAccount = require('./jassguru-firebase-adminsdk-44hjy-846f0f16ba.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

    // Für lokale Entwicklung mit Firebase CLI:
    // if (!admin.apps.length) {
    //   admin.initializeApp();
    // }

    const db = admin.firestore();

    // Ihre beiden Gruppen-IDs
    const groupIdsToMigrate = ['Tz0wgIHMTlhvTtFastiJ', 'UYYJnqdIOhZlygFG2lMo'];

    async function migrateGroupPlayers(groupId) {
      console.log(`\nStarting migration for group: ${groupId}`);
      const groupRef = db.collection('groups').doc(groupId);

      try {
        const groupDoc = await groupRef.get();
        if (!groupDoc.exists) {
          console.log(`Group ${groupId} not found. Skipping.`);
          return { groupId, status: 'not_found', changesProposed: false, errors: 0 };
        }

        const groupData = groupDoc.data();
        const oldPlayersObject = groupData.players;

        if (!oldPlayersObject || typeof oldPlayersObject !== 'object' || Object.keys(oldPlayersObject).length === 0) {
          console.log(`No players object found or it's empty in group ${groupId}. Skipping.`);
          return { groupId, status: 'no_players_object', changesProposed: false, errors: 0 };
        }

        console.log(`Found ${Object.keys(oldPlayersObject).length} entries in old players object for group ${groupId}.`);

        const newPlayersObject = {};
        let changesMade = false; // Wird true, wenn eine strukturelle Änderung vorgeschlagen wird

        for (const currentKey in oldPlayersObject) {
          if (Object.prototype.hasOwnProperty.call(oldPlayersObject, currentKey)) {
            const playerDataEntry = oldPlayersObject[currentKey];
            const originalDisplayName = playerDataEntry.displayName || playerDataEntry.name || 'Unbekannter Spieler';

            let targetPlayerDocId = null;
            let targetAuthUid = null;
            // Standard für isGuest ist false, wenn wir eine authUid finden, sonst true
            let isGuestEntry = playerDataEntry.isGuest !== undefined ? playerDataEntry.isGuest : true; 
            let finalName = originalDisplayName;

            // Versuche herauszufinden, ob currentKey eine authUid oder bereits eine playerDocId ist
            const playerDocByUserId = await db.collection('players').where('userId', '==', currentKey).limit(1).get();

            if (!playerDocByUserId.empty) {
              // currentKey war eine authUid
              targetPlayerDocId = playerDocByUserId.docs[0].id;
              targetAuthUid = currentKey;
              isGuestEntry = false; // Da authUid vorhanden
              console.log(`  Key '${currentKey}' (authUid): Matched to playerDocId '${targetPlayerDocId}'. Name: '${finalName}'`);
            } else {
              // currentKey war keine authUid, die direkt in 'players.userId' gefunden wurde.
              // Prüfe, ob currentKey selbst eine playerDocId ist.
              const playerDocById = await db.collection('players').doc(currentKey).get();
              if (playerDocById.exists) {
                targetPlayerDocId = currentKey;
                const playerDataFromPlayerDoc = playerDocById.data();
                targetAuthUid = playerDataFromPlayerDoc.userId || playerDataEntry.authUid || null;
                if (targetAuthUid) isGuestEntry = false; // Wenn authUid aus PlayerDoc oder Eintrag kommt
                console.log(`  Key '${currentKey}' (playerDocId): PlayerDoc exists. AuthUid: '${targetAuthUid}'. Name: '${finalName}'`);
              } else {
                // Kein Spieler-Dokument für currentKey gefunden (weder als userId noch als docId).
                // Behandle als potenziell verwaisten Eintrag oder Gast-playerDocId.
                targetPlayerDocId = currentKey; // Behalte den Key
                targetAuthUid = playerDataEntry.authUid || null; // Nimm authUid aus Eintrag, falls vorhanden
                isGuestEntry = !targetAuthUid; // Gast, wenn keine explizite authUid im Eintrag
                console.warn(`  WARN: Key '${currentKey}': No player document found by userId or docId. Treating as potential guest/orphaned. AuthUid in entry: '${targetAuthUid}'. Name: '${finalName}'`);
              }
            }

            // Neue Struktur erstellen
            const newEntry = {
              name: finalName,
              isGuest: isGuestEntry,
              authUid: targetAuthUid
            };

            // Duplikate im newPlayersObject vermeiden (wenn verschiedene alte Keys auf dieselbe playerDocId zeigen)
            if (newPlayersObject[targetPlayerDocId]) {
              console.warn(`  WARN: playerDocId '${targetPlayerDocId}' already processed for this group (from a different original key). Skipping duplicate for original key '${currentKey}'.`);
            } else {
              newPlayersObject[targetPlayerDocId] = newEntry;
              
              // Prüfen, ob sich etwas Wesentliches geändert hat, das ein Update rechtfertigt
              if (currentKey !== targetPlayerDocId || // Der Schlüssel hat sich geändert (authUid -> playerDocId)
                  (playerDataEntry.name || playerDataEntry.displayName) !== newEntry.name || // Name anders
                  playerDataEntry.isGuest !== newEntry.isGuest || // Gast-Status anders
                  playerDataEntry.authUid !== newEntry.authUid) { // authUid-Feld anders
                changesMade = true;
              }
            }
          }
        }

        if (Object.keys(newPlayersObject).length === 0 && Object.keys(oldPlayersObject).length > 0) {
            console.warn(`  WARN: oldPlayersObject had entries, but newPlayersObject is empty. This might indicate an issue. Group: ${groupId}`);
        }


        if (changesMade || JSON.stringify(oldPlayersObject) !== JSON.stringify(newPlayersObject) ) { // Zweite Bedingung für Fälle, wo nur Keys neu sortiert oder minimale Strukturänderungen stattfanden
          console.log(`\n--- DRY RUN: Proposed changes for group ${groupId} ---`);
          console.log("Old players object had keys:", Object.keys(oldPlayersObject).join(', '));
          console.log("New players object would have keys:", Object.keys(newPlayersObject).join(', '));
          console.log("Full new players object structure (preview):");
          console.log(JSON.stringify(newPlayersObject, null, 2));
          console.log("--- END DRY RUN ---");

          // !!!!! PRODUKTIVMODUS: Änderungen schreiben (erst nach Test aktivieren!) !!!!!
          // await groupRef.update({ players: newPlayersObject });
          // console.log(`SUCCESS: Group ${groupId} players object updated successfully!`);

        } else {
          console.log(`No structural changes or necessary updates identified for group ${groupId}. players object seems compliant.`);
        }

        return { groupId, status: 'processed', changesProposed: changesMade, errors: 0 };

      } catch (error) {
        console.error(`Error migrating group ${groupId}:`, error);
        return { groupId, status: 'error', changesProposed: false, errors: 1 };
      }
    }

    async function runMigration() {
      console.log("Starting Firestore migration for group players objects...");
      console.warn("!!! ENSURE YOU HAVE A BACKUP OF YOUR FIRESTORE DATA !!!");
      console.log("Current mode: DRY RUN (no changes will be written to Firestore)");

      const results = [];
      for (const groupId of groupIdsToMigrate) {
        const result = await migrateGroupPlayers(groupId);
        results.push(result);
      }

      console.log("\n--- Migration Process Summary ---");
      results.forEach(res => {
        console.log(`Group: ${res.groupId}, Status: ${res.status}, Changes Proposed: ${res.changesProposed}, Errors: ${res.errors}`);
      });
      console.log("\nReview the logs above. If everything looks correct, you can modify the script to perform the actual Firestore updates.");
      console.log("To apply changes, uncomment the 'await groupRef.update({ players: newPlayersObject });' line in the script and run again.");
    }

    runMigration().catch(console.error);