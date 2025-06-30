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

async function fixSessionService() {
    try {
        // 1. Hole die Session
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const session = await sessionRef.get();
        const sessionData = session.data();

        // 2. Überprüfe den Status
        console.log('\n1️⃣ Aktueller Status:', sessionData.status);

        // 3. Setze den Status auf "completed"
        await sessionRef.update({
            status: 'completed',
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('✅ Status auf "completed" gesetzt');

        // 4. Überprüfe die completedGames
        const completedGamesRef = sessionRef.collection('completedGames');
        const completedGames = await completedGamesRef.get();

        console.log('\n2️⃣ CompletedGames:', completedGames.size);

        // 5. Setze den Status für jedes Spiel
        for (const game of completedGames.docs) {
            await game.ref.update({
                status: 'completed'
            });
            console.log(`✅ Status für Spiel ${game.id} auf "completed" gesetzt`);
        }

        // 6. Hole die Session nochmal und zeige den neuen Status
        const updatedSession = await sessionRef.get();
        const updatedData = updatedSession.data();

        console.log('\n3️⃣ Neuer Status:', updatedData.status);
        console.log('✅ Alle Status-Updates abgeschlossen');

    } catch (error) {
        console.error('❌ Error fixing session service:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the fix
fixSessionService()
    .then(() => console.log('\n🎉 Fix completed!'))
    .catch(console.error); 