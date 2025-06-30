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

async function fixStricheFinalCorrect() {
    try {
        console.log('\n🔍 Korrigiere finale Striche gemäß Screenshot...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: Marc/Roger (Berg + Sieg = 2), Claudia/Frank (0)
        const game1Ref = sessionRef.collection('completedGames').doc('1');
        await game1Ref.update({
            'finalStriche.bottom': {
                berg: 1,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 1 korrigiert');

        // Spiel 2: Marc/Roger (2 Matsch + Sieg = 3), Claudia/Frank (1 Strich)
        const game2Ref = sessionRef.collection('completedGames').doc('2');
        await game2Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            }
        });
        console.log('✅ Spiel 2 korrigiert');

        // Spiel 3: Marc/Roger (0), Claudia/Frank (Matsch + Berg + Sieg = 3)
        const game3Ref = sessionRef.collection('completedGames').doc('3');
        await game3Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 0
            },
            'finalStriche.top': {
                berg: 1,
                kontermatsch: 0,
                matsch: 1,
                schneider: 0,
                sieg: 1
            }
        });
        console.log('✅ Spiel 3 korrigiert');

        // Spiel 4: Marc/Roger (1 Strich), Claudia/Frank (2 Matsch = 2)
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 1
            },
            'finalStriche.top': {
                berg: 0,
                kontermatsch: 0,
                matsch: 2,
                schneider: 0,
                sieg: 0
            }
        });
        console.log('✅ Spiel 4 korrigiert');

        // Aktualisiere die Session mit den korrekten finalen Strichen
        const finalStriche = {
            bottom: {
                berg: 1,    // Spiel 1
                kontermatsch: 0,
                matsch: 2,  // Spiel 2
                schneider: 0,
                sieg: 3     // Spiel 1 + 2 + 4
            },
            top: {
                berg: 1,    // Spiel 3
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 2     // Spiel 2 + 3
            }
        };

        await sessionRef.update({
            finalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Finale Striche der Session aktualisiert:');
        console.log('Bottom (Marc/Roger):', finalStriche.bottom);
        console.log('Top (Claudia/Frank):', finalStriche.top);
        console.log('\nEndergebnis: 6:6');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStricheFinalCorrect()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 