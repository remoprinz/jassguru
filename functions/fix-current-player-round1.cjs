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

async function fixCurrentPlayerRound1() {
    try {
        const completedGamesRef = db.collection('jassGameSummaries').doc(SESSION_ID).collection('completedGames');
        const game1Query = completedGamesRef.where('gameNumber', '==', 1);
        const game1Docs = await game1Query.get();

        if (game1Docs.empty) {
            console.log('❌ Spiel 1 nicht gefunden!');
            return;
        }

        const game1Doc = game1Docs.docs[0];
        const gameData = game1Doc.data();
        const roundHistory = gameData.roundHistory || [];

        if (roundHistory.length > 0) {
            const round1 = roundHistory[0];
            console.log('\nRunde 1 vor der Änderung:');
            console.log('Farbe:', round1.farbe);
            console.log('Starting Player:', round1.startingPlayer);
            console.log('Current Player:', round1.currentPlayer);
            console.log('Next Player:', round1.roundState?.nextPlayer);

            // Setze Roger (3) als Current Player
            round1.currentPlayer = 3;
            round1.roundState = {
                ...round1.roundState,
                nextPlayer: 3
            };

            // Update das Dokument
            await game1Doc.ref.update({
                roundHistory: roundHistory
            });

            console.log('\nRunde 1 nach der Änderung:');
            console.log('Current Player wurde zu Roger (3) geändert');
            console.log('Next Player wurde zu Roger (3) geändert');
        } else {
            console.log('❌ Keine Runden in Spiel 1 gefunden!');
        }

    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren des Current Players:', error);
        console.error('Details:', error.stack);
    }
}

// Führe die Korrektur aus
fixCurrentPlayerRound1()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 