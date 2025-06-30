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

async function fixStriche79Final() {
    try {
        console.log('\n🔍 Korrigiere Striche für 7:9 Endergebnis...');
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // Spiel 1: Marc/Roger 2 Striche (2 vertikal)
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
        console.log('✅ Spiel 1 korrigiert: 2:0 (Marc/Roger: 2 vertikal)');

        // Spiel 2: Marc/Roger 3 Striche (2 horizontal + 1 vertikal), Claudia/Frank 1 Strich (1 vertikal)
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
        console.log('✅ Spiel 2 korrigiert: 3:1');

        // Spiel 3: Claudia/Frank 3 Striche (1 horizontal + 2 vertikal)
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
        console.log('✅ Spiel 3 korrigiert: 0:3');

        // Spiel 4: Marc/Roger 2 Striche (2 vertikal), Claudia/Frank 5 Striche (2 horizontal + 3 vertikal)
        const game4Ref = sessionRef.collection('completedGames').doc('4');
        await game4Ref.update({
            'finalStriche.bottom': {
                berg: 0,
                kontermatsch: 0,
                matsch: 0,
                schneider: 0,
                sieg: 2      // 2 vertikale Striche
            },
            'finalStriche.top': {
                berg: 2,      // 2 vertikale Striche
                kontermatsch: 0,
                matsch: 2,    // 2 horizontale Striche
                schneider: 0,
                sieg: 1       // 1 vertikaler Strich
            }
        });
        console.log('✅ Spiel 4 korrigiert: 2:5');

        // Aktualisiere die Session mit den korrekten finalen Strichen
        const finalStriche = {
            bottom: {
                berg: 1,    // Spiel 1
                kontermatsch: 0,
                matsch: 2,  // Spiel 2
                schneider: 0,
                sieg: 4     // Spiel 1 + 2 + 4 (2)
            },
            top: {
                berg: 3,    // Spiel 3 + 4 (2)
                kontermatsch: 0,
                matsch: 3,  // Spiel 3 (1) + Spiel 4 (2)
                schneider: 0,
                sieg: 3     // Spiel 2 + 3 + 4
            }
        };

        await sessionRef.update({
            finalStriche,
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: admin.firestore.Timestamp.now()
        });

        console.log('\n✅ Finale Striche der Session aktualisiert:');
        console.log('\nSpiel 1: 2:0 (Marc/Roger: 2 vertikal)');
        console.log('Spiel 2: 3:1 (Marc/Roger: 2 horizontal + 1 vertikal, Claudia/Frank: 1 vertikal)');
        console.log('Spiel 3: 0:3 (Claudia/Frank: 1 horizontal + 2 vertikal)');
        console.log('Spiel 4: 2:5 (Marc/Roger: 2 vertikal, Claudia/Frank: 2 horizontal + 3 vertikal)');
        console.log('\nEndergebnis: 7:9 für Claudia/Frank');

    } catch (error) {
        console.error('❌ Fehler beim Korrigieren der Striche:', error);
    }
}

// Führe die Korrektur aus
fixStriche79Final()
    .then(() => console.log('\n🎉 Korrektur abgeschlossen!'))
    .catch(console.error); 