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

async function fixSessionStructure() {
    try {
        // 1. Session-Dokument holen
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const sessionDoc = await sessionRef.get();
        const sessionData = sessionDoc.data();

        if (!sessionData) {
            console.error('❌ Session nicht gefunden!');
            return;
        }

        console.log('\n🔍 Analysiere Session:', SESSION_ID);
        console.log('Status:', sessionData.status);
        console.log('Spiele:', sessionData.gamesPlayed);

        // 2. Game Results überprüfen
        const gameResults = [
            {
                gameNumber: 1,
                bottomScore: 5129,
                topScore: 4451,
                winnerTeam: 'bottom'
            },
            {
                gameNumber: 2,
                bottomScore: 5481,
                topScore: 4177,
                winnerTeam: 'bottom'
            },
            {
                gameNumber: 3,
                bottomScore: 4212,
                topScore: 5030,
                winnerTeam: 'top'
            },
            {
                gameNumber: 4,
                bottomScore: 5255,
                topScore: 5091,
                winnerTeam: 'top'
            }
        ];

        console.log('\nSpiel-Resultate:');
        gameResults.forEach((game, idx) => {
            console.log(`Spiel ${idx + 1}: ${game.bottomScore} vs ${game.topScore} (${game.winnerTeam})`);
        });

        // 3. Striche-Totale berechnen
        const finalStriche = {
            bottom: {
                berg: 1,
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

        // 4. Aktualisiere die Session
        await sessionRef.update({
            gameResults: gameResults,
            finalStriche: finalStriche,
            finalScores: {
                bottom: gameResults.reduce((sum, game) => sum + game.bottomScore, 0),
                top: gameResults.reduce((sum, game) => sum + game.topScore, 0)
            },
            winnerTeamKey: 'top',
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        // 5. Aktualisiere die CompletedGames
        for (const game of gameResults) {
            const gameRef = sessionRef.collection('completedGames').doc(game.gameNumber.toString());
            await gameRef.update({
                bottomScore: game.bottomScore,
                topScore: game.topScore,
                winnerTeam: game.winnerTeam,
                finalScores: {
                    bottom: game.bottomScore,
                    top: game.topScore
                }
            });
        }

        console.log('\n✅ Session erfolgreich korrigiert!');
        console.log('Finale Scores:', {
            bottom: gameResults.reduce((sum, game) => sum + game.bottomScore, 0),
            top: gameResults.reduce((sum, game) => sum + game.topScore, 0)
        });
        console.log('Striche:', finalStriche);
        console.log('Gewinner: Top (Claudia/Frank) mit 9:7');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Session:', error);
    }
}

// Führe die Korrektur aus
fixSessionStructure()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 