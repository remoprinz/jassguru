const admin = require('firebase-admin');

// --- Konfiguration ---
// Service Account Key liegt im functions-Verzeichnis
const serviceAccount = require('../functions/serviceAccountKey.json');

const GROUPS_COLLECTION = 'groups';

// --- Initialisierung ---
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    if (!/already exists/u.test(error.message)) {
        console.error('Firebase Admin SDK Initialisierung fehlgeschlagen:', error);
        process.exit(1);
    }
}

const db = admin.firestore();

/**
 * Entfernt die email-Felder aus allen group.players-Objekten
 */
async function removeEmailsFromGroupPlayers() {
    console.log('🚀 Starte Migration: Entfernung der E-Mail-Adressen aus group.players...');
    
    try {
        // Alle Gruppen abrufen
        const groupsSnapshot = await db.collection(GROUPS_COLLECTION).get();
        
        if (groupsSnapshot.empty) {
            console.log('ℹ️ Keine Gruppen gefunden.');
            return;
        }

        console.log(`📋 ${groupsSnapshot.size} Gruppen gefunden. Starte Verarbeitung...`);

        const batch = db.batch();
        let processedGroups = 0;
        let modifiedGroups = 0;

        for (const groupDoc of groupsSnapshot.docs) {
            const groupData = groupDoc.data();
            const groupId = groupDoc.id;
            
            // Prüfe, ob players-Objekt existiert
            if (!groupData.players || typeof groupData.players !== 'object') {
                console.log(`⏭️ Gruppe ${groupId}: Kein players-Objekt vorhanden.`);
                processedGroups++;
                continue;
            }

            const players = groupData.players;
            const updatedPlayers = {};
            let hasEmailsToRemove = false;

            // Durchlaufe jeden Spieler im players-Objekt
            for (const [playerId, playerData] of Object.entries(players)) {
                if (playerData && typeof playerData === 'object') {
                    // Kopiere alle Felder außer email
                    const cleanedPlayerData = {};
                    for (const [key, value] of Object.entries(playerData)) {
                        if (key !== 'email') {
                            cleanedPlayerData[key] = value;
                        } else {
                            hasEmailsToRemove = true;
                            console.log(`🗑️ Gruppe ${groupId}, Spieler ${playerId}: E-Mail-Feld wird entfernt.`);
                        }
                    }
                    updatedPlayers[playerId] = cleanedPlayerData;
                } else {
                    // Behalte ungültige Spielerdaten unverändert
                    updatedPlayers[playerId] = playerData;
                }
            }

            // Nur updaten, wenn tatsächlich E-Mails entfernt wurden
            if (hasEmailsToRemove) {
                batch.update(groupDoc.ref, {
                    players: updatedPlayers,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                modifiedGroups++;
                console.log(`✅ Gruppe ${groupId}: Update für Batch vorbereitet.`);
            } else {
                console.log(`⏭️ Gruppe ${groupId}: Keine E-Mail-Felder gefunden.`);
            }

            processedGroups++;
        }

        // Batch-Update ausführen
        if (modifiedGroups > 0) {
            console.log(`🔄 Führe Batch-Update für ${modifiedGroups} Gruppen aus...`);
            await batch.commit();
            console.log(`🎉 Batch-Update erfolgreich abgeschlossen!`);
        } else {
            console.log(`ℹ️ Keine Gruppen benötigten Änderungen.`);
        }

        console.log('\n📊 MIGRATION ABGESCHLOSSEN');
        console.log(`✅ Verarbeitete Gruppen: ${processedGroups}`);
        console.log(`🔧 Modifizierte Gruppen: ${modifiedGroups}`);
        console.log(`⚡ E-Mail-Felder erfolgreich aus group.players entfernt!`);

    } catch (error) {
        console.error('❌ Fehler bei der Migration:', error);
        throw error;
    }
}

// --- Hauptausführung ---
async function main() {
    try {
        await removeEmailsFromGroupPlayers();
        console.log('\n🎯 Migration erfolgreich abgeschlossen!');
        process.exit(0);
    } catch (error) {
        console.error('\n💥 Migration fehlgeschlagen:', error);
        process.exit(1);
    }
}

// Skript ausführen
main(); 