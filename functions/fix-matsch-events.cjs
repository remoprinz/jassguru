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

async function fixMatschEvents() {
    try {
        const completedGamesRef = db.collection('jassGameSummaries').doc(SESSION_ID).collection('completedGames');
        const completedGames = await completedGamesRef.get();

        for (const gameDoc of completedGames.docs) {
            const gameData = gameDoc.data();
            const roundHistory = gameData.roundHistory || [];

            console.log(`\nÜberprüfe Spiel ${gameData.gameNumber}:`);

            // Durchlaufe die Runden und prüfe auf Matsch-Bedingungen
            for (let i = 0; i < roundHistory.length; i++) {
                const round = roundHistory[i];
                const jassPoints = round.jassPoints || {};

                // Prüfe auf Matsch (wenn eine Seite 0 Punkte hat)
                if (jassPoints.top === 0 || jassPoints.bottom === 0) {
                    console.log(`Runde ${i + 1}: Matsch gefunden!`);
                    console.log('Punkte:', jassPoints);

                    // Setze das Matsch-Event
                    if (jassPoints.top === 0) {
                        round.eventType = 'matsch';
                        round.eventTeam = 'bottom';
                    } else if (jassPoints.bottom === 0) {
                        round.eventType = 'matsch';
                        round.eventTeam = 'top';
                    }
                }
            }

            // Update das Dokument mit den korrigierten Runden
            await gameDoc.ref.update({
                roundHistory: roundHistory
            });

            console.log(`Spiel ${gameData.gameNumber} aktualisiert.`);
        }

        console.log('\n✅ Matsch-Events erfolgreich aktualisiert!');

    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren der Matsch-Events:', error);
        console.error('Details:', error.stack);
    }
}

// Führe die Korrektur aus
fixMatschEvents()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 