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

async function fixGameOneBerg() {
    try {
        console.log('\n🔍 Korrigiere Berg in Spiel 1...');

        // 1. Hole das erste Spiel
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const gameRef = sessionRef.collection('completedGames').doc('1');
        const gameDoc = await gameRef.get();
        const gameData = gameDoc.data();

        if (!gameData) {
            console.error('❌ Spiel 1 nicht gefunden!');
            return;
        }

        // 2. Aktualisiere die Striche im Spiel
        const updatedStriche = {
            bottom: {
                berg: 1,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            top: {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        };

        await gameRef.update({
            finalStriche: updatedStriche
        });

        console.log('✅ Striche in Spiel 1 aktualisiert');

        // 3. Hole die Session
        const sessionDoc = await sessionRef.get();
        const sessionData = sessionDoc.data();

        // 4. Aktualisiere die finalen Striche der Session
        const updatedFinalStriche = {
            bottom: {
                berg: 2, // Jetzt 2 Berge für Bottom
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 2
            },
            top: {
                berg: 3,
                kontermatsch: 0,
                matsch: 3,
                schneider: 0,
                sieg: 2
            }
        };

        // 5. Update die Session
        await sessionRef.update({
            finalStriche: updatedFinalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Session erfolgreich aktualisiert!');
        console.log('Neue Striche:', updatedFinalStriche);
        console.log('Endergebnis bleibt 9:7 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren des Bergs:', error);
    }
}

// Führe die Korrektur aus
fixGameOneBerg()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 