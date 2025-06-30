const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// UID für den Benutzer "Remo"
const USER_ID = 'AaTUBO0SbWVfStdHmD7zi3qAMww2'; 

async function checkUserGroups() {
    if (!USER_ID) {
        console.error('❌ Bitte geben Sie eine Benutzer-ID an.');
        return;
    }

    console.log(`🔍 Überprüfe die Gruppenmitgliedschaften für Benutzer-ID: ${USER_ID}`);

    try {
        // 1. Hole die playerId aus dem 'users'-Dokument
        const userRef = db.collection('users').doc(USER_ID);
        const userDoc = await userRef.get();
        let playerId = null;

        if (userDoc.exists) {
            const userData = userDoc.data();
            playerId = userData.playerId;
            if (playerId) {
                console.log(`\n✅ PlayerID gefunden im Benutzerdokument: ${playerId}`);
            } else {
                console.log(`\n❌ Keine PlayerID im Benutzerdokument gefunden.`);
                return;
            }
        } else {
            console.log(`\n❌ Kein Benutzerdokument gefunden unter 'users/${USER_ID}'.`);
            return;
        }

        // 2. Überprüfe das 'players'-Dokument mit der gefundenen playerId
        const playerRef = db.collection('players').doc(playerId);
        const playerDoc = await playerRef.get();

        if (playerDoc.exists) {
            const playerData = playerDoc.data();
            const groupIdsFromPlayerDoc = playerData.groupIds;
            if (groupIdsFromPlayerDoc && Array.isArray(groupIdsFromPlayerDoc)) {
                console.log(`\n✅ Gruppen-IDs aus dem Player-Dokument ('players/${playerId}'):`);
                console.log(`   - ANZAHL: ${groupIdsFromPlayerDoc.length}`);
                console.log(`   - IDs: ${groupIdsFromPlayerDoc.join(', ')}`);

                console.log('\n   Details der Gruppen werden abgerufen...');
                for (const groupId of groupIdsFromPlayerDoc) {
                    const groupRef = db.collection('groups').doc(groupId);
                    const groupDoc = await groupRef.get();
                    if (groupDoc.exists) {
                        console.log(`     - Gruppe "${groupDoc.data().name}" (ID: ${groupId})`);
                    } else {
                        console.log(`     - WARNUNG: Gruppe mit ID ${groupId} nicht gefunden!`);
                    }
                }

            } else {
                console.log(`\n⚠️ Das Player-Dokument hat kein 'groupIds'-Array.`);
            }
        } else {
            console.log(`\n❌ Kein Player-Dokument gefunden unter 'players/${playerId}'.`);
        }
        
        console.log('\n----------------------------------------');
        console.log('Fazit: Die Anzahl der Gruppen im Player-Dokument ist die Quelle für die Anzeige in der App.');


    } catch (error) {
        console.error('❌ Fehler bei der Überprüfung der Gruppen:', error);
    }
}

checkUserGroups(); 