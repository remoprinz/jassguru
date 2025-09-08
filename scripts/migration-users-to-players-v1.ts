import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// --- Konfiguration ---
// Service Account Key liegt im functions-Verzeichnis
const serviceAccount = require('../functions/serviceAccountKey.json'); 

const USERS_COLLECTION = 'users';
const PLAYERS_COLLECTION = 'players';

// Diese Felder werden vom `users`-Dokument zum `players`-Dokument migriert
// und anschließend aus dem `users`-Dokument entfernt.
const PUBLIC_FIELDS_TO_MIGRATE = [
    'displayName',
    'photoURL',
    'statusMessage',
    'profileTheme',
    'nickname' // Veraltetes Feld, das ebenfalls migriert wird
];

// --- Initialisierung ---
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error: any) {
    if (!/already exists/u.test(error.message)) {
        console.error('Firebase admin initialization error', error.stack);
    }
}

const db = admin.firestore();

/**
 * Führt die Datenmigration für alle Benutzer aus.
 * Liest alle Dokumente aus der `users`-Collection, migriert öffentliche Felder
 * in die `players`-Collection und entfernt sie aus der `users`-Collection.
 */
const migrateUsersToPlayers = async () => {
    console.log("Starte Migration von User-Daten zu Player-Profilen...");
    console.log(`Felder zu migrieren: ${PUBLIC_FIELDS_TO_MIGRATE.join(', ')}`);

    const usersSnapshot = await db.collection(USERS_COLLECTION).get();
    if (usersSnapshot.empty) {
        console.log("Keine Benutzer in der 'users'-Collection gefunden. Migration abgeschlossen.");
        return;
    }

    console.log(`Gefunden: ${usersSnapshot.size} Benutzerdokumente. Verarbeite in Batches...`);

    let batch = db.batch();
    let operationsInBatch = 0;
    let processedUsers = 0;
    const totalUsers = usersSnapshot.size;

    for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();

        const { playerId } = userData;

        if (!playerId || typeof playerId !== 'string') {
            console.warn(`⚠️  [SKIP] User ${userId}: Fehlende oder ungültige 'playerId'. Manuelle Prüfung erforderlich.`);
            continue;
        }

        const playerRef = db.collection(PLAYERS_COLLECTION).doc(playerId);
        const userRef = db.collection(USERS_COLLECTION).doc(userId);

        const dataToMigrate: { [key: string]: any } = {};
        const fieldsToDelete: { [key: string]: FieldValue } = {};

        // 1. Sammle Daten, die migriert werden sollen
        PUBLIC_FIELDS_TO_MIGRATE.forEach(field => {
            if (userData[field] !== undefined) {
                // Spezialfall: `nickname` wird zu `displayName` wenn `displayName` nicht existiert
                if (field === 'nickname' && !dataToMigrate['displayName'] && userData[field]) {
                    dataToMigrate['displayName'] = userData[field];
                } else if (field !== 'nickname') {
                    dataToMigrate[field] = userData[field];
                }
                fieldsToDelete[field] = FieldValue.delete();
            }
        });

        if (Object.keys(dataToMigrate).length === 0) {
            // console.log(`ℹ️  [INFO] User ${userId}: Keine öffentlichen Felder zum Migrieren gefunden. Überspringe.`);
            continue;
        }
        
        console.log(`✅  [PREPARE] User ${userId} -> Player ${playerId}: Migriere ${Object.keys(dataToMigrate).length} Feld(er).`);

        // 2. Füge Operationen zum Batch hinzu
        // WICHTIG: merge: true stellt sicher, dass wir bestehende Player-Daten nicht überschreiben
        batch.set(playerRef, dataToMigrate, { merge: true });
        batch.update(userRef, fieldsToDelete);
        operationsInBatch += 2;

        processedUsers++;

        // 3. Führe den Batch aus, wenn er voll ist
        if (operationsInBatch >= 498) { // (Limit ist 500, Puffer für Sicherheit)
            console.log(`--- Committing Batch (${operationsInBatch} operations) ---`);
            await batch.commit();
            console.log(`--- Batch Committed ---`);
            // Reset für den nächsten Batch
            batch = db.batch();
            operationsInBatch = 0;
        }
    }

    // 4. Führe den letzten Batch aus, falls noch Operationen übrig sind
    if (operationsInBatch > 0) {
        console.log(`--- Committing Final Batch (${operationsInBatch} operations) ---`);
        await batch.commit();
        console.log(`--- Final Batch Committed ---`);
    }

    console.log("\n-----------------------------------------");
    console.log("✅ MIGRATION ABGESCHLOSSEN!");
    console.log(`Verarbeitete Benutzer: ${processedUsers} / ${totalUsers}`);
    console.log("-----------------------------------------");
};

// Führe die Migration aus
migrateUsersToPlayers().catch(error => {
    console.error("Ein schwerwiegender Fehler ist während der Migration aufgetreten:", error);
}); 