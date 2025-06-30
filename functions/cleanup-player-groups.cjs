const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Player ID von Remo
const PLAYER_ID = 'b16c1120111b7d9e7d733837'; 
const GROUP_IDS_TO_REMOVE = ['QfLTvjXe5wWGSUKuLOBi', 'xSA1agC57aYoz1unL5Ij'];

async function cleanupOrphanedGroups() {
    if (!PLAYER_ID) {
        console.error('❌ Bitte geben Sie eine Player-ID an.');
        return;
    }

    console.log(`🧹 Bereinige verwaiste Gruppen für Player-ID: ${PLAYER_ID}`);
    const playerRef = db.collection('players').doc(PLAYER_ID);

    try {
        const playerDoc = await playerRef.get();
        if (!playerDoc.exists) {
            console.error(`❌ Player-Dokument ${PLAYER_ID} nicht gefunden.`);
            return;
        }

        const currentGroupIds = playerDoc.data().groupIds || [];
        console.log(`   Aktuelle Gruppen-IDs: [${currentGroupIds.join(', ')}]`);

        // Filtere die zu entfernenden IDs heraus
        const updatedGroupIds = currentGroupIds.filter(id => !GROUP_IDS_TO_REMOVE.includes(id));
        
        if (updatedGroupIds.length === currentGroupIds.length) {
            console.log('✅ Keine verwaisten Gruppen-IDs zum Entfernen gefunden. Alles in Ordnung.');
            return;
        }

        console.log(`   Aktualisierte Gruppen-IDs: [${updatedGroupIds.join(', ')}]`);

        // Führe das Update in Firestore durch
        await playerRef.update({
            groupIds: updatedGroupIds
        });

        console.log('✅ Player-Dokument erfolgreich aktualisiert. Verwaiste Gruppen entfernt.');

    } catch (error) {
        console.error('❌ Fehler bei der Bereinigung der Gruppen:', error);
    }
}

cleanupOrphanedGroups(); 