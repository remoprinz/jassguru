const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const SESSION_ID = 'NPA6LXHaLLeeNaF49vf5l';

async function verifySessionArchiveConditions() {
    try {
        // 1. Hole die Session
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const session = await sessionRef.get();
        const sessionData = session.data();

        console.log('\n🔍 Überprüfe Archiv-Bedingungen:');
        
        // 2. Überprüfe groupId
        console.log('\n1️⃣ Group ID Check:');
        console.log('groupId:', sessionData.groupId);
        console.log('✓ Sollte "Tz0wgIHMTlhvTtFastiJ" sein');

        // 3. Überprüfe Status
        console.log('\n2️⃣ Status Check:');
        console.log('status:', sessionData.status);
        console.log('✓ Sollte "completed" oder "completed_empty" sein');

        // 4. Überprüfe tournamentId
        console.log('\n3️⃣ Tournament ID Check:');
        console.log('tournamentId:', sessionData.tournamentId);
        console.log('✓ Sollte undefined oder null sein');

        // 5. Überprüfe completedGames
        console.log('\n4️⃣ CompletedGames Check:');
        const completedGamesRef = sessionRef.collection('completedGames');
        const completedGames = await completedGamesRef.get();
        console.log('Anzahl completedGames:', completedGames.size);
        console.log('✓ Sollte 4 sein');

        // 6. Überprüfe Timestamps
        console.log('\n5️⃣ Timestamp Check:');
        console.log('startedAt:', sessionData.startedAt?.toDate?.());
        console.log('timestampCompleted:', sessionData.timestampCompleted?.toDate?.());
        console.log('✓ Sollten Firestore Timestamps sein');

        // 7. Überprüfe rounds Collection
        console.log('\n6️⃣ Rounds Collection Check:');
        const roundsRef = sessionRef.collection('rounds');
        const rounds = await roundsRef.get();
        console.log('Anzahl Dokumente in rounds:', rounds.size);
        console.log('✓ Sollte 0 sein (keine rounds Collection)');

        // 8. Überprüfe alle Collections
        console.log('\n7️⃣ Collections Check:');
        const collections = await sessionRef.listCollections();
        console.log('Vorhandene Collections:', collections.map(col => col.id));
        console.log('✓ Sollte nur ["completedGames"] sein');

        // 9. Überprüfe Struktur der completedGames
        console.log('\n8️⃣ CompletedGames Struktur Check:');
        for (const game of completedGames.docs) {
            console.log(`\nSpiel ${game.id}:`);
            const gameData = game.data();
            console.log('- status:', gameData.status);
            console.log('- roundHistory Länge:', gameData.roundHistory?.length);
            console.log('- completedAt:', gameData.completedAt?.toDate?.());
            console.log('✓ Sollte status "completed" und roundHistory haben');
        }

    } catch (error) {
        console.error('❌ Error checking session:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the verification
verifySessionArchiveConditions()
    .then(() => console.log('\n🎉 Verification completed!'))
    .catch(console.error); 